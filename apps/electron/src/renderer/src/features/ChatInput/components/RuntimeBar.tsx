/**
 * 负责渲染聊天输入框下方的运行环境和发送状态。
 * 它只展示上层传入的 provider、model、workspace 与快捷键信息。
 */

import type { ChatInputRuntimeInfo } from '../types'

/**
 * 展示当前输入框绑定的运行环境和发送状态。
 */
export function RuntimeBar({
  runtimeInfo
}: {
  runtimeInfo?: ChatInputRuntimeInfo
}): React.JSX.Element | null {
  if (runtimeInfo === undefined) {
    return null
  }

  const environmentLabel = [
    runtimeInfo.providerLabel,
    runtimeInfo.modelLabel,
    runtimeInfo.workspaceLabel
  ]
    .filter((label): label is string => label !== undefined && label.length > 0)
    .join(' · ')
  const statusLabel = [runtimeInfo.statusLabel, runtimeInfo.shortcutLabel]
    .filter((label): label is string => label !== undefined && label.length > 0)
    .join(' · ')

  if (environmentLabel.length === 0 && statusLabel.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs leading-5 text-muted-foreground">
      <span className="min-w-0 truncate">{environmentLabel}</span>
      <span className="shrink-0">{statusLabel}</span>
    </div>
  )
}
