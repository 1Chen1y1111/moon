import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { electronApp, optimizer } from '@electron-toolkit/utils'

import { setApplicationIcon } from './bootstrap/app-icon'
import { openSettingsWindow } from './bootstrap/create-settings-window'
import { createMainWindow } from './bootstrap/create-window'
import { registerIpcHandlers } from './bootstrap/register-ipc'
import { bootstrapDatabase } from './db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from './db/connection'
import { SettingsRepository } from './repositories/settings-repository'
import { createSafeStorageSecretCodec } from './security/safe-storage-secret-codec'
import { SettingsService } from './services/settings-service'

let databaseConnection: AppDatabaseConnection | null = null

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  setApplicationIcon()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  databaseConnection = createDatabaseConnection(join(app.getPath('userData'), 'moon.sqlite'))
  bootstrapDatabase(databaseConnection)

  registerIpcHandlers({
    openSettingsWindow,
    settingsService: new SettingsService(
      new SettingsRepository(databaseConnection, createSafeStorageSecretCodec())
    )
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  if (databaseConnection !== null) {
    databaseConnection.close()
    databaseConnection = null
  }
})
