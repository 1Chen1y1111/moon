/**
 * 负责验证 provider settings 到 agent backend config 的转换规则。
 * 测试不创建真实 backend，避免 SDK 和 Electron 运行时影响纯配置边界。
 */

import { describe, expect, it } from 'vitest'

import {
  assertProviderReadyForAgent,
  createProviderAgentBackendConfig,
  resolveAgentBackendProvider
} from '../../src/agent'
import { createDefaultProviderSettings, type ProviderSettings } from '../../src/domain/settings'

/**
 * 创建启用状态的 provider fixture，并允许单测覆盖关键字段。
 */
function createProvider(
  input: Partial<ProviderSettings> & Pick<ProviderSettings, 'provider'>
): ProviderSettings {
  const provider = createDefaultProviderSettings(input.provider)

  return {
    ...provider,
    apiKey: ' stored-key ',
    enabled: true,
    hasApiKey: true,
    model: 'model-id',
    ...input
  }
}

describe('provider agent adapter', () => {
  it('maps Anthropic providers to Anthropic backend config', () => {
    const provider = createProvider({
      provider: 'claude',
      type: 'anthropic',
      baseUrl: ' https://api.anthropic.com '
    })
    const messages = [{ role: 'user' as const, content: 'hello' }]

    expect(resolveAgentBackendProvider(provider)).toBe('anthropic')
    expect(createProviderAgentBackendConfig(provider, 'claude-sonnet', messages)).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
      apiKey: 'stored-key',
      baseUrl: 'https://api.anthropic.com',
      thinkingLevel: 'medium',
      messages
    })
  })

  it('maps Anthropic-compatible API format to Anthropic backend config', () => {
    const provider = createProvider({
      provider: 'openrouter',
      type: 'openrouter',
      apiFormat: 'anthropic',
      baseUrl: ' https://router.example/v1 '
    })

    expect(resolveAgentBackendProvider(provider)).toBe('anthropic')
    expect(createProviderAgentBackendConfig(provider, 'anthropic/model', [])).toMatchObject({
      provider: 'anthropic',
      baseUrl: 'https://router.example/v1'
    })
    expect(createProviderAgentBackendConfig(provider, 'anthropic/model', [])).not.toHaveProperty(
      'customEndpoint'
    )
  })

  it('maps DeepSeek OpenAI-compatible defaults to pi_compat config but rejects execution', () => {
    const provider = createProvider({
      provider: 'deepseek',
      model: 'deepseek-v4-flash'
    })

    expect(resolveAgentBackendProvider(provider)).toBe('pi_compat')
    expect(() => assertProviderReadyForAgent(provider)).toThrow('Pi backend is not wired yet')
    expect(createProviderAgentBackendConfig(provider, 'deepseek-v4-flash', [])).toMatchObject({
      provider: 'pi_compat',
      model: 'deepseek-v4-flash',
      apiKey: 'stored-key',
      baseUrl: 'https://api.deepseek.com',
      customEndpoint: { api: 'openai-completions' }
    })
  })

  it('maps DeepSeek Anthropic protocol to Anthropic backend config', () => {
    const provider = createProvider({
      provider: 'deepseek',
      apiFormat: 'anthropic',
      model: 'deepseek-v4-flash'
    })

    expect(resolveAgentBackendProvider(provider)).toBe('anthropic')
    expect(createProviderAgentBackendConfig(provider, 'deepseek-v4-flash', [])).toMatchObject({
      provider: 'anthropic',
      model: 'deepseek-v4-flash',
      apiKey: 'stored-key',
      baseUrl: 'https://api.deepseek.com/anthropic'
    })
    expect(createProviderAgentBackendConfig(provider, 'deepseek-v4-flash', [])).not.toHaveProperty(
      'customEndpoint'
    )
  })

  it('lets DeepSeek Anthropic protocol override OpenAI-compatible model metadata', () => {
    const provider = createProvider({
      provider: 'deepseek',
      apiFormat: 'anthropic',
      model: 'deepseek-v4-flash',
      availableModels: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          enabled: true,
          isManual: false,
          providerApi: 'openai-completions',
          providerBaseUrl: 'https://api.deepseek.com'
        }
      ]
    })

    expect(resolveAgentBackendProvider(provider)).toBe('anthropic')
    expect(createProviderAgentBackendConfig(provider, 'deepseek-v4-flash', [])).toMatchObject({
      provider: 'anthropic',
      model: 'deepseek-v4-flash',
      apiKey: 'stored-key',
      baseUrl: 'https://api.deepseek.com/anthropic'
    })
    expect(createProviderAgentBackendConfig(provider, 'deepseek-v4-flash', [])).not.toHaveProperty(
      'customEndpoint'
    )
  })

  it('lets selected model protocol metadata override provider defaults', () => {
    const provider = createProvider({
      provider: 'openrouter',
      type: 'openrouter',
      apiFormat: 'openai-chat',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      availableModels: [
        {
          id: 'anthropic/claude-sonnet',
          name: 'Claude Sonnet',
          enabled: true,
          isManual: false,
          providerApi: 'anthropic-messages',
          providerBaseUrl: 'https://router.example/anthropic'
        }
      ]
    })

    expect(resolveAgentBackendProvider(provider, 'anthropic/claude-sonnet')).toBe('anthropic')
    expect(createProviderAgentBackendConfig(provider, 'anthropic/claude-sonnet', [])).toMatchObject(
      {
        provider: 'anthropic',
        model: 'anthropic/claude-sonnet',
        baseUrl: 'https://router.example/anthropic'
      }
    )
    expect(
      createProviderAgentBackendConfig(provider, 'anthropic/claude-sonnet', [])
    ).not.toHaveProperty('customEndpoint')
  })

  it('rejects Pi-family providers while Pi is not wired', () => {
    const provider = createProvider({
      provider: 'gemini',
      type: 'google',
      apiFormat: 'openai-chat'
    })

    expect(resolveAgentBackendProvider(provider)).toBe('pi')
    expect(() => assertProviderReadyForAgent(provider)).toThrow('Pi backend is not wired yet')
  })

  it('rejects providers that require a missing API key', () => {
    const provider = createProvider({
      provider: 'claude',
      type: 'anthropic',
      apiKey: '',
      hasApiKey: false,
      noApiKey: false
    })

    expect(() => assertProviderReadyForAgent(provider)).toThrow('API key is required')
  })

  it('omits API key for noApiKey providers', () => {
    const provider = createProvider({
      provider: 'claude',
      type: 'anthropic',
      apiKey: '',
      hasApiKey: false,
      noApiKey: true
    })

    expect(() => assertProviderReadyForAgent(provider)).not.toThrow()
    expect(createProviderAgentBackendConfig(provider, 'claude-sonnet', [])).not.toHaveProperty(
      'apiKey'
    )
  })
})
