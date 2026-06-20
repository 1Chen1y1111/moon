/**
 * 负责提供本机 workspace WebSocket envelope RPC server。
 * 本文件只承载 REMOTE_ELIGIBLE session channel，不处理 app-shell LOCAL_ONLY 能力。
 */

import { randomUUID } from 'node:crypto'

import type { WorkspaceWebSocketTransportInfo } from '@ipc/workspace-transport-contract'
import type {
  RpcRequestHandler,
  RpcServerPort,
  SessionRpcRequestContext
} from '@moon/server-core/handlers'
import type { SessionEventRouteHint } from '@moon/server-core/sessions'
import {
  deserializeEnvelope,
  EnvelopePushPort,
  EnvelopeRpcServer,
  pushTyped,
  serializeEnvelope,
  type RpcPushPort
} from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import {
  PROTOCOL_VERSION,
  isRemoteEligible,
  RPC_CHANNELS,
  type MessageEnvelope,
  type PushTarget,
  type WireError
} from '@moon/shared/protocol'

type WorkspaceSocket = {
  on: (event: 'message' | 'close' | 'error', listener: (...args: unknown[]) => void) => void
  readyState: number
  send: (data: string) => void
  close?: () => void
}

type WorkspaceSocketServer = {
  address: () => string | { port: number } | null
  close: (callback?: (error?: Error) => void) => void
  on: (event: 'connection' | 'listening' | 'error', listener: (...args: unknown[]) => void) => void
}

type WorkspaceSocketServerOptions = {
  host: string
  port: number
}

type CreateWorkspaceSocketServer = (
  options: WorkspaceSocketServerOptions
) => WorkspaceSocketServer | Promise<WorkspaceSocketServer>

type WorkspaceSocketClient = {
  clientId: string
  handshakeComplete: boolean
  socket: WorkspaceSocket
  workspaceId: string | null
}

export type WorkspaceWebSocketRpcServerOptions = {
  createClientId?: () => string
  createWebSocketServer?: CreateWorkspaceSocketServer
}

export type WorkspaceWebSocketRpcServer = RpcServerPort<SessionRpcRequestContext> &
  RpcPushPort & {
    close: () => Promise<void>
    getTransportInfo: () => Promise<WorkspaceWebSocketTransportInfo>
  }

const LOCALHOST = '127.0.0.1'
const RANDOM_PORT = 0
const WEBSOCKET_OPEN = 1

/**
 * 创建 workspace WebSocket RPC server；实际端口会在首次查询 transport info 时懒启动。
 */
export function createWorkspaceWebSocketRpcServer({
  createClientId = randomUUID,
  createWebSocketServer = createDefaultWebSocketServer
}: WorkspaceWebSocketRpcServerOptions = {}): WorkspaceWebSocketRpcServer {
  const envelopeServer = new EnvelopeRpcServer<SessionRpcRequestContext>()
  const clients = new Set<WorkspaceSocketClient>()
  const envelopePushPort = new EnvelopePushPort({
    send: (target, envelope) => {
      sendEventEnvelope(clients, target, envelope)
    }
  })
  let socketServer: WorkspaceSocketServer | null = null
  let startPromise: Promise<WorkspaceSocketServer> | null = null

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
    getTransportInfo: async () => {
      const server = await ensureSocketServer()
      const address = server.address()

      if (typeof address === 'string' || address === null) {
        throw new Error('Workspace WebSocket server did not expose a TCP port')
      }

      return {
        url: `ws://${LOCALHOST}:${address.port}`
      }
    }
  }

  return rpcServer

  /**
   * 懒启动 WebSocket server，避免 main 初始化阶段必须等待端口绑定。
   */
  async function ensureSocketServer(): Promise<WorkspaceSocketServer> {
    if (socketServer !== null) {
      return socketServer
    }

    if (startPromise === null) {
      startPromise = Promise.resolve(
        createWebSocketServer({
          host: LOCALHOST,
          port: RANDOM_PORT
        })
      ).then(async (server) => {
        socketServer = server
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
  sendEnvelope(client.socket, {
    id: envelope.id,
    type: 'handshake_ack',
    clientId: client.clientId,
    protocolVersion: PROTOCOL_VERSION
  })
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
 * 从未知错误中提取可读消息。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
