/**
 * 负责验证 provider 设置草稿工具函数的模型同步规则。
 * 测试只覆盖纯数据转换，不渲染 React 组件或访问 IPC。
 */

import { describe, expect, it } from 'vitest'

import {
  createDraftFromProvider,
  normalizeProviderDraftForSubmit,
  updateModelEnabled
} from '@renderer/features/ProviderSettings/provider-settings.utils'
import { createDefaultProviderSettings } from '@moon/shared/domain/settings'
import type { ProviderDraft } from '@renderer/features/ProviderSettings/types'

function createDraft(input: Partial<ProviderDraft> = {}): ProviderDraft {
  return {
    provider: 'deepseek',
    name: 'DeepSeek',
    type: 'deepseek',
    apiKey: 'sk-demo',
    model: '',
    models: [],
    availableModels: [],
    baseUrl: '',
    apiFormat: 'anthropic',
    useMaxCompletionTokens: false,
    customHeaders: '',
    enabled: true,
    requiresBaseUrl: false,
    noApiKey: false,
    isCustom: false,
    isACP: false,
    isOAuth: false,
    acpCommand: '',
    acpArgs: [],
    acpAuthMethodId: '',
    ...input
  }
}

describe('provider settings utils', () => {
  it('shows built-in defaults and clears unchanged endpoint defaults on submit', () => {
    const provider = {
      ...createDefaultProviderSettings('deepseek'),
      apiFormat: 'anthropic' as const,
      baseUrl: ''
    }
    const draft = createDraftFromProvider(provider)

    expect(draft.baseUrl).toBe('https://api.deepseek.com')
    expect(draft.apiFormat).toBe('openai-chat')
    expect(normalizeProviderDraftForSubmit(provider, draft)).toEqual(
      expect.objectContaining({
        baseUrl: '',
        apiFormat: 'openai-chat'
      })
    )
  })

  it('keeps custom endpoint overrides for built-in providers while fixing hidden protocol', () => {
    const provider = {
      ...createDefaultProviderSettings('deepseek'),
      apiFormat: 'anthropic' as const,
      baseUrl: 'https://proxy.example.com/anthropic'
    }
    const draft = createDraftFromProvider(provider)

    expect(draft.baseUrl).toBe('https://proxy.example.com/anthropic')
    expect(draft.apiFormat).toBe('openai-chat')
    expect(normalizeProviderDraftForSubmit(provider, draft)).toEqual(
      expect.objectContaining({
        baseUrl: 'https://proxy.example.com/anthropic',
        apiFormat: 'openai-chat'
      })
    )
  })

  it('keeps endpoint fields for providers that require an editable endpoint', () => {
    const provider = {
      ...createDefaultProviderSettings('azure-openai'),
      apiFormat: 'anthropic' as const,
      baseUrl: 'https://proxy.example.com/anthropic'
    }
    const draft = createDraftFromProvider(provider)

    expect(draft.baseUrl).toBe('https://proxy.example.com/anthropic')
    expect(draft.apiFormat).toBe('anthropic')
    expect(normalizeProviderDraftForSubmit(provider, draft)).toBe(draft)
  })

  it('promotes an enabled available model into the active model list', () => {
    const draft = createDraft({
      availableModels: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          enabled: false,
          isManual: false,
          supportsToolCalling: true
        }
      ]
    })

    const nextDraft = updateModelEnabled(draft, 'deepseek-v4-flash')

    expect(nextDraft.model).toBe('deepseek-v4-flash')
    expect(nextDraft.models).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        enabled: true,
        isManual: false,
        supportsToolCalling: true
      })
    ])
    expect(nextDraft.availableModels).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        enabled: true,
        isManual: false,
        supportsToolCalling: true
      })
    ])
  })
})
