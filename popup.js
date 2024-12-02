document.addEventListener('DOMContentLoaded', function() {
    const API_BASE_URL = 'https://api.sandbox.africastalking.com/version1';
    const form = document.getElementById('smsForm');
    const statusDiv = document.getElementById('status');
    const progressBar = document.querySelector('.progress');
    const progressBarInner = document.querySelector('.progress-bar');

    // Load saved credentials
    chrome.storage.local.get(['username', 'apiKey'], function(result) {
        if (result.username) document.getElementById('username').value = result.username;
        if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `alert alert-${type}`;
        statusDiv.style.display = 'block';
        console.log(`Status: ${message}`);
    }

    function updateProgress(success, fail, total) {
        const progress = ((success + fail) / total) * 100;
        progressBar.style.display = 'block';
        progressBarInner.style.width = `${progress}%`;
        progressBarInner.textContent = `${success}/${total} (Failed: ${fail})`;
    }

    function getAWSHeaders(apiKey) {
        const date = new Date();
        const amzDate = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const dateStamp = amzDate.split('T')[0];

        return {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'apiKey': apiKey,
            'X-Amz-Date': amzDate,
            'X-Amz-Content-Sha256': '8bb534fd43be0a6e72020069a38ef0d70d860abb9541daa5e1f4b9e2b0e69577',
            'Authorization': `AWS4-HMAC-SHA256 Credential=/${dateStamp}/us-east-1/execute-api/aws4_request, SignedHeaders=accept;apikey;content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=e6863e98047dabab2e1917bcd2b198ec480df7d44f8c750ddae4cadd0b627b10`
        };
    }

    async function sendSingleMessage(phoneNumber, message, username, apiKey) {
        console.log('Sending message to:', phoneNumber);
        
        try {
            const headers = getAWSHeaders(apiKey);
            const body = new URLSearchParams({
                username: username,
                to: phoneNumber,
                message: message
            }).toString();

            console.log('Request headers:', headers);
            console.log('Request body:', body);

            const response = await fetch(`${API_BASE_URL}/messaging`, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }

            let data;
            try {
                const responseText = await response.text();
                console.log('Raw API Response:', responseText);
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('Failed to parse API response');
                throw new Error('Invalid API response format');
            }

            const recipient = data.SMSMessageData?.Recipients?.[0];
            if (!recipient) {
                throw new Error('No recipient data in response');
            }

            if (recipient.statusCode !== 101) {
                throw new Error(recipient.status || 'Message sending failed');
            }

            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }

    async function sendMessages(messages, username, apiKey) {
        let successCount = 0;
        let failCount = 0;

        showStatus(`Starting to send ${messages.length} messages...`, 'info');
        progressBar.style.display = 'block';

        for (const msg of messages) {
            try {
                const phoneNumber = msg.phone.startsWith('+') ? msg.phone : `+${msg.phone}`;
                await sendSingleMessage(phoneNumber, msg.message, username, apiKey);
                successCount++;
                console.log(`Success: ${phoneNumber}`);
            } catch (error) {
                failCount++;
                console.error(`Failed to send to ${msg.phone}:`, error.message);
            }
            updateProgress(successCount, failCount, messages.length);
        }

        const finalMessage = failCount > 0 
            ? `Completed with ${failCount} failures. Check console for details.`
            : 'All messages sent successfully!';
        showStatus(finalMessage, failCount > 0 ? 'warning' : 'success');
    }

    function findColumnIndex(headers, possibleNames) {
        for (const name of possibleNames) {
            const index = headers.findIndex(h => h.includes(name));
            if (index !== -1) return index;
        }
        return -1;
    }

    async function parseCSV(file) {
        const text = await file.text();
        console.log('Raw CSV content:', text);

        // Split into lines and remove empty lines
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        console.log('CSV lines:', lines);

        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }

        // Parse headers and find column indices
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        console.log('CSV headers:', headers);

        const phoneIndex = findColumnIndex(headers, ['phone', 'phonenumber', 'contact', 'number', 'tel']);
        const messageIndex = findColumnIndex(headers, ['message', 'msg', 'text', 'sms']);

        console.log('Found indices - Phone:', phoneIndex, 'Message:', messageIndex);

        if (phoneIndex === -1 || messageIndex === -1) {
            throw new Error('CSV must have columns for phone number and message. Found headers: ' + headers.join(', '));
        }

        const messages = [];
        for (let i = 1; i < lines.length; i++) {
            // Split by comma but preserve commas within quotes
            const row = lines[i];
            const values = [];
            let currentValue = '';
            let insideQuotes = false;

            for (let char of row) {
                if (char === '"') {
                    insideQuotes = !insideQuotes;
                } else if (char === ',' && !insideQuotes) {
                    values.push(currentValue.trim());
                    currentValue = '';
                } else {
                    currentValue += char;
                }
            }
            values.push(currentValue.trim());

            console.log(`Row ${i} values:`, values);

            if (values[phoneIndex] && values[messageIndex]) {
                // Clean up phone number
                let phone = values[phoneIndex].replace(/[^\d+]/g, ''); // Remove non-digit chars except +
                if (!phone.startsWith('+')) {
                    phone = phone.startsWith('256') ? `+${phone}` : `+256${phone}`; // Add country code if needed
                }
                
                messages.push({
                    phone: phone,
                    message: values[messageIndex]
                });
            }
        }

        console.log('Parsed messages:', messages);
        return messages;
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        try {
            const username = document.getElementById('username').value.trim();
            const apiKey = document.getElementById('apiKey').value.trim();
            const csvFile = document.getElementById('csvFile').files[0];

            if (!username || !apiKey || !csvFile) {
                showStatus('Please fill in all fields', 'danger');
                return;
            }

            // Save credentials
            chrome.storage.local.set({ username, apiKey });

            showStatus('Reading CSV file...', 'info');
            const messages = await parseCSV(csvFile);

            if (messages.length === 0) {
                throw new Error('No valid messages found in CSV');
            }

            await sendMessages(messages, username, apiKey);
        } catch (error) {
            console.error('Error:', error);
            showStatus(`Error: ${error.message}`, 'danger');
        }
    });
});
