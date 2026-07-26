import { bookingStore, json, randomToken } from './lib/booking-security.mjs';
import { createPkce, getJobberRedirectUri, jobberIsConfigured } from './lib/jobber-client.mjs';
import crypto from 'node:crypto';

function connectTokenMatches(request) {
  const expected = process.env.JOBBER_CONNECT_TOKEN;
  const received = new URL(request.url).searchParams.get('token');
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export default async (request) => {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
  if (!connectTokenMatches(request)) return json({ message: 'Not found.' }, 404);
  if (!jobberIsConfigured()) return json({ message: 'Add the Jobber OAuth environment variables before connecting the account.' }, 503);
  const state = randomToken();
  const { verifier, challenge } = createPkce();
  await bookingStore('jobber-oauth').set(state, JSON.stringify({ verifier, expiresAt: Date.now() + 10 * 60 * 1000 }));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.JOBBER_CLIENT_ID,
    redirect_uri: getJobberRedirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  return new Response(null, { status: 302, headers: { Location: `https://api.getjobber.com/api/oauth/authorize?${params}` } });
};
