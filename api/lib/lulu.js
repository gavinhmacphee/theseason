// Lulu Print API client
// Docs: https://api.lulu.com/docs/
// Auth: OAuth 2.0 with client credentials

const LULU_API_BASE = process.env.LULU_API_BASE || 'https://api.lulu.com';
const LULU_AUTH_URL = process.env.LULU_AUTH_URL || 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token';

// Sandbox URLs (switch these for testing):
// LULU_API_BASE=https://api.sandbox.lulu.com
// LULU_AUTH_URL=https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 30000) {
    return cachedToken;
  }

  const clientKey = process.env.LULU_CLIENT_KEY;
  const clientSecret = process.env.LULU_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error('LULU_CLIENT_KEY and LULU_CLIENT_SECRET are required');
  }

  const res = await fetch(LULU_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientKey,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lulu auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function luluRequest(method, path, body) {
  const token = await getAccessToken();
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${LULU_API_BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(`Lulu API error (${res.status}): ${JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Pod package ID for our book format
// 7.75x7.75" small square hardcover case wrap, full color premium, 80# white coated, matte
// See: https://api.lulu.com/print-shipping-calculator
const PHOTO_BOOK_POD_PACKAGE_ID = process.env.LULU_POD_PACKAGE_ID || '0750X0750FCPRECW080CW444MXX';
// You MUST verify this ID against Lulu's catalog - run getShippingEstimate to test

export async function createPrintOrder({ pdfUrl, coverPdfUrl, shippingAddress, externalId }) {
  // Lulu order structure per their API docs
  const order = {
    contact_email: shippingAddress.email,
    external_id: externalId,
    line_items: [
      {
        external_id: externalId,
        printable_normalization: {
          cover: { source_url: coverPdfUrl },
          interior: { source_url: pdfUrl },
          pod_package_id: PHOTO_BOOK_POD_PACKAGE_ID,
        },
        quantity: 1,
        shipping_level: 'MAIL',
        title: `${shippingAddress.teamName || 'Team'} Season Book`,
      },
    ],
    shipping_address: {
      name: shippingAddress.name,
      street1: shippingAddress.street,
      city: shippingAddress.city,
      state_code: shippingAddress.state,
      postcode: shippingAddress.zip,
      country_code: 'US',
      phone_number: shippingAddress.phone || '',
    },
  };

  return luluRequest('POST', '/v1/print-jobs/', order);
}

export async function getOrderStatus(orderId) {
  return luluRequest('GET', `/v1/print-jobs/${orderId}/`);
}

export async function getShippingEstimate({ pageCount, quantity = 1, state, zip, country = 'US' }) {
  return luluRequest('POST', '/v1/print-job-cost-calculations/', {
    line_items: [
      {
        page_count: pageCount,
        pod_package_id: PHOTO_BOOK_POD_PACKAGE_ID,
        quantity,
      },
    ],
    shipping_address: {
      state_code: state,
      postcode: zip,
      country_code: country,
    },
    shipping_option: 'MAIL',
  });
}

export async function cancelOrder(orderId) {
  return luluRequest('DELETE', `/v1/print-jobs/${orderId}/`);
}
