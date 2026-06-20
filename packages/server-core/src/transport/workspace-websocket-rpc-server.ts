/**
 * 提供可复用的 workspace WebSocket envelope RPC runtime。
 * 本文件只依赖注入的 socket server 端口，不绑定 Electron、IPC 或具体 `ws` 实现。
 */

import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import {
  PROTOCOL_VERSION,
  isRemoteEligible,
  RPC_CHANNELS,
  type MessageEnvelope,
  type PushTarget,
  type WireError
} from '@moon/shared/protocol'

import type {
  RpcRequestHandler,
  RpcServerPort,
  SessionRpcRequestContext
} from '../handlers'
import type { SessionEventRouteHint } from '../sessions'
import { deserializeEnvelope, serializeEnvelope } from './codec'
import { EnvelopePushPort } from './envelope-push-port'
import { EnvelopeRpcServer } from './envelope-rpc-server'
import { pushTyped } from './push'
import type { RpcPushPort } from './types'

export type WorkspaceSocket = {
  on: (
    event: 'message' | 'close' | 'error' | 'pong',
    listener: (...args: unknown[]) => void
  ) => void
  ping?: () => void
  readyState: number
  send: (data: string) => void
  close?: () => void
  terminate?: () => void
}

export type WorkspaceSocketServer = {
  address: () => string | { port: number } | null
  close: (callback?: (error?: Error) => void) => void
  on: (event: 'connection' | 'listening' | 'error', listener: (...args: unknown[]) => void) => void
}

export type WorkspaceSocketServerOptions = {
  host: string
  port: number
}

export type CreateWorkspaceSocketServer = (
  options: WorkspaceSocketServerOptions
) => WorkspaceSocketServer | Promise<WorkspaceSocketServer>

type WorkspaceSocketClient = {
  clientId: string
  handshakeComplete: boolean
  isAlive: boolean
  socket: WorkspaceSocket
  workspaceId: string | null
}

export type WorkspaceWebSocketRpcServerOptions = {
  createClientId?: () => string
  createWebSocketServer: CreateWorkspaceSocketServer
  host?: string
  port?: number
}

export type WorkspaceWebSocketRpcServer = RpcServerPort<SessionRpcRequestContext> &
  RpcPushPort & {
    close: () => Promise<void>
    getTransportUrl: () => Promise<string>
  }

const LOCALHOST = '127.0.0.1'
const RANDOM_PORT = 0
const WEBSOCKET_OPEN = 1
const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * 创建 workspace WebSocket RPC runtime；实际 socket server 会在首次查询 URL 时懒启动。
 */
export function createWorkspaceWebSocketRpcServer({
  createClientId = createDefaultClientId,
  createWebSocketServer,
  host = LOCALHOST,
  port = RANDOM_PORT
}: WorkspaceWebSocketRpcServerOptions): WorkspaceWebSocketRpcServer {
  const envelopeServer = new EnvelopeRpcServer<SessionRpcRequestContext>()
  const clients = new Set<WorkspaceSocketClient>()
  const envelopePushPort = new EnvelopePushPort({
    send: (target, envelope) => {
      sendEventEnvelope(clients, target, envelope)
    }
  })
  let socketServer: WorkspaceSocketServer | null = null
  let startPromise: Promise<WorkspaceSocketServer> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const rpcServer: WorkspaceWebSocketRpcServer = {
    handle: <TArgs extends readonly unknown[], TResult>(
      channel: string,
      handler: RpcRequestHandler<SessionRpcRequestContext, TArgs, TResult>
    ) => {
      if (!isRemoteEligible(channel)) {
        throw new Error(`Workspace WebSocket RPC cannot handle local-only channel: ${channel}`)
      }

      envelopeServer.handle(channel, handler)
    },
    push: (channel, target, ...args) => {
      envelopePushPort.push(channel, target, ...args)
    },
    close: async () => {
      const server = socketServer

      stopHeartbeat()
      clients.forEach((client) => {
        client.socket.close?.()
      })
      clients.clear()
      socketServer = null
      startPromise = null

      if (server === null) {
        return
      }

      await closeSocketServer(server)
    },
    getTransportUrl: async () => {
      const server = await ensureSocketServer()
      const address = server.address()

      if (typeof address === 'string' || address === null) {
        throw new Error('Workspace WebSocket server did not expose a TCP port')
      }

      return `ws://${host}:${address.port}`
    }
  }

  return rpcServer

  /**
   * 懒启动 WebSocket server，避免 bootstrap 阶段必须等待端口绑定。
   */
  async function ensureSocketServer(): Promise<WorkspaceSocketServer> {
    if (socketServer !== null) {
      return socketServer
    }

    if (startPromise === null) {
      startPromise = Promise.resolve(
        createWebSocketServer({
          host,
          port
        })
      ).then(async (server) => {
        socketServer = server
        heartbeatTimer = startHeartbeat(clients)
        server.on('connection', (socket) => {
          acceptSocketClient(
            clients,
            envelopeServer,
            rpcServer,
            createClientId(),
            socket as WorkspaceSocket
          )
        })
        await waitForSocketServerAddress(server)
        return server
      })
    }

    return startPromise
  }

  /**
   * 停止 workspace WebSocket heartbeat timer。
   */
  function stopHeartbeat(): void {
    if (heartbeatTimer === null) {
      return
    }

    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/**
 * 接入单个 WebSocket client，并把其 message envelope 分发给 session handlers。
 */
function acceptSocketClient(
  clients: Set<WorkspaceSocketClient>,
  envelopeServer: EnvelopeRpcServer<SessionRpcRequestContext>,
  rpcServer: RpcPushPort,
  clientId: string,
  socket: WorkspaceSocket
): void {
  const client: WorkspaceSocketClient = {
    clientId,
    handshakeComplete: false,
    isAlive: false,
    socket,
    workspaceId: null
  }

  clients.add(client)
  socket.on('message', (rawMessage) => {
    void dispatchSocketMessage(envelopeServer, rpcServer, client, rawMessage)
  })
  socket.on('close', () => {
    clients.delete(client)
  })
  socket.on('error', () => {
    clients.delete(client)
  })
  socket.on('pong', () => {
    client.isAlive = true
  })
}

/**
 * 处理来自 workspace client 的 request envelope，并回写 response envelope。
 */
async function dispatchSocketMessage(
  envelopeServer: EnvelopeRpcServer<SessionRpcRequestContext>,
  rpcServer: RpcPushPort,
  client: WorkspaceSocketClient,
  rawMessage: unknown
): Promise<void> {
  let envelope: MessageEnvelope

  try {
    envelope = deserializeEnvelope(toMessageText(rawMessage))
  } catch (error) {
    sendErrorEnvelope(client.socket, 'invalid-envelope', {
      code: 'HANDLER_ERROR',
      message: getErrorMessage(error)
    })
    return
  }

  if (!client.handshakeComplete) {
    handleHandshakeEnvelope(client, envelope)
    return
  }

  const response = await envelopeServer.dispatch(createRequestContext(rpcServer, client), envelope)

  sendEnvelope(client.socket, response)
}

/**
 * 校验 workspace WebSocket 握手；只有成功握手后的连接才能承载 session RPC。
 */
function handleHandshakeEnvelope(client: WorkspaceSocketClient, envelope: MessageEnvelope): void {
  if (envelope.type !== 'handshake') {
    sendErrorEnvelope(client.socket, envelope.id, {
      code: 'HANDLER_ERROR',
      message: 'Workspace WebSocket handshake required'
    })
    return
  }

  if (envelope.protocolVersion !== PROTOCOL_VERSION) {
    sendErrorEnvelope(client.socket, envelope.id, {
      code: 'PROTOCOL_VERSION_UNSUPPORTED',
      message: `Unsupported protocol version: ${envelope.protocolVersion ?? 'missing'}`
    })
    client.socket.close?.()
    return
  }

  client.handshakeComplete = true
  client.isAlive = true
  sendEnvelope(client.socket, {
    id: envelope.id,
    type: 'handshake_ack',
    clientId: client.clientId,
    protocolVersion: PROTOCOL_VERSION
  })
}

/**
 * 启动 server-side heartbeat，通过 WebSocket ping/pong 清理半开连接。
 */
function startHeartbeat(clients: Set<WorkspaceSocketClient>): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    runHeartbeat(clients)
  }, HEARTBEAT_INTERVAL_MS)
  const unrefTimer = timer as { unref?: () => void }

  unrefTimer.unref?.()
  return timer
}

/**
 * 对已完成握手的 client 执行一次 heartbeat 检测。
 */
function runHeartbeat(clients: Set<WorkspaceSocketClient>): void {
  clients.forEach((client) => {
    if (!client.handshakeComplete) {
      return
    }

    if (!client.isAlive) {
      terminateSocketClient(clients, client)
      return
    }

    client.isAlive = false
    client.socket.ping?.()
  })
}

/**
 * 从 registry 移除失活 client，并尽量用 terminate 快速释放底层 socket。
 */
function terminateSocketClient(
  clients: Set<WorkspaceSocketClient>,
  client: WorkspaceSocketClient
): void {
  clients.delete(client)
  if (client.socket.terminate) {
    client.socket.terminate()
    return
  }

  client.socket.close?.()
}

/**
 * 创建 server-core sessions request context，并把 runtime event 绑定回当前 client。
 */
function createRequestContext(
  rpcServer: RpcPushPort,
  client: WorkspaceSocketClient
): SessionRpcRequestContext {
  return {
    emitSessionEvent: (eventChannel, operationEvent, routeHint) => {
      emitSessionEvent(rpcServer, client, eventChannel, operationEvent, routeHint)
    }
  }
}

/**
 * 按 route hint 或事件 payload 更新当前 client 的 workspace 绑定，再推送 session:event。
 */
function emitSessionEvent(
  rpcServer: RpcPushPort,
  client: WorkspaceSocketClient,
  eventChannel: typeof RPC_CHANNELS.sessions.event,
  operationEvent: ChatOperationEvent,
  routeHint?: SessionEventRouteHint
): void {
  if (eventChannel !== RPC_CHANNELS.sessions.event) {
    return
  }

  const target = resolveSessionEventPushTarget(operationEvent, client, routeHint)

  pushTyped(rpcServer, eventChannel, target, operationEvent)
}

/**
 * 优先使用 route hint 做 workspace 定向；缺失时回到事件 payload，最后回当前 client。
 */
function resolveSessionEventPushTarget(
  operationEvent: ChatOperationEvent,
  client: WorkspaceSocketClient,
  routeHint?: SessionEventRouteHint
): PushTarget {
  if (routeHint?.workspaceId) {
    client.workspaceId = routeHint.workspaceId
    return { to: 'workspace', workspaceId: routeHint.workspaceId }
  }

  if ('session' in operationEvent && operationEvent.session.projectId !== null) {
    client.workspaceId = operationEvent.session.projectId
    return { to: 'workspace', workspaceId: operationEvent.session.projectId }
  }

  return { to: 'client', clientId: client.clientId }
}

/**
 * 按 PushTarget 把 event envelope 发送到本地 WebSocket clients。
 */
function sendEventEnvelope(
  clients: Set<WorkspaceSocketClient>,
  target: PushTarget,
  envelope: MessageEnvelope
): void {
  clients.forEach((client) => {
    if (!shouldSendToClient(client, target)) {
      return
    }

    sendEnvelope(client.socket, envelope)
  })
}

/**
 * 判断某个 client 是否匹配当前 push target。
 */
function shouldSendToClient(client: WorkspaceSocketClient, target: PushTarget): boolean {
  if (!client.handshakeComplete) {
    return false
  }

  if (target.to === 'all') {
    return target.exclude === undefined || target.exclude !== client.clientId
  }

  if (target.to === 'client') {
    return target.clientId === client.clientId
  }

  return (
    client.workspaceId === target.workspaceId &&
    (target.exclude === undefined || target.exclude !== client.clientId)
  )
}

/**
 * 发送 WebSocket transport 级错误 envelope。
 */
function sendErrorEnvelope(socket: WorkspaceSocket, id: string, error: WireError): void {
  sendEnvelope(socket, {
    id,
    type: 'error',
    error
  })
}

/**
 * 向 socket 写入 envelope JSON；关闭中的 socket 会被静默跳过。
 */
function sendEnvelope(socket: WorkspaceSocket, envelope: MessageEnvelope): void {
  if (socket.readyState !== WEBSOCKET_OPEN) {
    return
  }

  socket.send(serializeEnvelope(envelope))
}

/**
 * 等待 WebSocket server 绑定出 TCP port。
 */
async function waitForSocketServerAddress(server: WorkspaceSocketServer): Promise<void> {
  if (typeof server.address() !== 'string' && server.address() !== null) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => {
      resolve()
    })
    server.on('error', (error) => {
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

/**
 * 关闭 WebSocket server，并把 callback 风格转成 Promise。
 */
async function closeSocketServer(server: WorkspaceSocketServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

/**
 * 将 ws message data 转成 JSON 字符串。
 */
function toMessageText(rawMessage: unknown): string {
  if (typeof rawMessage === 'string') {
    return rawMessage
  }

  if (rawMessage instanceof Uint8Array) {
    return Buffer.from(rawMessage).toString('utf8')
  }

  return String(rawMessage)
}

/**
 * 创建默认 clientId，避免 workspace runtime 绑定 Node crypto import。
 */
function createDefaultClientId(): string {
  const randomUUID = globalThis.crypto?.randomUUID

  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto)
  }

  return `workspace-client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * 从未知错误中提取可读消息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
