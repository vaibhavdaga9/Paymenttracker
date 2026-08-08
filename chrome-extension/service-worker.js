chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.get(['appsScriptApiUrl'], function(data) {
    if (!data.appsScriptApiUrl) {
      chrome.storage.local.set({ appsScriptApiUrl: '' });
    }
  });
});

chrome.runtime.onMessage.addListener(function(message) {
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
});
