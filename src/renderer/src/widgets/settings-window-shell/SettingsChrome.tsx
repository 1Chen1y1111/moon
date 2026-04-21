import { WindowsWindowControls } from '@renderer/shared/ui/window-controls'

type SettingsChromeProps = {
  title: string
}

export function SettingsChrome({ title }: SettingsChromeProps): React.JSX.Element {
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
    <header className="flex h-15 shrink-0 items-center justify-between border-b border-moon-sidebar-border px-6">
      <h1 className="text-[2rem] font-semibold tracking-tight text-moon-text-primary">{title}</h1>
      <WindowsWindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
    </header>
  )
}
