/**
 * 负责应用设置、provider 配置和 LLM connection 的本地持久化读写。
 * 它只处理数据库结构与领域设置对象转换，不创建 SDK client 或访问外部网络。
 */

import { desc, eq } from 'drizzle-orm'

import type {
  CreateCustomProviderInput,
  SaveProviderInput
} from '@moon/shared/domain/settings-validation'
import {
  llmConnectionSchema,
  selectDefaultLlmConnection as selectDefaultNormalizedLlmConnection,
  type LlmConnection,
  type NormalizedLlmConnection
} from '@moon/shared/config'
import {
  appearanceThemes,
  createDefaultAppSettings,
  createDefaultProviderSettings,
  type AppearanceSettings,
  type AppearanceTheme,
  type AppSettings,
  type ProviderSettings
} from '@moon/shared/domain/settings'
import {
  isBuiltInProviderId,
  providerMetadata,
  providerModelManualOverrideFields,
  resolveProviderModelDiscovery,
  type ProviderId,
  type ProviderModelManualOverride,
  type ProviderModel
} from '@moon/shared/domain/provider'
import type { AppDatabaseConnection } from '../db/connection'
import { llmConnections, providerSettings, settings as settingsTable } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

const appearanceThemeKey = 'appearance.theme'
const appearanceThemeSet = new Set<AppearanceTheme>(appearanceThemes)

type ProviderSaveDraft = Partial<SaveProviderInput> & {
  apiKey?: string
  model?: string
  baseUrl?: string
}

type LlmConnectionRow = typeof llmConnections.$inferSelect

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
    ...(model.providerApi === undefined ? {} : { providerApi: model.providerApi }),
    ...(model.providerBaseUrl === undefined ? {} : { providerBaseUrl: model.providerBaseUrl }),
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

/**
 * 把 availableModels 中已启用的模型提升到 active models，保证首页模型选择器能读到。
 */
function mergeEnabledAvailableModels(
  models: ProviderModel[],
  availableModels: ProviderModel[]
): ProviderModel[] {
  return availableModels.reduce((nextModels, availableModel) => {
    if (!availableModel.enabled) {
      return nextModels
    }

    const existingIndex = nextModels.findIndex((model) => model.id === availableModel.id)

    if (existingIndex === -1) {
      return [...nextModels, { ...availableModel, enabled: true }]
    }

    return nextModels.map((model, index) =>
      index === existingIndex ? { ...availableModel, enabled: true } : model
    )
  }, models)
}

function removeUnfetchedDefaultModels(
  provider: ProviderId,
  models: ProviderModel[]
): ProviderModel[] {
  if (!isBuiltInProviderId(provider) || resolveProviderModelDiscovery(provider) === 'static') {
    return models
  }

  const defaultModelIds = new Set(providerMetadata[provider].defaultModels.map((model) => model.id))

  return models.filter((model) => model.isManual || !defaultModelIds.has(model.id))
}

/**
 * 为静态模型 provider 准备默认模型，缺省情况下只启用元数据指定的默认模型。
 */
function createStaticDefaultModels(provider: ProviderId): ProviderModel[] {
  if (!isBuiltInProviderId(provider) || resolveProviderModelDiscovery(provider) !== 'static') {
    return []
  }

  return normalizeModels(providerMetadata[provider].defaultModels)
}

/**
 * 在旧配置没有模型列表时回填静态模型目录。
 */
function restoreStaticModelsIfNeeded(
  provider: ProviderId,
  models: ProviderModel[]
): ProviderModel[] {
  if (models.length > 0) {
    return models
  }

  return createStaticDefaultModels(provider)
}

/**
 * 解析持久化的 API 协议，空值回落到 provider 元数据默认值。
 */
function resolvePersistedApiFormat(
  apiFormat: ProviderSettings['apiFormat'],
  defaults: ProviderSettings
): ProviderSettings['apiFormat'] {
  return apiFormat || defaults.apiFormat
}

/**
 * 把数据库行转换成共享 LLM connection 结构，空字符串字段恢复为可选字段。
 */
function toLlmConnection(row: LlmConnectionRow): NormalizedLlmConnection {
  return llmConnectionSchema.parse({
    id: row.id,
    name: row.name,
    ...(row.providerId === null ? {} : { providerId: row.providerId }),
    backend: row.backend,
    model: row.model,
    ...(row.apiKey.length === 0 ? {} : { apiKey: row.apiKey }),
    ...(row.baseUrl.length === 0 ? {} : { baseUrl: row.baseUrl }),
    ...(row.customEndpoint === null ? {} : { customEndpoint: row.customEndpoint }),
    enabled: row.enabled,
    isDefault: row.isDefault,
    thinkingLevel: row.thinkingLevel
  })
}

/**
 * 补齐 LLM connection 写库字段，避免可选字段在数据库里出现 undefined。
 */
function createLlmConnectionValues(connection: NormalizedLlmConnection, timestamp: string) {
  return {
    id: connection.id,
    name: connection.name,
    providerId: connection.providerId ?? null,
    backend: connection.backend,
    model: connection.model,
    apiKey: connection.apiKey?.trim() ?? '',
    baseUrl: connection.baseUrl ?? '',
    customEndpoint: connection.customEndpoint ?? null,
    enabled: connection.enabled,
    isDefault: connection.isDefault,
    thinkingLevel: connection.thinkingLevel,
    createdAt: timestamp,
    updatedAt: timestamp
  }
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

  /**
   * 列出所有持久化 LLM connection，默认连接和新近更新项排在前面。
   */
  async listLlmConnections(): Promise<NormalizedLlmConnection[]> {
    const rows = await this.database.db
      .select()
      .from(llmConnections)
      .orderBy(desc(llmConnections.isDefault), desc(llmConnections.updatedAt))

    return rows.map(toLlmConnection)
  }

  /**
   * 按 connection id 查找持久化连接，找不到时返回 null。
   */
  async findLlmConnectionById(id: string): Promise<NormalizedLlmConnection | null> {
    const row = await this.database.db
      .select()
      .from(llmConnections)
      .where(eq(llmConnections.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toLlmConnection(row)
  }

  /**
   * 选择默认可用 LLM connection；没有持久化连接时返回 null 以便调用方回退 provider。
   */
  async selectDefaultLlmConnection(): Promise<NormalizedLlmConnection | null> {
    return selectDefaultNormalizedLlmConnection(await this.listLlmConnections())
  }

  /**
   * 新增或更新 LLM connection；保存默认项时会取消其它连接的默认标记。
   */
  async saveLlmConnection(connection: LlmConnection): Promise<NormalizedLlmConnection> {
    const parsedConnection = llmConnectionSchema.parse(connection)
    const timestamp = new Date().toISOString()
    const connectionValues = createLlmConnectionValues(parsedConnection, timestamp)

    if (parsedConnection.isDefault) {
      await this.database.db.update(llmConnections).set({
        isDefault: false,
        updatedAt: timestamp
      })
    }

    await this.database.db
      .insert(llmConnections)
      .values(connectionValues)
      .onConflictDoUpdate({
        target: llmConnections.id,
        set: {
          name: connectionValues.name,
          providerId: connectionValues.providerId,
          backend: connectionValues.backend,
          model: connectionValues.model,
          apiKey: connectionValues.apiKey,
          baseUrl: connectionValues.baseUrl,
          customEndpoint: connectionValues.customEndpoint,
          enabled: connectionValues.enabled,
          isDefault: connectionValues.isDefault,
          thinkingLevel: connectionValues.thinkingLevel,
          updatedAt: connectionValues.updatedAt
        }
      })

    const savedConnection = await this.findLlmConnectionById(parsedConnection.id)

    if (savedConnection === null) {
      throw new Error(`LLM connection was not saved: ${parsedConnection.id}`)
    }

    return savedConnection
  }

  async getSettings(): Promise<AppSettings> {
    const settings = createDefaultAppSettings()
    const appearanceTheme = await this.getSettingValue(appearanceThemeKey)

    settings.llmConnections = await this.listLlmConnections()

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
      const models = ensureSelectedModel(
        restoreStaticModelsIfNeeded(row.provider, persistedModels),
        row.model
      )
      const availableModels =
        persistedAvailableModels.length > 0
          ? mergeAvailableModels(models, persistedAvailableModels)
          : mergeAvailableModels(models, [])
      const enabledModel = models.find((model) => model.enabled)
      const enabledAvailableModel = availableModels.find((model) => model.enabled)
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
        model: row.model || enabledModel?.id || enabledAvailableModel?.id || '',
        models,
        availableModels,
        baseUrl: row.baseUrl,
        apiFormat: resolvePersistedApiFormat(row.apiFormat, defaults),
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
    const defaultStaticModels = createStaticDefaultModels(provider)
    const rawModels = normalizeModels(
      ensureSelectedModel(
        draft.models === undefined ? defaultStaticModels : draft.models,
        selectedModel
      )
    )
    const rawAvailableModels = normalizeModels(
      draft.availableModels === undefined ? defaultStaticModels : draft.availableModels
    )
    const models = normalizeModels(mergeEnabledAvailableModels(rawModels, rawAvailableModels))
    const availableModels =
      draft.availableModels === undefined
        ? mergeAvailableModels(models, [])
        : mergeAvailableModels(models, rawAvailableModels)
    const model =
      selectedModel ||
      models.find((entry) => entry.enabled)?.id ||
      availableModels.find((entry) => entry.enabled)?.id ||
      ''
    const providerType = (draft.type ?? defaults.type) as ProviderSettings['type']
    const baseUrl = draft.baseUrl?.trim() ?? ''
    const apiFormat = resolvePersistedApiFormat(draft.apiFormat ?? defaults.apiFormat, defaults)
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
    const hasModelCatalogDraft =
      resolveProviderModelDiscovery(provider) === 'static' &&
      draft.availableModels !== undefined &&
      draft.availableModels.length > 0
    const modelsUpdatedAt = hasModelCatalogDraft ? updatedAt : null

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
        modelsUpdatedAt,
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
          ...(modelsUpdatedAt === null ? {} : { modelsUpdatedAt }),
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
