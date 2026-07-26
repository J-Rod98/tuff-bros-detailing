import { bookingStore } from './lib/booking-security.mjs';
import { exchangeAuthorizationCode, recordConnectedAccount } from './lib/jobber-client.mjs';

const page = (title, message) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#0c0c0f;color:#ece7dd;font-family:Inter,Arial,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px"><main style="max-width:560px;border:1px solid #403c3b;border-radius:16px;padding:32px;background:#17171c"><p style="color:#ef4b52;font-weight:700;letter-spacing:1px;text-transform:uppercase">Tuff Bros Mobile Detailing</p><h1 style="margin:0 0 14px">${title}</h1><p style="line-height:1.6">${message}</p><p><a style="color:#ef4b52" href="/">Return to the website</a></p></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async (request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (error || !code || !state) return page('Jobber connection was not completed', 'No booking data was changed. You can return to Jobber and try the connection again when ready.');
  try {
    const store = bookingStore('jobber-oauth');
    const raw = await store.get(state, { type: 'text', consistency: 'strong' });
    if (!raw) throw new Error('This authorization link expired.');
    const pending = JSON.parse(raw);
    if (!pending.expiresAt || pending.expiresAt < Date.now()) throw new Error('This authorization link expired.');
    await store.delete(state);
    await exchangeAuthorizationCode(code, pending.verifier);
    const account = await recordConnectedAccount();
    return page('Jobber is connected', `${account.name} is now connected to the Tuff Bros booking system. Online appointment requests remain disabled until the calendar mapping is verified.`);
  } catch (error) {
    console.error('Jobber OAuth callback failed', error);
    return page('Jobber connection could not be completed', 'No booking request was created. Check the configured redirect URL and try again.');
  }
};
