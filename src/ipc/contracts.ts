import { z } from 'zod'

import { ipcChannels } from './channels'

export const providerIds = ['claude', 'openai', 'gemini', 'openai-compatible'] as const

export const providerIdSchema = z.enum(providerIds)

export type ProviderId = z.infer<typeof providerIdSchema>

export const providerLabels = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  'openai-compatible': 'OpenAI Compatible'
} as const satisfies Record<ProviderId, string>

export const providerSettingsSchema = z.object({
  provider: providerIdSchema,
  apiKey: z.string(),
  model: z.string(),
  baseUrl: z.string(),
  updatedAt: z.string()
})

export type ProviderSettings = z.infer<typeof providerSettingsSchema>

export const appSettingsSchema = z.object({
  providers: z.object({
    claude: providerSettingsSchema,
    openai: providerSettingsSchema,
    gemini: providerSettingsSchema,
    'openai-compatible': providerSettingsSchema
  })
})

export type AppSettings = z.infer<typeof appSettingsSchema>

export const saveProviderInputSchema = z
  .object({
    provider: providerIdSchema,
    apiKey: z.string().trim().min(1, 'API key is required.'),
    model: z.string().trim().min(1, 'Model is required.'),
    baseUrl: z.string().trim().optional().default('')
  })
  .superRefine((input, context) => {
    if (input.provider !== 'openai-compatible') {
      return
    }

    if (input.baseUrl.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Base URL is required.',
        path: ['baseUrl']
      })
      return
    }

    try {
      const url = new URL(input.baseUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Unsupported protocol')
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Base URL must be a valid HTTP URL.',
        path: ['baseUrl']
      })
    }
  })

export type SaveProviderInput = z.infer<typeof saveProviderInputSchema>

export const openSettingsInputSchema = z
  .object({
    section: z.literal('providers').optional()
  })
  .optional()

export type OpenSettingsInput = z.infer<typeof openSettingsInputSchema>

export const projectRecordSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type ProjectRecord = z.infer<typeof projectRecordSchema>

export const sessionRecordSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  provider: providerIdSchema,
  title: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type SessionRecord = z.infer<typeof sessionRecordSchema>

export const messageRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type MessageRecord = z.infer<typeof messageRecordSchema>

export type MessageSearchResult = {
  messageId: string
  sessionId: string
  content: string
}

export type WindowState = {
  isMaximized: boolean
}

export type AppIpcContractMap = {
  [ipcChannels.settings.get]: {
    request: undefined
    response: AppSettings
  }
  [ipcChannels.settings.saveProvider]: {
    request: SaveProviderInput
    response: AppSettings
  }
  [ipcChannels.window.close]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.minimize]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.toggleMaximize]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.openSettings]: {
    request: OpenSettingsInput
    response: void
  }
  [ipcChannels.window.getState]: {
    request: undefined
    response: WindowState
  }
}

export type MoonApi = {
  settings: {
    get: () => Promise<AppSettings>
    saveProvider: (input: SaveProviderInput) => Promise<AppSettings>
  }
  windowControls: {
    close: () => Promise<void>
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    openSettings: (input?: OpenSettingsInput) => Promise<void>
    getState: () => Promise<WindowState>
    onStateChange: (listener: (state: WindowState) => void) => () => void
  }
}

export function createDefaultProviderSettings(provider: ProviderId): ProviderSettings {
  return {
    provider,
    apiKey: '',
    model: '',
    baseUrl: '',
    updatedAt: ''
  }
}

export function createDefaultAppSettings(): AppSettings {
  return {
    providers: {
      claude: createDefaultProviderSettings('claude'),
      openai: createDefaultProviderSettings('openai'),
      gemini: createDefaultProviderSettings('gemini'),
      'openai-compatible': createDefaultProviderSettings('openai-compatible')
    }
  }
}

export function isProviderId(value: string): value is ProviderId {
  return providerIds.includes(value as ProviderId)
}
