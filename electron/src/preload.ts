// Minimal preload to keep surface area tiny. Extend later per design.
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('appShell', {
  // Placeholder for future APIs (network status, app info, window controls)
})

