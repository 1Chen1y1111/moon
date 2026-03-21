import { WindowChrome } from './WindowChrome'

export function LeftRail(): React.JSX.Element {
  return (
    <aside aria-label="Workspace navigation" className="flex w-[220px] shrink-0 p-2">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-moon-sidebar-border bg-moon-sidebar-bg shadow-[0_28px_80px_rgba(5,8,15,0.45)]">
        <WindowChrome />
        <div
          role="group"
          aria-label="Primary actions"
          className="flex flex-1 flex-col gap-2 px-3 py-4"
        >
          <button
            type="button"
            className="flex h-11 items-center rounded-2xl px-4 text-left text-sm font-medium text-moon-text-secondary transition-colors hover:bg-white/[0.03] hover:text-moon-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            清除历史
          </button>
          <button
            type="button"
            className="flex h-11 items-center rounded-2xl border border-white/6 bg-white/[0.04] px-4 text-left text-sm font-medium text-moon-text-primary transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            新建聊天
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-moon-sidebar-border px-3 pb-3 pt-2.5">
          <button
            type="button"
            aria-label="更多操作"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/6 bg-white/[0.03] text-moon-text-secondary transition-colors hover:bg-white/[0.06] hover:text-moon-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
              <circle cx="4" cy="8" r="1.1" />
              <circle cx="8" cy="8" r="1.1" />
              <circle cx="12" cy="8" r="1.1" />
            </svg>
          </button>

          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full bg-moon-accent px-4 text-sm font-semibold text-moon-accent-text transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            更新
          </button>
        </div>
      </div>
    </aside>
  )
}
