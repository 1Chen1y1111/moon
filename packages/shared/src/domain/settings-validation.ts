import { z } from 'zod'

import { providerApiFormats, providerModelManualOverrideFields } from './provider.ts'
import { appearanceThemes } from './settings.ts'

export const providerIdSchema = z.string().trim().min(1, 'Provider is required.')

export const appearanceThemeSchema = z.enum(appearanceThemes)

export const appearanceSettingsSchema = z.object({
  theme: appearanceThemeSchema
})

export const providerModelSchema = z.object({
  id: z.string().trim().min(1, 'Model ID is required.'),
  name: z.string().trim().min(1, 'Display name is required.'),
  enabled: z.boolean(),
  isManual: z.boolean(),
  supportsVision: z.boolean().optional(),
  supportsImageOutput: z.boolean().optional(),
  supportsToolCalling: z.boolean().optional(),
  supportsReasoning: z.boolean().optional(),
  supportsEmbedding: z.boolean().optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  providerOptions: z.string().optional(),
  manualOverrides: z.array(z.enum(providerModelManualOverrideFields)).optional()
})

export const providerApiFormatSchema = z.enum(providerApiFormats)

export const providerSettingsSchema = z.object({
  provider: providerIdSchema,
  name: z.string(),
  type: z.string(),
  kind: z.string(),
  description: z.string(),
  badge: z.string(),
  hasApiKey: z.boolean(),
  apiKey: z.string(),
  model: z.string(),
  models: z.array(providerModelSchema),
  availableModels: z.array(providerModelSchema),
  baseUrl: z.string(),
  defaultBaseUrl: z.string(),
  apiFormat: providerApiFormatSchema,
  useMaxCompletionTokens: z.boolean(),
  customHeaders: z.string(),
  enabled: z.boolean(),
  requiresBaseUrl: z.boolean(),
  noApiKey: z.boolean(),
  isBuiltIn: z.boolean(),
  isCustom: z.boolean(),
  isACP: z.boolean(),
  isOAuth: z.boolean(),
  apiKeyHelpUrl: z.string(),
  modelPlaceholder: z.string(),
  acpCommand: z.string(),
  acpArgs: z.array(z.string()),
  acpAuthMethodId: z.string(),
  updatedAt: z.string(),
  modelsUpdatedAt: z.string()
})

export const appSettingsSchema = z.object({
  appearance: appearanceSettingsSchema,
  providers: z.record(providerIdSchema, providerSettingsSchema)
})

function validateHttpUrl(value: string, context: z.RefinementCtx, path: string[]): void {
  if (value.length === 0) {
    return
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported protocol')
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Base URL must be a valid HTTP URL.',
      path
    })
  }
}

function validateHeadersJson(value: string, context: z.RefinementCtx): void {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return
  }

  try {
    const parsed = JSON.parse(trimmedValue) as unknown

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Headers must be an object')
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Custom headers must be valid JSON object.',
      path: ['customHeaders']
    })
  }
}

export const saveProviderInputSchema = z
  .object({
    provider: providerIdSchema,
    name: z.string().trim().min(1, 'Provider name is required.').optional(),
    type: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().optional().default(''),
    model: z.string().trim().optional().default(''),
    models: z.array(providerModelSchema).optional().default([]),
    availableModels: z.array(providerModelSchema).optional().default([]),
    baseUrl: z.string().trim().optional().default(''),
    apiFormat: providerApiFormatSchema.optional().default('openai-chat'),
    useMaxCompletionTokens: z.boolean().optional().default(false),
    customHeaders: z.string().trim().optional().default(''),
    enabled: z.boolean().optional().default(false),
    requiresBaseUrl: z.boolean().optional().default(false),
    noApiKey: z.boolean().optional().default(false),
    isCustom: z.boolean().optional().default(false),
    isACP: z.boolean().optional().default(false),
    isOAuth: z.boolean().optional().default(false),
    acpCommand: z.string().trim().optional().default(''),
    acpArgs: z.array(z.string().trim().min(1)).optional().default([]),
    acpAuthMethodId: z.string().trim().optional().default('')
  })
  .superRefine((input, context) => {
    validateHttpUrl(input.baseUrl, context, ['baseUrl'])
    validateHeadersJson(input.customHeaders, context)

    if (input.enabled && input.requiresBaseUrl && input.baseUrl.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Base URL is required.',
        path: ['baseUrl']
      })
    }

    if (input.enabled && input.isACP && input.acpCommand.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'ACP command is required.',
        path: ['acpCommand']
      })
    }
  })

export type SaveProviderInput = z.infer<typeof saveProviderInputSchema>

export const createCustomProviderInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Provider name is required.'),
    baseUrl: z.string().trim().optional().default(''),
    apiKey: z.string().trim().optional().default(''),
    apiFormat: providerApiFormatSchema.optional().default('openai-chat'),
    useMaxCompletionTokens: z.boolean().optional().default(false),
    customHeaders: z.string().trim().optional().default('')
  })
  .superRefine((input, context) => {
    validateHttpUrl(input.baseUrl, context, ['baseUrl'])
    validateHeadersJson(input.customHeaders, context)
  })

export type CreateCustomProviderInput = z.infer<typeof createCustomProviderInputSchema>

export const createCustomAcpProviderInputSchema = z.object({
  name: z.string().trim().min(1, 'Provider name is required.'),
  acpCommand: z.string().trim().min(1, 'ACP command is required.'),
  acpArgs: z
    .string()
    .trim()
    .optional()
    .default('')
    .transform((value) => value.split(/\s+/).filter(Boolean))
})

export type CreateCustomAcpProviderInput = z.input<typeof createCustomAcpProviderInputSchema>

export const deleteProviderInputSchema = z.object({
  provider: providerIdSchema
})

export type DeleteProviderInput = z.infer<typeof deleteProviderInputSchema>

export const providerConnectionInputSchema = saveProviderInputSchema.extend({
  selectedModel: z.string().trim().optional().default('')
})

export type ProviderConnectionInput = z.infer<typeof providerConnectionInputSchema>

export const saveAppearanceInputSchema = z.object({
  theme: appearanceThemeSchema
})

export type SaveAppearanceInput = z.infer<typeof saveAppearanceInputSchema>
