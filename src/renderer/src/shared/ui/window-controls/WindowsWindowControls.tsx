import { Copy, Minus, Square, X } from 'lucide-react'

type WindowsWindowControlsProps = {
  isRestored?: boolean
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const windowsButtonClassName =
  'flex h-8 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function WindowsWindowControls({
  isRestored = false,
  onClose,
  onMinimize,
  onToggleMaximize
}: WindowsWindowControlsProps): React.JSX.Element {
  return (
    <div className="[-webkit-app-region:no-drag] relative z-20 flex items-center">
      <button
        type="button"
        aria-label="最小化窗口"
        className={windowsButtonClassName}
        onClick={onMinimize}
      >
        <Minus aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label={isRestored ? '还原窗口' : '放大窗口'}
        className={windowsButtonClassName}
        onClick={onToggleMaximize}
      >
        {isRestored ? (
          <Copy aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        ) : (
          <Square aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        aria-label="关闭窗口"
        className={windowsButtonClassName}
        onClick={onClose}
      >
        <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}
