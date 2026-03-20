import { useUiStore } from '@renderer/lib/stores/ui-store'

export function LeftRail(): React.JSX.Element {
  const openSettingsDialog = useUiStore((state) => state.openSettingsDialog)

  return (
    <aside
      aria-label="Workspace navigation"
      className="flex h-full w-16 flex-col items-center border-r border-zinc-800 bg-zinc-950 py-3"
    >
      <div role="group" aria-label="Primary actions" className="flex flex-col items-center gap-2">
        <button
          type="button"
          aria-label="New Chat"
          className="h-10 w-10 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100"
        >
          N
        </button>
      </div>
      <div
        role="group"
        aria-label="Secondary actions"
        className="mt-auto flex flex-col items-center gap-2"
      >
        <button
          type="button"
          aria-label="Settings"
          className="h-10 w-10 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100"
          onClick={openSettingsDialog}
        >
          S
        </button>
      </div>
    </aside>
  )
}
