import type { AppSettings } from '@ipc/contracts'

import type { SettingsSectionId, SettingsState } from './settings.types'

type SettingsSliceState = {
  settings: SettingsState
}

export function selectActiveSettingsSection(state: SettingsSliceState): SettingsSectionId {
  return state.settings.activeSection
}

export function selectAppSettings(state: SettingsSliceState): AppSettings {
  return state.settings.appSettings
}

export function selectSettingsSaveStatus(state: SettingsSliceState): SettingsState['saveStatus'] {
  return state.settings.saveStatus
}

export function selectSettingsError(state: SettingsSliceState): string | null {
  return state.settings.error
}
