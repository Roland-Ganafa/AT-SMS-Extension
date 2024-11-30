document.addEventListener('DOMContentLoaded', function() {
    const usernameInput = document.getElementById('username');
    const apiKeyInput = document.getElementById('apiKey');
    const csvFileInput = document.getElementById('csvFile');
    const sendButton = document.getElementById('sendButton');
    const messageStatus = document.getElementById('messageStatus');

    // Load saved credentials
    chrome.storage.local.get(['username', 'apiKey'], function(result) {
        if (result.username) usernameInput.value = result.username;
        if (result.apiKey) apiKeyInput.value = result.apiKey;
    });

    // Save credentials when entered
    usernameInput.addEventListener('change', function() {
        chrome.storage.local.set({ username: usernameInput.value });
    });

    apiKeyInput.addEventListener('change', function() {
        chrome.storage.local.set({ apiKey: apiKeyInput.value });
    });

    sendButton.addEventListener('click', async function() {
        const username = usernameInput.value.trim();
        const apiKey = apiKeyInput.value.trim();
        const file = csvFileInput.files[0];

        if (!username || !apiKey) {
            showStatus('Please enter both username and API key', 'danger');
            return;
        }

        if (!file) {
            showStatus('Please select a CSV file', 'danger');
            return;
        }

        try {
            showStatus('Reading CSV file...', 'info');
            const messages = await parseCSV(file);
            await sendMessages(messages, username, apiKey);
        } catch (error) {
            showStatus(error.message, 'danger');
        }
    });

    function parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                const csv = event.target.result;
                const lines = csv.split('\n');
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                
                const phoneIndex = headers.indexOf('phone');
                const messageIndex = headers.indexOf('message');

                if (phoneIndex === -1 || messageIndex === -1) {
                    reject(new Error(`CSV must contain 'phone' and 'message' columns. Found columns: ${headers.join(', ')}`));
                    return;
                }

                const messages = [];
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '') continue;
                    
                    const columns = lines[i].split(',').map(col => col.trim());
                    if (columns[phoneIndex] && columns[messageIndex]) {
                        messages.push({
                            phone: columns[phoneIndex],
                            message: columns[messageIndex]
                        });
                    }
                }

                if (messages.length === 0) {
                    reject(new Error('No valid messages found in CSV file'));
                    return;
                }

                resolve(messages);
            };

            reader.onerror = function() {
                reject(new Error('Error reading CSV file'));
            };

            reader.readAsText(file);
        });
    }

    async function sendMessages(messages, username, apiKey) {
        const apiUrl = 'https://api.sandbox.africastalking.com/version1/messaging';
        let successCount = 0;
        let failCount = 0;

        showStatus(`Sending messages (0/${messages.length})...`, 'info');
        console.log('Starting to send messages using sandbox API:', apiUrl);

        for (const msg of messages) {
            try {
                const phoneNumber = msg.phone.startsWith('+') ? msg.phone : `+${msg.phone}`;
                console.log('Attempting to send message to:', phoneNumber);

                // Add retry logic
                let retries = 3;
                let success = false;
                let lastError;

                while (retries > 0 && !success) {
                    try {
                        const requestBody = new URLSearchParams({
                            'username': username,
                            'to': phoneNumber,
                            'message': msg.message
                        });

                        // Create base64 encoded auth string
                        const authString = btoa(username + ':' + apiKey);
                        
                        console.log('Request details:', {
                            url: apiUrl,
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Authorization': 'Basic ****',
                                'apiKey': '****'  // Logging placeholder
                            },
                            body: requestBody.toString()
                        });

                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'Authorization': `Basic ${authString}`,
                                'apiKey': apiKey
                            },
                            body: requestBody
                        });

                        console.log('Response status:', response.status);
                        const data = await response.json();
                        console.log('API Response:', data);

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status} - ${JSON.stringify(data)}`);
                        }

                        if (data.SMSMessageData?.Recipients?.[0]?.statusCode === 101) {
                            successCount++;
                            success = true;
                            console.log('Message sent successfully');
                        } else {
                            throw new Error(data.SMSMessageData?.Message || 'Failed to send message');
                        }
                        break; // Success, exit retry loop

                    } catch (error) {
                        lastError = error;
                        console.error('Error during send attempt:', error);
                        retries--;
                        if (retries > 0) {
                            console.log(`Retrying... ${retries} attempts left`);
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                        }
                    }
                }

                if (!success) {
                    failCount++;
                    console.error('Message failed after all retries:', lastError);
                }

            } catch (error) {
                console.error('Error sending message:', error);
                failCount++;
            }

            updateProgress(successCount, failCount, messages.length);
        }

        // Final status update
        if (failCount > 0) {
            showStatus(`Completed with ${failCount} failures. Check console for details.`, 'warning');
        } else {
            showStatus('All messages sent successfully!', 'success');
        }
    }

    function updateProgress(success, fail, total) {
        const message = `Sent: ${success}/${total} (Failed: ${fail})`;
        showStatus(message, success === total ? 'success' : 'warning');
    }

    function showStatus(message, type) {
        messageStatus.textContent = message;
        messageStatus.className = `alert alert-${type}`;
        messageStatus.style.display = 'block';
    }
});
