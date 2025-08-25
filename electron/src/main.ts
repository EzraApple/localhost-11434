import { app, BrowserWindow } from 'electron'

function getDevServerURL(): string {
  const port = process.env.PORT ?? '3000'
  return `http://localhost:${port}`
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 2240,
    height: 1400,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
  })

  const url = getDevServerURL()
  await win.loadURL(url)
  
  // Open dev tools for debugging
  // win.webContents.openDevTools()
}

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

