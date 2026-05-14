import type { AppSettings } from '@shared/domain/settings'

import type { SettingsSectionId } from '@renderer/entities/settings/model/types'

import type { SettingsState } from './types'

export function selectActiveSettingsSection(state: SettingsState): SettingsSectionId {
  return state.activeSection
}

export function selectAppSettings(state: SettingsState): AppSettings {
  return state.appSettings
}

export function selectSettingsSaveStatus(state: SettingsState): SettingsState['saveStatus'] {
  return state.saveStatus
}

export function selectSettingsLoadStatus(state: SettingsState): SettingsState['loadStatus'] {
  return state.loadStatus
}

export function selectSettingsError(state: SettingsState): string | null {
  return state.error
}
