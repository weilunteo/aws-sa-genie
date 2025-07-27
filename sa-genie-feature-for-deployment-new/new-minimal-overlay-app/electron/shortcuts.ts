import { globalShortcut, app } from "electron";
import { IShortcutsHelperDeps } from "./main"; // Import the simplified interface

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps;

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps;
  }

  public registerGlobalShortcuts(): void {
    // Shortcut to toggle window visibility
    const toggleShortcut = "CommandOrControl+B";
    if (!globalShortcut.isRegistered(toggleShortcut)) {
      globalShortcut.register(toggleShortcut, () => {
        console.log(`${toggleShortcut} pressed. Toggling window visibility.`);
        this.deps.toggleMainWindow();
      });
      if (globalShortcut.isRegistered(toggleShortcut)) {
        console.log(`Successfully registered: ${toggleShortcut}`);
      } else {
        console.error(`Failed to register: ${toggleShortcut}`);
      }
    } else {
        console.warn(`${toggleShortcut} already registered.`);
    }

    // Movement shortcuts
    const movementShortcuts = {
      up: 'CommandOrControl+Up',
      down: 'CommandOrControl+Down',
      left: 'CommandOrControl+Left',
      right: 'CommandOrControl+Right'
    };

    Object.entries(movementShortcuts).forEach(([direction, shortcut]) => {
      if (!globalShortcut.isRegistered(shortcut)) {
        globalShortcut.register(shortcut, () => {
          console.log(`${shortcut} pressed. Moving window ${direction}.`);
          this.deps.moveWindow(direction as 'up' | 'down' | 'left' | 'right');
        });
        if (globalShortcut.isRegistered(shortcut)) {
          console.log(`Successfully registered: ${shortcut}`);
        } else {
          console.error(`Failed to register: ${shortcut}`);
        }
      } else {
        console.warn(`${shortcut} already registered.`);
      }
    });

    // Shortcut to toggle recording
    const recordingShortcut = "CommandOrControl+R";
    if (!globalShortcut.isRegistered(recordingShortcut)) {
      globalShortcut.register(recordingShortcut, () => {
        console.log(`${recordingShortcut} pressed. Toggling recording.`);
        this.deps.sendToRenderer('toggle-recording');
      });
      if (globalShortcut.isRegistered(recordingShortcut)) {
        console.log(`Successfully registered: ${recordingShortcut}`);
      } else {
        console.error(`Failed to register: ${recordingShortcut}`);
      }
    } else {
      console.warn(`${recordingShortcut} already registered.`);
    }

    // Optional: Shortcut to quit the app cleanly
    const quitShortcut = "CommandOrControl+Q";
    if (!globalShortcut.isRegistered(quitShortcut)) {
        globalShortcut.register(quitShortcut, () => {
            console.log(`${quitShortcut} pressed. Quitting application.`);
            app.quit();
        });
         if (globalShortcut.isRegistered(quitShortcut)) {
            console.log(`Successfully registered: ${quitShortcut}`);
        } else {
            console.error(`Failed to register: ${quitShortcut}`);
        }
    } else {
        console.warn(`${quitShortcut} already registered.`);
    }

  }

  public unregisterAllShortcuts(): void {
    console.log("Unregistering all global shortcuts.");
    globalShortcut.unregisterAll();
  }
}
