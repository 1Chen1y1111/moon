import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

import { is } from '@electron-toolkit/utils'

import icon from '../../../resources/icon.png?asset'
import { registerWindowStateEvents } from './window-state-events'

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }

    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' as const } : {}),
    ...(process.platform === 'win32' ? { frame: false } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.platform === 'darwin') {
    settingsWindow.setWindowButtonVisibility(false)
  }

  registerWindowStateEvents(settingsWindow)

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.webContents.openDevTools({
      mode: 'detach'
    })
    void settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/settings`)
  } else {
    void settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/settings'
    })
  }

  return settingsWindow
}
