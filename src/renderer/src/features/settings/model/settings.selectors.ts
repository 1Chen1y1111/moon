import type { SettingsSectionId, SettingsState } from './settings.types'

type SettingsSliceState = {
  settings: SettingsState
}

export function selectActiveSettingsSection(state: SettingsSliceState): SettingsSectionId {
  return state.settings.activeSection
}
