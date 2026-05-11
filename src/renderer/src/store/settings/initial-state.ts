import { createDefaultAppSettings } from '@shared/domain/settings'

import type { SettingsState } from './types'

export function createInitialSettingsState(): SettingsState {
  return {
    activeSection: 'general',
    appSettings: createDefaultAppSettings(),
    loadStatus: 'idle',
    saveStatus: 'idle',
    error: null
  }
}

export const initialSettingsState = createInitialSettingsState()
