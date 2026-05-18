import { z } from 'zod'

export const openSettingsInputSchema = z
  .object({
    section: z.literal('providers').optional()
  })
  .optional()

export type OpenSettingsInput = z.infer<typeof openSettingsInputSchema>

export type WindowState = {
  isMaximized: boolean
}
