// api/webhook-lulu.js - Handle Lulu print job status updates
// Lulu POSTs status changes: CREATED -> IN_PRODUCTION -> SHIPPED -> DELIVERED
// Configure webhook URL in Lulu dashboard: https://teamseason.app/api/webhook-lulu

import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    const printJob = payload.print_job || payload;
    const status = printJob.status?.name || printJob.status || 'unknown';
    const externalId = printJob.external_id || printJob.line_items?.[0]?.external_id;
    const trackingInfo = printJob.line_items?.[0]?.tracking || null;

    console.log('Lulu webhook:', {
      luluId: printJob.id,
      externalId,
      status,
      tracking: trackingInfo?.id || null,
    });

    // Send tracking email when order ships
    if (status === 'SHIPPED' && trackingInfo) {
      const { RESEND_API_KEY } = process.env;
      const contactEmail = printJob.contact_email;

      if (RESEND_API_KEY && contactEmail) {
        const resend = new Resend(RESEND_API_KEY);
        const trackingUrl = trackingInfo.url || `https://track.aftership.com/${trackingInfo.id}`;

        await resend.emails.send({
          from: 'Team Season <books@teamseason.app>',
          to: contactEmail,
          subject: 'Your Season Book Has Shipped!',
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
              <h1 style="color: #1B4332;">Your book is on its way!</h1>
              <p>Your Team Season photo book has shipped and should arrive in 3-5 business days.</p>
              <p><strong>Tracking:</strong> <a href="${trackingUrl}">${trackingInfo.id}</a></p>
              <p style="color: #666; font-size: 14px; margin-top: 32px;">
                Long after the scores are forgotten, the moments remain.
              </p>
            </div>
          `,
        });

        console.log(`Tracking email sent to ${contactEmail}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Lulu webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
