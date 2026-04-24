import type { LucideIcon } from 'lucide-react'

import type { AppSettings } from '@shared/domain/settings'

export type SettingsSectionId =
  | 'general'
  | 'providers'
  | 'agents'
  | 'channels'
  | 'projects'
  | 'chat'
  | 'token-savings'
  | 'quick-prompts'
  | 'memory'
  | 'mcp-servers'
  | 'skills'
  | 'plugins'
  | 'hooks'
  | 'voice'
  | 'text-to-speech'
  | 'people'
  | 'web-search'
  | 'chrome-relay'
  | 'user-interface'
  | 'color-schemes'
  | 'network'
  | 'shortcuts'
  | 'data'
  | 'usage'
  | 'about'

export type SettingsSectionKind = 'general' | 'providers' | 'user-interface' | 'placeholder'

export type SettingsSection = {
  id: SettingsSectionId
  label: string
  title: string
  description: string
  icon: LucideIcon
  kind: SettingsSectionKind
}

export type SettingsState = {
  activeSection: SettingsSectionId
  appSettings: AppSettings
  loadStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  saveStatus: 'idle' | 'saving' | 'succeeded' | 'failed'
  error: string | null
}
