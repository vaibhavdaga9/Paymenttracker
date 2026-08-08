(function() {
  var lastSentPhone = '';
  var detectDebounceTimer = null;
  var retryTimers = [];

  function normalizePhone(input) {
    if (!input) return '';
    var digits = String(input).replace(/\D/g, '');
    if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
    return digits.length === 10 ? digits : '';
  }

  function detectFromUrl() {
    try {
      var url = new URL(window.location.href);
      var phone = normalizePhone(url.searchParams.get('phone') || '');
      if (phone) return { phone: phone, source: 'url_param' };

      var pathMatch = url.pathname.match(/\/send\/(\d+)/);
      if (pathMatch && pathMatch[1]) {
        phone = normalizePhone(pathMatch[1]);
        if (phone) return { phone: phone, source: 'url_path' };
      }
    } catch (e) {}
    return null;
  }

  function detectFromSelectedChat() {
    var selected = document.querySelector('[aria-selected="true"] [data-id*="@c.us"]');
    if (selected) {
      var dataId = selected.getAttribute('data-id') || '';
      var m = dataId.match(/(\d+)@c\.us/);
      if (m && m[1]) {
        var phone = normalizePhone(m[1]);
        if (phone) return { phone: phone, source: 'selected_chat' };
      }
    }

    var header = document.querySelector('header');
    if (header) {
      var txt = header.innerText || '';
      var numMatch = txt.match(/(?:\+?91[\s-]?)?(\d{10})/);
      if (numMatch && numMatch[1]) {
        var headerPhone = normalizePhone(numMatch[1]);
        if (headerPhone) return { phone: headerPhone, source: 'header' };
      }
    }
    return null;
  }

  function detectPhone() {
    return detectFromUrl() || detectFromSelectedChat();
  }

  function sendIfChanged() {
    var found = detectPhone();
    if (!found || !found.phone) return;
    if (found.phone === lastSentPhone) return;
    lastSentPhone = found.phone;
    chrome.runtime.sendMessage({
      type: 'PHONE_DETECTED',
      phone: found.phone,
      source: found.source
    });
  }

  function scheduleDetect(delayMs) {
    if (detectDebounceTimer) clearTimeout(detectDebounceTimer);
    detectDebounceTimer = setTimeout(sendIfChanged, delayMs || 250);
  }

  function scheduleRetryDetect() {
    retryTimers.forEach(function(t) { clearTimeout(t); });
    retryTimers = [300, 900, 1800].map(function(delay) {
      return setTimeout(sendIfChanged, delay);
    });
  }

  function handleChatInteraction() {
    scheduleDetect(200);
    scheduleRetryDetect();
  }

  sendIfChanged();
  setInterval(sendIfChanged, 1500);

  var observer = new MutationObserver(function() {
    scheduleDetect(180);
  });
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  document.addEventListener('click', function(evt) {
    var t = evt.target;
    if (!t) return;
    var chatItem = t.closest('[role="listitem"], [data-tab], [aria-selected], header');
    if (chatItem) handleChatInteraction();
  }, true);

  window.addEventListener('popstate', function() {
    handleChatInteraction();
  });
})();
