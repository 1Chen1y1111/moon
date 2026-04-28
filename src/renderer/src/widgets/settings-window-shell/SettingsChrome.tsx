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
    <header className="[-webkit-app-region:drag] select-none flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
      <h1 className="font-serif text-2xl font-medium leading-8 text-foreground">{title}</h1>
      <WindowsWindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
    </header>
  )
}
