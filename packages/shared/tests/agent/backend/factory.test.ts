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
  const sourceRecords = [
    {
      slug: 'github',
      name: 'GitHub',
      description: 'GitHub repository context',
      status: 'active' as const
    }
  ]

  it('returns the registered backend provider list', () => {
    expect(getAvailableAgentProviders()).toEqual(['anthropic', 'pi', 'pi_compat'])
  })

  it('creates a Claude backend for Anthropic config', () => {
    const backend = createBackend({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      messages: [{ role: 'user', content: 'hello' }]
    })

    expect(backend).toBeInstanceOf(ClaudeAgent)
    expect(backend.getModel()).toBe('claude-sonnet-4-5')
  })

  it('passes resolved runtime context into the Claude backend', () => {
    const agentSessionState = {
      activatedSourceSlugs: [],
      permissionGrants: [{ type: 'bash' as const, toolName: 'Bash', command: 'pnpm test' }],
      sourceGuideReads: []
    }
    const backend = createBackend({
      agentSessionState,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      messages: [{ role: 'user', content: 'hello' }],
      permissionMode: 'ask',
      sources: sourceRecords,
      thinkingLevel: 'high',
      workspace: { name: 'moon', path: '/workspace/moon' }
    }) as unknown as {
      agentSessionState?: unknown
      apiKey?: string
      baseUrl?: string
      messages: unknown[]
      permissionMode?: string
      sourceRuntime: { buildContextBlock: () => string }
      thinkingLevel?: string
      workspace?: { name?: string; path: string }
    }

    expect(backend.agentSessionState).toBe(agentSessionState)
    expect(backend.apiKey).toBe('test-key')
    expect(backend.baseUrl).toBe('https://api.example.com')
    expect(backend.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(backend.permissionMode).toBe('ask')
    expect(backend.thinkingLevel).toBe('high')
    expect(backend.workspace).toEqual({ name: 'moon', path: '/workspace/moon' })
    expect(backend.sourceRuntime.buildContextBlock()).toBe(`<sources>
Active:
- github (GitHub): GitHub repository context
</sources>`)
  })

  it('rejects Anthropic Messages pi_compat config while Pi is not wired', () => {
    expect(() =>
      createBackend({
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
      createBackend({
        provider: 'pi_compat',
        model: 'deepseek-v4-flash',
        apiKey: 'test-key',
        baseUrl: 'https://api.deepseek.com',
        customEndpoint: { api: 'openai-completions' },
        messages: [{ role: 'user', content: 'hello' }]
      })
    ).toThrow(piBackendNotWiredMessage)
  })

  it('keeps createAgent as a compatibility alias', () => {
    expect(createAgent).toBe(createBackend)
  })

  it('rejects Pi config while Pi is not wired', () => {
    expect(() =>
      createBackend({
        provider: 'pi',
        model: 'gpt-5',
        messages: []
      })
    ).toThrow(piBackendNotWiredMessage)
  })
})
