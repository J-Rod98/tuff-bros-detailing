import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_CONFIG, BOOKING_STATUSES, evaluateReservation, getStartingPrice } from '../booking-config.js';

test('keeps approved standard-service estimates centralized', () => {
  assert.equal(getStartingPrice('quick-interior', 'car'), 80);
  assert.equal(getStartingPrice('quick-interior', 'truck'), 100);
  assert.equal(getStartingPrice('basic-wash-wax', 'truck'), 95);
  assert.equal(getStartingPrice('basic-in-out', 'suv'), 180);
  assert.equal(getStartingPrice('headlight-restoration', 'car'), 125);
  assert.equal(BOOKING_CONFIG.addOns.find((addOn) => addOn.id === 'headlight-restoration').price, 75);
});

test('only offers Monday through Saturday morning preference requests', () => {
  assert.deepEqual(BOOKING_CONFIG.scheduling.requestableWeekdays, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(BOOKING_CONFIG.scheduling.windows.map((window) => window.id), ['morning']);
  assert.equal(BOOKING_CONFIG.scheduling.temporaryHoldHours, 24);
});

test('keeps only reviewed extras eligible for an online request', () => {
  assert.equal(BOOKING_CONFIG.addOns.find((addOn) => addOn.id === 'paste-wax').onlineEligible, true);
  assert.equal(BOOKING_CONFIG.addOns.find((addOn) => addOn.id === 'headlight-restoration').onlineEligible, true);
  assert.equal(BOOKING_CONFIG.addOns.find((addOn) => addOn.id === 'pet-hair').onlineEligible, undefined);
});

test('routes oversized vehicles to a quote request', () => {
  const result = evaluateReservation({ serviceId: 'quick-interior', vehicleId: 'oversized' });
  assert.equal(result.route, 'quote_request');
  assert.equal(result.initialStatus, BOOKING_STATUSES.PENDING_REVIEW);
});

test('routes any reported heavy-condition flag to a quote request', () => {
  const result = evaluateReservation({
    serviceId: 'basic-in-out',
    vehicleId: 'car',
    conditions: { heavySand: true }
  });
  assert.equal(result.route, 'quote_request');
  assert.deepEqual(result.flaggedConditions, ['heavySand']);
});

test('marks an outside-area request for travel review without promising travel', () => {
  const result = evaluateReservation({
    serviceId: 'basic-wash-wax',
    vehicleId: 'suv',
    city: 'Hot Springs'
  });
  assert.equal(result.route, 'appointment_request');
  assert.equal(result.initialStatus, BOOKING_STATUSES.PENDING_TRAVEL_REVIEW);
});

test('requires photo review for headlight restoration without photos', () => {
  const result = evaluateReservation({
    serviceId: 'headlight-restoration',
    vehicleId: 'car',
    photoCount: 0
  });
  assert.equal(result.route, 'photo_review');
  assert.equal(result.initialStatus, BOOKING_STATUSES.PENDING_PHOTO_REVIEW);
});
