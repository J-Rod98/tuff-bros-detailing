document.addEventListener('DOMContentLoaded', function () {
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Fire a Google Analytics event only if gtag is loaded (safe no-op otherwise)
  function trackEvent(name, params) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

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
      var value = current.get(key) || sessionStorage.getItem('tuffbros_' + key);
      if (value) {
        attribution.set(key, value);
        sessionStorage.setItem('tuffbros_' + key, value);
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
  if (!form) return;

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

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (errorEl) errorEl.hidden = true;
    if (confirmation) confirmation.hidden = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' }
    })
      .then(function (response) {
        if (response.ok) {
          trackEvent('generate_lead', { form_id: 'quoteForm' });
          form.reset();
          confirmation.hidden = false;
          confirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          showError();
        }
      })
      .catch(showError)
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
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
