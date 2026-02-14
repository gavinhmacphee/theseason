// api/webhook-stripe.js — Stripe webhook handler
// On checkout.session.completed: fetch book data -> generate PDFs -> upload -> submit to RPI

import Stripe from 'stripe';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { put } from '@vercel/blob';

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

async function generatePdf(browser, origin, bookData, type) {
  const page = await browser.newPage();

  await page.goto(`${origin}/book-template/${type}.html`, {
    waitUntil: 'networkidle0',
    timeout: 15000,
  });

  await page.evaluate((data) => {
    window.__BOOK_DATA__ = data;
    window.dispatchEvent(new Event('bookDataReady'));
  }, bookData);

  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));

  const pdfOptions = type === 'cover'
    ? { width: '14.375in', height: '7.25in', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }
    : { width: '7.125in', height: '7.125in', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } };

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

  // Acknowledge receipt immediately - Stripe expects fast responses
  res.status(200).json({ received: true });

  // Process the event (runs after response is sent on platforms that support it)
  if (event.type === 'checkout.session.completed') {
    try {
      await fulfillOrder(event.data.object);
    } catch (err) {
      console.error('Fulfillment error:', err);
      // Stripe will retry the webhook, so this will get another chance
    }
  }
}

async function fulfillOrder(session) {
  const { bookDataUrl } = session.metadata || {};

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
  console.log(`Book data fetched: ${bookData.entries?.length || 0} entries`);

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
      generatePdf(browser, origin, bookData, 'cover'),
      generatePdf(browser, origin, bookData, 'interior'),
    ]);

    console.log(`PDFs generated: cover=${coverPdf.length}b, interior=${interiorPdf.length}b`);

    await browser.close();

    // 3. Upload PDFs to Vercel Blob
    const [coverBlob, interiorBlob] = await Promise.all([
      put(`orders/${orderId}/cover.pdf`, coverPdf, { contentType: 'application/pdf', access: 'public' }),
      put(`orders/${orderId}/interior.pdf`, interiorPdf, { contentType: 'application/pdf', access: 'public' }),
    ]);

    console.log(`PDFs uploaded: cover=${coverBlob.url}, interior=${interiorBlob.url}`);

    // 4. Submit to RPI Print (if configured)
    const { RPI_API_KEY, RPI_API_URL } = process.env;

    if (RPI_API_KEY && !RPI_API_KEY.startsWith('...')) {
      const shipping = session.shipping_details?.address || {};

      const rpiPayload = {
        external_id: orderId,
        line_items: [{
          sku: '7x7_softcover_lustre',
          quantity: 1,
          cover_url: coverBlob.url,
          guts_url: interiorBlob.url,
        }],
        shipping_address: {
          name: session.shipping_details?.name || session.metadata?.shippingName || '',
          street1: shipping.line1 || '',
          city: shipping.city || '',
          state: shipping.state || '',
          zip: shipping.postal_code || '',
          country: shipping.country || 'US',
        },
        shipping_method: 'standard',
      };

      const rpiRes = await fetch(`${RPI_API_URL}/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RPI_API_KEY}`,
        },
        body: JSON.stringify(rpiPayload),
      });

      const rpiData = await rpiRes.json();

      if (!rpiRes.ok) {
        console.error('RPI submission failed:', rpiData);
      } else {
        console.log('RPI order submitted:', { rpiOrderId: rpiData.id, status: rpiData.status });
      }
    } else {
      console.log('RPI not configured, skipping print submission. PDFs available at:', {
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
