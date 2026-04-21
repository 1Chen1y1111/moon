import type { BrowserWindow } from 'electron'

import { ipcChannels } from '@ipc/channels'

export function registerWindowStateEvents(window: BrowserWindow): void {
  const publishWindowState = (): void => {
    window.webContents.send(ipcChannels.window.onStateChange, {
      isMaximized: window.isMaximized()
    })
  }

  window.on('maximize', publishWindowState)
  window.on('unmaximize', publishWindowState)
  window.on('restore', publishWindowState)
}
