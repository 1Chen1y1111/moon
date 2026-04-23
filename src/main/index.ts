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
let isClosingDatabase = false

function getMigrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

async function closeDatabaseConnection(): Promise<void> {
  const connection = databaseConnection

  if (connection === null) {
    return
  }

  databaseConnection = null
  await connection.close()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.moon.app')
  setApplicationIcon()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  databaseConnection = await createDatabaseConnection(join(app.getPath('userData'), 'moon-pglite'))
  await bootstrapDatabase(databaseConnection, getMigrationsFolder())

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

app.on('will-quit', (event) => {
  if (isClosingDatabase) {
    event.preventDefault()
    return
  }

  if (databaseConnection === null) {
    return
  }

  event.preventDefault()

  isClosingDatabase = true
  void closeDatabaseConnection()
    .catch((error) => {
      console.error('Failed to close database connection', error)
    })
    .finally(() => {
      isClosingDatabase = false
      app.quit()
    })
})
