// Gift card certificates.
// Buyers pay through a Stripe Payment Link that redirects to
// /gift-cards/thank-you/?session_id={CHECKOUT_SESSION_ID}. This function looks
// the Checkout Session up with a server-side key and returns only what the
// printable certificate needs. Nothing is stored: Stripe is the record.
import {json} from './booking-security.mjs';

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,250}$/;
export const GIFT_YEARS = 5;
const STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions/';

// Allowed Payment Link IDs (plink_...), comma-separated, so a paid session from
// any other product on the same Stripe account can never become a gift card.
export function allowedLinks(value = '') {
  return value.split(',').map((s) => s.trim()).filter((s) => /^plink_[A-Za-z0-9]+$/.test(s));
}

// Short code printed on the certificate. It is the end of the Stripe
// PaymentIntent ID, so the owner can match it to the payment in the dashboard.
export function giftCode(paymentIntentId) {
  if (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9]{8,}$/.test(paymentIntentId)) return '';
  return 'TB-' + paymentIntentId.slice(-8).toUpperCase();
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function shapeGift(session, links) {
  if (!session || session.object !== 'checkout.session') return null;
  if (session.payment_status !== 'paid' || session.status !== 'complete') return null;
  if (!links.includes(session.payment_link)) return null;
  if (session.currency !== 'usd' || !Number.isInteger(session.amount_total) || session.amount_total <= 0) return null;
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const code = giftCode(paymentIntent);
  if (!code) return null;
  // Match a custom field by its key or its label, because the Stripe Dashboard
  // builds the key from whatever label the owner typed.
  const field = (word) => {
    const found = (session.custom_fields || []).find((f) => {
      const key = String(f.key || '').toLowerCase();
      const label = String(f.label?.custom || '').toLowerCase();
      return key.includes(word) || label.includes(word);
    });
    return clean(found?.text?.value, 120);
  };
  // Federal law (Regulation E) requires at least 5 years before a sold gift card expires.
  const purchased = new Date(session.created * 1000);
  const expires = new Date(purchased);
  expires.setUTCFullYear(expires.getUTCFullYear() + GIFT_YEARS);
  return {
    code,
    amount: session.amount_total / 100,
    recipient: field('recipient'),
    from: field('from') || clean(session.customer_details?.individual_name || session.customer_details?.name, 120),
    message: field('message'),
    purchasedAt: purchased.toISOString(),
    expiresOn: expires.toISOString().slice(0, 10)
  };
}

export async function giftCard(request, {env = process.env, fetchImpl = fetch} = {}) {
  if (request.method !== 'GET') return json({error: 'Method not allowed.'}, 405, {Allow: 'GET'});
  const key = env.STRIPE_GIFT_CARD_KEY || '';
  const links = allowedLinks(env.GIFT_CARD_PAYMENT_LINKS);
  if (!/^(rk|sk)_(test|live)_/.test(key) || !links.length) return json({error: 'Gift cards are not set up yet.'}, 503);
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!SESSION_RE.test(id)) return json({error: 'Invalid gift card link.'}, 400);
  let response;
  try {
    response = await fetchImpl(STRIPE_API + encodeURIComponent(id), {
      headers: {Authorization: 'Bearer ' + key, 'Stripe-Version': '2024-06-20'}
    });
  } catch {
    return json({error: 'Could not reach the payment system. Please refresh in a minute.'}, 502);
  }
  if (response.status === 404) return json({error: 'Gift card not found.'}, 404);
  if (!response.ok) return json({error: 'Could not load this gift card. Please refresh in a minute.'}, 502);
  const gift = shapeGift(await response.json(), links);
  if (!gift) return json({error: 'Gift card not found or payment not finished.'}, 404);
  return json({gift}, 200, {'X-Robots-Tag': 'noindex'});
}
