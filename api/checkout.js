// api/checkout.js — Stripe Checkout session creation
// Requires: STRIPE_SECRET_KEY, STRIPE_PRICE_ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { STRIPE_SECRET_KEY, STRIPE_PRICE_ID } = process.env;

  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.startsWith('sk_test_...')) {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'Stripe is not set up yet. Use Download Proof for now.',
    });
  }

  try {
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    const { bookDataKey, shipping } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price: STRIPE_PRICE_ID,
        quantity: 1,
      }],
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      metadata: {
        bookDataKey,
        shippingName: shipping?.name || '',
        shippingEmail: shipping?.email || '',
      },
      success_url: `${req.headers.origin || 'http://localhost:3001'}?order=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:3001'}?order=cancelled`,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
