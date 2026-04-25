import { Copy, Minus, Square, X } from 'lucide-react'

type WindowsWindowControlsProps = {
  isRestored?: boolean
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const windowsButtonClassName =
  'flex h-moon-window-button-y w-moon-window-button-x items-center justify-center rounded-moon-control text-moon-text-secondary transition-colors hover:bg-moon-button-ghost-bg-hover hover:text-moon-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-ring-subtle'

export function WindowsWindowControls({
  isRestored = false,
  onClose,
  onMinimize,
  onToggleMaximize
}: WindowsWindowControlsProps): React.JSX.Element {
  return (
    <div className="moon-window-no-drag relative z-20 flex items-center">
      <button
        type="button"
        aria-label="最小化窗口"
        className={windowsButtonClassName}
        onClick={onMinimize}
      >
        <Minus aria-hidden="true" className="size-moon-icon-sm" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={isRestored ? '还原窗口' : '放大窗口'}
        className={windowsButtonClassName}
        onClick={onToggleMaximize}
      >
        {isRestored ? (
          <Copy aria-hidden="true" className="size-moon-icon-sm" strokeWidth={1.75} />
        ) : (
          <Square aria-hidden="true" className="size-moon-icon-sm" strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        aria-label="关闭窗口"
        className={windowsButtonClassName}
        onClick={onClose}
      >
        <X aria-hidden="true" className="size-moon-icon" strokeWidth={1.75} />
      </button>
    </div>
  )
}
