const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const auth = require('./auth');

// Auth window class to handle authentication window and logic
class AuthWindow {
  constructor(onAuthSuccess) {
    this.window = null;
    this.onAuthSuccess = onAuthSuccess;
    this.setupIpcHandlers();
  }

  // Create and show the auth window
  async createWindow() {
    // Create the auth window
    this.window = new BrowserWindow({
      width: 400,
      height: 500,
      resizable: false,
      frame: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        devTools: true
      },
      show: false,
    });

    // Load the login HTML file
    this.window.loadFile(path.join(__dirname, '../login.html'));

    // Show window when ready
    this.window.once('ready-to-show', () => {
      this.window?.show();
      // Open DevTools for debugging
      // this.window?.webContents.openDevTools({ mode: 'detach' });
    });

    // Handle window close
    this.window.on('closed', () => {
      this.window = null;
    });
  }

  // Set up IPC handlers for authentication
  setupIpcHandlers() {
    // Handle login request
    ipcMain.on('auth-login', async (event, { email, password }) => {
      console.log(`Login attempt for email: ${email}`);
      try {
        const session = await auth.signIn(email, password);
        console.log('Login successful');
        this.handleAuthSuccess(session);
      } catch (error) {
        console.error('Login failed:', error.message);
        this.sendAuthResponse({
          success: false,
          form: 'login',
          message: error.message || 'Login failed'
        });
      }
    });

    // Handle signup request
    ipcMain.on('auth-signup', async (event, { email, password }) => {
      console.log(`Signup attempt for email: ${email}`);
      try {
        await auth.signUp(email, password, email);
        
        this.sendAuthResponse({
          success: true,
          form: 'signup',
          message: 'Signup successful! Please check your email for verification.'
        });
        
        // Switch to login form after successful signup
        if (this.window) {
          this.window.webContents.executeJavaScript(`
            document.getElementById('signup-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
          `);
        }
      } catch (error) {
        this.sendAuthResponse({
          success: false,
          form: 'signup',
          message: error.message || 'Signup failed'
        });
      }
    });

    // Handle auth check request
    ipcMain.on('auth-check', async (event) => {
      try {
        const isAuthenticated = auth.isAuthenticated();
        console.log('Auth check result:', isAuthenticated);
        if (isAuthenticated) {
          this.handleAuthSuccess({ token: auth.getToken() });
        } else {
          event.sender.send('auth-check-response', false);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        event.sender.send('auth-check-response', false);
      }
    });
  }

  // Handle successful authentication
  handleAuthSuccess(session) {
    this.sendAuthResponse({
      success: true,
      form: 'login',
      message: 'Login successful'
    });
    
    // Close the auth window
    if (this.window) {
      this.window.close();
      this.window = null;
    }
    
    // Call the success callback
    this.onAuthSuccess();
  }

  // Send authentication response to renderer
  sendAuthResponse(response) {
    if (this.window && !this.window.isDestroyed()) {
      console.log('Sending auth response:', response);
      this.window.webContents.send('auth-response', response);
    }
  }

  // Clean up IPC handlers
  cleanup() {
    ipcMain.removeAllListeners('auth-login');
    ipcMain.removeAllListeners('auth-signup');
    ipcMain.removeAllListeners('auth-check');
  }
}

module.exports = { AuthWindow };