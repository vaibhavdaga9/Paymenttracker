# Paymenttracker

## Chrome Extension for WhatsApp Web

This repository now includes a Chrome extension at:

`/home/runner/work/Paymenttracker/Paymenttracker/chrome-extension`

### What it does
- Detects customer mobile number from WhatsApp Web (chat click or number-based URL).
- Sends the mobile number to the Apps Script API.
- Shows customer outstanding amount + pending bill details + due days in a side panel.
- Provides **Generate** (reminder text) and **Send Reminder** (opens WhatsApp draft) buttons.

### Apps Script API endpoint
Deploy your Apps Script as Web App and use:

`<WEB_APP_URL>?action=customer_by_mobile&mobile=XXXXXXXXXX`

Response fields:
- `outstandingAmount`
- `pendingBills[]` with `remarks`, `amount`, `invoiceDate`, `dueDate`, `dueDays`
- `customerName`, `customerId`, `mobile`

### Load extension in Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/home/runner/work/Paymenttracker/Paymenttracker/chrome-extension`.
5. Open WhatsApp Web, click the extension icon to open side panel.
6. Save your Apps Script Web App URL in the panel once.