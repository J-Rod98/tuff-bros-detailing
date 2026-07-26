import { BOOKING_CONFIG } from '../../booking-config.js';
import { bookingStore, json } from './lib/booking-security.mjs';
import { jobberGraphql, jobberHasConnection, jobberIsConfigured } from './lib/jobber-client.mjs';

function centralToday() {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: BOOKING_CONFIG.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${values.year}-${values.month}-${values.day}`;
}

function utcDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date ? null : value;
}

export function isBookableDate(date) {
  const value = utcDate(date);
  const today = utcDate(centralToday());
  if (!value || !today) return false;
  const difference = Math.round((value - today) / 86_400_000);
  return difference >= BOOKING_CONFIG.scheduling.minimumLeadDays
    && difference <= BOOKING_CONFIG.scheduling.bookingHorizonDays
    && BOOKING_CONFIG.scheduling.requestableWeekdays.includes(value.getUTCDay());
}

export function slotKey(date, window) {
  return `${date}/${window}`;
}

function offsetForChicagoDate(date) {
  // A 12:00 UTC reference is safely after the DST changeover in Central time.
  const reference = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BOOKING_CONFIG.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(reference).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const centralAsUtc = Date.UTC(parts.year, Number(parts.month) - 1, parts.day, parts.hour, parts.minute, parts.second);
  const minutes = Math.round((centralAsUtc - reference.valueOf()) / 60_000);
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function morningRange(date) {
  const offset = offsetForChicagoDate(date);
  return {
    startAt: `${date}T08:00:00${offset}`,
    endAt: `${date}T12:00:00${offset}`
  };
}

async function scheduledMornings(days) {
  if (!days.length) return new Set();
  const ranges = new Map(days.map((day) => [day, morningRange(day)]));
  const first = ranges.get(days[0]);
  const last = ranges.get(days[days.length - 1]);
  const data = await jobberGraphql(`
    query BookingSchedule($filter: ScheduledItemsFilterAttributes!) {
      scheduledItems(first: 100, filter: $filter) {
        nodes { id startAt endAt allDay }
        pageInfo { hasNextPage }
      }
    }
  `, {
    filter: {
      includeUnassigned: true,
      occursWithin: { startAt: first.startAt, endAt: last.endAt }
    }
  });
  const schedule = data.scheduledItems;
  if (schedule?.pageInfo?.hasNextPage) {
    // A partial calendar read must never be presented as a complete availability result.
    throw new Error('Too many scheduled items were returned to safely calculate availability.');
  }
  const occupied = new Set();
  for (const item of schedule?.nodes || []) {
    const itemStart = item.startAt ? new Date(item.startAt).valueOf() : NaN;
    const itemEnd = item.endAt ? new Date(item.endAt).valueOf() : NaN;
    if (!Number.isFinite(itemStart)) continue;
    for (const [date, range] of ranges) {
      const start = new Date(range.startAt).valueOf();
      const end = new Date(range.endAt).valueOf();
      if (itemStart < end && (!Number.isFinite(itemEnd) || itemEnd > start)) occupied.add(date);
    }
  }
  return occupied;
}

async function slotIsAvailable(date, window) {
  const record = await bookingStore('booking-holds').getWithMetadata(slotKey(date, window), { type: 'json', consistency: 'strong' });
  return !record?.data?.expiresAt || Number(record.data.expiresAt) <= Date.now();
}

export async function bookingCanAcceptRequests() {
  if (process.env.JOBBER_BOOKING_READY !== 'true') return false;
  if (!jobberIsConfigured()) return false;
  return jobberHasConnection();
}

export default async (request) => {
  if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
  try {
    if (!await bookingCanAcceptRequests()) {
      return json({
        ready: false,
        message: 'Online appointment requests are being prepared. Please use the custom quote form or call Tuff Bros.'
      });
    }
    const candidateDays = [];
    const start = utcDate(centralToday());
    for (let offset = BOOKING_CONFIG.scheduling.minimumLeadDays; offset <= BOOKING_CONFIG.scheduling.bookingHorizonDays; offset += 1) {
      const date = new Date(start.valueOf() + offset * 86_400_000);
      const dateString = date.toISOString().slice(0, 10);
      if (isBookableDate(dateString)) candidateDays.push(dateString);
    }
    const occupied = await scheduledMornings(candidateDays);
    const days = [];
    for (const dateString of candidateDays) {
      if (occupied.has(dateString)) continue;
      const availableWindows = [];
      for (const window of BOOKING_CONFIG.scheduling.windows) {
        if (await slotIsAvailable(dateString, window.id)) availableWindows.push(window);
      }
      if (availableWindows.length) days.push({ date: dateString, availableWindows });
    }
    return json({ ready: true, days });
  } catch (error) {
    console.error('booking-availability failed', error);
    return json({ ready: false, message: 'Online appointment requests are temporarily unavailable. Please use the custom quote form or call Tuff Bros.' }, 503);
  }
};

export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 300, windowLimit: 120 }
};
