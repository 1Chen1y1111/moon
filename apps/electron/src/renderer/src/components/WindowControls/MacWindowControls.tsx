/**
 * 负责渲染仿 macOS 的窗口交通灯按钮。
 * 组件只把点击事件交给调用方，不直接访问 Electron API。
 */

import { Minus, Plus, X } from 'lucide-react'

type MacWindowControlsProps = {
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const trafficLightButtonClassName =
  'group relative flex size-3 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const trafficLightGlyphClassName =
  'pointer-events-none absolute inset-0 size-full p-0.5 opacity-0 transition-opacity group-hover:opacity-70'

/**
 * 渲染关闭、最小化和缩放三个窗口控制按钮。
 */
export function MacWindowControls({
  onClose,
  onMinimize,
  onToggleMaximize
}: MacWindowControlsProps): React.JSX.Element {
  return (
    <div className="[-webkit-app-region:no-drag] relative z-20 flex items-center gap-2.5">
      <button
        type="button"
        aria-label="关闭窗口"
        className={`${trafficLightButtonClassName} bg-[#ff5f57]`}
        onClick={onClose}
      >
        <X
          aria-hidden="true"
          className={trafficLightGlyphClassName}
          data-testid="mac-window-control-close-icon"
          stroke="#171717"
          strokeWidth={3}
        />
      </button>
      <button
        type="button"
        aria-label="最小化窗口"
        className={`${trafficLightButtonClassName} bg-[#ffbd2e]`}
        onClick={onMinimize}
      >
        <Minus
          aria-hidden="true"
          className={trafficLightGlyphClassName}
          data-testid="mac-window-control-minimize-icon"
          stroke="#171717"
          strokeWidth={3}
        />
      </button>
      <button
        type="button"
        aria-label="切换缩放窗口"
        className={`${trafficLightButtonClassName} bg-[#28c840]`}
        onClick={onToggleMaximize}
      >
        <Plus
          aria-hidden="true"
          className={trafficLightGlyphClassName}
          data-testid="mac-window-control-maximize-icon"
          stroke="#171717"
          strokeWidth={3}
        />
      </button>
    </div>
  )
}
