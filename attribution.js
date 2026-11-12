(function () {
  'use strict';
  var keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','gbraid','wbraid','fbclid'];
  var query = new URLSearchParams(location.search), value = {};
  function known(v) { return v && !/^(not_set|\(not set\)|unknown|direct_or_unknown)$/i.test(v); }
  try { value = JSON.parse(sessionStorage.getItem('tuffBrosAttribution') || '{}') || {}; } catch (_) {}
  // A new tagged arrival is one complete touch. Never mix two campaigns' fields.
  if (keys.some(function(k) { return known(query.get(k)); })) {
    value = {};
    keys.forEach(function(k) { var v=query.get(k); if(known(v)) value[k]=v.slice(0,250); });
    value.landing_page = location.pathname;
  }
  keys.forEach(function(k) { if(!known(value[k])) delete value[k]; });
  value.landing_page = value.landing_page || location.pathname;
  try { sessionStorage.setItem('tuffBrosAttribution', JSON.stringify(value)); } catch (_) {}
  window.TuffAttribution = {read:function() { return Object.assign({}, value); }};
})();
