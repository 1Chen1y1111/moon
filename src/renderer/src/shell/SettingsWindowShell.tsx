export function SettingsWindowShell({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="h-screen overflow-hidden bg-[#2b313c] px-2 py-2 text-[#eef2f7]">
      <div className="flex h-full min-h-0 w-full">{children}</div>
    </div>
  )
}
