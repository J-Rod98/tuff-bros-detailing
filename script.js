document.addEventListener('DOMContentLoaded', function () {
  function storageGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (_) { /* Attribution is optional. */ }
  }

  // ---- Meta Pixel: anonymous page and completed-quote measurement ----
  // Do not send quote-form fields or other personally identifiable information.
  (function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', '1360494595482934');
  window.fbq('track', 'PageView');

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Fire a Google Analytics event only if gtag is loaded (safe no-op otherwise)
  function trackEvent(name, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, params || {});
      }
    } catch (_) { /* Measurement must never interrupt a customer action. */ }
  }

  // Count quote entry points without sending URL parameters or customer fields.
  document.querySelectorAll('a[href*="#quote"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('quote_cta_click', {
        form_id: 'quoteForm',
        link_location: link.className || 'link'
      });
    });
  });

  // ---- Sticky header shadow on scroll ----
  var header = document.getElementById('siteHeader');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---- Mobile nav toggle ----
  var navToggle = document.getElementById('navToggle');
  var mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    var closeNav = function () {
      mainNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    };
    navToggle.addEventListener('click', function () {
      var open = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close after tapping a link
    mainNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeNav);
    });
  }

  // ---- Before/After comparison sliders ----
  document.querySelectorAll('.ba-slider').forEach(function (slider) {
    var range = slider.querySelector('.ba-range');
    var before = slider.querySelector('.ba-before');
    var divider = slider.querySelector('.ba-divider');
    if (!range || !before || !divider) return;
    var update = function () {
      var v = range.value;
      before.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      divider.style.left = v + '%';
    };
    range.addEventListener('input', update);
    update();
  });

  // ---- Track phone-call clicks as a conversion ----
  document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('phone_call_click', { link_location: link.className || 'link' });
      trackEvent('call_click', { link_location: link.className || 'link' });
    });
  });

  // ---- Track text-message clicks as a conversion ----
  document.querySelectorAll('a[href^="sms:"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('text_click', { link_location: link.className || 'link' });
    });
  });

  // ---- Preserve paid-traffic attribution when a visitor chooses the booking flow ----
  (function decorateBookingLinks() {
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    var current = new URLSearchParams(window.location.search);
    var attribution = new URLSearchParams();
    keys.forEach(function (key) {
      var value = current.get(key) || storageGet('tuffbros_' + key);
      if (value) {
        attribution.set(key, value);
        storageSet('tuffbros_' + key, value);
      }
    });
    if (!attribution.toString()) return;
    document.querySelectorAll('[data-booking-link]').forEach(function (link) {
      var url = new URL(link.getAttribute('href'), window.location.origin);
      attribution.forEach(function (value, key) { url.searchParams.set(key, value); });
      link.setAttribute('href', url.pathname + '?' + url.searchParams.toString() + url.hash);
    });
  })();

  // ---- Subtle scroll reveal (degrades gracefully; respects reduced motion) ----
  var reveals = document.querySelectorAll('.reveal');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reveals.length && 'IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    // No observer / reduced motion: show everything immediately
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  // ---- Quote form (Formspree AJAX submit) ----
  var form = document.getElementById('quoteForm');
  var confirmation = document.getElementById('formConfirmation');
  var errorEl = document.getElementById('formError');
  var submitBtn = document.getElementById('submitBtn');

  // ---- Preserve campaign attribution with the lead, not in Analytics ----
  // One shared attribution record follows the visitor across site pages.
  var query = new URLSearchParams(window.location.search);
  var attribution = window.TuffAttribution ? window.TuffAttribution.read() : {};

  function setHiddenField(id, value) {
    var field = document.getElementById(id);
    if (field) field.value = value || 'not_set';
  }

  setHiddenField('landingPage', attribution.landing_page);
  setHiddenField('utmSource', attribution.utm_source);
  setHiddenField('utmMedium', attribution.utm_medium);
  setHiddenField('utmCampaign', attribution.utm_campaign);
  setHiddenField('utmContent', attribution.utm_content);
  ['gclid','gbraid','wbraid','utm_term'].forEach(function(key) { setHiddenField(key, attribution[key]); });

  var referrerHost = 'direct_or_unknown';
  try {
    if (document.referrer) referrerHost = new URL(document.referrer).hostname;
  } catch (e) {
    // Keep the neutral fallback if the browser provides a non-standard referrer.
  }

  // Service and location pages still store attribution for a later visit to
  // the home-page quote form, but they do not have fields to populate.
  if (!form) return;

  // Measure actual form exposure and the first edit, once per page load.
  var quoteViewed = false;
  function recordQuoteView() {
    if (quoteViewed) return;
    quoteViewed = true;
    trackEvent('quote_form_view', { form_id: 'quoteForm' });
  }
  if ('IntersectionObserver' in window) {
    var quoteObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        document.body.classList.toggle('quote-form-visible', entry.isIntersecting);
        if (entry.isIntersecting) recordQuoteView();
      });
    });
    quoteObserver.observe(form);
  }
  var quoteStarted = false;
  function recordQuoteStart() {
    if (quoteStarted) return;
    quoteStarted = true;
    recordQuoteView();
    trackEvent('quote_form_start', { form_id: 'quoteForm' });
  }
  form.addEventListener('input', recordQuoteStart);
  form.addEventListener('change', recordQuoteStart);
  form.addEventListener('invalid', function (event) {
    var extras = event.target.closest('.quote-extras');
    if (extras) extras.open = true;
  }, true);

  // If the booking flow determined that this vehicle needs a custom quote, carry
  // the non-sensitive context into the existing Formspree workflow. Photos are
  // intentionally not copied to browser storage.
  (function restoreBookingQuoteContext() {
    var raw;
    try { raw = sessionStorage.getItem('tuffbros_booking_quote_context'); } catch (_) { return; }
    if (!raw) return;
    try {
      var context = JSON.parse(raw);
      var customer = context.customer || {};
      var vehicle = context.vehicle || {};
      var conditions = context.conditions || {};
      var address = context.address || {};
      var name = document.getElementById('name');
      var phone = document.getElementById('phone');
      var email = document.getElementById('email');
      var city = document.getElementById('city');
      var vehicleInput = document.getElementById('vehicle');
      var service = document.getElementById('service');
      var condition = document.getElementById('condition');
      var message = document.getElementById('message');
      if (name && !name.value) name.value = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
      if (phone && !phone.value) phone.value = customer.phone || '';
      if (email && !email.value) email.value = customer.email || '';
      if (city && address.city && Array.prototype.some.call(city.options, function (option) { return option.value === address.city; })) city.value = address.city;
      if (vehicleInput && !vehicleInput.value) vehicleInput.value = [vehicle.year, vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' ');
      if (service) service.value = 'Not Sure / Need Help Deciding';
      if (condition && Object.keys(conditions).some(function (key) { return conditions[key]; })) condition.value = 'Heavily Soiled / Neglected';
      if (message && !message.value) {
        var flagged = Object.keys(conditions).filter(function (key) { return conditions[key]; }).join(', ');
        message.value = ['Booking flow requested a custom quote.', vehicle.notes, flagged ? 'Reported conditions: ' + flagged : ''].filter(Boolean).join('\n');
      }
      sessionStorage.removeItem('tuffbros_booking_quote_context');
    } catch (_) {
      // Existing quote form remains fully usable if stored context cannot be read.
    }
  })();
  // Carry a known service/package into the quote form; never insert raw URL text.
  var serviceField = document.getElementById('service');
  var interestField = document.getElementById('ceramicInterest');
  var packageField = document.getElementById('ceramicPackage');
  var packageSummary = document.getElementById('quotePackageSummary');
  var packageNames = {
    'protection': 'Ceramic Protection — starting at $749',
    'correct-protect': 'Correct + Protect — starting at $999',
    'pro': 'Correct + Protect PRO — starting at $1,499; inspection required'
  };
  var serviceNames = {
    'ceramic': 'Ceramic Coating',
    'quick-interior': 'Quick Interior Clean',
    'deep-interior': 'Deep Interior Clean',
    'exterior': 'Exterior Detailing',
    'wash-clay-seal': 'Wash, Clay & Seal',
    'basic-in-out': 'Basic In & Out',
    'full-detail': 'Full Detail'
  };
  var requestedService = serviceNames[query.get('service')];
  var requestedPackage = query.get('service') === 'ceramic' ? packageNames[query.get('package')] : '';
  if (serviceField && requestedService) serviceField.value = requestedService;
  if (packageField && requestedPackage) packageField.value = requestedPackage;
  function updateQuoteQuestions() {
    var service = serviceField ? serviceField.value : '';
    var ceramic = service === 'Ceramic Coating';
    var interior = !service || ['Quick Interior Clean', 'Deep Interior Clean', 'Basic In & Out', 'Full Detail', 'Not Sure / Need Help Deciding'].indexOf(service) >= 0;
    document.querySelectorAll('[data-interior-question]').forEach(function (row) {
      row.hidden = !interior;
      row.querySelectorAll('select').forEach(function (field) {
        field.disabled = !interior;
        if (!interior) field.value = 'No';
      });
    });
    if (interestField && ceramic) interestField.value = 'Yes';
    if (packageField && !ceramic) packageField.value = '';
    if (packageSummary) {
      packageSummary.hidden = !(ceramic && packageField && packageField.value);
      packageSummary.textContent = packageField && packageField.value ? 'Your selected package: ' + packageField.value : '';
    }
  }
  if (serviceField) serviceField.addEventListener('change', updateQuoteQuestions);
  updateQuoteQuestions();
  setHiddenField('referrerHost', referrerHost);

  var quoteSubmitting = false;
  var quoteAccepted = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (quoteSubmitting) return;

    if (errorEl) errorEl.hidden = true;
    if (confirmation) confirmation.hidden = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var originalLabel = submitBtn.textContent;
    quoteSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    (window.TuffOS ? window.TuffOS.submitQuote(form) : fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' }
    }))
      .then(function (response) {
        if (response.ok) {
          quoteAccepted = true;
          form.reset();
          // Measure accepted requests, not visits to the confirmation page.
          // Give Analytics time to send, but never make confirmation depend on it.
          var redirected = false;
          function redirectToConfirmation() {
            if (redirected) return;
            redirected = true;
            window.location.assign('/quote-received/');
          }
          window.setTimeout(redirectToConfirmation, 1800);
          try {
            trackEvent('generate_lead', {
              form_id: 'quoteForm',
              event_callback: redirectToConfirmation,
              event_timeout: 1500
            });
          } catch (_) { /* Measurement must not turn an accepted request into an error. */ }
          try {
            if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
          } catch (_) { /* Confirmation does not depend on third-party measurement. */ }
        } else {
          showError();
        }
      })
      .catch(showError)
      .finally(function () {
        if (!quoteAccepted) {
          quoteSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      });
  });

  function showError() {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert('Sorry, something went wrong. Please call us at (501) 500-4306.');
    }
  }
});
