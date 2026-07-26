import crypto from 'node:crypto';
import { bookingStore } from './booking-security.mjs';

const JOBBER_TOKEN_KEY = 'primary-account';
const TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';
const GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';
const DEFAULT_REDIRECT_URI = 'https://tuffbrosdetailing.com/.netlify/functions/jobber-oauth-callback';

function configured() {
  return Boolean(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET && getJobberRedirectUri());
}

export function jobberIsConfigured() {
  return configured();
}

export function getJobberRedirectUri() {
  return process.env.JOBBER_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

export function createPkce() {
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function exchangeAuthorizationCode(code, verifier) {
  if (!configured()) throw new Error('Jobber OAuth credentials are not configured.');
  const body = new URLSearchParams({
    client_id: process.env.JOBBER_CLIENT_ID,
    client_secret: process.env.JOBBER_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getJobberRedirectUri(),
    code_verifier: verifier
  });
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json();
  if (!response.ok || !data.access_token || !data.refresh_token) throw new Error(data.error_description || 'Jobber authorization could not be completed.');
  return saveTokens(data);
}

async function saveTokens(tokens) {
  const record = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 - 60_000,
    updatedAt: new Date().toISOString()
  };
  await bookingStore('jobber-auth').set(JOBBER_TOKEN_KEY, JSON.stringify(record));
  return record;
}

async function loadTokens() {
  const raw = await bookingStore('jobber-auth').get(JOBBER_TOKEN_KEY, { type: 'text', consistency: 'strong' });
  return raw ? JSON.parse(raw) : null;
}

export async function jobberHasConnection() {
  return Boolean(await loadTokens());
}

async function refreshTokens(tokens) {
  if (!configured()) throw new Error('Jobber OAuth credentials are not configured.');
  const body = new URLSearchParams({
    client_id: process.env.JOBBER_CLIENT_ID,
    client_secret: process.env.JOBBER_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken
  });
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Jobber connection needs to be authorized again.');
  return saveTokens({ ...data, refresh_token: data.refresh_token || tokens.refreshToken });
}

export async function getJobberAccessToken() {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('Jobber is not connected yet.');
  if (tokens.expiresAt > Date.now()) return tokens.accessToken;
  return (await refreshTokens(tokens)).accessToken;
}

export async function jobberGraphql(query, variables = {}) {
  const accessToken = await getJobberAccessToken();
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-JOBBER-GRAPHQL-VERSION': process.env.JOBBER_GRAPHQL_VERSION || '2025-04-16',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await response.json();
  if (!response.ok || data.errors?.length) throw new Error(data.errors?.[0]?.message || 'Jobber could not process this request.');
  return data.data;
}

export async function recordConnectedAccount() {
  const data = await jobberGraphql('query BookingAccount { account { id name } }');
  const current = await loadTokens();
  await bookingStore('jobber-auth').set(JOBBER_TOKEN_KEY, JSON.stringify({ ...current, account: data.account }));
  return data.account;
}
