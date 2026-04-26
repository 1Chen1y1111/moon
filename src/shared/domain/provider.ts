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
  'cloudflare-ai-gateway',
  'openai-compatible'
] as const

export const providerIds = builtInProviderIds

export type BuiltInProviderId = (typeof builtInProviderIds)[number]
export type ProviderId = string

export const providerApiFormats = ['openai-chat', 'openai-responses', 'anthropic'] as const

export type ProviderApiFormat = (typeof providerApiFormats)[number]

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

export type ProviderModel = {
  id: string
  name: string
  enabled: boolean
  isManual: boolean
  contextWindow?: number
}

export type ProviderMetadata = {
  provider: BuiltInProviderId
  label: string
  description: string
  type: ProviderType
  kind: ProviderKind
  defaultBaseUrl: string
  apiKeyHelpUrl: string
  requiresBaseUrl: boolean
  noApiKey: boolean
  isACP: boolean
  isOAuth: boolean
  defaultApiFormat: ProviderApiFormat
  defaultUseMaxCompletionTokens: boolean
  modelPlaceholder: string
  defaultModels: ProviderModel[]
  badge?: string
  acpCommand?: string
  acpArgs?: string[]
}

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
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'openai-compatible': 'CPA'
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
    defaultModels: [model('moonshot-v1-8k'), model('moonshot-v1-32k'), model('moonshot-v1-128k')]
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
    defaultModels: [model('gpt-5.4', 'gpt-5.4', true, 400_000), model('gpt-5.2', 'gpt-5.2')]
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
    ]
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
    defaultModels: [model('gemini-2.5-pro'), model('gemini-2.5-flash')]
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
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyHelpUrl: 'https://platform.deepseek.com/api_keys',
    requiresBaseUrl: false,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'deepseek-chat',
    defaultModels: [model('deepseek-chat'), model('deepseek-reasoner')]
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
    defaultModels: []
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
    defaultModels: []
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
    defaultModels: []
  },
  'openai-compatible': {
    provider: 'openai-compatible',
    label: providerLabels['openai-compatible'],
    description: '兼容 OpenAI 协议的自定义 API 端点。',
    type: 'custom',
    kind: 'custom',
    defaultBaseUrl: '',
    apiKeyHelpUrl: '',
    requiresBaseUrl: true,
    noApiKey: false,
    isACP: false,
    isOAuth: false,
    defaultApiFormat: 'openai-chat',
    defaultUseMaxCompletionTokens: false,
    modelPlaceholder: 'gpt-compatible',
    defaultModels: [],
    badge: 'CUSTOM'
  }
}

export const providerCatalog: ProviderMetadata[] = builtInProviderIds.map(
  (provider) => providerMetadata[provider]
)

export function isBuiltInProviderId(provider: ProviderId): provider is BuiltInProviderId {
  return builtInProviderIds.includes(provider as BuiltInProviderId)
}
