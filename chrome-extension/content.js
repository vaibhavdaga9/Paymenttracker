(function() {
  var lastSentPhone = '';
  var detectDebounceTimer = null;
  var retryTimers = [];

  function normalizePhone(input) {
    if (!input) return '';
    var digits = String(input).replace(/\D/g, '');
    if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
    if (digits.length === 11 && digits.indexOf('0') === 0) digits = digits.slice(1);
    return digits.length === 10 ? digits : '';
  }

  // Extract first valid phone number from any text string
  function extractPhone(text) {
    if (!text) return '';
    // Match +91 XXXXXXXXXX or 91XXXXXXXXXX or plain 10-digit numbers
    var patterns = [
      /\+91[\s\-]?(\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d)/,
      /\b91(\d{10})\b/,
      /\b([6-9]\d{9})\b/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m) {
        var phone = normalizePhone(m[1] || m[0]);
        if (phone) return phone;
      }
    }
    return '';
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

  // Try many selectors WhatsApp Web uses (current + older DOM structures)
  function detectFromDom() {
    // 1. data-id with @c.us on any element (selected chat in list)
    var selectors = [
      '[aria-selected="true"] [data-id*="@c.us"]',
      '[data-id*="@c.us"][aria-selected="true"]',
      'div[data-id*="@c.us"]',
      'span[data-id*="@c.us"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        var dataId = el.getAttribute('data-id') || '';
        var m = dataId.match(/(\d+)@c\.us/);
        if (m && m[1]) {
          var phone = normalizePhone(m[1]);
          if (phone) return { phone: phone, source: 'data_id' };
        }
      }
    }

    // 2. WhatsApp Web encodes the open chat number in data-id on message rows
    var msgEl = document.querySelector('[data-id*="@c.us"]');
    if (msgEl) {
      var dataId2 = msgEl.getAttribute('data-id') || '';
      var m2 = dataId2.match(/(\d+)@c\.us/);
      if (m2 && m2[1]) {
        var phone2 = normalizePhone(m2[1]);
        if (phone2) return { phone: phone2, source: 'msg_data_id' };
      }
    }

    // 3. Contact info panel — phone shown as plain text like "+91 861 944 1415"
    var contactInfoSelectors = [
      'div[data-animate-drawer-title] span',
      '[data-testid="contact-info-subtitle"]',
      '[data-testid="drawer-right"] span',
      'div[tabindex="-1"] span[dir="auto"]'
    ];
    for (var j = 0; j < contactInfoSelectors.length; j++) {
      var els = document.querySelectorAll(contactInfoSelectors[j]);
      for (var k = 0; k < els.length; k++) {
        var phone3 = extractPhone(els[k].textContent || '');
        if (phone3) return { phone: phone3, source: 'contact_info_panel' };
      }
    }

    // 4. Scan all spans in the right drawer / contact info for phone pattern
    var drawerRight = document.querySelector('[data-testid="drawer-right"]') ||
                      document.querySelector('div[tabindex="-1"]');
    if (drawerRight) {
      var spans = drawerRight.querySelectorAll('span, div');
      for (var s = 0; s < spans.length; s++) {
        var txt = (spans[s].childNodes.length === 1 && spans[s].childNodes[0].nodeType === 3)
          ? spans[s].textContent : '';
        var phone4 = extractPhone(txt);
        if (phone4) return { phone: phone4, source: 'drawer_span' };
      }
    }

    // 5. Chat header — sometimes shows phone number when no contact name saved
    var headers = document.querySelectorAll('header, [data-testid="conversation-header"]');
    for (var h = 0; h < headers.length; h++) {
      var headerPhone = extractPhone(headers[h].innerText || '');
      if (headerPhone) return { phone: headerPhone, source: 'header' };
    }

    // 6. Fallback: scan entire visible page for phone pattern as last resort
    var mainPanel = document.querySelector('#main') || document.querySelector('[data-testid="conversation-panel-wrapper"]');
    if (mainPanel) {
      var allSpans = mainPanel.querySelectorAll('span[dir="auto"], span[class*="selectable"]');
      for (var sp = 0; sp < allSpans.length; sp++) {
        var spPhone = extractPhone(allSpans[sp].textContent || '');
        if (spPhone) return { phone: spPhone, source: 'main_panel_span' };
      }
    }

    return null;
  }

  function detectPhone() {
    return detectFromUrl() || detectFromDom();
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

  function getCurrentDetectedPhone() {
    var found = detectPhone();
    if (!found || !found.phone) return { phone: '', source: '' };
    return { phone: found.phone, source: found.source };
  }

  function scheduleDetect(delayMs) {
    if (detectDebounceTimer) clearTimeout(detectDebounceTimer);
    detectDebounceTimer = setTimeout(sendIfChanged, delayMs || 250);
  }

  function scheduleRetryDetect() {
    retryTimers.forEach(function(t) { clearTimeout(t); });
    retryTimers = [300, 900, 1800, 3000].map(function(delay) {
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
    var chatItem = t.closest('[role="listitem"], [data-tab], [aria-selected], header, [data-testid="cell-frame-container"]');
    if (chatItem) handleChatInteraction();
  }, true);

  window.addEventListener('popstate', function() {
    handleChatInteraction();
  });

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (!message || message.type !== 'GET_PHONE_NOW') return;
    var current = getCurrentDetectedPhone();
    if (current.phone && current.phone !== lastSentPhone) {
      lastSentPhone = current.phone;
      chrome.runtime.sendMessage({
        type: 'PHONE_DETECTED',
        phone: current.phone,
        source: current.source
      });
    }
    sendResponse(current);
  });
})();
