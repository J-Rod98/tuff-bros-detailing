// Build Your Detail: prices and rules shared by the page and the tests.
// Keep these in step with the Pricing section on the homepage.

export const PHONE_DISPLAY = '(501) 500-4306';
export const PHONE_SMS = '+15015004306';

// Booking policy shown before sending. Keep in step with /terms/.
export const POLICY = {
  version: '2026-11-22',
  deposit: 25,
  cancelHours: 24,
  extraDirt: 50, // per extra 30 minutes
  petHair: 55
};

export const SIZES = [
  { id: 'car', label: 'Car', hint: 'Sedans, coupes and hatchbacks', examples: 'Camry, Civic, Accord, Mustang', img: '/book/img/size-car.webp' },
  { id: 'suv', label: 'SUV / Truck', hint: 'Crossovers, mid-size SUVs and standard pickups', examples: 'RAV4, CR-V, Explorer, F-150', img: '/book/img/size-suv.webp' },
  { id: 'xl', label: 'XL SUV / Minivan', hint: 'Full-size SUVs and minivans', examples: 'Tahoe, Suburban, Yukon, Odyssey', img: '/book/img/size-xl.webp' },
  { id: 'oversized', label: 'Oversized', hint: 'Vans, lifted or dually trucks', examples: 'Custom quote from photos', img: '/book/img/size-oversized.webp', custom: true }
];

export const SERVICES = [
  { id: 'full-detail', name: 'Full Detail', prices: { car: 300, suv: 350, xl: 400 }, popular: true, interior: true, exterior: true, stains: true,
    includes: ['Seats and upholstery cleaned and conditioned', 'Carpets and floor mats deep cleaned', 'Dash, console and door panels detailed and dressed', 'Cupholders, vents, seams and crevices', 'Interior glass, streak-free', 'Careful hand wash and dry', 'Spray wax for shine and protection', 'Wheels, tires and trim detailed and dressed'],
    blurb: 'Inside and out. Our most popular first visit.' },
  { id: 'deep-interior', name: 'Deep Interior Clean', prices: { car: 180, suv: 220, xl: 270 }, interior: true, stains: true,
    includes: ['Seats and upholstery cleaned and conditioned', 'Carpets and floor mats deep cleaned', 'Dash, console and door panels detailed and dressed', 'Cupholders, vents, seams and crevices', 'Interior glass, streak-free'],
    excludes: 'Exterior wash not included.',
    blurb: 'Seats, carpets, mats and every cabin surface.' },
  { id: 'wash-clay-seal', name: 'Wash, Clay & Seal', prices: { car: 199, suv: 249, xl: 299 }, exterior: true,
    includes: ['Hand wash', 'Wheels and tires', 'Iron decontamination as needed', 'Clay bar treatment', 'Paint sealant', 'Tire dressing', 'Exterior glass'],
    excludes: 'Exterior only. Polishing, paint correction and ceramic coating are separate.',
    blurb: 'Hand wash, clay and paint sealant for smooth, protected paint. Exterior only.' },
  { id: 'basic-in-out', name: 'Basic In & Out', prices: { car: 150, suv: 180, xl: 230 }, maintenance: true, interior: true, exterior: true,
    includes: ['Interior vacuum and wipe-down', 'Cupholders and interior glass', 'Hand wash, wheels and tires', 'Tire dressing and exterior glass', 'Spray wax'],
    excludes: 'No shampooing, extraction or stain treatment.',
    blurb: 'Maintenance wash, vacuum and wipe-down.' },
  { id: 'quick-interior', name: 'Quick Interior Clean', prices: { car: 80, suv: 100, xl: 150 }, maintenance: true, interior: true,
    includes: ['Vacuum', 'Wipe-down', 'Cupholders', 'Interior glass'],
    excludes: 'No shampooing, extraction or stain treatment. Heavy pet hair and sand are extra.',
    blurb: 'Vacuum, wipe-down, cupholders and glass.' },
  { id: 'basic-wash-wax', name: 'Basic Wash & Wax', prices: { car: 75, suv: 95, xl: 145 }, maintenance: true, exterior: true,
    includes: ['Hand wash', 'Wheels and tires', 'Tire dressing', 'Exterior glass', 'Spray wax'],
    excludes: 'Traditional paste wax is an extra.',
    blurb: 'Hand wash, wheels, tires and spray wax.' }
];

// price null means "priced after photos".
export const EXTRAS = [
  { id: 'pet-hair', label: 'Pet hair', price: 55, needs: 'interior', hint: 'Dog or cat hair in seats and carpet' },
  { id: 'sand', label: 'Heavy sand', price: 55, needs: 'interior', hint: 'Beach, ballfield or job-site sand' },
  { id: 'stains', label: 'Stains, strong odor or smoke', price: null, needs: 'stains', hint: 'Priced after we see photos' },
  { id: 'paste-wax', label: 'Traditional paste wax', price: 50, needs: 'exterior', hint: 'Extra gloss and protection' },
  { id: 'headlights', label: 'Headlight restoration', price: 75, needs: 'any', hint: 'Cloudy or yellow lenses made clear' }
];

export const LAST_CLEANED = [
  { id: 'recent', label: 'Within the last month' },
  { id: 'months', label: '1 to 6 months ago' },
  { id: 'long', label: 'Over 6 months, or never' }
];

export const CITIES = ['North Little Rock', 'Little Rock', 'Sherwood', 'Maumelle', 'Jacksonville', 'Conway', 'Cabot', 'Bryant', 'Benton'];

export const WINDOWS = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'flexible', label: 'Either works' }
];

export const FREQUENCIES = [
  { id: 'once', label: 'Just this once' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Every month' },
  { id: 'bimonthly', label: 'Every 2 months' }
];

// Tuff Club: Basic In & Out on a schedule, paid after each visit.
// Keep in step with /tuff-club/ and /terms/.
export const CLUB = {
  service: 'basic-in-out',
  minVisits: 3,
  schedules: [
    { id: 'biweekly', label: 'Every 2 weeks', prices: { car: 105, suv: 125, xl: 160 } },
    { id: 'monthly', label: 'Every month', prices: { car: 115, suv: 135, xl: 175 } },
    { id: 'bimonthly', label: 'Every 2 months', prices: { car: 130, suv: 155, xl: 195 } }
  ]
};

export const clubSchedule = (id) => CLUB.schedules.find((s) => s.id === id) || null;

// Club price per visit for a size, or null (oversized and one-time visits have none).
export function clubPrice(frequency, size) {
  const schedule = clubSchedule(frequency);
  const sizeInfo = getSize(size);
  if (!schedule || !sizeInfo || sizeInfo.custom) return null;
  return schedule.prices[sizeInfo.id];
}

export const getSize = (id) => SIZES.find((s) => s.id === id) || null;
export const getService = (id) => SERVICES.find((s) => s.id === id) || null;
export const getExtra = (id) => EXTRAS.find((e) => e.id === id) || null;

export function extraFits(extra, service) {
  if (!extra || !service) return false;
  if (extra.needs === 'any') return true;
  return !!service[extra.needs];
}

export function extrasFor(service) {
  return EXTRAS.filter((extra) => extraFits(extra, service));
}

// Returns {base, regular, club, extras:[{id,label,price}], total, custom, afterPhotos}.
// club: Basic In & Out on a Tuff Club schedule, so base is the club price.
// custom: the vehicle size has no set price. afterPhotos: something is priced after photos.
export function estimate({ size, service, extras = [], frequency = '' }) {
  const sizeInfo = getSize(size);
  const serviceInfo = getService(service);
  const chosen = extras.map(getExtra).filter((extra) => extraFits(extra, serviceInfo));
  const custom = !!(sizeInfo && sizeInfo.custom);
  const regular = serviceInfo && sizeInfo && !custom ? serviceInfo.prices[sizeInfo.id] : null;
  const club = serviceInfo && serviceInfo.id === CLUB.service ? clubPrice(frequency, size) : null;
  const base = club !== null ? club : regular;
  const lines = chosen.map((extra) => ({ id: extra.id, label: extra.label, price: extra.price }));
  const afterPhotos = lines.some((line) => line.price === null);
  const total = base === null ? null : base + lines.reduce((sum, line) => sum + (line.price || 0), 0);
  return { base, regular, club: club !== null, extras: lines, total, custom, afterPhotos };
}

export const money = (n) => '$' + Number(n).toLocaleString('en-US');

// Monday to Saturday, starting tomorrow.
export function requestDays(from = new Date(), count = 12) {
  const days = [];
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  while (days.length < count) {
    if (day.getDay() !== 0) days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }
  return days;
}

export function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function validPhone(value) {
  const text = String(value || '').trim();
  const digits = text.replace(/\D/g, '');
  return /^[-+0-9().\s]{7,30}$/.test(text) && digits.length >= 10 && digits.length <= 15 && !/^0/.test(digits);
}

const label = (list, id) => (list.find((item) => item.id === id) || {}).label || '';

// The payload for the existing Tuff OS quote queue (kind "quote").
export function buildRequest(state) {
  const size = getSize(state.size);
  const service = getService(state.service);
  const est = estimate(state);
  const price = est.custom ? 'custom quote (oversized)' : 'from ' + money(est.total) + (est.afterPhotos ? ' + items priced after photos' : '');
  const dayText = state.date ? new Date(state.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'not chosen';
  const extraText = est.extras.length
    ? est.extras.map((e) => e.label + (e.price === null ? ' (after photos)' : ' ' + money(e.price))).join(', ')
    : 'none';
  const lines = [
    'Online request from Build Your Detail. Needs confirmation by text.',
    'Service: ' + service.name + ' · ' + size.label + (service.maintenance ? ' (returning customer)' : ''),
    'Estimate shown: ' + price,
    'Extras: ' + extraText,
    'Last detailed: ' + (label(LAST_CLEANED, state.lastCleaned) || 'not answered'),
    'Requested: ' + dayText + ' · ' + label(WINDOWS, state.window),
    'How often: ' + (label(FREQUENCIES, state.frequency) || 'not answered') + (clubSchedule(state.frequency) ? ' (interested in Tuff Club)' : ''),
    est.club ? 'Tuff Club price applied: ' + money(est.base) + ' per visit (regular ' + money(est.regular) + '), ' + CLUB.minVisits + '-visit minimum accepted' : '',
    'Policy accepted: $' + POLICY.deposit + ' deposit after confirmation, ' + POLICY.cancelHours + '-hour cancellation, $' + POLICY.extraDirt + ' per extra 30 min for heavy dirt (v' + POLICY.version + ')',
    state.notes ? 'Notes: ' + state.notes : ''
  ].filter(Boolean);
  const has = (id) => est.extras.some((e) => e.id === id);
  return {
    kind: 'quote',
    name: state.name,
    phone: state.phone,
    email: state.email || '',
    city: state.city,
    serviceAddress: [state.street, state.city === 'Other' ? state.otherCity : state.city, 'AR', state.zip].filter(Boolean).join(', '),
    vehicle: (state.vehicle + ' · ' + size.label).slice(0, 150),
    service: (service.name + ' (' + size.label + ') · online request').slice(0, 200),
    condition: label(LAST_CLEANED, state.lastCleaned),
    petHair: has('pet-hair') ? 'Yes' : 'No',
    odor: has('stains') ? 'Yes' : 'No',
    ceramic: 'No',
    message: lines.join('\n').slice(0, 1800)
  };
}
