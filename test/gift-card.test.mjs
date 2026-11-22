import {test, mock} from 'node:test';
import assert from 'node:assert/strict';
mock.module('@netlify/blobs', {namedExports: {getStore: () => ({})}});
const {giftCard, giftCode, allowedLinks, shapeGift} = await import('../netlify/functions/lib/gift-card.mjs');

const LINK = 'plink_1TuffBrosGift300';
const env = {STRIPE_GIFT_CARD_KEY: 'rk_test_abc123', GIFT_CARD_PAYMENT_LINKS: `${LINK}, plink_other,not-a-link`};
const SESSION = 'cs_test_a1B2c3D4e5F6g7H8';
const paid = {
  object: 'checkout.session', id: SESSION, status: 'complete', payment_status: 'paid', payment_link: LINK,
  currency: 'usd', amount_total: 30000, payment_intent: 'pi_3QxYzAbCdEfGh12k', created: 1795320000,
  customer_details: {name: 'Buyer Name', email: 'buyer@example.com'},
  custom_fields: [
    {key: 'recipientname', type: 'text', text: {value: '  Dad  '}},
    {key: 'message', type: 'text', text: {value: 'Merry Christmas!'}}
  ]
};
const request = (query, method = 'GET') => new Request('https://tuffbrosdetailing.com/.netlify/functions/gift-card' + query, {method});
const stripe = (body, status = 200) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({url, init}); return new Response(JSON.stringify(body), {status}); };
  return {calls, fetchImpl};
};

test('code and link helpers', () => {
  assert.equal(giftCode('pi_3QxYzAbCdEfGh12k'), 'TB-DEFGH12K');
  assert.equal(giftCode('ch_123'), '');
  assert.deepEqual(allowedLinks(env.GIFT_CARD_PAYMENT_LINKS), [LINK, 'plink_other']);
});

test('a paid session from an allowed link returns only certificate fields', async () => {
  const {calls, fetchImpl} = stripe(paid);
  const res = await giftCard(request('?session_id=' + SESSION), {env, fetchImpl});
  assert.equal(res.status, 200);
  const {gift} = await res.json();
  assert.deepEqual(gift, {code: 'TB-DEFGH12K', amount: 300, recipient: 'Dad', from: 'Buyer Name', message: 'Merry Christmas!', purchasedAt: '2026-11-22T04:00:00.000Z', expiresOn: '2031-11-22'});
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/checkout/sessions/' + SESSION);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer rk_test_abc123');
  assert.equal(JSON.stringify(gift).includes('buyer@example.com'), false);
});

test('custom fields are found by label when the Dashboard picked its own keys', () => {
  const gift = shapeGift({...paid, custom_fields: [
    {key: 'recipientsname', label: {type: 'custom', custom: "Recipient's name"}, type: 'text', text: {value: 'Mom'}},
    {key: 'giftmessage', label: {type: 'custom', custom: 'Gift message'}, type: 'text', text: {value: 'Love you'}},
    {key: 'yourname', label: {type: 'custom', custom: 'From (your name)'}, type: 'text', text: {value: 'Jon'}}
  ]}, [LINK]);
  assert.equal(gift.recipient, 'Mom');
  assert.equal(gift.message, 'Love you');
  assert.equal(gift.from, 'Jon');
});

test('buyer name comes from Stripe name collection when no From field exists', () => {
  const gift = shapeGift({...paid, customer_details: {individual_name: 'Jonathan R', name: null}}, [LINK]);
  assert.equal(gift.from, 'Jonathan R');
});

test('unpaid, foreign-link, open or non-USD sessions are not gift cards', () => {
  const links = [LINK];
  assert.equal(shapeGift({...paid, payment_status: 'unpaid'}, links), null);
  assert.equal(shapeGift({...paid, status: 'open'}, links), null);
  assert.equal(shapeGift({...paid, payment_link: 'plink_somethingElse'}, links), null);
  assert.equal(shapeGift({...paid, payment_link: null}, links), null);
  assert.equal(shapeGift({...paid, currency: 'eur'}, links), null);
  assert.equal(shapeGift({...paid, payment_intent: null}, links), null);
});

test('rejects bad input before calling Stripe and reports missing setup', async () => {
  const {calls, fetchImpl} = stripe(paid);
  assert.equal((await giftCard(request('?session_id=' + SESSION), {env: {}, fetchImpl})).status, 503);
  assert.equal((await giftCard(request('?session_id=pi_123'), {env, fetchImpl})).status, 400);
  assert.equal((await giftCard(request('?session_id=cs_test_../../customers'), {env, fetchImpl})).status, 400);
  assert.equal((await giftCard(request('?session_id=' + SESSION, 'POST'), {env, fetchImpl})).status, 405);
  assert.equal(calls.length, 0);
});

test('Stripe errors map to safe responses', async () => {
  assert.equal((await giftCard(request('?session_id=' + SESSION), {env, fetchImpl: stripe({error: {}}, 404).fetchImpl})).status, 404);
  assert.equal((await giftCard(request('?session_id=' + SESSION), {env, fetchImpl: stripe({error: {}}, 401).fetchImpl})).status, 502);
  assert.equal((await giftCard(request('?session_id=' + SESSION), {env, fetchImpl: async () => { throw new Error('down'); }})).status, 502);
  assert.equal((await giftCard(request('?session_id=' + SESSION), {env, fetchImpl: stripe({...paid, payment_status: 'unpaid'}).fetchImpl})).status, 404);
});
