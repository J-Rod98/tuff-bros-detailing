import {
  BOOKING_CONFIG,
  BOOKING_STATUSES,
  evaluateReservation,
  getAddOn,
  getService,
  getStartingPrice,
  getVehicle,
  money
} from '/booking-config.js';

const STEP_TITLES = [
  'Choose Service',
  'Choose Vehicle',
  'Vehicle Information',
  'Vehicle Condition',
  'Photos',
  'Address',
  'Preferred Appointment',
  'Review Request'
];

const REQUIRED_PHOTO_IDS = BOOKING_CONFIG.requiredPhotoTypes.filter((photo) => photo.required).map((photo) => photo.id);
const app = document.getElementById('bookingApp');
const form = document.getElementById('bookingForm');
const stepEl = document.getElementById('bookingStep');
const actionsEl = document.getElementById('bookingActions');
const noticeEl = document.getElementById('bookingNotice');
const stepLabelEl = document.getElementById('bookingStepLabel');
const stepTitleEl = document.getElementById('bookingStepTitle');

const state = {
  step: 1,
  serviceId: '',
  addOnIds: [],
  vehicleId: '',
  customer: { firstName: '', lastName: '', phone: '', email: '' },
  vehicle: { year: '', make: '', model: '', color: '', notes: '' },
  conditions: Object.fromEntries(BOOKING_CONFIG.conditions.map((condition) => [condition.id, false])),
  photos: {},
  uploadedPhotos: [],
  address: { street: '', city: '', zip: '' },
  appointment: { date: '', window: '' },
  availability: null,
  csrfToken: '',
  started: false,
  completed: false,
  terms: { accepted: false, signature: '' },
  utms: readAttribution(),
  requestId: ''
};

function track(name, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}

function readAttribution() {
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  const query = new URLSearchParams(window.location.search);
  const data = {};
  keys.forEach((key) => {
    const value = query.get(key) || sessionStorage.getItem(`tuffbros_${key}`);
    if (value) {
      data[key] = value.slice(0, 250);
      sessionStorage.setItem(`tuffbros_${key}`, data[key]);
    }
  });
  return data;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
}

function showNotice(message, type = 'error') {
  noticeEl.hidden = false;
  noticeEl.textContent = message;
  noticeEl.classList.toggle('is-success', type === 'success');
}

function clearNotice() {
  noticeEl.hidden = true;
  noticeEl.textContent = '';
  noticeEl.classList.remove('is-success');
}

function routeEvaluation() {
  return evaluateReservation({
    serviceId: state.serviceId,
    vehicleId: state.vehicleId,
    conditions: state.conditions,
    city: state.address.city,
    photoCount: Object.keys(state.photos).length,
    addOnIds: state.addOnIds
  });
}

function rememberQuoteContext() {
  try {
    sessionStorage.setItem('tuffbros_booking_quote_context', JSON.stringify({
      customer: state.customer,
      vehicle: state.vehicle,
      conditions: state.conditions,
      address: state.address,
      serviceId: state.serviceId,
      attribution: state.utms
    }));
  } catch (_) {
    // Quote routing still works when browser storage is unavailable.
  }
}

function quoteUrl() {
  const query = new URLSearchParams(state.utms).toString();
  return query ? `/?${query}#quote` : '/#quote';
}

function updateProgress() {
  stepLabelEl.textContent = `Step ${state.step} of 8`;
  stepTitleEl.textContent = STEP_TITLES[state.step - 1];
  document.querySelectorAll('.booking-progress li').forEach((item, index) => {
    item.classList.toggle('is-current', index === state.step - 1);
    item.classList.toggle('is-complete', index < state.step - 1);
    if (index === state.step - 1) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
}

function selectedClass(id, value) {
  return id === value ? ' is-selected' : '';
}

function serviceCard(service) {
  const carPrice = money(service.prices.car);
  const largerPrice = money(service.prices.suv);
  const price = service.id === 'headlight-restoration'
    ? `Starts at ${carPrice}`
    : `Cars ${carPrice} · SUVs/Trucks ${largerPrice}`;
  const extras = service.exclusions
    ? `<p class="service-note"><strong>Not intended for:</strong> ${escapeHtml(service.exclusions.join(', '))}.</p>`
    : service.note ? `<p class="service-note">${escapeHtml(service.note)}</p>` : '';
  return `<button class="service-card${selectedClass(service.id, state.serviceId)}" type="button" data-service="${service.id}">
    <span class="choice-check" aria-hidden="true">✓</span>
    <h3>${escapeHtml(service.name)}</h3>
    <p class="service-price">${price}</p>
    <p class="service-duration">${escapeHtml(service.duration)}</p>
    <p>${escapeHtml(service.bestFor)}</p>
    <ul class="service-includes">${service.includes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    ${extras}
  </button>`;
}

function renderServiceStep() {
  const eligibleAddOns = state.serviceId && state.serviceId !== 'headlight-restoration'
    ? BOOKING_CONFIG.addOns.filter((addOn) => addOn.onlineEligible)
    : [];
  stepEl.innerHTML = `<h2>Choose a standard service</h2>
    <p>These maintenance-level services can be requested online. A final review protects you from an inaccurate quote or appointment.</p>
    <div class="service-grid">
      ${BOOKING_CONFIG.services.map(serviceCard).join('')}
      <div class="service-quote-card">
        <strong>Need a custom service?</strong>
        <p>Full details, ceramic coatings, paint work, odor treatment, RVs, boats, fleet work, and heavily soiled vehicles need a custom review.</p>
        <a href="${quoteUrl()}" class="btn btn-outline btn-sm" data-quote-route>Get a Custom Quote</a>
      </div>
    </div>
    ${eligibleAddOns.length ? `<section class="add-on-panel" aria-labelledby="add-on-heading">
      <div>
        <p class="booking-kicker">Optional request</p>
        <h3 id="add-on-heading">Optional extras</h3>
        <p>These are requests only. Tuff Bros reviews them before approval, and nothing is charged automatically. Headlight restoration requires photos.</p>
      </div>
      ${eligibleAddOns.map((addOn) => `<label class="add-on-option" for="addon-${addOn.id}">
        <input id="addon-${addOn.id}" data-add-on="${addOn.id}" type="checkbox"${state.addOnIds.includes(addOn.id) ? ' checked' : ''}>
        <span><strong>${escapeHtml(addOn.label)}</strong><small>${escapeHtml(addOn.note || `Request as an add-on · starts at ${money(addOn.price)}`)}</small></span>
      </label>`).join('')}
    </section>` : ''}`;
}

function vehicleSymbol(id) {
  return ({ car: '▰', suv: '▰', truck: '▰', oversized: '▰' }[id] || '▰');
}

function renderVehicleStep() {
  stepEl.innerHTML = `<h2>What are we working on?</h2>
    <p>Vehicle size sets a starting estimate. Vans and oversized vehicles are always reviewed as a pending quote.</p>
    <div class="vehicle-grid">
      ${BOOKING_CONFIG.vehicles.map((vehicle) => `<button class="vehicle-card${selectedClass(vehicle.id, state.vehicleId)}" type="button" data-vehicle="${vehicle.id}">
        <span class="choice-check" aria-hidden="true">✓</span>
        <span class="vehicle-icon" aria-hidden="true">${vehicleSymbol(vehicle.id)}</span>
        <strong>${escapeHtml(vehicle.label)}</strong>
        <small>${escapeHtml(vehicle.description)}</small>
      </button>`).join('')}
    </div>`;
}

function field(label, id, options = {}) {
  const { type = 'text', value = '', required = false, autocomplete = '', placeholder = '', full = false, note = '' } = options;
  const requirement = required ? ' <span class="field-required" aria-hidden="true">*</span>' : '';
  const attribute = required ? ' required' : '';
  const auto = autocomplete ? ` autocomplete="${autocomplete}"` : '';
  const place = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : '';
  return `<div class="booking-field${full ? ' full' : ''}">
    <label for="${id}">${label}${requirement}</label>
    <input id="${id}" name="${id}" type="${type}" value="${escapeHtml(value)}"${attribute}${auto}${place}>
    ${note ? `<p class="input-note">${note}</p>` : ''}
  </div>`;
}

function renderVehicleInfoStep() {
  stepEl.innerHTML = `<h2>Vehicle and contact details</h2>
    <p>We use this only to review your request and text you with final confirmation.</p>
    <div class="booking-fields">
      ${field('First name', 'firstName', { value: state.customer.firstName, required: true, autocomplete: 'given-name' })}
      ${field('Last name', 'lastName', { value: state.customer.lastName, required: true, autocomplete: 'family-name' })}
      ${field('Mobile number', 'phone', { type: 'tel', value: state.customer.phone, required: true, autocomplete: 'tel', placeholder: '(501) 500-4306' })}
      ${field('Email', 'email', { type: 'email', value: state.customer.email, autocomplete: 'email', note: 'Optional — a text is enough for your request.' })}
      ${field('Year', 'year', { value: state.vehicle.year, required: true, inputmode: 'numeric', placeholder: '2022' })}
      ${field('Make', 'make', { value: state.vehicle.make, required: true, placeholder: 'Ford' })}
      ${field('Model', 'model', { value: state.vehicle.model, required: true, placeholder: 'F-150' })}
      ${field('Color', 'color', { value: state.vehicle.color, required: true, placeholder: 'White' })}
      <div class="booking-field full">
        <label for="vehicleNotes">Notes <span class="input-note">(optional)</span></label>
        <textarea id="vehicleNotes" name="vehicleNotes" placeholder="Anything we should know about your vehicle or preferred service?">${escapeHtml(state.vehicle.notes)}</textarea>
      </div>
    </div>`;
}

function renderConditionStep() {
  stepEl.innerHTML = `<h2>Tell us about its current condition</h2>
    <p>If any item below applies, we’ll route you to a custom quote so Tuff Bros can review the vehicle before scheduling.</p>
    <div class="condition-list">
      ${BOOKING_CONFIG.conditions.map((condition) => `<fieldset class="condition-question">
        <legend>${escapeHtml(condition.label)}</legend>
        <div class="binary-control">
          <input type="radio" id="${condition.id}-no" name="${condition.id}" value="no"${!state.conditions[condition.id] ? ' checked' : ''}>
          <label for="${condition.id}-no">No</label>
          <input type="radio" id="${condition.id}-yes" name="${condition.id}" value="yes"${state.conditions[condition.id] ? ' checked' : ''}>
          <label for="${condition.id}-yes">Yes</label>
        </div>
      </fieldset>`).join('')}
    </div>`;
}

function photoInput(photo) {
  const file = state.photos[photo.id];
  const requirement = photo.required ? 'Required' : 'If applicable';
  const ready = file ? ' is-ready' : '';
  const stateText = file ? `Ready: ${escapeHtml(file.name)}` : `${requirement} · HEIC, JPG, PNG, or WebP`;
  return `<label class="photo-input${ready}" for="photo-${photo.id}">
    <input id="photo-${photo.id}" data-photo-id="${photo.id}" type="file" accept="image/heic,image/heif,image/jpeg,image/png,image/webp">
    <strong>${escapeHtml(photo.label)}${photo.required ? ' *' : ''}</strong>
    <span class="photo-state">${stateText}</span>
  </label>`;
}

function renderPhotosStep() {
  stepEl.innerHTML = `<h2>Upload a few clear photos</h2>
    <p>Photos keep the estimate honest and help us confirm the right appointment. We automatically reduce compatible image files before sending them.</p>
    <div class="photo-grid">${BOOKING_CONFIG.requiredPhotoTypes.map(photoInput).join('')}</div>
    <p class="upload-requirement">Front, rear, front seats, rear seats, and floor photos are required. Add problem-area photos whenever something needs extra attention.</p>`;
}

function renderAddressStep() {
  const cityOptions = BOOKING_CONFIG.serviceAreaCities.map((city) => `<option value="${escapeHtml(city)}"${state.address.city === city ? ' selected' : ''}>${escapeHtml(city)}</option>`).join('');
  stepEl.innerHTML = `<h2>Where should we come to you?</h2>
    <p>We’ll verify the service location before confirmation. Addresses outside our normal area are reviewed for travel before we promise availability.</p>
    <div class="booking-fields">
      ${field('Street address', 'street', { value: state.address.street, required: true, autocomplete: 'street-address', full: true, placeholder: '123 Main Street' })}
      <div class="booking-field">
        <label for="city">City <span class="field-required" aria-hidden="true">*</span></label>
        <select id="city" name="city" required autocomplete="address-level2">
          <option value="">Select city</option>${cityOptions}<option value="Other"${state.address.city === 'Other' ? ' selected' : ''}>Other / outside service area</option>
        </select>
      </div>
      ${field('ZIP code', 'zip', { value: state.address.zip, required: true, autocomplete: 'postal-code', inputmode: 'numeric', placeholder: '72201' })}
    </div>`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function renderAppointmentStep() {
  if (!state.availability) {
    stepEl.innerHTML = `<div class="availability-loading"><p>Checking preferred appointment windows…</p></div>`;
    loadAvailability();
    return;
  }
  if (!state.availability.ready) {
    stepEl.innerHTML = `<h2>Appointment requests are being prepared</h2>
      <p>${escapeHtml(state.availability.message || 'Please use the custom quote form while online reservations are being configured.')}</p>
      <a class="btn btn-primary" href="${quoteUrl()}" data-quote-route>Get a Custom Quote</a>`;
    actionsEl.innerHTML = backButton();
    return;
  }
  stepEl.innerHTML = `<h2>Choose a preferred arrival window</h2>
    <p>Online requests are available Monday–Saturday mornings only. This is a preference, not a confirmed appointment — Tuff Bros will review the vehicle, location, and schedule first.</p>
    <div class="date-grid">
      ${state.availability.days.map((day) => `<button type="button" class="date-card${selectedClass(day.date, state.appointment.date)}" data-date="${day.date}">
        <strong>${escapeHtml(formatDate(day.date))}</strong><span>${day.availableWindows.length} morning preference available</span>
      </button>`).join('')}
    </div>
    ${state.appointment.date ? `<div class="window-grid">${availableWindowsForDate().map((window) => `<button type="button" class="window-card${selectedClass(window.id, state.appointment.window)}" data-window="${window.id}">
      <strong>${escapeHtml(window.label)}</strong><span>${escapeHtml(window.detail)}</span>
    </button>`).join('')}</div>` : '<p class="field-help">Select a date to see its preferred arrival windows.</p>'}`;
}

function renderReviewStep() {
  const service = getService(state.serviceId);
  const vehicle = getVehicle(state.vehicleId);
  const evaluation = routeEvaluation();
  const conditionLabels = BOOKING_CONFIG.conditions
    .filter((condition) => state.conditions[condition.id])
    .map((condition) => condition.label.replace('?', ''));
  const price = getStartingPrice(state.serviceId, state.vehicleId);
  const selectedAddOns = state.addOnIds.map(getAddOn).filter(Boolean);
  const city = state.address.city === 'Other' ? 'Outside normal service area' : state.address.city;
  const reviewStatus = evaluation.initialStatus;
  stepEl.innerHTML = `<h2>Review your request</h2>
    <p>Check your details, then send your request. Your appointment is not officially booked until Tuff Bros confirms it.</p>
    <div class="review-panel">
      <div class="review-row"><h3>Service</h3><p>${escapeHtml(service.name)} · ${escapeHtml(vehicle.label)}</p><p>${escapeHtml(service.duration)}</p></div>
      <div class="review-row"><h3>Vehicle</h3><p>${escapeHtml([state.vehicle.year, state.vehicle.make, state.vehicle.model, state.vehicle.color].filter(Boolean).join(' '))}</p>${state.vehicle.notes ? `<p>${escapeHtml(state.vehicle.notes)}</p>` : ''}</div>
      <div class="review-row"><h3>Contact</h3><p>${escapeHtml(`${state.customer.firstName} ${state.customer.lastName}`)} · ${escapeHtml(state.customer.phone)}${state.customer.email ? ` · ${escapeHtml(state.customer.email)}` : ''}</p></div>
      <div class="review-row"><h3>Location</h3><p>${escapeHtml(state.address.street)}, ${escapeHtml(city)}, ${escapeHtml(state.address.zip)}</p></div>
      <div class="review-row"><h3>Preferred appointment</h3><p>${escapeHtml(formatDate(state.appointment.date))} · ${escapeHtml((BOOKING_CONFIG.scheduling.windows.find((window) => window.id === state.appointment.window) || {}).label || '')} arrival window</p></div>
      <div class="review-row"><h3>Photos</h3><p>${Object.keys(state.photos).length} photo${Object.keys(state.photos).length === 1 ? '' : 's'} ready for review.</p></div>
      <div class="review-row"><h3>Estimated starting price</h3><p class="review-price">${price ? `From ${money(price)}` : 'Custom review required'}</p><p>Condition, travel, and add-ons are never charged automatically.</p></div>
      ${selectedAddOns.length ? `<div class="review-row"><h3>Requested add-on</h3><p>${selectedAddOns.map((addOn) => `${escapeHtml(addOn.label)} — starts at ${money(addOn.price)}`).join('<br>')}</p><p>Requested only. Tuff Bros will review photos before approving or charging this add-on.</p></div>` : ''}
      ${conditionLabels.length ? `<div class="review-row"><h3>Review notes</h3><p>${escapeHtml(conditionLabels.join(', '))}. This request needs a custom review.</p></div>` : ''}
      <section class="terms-panel" aria-labelledby="reservation-terms-heading">
        <h3 id="reservation-terms-heading">Reservation terms</h3>
        <p>After Tuff Bros approves this request, we’ll send a secure Jobber link for the ${money(BOOKING_CONFIG.reservation.depositAmount)} deposit. The deposit is applied to the final balance. Your card details are entered and stored securely in Jobber — never on this website.</p>
        <label class="terms-check" for="termsAccepted"><input id="termsAccepted" type="checkbox"${state.terms.accepted ? ' checked' : ''}> <span>I agree to the <a href="/terms/" target="_blank" rel="noopener">Tuff Bros Booking Terms</a>, including the ${money(BOOKING_CONFIG.reservation.depositAmount)} deposit and cancellation policy.</span></label>
        <div class="booking-field signature-field"><label for="termsSignature">Type your full legal name to sign <span class="field-required" aria-hidden="true">*</span></label><input id="termsSignature" value="${escapeHtml(state.terms.signature)}" autocomplete="name" placeholder="Your full legal name"></div>
      </section>
      <div class="review-policy"><strong>Status after submission: ${escapeHtml(reviewStatus)}.</strong> We’ll review your vehicle details, requested time, uploaded photos, and location. If approved, we’ll send the secure Jobber deposit link. Your appointment is not officially booked until confirmed by Tuff Bros.</div>
    </div>`;
}

function renderConfirmation() {
  stepLabelEl.textContent = 'Request received';
  stepTitleEl.textContent = 'Pending Review';
  document.querySelectorAll('.booking-progress li').forEach((item) => item.classList.add('is-complete'));
  stepEl.innerHTML = `<div class="booking-confirmation">
    <div class="confirmation-mark" aria-hidden="true">✓</div>
    <h2>Thanks — we’ve received your appointment request.</h2>
    <p>We’ll review your vehicle details, requested time, uploaded photos, and location. If approved, we’ll text you a secure Jobber link to pay the ${money(BOOKING_CONFIG.reservation.depositAmount)} deposit and securely save your card on file.</p>
    <p><strong>Your appointment is not officially booked until confirmed by Tuff Bros.</strong></p>
    ${state.requestId ? `<p class="request-number">Request ${escapeHtml(state.requestId)}</p>` : ''}
    <a href="/" class="btn btn-outline">Back to home</a>
  </div>`;
  actionsEl.innerHTML = '';
}

function backButton() {
  return state.step > 1 ? '<button type="button" class="btn btn-ghost booking-back" data-action="back">Back</button>' : '';
}

function renderActions() {
  if (state.completed) return;
  const nextLabel = state.step === 8 ? 'Request My Appointment' : 'Continue';
  actionsEl.innerHTML = `${backButton()}<span class="action-spacer"></span>${state.step > 1 ? `<a class="booking-quote-link" href="${quoteUrl()}" data-quote-route>Need a custom quote?</a>` : ''}<button type="button" class="btn btn-primary ${state.step === 8 ? 'booking-submit' : 'booking-next'}" data-action="next">${nextLabel}</button>`;
}

function render() {
  clearNotice();
  updateProgress();
  if (state.step === 1) renderServiceStep();
  if (state.step === 2) renderVehicleStep();
  if (state.step === 3) renderVehicleInfoStep();
  if (state.step === 4) renderConditionStep();
  if (state.step === 5) renderPhotosStep();
  if (state.step === 6) renderAddressStep();
  if (state.step === 7) renderAppointmentStep();
  if (state.step === 8) renderReviewStep();
  renderActions();
}

function collectStepValues() {
  if (state.step === 3) {
    state.customer = {
      firstName: valueOf('firstName'), lastName: valueOf('lastName'), phone: valueOf('phone'), email: valueOf('email')
    };
    state.vehicle = {
      year: valueOf('year'), make: valueOf('make'), model: valueOf('model'), color: valueOf('color'), notes: valueOf('vehicleNotes')
    };
  }
  if (state.step === 4) {
    BOOKING_CONFIG.conditions.forEach((condition) => {
      state.conditions[condition.id] = document.querySelector(`input[name="${condition.id}"]:checked`)?.value === 'yes';
    });
  }
  if (state.step === 6) {
    state.address = { street: valueOf('street'), city: valueOf('city'), zip: valueOf('zip') };
  }
  if (state.step === 8) {
    state.terms = { accepted: document.getElementById('termsAccepted')?.checked === true, signature: valueOf('termsSignature') };
  }
}

function valueOf(id) {
  return String(document.getElementById(id)?.value || '').trim();
}

function isStepValid() {
  if (state.step === 1 && !state.serviceId) return 'Choose a standard service to continue.';
  if (state.step === 2 && !state.vehicleId) return 'Choose your vehicle type to continue.';
  if (state.step === 3) {
    const required = ['firstName', 'lastName', 'phone', 'year', 'make', 'model', 'color'];
    const blank = required.find((id) => !valueOf(id));
    if (blank) return 'Please complete the required contact and vehicle details.';
    if (!/^[0-9+().\-\s]{7,}$/.test(valueOf('phone'))) return 'Enter a valid mobile number.';
    if (valueOf('email') && !/^\S+@\S+\.\S+$/.test(valueOf('email'))) return 'Enter a valid email or leave it blank.';
  }
  if (state.step === 5) {
    const missing = REQUIRED_PHOTO_IDS.filter((id) => !state.photos[id]);
    if (missing.length) return 'Add the required vehicle photos before continuing.';
    const hasCondition = Object.values(state.conditions).some(Boolean);
    if (hasCondition && !state.photos.problemAreas) return 'Add a problem-area photo so we can review the reported condition.';
  }
  if (state.step === 6) {
    if (!valueOf('street') || !valueOf('city') || !valueOf('zip')) return 'Please enter the full service address.';
    if (!/^\d{5}(?:-\d{4})?$/.test(valueOf('zip'))) return 'Enter a valid ZIP code.';
  }
  if (state.step === 7 && (!state.appointment.date || !state.appointment.window)) return 'Choose both a preferred date and arrival window.';
  if (state.step === 8) {
    if (!state.terms.accepted) return 'Please agree to the Tuff Bros Booking Terms before sending your request.';
    if (state.terms.signature.trim().split(/\s+/).length < 2) return 'Type your full legal name to sign the Booking Terms.';
  }
  return '';
}

function shouldRouteToQuote() {
  const evaluation = routeEvaluation();
  return evaluation.route === 'quote_request';
}

function renderQuoteRedirect() {
  rememberQuoteContext();
  track('quote_redirected', { reason: state.vehicleId === 'oversized' ? 'oversized_vehicle' : 'condition_flagged' });
  stepEl.innerHTML = `<div class="booking-confirmation">
    <div class="confirmation-mark" aria-hidden="true">→</div>
    <h2>This vehicle needs a custom quote.</h2>
    <p>Tuff Bros will need to review the vehicle’s condition or size before offering a price or appointment. We’ve kept your details ready for the quote form.</p>
    <a href="${quoteUrl()}" class="btn btn-primary" data-quote-route>Get My Custom Quote</a>
  </div>`;
  actionsEl.innerHTML = '<button type="button" class="btn btn-ghost booking-back" data-action="back">Back</button>';
}

function availableWindowsForDate() {
  const day = state.availability?.days.find((item) => item.date === state.appointment.date);
  return day?.availableWindows || [];
}

function getClientDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previewAvailability() {
  const days = [];
  const today = new Date();
  for (let offset = BOOKING_CONFIG.scheduling.minimumLeadDays; days.length < 9 && offset <= BOOKING_CONFIG.scheduling.bookingHorizonDays; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    if (!BOOKING_CONFIG.scheduling.requestableWeekdays.includes(date.getDay())) continue;
    days.push({ date: getClientDateString(date), availableWindows: BOOKING_CONFIG.scheduling.windows });
  }
  return { ready: true, preview: true, days };
}

async function loadAvailability() {
  try {
    const response = await fetch('/.netlify/functions/booking-availability', { credentials: 'same-origin' });
    const data = await response.json();
    state.availability = response.ok ? data : { ready: false, message: data.message };
  } catch (_) {
    // Static localhost preview has no Functions runtime; production fails closed.
    state.availability = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? previewAvailability()
      : { ready: false, message: 'Online reservations are being prepared. Please use the custom quote form or call Tuff Bros.' };
  }
  render();
}

async function establishSession() {
  try {
    const response = await fetch('/.netlify/functions/booking-session', { credentials: 'same-origin' });
    const data = await response.json();
    if (response.ok && data.csrfToken) state.csrfToken = data.csrfToken;
  } catch (_) {
    // The server will refuse writes until a real Netlify Function session exists.
  }
}

async function compressImage(file) {
  const heic = /image\/(heic|heif)/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (heic || file.size <= 1_600_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .82));
    if (!compressed) return file;
    return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() });
  } catch (_) {
    return file;
  }
}

async function uploadPhotos() {
  if (state.uploadedPhotos.length) return state.uploadedPhotos;
  if (!state.csrfToken) throw new Error('Booking uploads are unavailable until the secure reservation service is connected.');
  const uploaded = [];
  for (const [photoType, file] of Object.entries(state.photos)) {
    const prepared = await compressImage(file);
    if (prepared.size > 4_250_000) throw new Error(`${file.name} is too large after compression. Please choose a smaller photo.`);
    const body = new FormData();
    body.append('file', prepared);
    body.append('photoType', photoType);
    const response = await fetch('/.netlify/functions/booking-upload', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-Booking-CSRF': state.csrfToken }, body
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'A photo could not be uploaded.');
    uploaded.push({ id: data.id, photoType });
  }
  state.uploadedPhotos = uploaded;
  track('photos_uploaded', { count: uploaded.length });
  return uploaded;
}

async function submitRequest(button) {
  const error = isStepValid();
  if (error) return showNotice(error);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Sending request…';
  clearNotice();
  try {
    const photos = await uploadPhotos();
    const payload = {
      serviceId: state.serviceId,
      vehicleId: state.vehicleId,
      addOnIds: state.addOnIds,
      customer: state.customer,
      vehicle: state.vehicle,
      conditions: state.conditions,
      address: state.address,
      appointment: state.appointment,
      photos,
      terms: { ...state.terms, version: BOOKING_CONFIG.reservation.termsVersion },
      attribution: state.utms
    };
    const response = await fetch('/.netlify/functions/booking-request', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Booking-CSRF': state.csrfToken }, body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'We could not send your appointment request.');
    state.completed = true;
    state.requestId = data.requestId || '';
    track('appointment_requested', { route: data.route || 'appointment_request', status: data.status || BOOKING_STATUSES.PENDING_REVIEW });
    track('booking_completed', { route: data.route || 'appointment_request' });
    renderConfirmation();
  } catch (error) {
    showNotice(error.message || 'Something went wrong. Please call or text Tuff Bros at (501) 500-4306.');
    button.disabled = false;
    button.textContent = original;
  }
}

function move(direction) {
  collectStepValues();
  if (direction > 0) {
    const error = isStepValid();
    if (error) return showNotice(error);
    if (state.step === 2 && shouldRouteToQuote()) return renderQuoteRedirect();
    if (state.step === 4 && shouldRouteToQuote()) return renderQuoteRedirect();
    if (state.step === 8) return submitRequest(actionsEl.querySelector('[data-action="next"]'));
    state.step += 1;
  } else {
    state.step = Math.max(1, state.step - 1);
  }
  render();
  app.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('click', (event) => {
  const serviceButton = event.target.closest('[data-service]');
  const vehicleButton = event.target.closest('[data-vehicle]');
  const dateButton = event.target.closest('[data-date]');
  const windowButton = event.target.closest('[data-window]');
  const actionButton = event.target.closest('[data-action]');
  const quoteLink = event.target.closest('[data-quote-route]');
  if (serviceButton) {
    state.serviceId = serviceButton.dataset.service;
    if (state.serviceId === 'headlight-restoration') state.addOnIds = [];
    if (!state.started) { state.started = true; track('booking_started'); }
    track('service_selected', { service_id: state.serviceId });
    render();
  }
  if (vehicleButton) {
    state.vehicleId = vehicleButton.dataset.vehicle;
    track('vehicle_selected', { vehicle_class: state.vehicleId });
    render();
  }
  if (dateButton) {
    state.appointment.date = dateButton.dataset.date;
    state.appointment.window = '';
    render();
  }
  if (windowButton) {
    state.appointment.window = windowButton.dataset.window;
    render();
  }
  if (actionButton) move(actionButton.dataset.action === 'back' ? -1 : 1);
  if (quoteLink) {
    rememberQuoteContext();
    track('quote_redirected', { location: 'booking_flow' });
  }
});

form.addEventListener('change', (event) => {
  const input = event.target;
  if (input.matches('[data-photo-id]') && input.files?.[0]) {
    const file = input.files[0];
    const isAllowed = /image\/(heic|heif|jpeg|png|webp)/i.test(file.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(file.name);
    if (!isAllowed) return showNotice('Use a HEIC, JPG, PNG, or WebP image file.');
    state.photos[input.dataset.photoId] = file;
    render();
  }
  if (input.matches('[data-add-on]')) {
    const addOnId = input.dataset.addOn;
    state.addOnIds = input.checked
      ? [...new Set([...state.addOnIds, addOnId])]
      : state.addOnIds.filter((id) => id !== addOnId);
    render();
  }
  if (input.matches('input[type="radio"]') && BOOKING_CONFIG.conditions.some((condition) => condition.id === input.name)) {
    state.conditions[input.name] = input.value === 'yes';
    if (input.value === 'yes') track('condition_flagged', { condition: input.name });
  }
});

document.addEventListener('click', (event) => {
  const callLink = event.target.closest('[data-analytics-event="call_click"]');
  if (callLink) track('call_click', { link_location: callLink.dataset.analyticsLocation || 'booking' });
});

window.addEventListener('pagehide', () => {
  if (state.started && !state.completed) track('booking_abandoned', { last_step: state.step });
});

establishSession();
render();
