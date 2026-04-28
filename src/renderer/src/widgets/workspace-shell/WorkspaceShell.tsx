import { WindowsWindowControls } from '@renderer/shared/ui/window-controls'

import { WorkspaceSidebar } from './WorkspaceSidebar'

export function WorkspaceShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const handleClose = (): void => {
    void window.api.windowControls.close()
  }

  const handleMinimize = (): void => {
    void window.api.windowControls.minimize()
  }

  const handleToggleMaximize = (): void => {
    void window.api.windowControls.toggleMaximize()
  }

  return (
    <div className="flex w-full h-screen bg-background text-foreground">
      <WorkspaceSidebar />

      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <div
          data-testid="workspace-content-drag-region"
          className="[-webkit-app-region:drag] select-none flex h-14 shrink-0 items-center justify-end px-6"
        >
          <WindowsWindowControls
            onClose={handleClose}
            onMinimize={handleMinimize}
            onToggleMaximize={handleToggleMaximize}
          />
        </div>
        <div className="[-webkit-app-region:no-drag] flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </main>

      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
