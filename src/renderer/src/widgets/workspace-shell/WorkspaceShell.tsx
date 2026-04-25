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
    <div className="flex min-h-screen bg-moon-bg-canvas text-moon-text-primary">
      <WorkspaceSidebar />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <div
          data-testid="workspace-content-drag-region"
          className="moon-window-drag-region flex h-moon-chrome shrink-0 items-center justify-end px-moon-panel"
        >
          <WindowsWindowControls
            onClose={handleClose}
            onMinimize={handleMinimize}
            onToggleMaximize={handleToggleMaximize}
          />
        </div>
        <div className="moon-window-no-drag flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </main>
      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
