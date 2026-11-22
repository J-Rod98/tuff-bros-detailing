// Gift card buy buttons.
// Paste each Stripe Payment Link URL below (Stripe Dashboard > Payment Links).
// Until a link is filled in, its button opens a text message to buy by phone.
// TEST MODE links (Tuff Bros Detailing sandbox). Swap for live links before launch.
var GIFT_LINKS = {
  g200: 'https://buy.stripe.com/test_5kQ5kF9jiaQi9Xq90L8AE00',
  g300: 'https://buy.stripe.com/test_9B614pdzye2u4D6dh18AE01',
  g350: 'https://buy.stripe.com/test_aFa00lgLKcYqb1uccX8AE02',
  custom: 'https://buy.stripe.com/test_cNicN7brq7E69Xqa4P8AE03'
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
