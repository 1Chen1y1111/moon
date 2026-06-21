/**
 * 负责把 preload workspace transport discovery 适配到 server-core WebSocket RPC client。
 * 本文件只处理 Electron IPC 返回的 transport info，不承载连接状态机或 envelope 分发逻辑。
 */

import type { WorkspaceWebSocketTransportInfo } from '@ipc/workspace-transport-contract'
import {
  createWorkspaceWebSocketRpcClient as createServerCoreWorkspaceWebSocketRpcClient,
  type WorkspaceWebSocketConnectionState,
  type WorkspaceWebSocketConstructor,
  type WorkspaceWebSocketRpcClient
} from '@moon/server-core/transport'

export type { WorkspaceWebSocketConnectionState, WorkspaceWebSocketConstructor }

export type WorkspaceWebSocketRpcClientOptions = {
  createId?: () => string
  getTransportInfo: () => Promise<WorkspaceWebSocketTransportInfo>
  onConnectionStateChange?: (state: WorkspaceWebSocketConnectionState) => void
  reconnectDelayMs?: number
  WebSocketCtor?: WorkspaceWebSocketConstructor
}

/**
 * 创建 preload workspace RPC client，并把 Electron discovery contract 转成纯 WebSocket URL。
 */
export function createWorkspaceWebSocketRpcClient({
  createId,
  getTransportInfo,
  onConnectionStateChange,
  reconnectDelayMs,
  WebSocketCtor = getDefaultWebSocketConstructor()
}: WorkspaceWebSocketRpcClientOptions): WorkspaceWebSocketRpcClient {
  const transportInfoReader = createTransportInfoReader(getTransportInfo)

  return createServerCoreWorkspaceWebSocketRpcClient({
    createId,
    getAuthToken: async () => {
      const transportInfo = await transportInfoReader.read()

      return transportInfo.authToken
    },
    getTransportUrl: async () => {
      const transportInfo = await transportInfoReader.read()

      return transportInfo.url
    },
    getWorkspaceId: async () => {
      const transportInfo = await transportInfoReader.read()

      transportInfoReader.reset()

      return transportInfo.workspaceId
    },
    onConnectionStateChange,
    reconnectDelayMs,
    WebSocketCtor
  })
}

/**
 * 缓存一次 preload discovery，确保同次连接的 URL、auth token 和 workspaceId 来自同一份 main 响应。
 * 握手读取 workspaceId 后释放缓存，让下一次重连重新发现当前 workspace 绑定。
 */
function createTransportInfoReader(
  getTransportInfo: () => Promise<WorkspaceWebSocketTransportInfo>
): {
  read: () => Promise<WorkspaceWebSocketTransportInfo>
  reset: () => void
} {
  let transportInfoPromise: Promise<WorkspaceWebSocketTransportInfo> | null = null

  return {
    read: () => {
      if (transportInfoPromise === null) {
        transportInfoPromise = getTransportInfo().catch((error) => {
          transportInfoPromise = null
          throw error
        })
      }

      return transportInfoPromise
    },
    reset: () => {
      transportInfoPromise = null
    }
  }
}

/**
 * 读取 preload 环境中的 WebSocket 构造器。
 */
function getDefaultWebSocketConstructor(): WorkspaceWebSocketConstructor {
  const WebSocketCtor = globalThis.WebSocket

  if (typeof WebSocketCtor !== 'function') {
    throw new Error('Workspace WebSocket is not available in preload')
  }

  return WebSocketCtor as unknown as WorkspaceWebSocketConstructor
}
