import { z } from 'zod'

import { providerIds } from '../shared/domain/provider'
import { appearanceThemes } from '../shared/domain/settings'
import type { AppSettings } from '../shared/domain/settings'
import { ipcChannels } from './channels'

export { providerIds, providerLabels } from '../shared/domain/provider'
export type { ProviderId } from '../shared/domain/provider'
export { appearanceThemes, createDefaultAppSettings } from '../shared/domain/settings'
export type {
  AppearanceSettings,
  AppearanceTheme,
  AppSettings,
  ProviderSettings
} from '../shared/domain/settings'

export const providerIdSchema = z.enum(providerIds)

export const appearanceThemeSchema = z.enum(appearanceThemes)

export const appearanceSettingsSchema = z.object({
  theme: appearanceThemeSchema
})

export const providerSettingsSchema = z.object({
  provider: providerIdSchema,
  hasApiKey: z.boolean(),
  apiKeyPreview: z.string(),
  model: z.string(),
  baseUrl: z.string(),
  updatedAt: z.string()
})

export const appSettingsSchema = z.object({
  appearance: appearanceSettingsSchema,
  providers: z.object({
    claude: providerSettingsSchema,
    openai: providerSettingsSchema,
    gemini: providerSettingsSchema,
    'openai-compatible': providerSettingsSchema
  })
})

export const saveProviderInputSchema = z
  .object({
    provider: providerIdSchema,
    apiKey: z.string().trim().optional().default(''),
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

export const saveAppearanceInputSchema = z.object({
  theme: appearanceThemeSchema
})

export type SaveAppearanceInput = z.infer<typeof saveAppearanceInputSchema>

export const openSettingsInputSchema = z
  .object({
    section: z.literal('providers').optional()
  })
  .optional()

export type OpenSettingsInput = z.infer<typeof openSettingsInputSchema>

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
  [ipcChannels.settings.saveAppearance]: {
    request: SaveAppearanceInput
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
    saveAppearance: (input: SaveAppearanceInput) => Promise<AppSettings>
    onChange: (listener: (settings: AppSettings) => void) => () => void
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
