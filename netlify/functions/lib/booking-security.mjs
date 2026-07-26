import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const SESSION_COOKIE = 'tuffbros_booking_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60;
const ALLOWED_PHOTO_TYPES = new Set(['front', 'rear', 'frontSeats', 'rearSeats', 'floor', 'problemAreas']);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export function bookingStore(name, consistency = 'strong') {
  return getStore({ name: `tuffbros-${name}`, consistency });
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function parseCookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter((entry) => entry.length));
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const expectedOrigin = process.env.URL || new URL(request.url).origin;
  return origin === expectedOrigin;
}

export async function createBookingSession() {
  if (!process.env.BOOKING_SESSION_SECRET || process.env.BOOKING_SESSION_SECRET.length < 32) {
    throw new Error('Secure booking sessions are not configured.');
  }
  const sessionId = randomToken();
  const csrfToken = randomToken();
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  await bookingStore('booking-sessions').set(sessionId, JSON.stringify({ csrfToken, expiresAt }));
  return { sessionId, csrfToken, expiresAt };
}

export function sessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export async function verifyBookingSession(request) {
  if (!sameOrigin(request)) return { ok: false, response: json({ message: 'Invalid request origin.' }, 403) };
  const sessionId = parseCookies(request)[SESSION_COOKIE];
  const csrfToken = request.headers.get('x-booking-csrf') || '';
  if (!sessionId || !csrfToken) return { ok: false, response: json({ message: 'Your booking session expired. Please refresh and try again.' }, 403) };
  const raw = await bookingStore('booking-sessions').get(sessionId, { type: 'text', consistency: 'strong' });
  if (!raw) return { ok: false, response: json({ message: 'Your booking session expired. Please refresh and try again.' }, 403) };
  const session = JSON.parse(raw);
  if (!session.expiresAt || session.expiresAt < Date.now() || !timingSafeEqual(session.csrfToken, csrfToken)) {
    return { ok: false, response: json({ message: 'Your booking session expired. Please refresh and try again.' }, 403) };
  }
  return { ok: true, sessionId, session };
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function validPhotoType(value) {
  return ALLOWED_PHOTO_TYPES.has(value);
}

export function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', extension: 'png' };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return { mime: 'image/heic', extension: 'heic' };
  }
  return null;
}

export function safePhotoKey(photoType, extension) {
  return `${new Date().toISOString().slice(0, 10)}/${randomToken(18)}-${photoType}.${extension}`;
}

export function clientIp(request) {
  return request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || 'unknown';
}

/**
 * Small, server-side rate limiter for public booking endpoints. The key stores
 * only a one-way hash of the visitor IP and expires naturally with its window.
 */
export async function takeRateLimit(request, { name, limit, windowMs }) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const fingerprint = crypto.createHash('sha256').update(clientIp(request)).digest('base64url');
  const key = `${name}/${windowStart}/${fingerprint}`;
  const store = bookingStore('booking-rate-limits');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!current) {
      const created = await store.setJSON(key, { count: 1, expiresAt: windowStart + windowMs }, { onlyIfNew: true });
      if (created.modified) return true;
      continue;
    }
    const count = Number(current.data?.count || 0);
    if (count >= limit) return false;
    const updated = await store.setJSON(key, { count: count + 1, expiresAt: windowStart + windowMs }, { onlyIfMatch: current.etag });
    if (updated.modified) return true;
  }
  return false;
}
