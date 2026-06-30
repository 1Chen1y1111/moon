/**
 * 负责验证 Pi-compatible backend driver 的 agent 创建规则。
 * 测试只覆盖当前不可用边界，不触发真实 provider 网络请求。
 */

import { describe, expect, it } from 'vitest'

import { piBackendNotWiredMessage } from '../../../../../src/agent'
import { piCompatDriver } from '../../../../../src/agent/backend/internal/drivers/pi-compat'

describe('piCompatDriver', () => {
  it('rejects anthropic-messages endpoints while Pi is not wired', () => {
    expect(piCompatDriver.provider).toBe('pi_compat')
    expect(() =>
      piCompatDriver.resolve({
        provider: 'pi_compat',
        model: 'compat-model',
        apiKey: 'test-key',
        baseUrl: 'https://compat.example.com',
        customEndpoint: { api: 'anthropic-messages' },
        messages: []
      })
    ).toThrow(piBackendNotWiredMessage)
  })

  it('rejects openai-completions endpoints while Pi is not wired', () => {
    expect(() =>
      piCompatDriver.resolve({
        provider: 'pi_compat',
        model: 'gpt-compatible',
        apiKey: 'test-key',
        baseUrl: 'https://api.compat.example.com/v1',
        customEndpoint: { api: 'openai-completions' },
        messages: []
      })
    ).toThrow(piBackendNotWiredMessage)
  })
})
