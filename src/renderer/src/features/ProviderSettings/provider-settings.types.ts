import type { ProviderApiFormat } from '@shared/domain/provider'
import type { SaveProviderInput } from '@shared/domain/settings-validation'

export type ProviderDraft = SaveProviderInput

export type ProviderFormErrors = Partial<Record<keyof SaveProviderInput, string>>

export type CustomProviderInput = {
  name: string
  baseUrl: string
  apiKey: string
  apiFormat: ProviderApiFormat
  useMaxCompletionTokens: boolean
  customHeaders: string
}

export type CustomAcpProviderInput = {
  name: string
  acpCommand: string
  acpArgs: string
}
