import { eq } from 'drizzle-orm'

import type {
  CreateCustomProviderInput,
  SaveProviderInput
} from '@shared/domain/settings-validation'
import {
  appearanceThemes,
  createDefaultAppSettings,
  createDefaultProviderSettings,
  type AppearanceSettings,
  type AppearanceTheme,
  type AppSettings,
  type ProviderSettings
} from '../../shared/domain/settings'
import {
  isBuiltInProviderId,
  providerMetadata,
  providerModelManualOverrideFields,
  type ProviderId,
  type ProviderModelManualOverride,
  type ProviderModel
} from '../../shared/domain/provider'
import type { AppDatabaseConnection } from '../db/connection'
import { providerSettings, settings as settingsTable } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

const appearanceThemeKey = 'appearance.theme'
const appearanceThemeSet = new Set<AppearanceTheme>(appearanceThemes)

type ProviderSaveDraft = Partial<SaveProviderInput> & {
  apiKey?: string
  model?: string
  baseUrl?: string
}

const providerModelManualOverrideFieldSet = new Set<string>(providerModelManualOverrideFields)

function normalizeManualOverrides(
  manualOverrides: ProviderModel['manualOverrides']
): ProviderModelManualOverride[] | undefined {
  if (manualOverrides === undefined) {
    return undefined
  }

  const normalizedOverrides = manualOverrides.filter(
    (field, index) =>
      providerModelManualOverrideFieldSet.has(field) && manualOverrides.indexOf(field) === index
  )

  return normalizedOverrides.length > 0 ? normalizedOverrides : undefined
}

function normalizeModel(model: ProviderModel): ProviderModel {
  const manualOverrides = normalizeManualOverrides(model.manualOverrides)

  return {
    id: model.id.trim(),
    name: model.name.trim() || model.id.trim(),
    enabled: model.enabled,
    isManual: model.isManual,
    ...(model.supportsVision === undefined ? {} : { supportsVision: model.supportsVision }),
    ...(model.supportsImageOutput === undefined
      ? {}
      : { supportsImageOutput: model.supportsImageOutput }),
    ...(model.supportsToolCalling === undefined
      ? {}
      : { supportsToolCalling: model.supportsToolCalling }),
    ...(model.supportsReasoning === undefined
      ? {}
      : { supportsReasoning: model.supportsReasoning }),
    ...(model.supportsEmbedding === undefined
      ? {}
      : { supportsEmbedding: model.supportsEmbedding }),
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens }),
    ...(model.providerOptions === undefined ? {} : { providerOptions: model.providerOptions }),
    ...(manualOverrides === undefined ? {} : { manualOverrides })
  }
}

function normalizeModels(models: ProviderModel[]): ProviderModel[] {
  const seen = new Set<string>()
  const normalizedModels: ProviderModel[] = []

  for (const model of models) {
    const normalizedModel = normalizeModel(model)

    if (normalizedModel.id.length === 0 || seen.has(normalizedModel.id)) {
      continue
    }

    seen.add(normalizedModel.id)
    normalizedModels.push(normalizedModel)
  }

  return normalizedModels
}

function mergeAvailableModels(
  models: ProviderModel[],
  availableModels: ProviderModel[]
): ProviderModel[] {
  const enabledById = new Map(models.map((model) => [model.id, model.enabled]))
  const merged = normalizeModels([...models, ...availableModels]).map((model) => ({
    ...model,
    enabled: enabledById.get(model.id) ?? model.enabled
  }))

  return merged
}

function ensureSelectedModel(models: ProviderModel[], modelId: string): ProviderModel[] {
  if (modelId.length === 0) {
    return models
  }

  const hasModel = models.some((model) => model.id === modelId)

  if (hasModel) {
    return models.map((model) => (model.id === modelId ? { ...model, enabled: true } : model))
  }

  return [
    ...models,
    {
      id: modelId,
      name: modelId,
      enabled: true,
      isManual: true
    }
  ]
}

function removeUnfetchedDefaultModels(
  provider: ProviderId,
  models: ProviderModel[]
): ProviderModel[] {
  if (!isBuiltInProviderId(provider)) {
    return models
  }

  const defaultModelIds = new Set(providerMetadata[provider].defaultModels.map((model) => model.id))

  return models.filter((model) => model.isManual || !defaultModelIds.has(model.id))
}

function createProviderSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'provider'
}

function getProviderKind(input: {
  provider: ProviderId
  isCustom: boolean
  isACP: boolean
  isOAuth: boolean
}): ProviderSettings['kind'] {
  if (isBuiltInProviderId(input.provider)) {
    return providerMetadata[input.provider].kind
  }

  if (input.isACP) {
    return 'acp'
  }

  if (input.isOAuth) {
    return 'oauth'
  }

  if (input.isCustom) {
    return 'custom'
  }

  return 'official'
}

export class SettingsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async getSettings(): Promise<AppSettings> {
    const settings = createDefaultAppSettings()
    const appearanceTheme = await this.getSettingValue(appearanceThemeKey)

    if (appearanceTheme !== null && appearanceThemeSet.has(appearanceTheme as AppearanceTheme)) {
      settings.appearance.theme = appearanceTheme as AppearanceTheme
    }

    const rows = await this.database.db.select().from(providerSettings)

    for (const row of rows) {
      const apiKey = row.apiKey
      const defaults = createDefaultProviderSettings(row.provider)
      const hasFetchedModels = row.modelsUpdatedAt !== null
      const rowModels = normalizeModels(row.models)
      const rowAvailableModels = normalizeModels(row.availableModels)
      const persistedModels = hasFetchedModels
        ? rowModels
        : removeUnfetchedDefaultModels(row.provider, rowModels)
      const persistedAvailableModels = hasFetchedModels
        ? rowAvailableModels
        : removeUnfetchedDefaultModels(row.provider, rowAvailableModels)
      const models = persistedModels
      const availableModels =
        persistedAvailableModels.length > 0
          ? mergeAvailableModels(models, persistedAvailableModels)
          : mergeAvailableModels(models, [])
      const enabledModel = models.find((model) => model.enabled)
      const isBuiltIn = isBuiltInProviderId(row.provider)
      const isACP = row.isAcp || defaults.isACP
      const isOAuth = row.isOauth || defaults.isOAuth
      const isCustom = row.isCustom || defaults.isCustom || !isBuiltIn

      settings.providers[row.provider] = {
        ...defaults,
        provider: row.provider,
        name: row.name || defaults.name,
        type: row.providerType || defaults.type,
        kind: getProviderKind({
          provider: row.provider,
          isCustom,
          isACP,
          isOAuth
        }),
        hasApiKey: apiKey.trim().length > 0,
        apiKey,
        model: row.model || enabledModel?.id || '',
        models,
        availableModels,
        baseUrl: row.baseUrl,
        apiFormat: row.apiFormat || defaults.apiFormat,
        useMaxCompletionTokens: row.useMaxCompletionTokens,
        customHeaders: row.customHeaders,
        enabled: row.enabled,
        isBuiltIn,
        isCustom,
        isACP,
        isOAuth,
        acpCommand: row.acpCommand || defaults.acpCommand,
        acpArgs: row.acpArgs.length > 0 ? row.acpArgs : defaults.acpArgs,
        acpAuthMethodId: row.acpAuthMethodId,
        updatedAt: toIsoTimestamp(row.updatedAt),
        modelsUpdatedAt: row.modelsUpdatedAt === null ? '' : toIsoTimestamp(row.modelsUpdatedAt)
      }
    }

    return settings
  }

  async saveAppearance(draft: AppearanceSettings): Promise<AppSettings> {
    await this.saveSettingValue(appearanceThemeKey, draft.theme)

    return this.getSettings()
  }

  async createCustomProvider(input: CreateCustomProviderInput): Promise<AppSettings> {
    const id = await this.createUniqueProviderId('custom', input.name)

    await this.saveProvider(id, {
      provider: id,
      name: input.name,
      type: 'custom',
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      apiFormat: input.apiFormat,
      useMaxCompletionTokens: input.useMaxCompletionTokens,
      customHeaders: input.customHeaders,
      enabled: false,
      requiresBaseUrl: true,
      noApiKey: false,
      isCustom: true,
      isACP: false,
      isOAuth: false,
      acpCommand: '',
      acpArgs: [],
      acpAuthMethodId: '',
      model: '',
      models: [],
      availableModels: []
    })

    return this.getSettings()
  }

  async createCustomAcpProvider(input: {
    name: string
    acpCommand: string
    acpArgs?: string | string[]
  }): Promise<AppSettings> {
    const parsedInput = {
      ...input,
      acpArgs:
        typeof input.acpArgs === 'string'
          ? input.acpArgs.split(/\s+/).filter(Boolean)
          : (input.acpArgs ?? [])
    }
    const id = await this.createUniqueProviderId('acp', parsedInput.name)

    await this.saveProvider(id, {
      provider: id,
      name: parsedInput.name,
      type: 'acp',
      apiKey: '',
      baseUrl: '',
      apiFormat: 'openai-chat',
      useMaxCompletionTokens: false,
      customHeaders: '',
      enabled: false,
      requiresBaseUrl: false,
      noApiKey: true,
      isCustom: true,
      isACP: true,
      isOAuth: false,
      acpCommand: parsedInput.acpCommand,
      acpArgs: parsedInput.acpArgs,
      acpAuthMethodId: '',
      model: '',
      models: [],
      availableModels: []
    })

    return this.getSettings()
  }

  async saveProvider(provider: ProviderId, draft: ProviderSaveDraft): Promise<AppSettings> {
    const updatedAt = new Date().toISOString()
    const defaults = createDefaultProviderSettings(provider)
    const selectedModel = draft.model?.trim() ?? ''
    const apiKey = draft.apiKey?.trim() ?? ''
    const storedApiKey =
      apiKey.length > 0 ? apiKey : ((await this.getStoredProviderKey(provider)) ?? '')
    const models = normalizeModels(
      draft.models === undefined ? ensureSelectedModel([], selectedModel) : draft.models
    )
    const availableModels =
      draft.availableModels === undefined
        ? mergeAvailableModels(models, [])
        : mergeAvailableModels(models, normalizeModels(draft.availableModels))
    const model = selectedModel || models.find((entry) => entry.enabled)?.id || ''
    const providerType = (draft.type ?? defaults.type) as ProviderSettings['type']
    const baseUrl = draft.baseUrl?.trim() ?? ''
    const apiFormat = draft.apiFormat ?? defaults.apiFormat
    const useMaxCompletionTokens = draft.useMaxCompletionTokens ?? defaults.useMaxCompletionTokens
    const customHeaders = draft.customHeaders ?? ''
    const enabled = draft.enabled ?? defaults.enabled
    const isCustom = draft.isCustom ?? defaults.isCustom ?? !defaults.isBuiltIn
    const isACP = draft.isACP ?? defaults.isACP
    const isOAuth = draft.isOAuth ?? defaults.isOAuth
    const acpCommand = draft.acpCommand ?? defaults.acpCommand
    const acpArgs =
      draft.acpArgs !== undefined && draft.acpArgs.length > 0 ? draft.acpArgs : defaults.acpArgs
    const acpAuthMethodId = draft.acpAuthMethodId ?? ''

    await this.database.db
      .insert(providerSettings)
      .values({
        provider,
        name: draft.name ?? defaults.name,
        providerType,
        model,
        models,
        availableModels,
        baseUrl,
        apiKey: storedApiKey,
        apiFormat,
        useMaxCompletionTokens,
        customHeaders,
        enabled,
        isCustom,
        isAcp: isACP,
        isOauth: isOAuth,
        acpCommand,
        acpArgs,
        acpAuthMethodId,
        modelsUpdatedAt: null,
        updatedAt
      })
      .onConflictDoUpdate({
        target: providerSettings.provider,
        set: {
          name: draft.name ?? defaults.name,
          providerType,
          model,
          models,
          availableModels,
          baseUrl,
          apiKey: storedApiKey,
          apiFormat,
          useMaxCompletionTokens,
          customHeaders,
          enabled,
          isCustom,
          isAcp: isACP,
          isOauth: isOAuth,
          acpCommand,
          acpArgs,
          acpAuthMethodId,
          updatedAt
        }
      })

    return this.getSettings()
  }

  async updateProviderModels(
    provider: ProviderId,
    models: ProviderModel[],
    availableModels: ProviderModel[]
  ): Promise<AppSettings> {
    const updatedAt = new Date().toISOString()

    await this.database.db
      .update(providerSettings)
      .set({
        model: models.find((entry) => entry.enabled)?.id ?? '',
        models: normalizeModels(models),
        availableModels: normalizeModels(availableModels),
        modelsUpdatedAt: updatedAt,
        updatedAt
      })
      .where(eq(providerSettings.provider, provider))

    return this.getSettings()
  }

  async deleteProvider(provider: ProviderId): Promise<AppSettings> {
    await this.database.db.delete(providerSettings).where(eq(providerSettings.provider, provider))

    return this.getSettings()
  }

  async getStoredProviderKey(provider: ProviderId): Promise<string | null> {
    const row = await this.database.db
      .select({ apiKey: providerSettings.apiKey })
      .from(providerSettings)
      .where(eq(providerSettings.provider, provider))
      .then((rows) => rows[0])

    return row?.apiKey ?? null
  }

  async getProviderApiKey(provider: ProviderId): Promise<string> {
    const apiKey = await this.getStoredProviderKey(provider)

    return apiKey ?? ''
  }

  private async createUniqueProviderId(prefix: 'custom' | 'acp', name: string): Promise<string> {
    const settings = await this.getSettings()
    const slug = createProviderSlug(name)
    let candidate = `${prefix}:${slug}`
    let suffix = 2

    while (settings.providers[candidate] !== undefined) {
      candidate = `${prefix}:${slug}-${suffix}`
      suffix += 1
    }

    return candidate
  }

  private async getSettingValue(key: string): Promise<string | null> {
    const row = await this.database.db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .then((rows) => rows[0])

    return row?.value ?? null
  }

  private async saveSettingValue(key: string, value: string): Promise<void> {
    const updatedAt = new Date().toISOString()

    await this.database.db
      .insert(settingsTable)
      .values({
        key,
        value,
        updatedAt
      })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: {
          value,
          updatedAt
        }
      })
  }
}
