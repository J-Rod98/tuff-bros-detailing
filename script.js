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
    });
  });

  // ---- Track text-message clicks as a conversion ----
  document.querySelectorAll('a[href^="sms:"]').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('text_click', { link_location: link.className || 'link' });
    });
  });

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
  // UTMs may disappear if a visitor browses to another page before requesting
  // a quote, so keep the first non-empty values for the current browser session.
  var attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  var attribution = {};
  try {
    attribution = JSON.parse(window.sessionStorage.getItem('tuffBrosAttribution') || '{}');
  } catch (e) {
    attribution = {};
  }

  var query = new URLSearchParams(window.location.search);
  attributionKeys.forEach(function (key) {
    var value = query.get(key);
    if (value && !attribution[key]) attribution[key] = value.slice(0, 150);
  });
  if (!attribution.landing_page) attribution.landing_page = window.location.pathname;

  try {
    window.sessionStorage.setItem('tuffBrosAttribution', JSON.stringify(attribution));
  } catch (e) {
    // Private browsing or storage restrictions should never block a quote request.
  }

  function setHiddenField(id, value) {
    var field = document.getElementById(id);
    if (field) field.value = value || 'not_set';
  }

  setHiddenField('landingPage', attribution.landing_page);
  setHiddenField('utmSource', attribution.utm_source);
  setHiddenField('utmMedium', attribution.utm_medium);
  setHiddenField('utmCampaign', attribution.utm_campaign);
  setHiddenField('utmContent', attribution.utm_content);

  var referrerHost = 'direct_or_unknown';
  try {
    if (document.referrer) referrerHost = new URL(document.referrer).hostname;
  } catch (e) {
    // Keep the neutral fallback if the browser provides a non-standard referrer.
  }

  // Service and location pages still store attribution for a later visit to
  // the home-page quote form, but they do not have fields to populate.
  if (!form) return;

  setHiddenField('referrerHost', referrerHost);

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
