import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@shared/domain/settings-validation'
import {
  createCustomAcpProviderInputSchema,
  createCustomProviderInputSchema,
  deleteProviderInputSchema,
  providerConnectionInputSchema,
  saveAppearanceInputSchema,
  saveProviderInputSchema
} from '@shared/domain/settings-validation'
import {
  createDefaultProviderSettings,
  type AppSettings,
  type ProviderTestResult
} from '../../shared/domain/settings'
import type { ProviderModel } from '../../shared/domain/provider'
import type { SettingsRepository } from '../repositories/settings-repository'

const execFileAsync = promisify(execFile)
const anthropicVersion = '2023-06-01'

type ProviderConnectionConfig = SaveProviderInput & {
  apiKey: string
  selectedModel: string
}

type ModelListPayload = {
  data?: unknown
  models?: unknown
}

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

function normalizeFetchedModels(
  payload: ModelListPayload,
  existingModels: ProviderModel[]
): ProviderModel[] {
  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []
  const enabledById = new Map(existingModels.map((model) => [model.id, model.enabled]))
  const seen = new Set<string>()
  const models: ProviderModel[] = []

  for (const rawModel of rawModels) {
    const model = normalizeFetchedModel(rawModel)

    if (model === null || seen.has(model.id)) {
      continue
    }

    seen.add(model.id)
    models.push({
      ...model,
      enabled: enabledById.get(model.id) ?? model.enabled
    })
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

function ensureReadyForHttp(config: ProviderConnectionConfig): void {
  const baseUrl = config.baseUrl.trim()

  if (baseUrl.length === 0) {
    throw new Error('Base URL is required.')
  }

  if (!config.noApiKey && config.apiKey.trim().length === 0) {
    throw new Error('API key is required.')
  }
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

    return this.settingsRepository.saveProvider(parsedInput.provider, parsedInput)
  }

  async deleteProvider(input: DeleteProviderInput): Promise<AppSettings> {
    const parsedInput = deleteProviderInputSchema.parse(input)

    return this.settingsRepository.deleteProvider(parsedInput.provider)
  }

  async fetchProviderModels(input: ProviderConnectionInput): Promise<AppSettings> {
    const config = await this.resolveConnectionConfig(input)

    if (config.isACP || config.isOAuth) {
      return this.settingsRepository.updateProviderModels(config.provider, config.models, [])
    }

    ensureReadyForHttp(config)

    const payload =
      config.type === 'google'
        ? await fetchJson(
            `${joinEndpoint(config.baseUrl, 'models')}?key=${encodeURIComponent(config.apiKey)}`,
            {
              headers: createHeaders(config),
              method: 'GET'
            }
          )
        : config.apiFormat === 'anthropic' || config.type === 'anthropic'
          ? await fetchJson(joinVersionedEndpoint(config.baseUrl, 'v1/models'), {
              headers: createHeaders(config),
              method: 'GET'
            })
          : await fetchJson(joinEndpoint(config.baseUrl, 'models'), {
              headers: createHeaders(config),
              method: 'GET'
            })
    const fetchedModels = normalizeFetchedModels(payload as ModelListPayload, config.models)
    const mergedModels = fetchedModels.map((model) => ({
      ...model,
      enabled: config.models.find((entry) => entry.id === model.id)?.enabled ?? model.enabled
    }))

    await this.settingsRepository.saveProvider(config.provider, config)

    return this.settingsRepository.updateProviderModels(
      config.provider,
      mergedModels,
      fetchedModels
    )
  }

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
          `${joinEndpoint(config.baseUrl, `models/${model}:generateContent`)}?key=${encodeURIComponent(
            config.apiKey
          )}`,
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
        await fetchJson(joinVersionedEndpoint(config.baseUrl, 'v1/messages'), {
          body: JSON.stringify({
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
            model
          }),
          headers: createHeaders(config),
          method: 'POST'
        })
      } else if (config.apiFormat === 'openai-responses') {
        await fetchJson(joinEndpoint(config.baseUrl, 'responses'), {
          body: JSON.stringify({
            input: 'ping',
            max_output_tokens: 1,
            model
          }),
          headers: createHeaders(config),
          method: 'POST'
        })
      } else {
        await fetchJson(joinEndpoint(config.baseUrl, 'chat/completions'), {
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
      models: input.models ?? defaults.models,
      availableModels: input.availableModels ?? defaults.availableModels
    }
  }

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
        baseUrl: input.baseUrl || savedProvider.baseUrl || savedProvider.defaultBaseUrl,
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
      apiKey
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
