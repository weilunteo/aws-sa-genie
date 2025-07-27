const { globalShortcut } = require('electron');

class ShortcutsHelper {
  constructor(deps) {
    this.deps = deps;
    this.registeredShortcuts = [];
  }

  registerGlobalShortcuts() {
    // Toggle visibility shortcut (Cmd/Ctrl+B)
    this.registerShortcut('CommandOrControl+B', () => {
      console.log('Shortcut: Toggle visibility');
      this.deps.toggleMainWindow();
    });

    // Movement shortcuts
    this.registerShortcut('CommandOrControl+Up', () => {
      console.log('Shortcut: Move up');
      this.deps.moveWindow('up');
    });

    this.registerShortcut('CommandOrControl+Down', () => {
      console.log('Shortcut: Move down');
      this.deps.moveWindow('down');
    });

    this.registerShortcut('CommandOrControl+Left', () => {
      console.log('Shortcut: Move left');
      this.deps.moveWindow('left');
    });

    this.registerShortcut('CommandOrControl+Right', () => {
      console.log('Shortcut: Move right');
      this.deps.moveWindow('right');
    });

    // Recording shortcut (Cmd/Ctrl+R)
    this.registerShortcut('CommandOrControl+R', () => {
      console.log('Shortcut: Toggle recording');
      if (this.deps.isLoading && this.deps.isLoading()) {
        console.log('Ignoring shortcut while loading');
        return;
      }
      this.deps.sendToRenderer('toggle-recording');
    });

    console.log('Global shortcuts registered');
  }

  registerShortcut(accelerator, callback) {
    try {
      const success = globalShortcut.register(accelerator, callback);
      if (success) {
        this.registeredShortcuts.push(accelerator);
        console.log(`Registered shortcut: ${accelerator}`);
      } else {
        console.error(`Failed to register shortcut: ${accelerator}`);
      }
    } catch (error) {
      console.error(`Error registering shortcut ${accelerator}:`, error);
    }
  }

  unregisterAllShortcuts() {
    this.registeredShortcuts.forEach(shortcut => {
      try {
        globalShortcut.unregister(shortcut);
        console.log(`Unregistered shortcut: ${shortcut}`);
      } catch (error) {
        console.error(`Error unregistering shortcut ${shortcut}:`, error);
      }
    });
    this.registeredShortcuts = [];
    globalShortcut.unregisterAll();
  }
}

module.exports = { ShortcutsHelper };