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
  PiAgent
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

  it('creates a Pi placeholder for Anthropic Messages pi_compat config', async () => {
    const backend = createAgent({
      provider: 'pi_compat',
      model: 'compat-model',
      apiKey: 'test-key',
      baseUrl: 'https://compat.example.com',
      customEndpoint: { api: 'anthropic-messages' },
      messages: [{ role: 'user', content: 'hello' }]
    })
    const events = []

    for await (const event of backend.chat('hello')) {
      events.push(event)
    }

    expect(backend).toBeInstanceOf(PiAgent)
    expect(backend.getModel()).toBe('compat-model')
    expect(events).toEqual([
      {
        type: 'error',
        message:
          'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'
      }
    ])
  })

  it('creates a Pi placeholder for OpenAI Chat Completions pi_compat config', async () => {
    const backend = createAgent({
      provider: 'pi_compat',
      model: 'deepseek-v4-flash',
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      customEndpoint: { api: 'openai-completions' },
      messages: [{ role: 'user', content: 'hello' }]
    })
    const events = []

    for await (const event of backend.chat('hello')) {
      events.push(event)
    }

    expect(backend).toBeInstanceOf(PiAgent)
    expect(backend.getModel()).toBe('deepseek-v4-flash')
    expect(events).toEqual([
      {
        type: 'error',
        message:
          'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'
      }
    ])
  })

  it('keeps createBackend as a compatibility alias', () => {
    expect(createBackend).toBe(createAgent)
  })

  it('creates a Pi placeholder backend for Pi config', async () => {
    const backend = createAgent({
      provider: 'pi',
      model: 'gpt-5',
      messages: []
    })
    const events = []

    for await (const event of backend.chat('hello')) {
      events.push(event)
    }

    expect(backend).toBeInstanceOf(PiAgent)
    expect(events).toEqual([
      {
        type: 'error',
        message:
          'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'
      }
    ])
  })
})
