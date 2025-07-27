"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthWindow = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const auth_1 = require("./auth");
// Auth window class to handle authentication window and logic
class AuthWindow {
    constructor(onAuthSuccess) {
        this.window = null;
        this.onAuthSuccess = onAuthSuccess;
        this.setupIpcHandlers();
    }
    // Create and show the auth window
    async createWindow() {
        // Check if already authenticated
        const isAuthenticated = await auth_1.Auth.isAuthenticated();
        if (isAuthenticated) {
            this.onAuthSuccess();
            return;
        }
        // Create the auth window if not already authenticated
        this.window = new electron_1.BrowserWindow({
            width: 400,
            height: 500,
            resizable: false,
            frame: false,
            transparent: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path_1.default.join(__dirname, 'preload.js'),
            },
            show: false,
        });
        // Load the login HTML file
        if (process.env.NODE_ENV === 'development') {
            this.window.loadFile('../login.html');
        }
        else {
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
    setupIpcHandlers() {
        // Handle login request
        electron_1.ipcMain.on('auth-login', async (event, { username, password }) => {
            try {
                const session = await auth_1.Auth.signIn(username, password);
                this.handleAuthSuccess(session);
            }
            catch (error) {
                this.sendAuthResponse({
                    success: false,
                    form: 'login',
                    message: error.message || 'Login failed'
                });
            }
        });
        // Handle signup request
        electron_1.ipcMain.on('auth-signup', async (event, { username, email, password }) => {
            try {
                await auth_1.Auth.signUp(username, password, email);
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
            }
            catch (error) {
                this.sendAuthResponse({
                    success: false,
                    form: 'signup',
                    message: error.message || 'Signup failed'
                });
            }
        });
        // Handle auth check request
        electron_1.ipcMain.on('auth-check', async (event) => {
            try {
                const isAuthenticated = await auth_1.Auth.isAuthenticated();
                if (isAuthenticated) {
                    const session = await auth_1.Auth.getSession();
                    this.handleAuthSuccess(session);
                }
                else {
                    event.sender.send('auth-check-response', false);
                }
            }
            catch (error) {
                event.sender.send('auth-check-response', false);
            }
        });
        // Handle confirmation code verification
        electron_1.ipcMain.on('auth-confirm', async (event, { username, code }) => {
            try {
                await auth_1.Auth.confirmSignUp(username, code);
                this.sendAuthResponse({
                    success: true,
                    form: 'confirm',
                    message: 'Email confirmed successfully!'
                });
            }
            catch (error) {
                this.sendAuthResponse({
                    success: false,
                    form: 'confirm',
                    message: error.message || 'Confirmation failed'
                });
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
            this.window.webContents.send('auth-response', response);
        }
    }
    // Clean up IPC handlers
    cleanup() {
        electron_1.ipcMain.removeAllListeners('auth-login');
        electron_1.ipcMain.removeAllListeners('auth-signup');
        electron_1.ipcMain.removeAllListeners('auth-check');
        electron_1.ipcMain.removeAllListeners('auth-confirm');
    }
}
exports.AuthWindow = AuthWindow;
//# sourceMappingURL=auth-window.js.map