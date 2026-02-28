// api/test-fulfillment.js - Diagnostic endpoint to test the PDF generation pipeline
// GET /api/test-fulfillment?bookDataUrl=<url>
// Steps through each stage and reports where it fails

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  const steps = [];
  const log = (step, status, detail) => {
    steps.push({ step, status, detail });
    console.log(`[${status}] ${step}: ${detail}`);
  };

  try {
    // Step 1: Check env vars
    const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
    const hasLulu = !!process.env.LULU_CLIENT_KEY;
    log('env_vars', 'ok', `BLOB=${hasBlob}, LULU=${hasLulu}`);

    // Step 2: Find book data
    const bookDataUrl = req.query.bookDataUrl;
    if (!bookDataUrl) {
      log('book_data', 'skip', 'No bookDataUrl param provided, using test data');
    } else {
      const bookRes = await fetch(bookDataUrl);
      if (!bookRes.ok) {
        log('book_data', 'fail', `Fetch failed: ${bookRes.status}`);
        return res.status(200).json({ steps });
      }
      const bookData = await bookRes.json();
      log('book_data', 'ok', `${bookData.entries?.length || 0} entries, team: ${bookData.team?.name}`);
    }

    // Step 3: Launch Chromium
    let browser;
    try {
      const execPath = await chromium.executablePath();
      log('chromium_path', 'ok', execPath);

      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: execPath,
        headless: chromium.headless,
      });
      log('browser_launch', 'ok', 'Puppeteer launched');
    } catch (err) {
      log('browser_launch', 'fail', err.message);
      return res.status(200).json({ steps });
    }

    // Step 4: Try loading the cover template
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://teamseason.app';

    try {
      const page = await browser.newPage();
      const coverUrl = `${origin}/book-template/cover.html`;
      log('cover_url', 'info', coverUrl);

      const response = await page.goto(coverUrl, {
        waitUntil: 'networkidle0',
        timeout: 15000,
      });
      log('cover_load', response.ok() ? 'ok' : 'fail', `Status: ${response.status()}`);

      const title = await page.title();
      log('cover_title', 'info', title || '(empty)');

      await page.close();
    } catch (err) {
      log('cover_load', 'fail', err.message);
    }

    // Step 5: Try loading the interior template
    try {
      const page = await browser.newPage();
      const intUrl = `${origin}/book-template/interior.html`;
      log('interior_url', 'info', intUrl);

      const response = await page.goto(intUrl, {
        waitUntil: 'networkidle0',
        timeout: 15000,
      });
      log('interior_load', response.ok() ? 'ok' : 'fail', `Status: ${response.status()}`);

      const title = await page.title();
      log('interior_title', 'info', title || '(empty)');

      // Step 6: Try generating a simple PDF
      const pdfBuffer = await page.pdf({
        width: '8in',
        height: '8in',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      log('pdf_generate', 'ok', `${(pdfBuffer.length / 1024).toFixed(1)}KB`);

      // Step 7: Try uploading to Blob
      if (hasBlob) {
        const blob = await put('test/diagnostic.pdf', pdfBuffer, {
          contentType: 'application/pdf',
          access: 'public',
        });
        log('blob_upload', 'ok', blob.url);
      }

      await page.close();
    } catch (err) {
      log('interior_load', 'fail', err.message);
    }

    await browser.close();
    log('done', 'ok', 'Pipeline test complete');

  } catch (err) {
    log('unexpected', 'fail', err.message);
  }

  return res.status(200).json({ steps });
}
