export function SettingsWindowShell({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      data-testid="settings-window-shell"
      className="flex h-screen overflow-hidden bg-moon-app-bg px-2 py-2 text-moon-text-primary"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
