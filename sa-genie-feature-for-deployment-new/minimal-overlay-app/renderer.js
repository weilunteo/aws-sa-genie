const loadingIndicator = document.getElementById('loading-indicator');
const responseDisplay = document.getElementById('response-display');

// Function to show loading state
function showLoading() {
    loadingIndicator.style.display = 'block';
}

// Function to hide loading state
function hideLoading() {
    loadingIndicator.style.display = 'none';
}

// Function to display response
function displayResponse(text) {
    hideLoading();
    responseDisplay.style.whiteSpace = 'pre-wrap';
    responseDisplay.textContent = text;
    
    // Use a small delay to ensure content is rendered before measuring
    setTimeout(() => {
        requestWindowResize(); // Request resize after content is rendered
    }, 50);
}

// Function to handle WebSocket messages
function handleWebSocketMessage(message) {
    hideLoading();
    if (message && message.message) {
        displayResponse(message.message);
    }
}

// Track loading state
let isWriting = false;

// Function to handle DynamoDB write trigger
function handleDynamoDBWrite() {
    if (isWriting) {
        console.log('Already processing a write request');
        return;
    }

    isWriting = true;
    showLoading();
    window.electronAPI.send('trigger-dynamodb-write');
    
    // Set a timeout to cancel if no response is received
    setTimeout(() => {
        if (!isWriting) return;
        isWriting = false;
        hideLoading();
        displayResponse('No response received within 30 seconds');
    }, 30000);
}

// Update WebSocket message handler to reset writing state
function handleWebSocketMessage(message) {
    isWriting = false;
    hideLoading();
    if (message && message.message) {
        displayResponse(message.message);
    }
}

// Update error handler to reset writing state
window.electronAPI.on('websocket-error', (error) => {
    isWriting = false;
    console.error("WebSocket error:", error);
    displayResponse(`Error: ${error}`);
});

class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.stream = null;
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            this.stream = stream;
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm; codecs=opus' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioContext = new AudioContext();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Convert to MP3
                const mp3Data = this.convertToMP3(audioBuffer);
                const mp3Blob = new Blob([mp3Data], { type: 'audio/mp3' });
                await this.invokeLambda(mp3Blob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateStatus(true);
            this.showNotification('Recording started');

        } catch (error) {
            console.error('Error starting recording:', error);
            this.showNotification('Failed to start recording. Check microphone permissions.', 'error');
        }
    }

    stopRecording() {
        if (!this.mediaRecorder || !this.isRecording || !this.stream) return;

        this.mediaRecorder.stop();
        this.stream.getTracks().forEach(track => track.stop());
        this.isRecording = false;
        this.updateStatus(false);
        this.showNotification('Recording stopped');
    }

    toggleRecording() {
        if (!this.isRecording) {
            this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    convertToMP3(audioBuffer) {
        const channels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const samples = audioBuffer.getChannelData(0);
        
        // Convert float32 samples to int16
        const sampleCount = samples.length;
        const int16Samples = new Int16Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
            int16Samples[i] = samples[i] * 0x7FFF;
        }

        // Initialize MP3 encoder
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
        const mp3Data = [];

        // Encode to MP3
        const chunkSize = 1152; // Must be multiple of 576
        for (let i = 0; i < int16Samples.length; i += chunkSize) {
            const chunk = int16Samples.subarray(i, i + chunkSize);
            const mp3buf = mp3encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        // Get the last chunk of data
        const finalChunk = mp3encoder.flush();
        if (finalChunk.length > 0) {
            mp3Data.push(finalChunk);
        }

        // Combine chunks into single Uint8Array
        const totalLength = mp3Data.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of mp3Data) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result;
    }

    async invokeLambda(blob) {
        try {
            // Convert blob to base64 in chunks to avoid stack overflow
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Process in chunks to avoid "Maximum call stack size exceeded"
            const chunkSize = 1024 * 1024; // 1MB chunks
            let base64Data = '';

            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                const binary = Array.from(chunk).map(b => String.fromCharCode(b)).join('');
                base64Data += btoa(binary);
            }

            displayResponse('Uploading recording...');
            
            // Get appId from the Electron app
            const appId = await window.electronAPI.invoke('get-app-id');
            
            // Call API Gateway endpoint
            const response = await fetch('https://8n8u17reg9.execute-api.us-east-1.amazonaws.com/audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    body: base64Data,
                    appId: appId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Audio upload result:', result);
            this.showNotification('Recording uploaded successfully');
            
            // Display the upload result
            displayResponse(`Recording saved as: ${result.filename}`);
            
        } catch (error) {
            console.error('Error invoking API:', error);
            this.showNotification('Failed to upload recording', 'error');
            displayResponse('Error: Failed to upload recording. Please try again.');
        }
    }

    updateStatus(isRecording) {
        // Status is now only tracked internally, no UI update needed
        console.log(`Recording status: ${isRecording ? 'Recording' : 'Not Recording'}`);
    }

    showNotification(message, type = 'info') {
        displayResponse(message);
    }
}

const audioRecorder = new AudioRecorder();
const BASE_HEIGHT = 70;
// --- Helper Functions ---

// Function to request window resize based on content
function requestWindowResize() {
    console.log("hi from request window resize")
    // Use requestAnimationFrame to ensure layout is calculated
    requestAnimationFrame(() => {
        // Get the total height needed by adding shortcuts and content area heights
        const shortcutsHeight = document.querySelector('.shortcuts').offsetHeight;
        const respDisplayHeight = document.getElementById('response-display').scrollHeight;
        const totalHeight = Math.max(BASE_HEIGHT, shortcutsHeight + respDisplayHeight + 16); // Add padding

        if (window.electronAPI) {
            console.log(`Requesting resize - Total: ${totalHeight}, respDisplayHeight: ${respDisplayHeight}, Shortcuts: ${shortcutsHeight}`);
            window.electronAPI.send('request-resize', totalHeight);
        } else {
            console.error("electronAPI not found, cannot request resize.");
        }
    });
}


// --- IPC Event Listeners ---

if (window.electronAPI) {
    // Listen for toggle recording from main process (Cmd+R)
    window.electronAPI.on('toggle-recording', () => {
        console.log("Received toggle-recording signal.");
        audioRecorder.toggleRecording();
    });

    // Listen for trigger-dynamodb-write from main process (Cmd+N)
    window.electronAPI.on('trigger-dynamodb-write', () => {
        console.log("Received trigger-dynamodb-write signal.");
        handleDynamoDBWrite();
    });

    // Listen for WebSocket messages
    window.electronAPI.on('websocket-message', (message) => {
        console.log("Received WebSocket message:", message);
        handleWebSocketMessage(message);
    });

    // Listen for WebSocket connection status
    window.electronAPI.on('websocket-connected', () => {
        console.log("WebSocket connected");
        displayResponse('WebSocket connected');
    });

    // Listen for WebSocket errors
    window.electronAPI.on('websocket-error', (error) => {
        console.error("WebSocket error:", error);
        displayResponse(`Error: ${error}`);
    });

    // Initial resize request on load
    window.electronAPI.send('request-resize', BASE_HEIGHT);
} else {
    console.error("electronAPI not found on window object. IPC communication will not work.");
    responseDisplay.textContent = "Error: Could not initialize communication.";
}

// Cleanup listeners on window unload
window.addEventListener('beforeunload', () => {
    if (window.electronAPI) {
        window.electronAPI.removeAllListeners('toggle-recording');
    }
    if (audioRecorder.isRecording) {
        audioRecorder.stopRecording();
    }
});

console.log("Renderer script loaded.");
