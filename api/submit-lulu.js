// api/submit-lulu.js - Submit a print order to Lulu
// Called by webhook-stripe after payment, or manually for retries

import { createPrintOrder } from './lib/lulu.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify internal webhook secret to prevent unauthorized calls
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { LULU_CLIENT_KEY } = process.env;

  if (!LULU_CLIENT_KEY) {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'Lulu Print is not set up yet.',
    });
  }

  try {
    const { orderId, coverUrl, interiorUrl, shipping } = req.body;

    if (!orderId || !coverUrl || !interiorUrl || !shipping) {
      return res.status(400).json({ error: 'orderId, coverUrl, interiorUrl, and shipping are required' });
    }

    const luluOrder = await createPrintOrder({
      pdfUrl: interiorUrl,
      coverPdfUrl: coverUrl,
      shippingAddress: shipping,
      externalId: orderId,
    });

    return res.status(200).json({
      luluOrderId: luluOrder.id,
      status: luluOrder.status?.name || 'CREATED',
    });
  } catch (err) {
    console.error('Lulu submit error:', err);
    return res.status(500).json({ error: err.message });
  }
}
