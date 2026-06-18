/**
 * 负责验证 Pi backend driver 的 agent 创建规则。
 * 测试只覆盖当前不可用边界，不接入 Pi SDK 或子进程。
 */

import { describe, expect, it } from 'vitest'

import { piBackendNotWiredMessage } from '../../../../../src/agent'
import { piDriver } from '../../../../../src/agent/backend/internal/drivers/pi'

describe('piDriver', () => {
  it('rejects backend creation while Pi is not wired', () => {
    expect(piDriver.provider).toBe('pi')
    expect(() =>
      piDriver.createAgent({
        provider: 'pi',
        model: 'gpt-5',
        messages: []
      })
    ).toThrow(piBackendNotWiredMessage)
  })
})
