import { settingsSections, type SettingsSectionId } from '@renderer/entities/settings'
import { GeneralSettingsSection } from '@renderer/features/general-settings'
import { ProviderSettingsSection } from '@renderer/features/provider-settings'
import { UserInterfaceSettingsSection } from '@renderer/features/user-interface'

import { PlaceholderSettingsSection } from './PlaceholderSettingsSection'

type SettingsContentProps = {
  activeSection: SettingsSectionId
}

export function SettingsContent({ activeSection }: SettingsContentProps): React.JSX.Element {
  const activeMeta = settingsSections.find((section) => section.id === activeSection)

  if (activeMeta?.kind === 'general') {
    return <GeneralSettingsSection />
  }

  if (activeMeta?.kind === 'providers') {
    return <ProviderSettingsSection />
  }

  if (activeMeta?.kind === 'user-interface') {
    return <UserInterfaceSettingsSection />
  }

  return <PlaceholderSettingsSection section={activeMeta} />
}
