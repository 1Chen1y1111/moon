/**
 * 负责验证 Pi-compatible backend driver 的 agent 创建规则。
 * 测试只覆盖当前占位边界，不触发真实 provider 网络请求。
 */

import { describe, expect, it } from 'vitest'

import { PiAgent } from '../../../../../src/agent'
import { piCompatDriver } from '../../../../../src/agent/backend/internal/drivers/pi-compat'

describe('piCompatDriver', () => {
  it('creates a Pi placeholder for anthropic-messages endpoints', async () => {
    const agent = piCompatDriver.createAgent({
      provider: 'pi_compat',
      model: 'compat-model',
      apiKey: 'test-key',
      baseUrl: 'https://compat.example.com',
      customEndpoint: { api: 'anthropic-messages' },
      messages: []
    })
    const events = []

    expect(piCompatDriver.provider).toBe('pi_compat')
    expect(agent).toBeInstanceOf(PiAgent)
    expect(agent.getModel()).toBe('compat-model')

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'error',
        message:
          'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'
      }
    ])
  })

  it('creates a Pi placeholder for openai-completions endpoints', async () => {
    const agent = piCompatDriver.createAgent({
      provider: 'pi_compat',
      model: 'gpt-compatible',
      apiKey: 'test-key',
      baseUrl: 'https://api.compat.example.com/v1',
      customEndpoint: { api: 'openai-completions' },
      messages: []
    })
    const events = []

    expect(agent).toBeInstanceOf(PiAgent)
    expect(agent.getModel()).toBe('gpt-compatible')

    for await (const event of agent.chat('hello')) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'error',
        message:
          'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'
      }
    ])
  })
})
