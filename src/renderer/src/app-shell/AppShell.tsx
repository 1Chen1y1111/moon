import { ProviderSetupDialog } from '@renderer/features/providers/ProviderSetupDialog'
import { SettingsDialog } from '@renderer/features/settings/SettingsDialog'

import { LeftRail } from './LeftRail'

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-moon-app-bg text-white">
      <LeftRail />
      <main className="flex min-h-screen min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</div>
      </main>
      <ProviderSetupDialog />
      <SettingsDialog />
      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
