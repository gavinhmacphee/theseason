// api/webhook-stripe.js — Stripe webhook handler
// Triggers PDF generation on checkout.session.completed

export const config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = process.env;

  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.startsWith('sk_test_...')) {
    return res.status(503).json({ error: 'Backend not configured' });
  }

  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { bookDataKey, shippingName, shippingEmail } = session.metadata || {};

      console.log('Order completed:', {
        sessionId: session.id,
        bookDataKey,
        shippingName,
        shippingEmail,
        amount: session.amount_total,
      });

      // TODO: Trigger PDF generation pipeline
      // 1. Fetch book data from S3 using bookDataKey
      // 2. Call generate-pdf to render interior + cover PDFs
      // 3. Upload PDFs to S3 via upload-s3
      // 4. Submit print order to RPI via submit-rpi
      // 5. Send confirmation email via Resend
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
