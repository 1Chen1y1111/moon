/**
 * 负责验证 shared protocol 的事件通道和 payload tuple 类型。
 * 这些测试保护后续 pushTyped / transport 接入前的纯类型契约。
 */

import { describe, expect, expectTypeOf, it } from 'vitest'

import type { ChatOperationEvent } from '../../src/domain/chat'
import type { ProjectsChangeEvent } from '../../src/domain/project'
import type { AppSettings } from '../../src/domain/settings'
import {
  RPC_CHANNELS,
  type BroadcastEventArgs,
  type BroadcastEventChannel,
  type BroadcastEventMap,
  type WindowState
} from '../../src/protocol'

type ExpectedBroadcastEventChannel =
  | typeof RPC_CHANNELS.sessions.event
  | typeof RPC_CHANNELS.settings.onChange
  | typeof RPC_CHANNELS.projects.onChange
  | typeof RPC_CHANNELS.window.onStateChange

describe('protocol broadcast events', () => {
  it('lists the current broadcast event channels', () => {
    expectTypeOf<BroadcastEventChannel>().toEqualTypeOf<ExpectedBroadcastEventChannel>()

    const channels: BroadcastEventChannel[] = [
      RPC_CHANNELS.sessions.event,
      RPC_CHANNELS.settings.onChange,
      RPC_CHANNELS.projects.onChange,
      RPC_CHANNELS.window.onStateChange
    ]

    expect(channels).toEqual([
      'session:event',
      'settings:onChange',
      'projects:onChange',
      'window:onStateChange'
    ])
  })

  it('describes payload tuples for every broadcast event channel', () => {
    expectTypeOf<BroadcastEventMap[typeof RPC_CHANNELS.sessions.event]>().toEqualTypeOf<
      [event: ChatOperationEvent]
    >()
    expectTypeOf<BroadcastEventMap[typeof RPC_CHANNELS.settings.onChange]>().toEqualTypeOf<
      [settings: AppSettings]
    >()
    expectTypeOf<BroadcastEventMap[typeof RPC_CHANNELS.projects.onChange]>().toEqualTypeOf<
      [event: ProjectsChangeEvent]
    >()
    expectTypeOf<BroadcastEventMap[typeof RPC_CHANNELS.window.onStateChange]>().toEqualTypeOf<
      [state: WindowState]
    >()
  })

  it('resolves channel args through BroadcastEventArgs', () => {
    expectTypeOf<BroadcastEventArgs<typeof RPC_CHANNELS.sessions.event>>().toEqualTypeOf<
      [event: ChatOperationEvent]
    >()
    expectTypeOf<BroadcastEventArgs<typeof RPC_CHANNELS.window.onStateChange>>().toEqualTypeOf<
      [state: WindowState]
    >()
  })
})
