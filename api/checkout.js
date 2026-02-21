// api/checkout.js - Stripe Checkout session creation
// Creates a $39 book order with shipping metadata for Lulu fulfillment

import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { STRIPE_SECRET_KEY } = process.env;

  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.startsWith('sk_test_...')) {
    return res.status(503).json({
      error: 'Backend not configured',
      message: 'Stripe is not set up yet. Use Download Proof for now.',
    });
  }

  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const { bookDataUrl, shipping } = req.body;

    if (!bookDataUrl || !shipping) {
      return res.status(400).json({ error: 'bookDataUrl and shipping are required' });
    }

    const baseUrl = req.headers.origin || 'https://teamseason.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Team Season Photo Book',
              description: '7.75" square hardcover, full color, shipped to your door',
            },
            unit_amount: 3900, // $39.00
          },
          quantity: 1,
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 599, currency: 'usd' },
            display_name: 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
      ],
      // Store everything needed for fulfillment in metadata
      metadata: {
        bookDataUrl,
        shipping_name: shipping.name || '',
        shipping_email: shipping.email || '',
        shipping_street: shipping.street || '',
        shipping_city: shipping.city || '',
        shipping_state: shipping.state || '',
        shipping_zip: shipping.zip || '',
      },
      customer_email: shipping.email,
      success_url: `${baseUrl}/app?order=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/app?order=cancelled`,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
