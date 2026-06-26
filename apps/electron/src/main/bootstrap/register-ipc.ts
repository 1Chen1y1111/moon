/**
 * 负责启动本机 WS RPC 入口，并注册 preload 初始化所需的 discovery IPC handler。
 * 业务请求进入 WS server 后再分发到 app-shell 或 session handlers。
 */

import { ipcMain, type BrowserWindow } from 'electron'

import {
  localWebSocketTransportInfoChannel,
  webContentsIdChannel,
  type WorkspaceWebSocketTransportInfo
} from '@ipc/workspace-transport-contract'
import { registerSessionHandlers } from '@moon/server-core/handlers/rpc'
import type { ChatService } from '@moon/server/services/chat-service'
import type { ProjectsService } from '../services/projects-service'
import type { SettingsService } from '../services/settings-service'
import { registerAppShellHandlers } from './app-shell-rpc-handlers'
import {
  createWorkspaceWebSocketRpcServer,
  type WorkspaceWebSocketRpcServer
} from './workspace-websocket-rpc-server'
import { setWindowStateEventSink } from './window-state-events'

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
  ipcMain.removeHandler(localWebSocketTransportInfoChannel)
  ipcMain.removeHandler(webContentsIdChannel)

  const localRpcServer = createWorkspaceRpcServer()

  registerSessionHandlers(localRpcServer, { sessionHandlers: chatService })
  registerAppShellHandlers(localRpcServer, {
    openSettingsWindow,
    projectsService,
    settingsService
  })
  registerLocalTransportDiscoveryHandlers(localRpcServer)
  setWindowStateEventSink(localRpcServer)

  return {
    close: async () => {
      setWindowStateEventSink(null)
      await localRpcServer.close()
    }
  }
}

/**
 * 注册 preload 初始化本机 WS RPC client 所需的 discovery IPC handlers。
 */
function registerLocalTransportDiscoveryHandlers(
  localRpcServer: WorkspaceWebSocketRpcServer
): void {
  ipcMain.handle(localWebSocketTransportInfoChannel, async () => {
    const transportInfo = await localRpcServer.getTransportInfo()

    return {
      ...transportInfo,
      mode: 'local' as const
    } satisfies WorkspaceWebSocketTransportInfo
  })

  ipcMain.handle(webContentsIdChannel, (event) => {
    return event.sender.id
  })
}
