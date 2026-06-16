/**
 * 负责验证聊天 provider 选择规则的共享纯函数。
 * 测试不触碰 Electron、持久化或真实模型运行时。
 */

import { describe, expect, it } from 'vitest'

import {
  getSelectableChatProviderModels,
  isSelectableChatProvider,
  isSupportedChatProvider,
  selectDefaultChatProvider,
  selectDefaultSelectableChatProvider
} from '../../src/domain/chat-provider'
import { createDefaultAppSettings, createDefaultProviderSettings } from '../../src/domain/settings'

describe('chat provider selection rules', () => {
  it('allows DeepSeek to be selected and sent through the OpenAI-compatible runtime', () => {
    const settings = createDefaultAppSettings()
    const provider = {
      ...createDefaultProviderSettings('deepseek'),
      enabled: true,
      hasApiKey: true,
      apiKey: 'sk-deepseek-demo'
    }

    settings.providers.deepseek = provider

    expect(isSelectableChatProvider(provider)).toBe(true)
    expect(isSupportedChatProvider(provider)).toBe(true)
    expect(selectDefaultSelectableChatProvider(settings)).toBe(provider)
    expect(selectDefaultChatProvider(settings)).toBe(provider)
  })

  it('returns available models so the selector can enable them on click', () => {
    const provider = {
      ...createDefaultProviderSettings('deepseek'),
      models: [],
      availableModels: [
        {
          id: 'deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          enabled: false,
          isManual: false
        }
      ]
    }

    expect(getSelectableChatProviderModels(provider)).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        enabled: false
      })
    ])
  })
})
