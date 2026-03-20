import { z } from 'zod'

import { ipcChannels } from './channels'

export const providerIdSchema = z.literal('claude')

export type ProviderId = z.infer<typeof providerIdSchema>

export const providerDraftSchema = z.object({
  apiKey: z.string(),
  model: z.string()
})

export type ProviderDraft = z.infer<typeof providerDraftSchema>

export const appSettingsSchema = z.object({
  providerDrafts: z.object({
    claude: providerDraftSchema
  })
})

export type AppSettings = z.infer<typeof appSettingsSchema>

export const saveProviderDraftInputSchema = z.object({
  provider: providerIdSchema,
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1)
})

export type SaveProviderDraftInput = z.infer<typeof saveProviderDraftInputSchema>

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

export type AppIpcContractMap = {
  [ipcChannels.settings.get]: {
    request: undefined
    response: AppSettings
  }
  [ipcChannels.settings.saveProvider]: {
    request: SaveProviderDraftInput
    response: AppSettings
  }
}

export type MoonApi = {
  settings: {
    get: () => Promise<AppSettings>
    saveProvider: (input: SaveProviderDraftInput) => Promise<AppSettings>
  }
}
