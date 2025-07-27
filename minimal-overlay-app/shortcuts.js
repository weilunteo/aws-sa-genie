"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortcutsHelper = void 0;
const electron_1 = require("electron");
class ShortcutsHelper {
    constructor(deps) {
        this.deps = deps;
    }
    registerGlobalShortcuts() {
        // Shortcut to toggle window visibility
        const toggleShortcut = "CommandOrControl+B";
        if (!electron_1.globalShortcut.isRegistered(toggleShortcut)) {
            electron_1.globalShortcut.register(toggleShortcut, () => {
                console.log(`${toggleShortcut} pressed. Toggling window visibility.`);
                this.deps.toggleMainWindow();
            });
            if (electron_1.globalShortcut.isRegistered(toggleShortcut)) {
                console.log(`Successfully registered: ${toggleShortcut}`);
            }
            else {
                console.error(`Failed to register: ${toggleShortcut}`);
            }
        }
        else {
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
            if (!electron_1.globalShortcut.isRegistered(shortcut)) {
                electron_1.globalShortcut.register(shortcut, () => {
                    console.log(`${shortcut} pressed. Moving window ${direction}.`);
                    this.deps.moveWindow(direction);
                });
                if (electron_1.globalShortcut.isRegistered(shortcut)) {
                    console.log(`Successfully registered: ${shortcut}`);
                }
                else {
                    console.error(`Failed to register: ${shortcut}`);
                }
            }
            else {
                console.warn(`${shortcut} already registered.`);
            }
        });
        // // Shortcut to toggle recording
        // const recordingShortcut = "CommandOrControl+R";
        // if (!globalShortcut.isRegistered(recordingShortcut)) {
        //   globalShortcut.register(recordingShortcut, () => {
        //     console.log(`${recordingShortcut} pressed. Toggling recording.`);
        //     this.deps.sendToRenderer('toggle-recording');
        //   });
        //   if (globalShortcut.isRegistered(recordingShortcut)) {
        //     console.log(`Successfully registered: ${recordingShortcut}`);
        //   } else {
        //     console.error(`Failed to register: ${recordingShortcut}`);
        //   }
        // } else {
        //   console.warn(`${recordingShortcut} already registered.`);
        // }
        // // Shortcut to trigger DynamoDB write
        // const dynamoShortcut = "CommandOrControl+N";
        // if (!globalShortcut.isRegistered(dynamoShortcut)) {
        //   globalShortcut.register(dynamoShortcut, () => {
        //     console.log(`${dynamoShortcut} pressed. Triggering DynamoDB write.`);
        //     this.deps.sendToRenderer('trigger-dynamodb-write');
        //   });
        //   if (globalShortcut.isRegistered(dynamoShortcut)) {
        //     console.log(`Successfully registered: ${dynamoShortcut}`);
        //   } else {
        //     console.error(`Failed to register: ${dynamoShortcut}`);
        //   }
        // } else {
        //   console.warn(`${dynamoShortcut} already registered.`);
        // }
        // Optional: Shortcut to quit the app cleanly
        const quitShortcut = "CommandOrControl+Q";
        if (!electron_1.globalShortcut.isRegistered(quitShortcut)) {
            electron_1.globalShortcut.register(quitShortcut, () => {
                console.log(`${quitShortcut} pressed. Quitting application.`);
                electron_1.app.quit();
            });
            if (electron_1.globalShortcut.isRegistered(quitShortcut)) {
                console.log(`Successfully registered: ${quitShortcut}`);
            }
            else {
                console.error(`Failed to register: ${quitShortcut}`);
            }
        }
        else {
            console.warn(`${quitShortcut} already registered.`);
        }
    }
    unregisterAllShortcuts() {
        console.log("Unregistering all global shortcuts.");
        electron_1.globalShortcut.unregisterAll();
    }
}
exports.ShortcutsHelper = ShortcutsHelper;
//# sourceMappingURL=shortcuts.js.map