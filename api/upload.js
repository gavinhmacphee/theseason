// api/upload.js — Upload PDFs to Vercel Blob, return public URL
// Replaces upload-s3.js (no AWS account needed)

import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'Blob storage is not set up yet.',
    });
  }

  try {
    const { orderId, fileName, fileBuffer, contentType = 'application/pdf' } = req.body;

    if (!orderId || !fileName || !fileBuffer) {
      return res.status(400).json({ error: 'orderId, fileName, and fileBuffer are required' });
    }

    const blob = await put(
      `orders/${orderId}/${fileName}`,
      Buffer.from(fileBuffer, 'base64'),
      { contentType, access: 'public' }
    );

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
