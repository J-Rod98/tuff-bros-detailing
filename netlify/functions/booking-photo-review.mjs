import { bookingStore, json } from './lib/booking-security.mjs';

const PHOTO_LABELS = {
  front: 'Front of vehicle',
  rear: 'Rear of vehicle',
  frontSeats: 'Front seats',
  rearSeats: 'Rear seats',
  floor: 'Floor / carpets',
  problemAreas: 'Problem areas'
};

function notFound() {
  return json({ message: 'This photo review link is unavailable or has expired.' }, 404);
}

function html(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function removeExpiredReview(reviews, token, review) {
  await reviews.delete(token);
  await Promise.allSettled((review.photos || []).map((photo) => bookingStore('booking-photos').delete(photo.id)));
}

export default async (request) => {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return notFound();

  const reviews = bookingStore('booking-photo-reviews');
  const raw = await reviews.get(token, { type: 'text', consistency: 'strong' });
  if (!raw) return notFound();

  let review;
  try {
    review = JSON.parse(raw);
  } catch {
    return notFound();
  }
  if (!review.expiresAt || !Array.isArray(review.photos)) return notFound();
  if (review.expiresAt < Date.now()) {
    await removeExpiredReview(reviews, token, review);
    return notFound();
  }

  const photoId = url.searchParams.get('photo');
  if (photoId) {
    const photo = review.photos.find((item) => item?.id === photoId);
    if (!photo) return notFound();
    const stored = await bookingStore('booking-photos').getWithMetadata(photo.id, { type: 'arrayBuffer', consistency: 'strong' });
    const metadata = stored?.metadata || {};
    if (!stored || metadata.sessionId !== review.sessionId || metadata.photoType !== photo.photoType || !metadata.mime) return notFound();
    return new Response(stored.data, {
      headers: {
        'Content-Type': metadata.mime,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }

  const gallery = review.photos.map((photo) => {
    const imageUrl = `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}&photo=${encodeURIComponent(photo.id)}`;
    return `<figure><img src="${html(imageUrl)}" alt="${html(PHOTO_LABELS[photo.photoType] || 'Vehicle photo')}"><figcaption>${html(PHOTO_LABELS[photo.photoType] || 'Vehicle photo')}</figcaption></figure>`;
  }).join('');
  const expiration = new Date(review.expiresAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vehicle photo review | Tuff Bros</title><style>body{margin:0;background:#f6f2ec;color:#1e2426;font:16px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:980px;margin:auto;padding:32px 18px 48px}h1{margin:0 0 8px;font-size:28px}p{line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:24px}figure{margin:0;background:#fff;border:1px solid #ded7cf;border-radius:12px;overflow:hidden}img{display:block;width:100%;height:230px;object-fit:cover;background:#e8e3dc}figcaption{padding:12px 14px;font-weight:650}</style></head><body><main><h1>Vehicle photo review</h1><p>Tuff Bros request ${html(review.requestId)}. This private review link expires ${html(expiration)}.</p><div class="grid">${gallery}</div></main></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
