/**
 * 负责把 Electron main 的本机 WebSocket 监听适配到 server-core workspace runtime。
 * 本文件只处理 `ws` 依赖加载和 IPC transport info 包装，不承载 RPC 调度逻辑。
 */

import { randomUUID } from 'node:crypto'

import type { WorkspaceWebSocketTransportInfo } from '@ipc/workspace-transport-contract'
import {
  createWorkspaceWebSocketRpcServer as createServerCoreWorkspaceWebSocketRpcServer,
  type CreateWorkspaceSocketServer,
  type WorkspaceSocketServer,
  type WorkspaceSocketServerOptions,
  type WorkspaceWebSocketRpcServer as ServerCoreWorkspaceWebSocketRpcServer
} from '@moon/server-core/transport'

export type WorkspaceWebSocketRpcServerOptions = {
  createAuthToken?: () => string
  createClientId?: () => string
  createWebSocketServer?: CreateWorkspaceSocketServer
}

export type WorkspaceWebSocketRpcServer = Omit<
  ServerCoreWorkspaceWebSocketRpcServer,
  'getTransportUrl'
> & {
  getTransportInfo: () => Promise<WorkspaceWebSocketTransportInfo>
}

/**
 * 创建 Electron 本机 workspace WebSocket RPC server，并把 URL 包装成 IPC discovery contract。
 */
export function createWorkspaceWebSocketRpcServer({
  createAuthToken = randomUUID,
  createClientId = randomUUID,
  createWebSocketServer = createDefaultWebSocketServer
}: WorkspaceWebSocketRpcServerOptions = {}): WorkspaceWebSocketRpcServer {
  const authToken = createAuthToken()
  const runtime = createServerCoreWorkspaceWebSocketRpcServer({
    authToken,
    createClientId,
    createWebSocketServer
  })

  return {
    close: () => runtime.close(),
    getTransportInfo: async () => ({
      authToken,
      mode: 'local',
      url: await runtime.getTransportUrl()
    }),
    handle: (channel, handler) => {
      runtime.handle(channel, handler)
    },
    hasClientCapability: (clientId, channel) => runtime.hasClientCapability(clientId, channel),
    invokeClient: (clientId, channel, ...args) => runtime.invokeClient(clientId, channel, ...args),
    push: (channel, target, ...args) => {
      runtime.push(channel, target, ...args)
    }
  }
}

/**
 * 使用运行时 `ws` 依赖创建 WebSocket server；依赖缺失时给出明确错误。
 */
async function createDefaultWebSocketServer(
  options: WorkspaceSocketServerOptions
): Promise<WorkspaceSocketServer> {
  const moduleName = 'ws'

  try {
    const wsModule = (await import(moduleName)) as {
      WebSocketServer: new (options: WorkspaceSocketServerOptions) => WorkspaceSocketServer
    }

    return new wsModule.WebSocketServer(options)
  } catch (error) {
    throw new Error(`Failed to load workspace WebSocket dependency "ws": ${getErrorMessage(error)}`)
  }
}

/**
 * 从未知错误中提取可读消息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
