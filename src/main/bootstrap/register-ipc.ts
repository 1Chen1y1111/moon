import { BrowserWindow, ipcMain } from 'electron'

import { ipcChannels } from '../ipc/channels'
import type { SettingsService } from '../services/settings-service'

type RegisterIpcDependencies = {
  settingsService: SettingsService
}

export function registerIpcHandlers({ settingsService }: RegisterIpcDependencies): void {
  ipcMain.removeHandler(ipcChannels.settings.get)
  ipcMain.removeHandler(ipcChannels.settings.saveProvider)
  ipcMain.removeHandler(ipcChannels.window.close)
  ipcMain.removeHandler(ipcChannels.window.minimize)
  ipcMain.removeHandler(ipcChannels.window.toggleMaximize)

  ipcMain.handle(ipcChannels.settings.get, () => settingsService.getSettings())
  ipcMain.handle(ipcChannels.settings.saveProvider, (_event, input) =>
    settingsService.saveProvider(input)
  )
  ipcMain.handle(ipcChannels.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(ipcChannels.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle(ipcChannels.window.toggleMaximize, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)

    if (senderWindow === null) {
      return
    }

    if (senderWindow.isMaximized()) {
      senderWindow.unmaximize()
      return
    }

    senderWindow.maximize()
  })
}
