// @vitest-environment node

/**
 * 负责验证 preload workspace WebSocket wrapper 只做 Electron transport info 到 URL 的适配。
 * 连接状态机和 envelope 分发由 server-core transport 测试覆盖。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { serializeEnvelope } from '@moon/server-core/transport'
import { PROTOCOL_VERSION, RPC_CHANNELS } from '@moon/shared/protocol'
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

/**
 * 等待当前 promise 微任务执行完毕。
 */
async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * 完成 workspace WebSocket 协议握手。
 */
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

describe('createWorkspaceWebSocketRpcClient preload wrapper', () => {
  afterEach(() => {
    FakeWebSocket.instances = []
    vi.useRealTimers()
  })

  it('connects to the URL returned by Electron workspace transport info', async () => {
    const getTransportInfo = vi.fn(async () => ({
      mode: 'remote' as const,
      url: 'ws://remote-workspace.local:48123'
    }))
    const client = createWorkspaceWebSocketRpcClient({
      createId: () => 'request-1',
      getTransportInfo,
      WebSocketCtor: FakeWebSocket
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

    expect(getTransportInfo).toHaveBeenCalledOnce()
    expect(socket.url).toBe('ws://remote-workspace.local:48123')
    await expect(resultPromise).resolves.toEqual([])
  })

  it('keeps session event payload shape unchanged', async () => {
    const client = createWorkspaceWebSocketRpcClient({
      getTransportInfo: async () => ({
        mode: 'local',
        url: 'ws://127.0.0.1:48123'
      }),
      WebSocketCtor: FakeWebSocket
    })
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
})
