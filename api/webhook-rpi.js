// api/webhook-rpi.js — Receive RPI Print status webhooks
// Status flow: accepted -> printing -> shipped -> delivered

import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { RESEND_API_KEY } = process.env;

  try {
    const { order_id, status, tracking_number, carrier } = req.body;

    console.log('RPI webhook:', { order_id, status, tracking_number, carrier });

    // On shipped: send email with tracking info
    if (status === 'shipped' && tracking_number && RESEND_API_KEY && !RESEND_API_KEY.startsWith('re_...')) {
      const resend = new Resend(RESEND_API_KEY);

      // TODO: Look up customer email from order record
      // For now, log the tracking info
      console.log('Order shipped:', {
        orderId: order_id,
        trackingNumber: tracking_number,
        carrier,
      });

      // Email send (needs customer email from DB):
      // await resend.emails.send({
      //   from: 'Team Season <books@teamseason.app>',
      //   to: customerEmail,
      //   subject: 'Your Season Book Has Shipped!',
      //   html: `<h1>Your book is on its way!</h1><p>Tracking: ${tracking_number}</p><p>Carrier: ${carrier}</p>`,
      // });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('RPI webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
