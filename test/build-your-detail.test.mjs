import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICES, estimate, extrasFor, getService, requestDays, isoDate, validPhone, buildRequest } from '../book/pricing.js';

test('base prices match the homepage pricing', () => {
  assert.deepEqual(getService('full-detail').prices, { car: 300, suv: 350, xl: 400 });
  assert.deepEqual(getService('deep-interior').prices, { car: 180, suv: 220, xl: 270 });
  assert.deepEqual(getService('wash-clay-seal').prices, { car: 199, suv: 249, xl: 299 });
  assert.deepEqual(getService('basic-in-out').prices, { car: 150, suv: 180, xl: 230 });
  assert.deepEqual(getService('quick-interior').prices, { car: 80, suv: 100, xl: 150 });
  assert.deepEqual(getService('basic-wash-wax').prices, { car: 75, suv: 95, xl: 145 });
  for (const s of SERVICES) assert.equal(s.prices.xl, s.prices.suv + 50, s.name + ' XL is SUV + $50');
});

test('maintenance services are flagged returning-only', () => {
  assert.deepEqual(SERVICES.filter((s) => s.maintenance).map((s) => s.id).sort(), ['basic-in-out', 'basic-wash-wax', 'quick-interior']);
});

test('extras only show where they fit', () => {
  assert.deepEqual(extrasFor(getService('wash-clay-seal')).map((e) => e.id), ['paste-wax', 'headlights']);
  assert.deepEqual(extrasFor(getService('deep-interior')).map((e) => e.id), ['pet-hair', 'sand', 'stains', 'headlights']);
  assert.ok(!extrasFor(getService('quick-interior')).some((e) => e.id === 'stains'));
});

test('estimate adds extras and flags after-photo items', () => {
  const e = estimate({ size: 'suv', service: 'full-detail', extras: ['pet-hair', 'headlights', 'stains'] });
  assert.equal(e.base, 350);
  assert.equal(e.total, 480);
  assert.equal(e.afterPhotos, true);
  // an extra that does not fit the service is ignored
  assert.equal(estimate({ size: 'car', service: 'wash-clay-seal', extras: ['pet-hair'] }).total, 199);
});

test('oversized vehicles are a custom quote', () => {
  const e = estimate({ size: 'oversized', service: 'full-detail', extras: ['pet-hair'] });
  assert.equal(e.custom, true);
  assert.equal(e.total, null);
});

test('request days skip Sundays and start tomorrow', () => {
  const days = requestDays(new Date(2026, 10, 21), 12); // Saturday Nov 21
  assert.equal(isoDate(days[0]), '2026-11-23');
  assert.ok(days.every((d) => d.getDay() !== 0));
  assert.equal(days.length, 12);
});

test('phone validation matches the server', () => {
  assert.ok(validPhone('(501) 500-4306'));
  assert.ok(!validPhone('500-4306'));
  assert.ok(!validPhone('0501 500 4306'));
});

test('request payload fits the Tuff OS quote queue', () => {
  const p = buildRequest({ size: 'xl', service: 'full-detail', extras: ['pet-hair'], lastCleaned: 'long', city: 'Cabot', street: '12 Oak St', zip: '72023', date: '2026-11-24', window: 'morning', frequency: 'monthly', name: 'Sam Lee', phone: '501-555-0100', email: '', vehicle: '2022 Chevy Tahoe', notes: 'Dog hair everywhere' });
  assert.equal(p.kind, 'quote');
  assert.equal(p.city, 'Cabot');
  assert.equal(p.serviceAddress, '12 Oak St, Cabot, AR, 72023');
  assert.equal(p.petHair, 'Yes');
  assert.equal(p.odor, 'No');
  assert.match(p.service, /^Full Detail \(XL SUV \/ Minivan\)/);
  assert.match(p.message, /Estimate shown: from \$455/);
  assert.match(p.message, /Requested: Tue, Nov 24 · Morning/);
  assert.match(p.message, /How often: Every month/);
  assert.match(p.message, /Last detailed: Over 6 months, or never/);
  assert.ok(p.vehicle.length <= 150 && p.service.length <= 200 && p.message.length <= 1800);
});

test('other city goes into the address', () => {
  const p = buildRequest({ size: 'car', service: 'deep-interior', extras: [], city: 'Other', otherCity: 'Searcy', street: '1 Main', zip: '', date: '', window: '', name: 'A', phone: '5015550100', vehicle: 'Civic', notes: '' });
  assert.equal(p.serviceAddress, '1 Main, Searcy, AR');
});

test('every service lists what is included', async () => {
  for (const s of SERVICES) assert.ok(Array.isArray(s.includes) && s.includes.length >= 4, s.name);
});

test('request records the accepted booking policy', async () => {
  const { POLICY } = await import('../book/pricing.js');
  assert.deepEqual([POLICY.deposit, POLICY.cancelHours, POLICY.extraDirt], [25, 24, 50]);
  const p = buildRequest({ size: 'car', service: 'full-detail', extras: [], city: 'Benton', street: '1 A St', date: '', window: '', name: 'A', phone: '5015550100', vehicle: 'Civic', notes: '' });
  assert.match(p.message, /Policy accepted: \$25 deposit after confirmation, 24-hour cancellation, \$50 per extra 30 min/);
});

test('Tuff Club prices: bigger discount for more frequent visits', async () => {
  const { CLUB, clubPrice } = await import('../book/pricing.js');
  const regular = getService(CLUB.service).prices;
  for (const size of ['car', 'suv', 'xl']) {
    const [biweekly, monthly, bimonthly] = CLUB.schedules.map((s) => s.prices[size]);
    assert.ok(biweekly < monthly && monthly < bimonthly && bimonthly < regular[size], size);
  }
  assert.equal(clubPrice('monthly', 'suv'), 135);
  assert.equal(clubPrice('monthly', 'oversized'), null);
  assert.equal(clubPrice('once', 'car'), null);
});

test('club price applies only to Basic In & Out on a club schedule', () => {
  assert.equal(estimate({ size: 'car', service: 'basic-in-out', frequency: 'biweekly' }).total, 105);
  assert.equal(estimate({ size: 'car', service: 'basic-in-out', frequency: 'once' }).total, 150);
  assert.equal(estimate({ size: 'car', service: 'full-detail', frequency: 'monthly' }).total, 300);
  const p = buildRequest({ size: 'xl', service: 'basic-in-out', frequency: 'bimonthly', extras: ['pet-hair'], city: 'Bryant', street: '1 A', name: 'A', phone: '5015550100', vehicle: 'Tahoe', notes: '', date: '', window: '' });
  assert.match(p.message, /Tuff Club price applied: \$195 per visit \(regular \$230\), 3-visit minimum accepted/);
  assert.match(p.message, /Estimate shown: from \$250/);
});

test('Tuff Club page shows the same prices as the booking flow', async () => {
  const { readFile } = await import('node:fs/promises');
  const { CLUB } = await import('../book/pricing.js');
  const html = await readFile(new URL('../tuff-club/index.html', import.meta.url), 'utf8');
  const regular = getService(CLUB.service).prices;
  for (const schedule of CLUB.schedules) {
    const row = html.split('\n').find((line) => line.includes('<th scope="row">' + schedule.label));
    assert.ok(row, schedule.label);
    for (const size of ['car', 'suv', 'xl']) {
      assert.ok(row.includes('<strong>$' + schedule.prices[size] + '</strong><small>save $' + (regular[size] - schedule.prices[size]) + '</small>'), schedule.label + ' ' + size);
    }
  }
  const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const lowest = Math.min(...CLUB.schedules.map((s) => s.prices.car));
  assert.ok(home.includes('<strong>$' + lowest + '</strong>'));
});
