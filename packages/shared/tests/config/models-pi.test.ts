/**
 * 负责验证 Pi 模型目录 helper 的 provider 过滤和 Moon 模型映射。
 * 测试只读取本地 Pi SDK 静态目录，不访问真实 provider 网络。
 */

import { describe, expect, it } from 'vitest'

import { getPiProviderBaseUrl, getPiProviderModels } from '../../src/config/models-pi'

describe('models-pi', () => {
  it('returns current DeepSeek models with protocol metadata', async () => {
    const models = await getPiProviderModels('deepseek')
    const modelIds = models.map((model) => model.id)

    expect(modelIds).toContain('deepseek-v4-flash')
    expect(modelIds).toContain('deepseek-v4-pro')
    expect(models.find((model) => model.id === 'deepseek-v4-flash')).toEqual(
      expect.objectContaining({
        name: 'DeepSeek V4 Flash',
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com',
        supportsReasoning: true,
        contextWindow: 1_000_000,
        maxOutputTokens: 384_000
      })
    )
  })

  it('returns an empty list for unknown Pi providers', async () => {
    await expect(getPiProviderModels('unknown-provider')).resolves.toEqual([])
    await expect(getPiProviderBaseUrl('unknown-provider')).resolves.toBe('')
  })
})
