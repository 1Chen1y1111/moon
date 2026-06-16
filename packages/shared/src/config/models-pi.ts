/**
 * 负责把 Pi SDK 模型目录转换成 Moon 的 provider 模型结构。
 * 该文件只能在 Node/main 侧使用，不能从 renderer 组件或浏览器 bundle 导入。
 */

import type { Api, KnownProvider, Model } from '@mariozechner/pi-ai'

import type { ProviderModel } from '../domain/provider'

/**
 * 判断 Pi SDK 模型是否应从可选模型列表中隐藏。
 */
function isExcludedPiModel(modelId: string): boolean {
  if (modelId === 'codex-mini-latest') {
    return true
  }

  if (modelId.startsWith('gpt-4')) {
    return true
  }

  const normalizedId = modelId.toLowerCase().replace(/^pi\//u, '')

  return (
    normalizedId === 'claude-opus-4-6' ||
    normalizedId === 'claude-opus-4.6' ||
    normalizedId === 'anthropic/claude-opus-4-6' ||
    normalizedId === 'anthropic/claude-opus-4.6' ||
    normalizedId.endsWith('.anthropic.claude-opus-4-6-v1') ||
    normalizedId === 'anthropic.claude-opus-4-6-v1'
  )
}

/**
 * 移除 Pi 前缀，Moon 内部继续使用 provider 原生模型 ID。
 */
function stripPiModelPrefix(modelId: string): string {
  return modelId.startsWith('pi/') ? modelId.slice(3) : modelId
}

/**
 * 把 Pi SDK 模型转换成 Moon provider 模型，保留后续 runtime 分流需要的协议元数据。
 */
function createProviderModelFromPiModel(model: Model<Api>): ProviderModel {
  const id = stripPiModelPrefix(model.id)

  return {
    id,
    name: model.name.trim() || id,
    enabled: false,
    isManual: false,
    supportsVision: model.input.includes('image'),
    supportsReasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxTokens,
    providerApi: model.api,
    providerBaseUrl: model.baseUrl
  }
}

/**
 * 从 Pi SDK 读取指定 provider 的模型目录；未知 provider 或 SDK 异常时返回空数组。
 */
export async function getPiProviderModels(piProvider: string): Promise<ProviderModel[]> {
  try {
    const { getModels } = await import('@mariozechner/pi-ai')
    const models = getModels(piProvider as KnownProvider)

    return models
      .filter((model) => !isExcludedPiModel(model.id))
      .map((model) => createProviderModelFromPiModel(model))
  } catch {
    return []
  }
}

/**
 * 从 Pi SDK 模型目录读取 provider 默认 endpoint，调用方可作为 UI 或测试回退。
 */
export async function getPiProviderBaseUrl(piProvider: string): Promise<string> {
  const models = await getPiProviderModels(piProvider)

  return models[0]?.providerBaseUrl ?? ''
}
