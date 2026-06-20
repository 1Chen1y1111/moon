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
import { createElectronEnvelopeIpcRpcServer } from './electron-envelope-ipc-rpc-server'
import { registerAppShellHandlers } from './app-shell-rpc-handlers'

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

  const rpcServer = createElectronEnvelopeIpcRpcServer()

  registerSessionHandlers(rpcServer, { sessionHandlers: chatService })
  registerAppShellHandlers(rpcServer, {
    openSettingsWindow,
    projectsService,
    settingsService
  })
}
