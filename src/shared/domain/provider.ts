export const providerIds = [
  'moonshot',
  'openai-compatible',
  'openai',
  'claude',
  'gemini',
  'aihubmix',
  'deepseek',
  'z-ai-coding-plan',
  'kimi-coding-plan',
  'openrouter',
  'azure-openai'
] as const

export type ProviderId = (typeof providerIds)[number]

export type ProviderKind = 'official' | 'custom' | 'coding-plan'

export type ProviderMetadata = {
  provider: ProviderId
  label: string
  description: string
  kind: ProviderKind
  defaultBaseUrl: string
  apiKeyHelpUrl: string
  requiresBaseUrl: boolean
  modelPlaceholder: string
  badge?: string
}

export const providerLabels = {
  moonshot: 'Moonshot',
  'openai-compatible': 'CPA',
  openai: 'OpenAI',
  claude: 'Anthropic',
  gemini: 'Google Gemini',
  aihubmix: 'AiHubMix',
  deepseek: 'DeepSeek',
  'z-ai-coding-plan': 'Z.AI Coding Plan',
  'kimi-coding-plan': 'Kimi Coding Plan',
  openrouter: 'OpenRouter',
  'azure-openai': 'Azure OpenAI'
} as const satisfies Record<ProviderId, string>

export const providerMetadata: Record<ProviderId, ProviderMetadata> = {
  moonshot: {
    provider: 'moonshot',
    label: providerLabels.moonshot,
    description: 'Moonshot 与 Kimi 系列模型。',
    kind: 'official',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    apiKeyHelpUrl: 'https://platform.moonshot.cn/console/api-keys',
    requiresBaseUrl: false,
    modelPlaceholder: 'moonshot-v1-8k'
  },
  'openai-compatible': {
    provider: 'openai-compatible',
    label: providerLabels['openai-compatible'],
    description: '兼容 OpenAI 协议的自定义 API 端点。',
    kind: 'custom',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: true,
    modelPlaceholder: 'gpt-compatible',
    badge: 'CUSTOM'
  },
  openai: {
    provider: 'openai',
    label: providerLabels.openai,
    description: 'OpenAI models including GPT, o-series, and multimodal models.',
    kind: 'official',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    requiresBaseUrl: false,
    modelPlaceholder: 'gpt-5.4'
  },
  claude: {
    provider: 'claude',
    label: providerLabels.claude,
    description: 'Anthropic Claude 系列模型。',
    kind: 'official',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    requiresBaseUrl: false,
    modelPlaceholder: 'claude-3-7-sonnet-latest'
  },
  gemini: {
    provider: 'gemini',
    label: providerLabels.gemini,
    description: 'Google Gemini 系列模型。',
    kind: 'official',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyHelpUrl: 'https://aistudio.google.com/app/apikey',
    requiresBaseUrl: false,
    modelPlaceholder: 'gemini-2.5-pro'
  },
  aihubmix: {
    provider: 'aihubmix',
    label: providerLabels.aihubmix,
    description: 'AiHubMix 聚合模型服务。',
    kind: 'official',
    defaultBaseUrl: 'https://aihubmix.com/v1',
    apiKeyHelpUrl: 'https://aihubmix.com',
    requiresBaseUrl: false,
    modelPlaceholder: 'gpt-4o'
  },
  deepseek: {
    provider: 'deepseek',
    label: providerLabels.deepseek,
    description: 'DeepSeek 对话与推理模型。',
    kind: 'official',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
    requiresBaseUrl: false,
    modelPlaceholder: 'deepseek-chat'
  },
  'z-ai-coding-plan': {
    provider: 'z-ai-coding-plan',
    label: providerLabels['z-ai-coding-plan'],
    description: 'Z.AI 编程计划提供商。',
    kind: 'coding-plan',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    modelPlaceholder: 'glm-4.6'
  },
  'kimi-coding-plan': {
    provider: 'kimi-coding-plan',
    label: providerLabels['kimi-coding-plan'],
    description: 'Kimi 编程计划提供商。',
    kind: 'coding-plan',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: false,
    modelPlaceholder: 'kimi-k2'
  },
  openrouter: {
    provider: 'openrouter',
    label: providerLabels.openrouter,
    description: 'OpenRouter 多模型路由服务。',
    kind: 'official',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyHelpUrl: 'https://openrouter.ai/settings/keys',
    requiresBaseUrl: false,
    modelPlaceholder: 'openai/gpt-5.4'
  },
  'azure-openai': {
    provider: 'azure-openai',
    label: providerLabels['azure-openai'],
    description: 'Azure OpenAI 资源端点。',
    kind: 'official',
    defaultBaseUrl: '',
    apiKeyHelpUrl: 'https://portal.azure.com',
    requiresBaseUrl: true,
    modelPlaceholder: 'gpt-4o'
  }
}

export const providerCatalog: ProviderMetadata[] = providerIds.map(
  (provider) => providerMetadata[provider]
)
