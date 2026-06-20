// @vitest-environment node

/**
 * 负责验证 EnvelopePushPort 会把 push 调用编码为 event envelope。
 * 测试只使用 fake send，不触发 Electron IPC、WebSocket 或真实广播。
 */

import { describe, expect, it, vi } from 'vitest'

import { EnvelopePushPort, pushTyped } from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import { RPC_CHANNELS, type MessageEnvelope, type PushTarget } from '@moon/shared/protocol'

function createSessionEvent(): ChatOperationEvent {
  return {
    type: 'message-delta',
    operationId: 'operation-1',
    sessionId: 'session-1',
    topicId: 'topic-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    delta: 'hello'
  }
}

function createPortFixture() {
  const send = vi.fn<(target: PushTarget, envelope: MessageEnvelope) => void>()
  const port = new EnvelopePushPort({
    createId: () => 'event-1',
    send
  })

  return { port, send }
}

describe('EnvelopePushPort', () => {
  it('encodes workspace targets as event envelopes with workspaceId', () => {
    const { port, send } = createPortFixture()
    const target = { to: 'workspace', workspaceId: 'workspace-1' } satisfies PushTarget
    const event = createSessionEvent()

    port.push(RPC_CHANNELS.sessions.event, target, event)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(target, {
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.sessions.event,
      args: [event],
      workspaceId: 'workspace-1'
    })
  })

  it('encodes client targets as event envelopes with clientId', () => {
    const { port, send } = createPortFixture()
    const target = { to: 'client', clientId: 'client-1' } satisfies PushTarget
    const event = createSessionEvent()

    port.push(RPC_CHANNELS.sessions.event, target, event)

    expect(send).toHaveBeenCalledWith(target, {
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.sessions.event,
      args: [event],
      clientId: 'client-1'
    })
  })

  it('keeps all-window targets out of the event envelope routing fields', () => {
    const { port, send } = createPortFixture()
    const target = { to: 'all' } satisfies PushTarget
    const event = createSessionEvent()

    port.push(RPC_CHANNELS.sessions.event, target, event)

    expect(send).toHaveBeenCalledWith(target, {
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.sessions.event,
      args: [event]
    })
  })

  it('works with pushTyped without wrapping the payload', () => {
    const { port, send } = createPortFixture()
    const target = { to: 'workspace', workspaceId: 'workspace-1' } satisfies PushTarget
    const event = createSessionEvent()

    pushTyped(port, RPC_CHANNELS.sessions.event, target, event)

    expect(send).toHaveBeenCalledWith(target, {
      id: 'event-1',
      type: 'event',
      channel: RPC_CHANNELS.sessions.event,
      args: [event],
      workspaceId: 'workspace-1'
    })
  })
})
