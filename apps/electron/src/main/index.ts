/**
 * 负责启动 Electron 主进程、初始化数据库和注册应用级服务。
 * 该入口只做生命周期编排，具体业务由 service/repository 分层处理。
 */

import { app } from 'electron'
import { join } from 'node:path'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMoonServerRuntime, type MoonServerRuntime } from '@moon/server'

import { registerAppLifecycle } from './bootstrap/app-lifecycle'
import { setApplicationIcon } from './bootstrap/app-icon'
import { openSettingsWindow } from './bootstrap/create-settings-window'
import { createMainWindow } from './bootstrap/create-window'
import { registerIpcHandlers, type RegisteredIpcHandlers } from './bootstrap/register-ipc'
import { ProjectsService } from './services/projects-service'
import { ProviderProxyServer } from './services/provider-proxy-server'
import { SettingsService } from './services/settings-service'

let serverRuntime: MoonServerRuntime | null = null
let providerProxyServer: ProviderProxyServer | null = null
let registeredIpcHandlers: RegisteredIpcHandlers | null = null

/**
 * 根据运行环境解析 Drizzle migration 目录。
 */
function getMigrationsFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}

/**
 * 关闭当前 server runtime，并清空主进程持有的连接引用。
 */
async function closeServerRuntime(): Promise<void> {
  const runtime = serverRuntime

  if (runtime === null) {
    return
  }

  serverRuntime = null
  await runtime.close()
}

/**
 * 在应用退出前关闭代理服务和数据库连接。
 */
async function closeApplicationResources(): Promise<void> {
  const proxyServer = providerProxyServer
  const ipcHandlers = registeredIpcHandlers

  providerProxyServer = null
  registeredIpcHandlers = null

  try {
    await ipcHandlers?.close()
  } catch (error) {
    console.error('Failed to close IPC resources', error)
  }

  try {
    await proxyServer?.stop()
  } catch (error) {
    console.error('Failed to stop provider proxy server', error)
  }

  try {
    await closeServerRuntime()
  } catch (error) {
    console.error('Failed to close server runtime', error)
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

  serverRuntime = await createMoonServerRuntime({
    attachmentsDirectory: join(app.getPath('userData'), 'attachments'),
    dataDir: join(app.getPath('userData'), 'moon-pglite'),
    migrationsFolder: getMigrationsFolder()
  })
  providerProxyServer = new ProviderProxyServer(serverRuntime.settingsRepository)
  providerProxyServer.start()
  const projectsService = new ProjectsService({
    projectsRepository: serverRuntime.projectsRepository
  })

  registeredIpcHandlers = registerIpcHandlers({
    chatService: serverRuntime.chatService,
    openSettingsWindow,
    projectsService,
    settingsService: new SettingsService(serverRuntime.settingsRepository)
  })

  createMainWindow()
})
