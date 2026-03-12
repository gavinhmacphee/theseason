// api/retrigger.js - One-off: re-trigger fulfillment for a Stripe session
// GET /api/retrigger?secret=test-lulu-2026&session_id=cs_live_xxx
// Fetches session metadata from Stripe, then runs the same fulfillment pipeline

import Stripe from 'stripe';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { put } from '@vercel/blob';
import { createPrintOrder } from './lib/lulu.js';

export const config = {
  maxDuration: 120,
};

const INTERIOR_WIDTH = '7.75in';    // 7.5 + 0.125 bleed each side
const INTERIOR_HEIGHT = '7.75in';   // 7.5 + 0.125 bleed each side
const COVER_HEIGHT = '9.25in';

function getCoverWidth(pageCount) {
  const spineWidth = 0.0025 * pageCount + 0.13;
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
  await new Promise((r) => setTimeout(r, 1500));

  const pdfOptions = type === 'cover'
    ? { width: getCoverWidth(pageCount), height: COVER_HEIGHT, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }
    : { width: INTERIOR_WIDTH, height: INTERIOR_HEIGHT, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } };

  const pdfResult = await page.pdf(pdfOptions);
  // Puppeteer may return Uint8Array — ensure it's a Node Buffer
  const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);

  // Count pages by searching for /Type /Page (not /Pages) in the PDF structure
  let actualPageCount = 0;
  const pdfStr = pdfBuffer.toString('latin1');
  const matches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
  actualPageCount = matches ? matches.length : 0;
  console.log(`[page-count] found=${actualPageCount} bufType=${typeof pdfResult} isBuffer=${Buffer.isBuffer(pdfResult)} len=${pdfBuffer.length}`);

  await page.close();
  return { pdf: pdfBuffer, pageCount: actualPageCount };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  if (req.query.secret !== 'test-lulu-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id required' });
  }

  const steps = [];
  const log = (step, detail) => { steps.push({ step, detail }); console.log(`[retrigger][${step}] ${detail}`); };

  try {
    // 1. Fetch session from Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const meta = session.metadata || {};
    log('stripe', `Session ${session.id}, email: ${session.customer_email}`);

    const { bookDataUrl } = meta;
    if (!bookDataUrl) {
      return res.status(400).json({ error: 'No bookDataUrl in session metadata', steps });
    }
    log('metadata', `bookDataUrl: ${bookDataUrl}`);

    // 2. Fetch book data
    const bookDataRes = await fetch(bookDataUrl);
    if (!bookDataRes.ok) throw new Error(`Fetch book data failed: ${bookDataRes.status}`);
    const bookData = await bookDataRes.json();
    const entryCount = bookData.entries?.length || 0;
    log('book_data', `${entryCount} entries`);

    // 3. Generate PDFs — interior first to get actual page count, then cover with correct spine
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://teamseason.app';

    const interiorResult = await generatePdfWithPageCount(browser, origin, bookData, 'interior', 0);
    const interiorPdf = interiorResult.pdf;
    const actualPageCount = interiorResult.pageCount;
    log('interior', `${(interiorPdf.length / 1024).toFixed(0)}KB, ${actualPageCount} pages (buf=${interiorPdf.length})`);

    const { pdf: coverPdf } = await generatePdfWithPageCount(browser, origin, bookData, 'cover', actualPageCount);
    log('cover', `${(coverPdf.length / 1024).toFixed(0)}KB (sized for ${actualPageCount} pages)`);

    await browser.close();

    // 4. Upload to Blob
    const orderId = `ts_${session.id.slice(-12)}_${Date.now()}`;
    const [coverBlob, interiorBlob] = await Promise.all([
      put(`orders/${orderId}/cover.pdf`, coverPdf, { contentType: 'application/pdf', access: 'public' }),
      put(`orders/${orderId}/interior.pdf`, interiorPdf, { contentType: 'application/pdf', access: 'public' }),
    ]);
    log('blob', `cover: ${coverBlob.url}, interior: ${interiorBlob.url}`);

    // 5. Submit to Lulu
    if (process.env.LULU_CLIENT_KEY) {
      const shippingAddress = {
        name: meta.shipping_name || '',
        email: meta.shipping_email || session.customer_email || '',
        street: meta.shipping_street || '',
        city: meta.shipping_city || '',
        state: meta.shipping_state || '',
        zip: meta.shipping_zip || '',
        phone: meta.shipping_phone || '0000000000',
        teamName: bookData.team?.name || 'Team',
      };
      log('shipping', JSON.stringify(shippingAddress));

      const luluOrder = await createPrintOrder({
        pdfUrl: interiorBlob.url,
        coverPdfUrl: coverBlob.url,
        shippingAddress,
        externalId: orderId,
      });
      log('lulu', `Order ID: ${luluOrder.id}, Status: ${luluOrder.status?.name}`);
    } else {
      log('lulu', 'Skipped — LULU_CLIENT_KEY not set');
    }

    return res.status(200).json({ success: true, orderId, steps });
  } catch (err) {
    log('error', err.message);
    return res.status(500).json({ success: false, steps, error: err.message });
  }
}
