type MacWindowControlsProps = {
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

const trafficLightButtonClassName =
  'h-3 w-3 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-ring-subtle'

export function MacWindowControls({
  onClose,
  onMinimize,
  onToggleMaximize
}: MacWindowControlsProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="关闭窗口"
        className={`${trafficLightButtonClassName} bg-moon-window-control-close`}
        onClick={onClose}
      />
      <button
        type="button"
        aria-label="最小化窗口"
        className={`${trafficLightButtonClassName} bg-moon-window-control-minimize`}
        onClick={onMinimize}
      />
      <button
        type="button"
        aria-label="切换缩放窗口"
        className={`${trafficLightButtonClassName} bg-moon-window-control-maximize`}
        onClick={onToggleMaximize}
      />
    </div>
  )
}
