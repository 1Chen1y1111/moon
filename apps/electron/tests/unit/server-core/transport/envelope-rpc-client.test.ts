// @vitest-environment node

/**
 * 负责验证 EnvelopeRpcClient 的 request 编码、response 解包和 event 订阅行为。
 * 测试只使用 fake transport，不触发 Electron IPC、WebSocket 或真实网络连接。
 */

import { describe, expect, it, vi } from 'vitest'

import { EnvelopeRpcClient } from '@moon/server-core/transport'
import type { MessageEnvelope } from '@moon/shared/protocol'
import { RPC_CHANNELS } from '@moon/shared/protocol'

type EnvelopeListener = (envelope: MessageEnvelope) => void

/**
 * 创建可手动投递 envelope 的 fake transport，便于验证订阅过滤逻辑。
 */
function createTransportFixture() {
  const listeners = new Set<EnvelopeListener>()
  const request = vi.fn(async (envelope: MessageEnvelope): Promise<MessageEnvelope> => {
    return {
      id: envelope.id,
      type: 'response',
      channel: envelope.channel,
      result: { ok: true }
    }
  })
  const subscribe = vi.fn((listener: EnvelopeListener) => {
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  })
  const emit = (envelope: MessageEnvelope) => {
    for (const listener of listeners) {
      listener(envelope)
    }
  }

  return { emit, listeners, request, subscribe }
}

describe('EnvelopeRpcClient', () => {
  it('sends request envelopes and returns response results', async () => {
    const { request, subscribe } = createTransportFixture()
    const client = new EnvelopeRpcClient({
      createId: () => 'request-1',
      request,
      subscribe
    })

    await expect(client.invoke('demo:echo', { text: 'hello' })).resolves.toEqual({ ok: true })

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({
      id: 'request-1',
      type: 'request',
      channel: 'demo:echo',
      args: [{ text: 'hello' }]
    })
  })

  it('throws response errors with the wire error code preserved', async () => {
    const request = vi.fn(async (envelope: MessageEnvelope): Promise<MessageEnvelope> => {
      return {
        id: envelope.id,
        type: 'response',
        channel: envelope.channel,
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'too slow'
        }
      }
    })
    const client = new EnvelopeRpcClient({
      createId: () => 'request-1',
      request,
      subscribe: () => () => undefined
    })

    await expect(client.invoke('demo:timeout')).rejects.toMatchObject({
      message: 'too slow',
      code: 'REQUEST_TIMEOUT'
    })
  })

  it('dispatches matching event envelopes and expands args to listeners', () => {
    const { emit, request, subscribe } = createTransportFixture()
    const client = new EnvelopeRpcClient({
      createId: () => 'request-1',
      request,
      subscribe
    })
    const listener = vi.fn()

    client.on(RPC_CHANNELS.sessions.event, listener)

    emit({
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.sessions.event,
      args: ['operation-1', { ok: true }]
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('operation-1', { ok: true })
  })

  it('ignores non-event envelopes and events from other channels', () => {
    const { emit, request, subscribe } = createTransportFixture()
    const client = new EnvelopeRpcClient({
      createId: () => 'request-1',
      request,
      subscribe
    })
    const listener = vi.fn()

    client.on(RPC_CHANNELS.sessions.event, listener)

    emit({
      id: 'response-1',
      type: 'response',
      channel: RPC_CHANNELS.sessions.event,
      result: 'ignored'
    })
    emit({
      id: 'event-2',
      type: 'event',
      channel: 'demo:event',
      args: ['ignored']
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('unsubscribes from the underlying event transport', () => {
    const { emit, listeners, request, subscribe } = createTransportFixture()
    const client = new EnvelopeRpcClient({
      createId: () => 'request-1',
      request,
      subscribe
    })
    const listener = vi.fn()

    const unsubscribe = client.on(RPC_CHANNELS.sessions.event, listener)
    expect(listeners.size).toBe(1)

    unsubscribe()
    expect(listeners.size).toBe(0)

    emit({
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.sessions.event,
      args: ['ignored']
    })

    expect(listener).not.toHaveBeenCalled()
  })
})
