// @vitest-environment node

/**
 * 负责验证 preload workspace WebSocket RPC client 的 envelope request 和 event 订阅。
 * 测试使用 fake WebSocket，不连接真实网络。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { serializeEnvelope } from '@moon/server-core/transport'
import { PROTOCOL_VERSION, RPC_CHANNELS } from '@moon/shared/protocol'
import { createWorkspaceWebSocketRpcClient } from '@preload/websocket-rpc-client'
import type { WorkspaceWebSocketConnectionState } from '@preload/websocket-rpc-client'

type FakeEventName = 'open' | 'message' | 'close' | 'error'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly sent: string[] = []
  readyState = 0
  private readonly listeners = new Map<FakeEventName, Array<(event: { data?: unknown }) => void>>()

  /**
   * 创建 fake WebSocket，并记录连接目标 URL。
   */
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  /**
   * 注册 fake WebSocket 事件监听器。
   */
  addEventListener(event: FakeEventName, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  /**
   * 移除 fake WebSocket 事件监听器。
   */
  removeEventListener(event: FakeEventName, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((candidate) => candidate !== listener)
    )
  }

  /**
   * 记录 client 发出的 envelope JSON。
   */
  send(data: string): void {
    this.sent.push(data)
  }

  /**
   * 模拟关闭 WebSocket。
   */
  close(): void {
    this.readyState = 3
    this.emit('close', {})
  }

  /**
   * 触发 fake WebSocket 事件。
   */
  emit(event: FakeEventName, payload: { data?: unknown } = {}): void {
    if (event === 'open') {
      this.readyState = 1
    }

    this.listeners.get(event)?.forEach((listener) => {
      listener(payload)
    })
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createClient(options: {
  onConnectionStateChange?: (state: WorkspaceWebSocketConnectionState) => void
  reconnectDelayMs?: number
} = {}) {
  return createWorkspaceWebSocketRpcClient({
    createId: () => 'request-1',
    getTransportInfo: async () => ({ url: 'ws://127.0.0.1:48123' }),
    onConnectionStateChange: options.onConnectionStateChange,
    reconnectDelayMs: options.reconnectDelayMs,
    WebSocketCtor: FakeWebSocket
  })
}

function parseSentEnvelope(socket: FakeWebSocket, index: number): unknown {
  return JSON.parse(socket.sent[index])
}

function acknowledgeHandshake(socket: FakeWebSocket, clientId = 'client-1'): void {
  socket.emit('message', {
    data: serializeEnvelope({
      id: 'workspace-handshake',
      type: 'handshake_ack',
      clientId,
      protocolVersion: PROTOCOL_VERSION
    })
  })
}

describe('createWorkspaceWebSocketRpcClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('handshakes before sending request envelopes and returns response results', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.getMessages, {
      sessionId: 'session-1'
    })

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    await flushPromises()

    expect(socket.url).toBe('ws://127.0.0.1:48123')
    expect(parseSentEnvelope(socket, 0)).toEqual({
      id: 'workspace-handshake',
      type: 'handshake',
      protocolVersion: PROTOCOL_VERSION
    })

    acknowledgeHandshake(socket)
    await flushPromises()

    expect(parseSentEnvelope(socket, 1)).toEqual({
      id: 'request-1',
      type: 'request',
      channel: RPC_CHANNELS.sessions.getMessages,
      args: [{ sessionId: 'session-1' }]
    })

    socket.emit('message', {
      data: serializeEnvelope({
        id: 'request-1',
        type: 'response',
        channel: RPC_CHANNELS.sessions.getMessages,
        result: [{ id: 'message-1' }]
      })
    })

    await expect(resultPromise).resolves.toEqual([{ id: 'message-1' }])
  })

  it('reports the initial invoke connection state sequence', async () => {
    FakeWebSocket.instances = []
    const states: WorkspaceWebSocketConnectionState[] = []
    const client = createClient({
      onConnectionStateChange: (state) => {
        states.push(state)
      }
    })
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    acknowledgeHandshake(socket)
    await flushPromises()
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'request-1',
        type: 'response',
        channel: RPC_CHANNELS.sessions.listSessions,
        result: []
      })
    })

    await expect(resultPromise).resolves.toEqual([])
    expect(states).toEqual(['connecting', 'handshaking', 'connected'])
  })

  it('turns handshake error envelopes into coded Errors', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'workspace-handshake',
        type: 'error',
        error: {
          code: 'PROTOCOL_VERSION_UNSUPPORTED',
          message: 'unsupported'
        }
      })
    })

    await expect(resultPromise).rejects.toMatchObject({
      code: 'PROTOCOL_VERSION_UNSUPPORTED',
      message: 'unsupported'
    })
  })

  it('turns response error envelopes into coded Errors', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.runOperation, {
      operationId: 'operation-1'
    })

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    await flushPromises()
    acknowledgeHandshake(socket)
    await flushPromises()
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'request-1',
        type: 'response',
        channel: RPC_CHANNELS.sessions.runOperation,
        error: {
          code: 'HANDLER_ERROR',
          message: 'boom'
        }
      })
    })

    await expect(resultPromise).rejects.toMatchObject({
      code: 'HANDLER_ERROR',
      message: 'boom'
    })
  })

  it('expands session event envelopes to listeners', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const listener = vi.fn()
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    }

    client.on(RPC_CHANNELS.sessions.event, listener)
    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    acknowledgeHandshake(socket)
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    })

    expect(listener).toHaveBeenCalledWith(event)
  })

  it('does not notify unsubscribed listeners after close', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const listener = vi.fn()
    const unsubscribe = client.on(RPC_CHANNELS.sessions.event, listener)

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    acknowledgeHandshake(socket)
    unsubscribe()
    socket.close()
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [{ type: 'noop' }]
      })
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects pending requests when the WebSocket closes', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    acknowledgeHandshake(socket)
    await flushPromises()
    socket.close()

    await expect(resultPromise).rejects.toThrow('Workspace WebSocket closed')
  })

  it('reconnects and handshakes again after a recoverable close', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const firstResultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const firstSocket = FakeWebSocket.instances[0]

    firstSocket.emit('open')
    acknowledgeHandshake(firstSocket)
    await flushPromises()
    firstSocket.close()

    await expect(firstResultPromise).rejects.toThrow('Workspace WebSocket closed')

    const secondResultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const secondSocket = FakeWebSocket.instances[1]

    secondSocket.emit('open')
    await flushPromises()

    expect(parseSentEnvelope(secondSocket, 0)).toEqual({
      id: 'workspace-handshake',
      type: 'handshake',
      protocolVersion: PROTOCOL_VERSION
    })

    acknowledgeHandshake(secondSocket, 'client-2')
    await flushPromises()

    expect(parseSentEnvelope(secondSocket, 1)).toMatchObject({
      id: 'request-1',
      type: 'request',
      channel: RPC_CHANNELS.sessions.listSessions
    })

    secondSocket.emit('message', {
      data: serializeEnvelope({
        id: 'request-1',
        type: 'response',
        channel: RPC_CHANNELS.sessions.listSessions,
        result: [{ id: 'session-2' }]
      })
    })

    await expect(secondResultPromise).resolves.toEqual([{ id: 'session-2' }])
  })

  it('recovers when the WebSocket closes before handshake completes', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const firstResultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const firstSocket = FakeWebSocket.instances[0]

    firstSocket.emit('open')
    firstSocket.close()

    await expect(firstResultPromise).rejects.toThrow('Workspace WebSocket closed')

    const secondResultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const secondSocket = FakeWebSocket.instances[1]

    secondSocket.emit('open')
    acknowledgeHandshake(secondSocket, 'client-2')
    await flushPromises()
    secondSocket.emit('message', {
      data: serializeEnvelope({
        id: 'request-1',
        type: 'response',
        channel: RPC_CHANNELS.sessions.listSessions,
        result: [{ id: 'session-2' }]
      })
    })

    await expect(secondResultPromise).resolves.toEqual([{ id: 'session-2' }])
  })

  it('keeps active event listeners across reconnects', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const listener = vi.fn()
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'after reconnect'
    }

    client.on(RPC_CHANNELS.sessions.event, listener)
    await flushPromises()
    const firstSocket = FakeWebSocket.instances[0]

    firstSocket.emit('open')
    acknowledgeHandshake(firstSocket)
    firstSocket.close()

    const reconnectPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const secondSocket = FakeWebSocket.instances[1]

    secondSocket.emit('open')
    acknowledgeHandshake(secondSocket, 'client-2')
    await flushPromises()
    secondSocket.emit('message', {
      data: serializeEnvelope({
        id: 'request-1',
        type: 'response',
        channel: RPC_CHANNELS.sessions.listSessions,
        result: []
      })
    })
    secondSocket.emit('message', {
      data: serializeEnvelope({
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    })

    await expect(reconnectPromise).resolves.toEqual([])
    expect(listener).toHaveBeenCalledWith(event)
  })

  it('reconnects active subscriptions in the background after a recoverable close', async () => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    const states: WorkspaceWebSocketConnectionState[] = []
    const client = createClient({
      onConnectionStateChange: (state) => {
        states.push(state)
      },
      reconnectDelayMs: 25
    })
    const listener = vi.fn()
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'after background reconnect'
    }

    client.on(RPC_CHANNELS.sessions.event, listener)
    await flushPromises()
    const firstSocket = FakeWebSocket.instances[0]

    firstSocket.emit('open')
    acknowledgeHandshake(firstSocket)
    firstSocket.close()

    expect(states).toEqual([
      'connecting',
      'handshaking',
      'connected',
      'disconnected',
      'reconnecting'
    ])

    vi.advanceTimersByTime(25)
    await flushPromises()
    const secondSocket = FakeWebSocket.instances[1]

    expect(secondSocket).toBeDefined()
    secondSocket.emit('open')
    acknowledgeHandshake(secondSocket, 'client-2')
    secondSocket.emit('message', {
      data: serializeEnvelope({
        id: 'event-1',
        type: 'event',
        channel: RPC_CHANNELS.sessions.event,
        args: [event]
      })
    })

    expect(states).toEqual([
      'connecting',
      'handshaking',
      'connected',
      'disconnected',
      'reconnecting',
      'handshaking',
      'connected'
    ])
    expect(listener).toHaveBeenCalledWith(event)
  })

  it('does not replay pending requests during background reconnect', async () => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    const client = createClient({ reconnectDelayMs: 25 })
    const listener = vi.fn()

    client.on(RPC_CHANNELS.sessions.event, listener)
    await flushPromises()
    const firstSocket = FakeWebSocket.instances[0]

    firstSocket.emit('open')
    acknowledgeHandshake(firstSocket)
    await flushPromises()
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()

    expect(firstSocket.sent.filter((raw) => JSON.parse(raw).type === 'request')).toHaveLength(1)

    firstSocket.close()

    await expect(resultPromise).rejects.toThrow('Workspace WebSocket closed')

    vi.advanceTimersByTime(25)
    await flushPromises()
    const secondSocket = FakeWebSocket.instances[1]

    secondSocket.emit('open')
    acknowledgeHandshake(secondSocket, 'client-2')
    await flushPromises()

    expect(secondSocket.sent.filter((raw) => JSON.parse(raw).type === 'request')).toHaveLength(0)
  })

  it('does not reconnect after the last active listener unsubscribes', async () => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    const states: WorkspaceWebSocketConnectionState[] = []
    const client = createClient({
      onConnectionStateChange: (state) => {
        states.push(state)
      },
      reconnectDelayMs: 25
    })
    const unsubscribe = client.on(RPC_CHANNELS.sessions.event, vi.fn())

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    acknowledgeHandshake(socket)
    socket.close()
    unsubscribe()
    vi.advanceTimersByTime(25)
    await flushPromises()

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(states).toEqual([
      'connecting',
      'handshaking',
      'connected',
      'disconnected',
      'reconnecting',
      'disconnected'
    ])
  })

  it('does not reconnect after terminal handshake protocol errors', async () => {
    FakeWebSocket.instances = []
    const client = createClient()
    const firstResultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'workspace-handshake',
        type: 'error',
        error: {
          code: 'PROTOCOL_VERSION_UNSUPPORTED',
          message: 'unsupported'
        }
      })
    })

    await expect(firstResultPromise).rejects.toMatchObject({
      code: 'PROTOCOL_VERSION_UNSUPPORTED',
      message: 'unsupported'
    })

    await expect(client.invoke(RPC_CHANNELS.sessions.listSessions)).rejects.toMatchObject({
      code: 'PROTOCOL_VERSION_UNSUPPORTED',
      message: 'unsupported'
    })
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('reports terminal-error state after handshake protocol errors', async () => {
    FakeWebSocket.instances = []
    const states: WorkspaceWebSocketConnectionState[] = []
    const client = createClient({
      onConnectionStateChange: (state) => {
        states.push(state)
      }
    })
    const resultPromise = client.invoke(RPC_CHANNELS.sessions.listSessions)

    await flushPromises()
    const socket = FakeWebSocket.instances[0]

    socket.emit('open')
    socket.emit('message', {
      data: serializeEnvelope({
        id: 'workspace-handshake',
        type: 'error',
        error: {
          code: 'PROTOCOL_VERSION_UNSUPPORTED',
          message: 'unsupported'
        }
      })
    })

    await expect(resultPromise).rejects.toMatchObject({
      code: 'PROTOCOL_VERSION_UNSUPPORTED',
      message: 'unsupported'
    })
    expect(states).toEqual(['connecting', 'handshaking', 'terminal-error'])
  })
})
