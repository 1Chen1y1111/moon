/**
 * 负责验证 LLM connection 到 agent backend config 的转换规则。
 * 测试只覆盖纯配置映射，不创建真实 backend 或访问 Electron 运行时。
 */

import { describe, expect, it } from 'vitest'

import {
  assertLlmConnectionReadyForAgent,
  createConnectionAgentBackendConfig,
  resolveConnectionAgentBackendProvider
} from '../../src/agent'
import { llmConnectionSchema } from '../../src/config'
import type { AgentSourceRecord } from '../../src/agent'

describe('createConnectionAgentBackendConfig', () => {
  it('maps Anthropic connection fields to backend config', () => {
    const messages = [{ role: 'user' as const, content: 'hello' }]
    const connection = llmConnectionSchema.parse({
      id: 'anthropic-main',
      name: 'Claude Main',
      backend: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: ' stored-key ',
      baseUrl: ' https://api.anthropic.com ',
      thinkingLevel: 'high'
    })

    expect(createConnectionAgentBackendConfig({ connection, messages })).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'stored-key',
      baseUrl: 'https://api.anthropic.com',
      thinkingLevel: 'high',
      messages
    })
  })

  it('maps Pi connection without executing the Pi backend', () => {
    const connection = llmConnectionSchema.parse({
      id: 'pi-main',
      name: 'Pi Main',
      backend: 'pi',
      model: 'gpt-5'
    })

    expect(createConnectionAgentBackendConfig({ connection, messages: [] })).toEqual({
      provider: 'pi',
      model: 'gpt-5',
      thinkingLevel: 'medium',
      messages: []
    })
  })

  it('maps pi_compat custom endpoint fields to backend config', () => {
    const messages = [{ role: 'user' as const, content: 'hello' }]
    const connection = llmConnectionSchema.parse({
      id: 'compat-main',
      name: 'Compat Main',
      backend: 'pi_compat',
      model: 'compat-model',
      apiKey: ' stored-key ',
      baseUrl: ' https://compat.example.com ',
      customEndpoint: { api: 'openai-completions' }
    })

    expect(resolveConnectionAgentBackendProvider(connection)).toBe('pi_compat')
    expect(createConnectionAgentBackendConfig({ connection, messages })).toEqual({
      provider: 'pi_compat',
      model: 'compat-model',
      apiKey: 'stored-key',
      baseUrl: 'https://compat.example.com',
      customEndpoint: { api: 'openai-completions' },
      thinkingLevel: 'medium',
      messages
    })
  })

  it('keeps legacy Anthropic Messages compat connections on the Pi-compatible backend', () => {
    const messages = [{ role: 'user' as const, content: 'hello' }]
    const connection = llmConnectionSchema.parse({
      id: 'compat-main',
      name: 'Compat Main',
      backend: 'pi_compat',
      model: 'anthropic/claude-sonnet',
      apiKey: ' stored-key ',
      baseUrl: ' https://compat.example.com ',
      customEndpoint: { api: 'anthropic-messages' }
    })

    expect(resolveConnectionAgentBackendProvider(connection)).toBe('pi_compat')
    expect(createConnectionAgentBackendConfig({ connection, messages })).toEqual({
      provider: 'pi_compat',
      model: 'anthropic/claude-sonnet',
      apiKey: 'stored-key',
      baseUrl: 'https://compat.example.com',
      customEndpoint: { api: 'anthropic-messages' },
      thinkingLevel: 'medium',
      messages
    })
  })

  it('adds workspace context when provided by the session scope', () => {
    const connection = llmConnectionSchema.parse({
      id: 'anthropic-main',
      name: 'Claude Main',
      backend: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'stored-key'
    })

    expect(
      createConnectionAgentBackendConfig({
        connection,
        messages: [],
        workspace: {
          name: 'moon',
          path: '/workspace/moon'
        }
      })
    ).toMatchObject({
      workspace: {
        name: 'moon',
        path: '/workspace/moon'
      }
    })
  })

  it('adds permission mode when provided by the session scope', () => {
    const connection = llmConnectionSchema.parse({
      id: 'anthropic-main',
      name: 'Claude Main',
      backend: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'stored-key'
    })

    expect(
      createConnectionAgentBackendConfig({ connection, messages: [], permissionMode: 'ask' })
    ).toMatchObject({
      permissionMode: 'ask'
    })
  })

  it('adds source records when provided by the session scope', () => {
    const connection = llmConnectionSchema.parse({
      id: 'anthropic-main',
      name: 'Claude Main',
      backend: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'stored-key'
    })
    const sources: AgentSourceRecord[] = [
      {
        slug: 'github',
        name: 'GitHub',
        description: 'GitHub repository context',
        status: 'active'
      }
    ]

    expect(
      createConnectionAgentBackendConfig({ connection, messages: [], sources })
    ).toMatchObject({
      sources
    })
  })

  it('adds agent session runtime state when provided by the session scope', () => {
    const connection = llmConnectionSchema.parse({
      id: 'anthropic-main',
      name: 'Claude Main',
      backend: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'stored-key'
    })
    const agentSessionState = {
      activatedSourceSlugs: [],
      permissionGrants: [{ type: 'bash' as const, toolName: 'Bash', command: 'pnpm test' }],
      sourceGuideReads: []
    }

    expect(
      createConnectionAgentBackendConfig({
        connection,
        messages: [],
        agentSessionState
      })
    ).toMatchObject({
      agentSessionState
    })
  })
})

describe('assertLlmConnectionReadyForAgent', () => {
  it('accepts enabled Anthropic connections with an API key', () => {
    const connection = llmConnectionSchema.parse({
      id: 'anthropic-main',
      name: 'Claude Main',
      backend: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: 'stored-key'
    })

    expect(() => assertLlmConnectionReadyForAgent(connection)).not.toThrow()
  })

  it('rejects disabled connections, missing API keys, and unwired Pi-family connections', () => {
    expect(() =>
      assertLlmConnectionReadyForAgent(
        llmConnectionSchema.parse({
          id: 'disabled-main',
          name: 'Disabled Main',
          backend: 'anthropic',
          model: 'claude-sonnet-4-5',
          apiKey: 'stored-key',
          enabled: false
        })
      )
    ).toThrow('Disabled Main is disabled.')

    expect(() =>
      assertLlmConnectionReadyForAgent(
        llmConnectionSchema.parse({
          id: 'missing-key',
          name: 'Missing Key',
          backend: 'anthropic',
          model: 'claude-sonnet-4-5'
        })
      )
    ).toThrow('Missing Key API key is required.')

    expect(() =>
      assertLlmConnectionReadyForAgent(
        llmConnectionSchema.parse({
          id: 'pi-main',
          name: 'Pi Main',
          backend: 'pi',
          model: 'gpt-5',
          apiKey: 'stored-key'
        })
      )
    ).toThrow('Pi backend is not wired yet')

    expect(() =>
      assertLlmConnectionReadyForAgent(
        llmConnectionSchema.parse({
          id: 'compat-main',
          name: 'Compat Main',
          backend: 'pi_compat',
          model: 'compat-model',
          apiKey: 'stored-key',
          customEndpoint: { api: 'openai-completions' }
        })
      )
    ).toThrow('Pi backend is not wired yet')
  })
})
