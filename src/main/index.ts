import { app } from 'electron'
import { join } from 'node:path'

import { electronApp, optimizer } from '@electron-toolkit/utils'

import { registerAppLifecycle } from './bootstrap/app-lifecycle'
import { setApplicationIcon } from './bootstrap/app-icon'
import { openSettingsWindow } from './bootstrap/create-settings-window'
import { createMainWindow } from './bootstrap/create-window'
import { registerIpcHandlers } from './bootstrap/register-ipc'
import { bootstrapDatabase } from './db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from './db/connection'
import { AgentOperationsRepository } from './repositories/agent-operations-repository'
import { MessagesRepository } from './repositories/messages-repository'
import { SettingsRepository } from './repositories/settings-repository'
import { SessionsRepository } from './repositories/sessions-repository'
import { ThreadsRepository } from './repositories/threads-repository'
import { ToolInvocationsRepository } from './repositories/tool-invocations-repository'
import { TopicsRepository } from './repositories/topics-repository'
import { ChatService } from './services/chat-service'
import { ProviderProxyServer } from './services/provider-proxy-server'
import { SettingsService } from './services/settings-service'

let databaseConnection: AppDatabaseConnection | null = null
let providerProxyServer: ProviderProxyServer | null = null

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

async function closeApplicationResources(): Promise<void> {
  const proxyServer = providerProxyServer

  providerProxyServer = null

  try {
    await proxyServer?.stop()
  } catch (error) {
    console.error('Failed to stop provider proxy server', error)
  }

  try {
    await closeDatabaseConnection()
  } catch (error) {
    console.error('Failed to close database connection', error)
  }
}

registerAppLifecycle({
  createMainWindow,
  closeApplicationResources
})

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

  const settingsRepository = new SettingsRepository(databaseConnection)
  const sessionsRepository = new SessionsRepository(databaseConnection)
  const topicsRepository = new TopicsRepository(databaseConnection)
  const threadsRepository = new ThreadsRepository(databaseConnection)
  const agentOperationsRepository = new AgentOperationsRepository(databaseConnection)
  const messagesRepository = new MessagesRepository(databaseConnection)
  const toolInvocationsRepository = new ToolInvocationsRepository(databaseConnection)
  providerProxyServer = new ProviderProxyServer(settingsRepository)
  providerProxyServer.start()

  registerIpcHandlers({
    chatService: new ChatService({
      agentOperationsRepository,
      attachmentsDirectory: join(app.getPath('userData'), 'attachments'),
      messagesRepository,
      sessionsRepository,
      settingsRepository,
      threadsRepository,
      toolInvocationsRepository,
      topicsRepository
    }),
    openSettingsWindow,
    settingsService: new SettingsService(settingsRepository)
  })

  createMainWindow()
})
