import { ProviderSetupDialog } from '@renderer/features/providers/ProviderSetupDialog'
import { SettingsDialog } from '@renderer/features/settings/SettingsDialog'

import { LeftRail } from './LeftRail'

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-[var(--alma-app-bg)] text-white">
      <LeftRail />
      <main className="min-h-screen flex-1 overflow-auto">{children}</main>
      <ProviderSetupDialog />
      <SettingsDialog />
      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
