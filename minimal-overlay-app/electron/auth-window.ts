import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { Auth } from './auth';

// Auth window class to handle authentication window and logic
export class AuthWindow {
  private window: BrowserWindow | null = null;
  private onAuthSuccess: () => void;

  constructor(onAuthSuccess: () => void) {
    this.onAuthSuccess = onAuthSuccess;
    this.setupIpcHandlers();
  }

  // Create and show the auth window
  public async createWindow(): Promise<void> {
    // Check if already authenticated
    const isAuthenticated = await Auth.isAuthenticated();
    if (isAuthenticated) {
      this.onAuthSuccess();
      return;
    }

    // Create the auth window if not already authenticated
    this.window = new BrowserWindow({
      width: 400,
      height: 500,
      resizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      show: false,
    });

    // Load the login HTML file
    if (process.env.NODE_ENV === 'development') {
      this.window.loadFile('../login.html');
    } else {
      this.window.loadFile('login.html');
    }

    // Show window when ready
    this.window.once('ready-to-show', () => {
      this.window?.show();
    });

    // Handle window close
    this.window.on('closed', () => {
      this.window = null;
    });
  }

  // Set up IPC handlers for authentication
  private setupIpcHandlers(): void {
    // Handle login request
    ipcMain.on('auth-login', async (event, { username, password }) => {
      try {
        const session = await Auth.signIn(username, password);
        this.handleAuthSuccess(session);
      } catch (error: any) {
        this.sendAuthResponse({
          success: false,
          form: 'login',
          message: error.message || 'Login failed'
        });
      }
    });

    // Handle signup request
    ipcMain.on('auth-signup', async (event, { username, email, password }) => {
      try {
        await Auth.signUp(username, password, email);
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
      } catch (error: any) {
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
        const isAuthenticated = await Auth.isAuthenticated();
        if (isAuthenticated) {
          const session = await Auth.getSession();
          this.handleAuthSuccess(session);
        } else {
          event.sender.send('auth-check-response', false);
        }
      } catch (error) {
        event.sender.send('auth-check-response', false);
      }
    });
    
    // Handle confirmation code verification
    ipcMain.on('auth-confirm', async (event, { username, code }) => {
      try {
        await Auth.confirmSignUp(username, code);
        this.sendAuthResponse({
          success: true,
          form: 'confirm',
          message: 'Email confirmed successfully!'
        });
      } catch (error: any) {
        this.sendAuthResponse({
          success: false,
          form: 'confirm',
          message: error.message || 'Confirmation failed'
        });
      }
    });
  }

  // Handle successful authentication
  private handleAuthSuccess(session: any): void {
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
  private sendAuthResponse(response: any): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('auth-response', response);
    }
  }

  // Clean up IPC handlers
  public cleanup(): void {
    ipcMain.removeAllListeners('auth-login');
    ipcMain.removeAllListeners('auth-signup');
    ipcMain.removeAllListeners('auth-check');
    ipcMain.removeAllListeners('auth-confirm');
  }
}