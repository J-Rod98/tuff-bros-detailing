// Loads the paid gift card for this checkout and shows a printable certificate.
document.addEventListener('DOMContentLoaded', function () {
  var status = document.getElementById('giftStatus');
  var cert = document.getElementById('giftCert');
  var actions = document.getElementById('giftActions');
  var fallback = ' Your payment is safe. Text (501) 500-4306 and we\'ll send your certificate.';
  var sessionId = new URLSearchParams(window.location.search).get('session_id') || '';

  function fail(message) {
    status.textContent = message + fallback;
    status.classList.add('gift-status-error');
  }
  function set(id, value) {
    document.getElementById(id).textContent = value;
  }

  if (!/^cs_(test|live)_[A-Za-z0-9]{10,250}$/.test(sessionId)) {
    fail('We could not find your gift card link.');
    return;
  }

  fetch('/.netlify/functions/gift-card?session_id=' + encodeURIComponent(sessionId), { credentials: 'same-origin' })
    .then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.gift) throw new Error(data.error || 'We could not load your gift card.');
        return data.gift;
      });
    })
    .then(function (gift) {
      var amount = '$' + gift.amount.toLocaleString('en-US', { minimumFractionDigits: gift.amount % 1 ? 2 : 0 });
      set('giftAmount', amount);
      set('giftTo', gift.recipient || 'A lucky driver');
      set('giftFrom', gift.from || 'A friend');
      set('giftCode', gift.code);
      set('giftExpires', new Date(gift.expiresOn + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      if (gift.message) {
        set('giftMessage', '“' + gift.message + '”');
        document.getElementById('giftMessage').hidden = false;
      }
      status.hidden = true;
      cert.hidden = false;
      actions.hidden = false;

      var shareText = 'You got a ' + amount + ' Tuff Bros Mobile Detailing gift card' +
        (gift.from ? ' from ' + gift.from : '') + '! Gift code: ' + gift.code +
        '. Good through ' + document.getElementById('giftExpires').textContent +
        '. Text (501) 500-4306 to book and they come to you. tuffbrosdetailing.com';

      document.getElementById('giftPrint').addEventListener('click', function () { window.print(); });
      document.getElementById('giftShare').addEventListener('click', function () {
        if (navigator.share) {
          navigator.share({ title: 'Tuff Bros Gift Card', text: shareText }).catch(function () {});
        } else {
          window.location.href = 'sms:?&body=' + encodeURIComponent(shareText);
        }
      });
    })
    .catch(function (error) { fail(error.message); });
});
