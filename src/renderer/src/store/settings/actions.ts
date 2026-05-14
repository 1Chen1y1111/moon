import type { AppSettings } from '@shared/domain/settings'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@shared/domain/settings-validation'

import type { SettingsSectionId } from '@renderer/entities/settings/model/types'
import type { StoreSetter } from '@renderer/store/types'

import type { SettingsStore } from './store'
import type { SettingsState } from './types'

type Setter = StoreSetter<SettingsStore>

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '操作失败'
}

export class SettingsActionImpl {
  readonly #set: Setter

  constructor(set: Setter, _get: () => SettingsStore, _api?: unknown) {
    void _get
    void _api
    this.#set = set
  }

  applyAppSettings = (appSettings: AppSettings): void => {
    this.internal_applyAppSettings(appSettings)
  }

  setActiveSettingsSection = (activeSection: SettingsSectionId): void => {
    this.internal_setActiveSettingsSection(activeSection)
  }

  loadAppSettings = (): Promise<AppSettings> => this.internal_loadAppSettings()

  createCustomProviderSettings = (input: CreateCustomProviderInput): Promise<AppSettings> =>
    this.internal_createCustomProviderSettings(input)

  createCustomAcpProviderSettings = (
    input: CreateCustomAcpProviderInput
  ): Promise<AppSettings> => this.internal_createCustomAcpProviderSettings(input)

  saveProviderSettings = (input: SaveProviderInput): Promise<AppSettings> =>
    this.internal_saveProviderSettings(input)

  deleteProviderSettings = (input: DeleteProviderInput): Promise<AppSettings> =>
    this.internal_deleteProviderSettings(input)

  fetchProviderModelsSettings = (input: ProviderConnectionInput): Promise<AppSettings> =>
    this.internal_fetchProviderModelsSettings(input)

  saveAppearanceSettings = (input: SaveAppearanceInput): Promise<AppSettings> =>
    this.internal_saveAppearanceSettings(input)

  internal_applyAppSettings = (appSettings: AppSettings): void => {
    this.internal_dispatchSettings({ appSettings })
  }

  internal_setActiveSettingsSection = (activeSection: SettingsSectionId): void => {
    this.internal_dispatchSettings({ activeSection })
  }

  internal_loadAppSettings = async (): Promise<AppSettings> => {
    this.internal_dispatchSettings({ loadStatus: 'loading', error: null })

    try {
      const appSettings = await window.api.settings.get()
      this.internal_dispatchSettings({ loadStatus: 'succeeded', appSettings })
      return appSettings
    } catch (error) {
      this.internal_dispatchSettings({ loadStatus: 'failed', error: getErrorMessage(error) })
      throw error
    }
  }

  internal_createCustomProviderSettings = (
    input: CreateCustomProviderInput
  ): Promise<AppSettings> =>
    this.#saveSettings(() => window.api.settings.createCustomProvider(input))

  internal_createCustomAcpProviderSettings = (
    input: CreateCustomAcpProviderInput
  ): Promise<AppSettings> =>
    this.#saveSettings(() => window.api.settings.createCustomAcpProvider(input))

  internal_saveProviderSettings = (input: SaveProviderInput): Promise<AppSettings> =>
    this.#saveSettings(() => window.api.settings.saveProvider(input))

  internal_deleteProviderSettings = (input: DeleteProviderInput): Promise<AppSettings> =>
    this.#saveSettings(() => window.api.settings.deleteProvider(input))

  internal_fetchProviderModelsSettings = (input: ProviderConnectionInput): Promise<AppSettings> =>
    this.#saveSettings(() => window.api.settings.fetchProviderModels(input))

  internal_saveAppearanceSettings = (input: SaveAppearanceInput): Promise<AppSettings> =>
    this.#saveSettings(() => window.api.settings.saveAppearance(input))

  internal_dispatchSettings = (state: Partial<SettingsState>): void => {
    this.#set(state)
  }

  async #saveSettings(operation: () => Promise<AppSettings>): Promise<AppSettings> {
    this.internal_dispatchSettings({ saveStatus: 'saving', error: null })

    try {
      const appSettings = await operation()
      this.internal_dispatchSettings({ saveStatus: 'succeeded', appSettings })
      return appSettings
    } catch (error) {
      this.internal_dispatchSettings({ saveStatus: 'failed', error: getErrorMessage(error) })
      throw error
    }
  }
}

export type SettingsAction = Pick<SettingsActionImpl, keyof SettingsActionImpl>

export const createSettingsSlice = (
  set: Setter,
  get: () => SettingsStore,
  api?: unknown
): SettingsActionImpl => new SettingsActionImpl(set, get, api)
