import { settingsSections, type SettingsSectionId } from '@renderer/entities/settings'
import { GeneralSettingsSection } from '@renderer/features/GeneralSettings'
import {
  ProviderSettingsSection,
  type ProviderSettingsFooterAction
} from '@renderer/features/ProviderSettings'
import { UserInterfaceSettingsSection } from '@renderer/features/UserInterface'

import { PlaceholderSettingsSection } from './PlaceholderSettingsSection'

type SettingsContentProps = {
  activeSection: SettingsSectionId
  onProviderFooterActionChange?: (action: ProviderSettingsFooterAction) => void
}

export function SettingsContent({
  activeSection,
  onProviderFooterActionChange
}: SettingsContentProps): React.JSX.Element {
  const activeMeta = settingsSections.find((section) => section.id === activeSection)

  if (activeMeta?.kind === 'general') {
    return <GeneralSettingsSection />
  }

  if (activeMeta?.kind === 'providers') {
    return <ProviderSettingsSection onFooterActionChange={onProviderFooterActionChange} />
  }

  if (activeMeta?.kind === 'user-interface') {
    return <UserInterfaceSettingsSection />
  }

  return <PlaceholderSettingsSection section={activeMeta} />
}
