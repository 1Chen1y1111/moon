export function SettingsShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-h-screen bg-[#2b313c] text-[#eef2f7]">
      <div className="min-h-screen p-2">{children}</div>
    </div>
  )
}
