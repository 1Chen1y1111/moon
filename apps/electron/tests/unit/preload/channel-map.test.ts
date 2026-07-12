// @vitest-environment node

/**
 * 负责验证 preload channel map 统一引用 shared RPC channel。
 * 测试只检查 API 方法到协议 channel 的绑定，不触发 Electron IPC。
 */

import { describe, expect, it } from 'vitest'

import { RPC_CHANNELS } from '@moon/shared/protocol'
import { MOON_API_CHANNEL_MAP } from '@preload/channel-map'

describe('MOON_API_CHANNEL_MAP', () => {
  it('uses matching sessions API names for session RPC channels', () => {
    expect(MOON_API_CHANNEL_MAP['sessions.activateThread']).toEqual({
      type: 'invoke',
      channel: RPC_CHANNELS.sessions.activateThread
    })
    expect(MOON_API_CHANNEL_MAP['sessions.createMessageTurn']).toEqual({
      type: 'invoke',
      channel: RPC_CHANNELS.sessions.createMessageTurn
    })
    expect(MOON_API_CHANNEL_MAP['sessions.onSessionEvent']).toEqual({
      type: 'listener',
      channel: RPC_CHANNELS.sessions.event
    })
  })

  it('uses shared RPC channels for settings APIs', () => {
    expect(MOON_API_CHANNEL_MAP['settings.saveProvider']).toEqual({
      type: 'invoke',
      channel: RPC_CHANNELS.settings.saveProvider
    })
    expect(MOON_API_CHANNEL_MAP['settings.onChange']).toEqual({
      type: 'listener',
      channel: RPC_CHANNELS.settings.onChange
    })
  })

  it('uses shared RPC channels for projects APIs', () => {
    expect(MOON_API_CHANNEL_MAP['projects.getActive']).toEqual({
      type: 'invoke',
      channel: RPC_CHANNELS.projects.getActive
    })
    expect(MOON_API_CHANNEL_MAP['projects.onChange']).toEqual({
      type: 'listener',
      channel: RPC_CHANNELS.projects.onChange
    })
  })

  it('uses shared RPC channels for window control APIs', () => {
    expect(MOON_API_CHANNEL_MAP['windowControls.openSettings']).toEqual({
      type: 'invoke',
      channel: RPC_CHANNELS.window.openSettings
    })
    expect(MOON_API_CHANNEL_MAP['windowControls.onStateChange']).toEqual({
      type: 'listener',
      channel: RPC_CHANNELS.window.onStateChange
    })
  })
})
