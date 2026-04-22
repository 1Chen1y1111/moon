export const providerIds = ['claude', 'openai', 'gemini', 'openai-compatible'] as const

export type ProviderId = (typeof providerIds)[number]

export const providerLabels = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  'openai-compatible': 'OpenAI Compatible'
} as const satisfies Record<ProviderId, string>
