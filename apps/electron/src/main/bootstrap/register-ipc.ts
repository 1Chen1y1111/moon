/**
 * 负责注册主进程 IPC handler，并把 renderer 请求分发到对应 service。
 * 这里是跨进程 wire contract 的主进程入口，不直接实现业务持久化细节。
 */

import { ipcMain, type BrowserWindow } from 'electron'

import { ipcChannels } from '@ipc/channels'
import { workspaceWebSocketTransportInfoChannel } from '@ipc/workspace-transport-contract'
import { registerSessionHandlers } from '@moon/server-core/handlers/rpc'
import type { ChatService } from '../services/chat-service'
import type { ProjectsService } from '../services/projects-service'
import type { SettingsService } from '../services/settings-service'
import { createElectronEnvelopeIpcRpcServer } from './electron-envelope-ipc-rpc-server'
import { registerAppShellHandlers } from './app-shell-rpc-handlers'
import {
  createWorkspaceWebSocketRpcServer,
  type WorkspaceWebSocketRpcServer
} from './workspace-websocket-rpc-server'

type RegisterIpcDependencies = {
  chatService: ChatService
  settingsService: SettingsService
  projectsService: ProjectsService
  openSettingsWindow: (input?: { section?: 'providers' }) => BrowserWindow
  createWorkspaceRpcServer?: () => WorkspaceWebSocketRpcServer
}

/**
 * 主进程注册 IPC 后需要在应用退出时释放的资源。
 */
export type RegisteredIpcHandlers = {
  close: () => Promise<void>
}

/**
 * 注册 Moon renderer 可调用的全部 IPC handler；重复注册前会清理旧 handler。
 */
export function registerIpcHandlers({
  chatService,
  createWorkspaceRpcServer = createWorkspaceWebSocketRpcServer,
  openSettingsWindow,
  projectsService,
  settingsService
}: RegisterIpcDependencies): RegisteredIpcHandlers {
  ipcMain.removeHandler(ipcChannels.rpc.request)

  const localRpcServer = createElectronEnvelopeIpcRpcServer()
  const workspaceRpcServer = createWorkspaceRpcServer()

  registerWorkspaceTransportHandlers(localRpcServer, workspaceRpcServer)
  registerSessionHandlers(workspaceRpcServer, { sessionHandlers: chatService })
  registerAppShellHandlers(localRpcServer, {
    openSettingsWindow,
    projectsService,
    settingsService
  })

  return {
    close: () => workspaceRpcServer.close()
  }
}

/**
 * 注册 preload 查询 workspace WebSocket 地址所需的内部 RPC handler。
 */
function registerWorkspaceTransportHandlers(
  localRpcServer: ReturnType<typeof createElectronEnvelopeIpcRpcServer>,
  workspaceRpcServer: WorkspaceWebSocketRpcServer
): void {
  localRpcServer.handle(workspaceWebSocketTransportInfoChannel, () =>
    workspaceRpcServer.getTransportInfo()
  )
}
