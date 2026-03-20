import { LeftRail } from './LeftRail'
import { WindowChrome } from './WindowChrome'

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <WindowChrome />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <div id="modal-root" />
      <div id="popover-root" />
    </div>
  )
}
