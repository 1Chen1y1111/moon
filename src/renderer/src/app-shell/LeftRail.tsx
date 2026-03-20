export function LeftRail(): React.JSX.Element {
  return (
    <aside className="flex w-16 flex-col items-center gap-2 border-r border-zinc-800 bg-zinc-950 py-3">
      <button
        type="button"
        aria-label="New Chat"
        className="h-10 w-10 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100"
      >
        N
      </button>
      <button
        type="button"
        aria-label="Settings"
        className="h-10 w-10 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100"
      >
        S
      </button>
    </aside>
  )
}
