/**
 * 负责定义 provider 目录、默认模型和 endpoint 解析规则。
 * 它只描述跨进程共享的 provider 元数据，不保存用户密钥或创建 SDK client。
 */

export const builtInProviderIds = [
  'moonshot',
  'openai',
  'claude',
  'gemini',
  'aihubmix',
  'deepseek',
  'z-ai-coding-plan',
  'kimi-coding-plan',
  'openrouter',
  'azure-openai',
  'github-copilot',
  'claude-subscription',
  'claude-code-acp',
  'gemini-acp',
  'codex-acp',
  'volcengine',
  'ollama',
  'cloudflare-ai-gateway'
] as const

export const providerIds = builtInProviderIds

export type BuiltInProviderId = (typeof builtInProviderIds)[number]
export type ProviderId = string

export const providerApiFormats = ['openai-chat', 'openai-responses', 'anthropic'] as const

export type ProviderApiFormat = (typeof providerApiFormats)[number]

export type ProviderModelDiscoveryMode = 'http' | 'static' | 'none'

export type ProviderKind = 'official' | 'custom' | 'coding-plan' | 'acp' | 'oauth' | 'local'

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'aihubmix'
  | 'deepseek'
  | 'moonshot'
  | 'zai-coding-plan'
  | 'kimi-coding-plan'
  | 'openrouter'
  | 'azure'
  | 'copilot'
  | 'claude-subscription'
  | 'acp'
  | 'volcengine'
  | 'ollama'
  | 'cloudflare-ai-gateway'
  | 'custom'

export const providerModelManualOverrideFields = [
  'name',
  'supportsVision',
  'supportsImageOutput',
  'supportsToolCalling',
  'supportsReasoning',
  'supportsEmbedding',
  'contextWindow',
  'maxOutputTokens',
  'providerOptions'
] as const

export type ProviderModelManualOverride = (typeof providerModelManualOverrideFields)[number]

export type ProviderModel = {
  id: string
  name: string
  enabled: boolean
  isManual: boolean
  supportsVision?: boolean
  supportsImageOutput?: boolean
  supportsToolCalling?: boolean
  supportsReasoning?: boolean
  supportsEmbedding?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  providerApi?: string
  providerBaseUrl?: string
  providerOptions?: string
  manualOverrides?: ProviderModelManualOverride[]
}

type AutoProviderModelCapability = Extract<
  ProviderModelManualOverride,
  'supportsVision' | 'supportsToolCalling' | 'supportsReasoning'
>

/**
 * 格式化模型上下文窗口，供 UI 展示紧凑的人类可读数值。
 */
export function formatProviderModelContextWindow(model: ProviderModel): string {
  if (model.contextWindow === undefined) {
    return ''
  }

  if (model.contextWindow >= 1_000_000) {
    const contextWindowInMillions = model.contextWindow / 1_000_000
    const displayValue = Number.isInteger(contextWindowInMillions)
      ? String(contextWindowInMillions)
      : String(Number(contextWindowInMillions.toFixed(1)))

    return `${displayValue}M`
  }

  if (model.contextWindow >= 1000) {
    return `${Math.round(model.contextWindow / 1000)}K`
  }

  return String(model.contextWindow)
}

/**
 * 判断模型字段是否被用户手动覆盖，避免自动刷新覆盖用户意图。
 */
function hasProviderModelManualOverride(
  model: ProviderModel,
  field: ProviderModelManualOverride
): boolean {
  return model.manualOverrides?.includes(field) ?? false
}

/**
 * 解析自动模型能力字段；用户覆盖优先，否则默认认为远端模型支持该能力。
 */
export function resolveAutoProviderModelCapability(
  model: ProviderModel,
  field: AutoProviderModelCapability
): boolean {
  return hasProviderModelManualOverride(model, field) ? (model[field] ?? false) : true
}

export type ProviderMetadata = {
  provider: BuiltInProviderId
  label: string
  description: string
  type: ProviderType
  kind: ProviderKind
  defaultBaseUrl: string
  apiFormatBaseUrls?: Partial<Record<ProviderApiFormat, string>>
  modelDiscovery?: ProviderModelDiscoveryMode
  apiKeyHelpUrl: string
  requiresBaseUrl: boolean
  noApiKey: boolean
  isACP: boolean
  isOAuth: boolean
  defaultApiFormat: ProviderApiFormat
  defaultUseMaxCompletionTokens: boolean
  modelPlaceholder: string
  defaultModels: ProviderModel[]
  modelsDevProviderId?: string
  modelCatalogProviderId?: string
  badge?: string
  acpCommand?: string
  acpArgs?: string[]
}

/**
 * 创建内置 provider 的默认模型条目，调用方可再叠加远端元数据或用户覆盖。
 */
function model(id: string, name = id, enabled = false, contextWindow?: number): ProviderModel {
  return {
    id,
    name,
    enabled,
    isManual: false,
    ...(contextWindow === undefined ? {} : { contextWindow })
  }
}

export const providerLabels = {
  moonshot: 'Moonshot',
  openai: 'OpenAI',
  claude: 'Anthropic',
  gemini: 'Google Gemini',
  aihubmix: 'AiHubMix',
  deepseek: 'DeepSeek',
  'z-ai-coding-plan': 'Z.AI Coding Plan',
  'kimi-coding-plan': 'Kimi Coding Plan',
  openrouter: 'OpenRouter',
  'azure-openai': 'Azure OpenAI',
  'github-copilot': 'GitHub Copilot',
  'claude-subscription': 'Claude Subscription',
  'claude-code-acp': 'Claude Code (ACP)',
  'gemini-acp': 'Gemini CLI (ACP)',
  'codex-acp': 'Codex CLI (ACP)',
  volcengine: 'Volcengine',
  ollama: 'Ollama',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway'
} as const satisfies Record<BuiltInProviderId, string>

export const providerMetadata: Record<BuiltInProviderId, ProviderMetadata> = {
  moonshot: {
    provider: 'moonshot',
    label: providerLabels.moonshot,
    description: 'Moonshot 与 Kimi 系列模型。',
    type: 'moonshot',
    kind: 'official',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    apiKeyHelpUrl: 'https://platform.moonshot.cn/console/api-keys',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'moonshot-v1-8k',
    defaultModels: [model('moonshot-v1-8k'), model('moonshot-v1-32k'), model('moonshot-v1-128k')],
    modelsDevProviderId: 'moonshotai',
    modelCatalogProviderId: 'moonshotai'
  },
  openai: {
    provider: 'openai',
    label: providerLabels.openai,
    description: 'OpenAI models including GPT, o-series, and multimodal models.',
    type: 'openai',
    kind: 'official',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: true,
    modelPlaceholder: 'gpt-5.4',
    defaultModels: [model('gpt-5.4', 'gpt-5.4', true, 400_000), model('gpt-5.2', 'gpt-5.2')],
    modelCatalogProviderId: 'openai'
  },
  claude: {
    provider: 'claude',
    label: providerLabels.claude,
    description: 'Anthropic Claude 系列模型。',
    type: 'anthropic',
    kind: 'official',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'anthropic',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'claude-sonnet-4-5',
    defaultModels: [
      model('claude-sonnet-4-5'),
      model('claude-opus-4-5'),
      model('claude-3-7-sonnet-latest')
    ],
    modelsDevProviderId: 'anthropic',
    modelCatalogProviderId: 'anthropic'
  },
  gemini: {
    provider: 'gemini',
    label: providerLabels.gemini,
    description: 'Google Gemini 系列模型。',
    type: 'google',
    kind: 'official',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyHelpUrl: 'https://aistudio.google.com/app/apikey',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'gemini-2.5-pro',
    defaultModels: [model('gemini-2.5-pro'), model('gemini-2.5-flash')],
    modelsDevProviderId: 'google',
    modelCatalogProviderId: 'google'
  },
  aihubmix: {
    provider: 'aihubmix',
    label: providerLabels.aihubmix,
    description: 'AiHubMix 聚合模型服务。',
    type: 'aihubmix',
    kind: 'official',
    defaultBaseUrl: 'https://aihubmix.com/v1',
    apiKeyHelpUrl: 'https://aihubmix.com',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'gpt-4o',
    defaultModels: []
  },
  deepseek: {
    provider: 'deepseek',
    label: providerLabels.deepseek,
    description: 'DeepSeek 对话与推理模型。',
    type: 'deepseek',
    kind: 'official',
    defaultBaseUrl: 'https://api.deepseek.com',
    modelDiscovery: 'static',
    apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    apiFormatBaseUrls: {
      'openai-chat': 'https://api.deepseek.com',
      anthropic: 'https://api.deepseek.com/anthropic'
    },
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'deepseek-v4-flash',
    defaultModels: [
      model('deepseek-v4-flash', 'deepseek-v4-flash', true),
      model('deepseek-v4-pro')
    ],
    modelCatalogProviderId: 'deepseek'
  },
  'z-ai-coding-plan': {
    provider: 'z-ai-coding-plan',
    label: providerLabels['z-ai-coding-plan'],
    description: 'Z.AI 编程计划提供商。',
    type: 'zai-coding-plan',
    kind: 'coding-plan',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'glm-4.6',
    defaultModels: [model('glm-4.6')]
  },
  'kimi-coding-plan': {
    provider: 'kimi-coding-plan',
    label: providerLabels['kimi-coding-plan'],
    description: 'Kimi 编程计划提供商。',
    type: 'kimi-coding-plan',
    kind: 'coding-plan',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'kimi-k2',
    defaultModels: [model('kimi-k2')]
  },
  openrouter: {
    provider: 'openrouter',
    label: providerLabels.openrouter,
    description: 'OpenRouter 多模型路由服务。',
    type: 'openrouter',
    kind: 'official',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyHelpUrl: 'https://openrouter.ai/settings/keys',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'openai/gpt-5.4',
    defaultModels: [],
    modelCatalogProviderId: 'openrouter'
  },
  'azure-openai': {
    provider: 'azure-openai',
    label: providerLabels['azure-openai'],
    description: 'Azure OpenAI 资源端点。',
    type: 'azure',
    kind: 'official',
    defaultBaseUrl: '',
    apiKeyHelpUrl: 'https://portal.azure.com',
    requiresBaseUrl: true,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'Deployment name (e.g., gpt-4o)',
    defaultModels: [],
    modelCatalogProviderId: 'azure-openai-responses'
  },
  'github-copilot': {
    provider: 'github-copilot',
    label: providerLabels['github-copilot'],
    description: 'GitHub Copilot 账号提供的模型。',
    type: 'copilot',
    kind: 'oauth',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: true,
    isACP: false,
    isOAuth: true,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'gpt-5-codex',
    defaultModels: []
  },
  'claude-subscription': {
    provider: 'claude-subscription',
    label: providerLabels['claude-subscription'],
    description: '通过 Anthropic 订阅账号访问 Claude 模型。',
    type: 'claude-subscription',
    kind: 'oauth',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: true,
    isACP: false,
    isOAuth: true,
    defaultApiFormat: 'anthropic',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'claude-sonnet-4-5',
    defaultModels: [model('claude-sonnet-4-5'), model('claude-opus-4-5')]
  },
  'claude-code-acp': {
    provider: 'claude-code-acp',
    label: providerLabels['claude-code-acp'],
    description: 'Claude Code agent via ACP protocol。',
    type: 'acp',
    kind: 'acp',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: true,
    isACP: true,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'claude-code',
    defaultModels: [],
    acpCommand: 'claude-code-acp',
    acpArgs: []
  },
  'gemini-acp': {
    provider: 'gemini-acp',
    label: providerLabels['gemini-acp'],
    description: 'Gemini CLI agent via ACP protocol。',
    type: 'acp',
    kind: 'acp',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: true,
    isACP: true,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'gemini',
    defaultModels: [],
    acpCommand: 'gemini',
    acpArgs: ['--experimental-acp']
  },
  'codex-acp': {
    provider: 'codex-acp',
    label: providerLabels['codex-acp'],
    description: 'OpenAI Codex CLI agent via ACP protocol。',
    type: 'acp',
    kind: 'acp',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: true,
    isACP: true,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'codex',
    defaultModels: [],
    acpCommand: 'codex-acp',
    acpArgs: []
  },
  volcengine: {
    provider: 'volcengine',
    label: providerLabels.volcengine,
    description: 'Volcengine Ark 模型服务。',
    type: 'volcengine',
    kind: 'official',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyHelpUrl: 'https://console.volcengine.com/ark',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'doubao-seed-1-6',
    defaultModels: []
  },
  ollama: {
    provider: 'ollama',
    label: providerLabels.ollama,
    description: 'Run open-source LLMs locally with Ollama。',
    type: 'ollama',
    kind: 'local',
    defaultBaseUrl: 'http://localhost:11434/v1',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    noApiKey: true,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'llama3.2',
    defaultModels: []
  },
  'cloudflare-ai-gateway': {
    provider: 'cloudflare-ai-gateway',
    label: providerLabels['cloudflare-ai-gateway'],
    description: '通过 Cloudflare AI Gateway 代理 AI provider。',
    type: 'cloudflare-ai-gateway',
    kind: 'official',
    defaultBaseUrl: '',
    apiKeyHelpUrl: 'https://developers.cloudflare.com/ai-gateway/',
    requiresBaseUrl: true,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'provider/model',
    defaultModels: [],
    modelCatalogProviderId: 'cloudflare-ai-gateway'
  }
}

export const providerCatalog: ProviderMetadata[] = builtInProviderIds.map(
  (provider) => providerMetadata[provider]
)

/**
 * 判断 provider 是否来自内置目录，调用方据此决定是否能读取内置元数据。
 */
export function isBuiltInProviderId(provider: ProviderId): provider is BuiltInProviderId {
  return builtInProviderIds.includes(provider as BuiltInProviderId)
}

/**
 * 解析内置 provider 的默认协议；未知 provider 使用调用方传入的回退值。
 */
export function resolveProviderDefaultApiFormat(
  provider: ProviderId,
  fallback: ProviderApiFormat
): ProviderApiFormat {
  if (!isBuiltInProviderId(provider)) {
    return fallback
  }

  return providerMetadata[provider].defaultApiFormat
}

/**
 * 按 provider 和协议解析默认 endpoint，避免把模型列表根地址和运行时协议地址混在一起。
 */
export function resolveProviderDefaultBaseUrl(
  provider: ProviderId,
  apiFormat: ProviderApiFormat
): string {
  if (!isBuiltInProviderId(provider)) {
    return ''
  }

  const metadata = providerMetadata[provider]

  return (metadata.apiFormatBaseUrls?.[apiFormat] ?? metadata.defaultBaseUrl).trim()
}

/**
 * 解析内置 provider 对应的模型目录 provider key；没有映射时返回空字符串。
 */
export function resolveProviderModelCatalogProviderId(provider: ProviderId): string {
  if (!isBuiltInProviderId(provider)) {
    return ''
  }

  return providerMetadata[provider].modelCatalogProviderId ?? ''
}

/**
 * 解析 provider 实际请求 endpoint，用户显式填写的 baseUrl 始终优先。
 */
export function resolveProviderEffectiveBaseUrl({
  apiFormat,
  baseUrl,
  defaultBaseUrl,
  provider
}: {
  provider: ProviderId
  apiFormat: ProviderApiFormat
  baseUrl?: string
  defaultBaseUrl?: string
}): string {
  const configuredBaseUrl = baseUrl?.trim() ?? ''

  if (configuredBaseUrl.length > 0) {
    return configuredBaseUrl
  }

  if (isBuiltInProviderId(provider)) {
    const providerDefaultBaseUrl = resolveProviderDefaultBaseUrl(provider, apiFormat)

    if (providerDefaultBaseUrl.length > 0) {
      return providerDefaultBaseUrl
    }
  }

  return defaultBaseUrl?.trim() ?? ''
}

/**
 * 返回 provider 模型发现方式；未知 provider 默认走 HTTP 拉取，保持自定义 provider 兼容性。
 */
export function resolveProviderModelDiscovery(provider: ProviderId): ProviderModelDiscoveryMode {
  return isBuiltInProviderId(provider)
    ? (providerMetadata[provider].modelDiscovery ?? 'http')
    : 'http'
}
