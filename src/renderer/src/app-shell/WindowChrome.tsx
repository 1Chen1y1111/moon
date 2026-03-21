const utilityButtonClassName =
  'flex h-8 w-8 cursor-default items-center justify-center rounded-full border border-white/6 bg-white/[0.03] text-[var(--alma-text-secondary)] opacity-100'

export function WindowChrome(): React.JSX.Element {
  return (
    <header className="flex items-center justify-between border-b border-[color:var(--alma-sidebar-border)] px-4 py-3">
      <div aria-hidden="true" className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="搜索"
          aria-disabled="true"
          disabled
          className={utilityButtonClassName}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 fill-none stroke-current"
          >
            <circle cx="7" cy="7" r="3.75" strokeWidth="1.25" />
            <path d="M10.2 10.2 13 13" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="筛选"
          aria-disabled="true"
          disabled
          className={utilityButtonClassName}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 fill-none stroke-current"
          >
            <path
              d="M3 4.25h10M5.25 8h5.5M6.75 11.75h2.5"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label="布局"
          aria-disabled="true"
          disabled
          className={utilityButtonClassName}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
            <path d="M2.75 3.25A.5.5 0 0 1 3.25 2.75h4.5a.5.5 0 0 1 .5.5v4.5a.5.5 0 0 1-.5.5h-4.5a.5.5 0 0 1-.5-.5zm5 0a.5.5 0 0 1 .5-.5h4.5a.5.5 0 0 1 .5.5v1.75a.5.5 0 0 1-.5.5h-4.5a.5.5 0 0 1-.5-.5zm0 4.25a.5.5 0 0 1 .5-.5h4.5a.5.5 0 0 1 .5.5v5.25a.5.5 0 0 1-.5.5h-4.5a.5.5 0 0 1-.5-.5zm-5 1.25a.5.5 0 0 1 .5-.5h4.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-4.5a.5.5 0 0 1-.5-.5z" />
          </svg>
        </button>
      </div>
    </header>
  )
}
