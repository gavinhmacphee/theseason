// api/webhook-stripe.js - Stripe webhook handler
// On checkout.session.completed: fetch book data -> generate PDFs -> upload -> submit to Lulu

import Stripe from 'stripe';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { put } from '@vercel/blob';
import { waitUntil } from '@vercel/functions';
import { createPrintOrder } from './lib/lulu.js';
import { Resend } from 'resend';

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  // Vercel may provide rawBody directly
  if (req.rawBody) {
    return typeof req.rawBody === 'string' ? Buffer.from(req.rawBody) : req.rawBody;
  }
  // If body is already parsed as string, use it
  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }
  // If body is a Buffer already
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  // Fall back to reading the stream
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Lulu 7.5x7.5" square hardcover case wrap specs with 0.125" bleed each side
const INTERIOR_WIDTH = '7.75in';    // 7.5 + 0.125 bleed each side
const INTERIOR_HEIGHT = '7.75in';   // 7.5 + 0.125 bleed each side
// Cover: back + spine + front. Spine width depends on page count.
// Hardcover case wrap panels include board overhang beyond trim.
// At 48 pages: total cover = 17in wide x 9.25in tall, spine = 0.25in
// Each panel = (17 - 0.25) / 2 = 8.375in
const COVER_HEIGHT = '9.25in';
function getCoverWidth(pageCount) {
  const spineWidth = 0.0025 * pageCount + 0.13; // Lulu spine formula for this product
  return `${8.375 + spineWidth + 8.375}in`;
}

async function generatePdfWithPageCount(browser, origin, bookData, type, pageCount) {
  const page = await browser.newPage();

  await page.goto(`${origin}/book-template/${type}.html`, {
    waitUntil: 'networkidle0',
    timeout: 20000,
  });

  await page.evaluate((data) => {
    window.__BOOK_DATA__ = data;
    window.dispatchEvent(new Event('bookDataReady'));
  }, bookData);

  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1000));

  const pdfOptions = type === 'cover'
    ? {
        width: getCoverWidth(pageCount),
        height: COVER_HEIGHT,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }
    : {
        width: INTERIOR_WIDTH,
        height: INTERIOR_HEIGHT,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      };

  const pdfResult = await page.pdf(pdfOptions);
  const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);

  // Count pages by searching for /Type /Page (not /Pages) in the PDF structure
  let actualPageCount = 0;
  const pdfStr = pdfBuffer.toString('latin1');
  const matches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
  actualPageCount = matches ? matches.length : 0;

  await page.close();
  return { pdf: pdfBuffer, pageCount: actualPageCount };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = process.env;

  if (!STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Backend not configured' });
  }

  let event;
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const buf = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    try {
      event = stripe.webhooks.constructEvent(buf, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  } catch (err) {
    console.error('Webhook setup error:', err);
    return res.status(500).json({ error: err.message });
  }

  // Acknowledge receipt immediately, but keep the function alive for fulfillment
  if (event.type === 'checkout.session.completed') {
    waitUntil(
      fulfillOrder(event.data.object).catch((err) => {
        console.error('Fulfillment error:', err);
      })
    );
  }

  return res.status(200).json({ received: true });
}

async function fulfillOrder(session) {
  const meta = session.metadata || {};
  const { bookDataUrl } = meta;

  if (!bookDataUrl) {
    console.error('No bookDataUrl in session metadata, session:', session.id);
    return;
  }

  const orderId = `ts_${session.id.slice(-12)}_${Date.now()}`;
  console.log(`Fulfilling order ${orderId}...`);

  // 1. Fetch book data from Blob
  const bookDataRes = await fetch(bookDataUrl);
  if (!bookDataRes.ok) {
    throw new Error(`Failed to fetch book data: ${bookDataRes.status}`);
  }
  const bookData = await bookDataRes.json();
  const entryCount = bookData.entries?.length || 0;
  console.log(`Book data fetched: ${entryCount} entries`);

  // 2. Generate PDFs with Puppeteer
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://teamseason.app';

  try {
    // Generate interior first to get actual page count
    const { pdf: interiorPdf, pageCount: actualPageCount } = await generatePdfWithPageCount(browser, origin, bookData, 'interior', 0);
    console.log(`Interior PDF: ${interiorPdf.length}b, ${actualPageCount} pages`);

    // Generate cover with correct spine width based on actual page count
    const { pdf: coverPdf } = await generatePdfWithPageCount(browser, origin, bookData, 'cover', actualPageCount);
    console.log(`Cover PDF: ${coverPdf.length}b (sized for ${actualPageCount} pages)`);

    await browser.close();

    // 3. Upload PDFs to Vercel Blob
    const [coverBlob, interiorBlob] = await Promise.all([
      put(`orders/${orderId}/cover.pdf`, coverPdf, { contentType: 'application/pdf', access: 'public' }),
      put(`orders/${orderId}/interior.pdf`, interiorPdf, { contentType: 'application/pdf', access: 'public' }),
    ]);

    console.log(`PDFs uploaded: cover=${coverBlob.url}, interior=${interiorBlob.url}`);

    // 4. Submit to Lulu Print API
    const { LULU_CLIENT_KEY } = process.env;

    if (LULU_CLIENT_KEY) {
      const shippingAddress = {
        name: meta.shipping_name || '',
        email: meta.shipping_email || '',
        street: meta.shipping_street || '',
        city: meta.shipping_city || '',
        state: meta.shipping_state || '',
        zip: meta.shipping_zip || '',
        phone: meta.shipping_phone || '0000000000',
        teamName: bookData.team?.name || 'Team',
      };

      const luluOrder = await createPrintOrder({
        pdfUrl: interiorBlob.url,
        coverPdfUrl: coverBlob.url,
        shippingAddress,
        externalId: orderId,
      });

      console.log('Lulu order submitted:', {
        luluId: luluOrder.id,
        status: luluOrder.status?.name,
      });

      // 5. Send confirmation email
      await sendConfirmationEmail({
        to: shippingAddress.email || session.customer_email,
        teamName: bookData.team?.name || 'Your Team',
        seasonName: bookData.season?.name || 'Season',
        entryCount,
        shippingName: shippingAddress.name,
      });
    } else {
      console.log('Lulu not configured, skipping print submission. PDFs available at:', {
        cover: coverBlob.url,
        interior: interiorBlob.url,
      });
    }

    console.log(`Order ${orderId} fulfilled successfully`);
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

async function sendConfirmationEmail({ to, teamName, seasonName, entryCount, shippingName }) {
  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY || !to) {
    console.log('Skipping confirmation email — no API key or no email address');
    return;
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const firstName = shippingName?.split(' ')[0] || '';

    await resend.emails.send({
      from: 'Team Season <books@send.youthsoccermarketing.com>',
      to,
      subject: `We're making your ${teamName} book`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a18;">
          <div style="padding: 32px 0 24px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #1B4332; margin: 0 0 16px;">
              Your book is on its way to the printer${firstName ? `, ${firstName}` : ''}.
            </h1>
            <p style="font-size: 16px; line-height: 1.6; color: #333; margin: 0 0 24px;">
              <strong>${teamName} — ${seasonName}</strong><br/>
              ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}, hardcover, full color.
            </p>
            <div style="background: #f8f5ef; padding: 20px; margin: 0 0 24px;">
              <p style="font-size: 15px; line-height: 1.5; color: #333; margin: 0;">
                <strong>What happens next:</strong><br/>
                Your book is being printed and bound right now.
                Expect it at your door in <strong>5–10 business days</strong>.
                We'll email you again when it ships with tracking info.
              </p>
            </div>
            <p style="font-size: 14px; color: #888; line-height: 1.5; margin: 0; padding-top: 16px; border-top: 1px solid #eee;">
              Long after the scores are forgotten, the moments remain.
            </p>
            <p style="font-size: 13px; color: #aaa; margin: 16px 0 0;">
              Team Season · teamseason.app
            </p>
          </div>
        </div>
      `,
    });

    console.log(`Confirmation email sent to ${to}`);
  } catch (err) {
    // Don't fail the order if email fails
    console.error('Confirmation email failed:', err.message);
  }
}
