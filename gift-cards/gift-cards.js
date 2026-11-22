// Gift card buy buttons.
// Paste each Stripe Payment Link URL below (Stripe Dashboard > Payment Links).
// Until a link is filled in, its button opens a text message to buy by phone.
var GIFT_LINKS = {
  g200: 'https://buy.stripe.com/9B65kE7vzd7R0gO4Otfw402',
  g300: 'https://buy.stripe.com/00wdRa7vz6Jt4x4bcRfw401',
  g350: 'https://buy.stripe.com/aFabJ2aHL4Bld3Aa8Nfw403',
  custom: 'https://buy.stripe.com/00w9AUaHLgk35B86WBfw400'
};

document.addEventListener('DOMContentLoaded', function () {
  var buttons = document.querySelectorAll('[data-gift]');
  Array.prototype.forEach.call(buttons, function (button) {
    var key = button.getAttribute('data-gift');
    var link = GIFT_LINKS[key];
    if (link && /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com)\//.test(link)) {
      button.href = link;
      button.addEventListener('click', function () {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'begin_checkout', { item_category: 'gift_card', item_id: key });
        }
      });
      return;
    }
    var amount = button.getAttribute('data-amount');
    var body = amount
      ? "Hi! I'd like to buy a $" + amount + ' Tuff Bros gift card.'
      : "Hi! I'd like to buy a Tuff Bros gift card.";
    button.href = 'sms:+15015004306?&body=' + encodeURIComponent(body);
  });
});
