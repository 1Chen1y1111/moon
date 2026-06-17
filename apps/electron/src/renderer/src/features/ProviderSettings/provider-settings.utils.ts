/**
 * 负责 provider 设置表单草稿的纯数据转换。
 * 它只处理模型列表与表单字段同步，不访问 store、IPC 或持久化层。
 */

import {
  resolveProviderDefaultApiFormat,
  resolveProviderDefaultBaseUrl,
  type ProviderApiFormat,
  type ProviderModel
} from '@moon/shared/domain/provider'
import type { ProviderSettings } from '@moon/shared/domain/settings'

import type { ProviderDraft } from './types'

/**
 * 判断 provider 是否允许用户直接编辑协议；DeepSeek 暂时放出双协议切换用于 Claude SDK 测试。
 */
export function usesEditableProviderProtocol(
  provider: Pick<ProviderSettings, 'provider' | 'isCustom' | 'requiresBaseUrl'>
): boolean {
  return provider.isCustom || provider.requiresBaseUrl || provider.provider === 'deepseek'
}

/**
 * 返回 provider 设置页允许展示的协议选项，避免 DeepSeek 暂测入口暴露未接入协议。
 */
export function resolveProviderApiFormatOptions(
  provider: Pick<ProviderSettings, 'provider'>
): ProviderApiFormat[] {
  if (provider.provider === 'deepseek') {
    return ['openai-chat', 'anthropic']
  }

  return ['openai-chat', 'openai-responses', 'anthropic']
}

/**
 * 归一化 URL 比较值，避免默认 endpoint 的尾部斜杠造成无意义持久化覆盖。
 */
function normalizeBaseUrlForComparison(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/**
 * 解析表单要展示的默认 endpoint URL，优先使用 provider 元数据里的协议默认值。
 */
function resolveDefaultEndpointUrl(
  provider: ProviderSettings,
  apiFormat = provider.apiFormat
): string {
  return resolveProviderDefaultBaseUrl(provider.provider, apiFormat) || provider.defaultBaseUrl
}

/**
 * 归一化内置 provider 的 endpoint 覆盖，默认 URL 不写入持久化。
 */
function normalizeBuiltInEndpointOverride(
  provider: ProviderSettings,
  draft: ProviderDraft,
  apiFormat: ProviderApiFormat
): string {
  const baseUrl = draft.baseUrl.trim()
  const defaultBaseUrl = resolveDefaultEndpointUrl(provider, apiFormat)

  if (baseUrl.length === 0) {
    return ''
  }

  return normalizeBaseUrlForComparison(baseUrl) === normalizeBaseUrlForComparison(defaultBaseUrl)
    ? ''
    : baseUrl
}

/**
 * 从持久化 provider 设置创建表单草稿，内置 provider 会把空 endpoint 展开成默认 URL。
 */
export function createDraftFromProvider(provider: ProviderSettings): ProviderDraft {
  const usesEditableProtocol = usesEditableProviderProtocol(provider)
  const apiFormat = usesEditableProtocol
    ? provider.apiFormat
    : resolveProviderDefaultApiFormat(provider.provider, provider.apiFormat)
  const defaultBaseUrl = resolveDefaultEndpointUrl(provider, apiFormat)

  return {
    provider: provider.provider,
    name: provider.name,
    type: provider.type,
    apiKey: provider.hasApiKey ? '' : provider.apiKey,
    model: provider.model,
    models: provider.models,
    availableModels: provider.availableModels,
    baseUrl: provider.baseUrl.trim().length > 0 ? provider.baseUrl : defaultBaseUrl,
    apiFormat,
    useMaxCompletionTokens: provider.useMaxCompletionTokens,
    customHeaders: provider.customHeaders,
    enabled: provider.enabled,
    requiresBaseUrl: provider.requiresBaseUrl,
    noApiKey: provider.noApiKey,
    isCustom: provider.isCustom,
    isACP: provider.isACP,
    isOAuth: provider.isOAuth,
    acpCommand: provider.acpCommand,
    acpArgs: provider.acpArgs,
    acpAuthMethodId: provider.acpAuthMethodId
  }
}

/**
 * 根据协议切换生成下一份草稿；默认 endpoint 跟随协议，用户自定义 endpoint 保持不变。
 */
export function createDraftWithProviderApiFormat(
  provider: ProviderSettings,
  draft: ProviderDraft,
  apiFormat: ProviderApiFormat
): ProviderDraft {
  const currentBaseUrl = draft.baseUrl.trim()
  const currentDefaultBaseUrl = resolveDefaultEndpointUrl(provider, draft.apiFormat)
  const nextDefaultBaseUrl = resolveDefaultEndpointUrl(provider, apiFormat)
  const shouldFollowProtocolDefault =
    currentBaseUrl.length === 0 ||
    normalizeBaseUrlForComparison(currentBaseUrl) ===
      normalizeBaseUrlForComparison(currentDefaultBaseUrl)

  return {
    ...draft,
    apiFormat,
    baseUrl: shouldFollowProtocolDefault ? nextDefaultBaseUrl : draft.baseUrl
  }
}

/**
 * 归一化提交给主进程的 provider 草稿，确保隐藏协议不会被旧值覆盖。
 */
export function normalizeProviderDraftForSubmit(
  provider: ProviderSettings,
  draft: ProviderDraft
): ProviderDraft {
  if (provider.isCustom || provider.requiresBaseUrl) {
    return draft
  }

  const apiFormat = usesEditableProviderProtocol(provider)
    ? draft.apiFormat
    : resolveProviderDefaultApiFormat(provider.provider, draft.apiFormat)

  return {
    ...draft,
    baseUrl: normalizeBuiltInEndpointOverride(provider, draft, apiFormat),
    apiFormat
  }
}

/**
 * 归一化搜索文本，供 provider 目录过滤复用。
 */
export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * 从未知错误对象中提取可展示文案，失败时返回通用提示。
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message

    if (typeof message === 'string' && message.length > 0) {
      return message
    }
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return '请检查 Provider 配置后重试。'
}

/**
 * 根据启用状态和凭据状态计算 provider 在目录里的状态标签。
 */
export function getProviderStatus(provider: ProviderSettings): 'active' | 'inactive' | 'missing' {
  if (provider.enabled) {
    return 'active'
  }

  if (provider.hasApiKey || provider.noApiKey || provider.isACP || provider.isOAuth) {
    return 'inactive'
  }

  return 'missing'
}

/**
 * 按模型 ID 合并模型列表，保留非目标模型的原始顺序。
 */
function mergeModels(models: ProviderModel[], nextModel: ProviderModel): ProviderModel[] {
  const existingIndex = models.findIndex((model) => model.id === nextModel.id)

  if (existingIndex === -1) {
    return [...models, nextModel]
  }

  return models.map((model, index) => (index === existingIndex ? nextModel : model))
}

/**
 * 从 active 或 available 模型列表中查找模型，确保可用模型开关也能同步到 active 列表。
 */
function findDraftModel(draft: ProviderDraft, modelId: string): ProviderModel | undefined {
  return (
    draft.models.find((model) => model.id === modelId) ??
    draft.availableModels.find((model) => model.id === modelId)
  )
}

/**
 * 插入或更新模型，并同步当前选中的第一个已启用模型。
 */
export function upsertModel(draft: ProviderDraft, model: ProviderModel): ProviderDraft {
  const nextModels = mergeModels(draft.models, model)
  const nextAvailableModels = mergeModels(draft.availableModels, model)

  return {
    ...draft,
    model: nextModels.find((entry) => entry.enabled)?.id ?? draft.model,
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

/**
 * 切换模型启用状态，并把 available 与 active 两份模型列表保持一致。
 */
export function updateModelEnabled(draft: ProviderDraft, modelId: string): ProviderDraft {
  const sourceModel = findDraftModel(draft, modelId)

  if (sourceModel === undefined) {
    return draft
  }

  const nextModel = {
    ...sourceModel,
    enabled: !sourceModel.enabled
  }

  /**
   * 将同一个模型变更应用到一份模型列表。
   */
  function toggle(models: ProviderModel[]): ProviderModel[] {
    return mergeModels(models, nextModel)
  }

  const nextModels = toggle(draft.models)
  const nextAvailableModels = toggle(draft.availableModels)
  const nextSelectedModel =
    nextModels.find((model) => model.enabled)?.id ??
    nextAvailableModels.find((model) => model.enabled)?.id ??
    ''

  return {
    ...draft,
    model: nextSelectedModel,
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

/**
 * 移除模型并在剩余模型中重新选择第一个已启用模型。
 */
export function removeModel(draft: ProviderDraft, modelId: string): ProviderDraft {
  const nextModels = draft.models.filter((model) => model.id !== modelId)
  const nextAvailableModels = draft.availableModels.filter((model) => model.id !== modelId)

  return {
    ...draft,
    model: nextModels.find((model) => model.enabled)?.id ?? '',
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

/**
 * 更新模型高级选项，并同步 active 与 available 两份模型列表。
 */
export function updateModelOptions(draft: ProviderDraft, nextModel: ProviderModel): ProviderDraft {
  /**
   * 在目标模型上应用高级选项更新，其它模型保持原样。
   */
  function update(models: ProviderModel[]): ProviderModel[] {
    return models.map((model) => (model.id === nextModel.id ? nextModel : model))
  }

  return {
    ...draft,
    models: update(draft.models),
    availableModels: update(draft.availableModels)
  }
}
