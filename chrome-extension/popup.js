var latestPayload = null;
var detectedPhone = '';
var autoFetchDebounceTimer = null;
var lastAutoFetchedPhone = '';
var activeFetchToken = 0;

function formatCurrency(amount) {
  return '₹' + (Number(amount) || 0).toLocaleString('en-IN');
}

function normalizePhone(input) {
  var digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
  return digits.length === 10 ? digits : '';
}

function setStatus(msg, isError) {
  var el = document.getElementById('status');
  el.textContent = msg || '';
  el.style.color = isError ? '#b91c1c' : '#6b7280';
}

function setDetectedInfo() {
  var info = document.getElementById('detectedInfo');
  info.textContent = detectedPhone ? ('Detected from WhatsApp: ' + detectedPhone) : 'No number detected yet.';
}

function renderBills(bills) {
  var container = document.getElementById('bills');
  if (!bills || bills.length === 0) {
    container.innerHTML = '<div class="muted">No pending bills.</div>';
    return;
  }

  container.innerHTML = bills.map(function(b, i) {
    return (
      '<div class="bill">' +
        '<div><strong>' + (i + 1) + '. ' + (b.remarks || 'Invoice') + '</strong></div>' +
        '<div>Amount: ' + formatCurrency(b.amount) + '</div>' +
        '<div>Invoice Date: ' + (b.invoiceDate || '-') + '</div>' +
        '<div>Due Date: ' + (b.dueDate || '-') + '</div>' +
        '<div>Due Days: ' + (b.dueDays || 0) + '</div>' +
      '</div>'
    );
  }).join('');
}

function renderResult(payload) {
  latestPayload = payload || null;
  var result = document.getElementById('result');
  if (!payload || !payload.success || !payload.found) {
    result.classList.add('hidden');
    return;
  }

  document.getElementById('customerName').textContent = payload.customerName || '-';
  document.getElementById('customerId').textContent = payload.customerId || '-';
  document.getElementById('outstanding').textContent = formatCurrency(payload.outstandingAmount || 0);
  renderBills(payload.pendingBills || []);
  result.classList.remove('hidden');
}

async function fetchPendingWithRetry(options) {
  var opts = options || {};
  var apiUrl = document.getElementById('apiUrl').value.trim();
  var mobile = normalizePhone(document.getElementById('mobileInput').value);
  var retries = typeof opts.retries === 'number' ? opts.retries : 0;
  var attempt = typeof opts.attempt === 'number' ? opts.attempt : 0;
  var showLoading = opts.showLoading !== false;
  var token = ++activeFetchToken;

  if (!apiUrl) return setStatus('Save Apps Script API URL first.', true);
  if (!mobile) return setStatus('Enter a valid 10-digit mobile number.', true);

  if (showLoading) {
    setStatus('Loading...');
    renderResult(null);
  }

  try {
    var url = apiUrl + '?action=customer_by_mobile&mobile=' + encodeURIComponent(mobile);
    var result = await new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ type: 'FETCH_API', url: url }, function(response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (token !== activeFetchToken) return;

    if (result.error === 'NOT_JSON') {
      setStatus('API error: Response was not JSON. Raw response: ' + (result.text || '(empty)'), true);
      return;
    }
    if (result.error) {
      throw new Error(result.error);
    }

    var data = result.data;
    if (!data.success) {
      if (attempt < retries) {
        setStatus('Retrying... (' + (attempt + 1) + '/' + retries + ')', false);
        setTimeout(function() {
          fetchPendingWithRetry({ retries: retries, attempt: attempt + 1, showLoading: false });
        }, 500 * (attempt + 1));
        return;
      }
      setStatus(data.message || 'Failed to fetch pending data.', true);
      return;
    }
    if (!data.found) {
      setStatus(data.message || 'No pending bills found.', false);
      return;
    }
    renderResult(data);
    setStatus('Loaded ' + (data.pendingBills || []).length + ' pending bill(s).');
  } catch (err) {
    if (attempt < retries) {
      setStatus('Network issue, retrying... (' + (attempt + 1) + '/' + retries + ')', false);
      setTimeout(function() {
        fetchPendingWithRetry({ retries: retries, attempt: attempt + 1, showLoading: false });
      }, 500 * (attempt + 1));
      return;
    }
    setStatus('Fetch failed: ' + err.message, true);
  }
}

function fetchPending() {
  fetchPendingWithRetry({ retries: 2, attempt: 0, showLoading: true });
}

function generateMessage() {
  if (!latestPayload || !latestPayload.pendingBills || latestPayload.pendingBills.length === 0) {
    return setStatus('Fetch pending bills first.', true);
  }

  var lines = latestPayload.pendingBills.map(function(b, i) {
    var duePart = (b.dueDays && b.dueDays > 0) ? (' | Due by ' + b.dueDays + ' day(s)') : '';
    return (i + 1) + '. ' + (b.remarks || 'Invoice') + ' - ' + formatCurrency(b.amount) + duePart;
  });

  var message =
    'Dear ' + (latestPayload.customerName || 'Customer') + ',\n\n' +
    'This is a reminder for your pending bills:\n\n' +
    lines.join('\n') + '\n\n' +
    'Total Outstanding: ' + formatCurrency(latestPayload.outstandingAmount || 0) + '\n\n' +
    'Please clear the payment at the earliest.\n\nRegards,\nDaga Marketing Pvt Ltd';

  document.getElementById('message').value = message;
  setStatus('Reminder generated.');
}

function sendReminder() {
  var phone = normalizePhone(document.getElementById('mobileInput').value);
  var text = document.getElementById('message').value.trim();
  if (!phone) return setStatus('Enter a valid mobile number.', true);
  if (!text) return setStatus('Generate reminder text first.', true);

  var waUrl = 'https://wa.me/91' + phone + '?text=' + encodeURIComponent(text);
  chrome.runtime.sendMessage({ type: 'OPEN_WHATSAPP', url: waUrl });
  setStatus('Opened WhatsApp reminder draft.');
}

function saveApiUrl() {
  var apiUrl = document.getElementById('apiUrl').value.trim();
  chrome.storage.local.set({ appsScriptApiUrl: apiUrl }, function() {
    setStatus('API URL saved.');
  });
}

function useDetected() {
  if (!detectedPhone) return setStatus('No detected phone available.', true);
  document.getElementById('mobileInput').value = detectedPhone;
  fetchPending();
}

function scheduleAutoFetchForDetectedPhone() {
  if (!detectedPhone) return;
  if (autoFetchDebounceTimer) clearTimeout(autoFetchDebounceTimer);
  autoFetchDebounceTimer = setTimeout(function() {
    var apiUrl = document.getElementById('apiUrl').value.trim();
    if (!apiUrl) return;
    if (detectedPhone === lastAutoFetchedPhone) return;
    document.getElementById('mobileInput').value = detectedPhone;
    lastAutoFetchedPhone = detectedPhone;
    fetchPendingWithRetry({ retries: 2, attempt: 0, showLoading: true });
  }, 350);
}

function boot() {
  chrome.storage.local.get(['appsScriptApiUrl', 'lastDetectedPhone'], function(data) {
    document.getElementById('apiUrl').value = data.appsScriptApiUrl || '';
    detectedPhone = normalizePhone(data.lastDetectedPhone || '');
    if (detectedPhone) {
      document.getElementById('mobileInput').value = detectedPhone;
      scheduleAutoFetchForDetectedPhone();
    }
    setDetectedInfo();
  });

  chrome.runtime.onMessage.addListener(function(message) {
    if (!message || message.type !== 'PHONE_UPDATED') return;
    detectedPhone = normalizePhone(message.phone || '');
    if (detectedPhone) {
      document.getElementById('mobileInput').value = detectedPhone;
      scheduleAutoFetchForDetectedPhone();
    }
    setDetectedInfo();
  });

  document.getElementById('saveApiBtn').addEventListener('click', saveApiUrl);
  document.getElementById('fetchBtn').addEventListener('click', fetchPending);
  document.getElementById('generateBtn').addEventListener('click', generateMessage);
  document.getElementById('sendBtn').addEventListener('click', sendReminder);
  document.getElementById('useDetectedBtn').addEventListener('click', useDetected);
}

boot();
