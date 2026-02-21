// api/generate-pdf.js - Puppeteer renders HTML templates to print-ready PDF
// Uses @sparticuz/chromium for serverless Chromium
// Templates served from public/book-template/ via the app URL
// Lulu specs: 7.75x7.75" square, sRGB, 300dpi, 0.125" bleed, all fonts embedded

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

// Lulu 7.75x7.75" square hardcover case wrap with 0.125" bleed
const INTERIOR_WIDTH = '8in';    // 7.75 + 0.125 bleed each side
const INTERIOR_HEIGHT = '8in';   // 7.75 + 0.125 bleed each side
const COVER_HEIGHT = '9.25in';   // hardcover case wrap height

function getCoverWidth(pageCount) {
  // Lulu spine width formula for 7.75" square hardcover case wrap
  const spineWidth = 0.0025 * pageCount + 0.13;
  return `${8.375 + spineWidth + 8.375}in`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bookData, type = 'interior', pageCount = 24 } = req.body;

    if (!bookData) {
      return res.status(400).json({ error: 'bookData is required' });
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;

    await page.goto(`${origin}/book-template/${type}.html`, {
      waitUntil: 'networkidle0',
      timeout: 20000,
    });

    // Inject book data and trigger template render
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
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
