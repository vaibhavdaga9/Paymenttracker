chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.get(['appsScriptApiUrl'], function(data) {
    if (!data.appsScriptApiUrl) {
      chrome.storage.local.set({ appsScriptApiUrl: '' });
    }
  });
});

chrome.action.onClicked.addListener(function(tab) {
  if (!tab || tab.id === undefined) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(function() {});
});

chrome.runtime.onMessage.addListener(function(message, sender) {
  if (!message || !message.type) return;

  if (message.type === 'PHONE_DETECTED') {
    chrome.storage.local.set({
      lastDetectedPhone: message.phone || '',
      lastDetectedSource: message.source || '',
      lastDetectedAt: Date.now()
    });

    if (sender.tab && sender.tab.id !== undefined) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(function() {});
    }

    chrome.runtime.sendMessage({
      type: 'PHONE_UPDATED',
      phone: message.phone || '',
      source: message.source || ''
    });
  }

  if (message.type === 'OPEN_WHATSAPP' && message.url) {
    chrome.tabs.create({ url: message.url });
  }
});
