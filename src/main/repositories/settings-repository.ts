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
  type ProviderId,
  type ProviderModel
} from '../../shared/domain/provider'
import type { AppDatabaseConnection } from '../db/connection'
import { providerSettings, settings as settingsTable } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'
import type { SecretCodec } from '../security/secret-codec'

const appearanceThemeKey = 'appearance.theme'
const appearanceThemeSet = new Set<AppearanceTheme>(appearanceThemes)

type ProviderSaveDraft = Partial<SaveProviderInput> & {
  apiKey?: string
  model?: string
  baseUrl?: string
}

function createApiKeyPreview(apiKey: string): string {
  const trimmedApiKey = apiKey.trim()

  if (trimmedApiKey.length === 0) {
    return ''
  }

  if (trimmedApiKey.length <= 4) {
    return '****'
  }

  return `****${trimmedApiKey.slice(-4)}`
}

function normalizeModel(model: ProviderModel): ProviderModel {
  return {
    id: model.id.trim(),
    name: model.name.trim() || model.id.trim(),
    enabled: model.enabled,
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow })
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
      enabled: true
    }
  ]
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
  constructor(
    private readonly database: AppDatabaseConnection,
    private readonly secretCodec: SecretCodec
  ) {}

  async getSettings(): Promise<AppSettings> {
    const settings = createDefaultAppSettings()
    const appearanceTheme = await this.getSettingValue(appearanceThemeKey)

    if (appearanceTheme !== null && appearanceThemeSet.has(appearanceTheme as AppearanceTheme)) {
      settings.appearance.theme = appearanceTheme as AppearanceTheme
    }

    const rows = await this.database.db.select().from(providerSettings)

    for (const row of rows) {
      const apiKey = this.secretCodec.decrypt(row.encryptedApiKey)
      const defaults = createDefaultProviderSettings(row.provider)
      const rowModels = normalizeModels(row.models)
      const rowAvailableModels = normalizeModels(row.availableModels)
      const models = rowModels.length > 0 ? rowModels : defaults.models
      const availableModels =
        rowAvailableModels.length > 0
          ? mergeAvailableModels(models, rowAvailableModels)
          : mergeAvailableModels(models, defaults.availableModels)
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
        apiKeyPreview: createApiKeyPreview(apiKey),
        model: row.model || enabledModel?.id || defaults.model,
        models,
        availableModels,
        baseUrl: row.baseUrl,
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
    const encryptedApiKey =
      apiKey.length > 0
        ? this.secretCodec.encrypt(apiKey)
        : ((await this.getEncryptedProviderKey(provider)) ?? '')
    const models = normalizeModels(
      draft.models === undefined
        ? ensureSelectedModel(defaults.models, selectedModel)
        : draft.models
    )
    const availableModels =
      draft.availableModels === undefined
        ? mergeAvailableModels(models, defaults.availableModels)
        : mergeAvailableModels(models, normalizeModels(draft.availableModels))
    const model = selectedModel || models.find((entry) => entry.enabled)?.id || defaults.model
    const providerType = (draft.type ?? defaults.type) as ProviderSettings['type']
    const baseUrl = draft.baseUrl?.trim() ?? ''
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
        encryptedApiKey,
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
          encryptedApiKey,
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

  async getEncryptedProviderKey(provider: ProviderId): Promise<string | null> {
    const row = await this.database.db
      .select({ encryptedApiKey: providerSettings.encryptedApiKey })
      .from(providerSettings)
      .where(eq(providerSettings.provider, provider))
      .then((rows) => rows[0])

    return row?.encryptedApiKey ?? null
  }

  async getProviderApiKey(provider: ProviderId): Promise<string> {
    const encryptedApiKey = await this.getEncryptedProviderKey(provider)

    return encryptedApiKey === null ? '' : this.secretCodec.decrypt(encryptedApiKey)
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
