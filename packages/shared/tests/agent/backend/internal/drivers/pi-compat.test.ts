/**
 * 负责验证 Pi-compatible backend driver 的 agent 创建规则。
 * 测试只覆盖协议选择，不触发真实 provider 网络请求。
 */

import { describe, expect, it } from 'vitest'

import {
  CompatAnthropicMessagesAgent,
  CompatOpenAiCompletionsAgent,
  PiAgent
} from '../../../../../src/agent'
import { piCompatDriver } from '../../../../../src/agent/backend/internal/drivers/pi-compat'

describe('piCompatDriver', () => {
  it('creates a compat Anthropic Messages agent for anthropic-messages endpoints', () => {
    const agent = piCompatDriver.createAgent({
      provider: 'pi_compat',
      model: 'compat-model',
      apiKey: 'test-key',
      baseUrl: 'https://compat.example.com',
      customEndpoint: { api: 'anthropic-messages' },
      messages: []
    })

    expect(piCompatDriver.provider).toBe('pi_compat')
    expect(agent).toBeInstanceOf(CompatAnthropicMessagesAgent)
    expect(agent.getModel()).toBe('compat-model')
  })

  it('creates a compat OpenAI Chat Completions agent for openai-completions endpoints', () => {
    const agent = piCompatDriver.createAgent({
      provider: 'pi_compat',
      model: 'gpt-compatible',
      apiKey: 'test-key',
      baseUrl: 'https://api.compat.example.com/v1',
      customEndpoint: { api: 'openai-completions' },
      messages: []
    })

    expect(agent).toBeInstanceOf(CompatOpenAiCompletionsAgent)
    expect(agent.getModel()).toBe('gpt-compatible')
  })

  it('returns a clear placeholder for missing compatible endpoint config', async () => {
    const agent = piCompatDriver.createAgent({
      provider: 'pi_compat',
      model: 'compat-model',
      messages: []
    })
    const events = []

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(agent).toBeInstanceOf(PiAgent)
    expect(events).toEqual([
      {
        type: 'error',
        message:
          'Unsupported compatible endpoint protocol. Choose OpenAI Chat Completions or Anthropic Messages.'
      }
    ])
  })
})
