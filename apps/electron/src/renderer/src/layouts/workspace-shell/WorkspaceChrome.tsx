/**
 * 负责渲染 workspace sidebar 顶部窗口控制和快捷工具区域。
 * 它只连接 windowControls bridge，不直接实现窗口生命周期。
 */

import { MacWindowControls } from '@renderer/components/WindowControls'

import { WorkspaceUtilityActions } from './WorkspaceUtilityActions'

/**
 * 渲染 sidebar 顶部 chrome，并把按钮事件转发到 preload bridge。
 */
export function WorkspaceChrome(): React.JSX.Element {
  const handleClose = (): void => {
    void window.api.windowControls.close()
  }

  const handleMinimize = (): void => {
    void window.api.windowControls.minimize()
  }

  const handleToggleMaximize = (): void => {
    void window.api.windowControls.toggleMaximize()
  }

  return (
    <header className="[-webkit-app-region:drag] flex select-none items-center justify-between border-b border-border px-2.5 py-2">
      <MacWindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
      <WorkspaceUtilityActions />
    </header>
  )
}
