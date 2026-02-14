// api/store-book-data.js — Store book data JSON in Vercel Blob before checkout
// Client calls this first, then passes the returned URL to /api/checkout

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
    const { bookData } = req.body;

    if (!bookData) {
      return res.status(400).json({ error: 'bookData is required' });
    }

    const key = `book-data/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;

    const blob = await put(key, JSON.stringify(bookData), {
      contentType: 'application/json',
      access: 'public',
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Store book data error:', err);
    return res.status(500).json({ error: err.message });
  }
}
