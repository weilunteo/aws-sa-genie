import { app, BrowserWindow, screen, ipcMain } from "electron";
import path from "path";
import { ShortcutsHelper } from "./shortcuts";
import { DynamoDB } from 'aws-sdk';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { AuthWindow } from './auth-window';
import { Auth } from './auth';

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
let wsClient: WebSocket | null = null;
let appId: string = uuidv4(); // Generate unique app ID

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

  // Get JWT token for authentication
  let authParams = `?appId=${appId}`;
  
  try {
    // Add JWT token if authenticated
    const isAuthenticated = await Auth.isAuthenticated();
    if (isAuthenticated) {
      const token = await Auth.getJwtToken();
      // Use 'Auth' as the query parameter name to match your Lambda authorizer configuration
      authParams += `&Auth=${token}`;
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

  wsClient.on('message', (data: WebSocket.Data) => {
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

  wsClient.on('error', (error: Error) => {
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
    const params: DynamoDB.DocumentClient.PutItemInput = {
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

// Define the type for the application state
interface AppState {
  wsClient: WebSocket | null;
  mainWindow: BrowserWindow | null;
  isWindowVisible: boolean;
  windowPosition: { x: number; y: number } | null;
  windowSize: { width: number; height: number } | null;
  shortcutsHelper: ShortcutsHelper | null;
  isLoading: boolean;
}

// Application State instance with initial values
const state: AppState = {
  wsClient: null,
  mainWindow: null,
  isWindowVisible: false,
  windowPosition: null,
  windowSize: null,
  shortcutsHelper: null,
  isLoading: false, // Initialize isLoading
};

// Interface for ShortcutsHelper dependencies
export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null;
  isVisible: () => boolean;
  toggleMainWindow: () => void;
  moveWindow: (direction: 'up' | 'down' | 'left' | 'right') => void;
  sendToRenderer: (channel: string, ...args: any[]) => void; // Added for IPC
  setIsLoading: (loading: boolean) => void; // Added for state management
  isLoading: () => boolean; // Added for state checking
}

// Window movement function
function moveWindow(direction: 'up' | 'down' | 'left' | 'right'): void {
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
function sendToRenderer(channel: string, ...args: any[]): void {
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
function setIsLoading(loading: boolean): void {
  state.isLoading = loading;
  console.log(`Loading state set to: ${loading}`);
}

function isLoading(): boolean {
  return state.isLoading;
}


// Initialize helpers
function initializeHelpers() {
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    isVisible: () => state.isWindowVisible,
    toggleMainWindow,
    moveWindow,
    sendToRenderer, // Pass the IPC function
    setIsLoading,   // Pass the state setter
    isLoading,      // Pass the state getter
  } as IShortcutsHelperDeps);
}

// Window management functions
async function createWindow(): Promise<void> {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workAreaSize;
  // Constants moved to top scope

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
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
    state.mainWindow?.webContents.openDevTools({
      mode: 'detach',
      activate: true
    });
    showMainWindow(); // Make sure window is visible and properly configured
  });

  if (process.env.NODE_ENV === 'development') {
    state.mainWindow.loadFile('../index.html');
  } else {
    state.mainWindow.loadFile('index.html');
  }

  // Configure window behavior
  state.mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  state.mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
  // state.mainWindow.setContentProtection(true); // Prevent screen capture
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

function handleWindowMove(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowPosition = { x: bounds.x, y: bounds.y };
}

function handleWindowResize(): void {
  if (!state.mainWindow) return;
  const bounds = state.mainWindow.getBounds();
  state.windowSize = { width: bounds.width, height: bounds.height };
}

function handleWindowClosed(): void {
  state.mainWindow = null;
  state.isWindowVisible = false;
  state.windowPosition = null;
  state.windowSize = null;
}

// Window visibility functions
function hideMainWindow(): void {
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

function showMainWindow(): void {
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
    // state.mainWindow.setContentProtection(true);
    state.mainWindow.setOpacity(0.7); // Fully opaque (or desired visible opacity)
    state.mainWindow.showInactive(); // Show without stealing focus
    state.mainWindow.setFocusable(true); // Allow focus if needed
    state.isWindowVisible = true;
    console.log('Window shown (Opacity: 1, IgnoreMouse: false)');
  }
}

function toggleMainWindow(): void {
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
let authWindow: AuthWindow | null = null;

// Initialize application
async function initializeApp() {
  // Connect to WebSocket
  try {
    // Force Single Instance Lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
      console.log("Another instance of the app is running. Exiting...")
      return;
    }
    
    // Check if Cognito is properly configured
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;
    
    if (!userPoolId || !clientId || userPoolId === 'us-east-1_example' || clientId === '1example23456789') {
      console.log("Cognito not configured, skipping authentication");
      // Skip auth and proceed directly
      connectWebSocket();
      initializeHelpers();
      await createWindow();
      state.shortcutsHelper?.registerGlobalShortcuts();
    } else {
      // Initialize auth window and handle authentication
      authWindow = new AuthWindow(() => {
        // This callback is called when authentication is successful
        connectWebSocket();
        initializeHelpers();
        createWindow().then(() => {
          state.shortcutsHelper?.registerGlobalShortcuts();
        });
      });
      
      // Show auth window first
      await authWindow.createWindow();
    }

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
    ipcMain.on('request-resize', (event, requestedHeight: number) => {
      console.log("requestedHeight: " + requestedHeight);
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        const PADDING = 16; // Account for 8px top/bottom body padding
        // Use constants from top scope
        // Ensure height is within bounds and add padding
        const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(requestedHeight) + PADDING));

        const currentBounds = state.mainWindow.getBounds();
        if (currentBounds.height !== newHeight) {
          // console.log(`Resizing window height from ${currentBounds.height} to ${newHeight}`);
          // Use setBounds for smoother resizing, especially on macOS (animate: true)
          state.mainWindow.setBounds({ height: newHeight, width: currentBounds.width }, true);
          // Update state immediately, though resize event will also fire
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
  // and there are no other windows open. Since we have a background app,
  // we might not need this, or might want to ensure the window is shown.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (!state.isWindowVisible) {
    // Optional: show the window if it's hidden when activated
    // toggleMainWindow();
  }
});

// State getter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow;
}

// Export necessary functions
export {
  toggleMainWindow,
  getMainWindow,
  moveWindow,
};

// App Ready
app.whenReady().then(initializeApp);

// Ensure cleanup on quit
app.on('will-quit', () => {
  // Close WebSocket connection
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }

  // Clean up auth window
  if (authWindow) {
    authWindow.cleanup();
    authWindow = null;
  }

  state.shortcutsHelper?.unregisterAllShortcuts();
  ipcMain.removeAllListeners('api-mock-finished');
  ipcMain.removeAllListeners('api-mock-cancelled');
  ipcMain.removeAllListeners('request-resize'); // Clean up resize listener
  ipcMain.removeAllListeners('auth-login');
  ipcMain.removeAllListeners('auth-signup');
  ipcMain.removeAllListeners('auth-check');
});
