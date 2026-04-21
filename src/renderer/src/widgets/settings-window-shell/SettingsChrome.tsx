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
    <header className="flex h-moon-chrome shrink-0 items-center justify-between border-b border-moon-sidebar-border px-moon-panel">
      <h1 className="font-moon-serif text-moon-h1-section font-moon-title leading-moon-h1-section text-moon-text-primary">
        {title}
      </h1>
      <WindowsWindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
    </header>
  )
}
