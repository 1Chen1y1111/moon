// @vitest-environment node

/**
 * 负责验证 preload workspace WebSocket RPC client 的 envelope request 和 event 订阅。
 * 测试使用 fake WebSocket，不连接真实网络。
 */

import { describe, expect, it, vi } from 'vitest'

import { serializeEnvelope } from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'
import { createWorkspaceWebSocketRpcClient } from '@preload/websocket-rpc-client'

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
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function createClient() {
  return createWorkspaceWebSocketRpcClient({
    createId: () => 'request-1',
    getTransportInfo: async () => ({ url: 'ws://127.0.0.1:48123' }),
    WebSocketCtor: FakeWebSocket
  })
}

describe('createWorkspaceWebSocketRpcClient', () => {
  it('sends request envelopes through WebSocket and returns response results', async () => {
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
    expect(JSON.parse(socket.sent[0])).toEqual({
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
})
