import crypto from 'node:crypto';
import {
  BOOKING_CONFIG,
  BOOKING_STATUSES,
  evaluateReservation,
  getAddOn,
  getService,
  getStartingPrice,
  getVehicle,
  money
} from '../../booking-config.js';
import { bookingCanAcceptRequests, isBookableDate, slotKey } from './booking-availability.mjs';
import { addBookingNote, createJobberBookingRequest, findOrCreateBookingClient } from './lib/jobber-bookings.mjs';
import { bookingStore, json, randomToken, takeRateLimit, validPhotoType, verifyBookingSession } from './lib/booking-security.mjs';

const REQUIRED_PHOTO_TYPES = BOOKING_CONFIG.requiredPhotoTypes.filter((photo) => photo.required).map((photo) => photo.id);
const MAX_BODY_BYTES = 80_000;
const PHOTO_REVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

function requestNumber() {
  return `TB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function clean(value, maximum = 250) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maximum) : '';
}

function required(value, label, maximum) {
  const result = clean(value, maximum);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function normalizedPhone(value) {
  const phone = required(value, 'A mobile number', 32);
  if (!/^[0-9+().\-\s]{7,32}$/.test(phone)) throw new Error('Enter a valid mobile number.');
  return phone;
}

function normalizedEmail(value) {
  const email = clean(value, 254);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email or leave it blank.');
  return email;
}

function normalizedConditions(input) {
  const values = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(BOOKING_CONFIG.conditions.map((condition) => [condition.id, values[condition.id] === true]));
}

function normalizePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The booking details could not be read. Please try again.');
  const serviceId = clean(input.serviceId, 80);
  const vehicleId = clean(input.vehicleId, 80);
  if (!getService(serviceId)) throw new Error('Choose a standard service.');
  if (!getVehicle(vehicleId)) throw new Error('Choose a vehicle type.');
  const addOnIds = Array.isArray(input.addOnIds)
    ? [...new Set(input.addOnIds.map((value) => clean(value, 80)).filter(Boolean))]
    : [];
  if (addOnIds.some((id) => !getAddOn(id))) throw new Error('One of the selected add-ons is not available.');

  const customerInput = input.customer || {};
  const vehicleInput = input.vehicle || {};
  const addressInput = input.address || {};
  const appointmentInput = input.appointment || {};
  const termsInput = input.terms || {};
  const photoInput = Array.isArray(input.photos) ? input.photos : [];
  const photos = photoInput.map((photo) => ({
    id: clean(photo?.id, 300),
    photoType: clean(photo?.photoType, 80)
  }));
  if (!photos.length || photos.some((photo) => !photo.id || !validPhotoType(photo.photoType))) throw new Error('Upload valid vehicle photos before sending your request.');
  if (new Set(photos.map((photo) => photo.photoType)).size !== photos.length) throw new Error('Upload only one photo for each requested view.');
  const photoTypes = new Set(photos.map((photo) => photo.photoType));
  if (REQUIRED_PHOTO_TYPES.some((photoType) => !photoTypes.has(photoType))) throw new Error('Add the required vehicle photos before sending your request.');

  const date = clean(appointmentInput.date, 10);
  const window = clean(appointmentInput.window, 40);
  if (!isBookableDate(date) || !BOOKING_CONFIG.scheduling.windows.some((item) => item.id === window)) {
    throw new Error('Choose an available Monday–Saturday morning preference.');
  }
  const signature = required(termsInput.signature, 'Your typed full legal name', 160);
  if (signature.split(/\s+/).length < 2 || termsInput.accepted !== true || termsInput.version !== BOOKING_CONFIG.reservation.termsVersion) {
    throw new Error('Please agree to the current Booking Terms and type your full legal name.');
  }

  return {
    serviceId,
    vehicleId,
    addOnIds,
    customer: {
      firstName: required(customerInput.firstName, 'First name', 80),
      lastName: required(customerInput.lastName, 'Last name', 80),
      phone: normalizedPhone(customerInput.phone),
      email: normalizedEmail(customerInput.email)
    },
    vehicle: {
      year: required(vehicleInput.year, 'Vehicle year', 8),
      make: required(vehicleInput.make, 'Vehicle make', 80),
      model: required(vehicleInput.model, 'Vehicle model', 100),
      color: required(vehicleInput.color, 'Vehicle color', 60),
      notes: clean(vehicleInput.notes, 1_500)
    },
    conditions: normalizedConditions(input.conditions),
    address: {
      street: required(addressInput.street, 'Street address', 150),
      city: required(addressInput.city, 'City', 80),
      zip: required(addressInput.zip, 'ZIP code', 10)
    },
    appointment: { date, window },
    photos,
    terms: { acceptedAt: new Date().toISOString(), signature, version: termsInput.version },
    attribution: input.attribution && typeof input.attribution === 'object'
      ? Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']
        .map((key) => [key, clean(input.attribution[key], 250)]).filter(([, value]) => value))
      : {}
  };
}

async function reserveSlot({ date, window, requestId }) {
  const store = bookingStore('booking-holds');
  const key = slotKey(date, window);
  const record = {
    requestId,
    date,
    window,
    expiresAt: Date.now() + BOOKING_CONFIG.scheduling.temporaryHoldHours * 60 * 60 * 1_000
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!current) {
      const created = await store.setJSON(key, record, { onlyIfNew: true });
      if (created.modified) return true;
      continue;
    }
    if (Number(current.data?.expiresAt || 0) > Date.now()) return false;
    const replaced = await store.setJSON(key, record, { onlyIfMatch: current.etag });
    if (replaced.modified) return true;
  }
  return false;
}

async function releaseSlot({ date, window, requestId }) {
  const store = bookingStore('booking-holds');
  const current = await store.getWithMetadata(slotKey(date, window), { type: 'json', consistency: 'strong' });
  if (current?.data?.requestId === requestId) await store.delete(slotKey(date, window));
}

function bookingInstructions(payload, evaluation, requestId) {
  const service = getService(payload.serviceId);
  const vehicle = getVehicle(payload.vehicleId);
  const selectedAddOns = payload.addOnIds.map(getAddOn).filter(Boolean);
  const startsAt = getStartingPrice(payload.serviceId, payload.vehicleId);
  const arrival = BOOKING_CONFIG.scheduling.windows.find((item) => item.id === payload.appointment.window);
  return [
    `ONLINE APPOINTMENT REQUEST — ${requestId}`,
    `Status: ${evaluation.initialStatus}. This is not a confirmed appointment.`,
    `Requested service: ${service.name} (${vehicle.label}); starting estimate ${startsAt ? money(startsAt) : 'custom review required'}.`,
    `Vehicle: ${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model}, ${payload.vehicle.color}.`,
    `Service address: ${payload.address.street}, ${payload.address.city}, AR ${payload.address.zip}.`,
    `Preferred appointment: ${payload.appointment.date}, ${arrival?.label || 'Morning'} arrival window only — do not promise an exact time.`,
    selectedAddOns.length ? `Requested add-ons (not approved or charged): ${selectedAddOns.map((addOn) => `${addOn.label} starts at ${money(addOn.price)}`).join('; ')}.` : '',
    payload.vehicle.notes ? `Customer notes: ${payload.vehicle.notes}` : '',
    `Photos: ${payload.photos.length} secure vehicle photos are available from the private review link in the Jobber request notes.`,
    `Terms: customer accepted v${payload.terms.version} on ${payload.terms.acceptedAt}; typed signature: ${payload.terms.signature}.`,
    `OWNER NEXT STEP: Review the request, photos, travel, and morning availability. If approved, send a Jobber Client Hub payment request for the ${money(BOOKING_CONFIG.reservation.depositAmount)} deposit; card details must stay in Jobber. Confirm only after the customer completes the approved deposit step.`,
    Object.keys(payload.attribution).length ? `Attribution: ${Object.entries(payload.attribution).map(([key, value]) => `${key}=${value}`).join(', ')}` : ''
  ].filter(Boolean).join('\n');
}

function success(record) {
  return json({ requestId: record.requestId, route: 'appointment_request', status: record.status || BOOKING_STATUSES.PENDING_REVIEW });
}

async function createPhotoReview(record, sessionId, origin) {
  if (record.photoReview?.url) return record.photoReview;
  const token = randomToken();
  const expiresAt = Date.now() + PHOTO_REVIEW_WINDOW_MS;
  const review = {
    url: `${origin}/.netlify/functions/booking-photo-review?token=${encodeURIComponent(token)}`,
    expiresAt
  };
  await bookingStore('booking-photo-reviews').set(token, JSON.stringify({
    requestId: record.requestId,
    sessionId,
    photos: record.photos,
    expiresAt,
    createdAt: new Date().toISOString()
  }));
  return review;
}

async function resumePhotoHandoff(record, sessionId, origin) {
  const photoReview = await createPhotoReview(record, sessionId, origin);
  await addBookingNote({
    requestId: record.jobberRequestId,
    message: `Secure vehicle photos for Tuff Bros request ${record.requestId} (available for 30 days): ${photoReview.url}`
  });
  const completed = { ...record, photoReview, stage: 'complete', completedAt: new Date().toISOString() };
  await bookingStore('booking-submissions').setJSON(sessionId, completed);
  return completed;
}

export default async (request) => {
  if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
  const session = await verifyBookingSession(request);
  if (!session.ok) return session.response;
  const origin = process.env.URL || new URL(request.url).origin;
  if (!await takeRateLimit(request, { name: 'booking-request', limit: 5, windowMs: 15 * 60_000 })) {
    return json({ message: 'Too many appointment requests. Please wait a few minutes or call Tuff Bros.' }, 429);
  }
  if (!await bookingCanAcceptRequests()) {
    return json({ message: 'Online appointment requests are temporarily unavailable. Please use the custom quote form or call Tuff Bros.' }, 503);
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ message: 'That booking request is too large. Please try again.' }, 413);

  let payload;
  try {
    payload = normalizePayload(await request.json());
  } catch (error) {
    return json({ message: error.message || 'The booking details could not be read.' }, 400);
  }
  const evaluation = evaluateReservation({
    serviceId: payload.serviceId,
    vehicleId: payload.vehicleId,
    conditions: payload.conditions,
    city: payload.address.city,
    photoCount: payload.photos.length,
    addOnIds: payload.addOnIds
  });
  if (evaluation.route !== 'appointment_request') {
    return json({ message: 'This vehicle needs a custom quote before an appointment can be requested.', route: 'quote_request' }, 422);
  }

  const submissions = bookingStore('booking-submissions');
  const existing = await submissions.getWithMetadata(session.sessionId, { type: 'json', consistency: 'strong' });
  if (existing?.data?.stage === 'complete') return success(existing.data);
  if (existing?.data?.stage === 'request-created') {
    try {
      return success(await resumePhotoHandoff(existing.data, session.sessionId, origin));
    } catch (error) {
      console.error('booking photo review retry failed', error);
      return json({ message: 'We saved your request but could not finish the secure photo review link. Please try again in a moment.' }, 503);
    }
  }
  if (existing?.data?.stage === 'slot-unavailable' || existing?.data?.stage === 'failed') {
    await submissions.delete(session.sessionId);
  } else if (existing) {
    return json({ message: 'Your request is already being processed. Please wait a moment before trying again.' }, 409);
  }

  const record = {
    requestId: requestNumber(),
    stage: 'processing',
    status: evaluation.initialStatus,
    date: payload.appointment.date,
    window: payload.appointment.window,
    photos: payload.photos,
    createdAt: new Date().toISOString()
  };
  const claimed = await submissions.setJSON(session.sessionId, record, { onlyIfNew: true });
  if (!claimed.modified) return json({ message: 'Your request is already being processed. Please wait a moment before trying again.' }, 409);
  if (!await reserveSlot({ date: record.date, window: record.window, requestId: record.requestId })) {
    await submissions.setJSON(session.sessionId, { ...record, stage: 'slot-unavailable' });
    return json({ message: 'That morning preference was just requested. Please choose another available date.' }, 409);
  }

  try {
    const client = await findOrCreateBookingClient(payload);
    const jobberRequest = await createJobberBookingRequest({
      clientId: client.id,
      title: `Online request: ${getService(payload.serviceId).name} — ${payload.customer.firstName} ${payload.customer.lastName}`,
      instructions: bookingInstructions(payload, evaluation, record.requestId)
    });
    await addBookingNote({
      requestId: jobberRequest.id,
      message: `Tuff Bros online request ${record.requestId}: this is a pending review, not a confirmed appointment. ${payload.photos.length} vehicle photos will be available through a secure review link.`
    });
    const created = { ...record, stage: 'request-created', jobberRequestId: jobberRequest.id, jobberRequestUrl: jobberRequest.jobberWebUri || '' };
    await submissions.setJSON(session.sessionId, created);
    return success(await resumePhotoHandoff(created, session.sessionId, origin));
  } catch (error) {
    console.error('booking-request failed', error);
    const current = await submissions.getWithMetadata(session.sessionId, { type: 'json', consistency: 'strong' });
    if (current?.data?.stage === 'request-created') {
      return json({ message: 'We saved your request but could not finish the secure photo review link. Please try again in a moment.' }, 503);
    }
    await submissions.setJSON(session.sessionId, { ...record, stage: 'failed' });
    await releaseSlot({ date: record.date, window: record.window, requestId: record.requestId });
    return json({ message: 'We could not send your appointment request. Please try again or call Tuff Bros.' }, 503);
  }
};

export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 900, windowLimit: 5 }
};
