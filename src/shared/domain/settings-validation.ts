import { z } from 'zod'

import { providerIds } from './provider'
import { appearanceThemes } from './settings'

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
