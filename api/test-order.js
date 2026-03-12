// api/test-order.js - Test the full PDF generation + Lulu pipeline without Stripe
// GET /api/test-order?bookDataUrl=<url>&name=Test&street=123+Main&city=Boston&state=MA&zip=02101
// Generates cover + interior PDFs, uploads to Blob, submits to Lulu sandbox

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
  const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult);

  let actualPageCount = 0;
  const pdfStr = pdfBuffer.toString('latin1');
  const matches = pdfStr.match(/\/Type\s*\/Page[^s]/g);
  actualPageCount = matches ? matches.length : 0;

  await page.close();
  return { pdf: pdfBuffer, pageCount: actualPageCount };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const secret = req.query.secret;
  if (secret !== 'test-lulu-2026') {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { bookDataUrl, name, street, city, state, zip } = req.query;
  const steps = [];
  const log = (step, detail) => { steps.push({ step, detail }); console.log(`[${step}] ${detail}`); };

  try {
    // 1. Fetch book data
    const bookDataRes = await fetch(bookDataUrl);
    if (!bookDataRes.ok) throw new Error(`Fetch failed: ${bookDataRes.status}`);
    const bookData = await bookDataRes.json();
    const entryCount = bookData.entries?.length || 0;
    log('book_data', `${entryCount} entries`);

    // 2. Launch browser + generate PDFs — interior first for actual page count
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://teamseason.app';

    const { pdf: interiorPdf, pageCount: actualPageCount } = await generatePdfWithPageCount(browser, origin, bookData, 'interior', 0);
    log('interior', `${(interiorPdf.length/1024).toFixed(0)}KB, ${actualPageCount} pages`);

    const { pdf: coverPdf } = await generatePdfWithPageCount(browser, origin, bookData, 'cover', actualPageCount);
    log('cover', `${(coverPdf.length/1024).toFixed(0)}KB (sized for ${actualPageCount} pages)`);

    await browser.close();

    // 3. Upload to Blob
    const orderId = `test_${Date.now()}`;
    const [coverBlob, interiorBlob] = await Promise.all([
      put(`orders/${orderId}/cover.pdf`, coverPdf, { contentType: 'application/pdf', access: 'public' }),
      put(`orders/${orderId}/interior.pdf`, interiorPdf, { contentType: 'application/pdf', access: 'public' }),
    ]);
    log('blob', `cover=${coverBlob.url}, interior=${interiorBlob.url}`);

    // 4. Submit to Lulu
    if (process.env.LULU_CLIENT_KEY && name && street) {
      try {
        const luluOrder = await createPrintOrder({
          pdfUrl: interiorBlob.url,
          coverPdfUrl: coverBlob.url,
          shippingAddress: {
            name: name || 'Test User',
            email: 'test@teamseason.app',
            street: street || '123 Main St',
            city: city || 'Boston',
            state: state || 'MA',
            zip: zip || '02101',
            teamName: bookData.team?.name || 'Team',
          },
          externalId: orderId,
        });
        log('lulu', `Order ID: ${luluOrder.id}, Status: ${luluOrder.status?.name}`);
      } catch (luluErr) {
        log('lulu_error', `${luluErr.message} ${luluErr.data ? JSON.stringify(luluErr.data) : ''}`);
      }
    } else {
      log('lulu', 'Skipped (no address or no Lulu keys)');
    }

    return res.status(200).json({ success: true, steps });
  } catch (err) {
    log('error', err.message);
    return res.status(500).json({ success: false, steps, error: err.message });
  }
}
