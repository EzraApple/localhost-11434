"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function getDevServerURL() {
    const port = process.env.PORT ?? '3000';
    return `http://localhost:${port}`;
}
async function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 2240,
        height: 1400,
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
        },
        titleBarStyle: 'hiddenInset',
    });
    const url = getDevServerURL();
    await win.loadURL(url);
    // Open dev tools for debugging
    // win.webContents.openDevTools()
}
electron_1.app.whenReady().then(async () => {
    await createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            void createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
