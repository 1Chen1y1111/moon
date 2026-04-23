import type { SaveAppearanceInput, SaveProviderInput } from '@ipc/contracts'
import { saveAppearanceInputSchema, saveProviderInputSchema } from '@ipc/contracts'
import type { AppSettings } from '../../shared/domain/settings'
import type { SettingsRepository } from '../repositories/settings-repository'

export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async getSettings(): Promise<AppSettings> {
    return this.settingsRepository.getSettings()
  }

  async saveProvider(input: SaveProviderInput): Promise<AppSettings> {
    const parsedInput = saveProviderInputSchema.parse(input)

    return this.settingsRepository.saveProvider(parsedInput.provider, {
      apiKey: parsedInput.apiKey,
      model: parsedInput.model,
      baseUrl: parsedInput.provider === 'openai-compatible' ? parsedInput.baseUrl : ''
    })
  }

  async saveAppearance(input: SaveAppearanceInput): Promise<AppSettings> {
    const parsedInput = saveAppearanceInputSchema.parse(input)

    return this.settingsRepository.saveAppearance(parsedInput)
  }
}
