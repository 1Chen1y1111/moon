export { SettingsShellContent as SettingsDialog } from './components/SettingsShellContent'
export { settingsSections } from './config/settings-sections'
export {
  closeSettingsDialog,
  openSettingsDialog,
  setActiveSettingsSection,
  settingsReducer
} from './model/slices'
export { selectActiveSettingsSection, selectIsSettingsDialogOpen } from './model/settings.selectors'
export type { SettingsSection, SettingsSectionId, SettingsState } from './model/settings.types'
