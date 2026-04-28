import { MacWindowControls } from '@renderer/shared/ui/window-controls'

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
    <header className="[-webkit-app-region:drag] select-none flex items-center justify-between border-b border-border p-3">
      <MacWindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
      <WorkspaceUtilityActions />
    </header>
  )
}
