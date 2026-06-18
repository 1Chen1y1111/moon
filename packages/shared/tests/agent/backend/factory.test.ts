/**
 * 负责验证 shared agent backend factory 的 provider 路由。
 * 测试只覆盖创建边界，不触发真实 SDK 网络调用或 Electron main 行为。
 */

import { describe, expect, it } from 'vitest'

import {
  ClaudeAgent,
  createAgent,
  createBackend,
  getAvailableAgentProviders,
  piBackendNotWiredMessage
} from '../../../src/agent'

describe('agent backend factory', () => {
  it('returns the registered backend provider list', () => {
    expect(getAvailableAgentProviders()).toEqual(['anthropic', 'pi', 'pi_compat'])
  })

  it('creates a Claude backend for Anthropic config', () => {
    const backend = createAgent({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(backend).toBeInstanceOf(ClaudeAgent)
    expect(backend.getModel()).toBe('claude-sonnet-4-5')
  })

  it('rejects Anthropic Messages pi_compat config while Pi is not wired', () => {
    expect(() =>
      createAgent({
        provider: 'pi_compat',
        model: 'compat-model',
        apiKey: 'test-key',
        baseUrl: 'https://compat.example.com',
        customEndpoint: { api: 'anthropic-messages' },
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).toThrow(piBackendNotWiredMessage)
  })

  it('rejects OpenAI Chat Completions pi_compat config while Pi is not wired', () => {
    expect(() =>
      createAgent({
        provider: 'pi_compat',
        model: 'deepseek-v4-flash',
        apiKey: 'test-key',
        baseUrl: 'https://api.deepseek.com',
        customEndpoint: { api: 'openai-completions' },
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).toThrow(piBackendNotWiredMessage)
  })

  it('keeps createBackend as a compatibility alias', () => {
    expect(createBackend).toBe(createAgent)
  })

  it('rejects Pi config while Pi is not wired', () => {
    expect(() =>
      createAgent({
        provider: 'pi',
        model: 'gpt-5',
        messages: []
      })
    ).toThrow(piBackendNotWiredMessage)
  })
})
