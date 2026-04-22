import { Minus, Plus, X } from 'lucide-react'

type MacWindowControlsProps = {
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const trafficLightButtonClassName =
  'group relative flex size-moon-traffic-light items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-ring-subtle'

const trafficLightGlyphClassName =
  'pointer-events-none absolute inset-0 size-full p-moon-traffic-light-icon opacity-0 transition-opacity group-hover:opacity-70'

export function MacWindowControls({
  onClose,
  onMinimize,
  onToggleMaximize
}: MacWindowControlsProps): React.JSX.Element {
  return (
    <div className="moon-window-no-drag relative z-20 flex items-center gap-moon-md">
      <button
        type="button"
        aria-label="关闭窗口"
        className={`${trafficLightButtonClassName} bg-moon-window-control-close`}
        onClick={onClose}
      >
        <X
          aria-hidden="true"
          className={trafficLightGlyphClassName}
          data-testid="mac-window-control-close-icon"
          stroke="var(--moon-window-control-glyph)"
          strokeWidth={3}
        />
      </button>
      <button
        type="button"
        aria-label="最小化窗口"
        className={`${trafficLightButtonClassName} bg-moon-window-control-minimize`}
        onClick={onMinimize}
      >
        <Minus
          aria-hidden="true"
          className={trafficLightGlyphClassName}
          data-testid="mac-window-control-minimize-icon"
          stroke="var(--moon-window-control-glyph)"
          strokeWidth={3}
        />
      </button>
      <button
        type="button"
        aria-label="切换缩放窗口"
        className={`${trafficLightButtonClassName} bg-moon-window-control-maximize`}
        onClick={onToggleMaximize}
      >
        <Plus
          aria-hidden="true"
          className={trafficLightGlyphClassName}
          data-testid="mac-window-control-maximize-icon"
          stroke="var(--moon-window-control-glyph)"
          strokeWidth={3}
        />
      </button>
    </div>
  )
}
