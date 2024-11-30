# CSV Message Sender Chrome Extension

A Chrome extension that allows sending SMS messages using the AfricasTalking API with data from a CSV file.

## Setup Instructions

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Usage

1. Click the extension icon in Chrome
2. Enter your AfricasTalking username and API key
3. Upload a CSV file with 'phone' and 'message' columns
4. Click "Send Messages" to start sending

## CSV Format

Your CSV file should have the following columns:
- phone: The recipient's phone number
- message: The message to send

Example:
```csv
phone,message
+254700000000,Hello World
+254711111111,Testing SMS
```

## Security Note

Your API credentials are stored locally in Chrome's secure storage. Never share your API key with others.

## Dependencies

- Bootstrap 5.1.3 for UI
- AfricasTalking API for message sending
