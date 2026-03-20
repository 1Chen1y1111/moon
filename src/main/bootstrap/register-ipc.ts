import { ipcMain } from 'electron'

import { ipcChannels } from '../ipc/channels'
import type { SettingsService } from '../services/settings-service'

type RegisterIpcDependencies = {
  settingsService: SettingsService
}

export function registerIpcHandlers({ settingsService }: RegisterIpcDependencies): void {
  ipcMain.removeHandler(ipcChannels.settings.get)
  ipcMain.removeHandler(ipcChannels.settings.saveProvider)

  ipcMain.handle(ipcChannels.settings.get, () => settingsService.getSettings())
  ipcMain.handle(ipcChannels.settings.saveProvider, (_event, input) =>
    settingsService.saveProvider(input)
  )
}
