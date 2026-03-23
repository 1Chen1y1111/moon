import { SettingsDialog } from '@renderer/features/settings/SettingsDialog'
import { SettingsShell } from '@renderer/shell/SettingsShell'

export function SettingsPage(): React.JSX.Element {
  return (
    <SettingsShell>
      <SettingsDialog />
    </SettingsShell>
  )
}
