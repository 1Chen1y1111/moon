import { Copy, Minus, Square, X } from 'lucide-react'

type WindowsWindowControlsProps = {
  isRestored?: boolean
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const windowsButtonClassName =
  'flex h-8 w-10 items-center justify-center rounded-md text-moon-text-secondary transition-colors hover:bg-moon-button-ghost-bg-hover hover:text-moon-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-ring-subtle'

export function WindowsWindowControls({
  isRestored = false,
  onClose,
  onMinimize,
  onToggleMaximize
}: WindowsWindowControlsProps): React.JSX.Element {
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="最小化窗口"
        className={windowsButtonClassName}
        onClick={onMinimize}
      >
        <Minus aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={isRestored ? '还原窗口' : '放大窗口'}
        className={windowsButtonClassName}
        onClick={onToggleMaximize}
      >
        {isRestored ? (
          <Copy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <Square aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        aria-label="关闭窗口"
        className={`${windowsButtonClassName} hover:bg-moon-state-danger hover:text-moon-fg-inverse`}
        onClick={onClose}
      >
        <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}
