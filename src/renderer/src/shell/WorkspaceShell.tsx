import { ProviderSetupDialog } from '@renderer/features/providers/ProviderSetupDialog'

import { WorkspaceSidebar } from './WorkspaceSidebar'

export function WorkspaceShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-moon-app-bg text-moon-text-primary">
      <WorkspaceSidebar />
      <main className="flex min-h-screen min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</div>
      </main>
      <ProviderSetupDialog />
      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
