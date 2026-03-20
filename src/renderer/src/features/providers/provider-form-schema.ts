import { z } from 'zod'

export const providerFormSchema = z.object({
  provider: z.literal('claude'),
  apiKey: z.string().trim().min(1, 'API key is required.'),
  model: z.string().trim().min(1, 'Model is required.')
})

export type ProviderFormValues = z.infer<typeof providerFormSchema>
