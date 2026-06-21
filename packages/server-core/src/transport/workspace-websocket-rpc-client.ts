/**
 * 提供可复用的 workspace WebSocket envelope RPC client runtime。
 * 本文件只依赖注入的 WebSocket 构造器，不绑定 Electron preload、IPC 或 DOM 全局。
 */

import {
  PROTOCOL_VERSION,
  isErrorCode,
  type ErrorCode,
  type MessageEnvelope,
  type WireError
} from '@moon/shared/protocol'

import {
  EnvelopeRpcClient,
  type EnvelopeRpcClientSubscribe
} from './envelope-rpc-client'
import { deserializeEnvelope, serializeEnvelope } from './codec'
import type { RpcClientCapabilityHandler, RpcClientCapabilityPort, RpcClientPort } from './types'

export type WorkspaceWebSocketEvent = {
  data?: unknown
}

export type WorkspaceWebSocketLike = {
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

export type WorkspaceWebSocketConstructor = new (url: string) => WorkspaceWebSocketLike

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
  getAuthToken?: () => Promise<string | undefined>
  getTransportUrl: () => Promise<string>
  getWorkspaceId?: () => Promise<string | null | undefined>
  onConnectionStateChange?: (state: WorkspaceWebSocketConnectionState) => void
  reconnectDelayMs?: number
  WebSocketCtor: WorkspaceWebSocketConstructor
}

export type WorkspaceWebSocketRpcClient = RpcClientPort & RpcClientCapabilityPort

const WEBSOCKET_OPEN = 1
const WORKSPACE_HANDSHAKE_ID = 'workspace-handshake'
const DEFAULT_RECONNECT_DELAY_MS = 100

/**
 * 创建基于 WebSocket 的 workspace RPC client。
 */
export function createWorkspaceWebSocketRpcClient({
  createId,
  getAuthToken,
  getTransportUrl,
  getWorkspaceId,
  onConnectionStateChange,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  WebSocketCtor
}: WorkspaceWebSocketRpcClientOptions): WorkspaceWebSocketRpcClient {
  const transport = createWorkspaceWebSocketTransport({
    getAuthToken,
    getTransportUrl,
    getWorkspaceId,
    onConnectionStateChange,
    reconnectDelayMs,
    WebSocketCtor
  })

  const envelopeClient = new EnvelopeRpcClient({
    createId,
    request: (envelope) => transport.request(envelope),
    subscribe: transport.subscribe
  })

  return {
    handleCapability: transport.handleCapability,
    invoke: (channel, ...args) => envelopeClient.invoke(channel, ...args),
    on: (channel, listener) => envelopeClient.on(channel, listener)
  }
}

/**
 * 创建 WebSocket transport 状态机，负责连接、请求关联和事件广播。
 */
function createWorkspaceWebSocketTransport({
  getAuthToken,
  getTransportUrl,
  getWorkspaceId,
  onConnectionStateChange,
  reconnectDelayMs,
  WebSocketCtor
}: Pick<
  WorkspaceWebSocketRpcClientOptions,
  | 'getAuthToken'
  | 'getTransportUrl'
  | 'getWorkspaceId'
  | 'onConnectionStateChange'
  | 'reconnectDelayMs'
  | 'WebSocketCtor'
>): {
  handleCapability: (channel: string, handler: RpcClientCapabilityHandler) => void
  request: (envelope: MessageEnvelope) => Promise<MessageEnvelope>
  subscribe: EnvelopeRpcClientSubscribe
} {
  const capabilityHandlers = new Map<string, RpcClientCapabilityHandler>()
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
    handleCapability: (channel, handler) => {
      capabilityHandlers.set(channel, handler)
    },
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

    return getTransportUrl().then(
      (transportUrl) =>
        new Promise<WorkspaceWebSocketLike>((resolve, reject) => {
          const nextSocket = new WebSocketCtor(transportUrl)

          socket = nextSocket
          const handleHandshake = (event: WorkspaceWebSocketEvent): void => {
            handleHandshakeMessage(nextSocket, event, handleHandshake, resolve, reject)
          }

          nextSocket.addEventListener('open', () => {
            setConnectionState('handshaking')
            void sendHandshake(nextSocket).catch((error) => {
              const connectionError = toError(error)

              reject(connectionError)
              markSocketDisconnected(connectionError)
              nextSocket.close()
            })
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
  function sendHandshake(activeSocket: WorkspaceWebSocketLike): Promise<void> {
    if (getAuthToken === undefined && getWorkspaceId === undefined) {
      writeHandshakeEnvelope(activeSocket)
      return Promise.resolve()
    }

    return Promise.all([
      getAuthToken?.() ?? Promise.resolve(undefined),
      getWorkspaceId?.() ?? Promise.resolve(undefined)
    ]).then(([authToken, workspaceId]) => {
      writeHandshakeEnvelope(activeSocket, authToken, workspaceId)
    })
  }

  /**
   * 写入 handshake envelope；无 token 的开发路径保持同步发送，避免握手时序漂移。
   */
  function writeHandshakeEnvelope(
    activeSocket: WorkspaceWebSocketLike,
    authToken?: string,
    workspaceId?: string | null
  ): void {
    const envelope: MessageEnvelope = {
      id: WORKSPACE_HANDSHAKE_ID,
      type: 'handshake',
      protocolVersion: PROTOCOL_VERSION
    }

    if (authToken !== undefined) {
      envelope.authToken = authToken
    }

    if (typeof workspaceId === 'string' && workspaceId.length > 0) {
      envelope.workspaceId = workspaceId
    }

    const clientCapabilities = [...capabilityHandlers.keys()]

    if (clientCapabilities.length > 0) {
      envelope.clientCapabilities = clientCapabilities
    }

    activeSocket.send(serializeEnvelope(envelope))
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
    activeSocket.addEventListener('message', (messageEvent) => {
      void handleSocketMessage(activeSocket, messageEvent)
    })
    setConnectionState('connected')
    resolve(activeSocket)
  }

  /**
   * 把收到的 envelope 分发给等待中的 request 或 event 订阅者。
   */
  async function handleSocketMessage(
    activeSocket: WorkspaceWebSocketLike,
    event: WorkspaceWebSocketEvent
  ): Promise<void> {
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

    if (envelope.type === 'request') {
      await handleCapabilityRequest(activeSocket, envelope)
      return
    }

    envelopeListeners.forEach((listener) => {
      listener(envelope)
    })
  }

  /**
   * 处理 server 反向调用的 client capability，并把结果写回 response envelope。
   */
  async function handleCapabilityRequest(
    activeSocket: WorkspaceWebSocketLike,
    envelope: MessageEnvelope
  ): Promise<void> {
    const channel = envelope.channel

    if (typeof channel !== 'string' || channel.length === 0) {
      sendEnvelope(
        activeSocket,
        createErrorResponse(envelope, 'CHANNEL_NOT_FOUND', 'Missing channel')
      )
      return
    }

    const handler = capabilityHandlers.get(channel)

    if (handler === undefined) {
      sendEnvelope(
        activeSocket,
        createErrorResponse(
          envelope,
          'CAPABILITY_UNAVAILABLE',
          `No client capability for: ${channel}`
        )
      )
      return
    }

    try {
      const result = await handler(...(envelope.args ?? []))

      sendEnvelope(activeSocket, {
        id: envelope.id,
        type: 'response',
        channel,
        result
      })
    } catch (error) {
      sendEnvelope(
        activeSocket,
        createErrorResponse(envelope, selectErrorCode(error), getErrorMessage(error))
      )
    }
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
 * 向当前 WebSocket 写入 envelope，连接已关闭时静默跳过。
 */
function sendEnvelope(socket: WorkspaceWebSocketLike, envelope: MessageEnvelope): void {
  if (socket.readyState !== WEBSOCKET_OPEN) {
    return
  }

  socket.send(serializeEnvelope(envelope))
}

/**
 * 创建 client capability 失败 response，保留 request id/channel 便于 server 关联。
 */
function createErrorResponse(
  envelope: MessageEnvelope,
  code: ErrorCode,
  message: string
): MessageEnvelope {
  return {
    id: envelope.id,
    type: 'response',
    channel: envelope.channel,
    error: {
      code,
      message
    }
  }
}

/**
 * 从 client capability handler 抛出的错误中提取可跨 wire 传递的错误码。
 */
function selectErrorCode(error: unknown): ErrorCode {
  const rawCode = (error as { code?: unknown } | null)?.code

  return isErrorCode(rawCode) ? rawCode : 'HANDLER_ERROR'
}

/**
 * 从未知错误中提取可读消息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 将 server handshake error envelope 还原成带 code 的 Error。
 */
function createWireError(error: WireError): Error & { code: WireError['code'] } {
  const responseError = new Error(error.message) as Error & { code: WireError['code'] }
  responseError.code = error.code
  return responseError
}
