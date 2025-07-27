const { app, BrowserWindow, screen, ipcMain } = require("electron");
const path = require("path");
const { DynamoDB } = require('aws-sdk');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const auth = require('./auth');
const { AuthWindow } = require('./auth-window');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// AWS Configuration
const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1'
  // AWS SDK will automatically load credentials from ~/.aws/credentials
};

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const WEBSOCKET_URL = process.env.WEBSOCKET_URL;

if (!DYNAMODB_TABLE || !WEBSOCKET_URL) {
  console.error('Missing required environment variables. Please check your .env file.');
  app.quit();
}

// Initialize AWS SDK
const dynamodb = new DynamoDB.DocumentClient(AWS_CONFIG);

// WebSocket client
let wsClient = null;
let appId = uuidv4(); // Generate unique app ID

// Initialize Express app for exposing appId
const expressApp = express();
expressApp.use(cors()); // Enable CORS for TamperMonkey script

// Endpoint to get appId
expressApp.get('/appId', (req, res) => {
  res.json({ appId });
});

// Start HTTP server
const HTTP_PORT = process.env.HTTP_PORT || 3001;
expressApp.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on port ${HTTP_PORT}`);
});

// Constants
const INITIAL_HEIGHT = 35; // Start with minimal height for shortcuts
const RECONNECT_INTERVAL = 5000; // 5 seconds
const MAX_HEIGHT = 750; // Maximum allowed height (User adjusted)
const MIN_HEIGHT = INITIAL_HEIGHT; // Minimum height constraint

// WebSocket functions
async function connectWebSocket() {
  if (wsClient) {
    wsClient.close();
  }

  // Get auth token for WebSocket connection
  let authParams = `?appId=${appId}`;
  
  try {
    // Add auth token if available
    if (auth.isAuthenticated()) {
      const token = auth.getToken();
      // Use 'Auth' as the query parameter name to match your Lambda authorizer configuration
      authParams += `&Auth=${token}`;
      console.log(`Connecting to WebSocket with token`);
    }
  } catch (error) {
    console.error('Error getting authentication token:', error);
  }

  wsClient = new WebSocket(`${WEBSOCKET_URL}${authParams}`);

  wsClient.on('open', () => {
    console.log('WebSocket connected');
    if (state.mainWindow) {
      state.mainWindow.webContents.send('websocket-connected');
    }
  });

  wsClient.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (state.mainWindow) {
        state.mainWindow.webContents.send('websocket-message', message);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  wsClient.on('close', () => {
    console.log('WebSocket disconnected, attempting to reconnect...');
    setTimeout(connectWebSocket, RECONNECT_INTERVAL);
  });

  wsClient.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (state.mainWindow) {
      state.mainWindow.webContents.send('websocket-error', error.message);
    }
  });
}

// DynamoDB functions
async function writeToDynamoDB() {
  if (!DYNAMODB_TABLE) {
    console.error('DYNAMODB_TABLE is not configured');
    return;
  }

  try {
    const params = {
      TableName: DYNAMODB_TABLE,
      Item: {
        id: uuidv4(),
        appId: appId,
        message: `Hello World at ${new Date()}`,
        timestamp: Date.now()
      }
    };

    await dynamodb.put(params).promise();
    console.log('Successfully wrote to DynamoDB');
  } catch (error) {
    console.error('Error writing to DynamoDB:', error);
    if (state.mainWindow) {
      state.mainWindow.webContents.send('websocket-error', 'Failed to write to DynamoDB');
    }
  }
}

// Application State instance with initial values
const state = {
  wsClient: null,
  mainWindow: null,
  isWindowVisible: false,
  windowPosition: null,
  windowSize: null,
  shortcutsHelper: null,
  isLoading: false, // Initialize isLoading
};

// Window movement function
function moveWindow(direction) {
  if (!state.mainWindow || !state.isWindowVisible) return;
  
  const bounds = state.mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint(bounds);
  const workArea = display.workArea;
  const step = 50; // pixels to move per keypress
  
  let newX = bounds.x;
  let newY = bounds.y;
  
  switch (direction) {
    case 'up':
      newY = Math.max(workArea.y, bounds.y - step);
      break;
    case 'down':
      newY = Math.min(workArea.y + workArea.height - bounds.height, bounds.y + step);
      break;
    case 'left':
      newX = Math.max(workArea.x, bounds.x - step);
      break;
    case 'right':
      newX = Math.min(workArea.x + workArea.width - bounds.width, bounds.x + step);
      break;
  }
  
  state.mainWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
  // Update window position state
  state.windowPosition = { x: newX, y: newY };
}

// IPC sending function
function sendToRenderer(channel, ...args) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) {
    console.warn(`Cannot send IPC [${channel}]: Window not available`);
    return;
  }

  if (!state.isWindowVisible) {
    // If window is hidden, show it first
    showMainWindow();
    // Wait for the window to be ready
    state.mainWindow.once('ready-to-show', () => {
      if (state.mainWindow && !state.mainWindow.isDestroyed() && state.mainWindow.webContents) {
        state.mainWindow.webContents.send(channel, ...args);
        console.log(`IPC Sent -> Renderer [${channel}]:`, args);
      }
    });
  } else {
    // Window is visible, send message directly
    if (state.mainWindow.webContents) {
      state.mainWindow.webContents.send(channel, ...args);
      console.log(`IPC Sent -> Renderer [${channel}]:`, args);
    } else {
      console.warn(`Cannot send IPC [${channel}]: WebContents not available`);
    }
  }
}

// Loading state functions
function setIsLoading(loading) {
  state.isLoading = loading;
  console.log(`Loading state set to: ${loading}`);
}

function isLoading() {
  return state.isLoading;
}

// Initialize helpers
function initializeHelpers() {
  const { ShortcutsHelper } = require('./shortcuts');
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    isVisible: () => state.isWindowVisible,
    toggleMainWindow,
    moveWindow,
    sendToRenderer,
    setIsLoading,
    isLoading
  });
  
  state.shortcutsHelper.registerGlobalShortcuts();
  console.log("Helpers initialized");
}

// Window management functions
async function createWindow() {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;

  const windowSettings = {
    width: 500, // Width to fit all shortcuts in one row
    height: INITIAL_HEIGHT, // Use constant from top scope
    minHeight: MIN_HEIGHT, // Use constant from top scope
    maxHeight: MAX_HEIGHT, // Use constant from top scope
    x: 50, // Position top-left initially
    y: 50,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false, // Keep false for security
      contextIsolation: true, // Keep true for security
      preload: path.join(__dirname, 'preload.js'), // Use the preload script
    },
    show: false, // Start hidden
    frame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    opacity: 0.0, // Start fully transparent
    backgroundColor: "#000000",
    focusable: false, // Not focusable initially
    skipTaskbar: true,
    type: "panel", // Use panel type for overlay behavior
    movable: true, // Allow moving if needed
    resizable: false, // Prevent manual resizing via cursor
  };

  state.mainWindow = new BrowserWindow(windowSettings);
  // Load the HTML file and handle ready-to-show
  state.mainWindow.once('ready-to-show', () => {
    console.log('Window is ready to show');
    state.mainWindow?.show();
    // Open DevTools after window is shown
    // state.mainWindow?.webContents.openDevTools({
    //   mode: 'detach',
    //   activate: true
    // });
    showMainWindow(); // Make sure window is visible and properly configured
  });

  state.mainWindow.loadFile('index.html');

  // Configure window behavior
  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  state.mainWindow.setContentProtection(false); // Allow for screen capture

  if (process.platform === "darwin") {
    state.mainWindow.setHiddenInMissionControl(true);
    state.mainWindow.setWindowButtonVisibility(false);
    state.mainWindow.setSkipTaskbar(true);
    state.mainWindow.setHasShadow(false);
  }

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove);
  state.mainWindow.on("resize", handleWindowResize);
  state.mainWindow.on("closed", handleWindowClosed);

  // Initialize window state
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
  state.windowSize = { width: bounds.width, height: bounds.height };
  state.isWindowVisible = false; // Start hidden/transparent

  // Initially hide the window properly
  hideMainWindow();
}

function handleWindowMove() {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
}

function handleWindowResize() {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowSize = { width: bounds.width, height: bounds.height };
}

function handleWindowClosed() {
  state.mainWindow = null;
  state.isWindowVisible = false;
  state.windowPosition = null;
  state.windowSize = null;
}

// Window visibility functions
function hideMainWindow() {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    const bounds = state.mainWindow.getBounds();
    state.windowPosition = { x: bounds.x, y: bounds.y };
    state.windowSize = { width: bounds.width, height: bounds.height };
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true }); // Ignore mouse events when hidden
    state.mainWindow.setOpacity(0); // Fully transparent
    state.mainWindow.setFocusable(false); // Not focusable
    state.isWindowVisible = false;
    console.log('Window hidden (Opacity: 0, IgnoreMouse: true)');
  }
}

function showMainWindow() {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    if (state.windowPosition && state.windowSize) {
      state.mainWindow.setBounds({
        ...state.windowPosition,
        ...state.windowSize,
      });
    }
    state.mainWindow.setIgnoreMouseEvents(false); // Capture mouse events when visible
    state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    state.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    state.mainWindow.setOpacity(0.7); // Fully opaque (or desired visible opacity)
    state.mainWindow.showInactive(); // Show without stealing focus
    state.mainWindow.setFocusable(true); // Allow focus if needed
    state.isWindowVisible = true;
    console.log('Window shown (Opacity: 1, IgnoreMouse: false)');
  }
}

function toggleMainWindow() {
  console.log(`Toggling window. Current state: ${state.isWindowVisible ? 'visible' : 'hidden'}`);
  if (state.isWindowVisible) {
    hideMainWindow();
  } else {
    // Ensure window exists before showing
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
        createWindow().then(showMainWindow);
    } else {
        showMainWindow();
    }
  }
}

// Auth window instance
let authWindow = null;

// Initialize application
async function initializeApp() {
  try {
    // Force Single Instance Lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      console.log("Another instance of the app is running. Exiting...")
      return;
    }
    
    console.log("Showing login window");
    // Initialize auth window and handle authentication
    authWindow = new AuthWindow(() => {
      // This callback is called when authentication is successful
      connectWebSocket();
      initializeHelpers();
      createWindow();
    });
    
    // Show auth window first
    await authWindow.createWindow();

    // Setup IPC listeners from Renderer
    ipcMain.on('api-mock-finished', () => {
      console.log("IPC Received <- Renderer [api-mock-finished]");
      setIsLoading(false); // Update loading state
    });

    ipcMain.on('api-mock-cancelled', () => {
      console.log("IPC Received <- Renderer [api-mock-cancelled]");
      setIsLoading(false); // Update loading state
    });

    // Add new IPC listeners for DynamoDB and WebSocket
    ipcMain.on('trigger-dynamodb-write', async () => {
      console.log("IPC Received <- Renderer [trigger-dynamodb-write]");
      await writeToDynamoDB();
    });

    ipcMain.on('websocket-connected', () => {
      console.log("IPC Received <- Renderer [websocket-connected]");
    });

    ipcMain.on('websocket-error', (event, error) => {
      console.error("WebSocket error:", error);
    });

    // Listen for resize requests from the renderer
    ipcMain.on('request-resize', (event, requestedHeight) => {
      console.log("requestedHeight: " + requestedHeight);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        const PADDING = 16; // Account for 8px top/bottom body padding
        // Use constants from top scope
        // Ensure height is within bounds and add padding
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(requestedHeight) + PADDING));

        const currentBounds = state.mainWindow.getBounds();
        if (currentBounds.height !== newHeight) {
          state.mainWindow.setBounds({ height: newHeight, width: currentBounds.width }, true);
          state.windowSize = { width: currentBounds.width, height: newHeight };
        }
      }
    });

    console.log("Minimal overlay app initialized.");

  } catch (error) {
    console.error("Failed to initialize application:", error);
    app.quit();
  }
}

app.on("window-all-closed", () => {
  // On macOS it's common to stay active until the user quits explicitly
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (!state.isWindowVisible) {
    // Optional: show the window if it's hidden when activated
    // toggleMainWindow();
  }
});

// State getter functions
function getMainWindow() {
  return state.mainWindow;
}

// Export necessary functions
exports.toggleMainWindow = toggleMainWindow;
exports.getMainWindow = getMainWindow;
exports.moveWindow = moveWindow;

// Handle get-app-id invoke from renderer
ipcMain.handle('get-app-id', async () => {
  return appId;
});

// App Ready
app.whenReady().then(initializeApp);

// Ensure cleanup on quit
app.on('will-quit', () => {
  // Close WebSocket connection
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }

  // Unregister shortcuts
  if (state.shortcutsHelper) {
    state.shortcutsHelper.unregisterAllShortcuts();
  }

  // Clean up auth window
  if (authWindow) {
    authWindow.cleanup();
    authWindow = null;
  }

  ipcMain.removeAllListeners('api-mock-finished');
  ipcMain.removeAllListeners('api-mock-cancelled');
  ipcMain.removeAllListeners('request-resize'); // Clean up resize listener
  ipcMain.removeAllListeners('auth-login');
  ipcMain.removeAllListeners('auth-signup');
  ipcMain.removeAllListeners('auth-check');
});