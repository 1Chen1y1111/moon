import type { AppSettings } from '@shared/domain/settings'

import type { SettingsSectionId } from '@renderer/entities/settings/model/settings.types'

export type SettingsState = {
  activeSection: SettingsSectionId
  appSettings: AppSettings
  loadStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  saveStatus: 'idle' | 'saving' | 'succeeded' | 'failed'
  error: string | null
}
