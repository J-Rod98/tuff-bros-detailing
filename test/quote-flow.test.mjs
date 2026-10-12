import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
function initializeQuote(search) {
  const listeners = {};
  const fields = new Map();
  const field = (id) => {
    if (!fields.has(id)) fields.set(id, { value: '', hidden: true, textContent: '', addEventListener(type, handler) { listeners[`${id}:${type}`] = handler; } });
    return fields.get(id);
  };
  for (const id of ['service', 'ceramicInterest', 'ceramicPackage', 'quotePackageSummary', 'submitBtn']) field(id);
  field('ceramicInterest').value = 'No';
  fields.set('quoteForm', { addEventListener(type, handler) { listeners[`quoteForm:${type}`] = handler; } });
  const rows = [{ hidden: false, querySelectorAll() { return [{ value: 'No', disabled: false }]; } }];
  const storage = { getItem() { throw new Error('Storage disabled'); }, setItem() { throw new Error('Storage disabled'); } };
  const doc = {
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') handler(); },
    getElementById(id) { return fields.get(id) || null; },
    querySelectorAll(selector) { return selector === '[data-interior-question]' ? rows : []; },
    createElement() { return {}; },
    getElementsByTagName() { return [{ parentNode: { insertBefore() {} } }]; },
    referrer: ''
  };
  const window = { location: { search, pathname: '/', origin: 'https://tuffbrosdetailing.com' }, sessionStorage: storage, fbq() {}, matchMedia() { return { matches: true }; } };
  vm.runInNewContext(source, { document: doc, window, sessionStorage: storage, URL, URLSearchParams });
  return { field, rows, listeners };
}

test('blocked storage still initializes quote submission and ceramic package context', () => {
  const { field, rows, listeners } = initializeQuote('?service=ceramic&package=correct-protect&utm_source=ad');
  assert.equal(typeof listeners['quoteForm:submit'], 'function');
  assert.equal(field('service').value, 'Ceramic Coating');
  assert.equal(field('ceramicInterest').value, 'Yes');
  assert.match(field('ceramicPackage').value, /Correct \+ Protect.*999/);
  assert.equal(field('quotePackageSummary').hidden, false);
  assert.equal(rows[0].hidden, true);
});

test('deep interior intent is selected and changing service clears stale ceramic intent', () => {
  const deep = initializeQuote('?service=deep-interior');
  assert.equal(deep.field('service').value, 'Deep Interior Clean');
  assert.equal(deep.rows[0].hidden, false);
  const ceramic = initializeQuote('?service=ceramic&package=pro');
  ceramic.field('service').value = 'Deep Interior Clean';
  ceramic.listeners['service:change']();
  assert.equal(ceramic.field('ceramicPackage').value, '');
  assert.equal(ceramic.field('quotePackageSummary').hidden, true);
  assert.equal(ceramic.rows[0].hidden, false);
});

test('unrecognized package text cannot populate a quote request', () => {
  const { field } = initializeQuote('?service=ceramic&package=%3Cscript%3E');
  assert.equal(field('ceramicPackage').value, '');
  assert.equal(field('quotePackageSummary').hidden, true);
});

test('wash clay and seal quote links select the service and hide interior questions', () => {
  const { field, rows } = initializeQuote('?service=wash-clay-seal');
  assert.equal(field('service').value, 'Wash, Clay & Seal');
  assert.equal(rows[0].hidden, true);
  assert.equal(field('ceramicPackage').value, '');
});
