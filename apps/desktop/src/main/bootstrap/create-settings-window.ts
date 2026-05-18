import electron from 'electron'
import { join } from 'node:path'

import { is } from '@electron-toolkit/utils'

import { browserWindowIcon } from './app-icon'
import { registerWindowSecurity } from './window-security'
import { registerWindowStateEvents } from './window-state-events'

const { BrowserWindow } = electron
type MoonBrowserWindow = InstanceType<typeof BrowserWindow>

let settingsWindow: MoonBrowserWindow | null = null

type SettingsWindowOptions = {
  section?: 'providers'
}

function createSettingsHash(options?: SettingsWindowOptions): string {
  if (options?.section === 'providers') {
    return '/settings?section=providers'
  }

  return '/settings'
}

function loadSettingsRoute(window: MoonBrowserWindow, options?: SettingsWindowOptions): void {
  const hash = createSettingsHash(options)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
    return
  }

  void window.loadFile(join(__dirname, '../renderer/index.html'), {
    hash
  })
}

export function openSettingsWindow(options?: SettingsWindowOptions): MoonBrowserWindow {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore()
    }

    if (options?.section !== undefined) {
      loadSettingsRoute(settingsWindow, options)
    }

    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Moon',
    minWidth: 780,
    minHeight: 640,
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
    settingsWindow.setWindowButtonVisibility(false)
  }

  registerWindowStateEvents(settingsWindow)
  registerWindowSecurity(settingsWindow)

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.webContents.openDevTools({
      mode: 'detach'
    })
  }

  loadSettingsRoute(settingsWindow, options)

  return settingsWindow
}
