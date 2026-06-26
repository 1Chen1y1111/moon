// @vitest-environment node

/**
 * 负责验证 preload 通用 client API builder 的映射行为。
 * 测试只使用 fake RPC client，不触发 Electron IPC 或 renderer。
 */

import { describe, expect, it, vi } from 'vitest'

import { buildClientApi, type ChannelMap } from '@preload/build-client-api'

describe('buildClientApi', () => {
  it('builds nested invoke methods from dotted channel map keys', async () => {
    const client = {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn()
    }
    const channelMap = {
      'sessions.listSessions': { type: 'invoke', channel: 'sessions:listSessions' },
      'windowControls.close': { type: 'invoke', channel: 'window:close' }
    } satisfies ChannelMap
    const api = buildClientApi(client, channelMap)

    await expect(api.sessions.listSessions()).resolves.toEqual({ ok: true })
    await api.windowControls.close()

    expect(client.invoke).toHaveBeenCalledWith('sessions:listSessions')
    expect(client.invoke).toHaveBeenCalledWith('window:close')
  })

  it('builds listener methods from channel map entries', () => {
    const unsubscribe = vi.fn()
    const client = {
      invoke: vi.fn(),
      on: vi.fn(() => unsubscribe)
    }
    const channelMap = {
      'sessions.onSessionEvent': { type: 'listener', channel: 'session:event' }
    } satisfies ChannelMap
    const api = buildClientApi(client, channelMap)
    const listener = vi.fn()

    expect(api.sessions.onSessionEvent(listener)).toBe(unsubscribe)
    expect(client.on).toHaveBeenCalledWith('session:event', listener)
  })
})
