import { MacWindowControls } from './MacWindowControls'
import { WorkspaceUtilityActions } from './WorkspaceUtilityActions'

export function WorkspaceChrome(): React.JSX.Element {
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
    <header className="flex items-center justify-between border-b border-moon-sidebar-border p-2">
      <MacWindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
      <WorkspaceUtilityActions />
    </header>
  )
}
