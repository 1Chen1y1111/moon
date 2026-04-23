import { BrowserWindow, ipcMain } from 'electron'

import { ipcChannels } from '@ipc/channels'
import { openSettingsInputSchema } from '@ipc/contracts'
import type { AppSettings } from '../../shared/domain/settings'
import type { SettingsService } from '../services/settings-service'

type RegisterIpcDependencies = {
  settingsService: SettingsService
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
}

function broadcastSettingsChange(settings: AppSettings): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(ipcChannels.settings.onChange, settings)
  })
}

export function registerIpcHandlers({
  openSettingsWindow,
  settingsService
}: RegisterIpcDependencies): void {
  ipcMain.removeHandler(ipcChannels.settings.get)
  ipcMain.removeHandler(ipcChannels.settings.saveProvider)
  ipcMain.removeHandler(ipcChannels.settings.saveAppearance)
  ipcMain.removeHandler(ipcChannels.window.close)
  ipcMain.removeHandler(ipcChannels.window.minimize)
  ipcMain.removeHandler(ipcChannels.window.toggleMaximize)
  ipcMain.removeHandler(ipcChannels.window.openSettings)
  ipcMain.removeHandler(ipcChannels.window.getState)

  ipcMain.handle(ipcChannels.settings.get, () => settingsService.getSettings())
  ipcMain.handle(ipcChannels.settings.saveProvider, async (_event, input) => {
    const settings = await settingsService.saveProvider(input)

    broadcastSettingsChange(settings)

    return settings
  })
  ipcMain.handle(ipcChannels.settings.saveAppearance, async (_event, input) => {
    const settings = await settingsService.saveAppearance(input)

    broadcastSettingsChange(settings)

    return settings
  })
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
  ipcMain.handle(ipcChannels.window.openSettings, (_event, input) => {
    openSettingsWindow(openSettingsInputSchema.parse(input))
  })
  ipcMain.handle(ipcChannels.window.getState, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender)

    return {
      isMaximized: senderWindow?.isMaximized() ?? false
    }
  })
}
