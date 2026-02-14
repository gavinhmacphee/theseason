// api/generate-pdf.js — Puppeteer renders HTML templates to PDF
// Uses @sparticuz/chromium for serverless Chromium
// Templates are served from public/book-template/ via the app URL

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bookData, type = 'interior' } = req.body;

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

    // Load template from deployed static files
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;

    await page.goto(`${origin}/book-template/${type}.html`, {
      waitUntil: 'networkidle0',
    });

    // Inject book data and trigger re-render
    await page.evaluate((data) => {
      window.__BOOK_DATA__ = data;
      window.dispatchEvent(new Event('bookDataReady'));
    }, bookData);

    // Wait for fonts and rendering to settle
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 500));

    // Generate PDF with print specs
    const pdfOptions = type === 'cover'
      ? { width: '14.375in', height: '7.25in', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }
      : { width: '7.125in', height: '7.125in', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } };

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
