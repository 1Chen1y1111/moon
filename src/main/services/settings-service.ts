import type { AppSettings, SaveAppearanceInput, SaveProviderInput } from '@ipc/contracts'
import { saveAppearanceInputSchema, saveProviderInputSchema } from '@ipc/contracts'
import type { SettingsRepository } from '../repositories/settings-repository'

export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  getSettings(): AppSettings {
    return this.settingsRepository.getSettings()
  }

  saveProvider(input: SaveProviderInput): AppSettings {
    const parsedInput = saveProviderInputSchema.parse(input)

    return this.settingsRepository.saveProvider(parsedInput.provider, {
      apiKey: parsedInput.apiKey,
      model: parsedInput.model,
      baseUrl: parsedInput.provider === 'openai-compatible' ? parsedInput.baseUrl : ''
    })
  }

  saveAppearance(input: SaveAppearanceInput): AppSettings {
    const parsedInput = saveAppearanceInputSchema.parse(input)

    return this.settingsRepository.saveAppearance(parsedInput)
  }
}
