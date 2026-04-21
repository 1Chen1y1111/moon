export function SettingsWindowShell({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      data-testid="settings-window-shell"
      className="flex h-screen overflow-hidden bg-moon-app-bg px-moon-md py-moon-md text-moon-text-primary"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
