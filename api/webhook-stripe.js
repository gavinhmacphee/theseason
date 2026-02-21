// api/webhook-stripe.js - Stripe webhook handler
// On checkout.session.completed: fetch book data -> generate PDFs -> upload -> submit to Lulu

import Stripe from 'stripe';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { put } from '@vercel/blob';
import { createPrintOrder } from './lib/lulu.js';

export const config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Lulu 7.75x7.75" square hardcover case wrap specs with 0.125" bleed
const INTERIOR_WIDTH = '8in';    // 7.75 + 0.125 bleed each side
const INTERIOR_HEIGHT = '8in';   // 7.75 + 0.125 bleed each side
// Cover: back + spine + front. Spine width depends on page count.
// Hardcover case wrap panels include board overhang beyond trim.
// At 48 pages: total cover = 17in wide x 9.25in tall, spine = 0.25in
// Each panel = (17 - 0.25) / 2 = 8.375in
const COVER_HEIGHT = '9.25in';
function getCoverWidth(pageCount) {
  const spineWidth = 0.0025 * pageCount + 0.13; // Lulu spine formula for this product
  return `${8.375 + spineWidth + 8.375}in`;
}

async function generatePdf(browser, origin, bookData, type, pageCount) {
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

  const pdfBuffer = await page.pdf(pdfOptions);
  await page.close();
  return pdfBuffer;
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
    const buf = await buffer(req);
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

  // Acknowledge receipt immediately
  res.status(200).json({ received: true });

  if (event.type === 'checkout.session.completed') {
    try {
      await fulfillOrder(event.data.object);
    } catch (err) {
      console.error('Fulfillment error:', err);
    }
  }
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
  // Title + summary + entries (2 pages each estimate) + closing
  const estimatedPageCount = Math.max(24, 2 + 2 + entryCount * 2 + 1);
  console.log(`Book data fetched: ${entryCount} entries, ~${estimatedPageCount} pages`);

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
    const [coverPdf, interiorPdf] = await Promise.all([
      generatePdf(browser, origin, bookData, 'cover', estimatedPageCount),
      generatePdf(browser, origin, bookData, 'interior', estimatedPageCount),
    ]);

    console.log(`PDFs generated: cover=${coverPdf.length}b, interior=${interiorPdf.length}b`);
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
