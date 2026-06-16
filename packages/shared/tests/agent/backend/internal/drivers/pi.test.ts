/**
 * 负责验证 Pi backend driver 的 agent 创建规则。
 * 测试只覆盖当前占位 PiAgent，不接入 Pi SDK 或子进程。
 */

import { describe, expect, it } from 'vitest'

import { PiAgent } from '../../../../../src/agent'
import { piDriver } from '../../../../../src/agent/backend/internal/drivers/pi'

describe('piDriver', () => {
  it('creates a PiAgent placeholder with the configured model', () => {
    const agent = piDriver.createAgent({
      provider: 'pi',
      model: 'gpt-5',
      messages: []
    })

    expect(piDriver.provider).toBe('pi')
    expect(agent).toBeInstanceOf(PiAgent)
    expect(agent.getModel()).toBe('gpt-5')
  })
})
