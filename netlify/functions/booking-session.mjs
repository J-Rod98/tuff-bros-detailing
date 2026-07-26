import { createBookingSession, json, sessionCookie, takeRateLimit } from './lib/booking-security.mjs';

export default async (request) => {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
  try {
    if (!await takeRateLimit(request, { name: 'session', limit: 20, windowMs: 5 * 60_000 })) {
      return json({ message: 'Please wait a few minutes before starting another booking request.' }, 429);
    }
    const session = await createBookingSession();
    return json({ csrfToken: session.csrfToken, expiresAt: session.expiresAt }, 200, { 'Set-Cookie': sessionCookie(session.sessionId) });
  } catch (error) {
    return json({ message: error.message || 'Secure booking sessions are unavailable.' }, 503);
  }
};

export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 300, windowLimit: 25 }
};
