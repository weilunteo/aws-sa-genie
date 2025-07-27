const { contextBridge, ipcRenderer } = require('electron');

// Define the functions/properties to expose on window.electronAPI
const electronAPI = {
  // Function to send messages from Renderer to Main
  send: (channel, ...args) => {
    // Whitelist channels to prevent sending arbitrary messages
    const validSendChannels = [
      'request-resize',
      'trigger-dynamodb-write',
      'websocket-connected',
      'websocket-error',
      'auth-login',
      'auth-signup',
      'auth-check'
    ];
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`Blocked attempt to send on invalid channel: ${channel}`);
    }
  },
  // Function to receive messages from Main to Renderer
  on: (channel, listener) => {
    // Whitelist channels to prevent listening on arbitrary messages
    const validReceiveChannels = [
      'toggle-recording',
      'trigger-dynamodb-write',
      'websocket-message',
      'websocket-connected',
      'websocket-error',
      'auth-response',
      'auth-check-response'
    ];
    if (validReceiveChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => listener(...args));
    } else {
      console.warn(`Blocked attempt to listen on invalid channel: ${channel}`);
    }
  },
  // Function to invoke methods that return values
  invoke: (channel, ...args) => {
    const validInvokeChannels = [
      'get-app-id'
    ];
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    } else {
      console.warn(`Blocked attempt to invoke on invalid channel: ${channel}`);
      return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
    }
  },
  // Function to remove listeners (important for cleanup)
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// Expose the API securely using contextBridge
try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('Preload script: electronAPI exposed successfully.');
} catch (error) {
  console.error('Failed to expose electronAPI via contextBridge:', error);
}