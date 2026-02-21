import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Backend not configured' });
  }

  try {
    const { bookData } = req.body;

    if (!bookData) {
      return res.status(400).json({ error: 'bookData is required' });
    }

    const filename = `books/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;

    const blob = await put(filename, JSON.stringify(bookData), {
      contentType: 'application/json',
      access: 'public',
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('store-book-data error:', err);
    return res.status(500).json({ error: 'Failed to store book data' });
  }
}
