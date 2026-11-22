// Build Your Detail: a step-by-step request that lands in the Tuff OS quote queue.
// Nothing here books a confirmed time or takes payment; Tuff Bros confirms by text.
import {
  SIZES, SERVICES, EXTRAS, LAST_CLEANED, CITIES, WINDOWS, FREQUENCIES, PHONE_SMS, PHONE_DISPLAY, POLICY,
  getSize, getService, extraFits, estimate, money, requestDays, isoDate, validPhone, buildRequest
} from './pricing.js';

const ENDPOINT = '/.netlify/functions/os-event';
const STEPS = 5;
const $ = (sel, root = document) => root.querySelector(sel);
const form = $('#byd');
const state = { size: '', service: '', extras: [], lastCleaned: '', city: '', otherCity: '', street: '', zip: '', date: '', window: '', returning: false, agree: false, frequency: '', name: '', phone: '', email: '', vehicle: '', notes: '' };
let step = 1;
let sending = false;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  children.flat().forEach((child) => child !== null && child !== undefined && node.append(child));
  return node;
}

function track(name, params) {
  try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (_) { /* optional */ }
}

// ---------- Rendering ----------
function renderSizes() {
  const box = $('#bydSizes');
  box.replaceChildren(...SIZES.map((size) => el('label', { class: 'byd-size' },
    el('input', { type: 'radio', name: 'size', value: size.id, class: 'byd-radio', checked: state.size === size.id }),
    el('span', { class: 'byd-size-card' },
      el('img', { src: size.img, alt: '', width: 480, height: 360, loading: 'eager', decoding: 'async' }),
      el('span', { class: 'byd-size-text' },
        el('strong', { text: size.label }),
        el('span', { class: 'byd-size-hint', text: size.hint }),
        el('span', { class: 'byd-size-eg', text: size.examples }))))));
}

function priceText(service) {
  const size = getSize(state.size);
  if (!size) return 'from ' + money(service.prices.car);
  if (size.custom) return 'Custom quote';
  return money(service.prices[size.id]);
}

function renderServices() {
  const box = $('#bydServices');
  const list = SERVICES.filter((s) => !s.maintenance || state.returning);
  box.replaceChildren(...list.map((service) => el('label', { class: 'byd-option' + (service.maintenance ? ' is-maint' : '') },
    el('input', { type: 'radio', name: 'service', value: service.id, class: 'byd-radio', checked: state.service === service.id }),
    el('span', { class: 'byd-option-card' },
      el('span', { class: 'byd-option-head' },
        el('strong', { text: service.name }),
        el('span', { class: 'byd-price', text: priceText(service) })),
      el('span', { class: 'byd-option-body', text: service.blurb }),
      service.popular ? el('span', { class: 'byd-tag', text: 'Most popular' }) : null,
      service.maintenance ? el('span', { class: 'byd-tag byd-tag-muted', text: 'Returning customers' }) : null,
      el('span', { class: 'byd-includes' },
        el('span', { class: 'byd-includes-title', text: 'What\u2019s included' }),
        el('span', { class: 'byd-includes-list' }, ...service.includes.map((item) => el('span', { text: item }))),
        service.excludes ? el('span', { class: 'byd-includes-note', text: service.excludes }) : null),
      ))));
  $('#bydMaintNote').hidden = state.returning;
}

function renderExtras() {
  const service = getService(state.service);
  const list = EXTRAS.filter((extra) => extraFits(extra, service));
  $('#bydExtras').replaceChildren(...list.map((extra) => el('label', { class: 'byd-option byd-extra' },
    el('input', { type: 'checkbox', name: 'extras', value: extra.id, class: 'byd-radio', checked: state.extras.includes(extra.id) }),
    el('span', { class: 'byd-option-card' },
      el('span', { class: 'byd-option-head' },
        el('strong', { text: extra.label }),
        el('span', { class: 'byd-price', text: extra.price === null ? 'After photos' : '+' + money(extra.price) })),
      el('span', { class: 'byd-option-body', text: extra.hint })))));
  $('#bydLast').replaceChildren(...chips('lastCleaned', LAST_CLEANED));
}

function chips(name, list) {
  return list.map((item) => el('label', { class: 'byd-chip' },
    el('input', { type: 'radio', name, value: item.id, class: 'byd-radio', checked: state[name] === item.id }),
    el('span', { text: item.label })));
}

function renderWhen() {
  const city = $('#bydCity');
  if (city.options.length < 2) {
    CITIES.forEach((name) => city.append(el('option', { value: name, text: name })));
    city.append(el('option', { value: 'Other', text: 'Somewhere else' }));
  }
  $('#bydDays').replaceChildren(...requestDays().map((day) => {
    const value = isoDate(day);
    return el('label', { class: 'byd-day' },
      el('input', { type: 'radio', name: 'date', value, class: 'byd-radio', checked: state.date === value }),
      el('span', {},
        el('small', { text: day.toLocaleDateString('en-US', { weekday: 'short' }) }),
        el('strong', { text: String(day.getDate()) }),
        el('small', { text: day.toLocaleDateString('en-US', { month: 'short' }) })));
  }));
  $('#bydWindows').replaceChildren(...chips('window', WINDOWS));
}

function renderYou() {
  $('#bydFreq').replaceChildren(...chips('frequency', FREQUENCIES));
  const service = getService(state.service);
  $('#bydIncluded').replaceChildren(
    el('h3', { text: 'What\u2019s included in your ' + (service ? service.name : 'service') }),
    el('ul', {}, ...(service ? service.includes : []).map((item) => el('li', { text: item }))),
    service && service.excludes ? el('p', { class: 'byd-help', text: service.excludes }) : null);
}

function renderPolicy() {
  const money0 = (n) => '$' + n;
  $('#bydPolicyList').replaceChildren(
    el('li', {}, el('strong', { text: 'Starting prices. ' }), 'Prices are for a vehicle in normal, everyday condition. We look it over when we arrive. Heavy dirt, mud or buildup is ' + money0(POLICY.extraDirt) + ' per extra 30 minutes, and we go over any change with you before we start.'),
    el('li', {}, el('strong', { text: 'Pet hair and sand. ' }), 'If your vehicle has them, add them as extras so we plan enough time.'),
    el('li', {}, el('strong', { text: money0(POLICY.deposit) + ' deposit. ' }), 'Once we confirm your time, we text you a link to pay a ' + money0(POLICY.deposit) + ' deposit to hold it. It comes off your total, and the rest is due after the service is complete.'),
    el('li', {}, el('strong', { text: 'Cancelling or rescheduling. ' }), 'Give us at least ' + POLICY.cancelHours + ' hours\u2019 notice and your deposit is refunded or moved to your new day. With less notice, the deposit is kept. If we reschedule for weather, your deposit moves with you.'),
    el('li', {}, el('strong', { text: 'Missed a spot? ' }), 'Tell us within 24 hours and we come back and clean it, free.'));
}

function summaryRows() {
  const size = getSize(state.size);
  const service = getService(state.service);
  const est = estimate(state);
  const rows = [];
  if (size) rows.push(['Vehicle', size.label, '']);
  if (service) rows.push(['Service', service.name, est.custom ? 'Quote' : est.base !== null ? money(est.base) : '']);
  est.extras.forEach((extra) => rows.push(['Extra', extra.label, extra.price === null ? 'Photos' : '+' + money(extra.price)]));
  if (state.date) rows.push(['Requested', new Date(state.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (state.window ? ' · ' + WINDOWS.find((w) => w.id === state.window).label : ''), '']);
  return { rows, est };
}

function totalText(est) {
  if (!state.size) return 'Pick a vehicle';
  if (est.custom) return 'Custom quote';
  if (!state.service) return 'Pick a service';
  return money(est.total) + (est.afterPhotos ? '+' : '');
}

function renderSummary() {
  const { rows, est } = summaryRows();
  const list = $('#bydSummary');
  list.replaceChildren(...(rows.length ? rows.map(([term, value, price]) => el('div', { class: 'byd-sum-row' },
    el('dt', { text: term }), el('dd', {}, el('span', { text: value }), price ? el('b', { text: price }) : null)))
    : [el('p', { class: 'byd-sum-empty', text: 'Your choices show up here, with the price.' })]));
  const text = totalText(est);
  $('#bydTotal').textContent = text;
  $('#bydTotal').classList.toggle('is-empty', !state.service && !est.custom);
  $('#bydBarTotal').textContent = text;
  $('#bydTotalLabel').textContent = est.custom ? 'Price' : 'Starting price';
  $('#bydPhotoNote').hidden = !est.afterPhotos && !est.custom;
  const review = $('#bydReview');
  if (review) review.replaceChildren(...rows.map(([term, value, price]) => el('li', {}, el('span', { text: term + ': ' + value }), price ? el('b', { text: price }) : null)),
    el('li', { class: 'byd-review-total' }, el('span', { text: est.custom ? 'Price' : 'Starting price' }), el('b', { text: text })));
}

// ---------- Steps ----------
function showStep(next, focus = true) {
  step = Math.max(1, Math.min(STEPS, next));
  form.querySelectorAll('.byd-step').forEach((fs) => { fs.hidden = Number(fs.dataset.step) !== step; });
  form.querySelectorAll('.byd-progress li').forEach((li) => {
    const n = Number(li.dataset.for);
    li.classList.toggle('is-current', n === step);
    li.classList.toggle('is-done', n < step);
    const button = li.querySelector('button');
    button.disabled = n > step;
    if (n === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  $('#bydBack').hidden = step === 1;
  const nextLabel = step === STEPS ? 'Send My Request' : 'Next';
  $('#bydNext').textContent = nextLabel;
  $('#bydBarNext').textContent = step === STEPS ? 'Send' : 'Next';
  if (step === 3) renderExtras();
  if (step === 4) renderWhen();
  if (step === 5) renderYou();
  renderSummary();
  hideError();
  if (focus) {
    const top = $('#bydTop');
    top.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const legend = form.querySelector(`.byd-step[data-step="${step}"] legend`);
    if (legend) { legend.tabIndex = -1; legend.focus({ preventScroll: true }); }
  }
  track('byd_step', { step });
}

function problem(n) {
  if (n === 1 && !state.size) return 'Pick the size that matches your vehicle.';
  if (n === 2 && !state.service) return 'Pick a service.';
  if (n === 4) {
    if (!state.city) return 'Choose your city.';
    if (state.city === 'Other' && !state.otherCity.trim()) return 'Tell us your town.';
    if (!state.street.trim()) return 'Enter the address where the vehicle will be.';
    if (!state.date) return 'Pick a preferred day.';
    if (!state.window) return 'Pick a time of day.';
  }
  if (n === 5) {
    if (!state.name.trim()) return 'Enter your name.';
    if (!validPhone(state.phone)) return 'Enter a mobile number we can text.';
    if (state.email && !/^\S+@\S+\.\S+$/.test(state.email)) return 'Check your email, or leave it blank.';
    if (!state.vehicle.trim()) return 'Enter the year, make and model.';
    if (!state.agree) return 'Please read Before you book and tick the box.';
  }
  return '';
}

function showError(message) {
  const box = $('#bydError');
  box.textContent = message;
  box.hidden = false;
}
function hideError() { $('#bydError').hidden = true; }

function next() {
  const issue = problem(step);
  if (issue) { showError(issue); return; }
  if (step === STEPS) { submit(); return; }
  showStep(step + 1);
}

// ---------- Sending ----------
function requestId() {
  let id = '';
  try { id = sessionStorage.getItem('tuff_byd_id') || ''; } catch (_) { /* private mode */ }
  if (!id) {
    id = crypto.randomUUID();
    try { sessionStorage.setItem('tuff_byd_id', id); } catch (_) { /* private mode */ }
  }
  return id;
}

async function submit() {
  if (sending) return;
  sending = true;
  const buttons = [$('#bydNext'), $('#bydBarNext')];
  buttons.forEach((b) => { b.disabled = true; b.textContent = 'Sending…'; });
  const id = requestId();
  const body = Object.assign({ id, path: location.pathname, _gotcha: form.elements._gotcha.value },
    buildRequest(state), window.TuffAttribution ? window.TuffAttribution.read() : {});
  let response = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok || response.status < 500) break;
    } catch (_) { response = null; }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  if (response && response.ok) {
    try { sessionStorage.removeItem('tuff_byd_id'); } catch (_) { /* private mode */ }
    done(id);
    track('generate_lead', { form_id: 'build_your_detail' });
    try { if (typeof window.fbq === 'function') window.fbq('track', 'Lead'); } catch (_) { /* optional */ }
    return;
  }
  let message = 'We couldn’t send that. Please try again, or call or text ' + PHONE_DISPLAY + '.';
  try { const data = response && await response.json(); if (data && data.error && response.status < 500 && response.status !== 429) message = data.error; } catch (_) { /* keep default */ }
  showError(message);
  sending = false;
  buttons.forEach((b) => { b.disabled = false; });
  showStep(STEPS, false);
}

function done(id) {
  const code = 'TB-' + id.slice(0, 6).toUpperCase();
  const size = getSize(state.size);
  const service = getService(state.service);
  const smsBody = `Hi! Photos for my online request ${code}: ${service.name}, ${size.label}.`;
  $('#bydCode').textContent = code;
  $('#bydFirst').textContent = state.name.trim().split(/\s+/)[0];
  $('#bydSms').href = 'sms:' + PHONE_SMS + '?&body=' + encodeURIComponent(smsBody);
  $('#bydDoneSummary').replaceChildren(...summaryRows().rows.map(([term, value, price]) => el('li', {}, el('span', { text: term + ': ' + value }), price ? el('b', { text: price }) : null)));
  $('#bydDoneTotal').textContent = totalText(estimate(state));
  $('#bydApp').hidden = true;
  $('#bydBar').hidden = true;
  const panel = $('#bydDone');
  panel.hidden = false;
  panel.scrollIntoView({ block: 'start' });
  panel.focus({ preventScroll: true });
}

// ---------- Events ----------
form.addEventListener('change', (event) => {
  const t = event.target;
  hideError();
  if (t.name === 'size') {
    state.size = t.value;
    renderServices();
    renderSummary();
    setTimeout(() => { if (step === 1 && !problem(1)) showStep(2); }, 260);
    return;
  }
  if (t.id === 'bydAgree') { state.agree = t.checked; return; }
  if (t.id === 'bydReturning') {
    state.returning = t.checked;
    const svc = getService(state.service);
    if (svc && svc.maintenance && !state.returning) state.service = '';
    renderServices();
    renderSummary();
    return;
  }
  if (t.name === 'service') {
    state.service = t.value;
    const service = getService(state.service);
    state.extras = state.extras.filter((id) => extraFits(EXTRAS.find((e) => e.id === id), service));
  } else if (t.name === 'extras') {
    state.extras = [...form.querySelectorAll('input[name="extras"]:checked')].map((i) => i.value);
  } else if (t.name in state) {
    state[t.name] = t.value;
  }
  if (t.name === 'city') {
    $('#bydOtherCity').hidden = state.city !== 'Other';
    $('#bydAreaNote').hidden = !state.city;
    $('#bydAreaNote').textContent = state.city === 'Other'
      ? 'We may still come to you. Send the request and we’ll let you know.'
      : '✓ We come to you in ' + state.city + '.';
    $('#bydAreaNote').classList.toggle('is-ok', state.city !== 'Other');
  }
  renderSummary();
});

form.addEventListener('input', (event) => {
  const t = event.target;
  if (t.name in state && typeof state[t.name] === 'string' && t.type !== 'radio') state[t.name] = t.value;
});

form.addEventListener('submit', (event) => { event.preventDefault(); next(); });
$('#bydNext').addEventListener('click', next);
$('#bydBarNext').addEventListener('click', next);
$('#bydBack').addEventListener('click', () => showStep(step - 1));
form.querySelectorAll('.byd-progress button').forEach((button) => {
  button.addEventListener('click', () => { const n = Number(button.closest('li').dataset.for); if (n < step) showStep(n); });
});

// ---------- Start ----------
(function start() {
  const params = new URLSearchParams(location.search);
  const size = params.get('size');
  const service = params.get('service');
  if (params.get('returning') === '1' || (getService(service) && getService(service).maintenance)) {
    state.returning = true;
    $('#bydReturning').checked = true;
  }
  if (getSize(size)) state.size = size;
  if (getService(service)) state.service = service;
  renderSizes();
  renderServices();
  renderPolicy();
  showStep(state.size ? 2 : 1, false);
  document.documentElement.classList.add('byd-ready');
})();
