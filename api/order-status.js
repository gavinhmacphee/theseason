// api/order-status.js - GET order status from Lulu for client polling

import { getOrderStatus } from './lib/lulu.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { LULU_CLIENT_KEY } = process.env;

  if (!LULU_CLIENT_KEY) {
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

    const luluOrder = await getOrderStatus(orderId);
    const lineItem = luluOrder.line_items?.[0];
    const tracking = lineItem?.tracking;

    // Map Lulu statuses to our simpler status model
    const statusMap = {
      CREATED: 'ordered',
      UNPAID: 'ordered',
      PAYMENT_IN_PROGRESS: 'ordered',
      PRODUCTION_READY: 'printing',
      PRODUCTION_DELAYED: 'printing',
      IN_PRODUCTION: 'printing',
      SHIPPED: 'shipped',
      DELIVERED: 'delivered',
      CANCELED: 'cancelled',
      ERROR: 'error',
    };

    const luluStatus = luluOrder.status?.name || 'CREATED';

    return res.status(200).json({
      orderId: luluOrder.id,
      externalId: luluOrder.external_id,
      status: statusMap[luluStatus] || 'ordered',
      luluStatus,
      trackingNumber: tracking?.id || null,
      trackingUrl: tracking?.url || null,
      estimatedShipDate: luluOrder.estimated_shipping_dates?.arrival_min || null,
    });
  } catch (err) {
    console.error('Order status error:', err);
    return res.status(500).json({ error: err.message });
  }
}
