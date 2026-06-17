/**
 * 负责验证 provider 目录和 endpoint resolver 的共享规则。
 * 测试只覆盖纯函数，不依赖 Electron、数据库或真实网络。
 */

import { describe, expect, it } from 'vitest'

import {
  resolveProviderDefaultApiFormat,
  resolveProviderDefaultBaseUrl,
  resolveProviderEffectiveBaseUrl,
  resolveProviderModelDiscovery
} from '../../src/domain/provider'
import { createDefaultProviderSettings } from '../../src/domain/settings'

describe('provider endpoint resolver', () => {
  it('keeps DeepSeek on its provider root endpoint by default', () => {
    const provider = createDefaultProviderSettings('deepseek')

    expect(provider.defaultBaseUrl).toBe('https://api.deepseek.com')
    expect(resolveProviderDefaultApiFormat('deepseek', 'anthropic')).toBe('openai-chat')
    expect(resolveProviderDefaultBaseUrl('deepseek', 'anthropic')).toBe(
      'https://api.deepseek.com/anthropic'
    )
    expect(resolveProviderDefaultBaseUrl('deepseek', 'openai-chat')).toBe(
      'https://api.deepseek.com'
    )
  })

  it('lets user-configured base URLs override protocol defaults', () => {
    expect(
      resolveProviderEffectiveBaseUrl({
        provider: 'deepseek',
        apiFormat: 'openai-chat',
        baseUrl: ' https://proxy.example.com/v1 ',
        defaultBaseUrl: 'https://api.deepseek.com'
      })
    ).toBe('https://proxy.example.com/v1')
  })

  it('marks DeepSeek model discovery as static', () => {
    expect(resolveProviderModelDiscovery('deepseek')).toBe('static')
  })

  it('creates DeepSeek defaults with an enabled static chat model', () => {
    const provider = createDefaultProviderSettings('deepseek')

    expect(provider.apiFormat).toBe('openai-chat')
    expect(provider.model).toBe('deepseek-v4-flash')
    expect(provider.models).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        enabled: true
      }),
      expect.objectContaining({
        id: 'deepseek-v4-pro',
        enabled: false
      })
    ])
    expect(provider.availableModels).toEqual(provider.models)
  })
})
