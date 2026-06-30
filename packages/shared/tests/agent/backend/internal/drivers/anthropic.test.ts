/**
 * 负责验证 Anthropic backend driver 的 provider runtime 解析规则。
 * 测试只覆盖 provider 专属字段，不触发真实 SDK 查询。
 */

import { describe, expect, it } from 'vitest'

import { anthropicDriver } from '../../../../../src/agent/backend/internal/drivers/anthropic'

describe('anthropicDriver', () => {
  it('resolves provider runtime fields from Anthropic config', () => {
    expect(anthropicDriver.provider).toBe('anthropic')
    expect(
      anthropicDriver.resolve({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        apiKey: 'test-key',
        baseUrl: 'https://api.anthropic.example.com',
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.example.com'
    })
  })
})
