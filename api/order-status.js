// api/order-status.js - GET order status
// Supports two modes:
//   ?orderId=123       — direct Lulu order ID lookup
//   ?sessionId=cs_xxx  — look up by Stripe session ID (client polling after checkout)

import { list } from '@vercel/blob';
import { getOrderStatus } from './lib/lulu.js';

const STATUS_MAP = {
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

function mapLuluOrder(luluOrder) {
  const lineItem = luluOrder.line_items?.[0];
  const tracking = lineItem?.tracking;
  const luluStatus = luluOrder.status?.name || 'CREATED';

  return {
    orderId: luluOrder.id,
    externalId: luluOrder.external_id,
    status: STATUS_MAP[luluStatus] || 'ordered',
    luluStatus,
    trackingNumber: tracking?.id || null,
    trackingUrl: tracking?.url || null,
    estimatedShipDate: luluOrder.estimated_shipping_dates?.arrival_min || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderId, sessionId } = req.query;

  // Mode 1: Direct Lulu order ID lookup
  if (orderId) {
    const { LULU_CLIENT_KEY } = process.env;
    if (!LULU_CLIENT_KEY) {
      return res.status(503).json({ error: 'Backend not configured' });
    }

    try {
      const luluOrder = await getOrderStatus(orderId);
      const response = mapLuluOrder(luluOrder);

      if (req.query.debug === '1' && req.query.secret === 'test-lulu-2026') {
        response.raw = luluOrder;
      } else if (['REJECTED', 'ERROR'].includes(response.luluStatus)) {
        const lineItem = luluOrder.line_items?.[0];
        response.statusMessages = luluOrder.status?.messages || [];
        response.normalization = lineItem?.printable_normalization || {};
      }

      return res.status(200).json(response);
    } catch (err) {
      console.error('Order status error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Mode 2: Stripe session ID lookup (client polling)
  if (sessionId) {
    try {
      const { blobs } = await list({ prefix: `orders/status-${sessionId}` });

      if (blobs.length === 0) {
        // Webhook hasn't fired yet — book is still being generated
        return res.status(200).json({
          status: 'processing',
          message: 'Your book is being prepared — this can take a few minutes.',
        });
      }

      const blobRes = await fetch(blobs[0].url);
      const mapping = await blobRes.json();

      if (mapping.luluOrderId) {
        try {
          const luluOrder = await getOrderStatus(mapping.luluOrderId);
          const response = mapLuluOrder(luluOrder);
          response.orderedAt = mapping.createdAt;
          return res.status(200).json(response);
        } catch (luluErr) {
          console.error('Lulu status check failed:', luluErr.message);
          return res.status(200).json({
            status: mapping.lastKnownStatus || 'ordered',
            orderedAt: mapping.createdAt,
            message: 'Status check temporarily unavailable.',
          });
        }
      }

      return res.status(200).json({
        status: mapping.lastKnownStatus || 'ordered',
        orderedAt: mapping.createdAt,
      });
    } catch (err) {
      console.error('Order lookup error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'orderId or sessionId query param is required' });
}
