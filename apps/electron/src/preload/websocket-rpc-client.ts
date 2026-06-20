/**
 * 负责把 preload workspace RPC client 适配到本机 WebSocket envelope transport。
 * 本文件只处理 REMOTE_ELIGIBLE session/workspace 通道，不改变 renderer 可见 API。
 */

import type { WorkspaceWebSocketTransportInfo } from '@ipc/workspace-transport-contract'
import type { RpcClientPort } from '@moon/server-core/transport'
import {
  deserializeEnvelope,
  EnvelopeRpcClient,
  serializeEnvelope,
  type EnvelopeRpcClientSubscribe
} from '@moon/server-core/transport'
import { PROTOCOL_VERSION, type MessageEnvelope, type WireError } from '@moon/shared/protocol'

type WorkspaceWebSocketEvent = {
  data?: unknown
}

type WorkspaceWebSocketLike = {
  addEventListener: (
    event: 'open' | 'message' | 'close' | 'error',
    listener: (event: WorkspaceWebSocketEvent) => void
  ) => void
  close: () => void
  readyState: number
  removeEventListener: (
    event: 'open' | 'message' | 'close' | 'error',
    listener: (event: WorkspaceWebSocketEvent) => void
  ) => void
  send: (data: string) => void
}

type WorkspaceWebSocketConstructor = new (url: string) => WorkspaceWebSocketLike

export type WorkspaceWebSocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'terminal-error'

export type WorkspaceWebSocketRpcClientOptions = {
  createId?: () => string
  getTransportInfo: () => Promise<WorkspaceWebSocketTransportInfo>
  onConnectionStateChange?: (state: WorkspaceWebSocketConnectionState) => void
  reconnectDelayMs?: number
  WebSocketCtor?: WorkspaceWebSocketConstructor
}

const WEBSOCKET_OPEN = 1
const WORKSPACE_HANDSHAKE_ID = 'workspace-handshake'
const DEFAULT_RECONNECT_DELAY_MS = 100

/**
 * 创建基于本机 WebSocket 的 workspace RPC client。
 */
export function createWorkspaceWebSocketRpcClient({
  createId,
  getTransportInfo,
  onConnectionStateChange,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  WebSocketCtor
}: WorkspaceWebSocketRpcClientOptions): RpcClientPort {
  const transport = createWorkspaceWebSocketTransport({
    getTransportInfo,
    onConnectionStateChange,
    reconnectDelayMs,
    WebSocketCtor
  })

  return new EnvelopeRpcClient({
    createId,
    request: (envelope) => transport.request(envelope),
    subscribe: transport.subscribe
  })
}

/**
 * 创建 WebSocket transport 状态机，负责连接、请求关联和事件广播。
 */
function createWorkspaceWebSocketTransport({
  getTransportInfo,
  onConnectionStateChange,
  reconnectDelayMs,
  WebSocketCtor
}: Pick<
  WorkspaceWebSocketRpcClientOptions,
  'getTransportInfo' | 'onConnectionStateChange' | 'reconnectDelayMs' | 'WebSocketCtor'
>): {
  request: (envelope: MessageEnvelope) => Promise<MessageEnvelope>
  subscribe: EnvelopeRpcClientSubscribe
} {
  const envelopeListeners = new Set<(envelope: MessageEnvelope) => void>()
  const handshakeState = {
    clientId: null as string | null
  }
  const pendingRequests = new Map<
    string,
    {
      reject: (error: Error) => void
      resolve: (envelope: MessageEnvelope) => void
    }
  >()
  let connectionState: WorkspaceWebSocketConnectionState = 'idle'
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let terminalError: Error | null = null
  let socket: WorkspaceWebSocketLike | null = null
  let socketPromise: Promise<WorkspaceWebSocketLike> | null = null

  return {
    request: async (envelope) => {
      const activeSocket = await ensureSocket()

      return new Promise<MessageEnvelope>((resolve, reject) => {
        pendingRequests.set(envelope.id, { reject, resolve })
        activeSocket.send(serializeEnvelope(envelope))
      })
    },
    subscribe: (listener) => {
      envelopeListeners.add(listener)
      void ensureSocket().catch(() => undefined)

      return () => {
        envelopeListeners.delete(listener)
        if (envelopeListeners.size === 0) {
          cancelReconnectTimer()
          if (connectionState === 'reconnecting') {
            setConnectionState('disconnected')
          }
        }
      }
    }
  }

  /**
   * 懒连接 workspace WebSocket；普通断线后会在下一次调用时重新握手。
   */
  async function ensureSocket(): Promise<WorkspaceWebSocketLike> {
    if (terminalError !== null) {
      throw terminalError
    }

    if (socket !== null && socket.readyState === WEBSOCKET_OPEN) {
      return socket
    }

    if (socketPromise === null) {
      cancelReconnectTimer()
      socketPromise = createSocketConnection('connecting')
    }

    return socketPromise
  }

  /**
   * 创建新的 WebSocket 连接，并在 open 后进入 handshake 阶段。
   */
  function createSocketConnection(
    startState: 'connecting' | 'reconnecting'
  ): Promise<WorkspaceWebSocketLike> {
    setConnectionState(startState)

    return getTransportInfo().then(
      (transportInfo) =>
        new Promise<WorkspaceWebSocketLike>((resolve, reject) => {
          const SocketCtor = WebSocketCtor ?? getDefaultWebSocketConstructor()
          const nextSocket = new SocketCtor(transportInfo.url)

          socket = nextSocket
          const handleHandshake = (event: WorkspaceWebSocketEvent): void => {
            handleHandshakeMessage(nextSocket, event, handleHandshake, resolve, reject)
          }

          nextSocket.addEventListener('open', () => {
            setConnectionState('handshaking')
            sendHandshake(nextSocket)
          })
          nextSocket.addEventListener('message', handleHandshake)
          nextSocket.addEventListener('close', () => {
            const error = new Error('Workspace WebSocket closed')

            reject(error)
            markSocketDisconnected(error)
          })
          nextSocket.addEventListener('error', () => {
            const error = new Error('Workspace WebSocket connection failed')

            reject(error)
            markSocketDisconnected(error)
          })
        })
    )
  }

  /**
   * WebSocket 打开后先发送协议握手 envelope。
   */
  function sendHandshake(activeSocket: WorkspaceWebSocketLike): void {
    activeSocket.send(
      serializeEnvelope({
        id: WORKSPACE_HANDSHAKE_ID,
        type: 'handshake',
        protocolVersion: PROTOCOL_VERSION
      })
    )
  }

  /**
   * 处理握手阶段的 server ack；成功后才切换到普通 envelope 分发。
   */
  function handleHandshakeMessage(
    activeSocket: WorkspaceWebSocketLike,
    event: WorkspaceWebSocketEvent,
    handleHandshake: (event: WorkspaceWebSocketEvent) => void,
    resolve: (socket: WorkspaceWebSocketLike) => void,
    reject: (error: Error) => void
  ): void {
    let envelope: MessageEnvelope

    try {
      envelope = deserializeEnvelope(String(event.data))
    } catch (error) {
      const connectionError = toError(error)

      reject(connectionError)
      markTerminalFailure(connectionError)
      return
    }

    if (envelope.type === 'error' && envelope.error) {
      const connectionError = createWireError(envelope.error)

      reject(connectionError)
      markTerminalFailure(connectionError)
      return
    }

    if (
      envelope.type !== 'handshake_ack' ||
      envelope.protocolVersion !== PROTOCOL_VERSION ||
      typeof envelope.clientId !== 'string'
    ) {
      const connectionError = new Error('Workspace WebSocket handshake failed')

      reject(connectionError)
      markTerminalFailure(connectionError)
      return
    }

    handshakeState.clientId = envelope.clientId
    activeSocket.removeEventListener('message', handleHandshake)
    activeSocket.addEventListener('message', handleSocketMessage)
    setConnectionState('connected')
    resolve(activeSocket)
  }

  /**
   * 把收到的 envelope 分发给等待中的 request 或 event 订阅者。
   */
  function handleSocketMessage(event: WorkspaceWebSocketEvent): void {
    const envelope = deserializeEnvelope(String(event.data))

    if (envelope.type === 'response') {
      const pendingRequest = pendingRequests.get(envelope.id)

      if (pendingRequest === undefined) {
        return
      }

      pendingRequests.delete(envelope.id)
      pendingRequest.resolve(envelope)
      return
    }

    envelopeListeners.forEach((listener) => {
      listener(envelope)
    })
  }

  /**
   * 连接关闭或失败时拒绝所有未完成请求。
   */
  function rejectPendingRequests(error: Error): void {
    pendingRequests.forEach(({ reject }) => {
      reject(error)
    })
    pendingRequests.clear()
  }

  /**
   * 标记普通连接断开；后续请求会重新创建 WebSocket 并重新握手。
   */
  function markSocketDisconnected(error: Error): void {
    if (terminalError !== null) {
      return
    }

    handshakeState.clientId = null
    socket = null
    socketPromise = null
    rejectPendingRequests(error)
    setConnectionState('disconnected')
    scheduleBackgroundReconnect()
  }

  /**
   * 标记不可恢复的协议失败；后续调用直接失败，不再盲目重连。
   */
  function markTerminalFailure(error: Error): void {
    terminalError = error
    cancelReconnectTimer()
    handshakeState.clientId = null
    socket = null
    socketPromise = null
    rejectPendingRequests(error)
    setConnectionState('terminal-error')
  }

  /**
   * 若仍有事件订阅者，安排一次后台重连；业务 request 不会被自动重放。
   */
  function scheduleBackgroundReconnect(): void {
    if (terminalError !== null || envelopeListeners.size === 0 || reconnectTimer !== null) {
      return
    }

    setConnectionState('reconnecting')
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null

      if (terminalError !== null || envelopeListeners.size === 0) {
        return
      }

      socketPromise = createSocketConnection('reconnecting')
      void socketPromise.catch(() => undefined)
    }, reconnectDelayMs)
  }

  /**
   * 取消尚未执行的后台重连 timer。
   */
  function cancelReconnectTimer(): void {
    if (reconnectTimer === null) {
      return
    }

    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  /**
   * 更新内部连接状态，并把状态变化通知给测试/未来内部适配层。
   */
  function setConnectionState(nextState: WorkspaceWebSocketConnectionState): void {
    if (connectionState === nextState) {
      return
    }

    connectionState = nextState
    onConnectionStateChange?.(nextState)
  }
}

/**
 * 把 unknown 错误规整成 Error 实例。
 */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * 将 server handshake error envelope 还原成带 code 的 Error。
 */
function createWireError(error: WireError): Error & { code: WireError['code'] } {
  const responseError = new Error(error.message) as Error & { code: WireError['code'] }
  responseError.code = error.code
  return responseError
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
