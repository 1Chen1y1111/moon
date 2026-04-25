import { WorkspaceSidebar } from './WorkspaceSidebar'

export function WorkspaceShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-moon-bg-canvas text-moon-text-primary">
      <WorkspaceSidebar />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <div
          aria-hidden="true"
          data-testid="workspace-content-drag-region"
          className="moon-window-drag-region h-moon-chrome shrink-0"
        />
        <div className="moon-window-no-drag flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </main>
      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
