/**
 * 负责注册主进程 IPC handler，并把 renderer 请求分发到对应 service。
 * 这里是跨进程 wire contract 的主进程入口，不直接实现业务持久化细节。
 */

import { ipcMain, type BrowserWindow } from 'electron'

import { ipcChannels } from '@ipc/channels'
import {
  workspaceWebSocketTransportInfoChannel,
  type WorkspaceWebSocketTransportInfo
} from '@ipc/workspace-transport-contract'
import { registerSessionHandlers } from '@moon/server-core/handlers/rpc'
import type { ChatService } from '@moon/server/services/chat-service'
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

type WorkspaceTransportRegistration =
  | {
      mode: 'local'
      workspaceRpcServer: WorkspaceWebSocketRpcServer
    }
  | {
      mode: 'remote'
      transportInfo: WorkspaceWebSocketTransportInfo
    }

const WORKSPACE_WS_URL_ENV = 'MOON_WORKSPACE_WS_URL'
const WORKSPACE_WS_TOKEN_ENV = 'MOON_WORKSPACE_WS_TOKEN'

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
  const workspaceTransport = createWorkspaceTransportRegistration(createWorkspaceRpcServer)

  registerWorkspaceTransportHandlers(localRpcServer, workspaceTransport)
  if (workspaceTransport.mode === 'local') {
    registerSessionHandlers(workspaceTransport.workspaceRpcServer, { sessionHandlers: chatService })
  }
  registerAppShellHandlers(localRpcServer, {
    openSettingsWindow,
    projectsService,
    settingsService
  })

  return {
    close: () =>
      workspaceTransport.mode === 'local'
        ? workspaceTransport.workspaceRpcServer.close()
        : Promise.resolve()
  }
}

/**
 * 根据环境变量选择本机 workspace server 或外部 remote endpoint。
 */
function createWorkspaceTransportRegistration(
  createWorkspaceRpcServer: () => WorkspaceWebSocketRpcServer
): WorkspaceTransportRegistration {
  const remoteUrl = readOptionalEnv(WORKSPACE_WS_URL_ENV)

  if (remoteUrl) {
    const authToken = readOptionalEnv(WORKSPACE_WS_TOKEN_ENV)

    return {
      mode: 'remote',
      transportInfo: {
        ...(authToken === undefined ? {} : { authToken }),
        mode: 'remote',
        url: remoteUrl
      }
    }
  }

  return {
    mode: 'local',
    workspaceRpcServer: createWorkspaceRpcServer()
  }
}

/**
 * 读取可选环境变量，并把空白字符串视为未配置。
 */
function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()

  return value ? value : undefined
}

/**
 * 注册 preload 查询 workspace WebSocket 地址所需的内部 RPC handler。
 */
function registerWorkspaceTransportHandlers(
  localRpcServer: ReturnType<typeof createElectronEnvelopeIpcRpcServer>,
  workspaceTransport: WorkspaceTransportRegistration
): void {
  localRpcServer.handle(workspaceWebSocketTransportInfoChannel, async () => {
    if (workspaceTransport.mode === 'remote') {
      return workspaceTransport.transportInfo
    }

    const transportInfo = await workspaceTransport.workspaceRpcServer.getTransportInfo()

    return {
      ...transportInfo,
      mode: 'local' as const
    }
  })
}
