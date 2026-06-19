/**
 * 负责验证 shared protocol 的 channel 路由分类完整且互斥。
 * 这些断言保护后续 RoutedClient 接入前的纯协议边界。
 */

import { describe, expect, it } from 'vitest'

import {
  getAllChannelValues,
  isLocalOnly,
  isRemoteEligible,
  LOCAL_ONLY_CHANNELS,
  REMOTE_ELIGIBLE_CHANNELS,
  RPC_CHANNELS
} from '@moon/shared/protocol'

describe('protocol channel routing', () => {
  it('classifies every RPC channel exactly once', () => {
    for (const channel of getAllChannelValues()) {
      const matchingSets = [
        LOCAL_ONLY_CHANNELS.has(channel),
        REMOTE_ELIGIBLE_CHANNELS.has(channel)
      ].filter(Boolean)

      expect(matchingSets).toHaveLength(1)
    }
  })

  it('does not include unknown channels in routing sets', () => {
    const allChannels = new Set(getAllChannelValues())

    for (const channel of LOCAL_ONLY_CHANNELS) {
      expect(allChannels.has(channel)).toBe(true)
    }

    for (const channel of REMOTE_ELIGIBLE_CHANNELS) {
      expect(allChannels.has(channel)).toBe(true)
    }
  })

  it('marks all session channels as remote eligible', () => {
    for (const channel of Object.values(RPC_CHANNELS.sessions)) {
      expect(isRemoteEligible(channel)).toBe(true)
      expect(isLocalOnly(channel)).toBe(false)
    }

    expect(isRemoteEligible(RPC_CHANNELS.sessions.event)).toBe(true)
  })

  it('marks app-shell channels as local only', () => {
    const appShellChannels = [
      ...Object.values(RPC_CHANNELS.settings),
      ...Object.values(RPC_CHANNELS.projects),
      ...Object.values(RPC_CHANNELS.window)
    ]

    for (const channel of appShellChannels) {
      expect(isLocalOnly(channel)).toBe(true)
      expect(isRemoteEligible(channel)).toBe(false)
    }
  })

  it('returns false for channels outside the shared protocol table', () => {
    expect(isLocalOnly('chat:sendMessage')).toBe(false)
    expect(isRemoteEligible('chat:sendMessage')).toBe(false)
  })
})
