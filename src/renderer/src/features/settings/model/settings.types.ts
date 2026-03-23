import type { LucideIcon } from 'lucide-react'

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

export type SettingsSectionKind = 'general' | 'placeholder'

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
  isOpen: boolean
}
