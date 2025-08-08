"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Minimal preload to keep surface area tiny. Extend later per design.
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('appShell', {
// Placeholder for future APIs (network status, app info, window controls)
});
