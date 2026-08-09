chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.get(['appsScriptApiUrl'], function(data) {
    if (!data.appsScriptApiUrl) {
      chrome.storage.local.set({ appsScriptApiUrl: '' });
    }
  });
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === 'PHONE_DETECTED') {
    chrome.storage.local.set({
      lastDetectedPhone: message.phone || '',
      lastDetectedSource: message.source || '',
      lastDetectedAt: Date.now()
    });

    chrome.runtime.sendMessage({
      type: 'PHONE_UPDATED',
      phone: message.phone || '',
      source: message.source || ''
    }).catch(function() {});
  }

  if (message.type === 'OPEN_WHATSAPP' && message.url) {
    chrome.tabs.create({ url: message.url });
  }

  // Route API fetch through background to avoid CORS issues in popup
  if (message.type === 'FETCH_API' && message.url) {
    fetch(message.url, { redirect: 'follow' })
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var data;
        try { data = JSON.parse(text); } catch(e) {
          sendResponse({ error: 'NOT_JSON', text: text.slice(0, 200) });
          return;
        }
        sendResponse({ ok: true, data: data });
      })
      .catch(function(err) {
        sendResponse({ error: err.message });
      });
    return true; // keep message channel open for async response
  }
});
