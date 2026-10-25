import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');

function setup({ analytics = true, analyticsThrows = false, metaThrows = false } = {}) {
  let submit;
  const calls = [], events = [], redirects = [], timers = [];
  const button = { textContent: 'Send', disabled: false };
  const error = { hidden: true, scrollIntoView() {} };
  const form = { action: 'https://formspree.io/f/maqgpbrp', valid: true,
    checkValidity() { return this.valid; }, reportValidity() {}, reset() {},
    addEventListener(type, handler) { if (type === 'submit') submit = handler; } };
  const doc = {
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') handler(); },
    getElementById(id) { return ({ quoteForm: form, submitBtn: button, formError: error })[id] || null; },
    querySelectorAll() { return []; }, createElement() { return {}; },
    getElementsByTagName() { return [{ parentNode: { insertBefore() {} } }]; }, referrer: ''
  };
  const storage = { getItem() { return null; }, setItem() {} };
  const win = { location: { search: '', pathname: '/', origin: 'https://tuffbrosdetailing.com', assign(url) { redirects.push(url); } },
    sessionStorage: storage, matchMedia() { return { matches: true }; },
    setTimeout(fn, ms) { timers.push({ fn, ms }); },
    fbq(...args) { if (metaThrows && args[1] === 'Lead') throw new Error('Meta unavailable'); } };
  if (analytics) win.gtag = (...args) => { if (analyticsThrows) throw new Error('Analytics unavailable'); events.push(args); };
  const pending = [];
  vm.runInNewContext(source, { document: doc, window: win, sessionStorage: storage, URL, URLSearchParams,
    FormData: class {}, fetch(...args) { calls.push(args); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } });
  return { submit: () => submit({ preventDefault() {} }), form, button, error, calls, events, redirects, timers, pending };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('accepted quote sends one lead, locks repeat submissions, and redirects once after callback', async () => {
  const s = setup();
  s.submit(); s.submit();
  assert.equal(s.calls.length, 1);
  s.pending[0].resolve({ ok: true }); await flush();
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0][1], 'generate_lead');
  assert.equal(s.events[0][2].form_id, 'quoteForm');
  assert.equal(s.events[0][2].event_timeout, 1500);
  assert.deepEqual(s.redirects, []);
  s.submit(); assert.equal(s.calls.length, 1);
  assert.equal(s.button.disabled, true);
  s.events[0][2].event_callback(); s.timers[0].fn(); s.events[0][2].event_callback();
  assert.deepEqual(s.redirects, ['/quote-received/']);
});

test('failed submission emits no lead and remains retryable', async () => {
  const s = setup(); s.submit(); s.pending[0].resolve({ ok: false }); await flush();
  assert.equal(s.events.length, 0); assert.equal(s.timers.length, 0);
  assert.equal(s.error.hidden, false); assert.equal(s.button.disabled, false);
  s.submit(); assert.equal(s.calls.length, 2);
});

test('network failure and invalid form emit no conversion', async () => {
  const s = setup(); s.form.valid = false; s.submit(); assert.equal(s.calls.length, 0);
  s.form.valid = true; s.submit(); s.pending[0].reject(new Error('Offline')); await flush();
  assert.equal(s.events.length, 0); assert.equal(s.button.disabled, false);
});

for (const options of [{ analytics: false }, { analyticsThrows: true, metaThrows: true }]) {
  test(`confirmation survives unavailable measurement: ${JSON.stringify(options)}`, async () => {
    const s = setup(options); s.submit(); s.pending[0].resolve({ ok: true }); await flush();
    assert.equal(s.error.hidden, true); assert.equal(s.timers[0].ms, 1800);
    s.timers[0].fn(); assert.deepEqual(s.redirects, ['/quote-received/']);
  });
}

test('CSP allows the observed Google collection endpoints while retaining existing protections', () => {
  const text = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  const csp = text.match(/Content-Security-Policy = "([^"]+)"/)[1];
  const connect = csp.split(';').find(part => part.trim().startsWith('connect-src ')).trim().split(/\s+/);
  for (const url of ['https://analytics.google.com', 'https://www.google.com', 'https://stats.g.doubleclick.net', 'https://www.googletagmanager.com']) assert.ok(connect.includes(url), url);
  assert.ok(!connect.includes('*'));
  for (const protection of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", 'upgrade-insecure-requests']) assert.ok(csp.includes(protection));
});
