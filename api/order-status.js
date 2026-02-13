// api/order-status.js — GET order status for client polling

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { RPI_API_KEY, RPI_API_URL } = process.env;

  if (!RPI_API_KEY || RPI_API_KEY === '...') {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'Order tracking is not available yet.',
    });
  }

  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId query param is required' });
    }

    const rpiRes = await fetch(`${RPI_API_URL}/v1/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${RPI_API_KEY}`,
      },
    });

    if (!rpiRes.ok) {
      return res.status(rpiRes.status).json({ error: 'Failed to fetch order status' });
    }

    const data = await rpiRes.json();

    return res.status(200).json({
      orderId: data.id,
      externalId: data.external_id,
      status: data.status, // accepted | printing | shipped | delivered
      trackingNumber: data.tracking_number || null,
      carrier: data.carrier || null,
      estimatedDelivery: data.estimated_delivery || null,
    });
  } catch (err) {
    console.error('Order status error:', err);
    return res.status(500).json({ error: err.message });
  }
}
