/**
 * 提供可复用的 workspace WebSocket envelope RPC client runtime。
 * 本文件只依赖注入的 WebSocket 构造器，不绑定 Electron preload、IPC 或 DOM 全局。
 * 它只负责“送信和收信”：业务层给出 channel/args，本文件保证连接、发送 envelope、等待响应。
 */

import {
  PROTOCOL_VERSION,
  isErrorCode,
  type ErrorCode,
  type MessageEnvelope,
  type WireError
} from '@moon/shared/protocol'

import { EnvelopeRpcClient, type EnvelopeRpcClientSubscribe } from './envelope-rpc-client'
import { deserializeEnvelope, serializeEnvelope } from './codec'
import type { RpcClientCapabilityHandler, RpcClientCapabilityPort, RpcClientPort } from './types'

export type WorkspaceWebSocketEvent = {
  data?: unknown
}

/**
 * 抽象出本文件真正需要的最小 WebSocket 能力，方便浏览器、Electron preload 和测试替换实现。
 */
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

/**
 * 描述 workspace WebSocket 从未连接到可用、断开、重连和不可恢复失败的状态。
 */
export type WorkspaceWebSocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'terminal-error'

export type WorkspaceWebSocketRpcClientOptions = {
  /**
   * 注入 request envelope id 生成器，测试可用固定 id 断言请求和响应的对应关系。
   */
  createId?: () => string

  /**
   * 读取连接鉴权 token；本机开发链路可以不提供。
   */
  getAuthToken?: () => Promise<string | undefined>

  /**
   * 读取 WebSocket endpoint，例如 Electron preload 先通过 discovery IPC 拿到本机 ws:// 地址。
   */
  getTransportUrl: () => Promise<string>

  /**
   * 读取当前 Electron 窗口 id，让 server 后续能把 capability 或事件定位到具体窗口。
   */
  getWebContentsId?: () => Promise<number | null | undefined>

  /**
   * 读取 workspace id；远程 workspace 模式下用于把连接挂到对应工作区。
   */
  getWorkspaceId?: () => Promise<string | null | undefined>

  /**
   * 对外暴露连接状态变化，主要服务测试和未来 UI 连接状态提示。
   */
  onConnectionStateChange?: (state: WorkspaceWebSocketConnectionState) => void

  /**
   * 事件订阅存在时的后台重连间隔；业务请求本身不会自动重放。
   */
  reconnectDelayMs?: number

  /**
   * 注入 WebSocket 构造器，避免 server-core 直接依赖浏览器或 Electron 全局。
   */
  WebSocketCtor: WorkspaceWebSocketConstructor
}

export type WorkspaceWebSocketRpcClient = RpcClientPort &
  RpcClientCapabilityPort & {
    /**
     * 主动建立 WebSocket 连接；普通请求仍会按需懒连接。
     */
    connect: () => void
  }

const WEBSOCKET_OPEN = 1
const WORKSPACE_HANDSHAKE_ID = 'workspace-handshake'
const DEFAULT_RECONNECT_DELAY_MS = 100

/**
 * 创建基于 WebSocket 的 workspace RPC client。
 * `transport` 负责连接和收发 JSON，`EnvelopeRpcClient` 负责把 invoke/on 转成 envelope 语义。
 */
export function createWorkspaceWebSocketRpcClient({
  createId,
  getAuthToken,
  getTransportUrl,
  getWebContentsId,
  getWorkspaceId,
  onConnectionStateChange,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  WebSocketCtor
}: WorkspaceWebSocketRpcClientOptions): WorkspaceWebSocketRpcClient {
  /**
   * transport 是内部 WebSocket 运输层。
   * 返回四个方法：
   * connect 负责建连
   * request 负责发请求并等响应，
   * subscribe 负责接收 server 推送
   * handleCapability 负责登记 server 反向调用 client 的能力。
   */
  const transport = createWorkspaceWebSocketTransport({
    getAuthToken,
    getTransportUrl,
    getWebContentsId,
    getWorkspaceId,
    onConnectionStateChange,
    reconnectDelayMs,
    WebSocketCtor
  })

  /**
   * envelopeClient 是 RPC 语义包装层。
   * 它把外部的 invoke(channel, ...args) 包成 request envelope，
   * 再交给 transport.request 通过 WebSocket 发出去；on(channel) 也会借助 transport.subscribe 接收事件。
   */
  const envelopeClient = new EnvelopeRpcClient({
    createId,
    request: (envelope) => transport.request(envelope),
    subscribe: transport.subscribe
  })

  return {
    connect: () => {
      // connect 是预热连接：失败不会直接抛给调用方；真正业务调用会在 invoke 时再次感知错误。
      void transport.connect().catch(() => undefined)
    },
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
  getWebContentsId,
  getWorkspaceId,
  onConnectionStateChange,
  reconnectDelayMs,
  WebSocketCtor
}: Pick<
  WorkspaceWebSocketRpcClientOptions,
  | 'getAuthToken'
  | 'getTransportUrl'
  | 'getWebContentsId'
  | 'getWorkspaceId'
  | 'onConnectionStateChange'
  | 'reconnectDelayMs'
  | 'WebSocketCtor'
>): {
  handleCapability: (channel: string, handler: RpcClientCapabilityHandler) => void
  connect: () => Promise<WorkspaceWebSocketLike>
  request: (envelope: MessageEnvelope) => Promise<MessageEnvelope>
  subscribe: EnvelopeRpcClientSubscribe
} {
  /**
   * server 可以反向请求 client 执行的能力表，例如让 Electron 本地打开外链。
   */
  const capabilityHandlers = new Map<string, RpcClientCapabilityHandler>()

  /**
   * 长连接事件订阅者集合；收到 event envelope 时会逐个通知。
   */
  const envelopeListeners = new Set<(envelope: MessageEnvelope) => void>()

  /**
   * 握手成功后 server 分配的 client id；断线或协议失败时会清空。
   */
  const handshakeState = {
    clientId: null as string | null
  }

  /**
   * 正在等待 server response 的请求表。
   * key 是 request envelope id，value 是当初 invoke 返回 Promise 的 resolve/reject。
   */
  const pendingRequests = new Map<
    string,
    {
      reject: (error: Error) => void
      resolve: (envelope: MessageEnvelope) => void
    }
  >()
  let connectionState: WorkspaceWebSocketConnectionState = 'idle'

  /**
   * 只有事件订阅需要后台重连；普通 request 断线后由下一次请求触发重新连接。
   */
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 协议版本、握手响应格式或鉴权失败属于不可恢复错误；设置后后续请求直接失败。
   */
  let terminalError: Error | null = null

  /**
   * 当前已建立的 WebSocket；只有 readyState 是 OPEN 时才能复用。
   */
  let socket: WorkspaceWebSocketLike | null = null

  /**
   * 正在建立中的连接 Promise，避免多个并发请求同时创建多条 WebSocket。
   */
  let socketPromise: Promise<WorkspaceWebSocketLike> | null = null

  return {
    handleCapability: (channel, handler) => {
      capabilityHandlers.set(channel, handler)
    },
    connect: () => ensureSocket(),
    request: async (envelope) => {
      const activeSocket = await ensureSocket()

      return new Promise<MessageEnvelope>((resolve, reject) => {
        // 先登记请求 id，再发送；这样即使 server 很快回包，也能找到对应 Promise。
        pendingRequests.set(envelope.id, { reject, resolve })
        activeSocket.send(serializeEnvelope(envelope))
      })
    },
    subscribe: (listener) => {
      // 事件订阅是长连接需求，所以订阅时主动确保连接存在。
      envelopeListeners.add(listener)
      void ensureSocket().catch(() => undefined)

      return () => {
        envelopeListeners.delete(listener)
        if (envelopeListeners.size === 0) {
          // 没有事件监听者后，后台重连就没有意义；下一次 invoke 会自行懒连接。
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
      // 没有可用连接且没人正在连接时，才真正创建新 WebSocket。
      cancelReconnectTimer()
      socketPromise = createSocketConnection('connecting')
    }

    // 如果已经有人在连接，复用同一个 Promise，避免并发请求重复建连。
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
          // 握手成功前，message 只允许被握手处理器消费；成功后才切到普通消息分发。
          const handleHandshake = (event: WorkspaceWebSocketEvent): void => {
            handleHandshakeMessage(nextSocket, event, handleHandshake, resolve, reject)
          }

          nextSocket.addEventListener('open', () => {
            setConnectionState('handshaking')
            // WebSocket open 只代表 TCP 通道可用；必须再完成 Moon 协议握手才算 connected。
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

            // close 可能发生在握手前或正常使用中；统一清理 socket 并拒绝未完成请求。
            reject(error)
            markSocketDisconnected(error)
          })
          nextSocket.addEventListener('error', () => {
            const error = new Error('Workspace WebSocket connection failed')

            // error 不携带稳定跨环境错误详情，这里统一规整成可传递的 Error。
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
    if (
      getAuthToken === undefined &&
      getWorkspaceId === undefined &&
      getWebContentsId === undefined
    ) {
      writeHandshakeEnvelope(activeSocket)
      return Promise.resolve()
    }

    return Promise.all([
      getAuthToken?.() ?? Promise.resolve(undefined),
      getWorkspaceId?.() ?? Promise.resolve(undefined),
      getWebContentsId?.() ?? Promise.resolve(undefined)
    ]).then(([authToken, workspaceId, webContentsId]) => {
      // 三个身份字段必须来自同一轮读取，避免 URL/token/workspace 混用。
      writeHandshakeEnvelope(activeSocket, authToken, workspaceId, webContentsId)
    })
  }

  /**
   * 写入 handshake envelope；无 token 的开发路径保持同步发送，避免握手时序漂移。
   */
  function writeHandshakeEnvelope(
    activeSocket: WorkspaceWebSocketLike,
    authToken?: string,
    workspaceId?: string | null,
    webContentsId?: number | null
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

    if (typeof webContentsId === 'number' && Number.isFinite(webContentsId)) {
      envelope.webContentsId = webContentsId
    }

    const clientCapabilities = [...capabilityHandlers.keys()]

    if (clientCapabilities.length > 0) {
      // 握手时声明 client 能力，server 后续才能安全地反向调用这些 channel。
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
    // 握手完成后移除临时握手监听，后续所有 message 都进入普通 RPC 分发。
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
      // response 是某次 invoke 的回包；通过 id 找到当初登记的 Promise。
      const pendingRequest = pendingRequests.get(envelope.id)

      if (pendingRequest === undefined) {
        return
      }

      pendingRequests.delete(envelope.id)
      pendingRequest.resolve(envelope)
      return
    }

    if (envelope.type === 'request') {
      // request 表示 server 反向调用 client capability，不是普通业务响应。
      await handleCapabilityRequest(activeSocket, envelope)
      return
    }

    // 其余合法 envelope 主要是 event，交给通过 on(channel) 注册的订阅者过滤。
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
      // client capability 的参数和普通 RPC 一样放在 args 中，返回值也用 response envelope 回写。
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

    // 普通断线会清掉连接态，但不设置 terminalError；下一次请求仍可重新建连。
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
