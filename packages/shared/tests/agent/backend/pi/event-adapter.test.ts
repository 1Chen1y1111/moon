/**
 * 负责验证 Pi 占位 adapter 的统一错误事件。
 * 测试只锁定当前未接线状态，避免未来接入协议时错误文案静默漂移。
 */

import { describe, expect, it } from 'vitest'

import { createPiNotWiredEvent } from '../../../../src/agent/backend/pi/event-adapter'

describe('createPiNotWiredEvent', () => {
  it('returns the current placeholder error event', () => {
    expect(createPiNotWiredEvent()).toEqual({
      type: 'error',
      message: 'Pi backend is not wired yet. Configure an Anthropic provider for now.'
    })
  })
})
