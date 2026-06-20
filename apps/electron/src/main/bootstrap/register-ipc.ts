/**
 * 负责注册主进程 IPC handler，并把 renderer 请求分发到对应 service。
 * 这里是跨进程 wire contract 的主进程入口，不直接实现业务持久化细节。
 */

import { ipcMain, type BrowserWindow } from 'electron'

import { ipcChannels } from '@ipc/channels'
import { registerSessionHandlers } from '@moon/server-core/handlers/rpc'
import type { ChatService } from '../services/chat-service'
import type { ProjectsService } from '../services/projects-service'
import type { SettingsService } from '../services/settings-service'
import { createAppShellIpcRpcServer } from './app-shell-ipc-adapter'
import { registerAppShellHandlers } from './app-shell-rpc-handlers'
import { createSessionIpcRpcServer } from './session-ipc-adapter'

type RegisterIpcDependencies = {
  chatService: ChatService
  settingsService: SettingsService
  projectsService: ProjectsService
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
}

/**
 * 注册 Moon renderer 可调用的全部 IPC handler；重复注册前会清理旧 handler。
 */
export function registerIpcHandlers({
  chatService,
  openSettingsWindow,
  projectsService,
  settingsService
}: RegisterIpcDependencies): void {
  ipcMain.removeHandler(ipcChannels.rpc.request)
  ipcMain.removeHandler(ipcChannels.settings.get)
  ipcMain.removeHandler(ipcChannels.settings.createCustomProvider)
  ipcMain.removeHandler(ipcChannels.settings.createCustomAcpProvider)
  ipcMain.removeHandler(ipcChannels.settings.saveProvider)
  ipcMain.removeHandler(ipcChannels.settings.deleteProvider)
  ipcMain.removeHandler(ipcChannels.settings.fetchProviderModels)
  ipcMain.removeHandler(ipcChannels.settings.testProvider)
  ipcMain.removeHandler(ipcChannels.settings.saveAppearance)
  ipcMain.removeHandler(ipcChannels.projects.list)
  ipcMain.removeHandler(ipcChannels.projects.getActive)
  ipcMain.removeHandler(ipcChannels.projects.useExistingFolder)
  ipcMain.removeHandler(ipcChannels.projects.delete)
  ipcMain.removeHandler(ipcChannels.projects.setActive)
  ipcMain.removeHandler(ipcChannels.window.close)
  ipcMain.removeHandler(ipcChannels.window.minimize)
  ipcMain.removeHandler(ipcChannels.window.toggleMaximize)
  ipcMain.removeHandler(ipcChannels.window.openSettings)
  ipcMain.removeHandler(ipcChannels.window.getState)

  registerSessionHandlers(createSessionIpcRpcServer(), { sessionHandlers: chatService })
  registerAppShellHandlers(createAppShellIpcRpcServer(), {
    openSettingsWindow,
    projectsService,
    settingsService
  })
}
