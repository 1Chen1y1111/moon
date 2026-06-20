// @vitest-environment node

/**
 * 负责验证 workspace WebSocket RPC server 的 envelope 调度和事件推送行为。
 * 测试使用 fake WebSocket，不打开真实网络端口。
 */

import { describe, expect, it, vi } from 'vitest'

import { serializeEnvelope } from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import { createWorkspaceWebSocketRpcServer } from '@main/bootstrap/workspace-websocket-rpc-server'

type FakeSocketEvent = 'message' | 'close' | 'error'
type FakeServerEvent = 'connection' | 'listening' | 'error'

class FakeSocket {
  readonly sent: string[] = []
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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('createWorkspaceWebSocketRpcServer', () => {
  it('dispatches request envelopes to session handlers and returns response envelopes', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createClientId: () => 'client-1',
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.listSessions, () => [{ id: 'session-1' }])

    await expect(server.getTransportInfo()).resolves.toEqual({
      url: 'ws://127.0.0.1:48123'
    })

    const socket = fakeServer.connect()

    socket.emitMessage(
      serializeEnvelope({
        id: 'request-1',
        type: 'request',
        channel: RPC_CHANNELS.sessions.listSessions,
        args: []
      })
    )
    await flushPromises()

    expect(JSON.parse(socket.sent[0])).toEqual({
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

    await server.getTransportInfo()
    const socket = fakeServer.connect()

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
  })

  it('returns error response envelopes for unknown channels and handler errors', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    server.handle(RPC_CHANNELS.sessions.getMessages, () => {
      throw new Error('boom')
    })

    await server.getTransportInfo()
    const socket = fakeServer.connect()

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

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      id: 'missing-request',
      type: 'response',
      error: {
        code: 'CHANNEL_NOT_FOUND'
      }
    })
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'error-request',
      type: 'response',
      error: {
        code: 'HANDLER_ERROR',
        message: 'boom'
      }
    })
  })

  it('closes sockets and the WebSocket server during cleanup', async () => {
    const fakeServer = new FakeSocketServer()
    const server = createWorkspaceWebSocketRpcServer({
      createWebSocketServer: () => fakeServer
    })

    await server.getTransportInfo()
    const socket = fakeServer.connect()

    await server.close()

    expect(socket.readyState).toBe(3)
    expect(fakeServer.close).toHaveBeenCalledOnce()
  })
})
