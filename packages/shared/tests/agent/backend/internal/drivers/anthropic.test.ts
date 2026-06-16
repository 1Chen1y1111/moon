/**
 * 负责验证 Anthropic backend driver 的 agent 创建规则。
 * 测试只覆盖 driver 到 ClaudeAgent 的映射，不触发真实 SDK 查询。
 */

import { describe, expect, it } from 'vitest'

import { ClaudeAgent } from '../../../../../src/agent'
import { anthropicDriver } from '../../../../../src/agent/backend/internal/drivers/anthropic'

describe('anthropicDriver', () => {
  it('creates a ClaudeAgent with the configured model', () => {
    const agent = anthropicDriver.createAgent({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(anthropicDriver.provider).toBe('anthropic')
    expect(agent).toBeInstanceOf(ClaudeAgent)
    expect(agent.getModel()).toBe('claude-sonnet-4-5')
  })
})
