// This script registers Ctrl+Q to quit the app
const { app, globalShortcut } = require('electron');

// Wait for app to be ready
app.whenReady().then(() => {
  // Register Ctrl+Q to quit the app
  globalShortcut.register('CommandOrControl+Q', () => {
    console.log('Ctrl+Q pressed, quitting app');
    app.quit();
  });
  
  console.log('Ctrl+Q shortcut registered');
});

// Export the module
module.exports = {};