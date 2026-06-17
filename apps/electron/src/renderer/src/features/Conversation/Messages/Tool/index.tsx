/**
 * 负责渲染 assistant 消息中的工具调用状态和人工审批入口。
 * 它只调用 renderer chat store 暴露的审批动作，不直接访问 IPC。
 */

import { useState } from 'react'

import { Check, Wrench, X } from 'lucide-react'

import { useChatStore } from '@renderer/store/chat'
import { cn } from '@moon/ui/lib/utils'
import type { ToolInvocationRecord } from '@moon/shared/domain/chat'

function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined
  }

  const field = (value as Record<string, unknown>)[key]

  return typeof field === 'string' && field.trim().length > 0 ? field : undefined
}

function readBooleanField(value: unknown, key: string): boolean | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined
  }

  const field = (value as Record<string, unknown>)[key]

  return typeof field === 'boolean' ? field : undefined
}

function isPermissionToolInvocation(toolInvocation: ToolInvocationRecord): boolean {
  return (
    readStringField(toolInvocation.intervention, 'type') === 'permission_request' ||
    readBooleanField(toolInvocation.result, 'approved') === true
  )
}

function formatToolStatus(toolInvocation: ToolInvocationRecord): string {
  if (toolInvocation.status === 'waiting_for_human') {
    return '等待确认'
  }

  if (toolInvocation.status === 'running') {
    return '运行中'
  }

  if (toolInvocation.status === 'done') {
    return isPermissionToolInvocation(toolInvocation) ? '已允许' : '已完成'
  }

  if (toolInvocation.status === 'rejected') {
    return '已拒绝'
  }

  return '失败'
}

function getToolDescription(toolInvocation: ToolInvocationRecord): string | undefined {
  return (
    readStringField(toolInvocation.intervention, 'description') ??
    readStringField(toolInvocation.arguments, 'description')
  )
}

function getToolCommand(toolInvocation: ToolInvocationRecord): string | undefined {
  return (
    readStringField(toolInvocation.intervention, 'command') ??
    readStringField(toolInvocation.arguments, 'command')
  )
}

/**
 * 渲染等待人工确认时的允许/拒绝操作按钮。
 */
function ToolApprovalActions({
  disabled,
  onApprove,
  onReject
}: {
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}): React.JSX.Element {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium leading-4 text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
        onClick={onApprove}
      >
        <Check aria-hidden="true" className="size-3" />
        允许
      </button>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium leading-4 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
        onClick={onReject}
      >
        <X aria-hidden="true" className="size-3" />
        拒绝
      </button>
    </div>
  )
}

/**
 * 渲染单个工具调用卡片，并在等待确认时触发 chat store 审批动作。
 */
function ToolInvocationItem({
  toolInvocation
}: {
  toolInvocation: ToolInvocationRecord
}): React.JSX.Element {
  const approveChatToolCall = useChatStore((state) => state.approveChatToolCall)
  const rejectChatToolCall = useChatStore((state) => state.rejectChatToolCall)
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false)
  const description = getToolDescription(toolInvocation)
  const command = getToolCommand(toolInvocation)
  const isWaitingForHuman = toolInvocation.status === 'waiting_for_human'

  const approveTool = async (): Promise<void> => {
    setIsSubmittingDecision(true)

    try {
      await approveChatToolCall({ toolInvocationId: toolInvocation.id })
    } finally {
      setIsSubmittingDecision(false)
    }
  }

  const rejectTool = async (): Promise<void> => {
    setIsSubmittingDecision(true)

    try {
      await rejectChatToolCall({ toolInvocationId: toolInvocation.id })
    } finally {
      setIsSubmittingDecision(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-background/70 px-2 py-1.5 text-xs leading-5',
        isWaitingForHuman && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Wrench aria-hidden="true" className="size-3.5" />
        <span className="truncate">{toolInvocation.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {formatToolStatus(toolInvocation)}
        </span>
      </div>
      {description === undefined ? null : (
        <div className="mt-1 text-muted-foreground">{description}</div>
      )}
      {command === undefined ? null : (
        <code className="mt-1 block max-h-24 overflow-auto rounded bg-muted px-1.5 py-1 font-mono text-[11px] leading-4 text-foreground">
          {command}
        </code>
      )}
      {toolInvocation.error === undefined || toolInvocation.error === null ? null : (
        <div className="mt-1 text-destructive">{toolInvocation.error}</div>
      )}
      {isWaitingForHuman ? (
        <ToolApprovalActions
          disabled={isSubmittingDecision}
          onApprove={() => {
            void approveTool()
          }}
          onReject={() => {
            void rejectTool()
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * 渲染消息内的工具调用列表，等待人工确认时显示审批按钮。
 */
export function ToolInvocationList({
  toolInvocations
}: {
  toolInvocations?: ToolInvocationRecord[]
}): React.JSX.Element | null {
  if (toolInvocations === undefined || toolInvocations.length === 0) {
    return null
  }

  return (
    <div className="mt-2 space-y-1.5">
      {toolInvocations.map((toolInvocation) => (
        <ToolInvocationItem key={toolInvocation.id} toolInvocation={toolInvocation} />
      ))}
    </div>
  )
}
