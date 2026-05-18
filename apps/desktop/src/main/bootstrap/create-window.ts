import electron from 'electron'
import { join } from 'node:path'

import { is } from '@electron-toolkit/utils'

import { browserWindowIcon } from './app-icon'
import { registerWindowSecurity } from './window-security'
import { registerWindowStateEvents } from './window-state-events'

const { BrowserWindow } = electron
type MoonBrowserWindow = InstanceType<typeof BrowserWindow>

export function createMainWindow(): MoonBrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Moon',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
    ...(process.platform === 'win32' ? { frame: false } : {}),
    ...(process.platform !== 'darwin' ? { icon: browserWindowIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false)
  }

  registerWindowStateEvents(mainWindow)
  registerWindowSecurity(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.openDevTools({
      mode: 'detach'
    })
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
