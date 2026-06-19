// @vitest-environment node

/**
 * 负责验证 server-core typed push helper 的类型约束和透传行为。
 * 测试只使用 fake push port，不创建 Electron IPC、WebSocket 或真实广播。
 */

import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { pushTyped, type RpcPushPort, type TypedRpcPushPort } from '@moon/server-core/transport'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'
import type { ProjectsChangeEvent } from '@moon/shared/domain/project'
import type { AppSettings } from '@moon/shared/domain/settings'
import {
  RPC_CHANNELS,
  type BroadcastEventArgs,
  type PushTarget,
  type WindowState
} from '@moon/shared/protocol'

describe('pushTyped', () => {
  it('forwards channel, target, and payload to the push port without wrapping', () => {
    const server: RpcPushPort = { push: vi.fn() }
    const target = { to: 'workspace', workspaceId: 'workspace-1' } satisfies PushTarget
    const event = {
      type: 'message-delta',
      operationId: 'operation-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      delta: 'hello'
    } satisfies ChatOperationEvent

    pushTyped(server, RPC_CHANNELS.sessions.event, target, event)

    expect(server.push).toHaveBeenCalledTimes(1)
    expect(server.push).toHaveBeenCalledWith(RPC_CHANNELS.sessions.event, target, event)
  })

  it('keeps event args constrained by BroadcastEventMap', () => {
    expectTypeOf<BroadcastEventArgs<typeof RPC_CHANNELS.sessions.event>>().toEqualTypeOf<
      [event: ChatOperationEvent]
    >()
    expectTypeOf<BroadcastEventArgs<typeof RPC_CHANNELS.settings.onChange>>().toEqualTypeOf<
      [settings: AppSettings]
    >()
    expectTypeOf<BroadcastEventArgs<typeof RPC_CHANNELS.projects.onChange>>().toEqualTypeOf<
      [event: ProjectsChangeEvent]
    >()
    expectTypeOf<BroadcastEventArgs<typeof RPC_CHANNELS.window.onStateChange>>().toEqualTypeOf<
      [state: WindowState]
    >()
  })

  it('exposes a typed push port shape for future transports', () => {
    const server = {
      push: vi.fn()
    } satisfies TypedRpcPushPort
    const target = { to: 'client', clientId: 'client-1' } satisfies PushTarget
    const state = { isMaximized: true } satisfies WindowState

    server.push(RPC_CHANNELS.window.onStateChange, target, state)

    expect(server.push).toHaveBeenCalledWith(RPC_CHANNELS.window.onStateChange, target, state)
  })
})
