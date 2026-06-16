/**
 * 负责设置页 provider 配置的校验、模型刷新和连接测试编排。
 * 它只处理 main 进程服务逻辑，不直接管理 React 状态或 Electron IPC 注册。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@moon/shared/domain/settings-validation'
import {
  createCustomAcpProviderInputSchema,
  createCustomProviderInputSchema,
  deleteProviderInputSchema,
  providerConnectionInputSchema,
  saveAppearanceInputSchema,
  saveProviderInputSchema
} from '@moon/shared/domain/settings-validation'
import {
  createDefaultProviderSettings,
  type AppSettings,
  type ProviderTestResult
} from '@moon/shared/domain/settings'
import { assertProviderReadyForAgent, createProviderLlmConnection } from '@moon/shared/agent'
import { isSupportedChatProvider, selectChatModelId } from '@moon/shared/domain/chat-provider'
import {
  isBuiltInProviderId,
  providerMetadata,
  providerModelManualOverrideFields,
  resolveProviderEffectiveBaseUrl,
  resolveProviderModelDiscovery,
  resolveProviderPiModelsProviderId,
  type ProviderId,
  type ProviderModel,
  type ProviderModelManualOverride
} from '@moon/shared/domain/provider'
import { getPiProviderModels } from '@moon/shared/config/models-pi'
import type { SettingsRepository } from '../repositories/settings-repository'

const execFileAsync = promisify(execFile)
const anthropicVersion = '2023-06-01'
const modelsDevApiUrl = 'https://models.dev/api.json'
const modelsDevFetchTimeoutMs = 5_000
const providerModelManualOverrideFieldSet = new Set<string>(providerModelManualOverrideFields)

type ProviderConnectionConfig = SaveProviderInput & {
  apiKey: string
  resolvedBaseUrl: string
  selectedModel: string
}

type ModelListPayload = {
  data?: unknown
  models?: unknown
}

type ModelsDevProviderModel = Partial<
  Pick<
    ProviderModel,
    | 'name'
    | 'supportsVision'
    | 'supportsImageOutput'
    | 'supportsToolCalling'
    | 'supportsReasoning'
    | 'contextWindow'
    | 'maxOutputTokens'
  >
>

function joinEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/${path.replace(/^\/+/g, '')}`
}

function joinVersionedEndpoint(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/g, '')

  if (/\/v\d+(beta)?$/u.test(normalizedBaseUrl)) {
    return joinEndpoint(normalizedBaseUrl, path.replace(/^v\d+(beta)?\/?/u, ''))
  }

  return joinEndpoint(normalizedBaseUrl, path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function parseCustomHeaders(value: string): Record<string, string> {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return {}
  }

  const parsed = JSON.parse(trimmedValue) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(parsed).map(([key, headerValue]) => [key, String(headerValue)])
  )
}

function createHeaders(config: ProviderConnectionConfig): Record<string, string> {
  const headers = {
    ...parseCustomHeaders(config.customHeaders)
  }

  if (config.apiFormat === 'anthropic' || config.type === 'anthropic') {
    headers['x-api-key'] = config.apiKey
    headers['anthropic-version'] = anthropicVersion
    headers['content-type'] = 'application/json'
    return headers
  }

  if (config.type !== 'google' && config.apiKey.length > 0) {
    headers['authorization'] = `Bearer ${config.apiKey}`
  }

  headers['content-type'] = 'application/json'

  return headers
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Request failed.'
}

async function readErrorResponse(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')

  if (body.trim().length === 0) {
    return `HTTP ${response.status}`
  }

  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof parsed.error === 'string') {
      return parsed.error
    }
    if (typeof parsed.error?.message === 'string') {
      return parsed.error.message
    }
    if (typeof parsed.message === 'string') {
      return parsed.message
    }
  } catch {
    // Fall through to the raw body.
  }

  return body.slice(0, 300)
}

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

function normalizeModelsDevModel(rawModel: unknown): ModelsDevProviderModel | null {
  if (!isRecord(rawModel)) {
    return null
  }

  const nextModel: ModelsDevProviderModel = {}

  if (typeof rawModel['name'] === 'string' && rawModel['name'].trim().length > 0) {
    nextModel.name = rawModel['name'].trim()
  }

  const modalities = rawModel['modalities']

  if (isRecord(modalities)) {
    if (Array.isArray(modalities['input'])) {
      nextModel.supportsVision = modalities['input'].includes('image')
    }

    if (Array.isArray(modalities['output'])) {
      nextModel.supportsImageOutput = modalities['output'].includes('image')
    }
  }

  if (typeof rawModel['tool_call'] === 'boolean') {
    nextModel.supportsToolCalling = rawModel['tool_call']
  }

  if (typeof rawModel['reasoning'] === 'boolean') {
    nextModel.supportsReasoning = rawModel['reasoning']
  }

  const limit = rawModel['limit']

  if (isRecord(limit)) {
    if (isPositiveInteger(limit['context'])) {
      nextModel.contextWindow = limit['context']
    }

    if (isPositiveInteger(limit['output'])) {
      nextModel.maxOutputTokens = limit['output']
    }
  }

  return Object.keys(nextModel).length > 0 ? nextModel : null
}

function normalizeModelsDevPayload(
  provider: string,
  payload: unknown
): Map<string, ModelsDevProviderModel> | null {
  if (!isRecord(payload) || !isRecord(payload[provider])) {
    return null
  }

  const rawModels = payload[provider]['models']

  if (!isRecord(rawModels)) {
    return null
  }

  const models = new Map<string, ModelsDevProviderModel>()

  for (const [modelId, rawModel] of Object.entries(rawModels)) {
    const normalizedModel = normalizeModelsDevModel(rawModel)

    if (normalizedModel !== null) {
      models.set(modelId, normalizedModel)
    }
  }

  return models
}

function enrichModelFromModelsDev(
  model: ProviderModel,
  modelsDevModel: ModelsDevProviderModel | undefined
): ProviderModel {
  if (modelsDevModel === undefined) {
    return model
  }

  return {
    ...model,
    ...modelsDevModel,
    id: model.id,
    enabled: model.enabled,
    isManual: model.isManual,
    ...(model.providerOptions === undefined ? {} : { providerOptions: model.providerOptions }),
    ...(model.manualOverrides === undefined ? {} : { manualOverrides: model.manualOverrides })
  }
}

function applyManualOverride(
  model: ProviderModel,
  existingModel: ProviderModel,
  field: ProviderModelManualOverride
): void {
  if (field === 'name') {
    model.name = existingModel.name
  } else if (field === 'supportsVision') {
    if (existingModel.supportsVision === undefined) {
      delete model.supportsVision
    } else {
      model.supportsVision = existingModel.supportsVision
    }
  } else if (field === 'supportsImageOutput') {
    if (existingModel.supportsImageOutput === undefined) {
      delete model.supportsImageOutput
    } else {
      model.supportsImageOutput = existingModel.supportsImageOutput
    }
  } else if (field === 'supportsToolCalling') {
    if (existingModel.supportsToolCalling === undefined) {
      delete model.supportsToolCalling
    } else {
      model.supportsToolCalling = existingModel.supportsToolCalling
    }
  } else if (field === 'supportsReasoning') {
    if (existingModel.supportsReasoning === undefined) {
      delete model.supportsReasoning
    } else {
      model.supportsReasoning = existingModel.supportsReasoning
    }
  } else if (field === 'supportsEmbedding') {
    if (existingModel.supportsEmbedding === undefined) {
      delete model.supportsEmbedding
    } else {
      model.supportsEmbedding = existingModel.supportsEmbedding
    }
  } else if (field === 'contextWindow') {
    if (existingModel.contextWindow === undefined) {
      delete model.contextWindow
    } else {
      model.contextWindow = existingModel.contextWindow
    }
  } else if (field === 'maxOutputTokens') {
    if (existingModel.maxOutputTokens === undefined) {
      delete model.maxOutputTokens
    } else {
      model.maxOutputTokens = existingModel.maxOutputTokens
    }
  } else if (existingModel.providerOptions === undefined) {
    delete model.providerOptions
  } else {
    model.providerOptions = existingModel.providerOptions
  }
}

function applyExistingModelState(
  model: ProviderModel,
  existingModel: ProviderModel | undefined
): ProviderModel {
  if (existingModel === undefined) {
    return model
  }

  const nextModel: ProviderModel = {
    ...model,
    enabled: existingModel.enabled
  }
  const manualOverrides = normalizeManualOverrides(existingModel.manualOverrides)

  if (existingModel.providerOptions !== undefined) {
    nextModel.providerOptions = existingModel.providerOptions
  }

  if (manualOverrides !== undefined) {
    nextModel.manualOverrides = manualOverrides

    for (const field of manualOverrides) {
      applyManualOverride(nextModel, existingModel, field)
    }
  }

  return nextModel
}

function createExistingModelsById(existingModels: ProviderModel[]): Map<string, ProviderModel> {
  const existingModelsById = new Map<string, ProviderModel>()

  for (const model of existingModels) {
    existingModelsById.set(model.id, model)
  }

  return existingModelsById
}

function normalizeFetchedModel(rawModel: unknown): ProviderModel | null {
  if (rawModel === null || typeof rawModel !== 'object') {
    return null
  }

  const record = rawModel as Record<string, unknown>
  const rawId = record['id'] ?? record['name']

  if (typeof rawId !== 'string' || rawId.trim().length === 0) {
    return null
  }

  const id = rawId.replace(/^models\//, '').trim()
  const displayName =
    typeof record['displayName'] === 'string'
      ? record['displayName']
      : typeof record['name'] === 'string' && record['name'] !== rawId
        ? record['name']
        : id
  const contextWindow =
    typeof record['context_window'] === 'number'
      ? record['context_window']
      : typeof record['context_length'] === 'number'
        ? record['context_length']
        : typeof record['contextWindow'] === 'number'
          ? record['contextWindow']
          : typeof record['inputTokenLimit'] === 'number'
            ? record['inputTokenLimit']
            : undefined

  return {
    id,
    name: displayName,
    enabled: false,
    isManual: false,
    ...(contextWindow === undefined ? {} : { contextWindow })
  }
}

function normalizeFetchedModels(payload: ModelListPayload): ProviderModel[] {
  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []
  const seen = new Set<string>()
  const models: ProviderModel[] = []

  for (const rawModel of rawModels) {
    const model = normalizeFetchedModel(rawModel)

    if (model === null || seen.has(model.id)) {
      continue
    }

    seen.add(model.id)
    models.push(model)
  }

  return models
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)

  if (!response.ok) {
    throw new Error(await readErrorResponse(response))
  }

  return response.json()
}

async function fetchModelsDevModels(
  provider: string
): Promise<Map<string, ModelsDevProviderModel> | null> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), modelsDevFetchTimeoutMs)

  try {
    const payload = await fetchJson(modelsDevApiUrl, {
      method: 'GET',
      signal: abortController.signal
    })

    return normalizeModelsDevPayload(provider, payload)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function enrichModelsFromModelsDev(
  provider: string,
  models: ProviderModel[]
): Promise<ProviderModel[]> {
  const modelsDevModels = await fetchModelsDevModels(resolveModelsDevProviderId(provider))

  if (modelsDevModels === null) {
    return models
  }

  return models.map((model) => enrichModelFromModelsDev(model, modelsDevModels.get(model.id)))
}

function resolveModelsDevProviderId(provider: ProviderId): string {
  if (!isBuiltInProviderId(provider)) {
    return provider
  }

  return providerMetadata[provider].modelsDevProviderId ?? provider
}

function mergeModelsWithExistingState(
  models: ProviderModel[],
  existingModels: ProviderModel[]
): ProviderModel[] {
  const existingModelsById = createExistingModelsById(existingModels)

  return models.map((model) => applyExistingModelState(model, existingModelsById.get(model.id)))
}

/**
 * 合并内置模型目录和用户已有模型，保留用户手动添加的额外模型。
 */
function mergeCatalogModelsWithExistingState(
  models: ProviderModel[],
  existingModels: ProviderModel[]
): ProviderModel[] {
  const mergedModels = mergeModelsWithExistingState(models, existingModels)
  const mergedModelIds = new Set(mergedModels.map((model) => model.id))
  const manualModels = existingModels.filter(
    (model) => model.isManual && !mergedModelIds.has(model.id)
  )

  return [...mergedModels, ...manualModels]
}

/**
 * 模型目录首次刷新时自动启用第一个模型，避免 provider 已启用但首页无模型。
 */
function enableDefaultModelIfNeeded(
  models: ProviderModel[],
  hasSelectedModel: boolean
): ProviderModel[] {
  if (hasSelectedModel || models.some((model) => model.enabled) || models.length === 0) {
    return models
  }

  return models.map((model, index) => (index === 0 ? { ...model, enabled: true } : model))
}

/**
 * 校验 HTTP provider 发请求前所需的 endpoint 和凭据。
 */
function ensureReadyForHttp(config: ProviderConnectionConfig): void {
  const baseUrl = config.resolvedBaseUrl.trim()

  if (baseUrl.length === 0) {
    throw new Error('Base URL is required.')
  }

  if (!config.noApiKey && config.apiKey.trim().length === 0) {
    throw new Error('API key is required.')
  }
}

/**
 * 解析不需要远端模型列表接口的 provider 模型目录，并套用已有启用状态。
 */
async function resolveStaticProviderModels(
  config: ProviderConnectionConfig
): Promise<ProviderModel[]> {
  const defaultModels = isBuiltInProviderId(config.provider)
    ? providerMetadata[config.provider].defaultModels
    : []
  const enrichedModels = await enrichModelsFromModelsDev(config.provider, defaultModels)
  const existingModels = [...config.availableModels, ...config.models]
  const mergedModels = mergeCatalogModelsWithExistingState(enrichedModels, existingModels)

  return enableDefaultModelIfNeeded(mergedModels, pickModel(config).length > 0)
}

/**
 * 通过 Pi SDK 模型目录解析内置 provider 模型，失败时返回空数组以便继续旧路径。
 */
async function resolvePiProviderModels(config: ProviderConnectionConfig): Promise<ProviderModel[]> {
  const piProvider = resolveProviderPiModelsProviderId(config.provider)

  if (piProvider.length === 0) {
    return []
  }

  const piModels = await getPiProviderModels(piProvider)

  if (piModels.length === 0) {
    return []
  }

  const enrichedModels = await enrichModelsFromModelsDev(config.provider, piModels)
  const existingModels = [...config.availableModels, ...config.models]
  const mergedModels = mergeCatalogModelsWithExistingState(enrichedModels, existingModels)

  return enableDefaultModelIfNeeded(mergedModels, pickModel(config).length > 0)
}

function pickModel(config: ProviderConnectionConfig): string {
  return (
    config.selectedModel ||
    config.model ||
    config.models.find((model) => model.enabled)?.id ||
    config.availableModels.find((model) => model.enabled)?.id ||
    ''
  )
}

export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  /**
   * 读取完整应用设置，供 IPC handler 返回给 renderer。
   */
  async getSettings(): Promise<AppSettings> {
    return this.settingsRepository.getSettings()
  }

  async createCustomProvider(input: CreateCustomProviderInput): Promise<AppSettings> {
    const parsedInput = createCustomProviderInputSchema.parse(input)

    return this.settingsRepository.createCustomProvider(parsedInput)
  }

  async createCustomAcpProvider(input: CreateCustomAcpProviderInput): Promise<AppSettings> {
    const parsedInput = createCustomAcpProviderInputSchema.parse(input)

    return this.settingsRepository.createCustomAcpProvider(parsedInput)
  }

  async saveProvider(input: SaveProviderInput): Promise<AppSettings> {
    const parsedInput = saveProviderInputSchema.parse(this.withProviderDefaults(input))
    const settings = await this.settingsRepository.saveProvider(parsedInput.provider, parsedInput)

    return this.syncProviderLlmConnection(settings, parsedInput.provider)
  }

  async deleteProvider(input: DeleteProviderInput): Promise<AppSettings> {
    const parsedInput = deleteProviderInputSchema.parse(input)
    await this.settingsRepository.deleteProvider(parsedInput.provider)

    await this.disableProviderLlmConnection(parsedInput.provider)

    return this.settingsRepository.getSettings()
  }

  /**
   * 刷新 provider 的模型列表；内置 provider 优先使用 Pi 模型目录，再回退旧发现路径。
   */
  async fetchProviderModels(input: ProviderConnectionInput): Promise<AppSettings> {
    const config = await this.resolveConnectionConfig(input)

    if (config.isACP || config.isOAuth) {
      return this.updateProviderModelsAndSync(config.provider, config.models, [])
    }

    const modelDiscovery = resolveProviderModelDiscovery(config.provider)

    if (modelDiscovery === 'none') {
      return this.updateProviderModelsAndSync(
        config.provider,
        config.models,
        config.availableModels
      )
    }

    const piModels = await resolvePiProviderModels(config)

    if (piModels.length > 0) {
      await this.settingsRepository.saveProvider(config.provider, config)

      return this.updateProviderModelsAndSync(config.provider, piModels, piModels)
    }

    if (modelDiscovery === 'static') {
      const staticModels = await resolveStaticProviderModels(config)

      await this.settingsRepository.saveProvider(config.provider, config)

      return this.updateProviderModelsAndSync(config.provider, staticModels, staticModels)
    }

    ensureReadyForHttp(config)

    const payload =
      config.type === 'google'
        ? await fetchJson(
            `${joinEndpoint(config.resolvedBaseUrl, 'models')}?key=${encodeURIComponent(
              config.apiKey
            )}`,
            {
              headers: createHeaders(config),
              method: 'GET'
            }
          )
        : config.apiFormat === 'anthropic' || config.type === 'anthropic'
          ? await fetchJson(joinVersionedEndpoint(config.resolvedBaseUrl, 'v1/models'), {
              headers: createHeaders(config),
              method: 'GET'
            })
          : await fetchJson(joinEndpoint(config.resolvedBaseUrl, 'models'), {
              headers: createHeaders(config),
              method: 'GET'
            })
    const fetchedModels = normalizeFetchedModels(payload as ModelListPayload)
    const enrichedModels = await enrichModelsFromModelsDev(config.provider, fetchedModels)
    const existingModels = [...config.availableModels, ...config.models]
    const mergedModels = mergeModelsWithExistingState(enrichedModels, existingModels)

    await this.settingsRepository.saveProvider(config.provider, config)

    return this.updateProviderModelsAndSync(config.provider, mergedModels, mergedModels)
  }

  /**
   * 使用 provider 当前协议 endpoint 发起最小请求，验证配置能否工作。
   */
  async testProvider(input: ProviderConnectionInput): Promise<ProviderTestResult> {
    try {
      const config = await this.resolveConnectionConfig(input)

      if (config.isACP) {
        return this.testAcpProvider(config)
      }

      ensureReadyForHttp(config)

      const model = pickModel(config)

      if (model.length === 0) {
        return {
          success: false,
          message: 'No model selected.'
        }
      }

      if (config.type === 'google') {
        await fetchJson(
          `${joinEndpoint(
            config.resolvedBaseUrl,
            `models/${model}:generateContent`
          )}?key=${encodeURIComponent(config.apiKey)}`,
          {
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'ping' }] }],
              generationConfig: { maxOutputTokens: 1 }
            }),
            headers: createHeaders(config),
            method: 'POST'
          }
        )
      } else if (config.apiFormat === 'anthropic' || config.type === 'anthropic') {
        await fetchJson(joinVersionedEndpoint(config.resolvedBaseUrl, 'v1/messages'), {
          body: JSON.stringify({
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
            model
          }),
          headers: createHeaders(config),
          method: 'POST'
        })
      } else if (config.apiFormat === 'openai-responses') {
        await fetchJson(joinEndpoint(config.resolvedBaseUrl, 'responses'), {
          body: JSON.stringify({
            input: 'ping',
            max_output_tokens: 1,
            model
          }),
          headers: createHeaders(config),
          method: 'POST'
        })
      } else {
        await fetchJson(joinEndpoint(config.resolvedBaseUrl, 'chat/completions'), {
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'ping' }],
            model,
            stream: false,
            [config.useMaxCompletionTokens ? 'max_completion_tokens' : 'max_tokens']: 1
          }),
          headers: createHeaders(config),
          method: 'POST'
        })
      }

      return {
        success: true,
        message: 'Connection succeeded.',
        modelId: model
      }
    } catch (error) {
      return {
        success: false,
        message: extractErrorMessage(error)
      }
    }
  }

  async saveAppearance(input: SaveAppearanceInput): Promise<AppSettings> {
    const parsedInput = saveAppearanceInputSchema.parse(input)

    return this.settingsRepository.saveAppearance(parsedInput)
  }

  /**
   * 更新模型目录后同步同名 LLM connection，保证刷新出的协议信息能进入聊天运行路径。
   */
  private async updateProviderModelsAndSync(
    provider: ProviderId,
    models: ProviderModel[],
    availableModels: ProviderModel[]
  ): Promise<AppSettings> {
    const settings = await this.settingsRepository.updateProviderModels(
      provider,
      models,
      availableModels
    )

    return this.syncProviderLlmConnection(settings, provider)
  }

  /**
   * 把可执行 provider 保存为同名 LLM connection，配置不可执行时禁用旧连接避免被默认聊天选中。
   */
  private async syncProviderLlmConnection(
    settings: AppSettings,
    providerId: ProviderId
  ): Promise<AppSettings> {
    const provider = settings.providers[providerId]

    if (provider === undefined || !provider.enabled || !isSupportedChatProvider(provider)) {
      return (await this.disableProviderLlmConnection(providerId))
        ? this.settingsRepository.getSettings()
        : settings
    }

    const model = selectChatModelId(provider)

    if (model.length === 0) {
      return (await this.disableProviderLlmConnection(providerId))
        ? this.settingsRepository.getSettings()
        : settings
    }

    try {
      assertProviderReadyForAgent(provider, model)
    } catch {
      return (await this.disableProviderLlmConnection(providerId))
        ? this.settingsRepository.getSettings()
        : settings
    }

    await this.settingsRepository.saveLlmConnection(createProviderLlmConnection(provider, model))

    return this.settingsRepository.getSettings()
  }

  /**
   * 禁用 provider 派生出的同名 connection，保留历史记录但阻止默认选择继续使用它。
   */
  private async disableProviderLlmConnection(providerId: ProviderId): Promise<boolean> {
    const existingConnection = await this.settingsRepository.findLlmConnectionById(providerId)

    if (
      existingConnection === null ||
      (!existingConnection.enabled && !existingConnection.isDefault)
    ) {
      return false
    }

    await this.settingsRepository.saveLlmConnection({
      ...existingConnection,
      enabled: false,
      isDefault: false
    })

    return true
  }

  /**
   * 给保存草稿补齐默认字段，确保后续校验面对完整 provider 形状。
   */
  private withProviderDefaults(input: SaveProviderInput): SaveProviderInput {
    const defaults = createDefaultProviderSettings(input.provider)

    return {
      ...input,
      name: input.name ?? defaults.name,
      type: input.type ?? defaults.type,
      apiFormat: input.apiFormat ?? defaults.apiFormat,
      useMaxCompletionTokens: input.useMaxCompletionTokens ?? defaults.useMaxCompletionTokens,
      enabled: input.enabled ?? defaults.enabled,
      requiresBaseUrl: input.requiresBaseUrl ?? defaults.requiresBaseUrl,
      noApiKey: input.noApiKey ?? defaults.noApiKey,
      isCustom: input.isCustom ?? defaults.isCustom,
      isACP: input.isACP ?? defaults.isACP,
      isOAuth: input.isOAuth ?? defaults.isOAuth,
      acpCommand: input.acpCommand ?? defaults.acpCommand,
      acpArgs: input.acpArgs ?? defaults.acpArgs,
      acpAuthMethodId: input.acpAuthMethodId ?? defaults.acpAuthMethodId,
      models: input.models ?? [],
      availableModels: input.availableModels ?? []
    }
  }

  /**
   * 合并用户输入、已保存设置和协议 endpoint，返回连接测试可直接使用的配置。
   */
  private async resolveConnectionConfig(
    input: ProviderConnectionInput
  ): Promise<ProviderConnectionConfig> {
    const settings = await this.settingsRepository.getSettings()
    const savedProvider =
      settings.providers[input.provider] ?? createDefaultProviderSettings(input.provider)
    const parsedInput = providerConnectionInputSchema.parse(
      this.withProviderDefaults({
        ...input,
        name: input.name ?? savedProvider.name,
        type: input.type ?? savedProvider.type,
        baseUrl: input.baseUrl || savedProvider.baseUrl,
        apiFormat: input.apiFormat ?? savedProvider.apiFormat,
        useMaxCompletionTokens:
          input.useMaxCompletionTokens ?? savedProvider.useMaxCompletionTokens,
        customHeaders: input.customHeaders || savedProvider.customHeaders,
        enabled: input.enabled ?? savedProvider.enabled,
        requiresBaseUrl: input.requiresBaseUrl ?? savedProvider.requiresBaseUrl,
        noApiKey: input.noApiKey ?? savedProvider.noApiKey,
        isCustom: input.isCustom ?? savedProvider.isCustom,
        isACP: input.isACP ?? savedProvider.isACP,
        isOAuth: input.isOAuth ?? savedProvider.isOAuth,
        acpCommand: input.acpCommand || savedProvider.acpCommand,
        acpArgs: input.acpArgs.length > 0 ? input.acpArgs : savedProvider.acpArgs,
        acpAuthMethodId: input.acpAuthMethodId || savedProvider.acpAuthMethodId,
        models: input.models.length > 0 ? input.models : savedProvider.models,
        availableModels:
          input.availableModels.length > 0 ? input.availableModels : savedProvider.availableModels,
        model: input.model || savedProvider.model
      })
    )
    const apiKey =
      parsedInput.apiKey.length > 0
        ? parsedInput.apiKey
        : await this.settingsRepository.getProviderApiKey(parsedInput.provider)

    return {
      ...parsedInput,
      apiKey,
      resolvedBaseUrl: resolveProviderEffectiveBaseUrl({
        provider: parsedInput.provider,
        apiFormat: parsedInput.apiFormat,
        baseUrl: parsedInput.baseUrl,
        defaultBaseUrl: savedProvider.defaultBaseUrl
      })
    }
  }

  private async testAcpProvider(config: ProviderConnectionConfig): Promise<ProviderTestResult> {
    if (config.acpCommand.trim().length === 0) {
      return {
        success: false,
        message: 'ACP command is required.'
      }
    }

    try {
      await execFileAsync(config.acpCommand, ['--version'], { timeout: 3_000 })

      return {
        success: true,
        message: 'ACP command is available.'
      }
    } catch (error) {
      return {
        success: false,
        message: extractErrorMessage(error)
      }
    }
  }
}
