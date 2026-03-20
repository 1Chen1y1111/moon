import type { AppSettings, SaveProviderDraftInput } from '../ipc/contracts'
import { saveProviderDraftInputSchema } from '../ipc/contracts'
import type { SettingsRepository } from '../repositories/settings-repository'

export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  getSettings(): AppSettings {
    return this.settingsRepository.getSettings()
  }

  saveProvider(input: SaveProviderDraftInput): AppSettings {
    const parsedInput = saveProviderDraftInputSchema.parse(input)

    return this.settingsRepository.saveProviderDraft(parsedInput.provider, {
      apiKey: parsedInput.apiKey,
      model: parsedInput.model
    })
  }
}
