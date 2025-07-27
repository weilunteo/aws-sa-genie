import { contextBridge, ipcRenderer } from 'electron';

// Define the functions/properties to expose on window.electronAPI
const electronAPI = {
  // Function to send messages from Renderer to Main
  send: (channel: string, ...args: any[]) => {
    // Whitelist channels to prevent sending arbitrary messages
    const validSendChannels = [
      'request-resize',
      'websocket-connected',
      'websocket-error'
    ];
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`Blocked attempt to send on invalid channel: ${channel}`);
    }
  },
  // Function to receive messages from Main to Renderer
  on: (channel: string, listener: (...args: any[]) => void) => {
    // Whitelist channels to prevent listening on arbitrary messages
    const validReceiveChannels = [
      'toggle-recording',
      'websocket-message',
      'websocket-connected',
      'websocket-error'
    ];
    if (validReceiveChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => listener(...args));
    } else {
      console.warn(`Blocked attempt to listen on invalid channel: ${channel}`);
    }
  },
  // Function to invoke methods that return values
  invoke: (channel: string, ...args: any) => {
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
  removeListener: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// Expose the API securely using contextBridge
try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  contextBridge.exposeInMainWorld('envVars', {
    audioUploadUrl: process.env.AUDIO_UPLOAD_URL,  
  })
  console.log('Preload script: electronAPI exposed successfully.');
} catch (error) {
  console.error('Failed to expose electronAPI via contextBridge:', error);
}
