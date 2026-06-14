import type { ProviderModel } from '@moon/shared/domain/provider'
import type { ProviderSettings } from '@moon/shared/domain/settings'

import type { ProviderDraft } from './types'

export function createDraftFromProvider(provider: ProviderSettings): ProviderDraft {
  return {
    provider: provider.provider,
    name: provider.name,
    type: provider.type,
    apiKey: provider.apiKey,
    model: provider.model,
    models: provider.models,
    availableModels: provider.availableModels,
    baseUrl: provider.baseUrl,
    apiFormat: provider.apiFormat,
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

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

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

export function getProviderStatus(provider: ProviderSettings): 'active' | 'inactive' | 'missing' {
  if (provider.enabled) {
    return 'active'
  }

  if (provider.hasApiKey || provider.noApiKey || provider.isACP || provider.isOAuth) {
    return 'inactive'
  }

  return 'missing'
}

function mergeModels(models: ProviderModel[], nextModel: ProviderModel): ProviderModel[] {
  const existingIndex = models.findIndex((model) => model.id === nextModel.id)

  if (existingIndex === -1) {
    return [...models, nextModel]
  }

  return models.map((model, index) => (index === existingIndex ? nextModel : model))
}

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

export function updateModelEnabled(draft: ProviderDraft, modelId: string): ProviderDraft {
  function toggle(models: ProviderModel[]): ProviderModel[] {
    return models.map((model) =>
      model.id === modelId
        ? {
            ...model,
            enabled: !model.enabled
          }
        : model
    )
  }

  const nextModels = toggle(draft.models)
  const nextAvailableModels = toggle(draft.availableModels)

  return {
    ...draft,
    model: nextModels.find((model) => model.enabled)?.id ?? '',
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

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

export function updateModelOptions(draft: ProviderDraft, nextModel: ProviderModel): ProviderDraft {
  function update(models: ProviderModel[]): ProviderModel[] {
    return models.map((model) => (model.id === nextModel.id ? nextModel : model))
  }

  return {
    ...draft,
    models: update(draft.models),
    availableModels: update(draft.availableModels)
  }
}
