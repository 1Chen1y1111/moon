import type { ChatInputRuntimeInfo } from '../ChatInput.types'

export function RuntimeBar({
  runtimeInfo
}: {
  runtimeInfo?: ChatInputRuntimeInfo
}): React.JSX.Element | null {
  if (runtimeInfo === undefined) {
    return null
  }

  const environmentLabel = [runtimeInfo.providerLabel, runtimeInfo.modelLabel]
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
