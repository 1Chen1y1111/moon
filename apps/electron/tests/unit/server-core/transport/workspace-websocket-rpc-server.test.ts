// @vitest-environment node

/**
 * 负责验证 server-core workspace WebSocket RPC runtime 的 envelope 调度和事件推送行为。
 * 测试使用 fake WebSocket，不打开真实网络端口。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createWorkspaceWebSocketRpcServer,
  serializeEnvelope
} from '@moon/server-core/transport'
import { PROTOCOL_VERSION, RPC_CHANNELS } from '@moon/shared/protocol'

type FakeSocketEvent = 'message' | 'close' | 'error' | 'pong'
type FakeServerEvent = 'connection' | 'listening' | 'error'
const HEARTBEAT_INTERVAL_MS = 30_000

class FakeSocket {
  readonly sent: string[] = []
  readonly ping = vi.fn()
  readonly terminate = vi.fn(() => {
    this.readyState = 3
    this.emit('close')
  })
  readyState = 1
  private readonly listeners = new Map<FakeSocketEvent, Array<(...args: unknown[]) => void>>()

  /**
   * 注册 fake socket 事件监听器。
   */
  on(event: FakeSocketEvent, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  /**
   * 记录 server 发给 client 的原始 JSON。
   */
  send(data: string): void {
    this.sent.push(data)
  }

  /**
   * 模拟 client 主动关闭连接。
   */
  close(): void {
    this.readyState = 3
    this.emit('close')
  }

  /**
   * 模拟 client 发送一条 WebSocket message。
   */
  emitMessage(data: string): void {
    this.emit('message', data)
  }

  /**
   * 模拟 client 回复 WebSocket pong control frame。
   */
  emitPong(): void {
    this.emit('pong')
  }

  private emit(event: FakeSocketEvent, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => {
      listener(...args)
    })
  }
}

class FakeSocketServer {
  readonly sockets: FakeSocket[] = []
  readonly close = vi.fn((callback?: (error?: Error) => void) => {
    callback?.()
  })
  private readonly listeners = new Map<FakeServerEvent, Array<(...args: unknown[]) => void>>()

  /**
   * 返回已绑定的 fake TCP port。
   */
  address(): { port: number } {
    return { port: 48123 }
  }

  /**
   * 注册 fake server 事件监听器。
   */
  on(event: FakeServerEvent, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  /**
   * 模拟一个新 WebSocket client 连接。
   */
  connect(): FakeSocket {
    const socket = new FakeSocket()

    this.sockets.push(socket)
    this.listeners.get('connection')?.forEach((listener) => {
      listener(socket)
    })

    return socket
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function parseSentEnvelope(socket: FakeSocket, index: number): unknown {
  return JSON.parse(socket.sent[index])
}

async function performHandshake(
  socket: FakeSocket,
  id = 'handshake-1',
  authToken?: string,
  clientCapabilities?: string[],
  workspaceId?: string
): Promise<void> {
  socket.emitMessage(
    serializeEnvelope({
      authToken,
      clientCapabilities,
      id,
      type: 'handshake',
      protocolVersion: PROTOCOL_VERSION,
      workspaceId
    })
  )
  await flushPromises()
}

describe('createWorkspaceWebSocketRpcServer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires a protocol handshake before dispatching workspace requests', async () => {
    const fakeServer = new FakeSocketServer()
    const handler = vi.fn()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.listSessions, handler)

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    socket.emitMessage(
      serializeEnvelope({
        id: 'request-before-handshake',
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    await flushPromises()

    expect(handler).not.toHaveBeenCalled()
    expect(parseSentEnvelope(socket, 0)).toMatchObject({
      id: 'request-before-handshake',
      type: 'error',
      error: {
        code: 'HANDLER_ERROR',
        message: 'Workspace WebSocket handshake required'
      }
    })
  })

  it('acknowledges supported protocol handshakes with the assigned client id', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:testEcho'])

    expect(parseSentEnvelope(socket, 0)).toEqual({
      id: 'handshake-1',
      type: 'handshake_ack',
      clientId: 'client-1',
      protocolVersion: PROTOCOL_VERSION
    })
  })

  it('stores client capabilities from handshake and invokes client handlers', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:testEcho'])

    expect(server.hasClientCapability('client-1', 'client:testEcho')).toBe(true)
    expect(server.hasClientCapability('client-1', 'client:missing')).toBe(false)

    const resultPromise = server.invokeClient('client-1', 'client:testEcho', 'hi')
    const request = parseSentEnvelope(socket, 1) as { id: string }

    expect(request).toMatchObject({
      type: 'request',
      channel: 'client:testEcho',
      args: ['hi']
    })

    socket.emitMessage(
      serializeEnvelope({
        id: request.id,
        type: 'response',
        channel: 'client:testEcho',
        result: 'echo:hi'
      })
    )
    await flushPromises()

    await expect(resultPromise).resolves.toBe('echo:hi')
  })

  it('discovers handshaken client capabilities by workspace id', async () => {
    const fakeServer = new FakeSocketServer()
    let nextClientNumber = 1
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => `client-${nextClientNumber++}`,
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const firstSocket = fakeServer.connect()
    const secondSocket = fakeServer.connect()
    const thirdSocket = fakeServer.connect()

    await performHandshake(firstSocket, 'handshake-1', undefined, ['client:testEcho'], 'workspace-1')
    await performHandshake(
      secondSocket,
      'handshake-2',
      undefined,
      ['client:testEcho'],
      'workspace-2'
    )
    await performHandshake(thirdSocket, 'handshake-3', undefined, ['client:other'], 'workspace-1')

    expect(server.findClientsWithCapability('client:testEcho')).toEqual(['client-1', 'client-2'])
    expect(
      server.findClientsWithCapability('client:testEcho', { workspaceId: 'workspace-1' })
    ).toEqual(['client-1'])
    expect(
      server.findClientsWithCapability('client:testEcho', { workspaceId: 'workspace-2' })
    ).toEqual(['client-2'])
    expect(
      server.findClientsWithCapability('client:other', { workspaceId: 'workspace-1' })
    ).toEqual(['client-3'])
  })

  it('removes disconnected clients from capability discovery', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:testEcho'], 'workspace-1')

    expect(
      server.findClientsWithCapability('client:testEcho', { workspaceId: 'workspace-1' })
    ).toEqual(['client-1'])

    socket.close()

    expect(
      server.findClientsWithCapability('client:testEcho', { workspaceId: 'workspace-1' })
    ).toEqual([])
  })

  it('rejects server-to-client invokes for missing capabilities', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket)

    await expect(server.invokeClient('client-1', 'client:missing')).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE'
    })
    expect(socket.sent).toHaveLength(1)
  })

  it('rejects server-to-client invokes for disconnected clients', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:testEcho'])
    socket.close()

    await expect(server.invokeClient('client-1', 'client:testEcho')).rejects.toMatchObject({
      code: 'CLIENT_DISCONNECTED'
    })
    expect(server.hasClientCapability('client-1', 'client:testEcho')).toBe(false)
  })

  it('rejects pending server-to-client invokes when a client disconnects mid-flight', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:slow'])
    const resultPromise = server.invokeClient('client-1', 'client:slow')

    socket.close()

    await expect(resultPromise).rejects.toMatchObject({
      code: 'CLIENT_DISCONNECTED'
    })
  })

  it('turns client capability response errors into coded errors', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:failing'])

    const resultPromise = server.invokeClient('client-1', 'client:failing')
    const request = parseSentEnvelope(socket, 1) as { id: string }

    socket.emitMessage(
      serializeEnvelope({
        id: request.id,
        type: 'response',
        channel: 'client:failing',
        error: {
          code: 'HANDLER_ERROR',
          message: 'boom'
        }
      })
    )
    await flushPromises()

    await expect(resultPromise).rejects.toMatchObject({
      code: 'HANDLER_ERROR',
      message: 'boom'
    })
  })

  it('requires a matching auth token when the workspace server is configured with one', async () => {
    const fakeServer = new FakeSocketServer()
    const handler = vi.fn()
    const server = createWorkspaceWebSocketRpcServer({
      authToken: 'workspace-secret',
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.listSessions, handler)

    await server.getTransportUrl()
    const missingTokenSocket = fakeServer.connect()
    const wrongTokenSocket = fakeServer.connect()
    const validSocket = fakeServer.connect()

    await performHandshake(missingTokenSocket, 'missing-token')
    await performHandshake(wrongTokenSocket, 'wrong-token', 'nope')
    await performHandshake(validSocket, 'valid-token', 'workspace-secret')
    validSocket.emitMessage(
      serializeEnvelope({
        id: 'request-1',
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    await flushPromises()

    expect(parseSentEnvelope(missingTokenSocket, 0)).toMatchObject({
      id: 'missing-token',
      type: 'error',
      error: {
        code: 'AUTHENTICATION_FAILED'
      }
    })
    expect(parseSentEnvelope(wrongTokenSocket, 0)).toMatchObject({
      id: 'wrong-token',
      type: 'error',
      error: {
        code: 'AUTHENTICATION_FAILED'
      }
    })
    expect(missingTokenSocket.readyState).toBe(3)
    expect(wrongTokenSocket.readyState).toBe(3)
    expect(parseSentEnvelope(validSocket, 0)).toEqual({
      id: 'valid-token',
      type: 'handshake_ack',
      clientId: 'client-1',
      protocolVersion: PROTOCOL_VERSION
    })
    expect(parseSentEnvelope(validSocket, 1)).toMatchObject({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions
    })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('rejects unsupported protocol versions and closes the socket', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    socket.emitMessage(
      serializeEnvelope({
        id: 'handshake-1',
        type: 'handshake',
        protocolVersion: '0.1'
      })
    )
    await flushPromises()

    expect(parseSentEnvelope(socket, 0)).toMatchObject({
      id: 'handshake-1',
      type: 'error',
      error: {
        code: 'PROTOCOL_VERSION_UNSUPPORTED'
      }
    })
    expect(socket.readyState).toBe(3)
  })

  it('dispatches request envelopes to session handlers and returns response envelopes', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.listSessions, () => [{ id: 'session-1' }])

    await expect(server.getTransportUrl()).resolves.toBe('ws://127.0.0.1:48123')

    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:testEcho'])
    socket.emitMessage(
      serializeEnvelope({
        id: 'request-1',
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    await flushPromises()

    expect(parseSentEnvelope(socket, 1)).toEqual({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions,
      result: [{ id: 'session-1' }]
    })
  })

  it('pushes session runtime events as event envelopes to workspace clients', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })
    const operationEvent = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    server.handle(RPC_CHANNELS.sessions.runOperation, (context) => {
      context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, operationEvent, {
        workspaceId: 'project-1'
      })

      return { ok: true }
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket, 'handshake-1', undefined, ['client:testEcho'])
    socket.emitMessage(
      serializeEnvelope({
        id: 'request-1',
        type: 'request',
        channel: RPC_CHANNELS.sessions.runOperation,
        args: [{ operationId: 'operation-1' }]
      })
    )
    await flushPromises()

    expect(socket.sent.map((raw) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [operationEvent],
        workspaceId: 'project-1'
      })
    )
    expect(
      server.findClientsWithCapability('client:testEcho', { workspaceId: 'project-1' })
    ).toEqual(['client-1'])
  })

  it('returns error response envelopes for unknown channels and handler errors', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.getMessages, () => {
      throw new Error('boom')
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket)
    socket.emitMessage(
      serializeEnvelope({
        id: 'missing-request',
        type: 'request',
        channel: 'sessions:missing',
        args: []
      })
    )
    socket.emitMessage(
      serializeEnvelope({
        id: 'error-request',
        type: 'request',
        channel: RPC_CHANNELS.sessions.getMessages,
        args: [{ sessionId: 'session-1' }]
      })
    )
    await flushPromises()

    expect(parseSentEnvelope(socket, 1)).toMatchObject({
      id: 'missing-request',
      type: 'response',
      error: {
        code: 'CHANNEL_NOT_FOUND'
      }
    })
    expect(parseSentEnvelope(socket, 2)).toMatchObject({
      id: 'error-request',
      type: 'response',
      error: {
        code: 'HANDLER_ERROR',
        message: 'boom'
      }
    })
  })

  it('closes sockets and the WebSocket server during cleanup', async () => {
    vi.useFakeTimers()
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    expect(vi.getTimerCount()).toBe(1)

    await server.close()

    expect(socket.readyState).toBe(3)
    expect(fakeServer.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pushes event envelopes only to clients that completed handshake', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    await server.getTransportUrl()
    const readySocket = fakeServer.connect()
    const pendingSocket = fakeServer.connect()

    await performHandshake(readySocket)
    server.push(RPC_CHANNELS.sessions.event, { to: 'all' }, event)

    expect(readySocket.sent.map((raw) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    )
    expect(pendingSocket.sent).toEqual([])
  })

  it('does not push event envelopes to closed clients', async () => {
    const fakeServer = new FakeSocketServer()
    let nextClientNumber = 1
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => `client-${nextClientNumber++}`,
      createWebSocketServer: () => fakeServer
    })
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    await server.getTransportUrl()
    const closedSocket = fakeServer.connect()
    const activeSocket = fakeServer.connect()

    await performHandshake(closedSocket, 'handshake-1')
    await performHandshake(activeSocket, 'handshake-2')
    closedSocket.close()
    server.push(RPC_CHANNELS.sessions.event, { to: 'all' }, event)

    expect(closedSocket.sent).toHaveLength(1)
    expect(activeSocket.sent.map((raw) => JSON.parse(raw))).toContainEqual(
      expect.objectContaining({
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    )
  })

  it('allows a new socket to handshake and dispatch after a previous socket closes', async () => {
    const fakeServer = new FakeSocketServer()
    let nextClientNumber = 1
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => `client-${nextClientNumber++}`,
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.listSessions, () => [{ id: 'session-2' }])

    await server.getTransportUrl()
    const firstSocket = fakeServer.connect()

    await performHandshake(firstSocket, 'handshake-1')
    firstSocket.close()

    const secondSocket = fakeServer.connect()

    await performHandshake(secondSocket, 'handshake-2')
    secondSocket.emitMessage(
      serializeEnvelope({
        id: 'request-1',
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    await flushPromises()

    expect(parseSentEnvelope(secondSocket, 0)).toEqual({
      id: 'handshake-2',
      type: 'handshake_ack',
      clientId: 'client-2',
      protocolVersion: PROTOCOL_VERSION
    })
    expect(parseSentEnvelope(secondSocket, 1)).toEqual({
      id: 'request-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.listSessions,
      result: [{ id: 'session-2' }]
    })
  })

  it('pings handshaken clients on each heartbeat tick', async () => {
    vi.useFakeTimers()
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

    expect(socket.ping).toHaveBeenCalledOnce()

    await server.close()
  })

  it('keeps heartbeat clients alive when pong is received', async () => {
    vi.useFakeTimers()
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    socket.emitPong()
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)

    expect(socket.ping).toHaveBeenCalledTimes(2)
    expect(socket.terminate).not.toHaveBeenCalled()

    await server.close()
  })

  it('terminates stale heartbeat clients and removes them from push targets', async () => {
    vi.useFakeTimers()
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } as const

    await server.getTransportUrl()
    const socket = fakeServer.connect()

    await performHandshake(socket)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS)
    server.push(RPC_CHANNELS.sessions.event, { to: 'all' }, event)

    expect(socket.terminate).toHaveBeenCalledOnce()
    expect(socket.sent).toHaveLength(1)

    await server.close()
  })
})
