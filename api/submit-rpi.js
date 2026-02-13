// api/submit-rpi.js — POST order to RPI Print API

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { RPI_API_KEY, RPI_API_URL } = process.env;

  if (!RPI_API_KEY || RPI_API_KEY === '...') {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'RPI Print is not set up yet.',
    });
  }

  try {
    const { orderId, coverUrl, interiorUrl, shipping } = req.body;

    if (!orderId || !coverUrl || !interiorUrl || !shipping) {
      return res.status(400).json({ error: 'orderId, coverUrl, interiorUrl, and shipping are required' });
    }

    const rpiPayload = {
      external_id: orderId,
      line_items: [{
        sku: '7x7_softcover_lustre',
        quantity: 1,
        cover_url: coverUrl,
        guts_url: interiorUrl,
      }],
      shipping_address: {
        name: shipping.name,
        street1: shipping.street,
        city: shipping.city,
        state: shipping.state,
        zip: shipping.zip,
        country: 'US',
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
      console.error('RPI error:', rpiData);
      return res.status(rpiRes.status).json({ error: 'RPI submission failed', details: rpiData });
    }

    return res.status(200).json({
      rpiOrderId: rpiData.id,
      status: rpiData.status,
    });
  } catch (err) {
    console.error('RPI submit error:', err);
    return res.status(500).json({ error: err.message });
  }
}
