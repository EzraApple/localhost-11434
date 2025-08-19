import { app, BrowserWindow } from 'electron'

function getDevServerURL(): string {
  const port = process.env.PORT ?? '3000'
  return `http://localhost:${port}`
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1800,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
  })

  const url = getDevServerURL()
  await win.loadURL(url)
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

