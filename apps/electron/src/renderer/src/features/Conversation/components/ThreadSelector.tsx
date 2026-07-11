/**
 * 负责在同一 topic 的 Moon threads 之间切换。
 * 组件只展示 thread 选项，消息 lineage 的读取由上层状态动作触发。
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@moon/ui/ui/select'
import type { ThreadRecord } from '@moon/shared/domain/chat'
import { GitBranch } from 'lucide-react'

export type ThreadSelectorProps = {
  activeThreadId: string | null
  disabled?: boolean
  threads: ThreadRecord[]
  onThreadChange: (threadId: string) => void
}

/**
 * 在存在多个 thread 时显示紧凑选择器，并把选择结果交给 chat store。
 */
export function ThreadSelector({
  activeThreadId,
  disabled,
  threads,
  onThreadChange
}: ThreadSelectorProps): React.JSX.Element | null {
  if (activeThreadId === null || threads.length <= 1) {
    return null
  }

  return (
    <Select disabled={disabled} value={activeThreadId} onValueChange={onThreadChange}>
      <SelectTrigger
        aria-label="切换分支"
        className="max-w-52 border-border bg-secondary text-xs shadow-none"
        size="sm"
      >
        <GitBranch aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {threads.map((thread, index) => (
          <SelectItem key={thread.id} value={thread.id}>
            {thread.title?.trim() || `分支 ${index + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
