/**
 * 负责渲染单条会话消息及其可用动作。
 * 消息正文保持 provider 无关，分支动作只在存在 provider checkpoint 时开放。
 */

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent
} from '@moon/ui/ai-elements/message'
import { cn } from '@moon/ui/lib/utils'
import type { MessageRecord } from '@moon/shared/domain/chat'
import { GitBranch } from 'lucide-react'

import { AssistantMessage } from './Assistant'
import { ToolInvocationList } from './Tool'
import { UserMessage } from './User'
import { MessageAttachmentList } from './components/MessageAttachmentList'
import { ReasoningBlock } from './components/ReasoningBlock'

type MessageBubbleProps = {
  branchDisabled?: boolean
  isBranchTarget?: boolean
  message: MessageRecord
  onBranch?: (message: MessageRecord) => void
}

/**
 * 判断消息是否保存了 Claude 分支所需的 provider session/message 坐标。
 */
function hasProviderBranchCheckpoint(message: MessageRecord): boolean {
  return (
    typeof message.metadata?.providerSessionId === 'string' &&
    message.metadata.providerSessionId.trim().length > 0 &&
    typeof message.metadata.providerMessageId === 'string' &&
    message.metadata.providerMessageId.trim().length > 0
  )
}

/**
 * 渲染消息内容，并为可分支的 assistant 回复提供 branch action。
 */
export function MessageBubble({
  branchDisabled,
  isBranchTarget,
  message,
  onBranch
}: MessageBubbleProps): React.JSX.Element {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const canBranch =
    isAssistant &&
    message.status === 'complete' &&
    hasProviderBranchCheckpoint(message) &&
    onBranch !== undefined
  const statusLabel =
    message.status === 'streaming' ? ' · 生成中' : message.status === 'error' ? ' · 失败' : null

  return (
    <Message from={isUser ? 'user' : 'assistant'} className="max-w-full">
      <MessageContent
        className={cn(
          'max-w-[72%] rounded-lg px-3 py-2 text-sm leading-6',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-secondary text-foreground'
        )}
      >
        {statusLabel === null ? null : (
          <div
            className={cn(
              'text-[11px] font-medium leading-4',
              isUser ? 'text-primary-foreground/75' : 'text-muted-foreground'
            )}
          >
            {statusLabel}
          </div>
        )}
        <MessageAttachmentList attachments={message.attachments ?? []} />
        <ReasoningBlock
          isStreaming={message.status === 'streaming'}
          reasoning={message.reasoning}
        />
        {isAssistant ? (
          <AssistantMessage content={message.content} />
        ) : (
          <UserMessage content={message.content} />
        )}
        {message.error === undefined || message.error === null ? null : (
          <div className="mt-2 text-xs leading-5 text-destructive">{message.error}</div>
        )}
        <ToolInvocationList toolInvocations={message.toolInvocations} />
      </MessageContent>
      {canBranch ? (
        <MessageActions className="-mt-1 h-7 text-muted-foreground">
          <MessageAction
            aria-pressed={isBranchTarget}
            className={cn(isBranchTarget && 'bg-accent text-accent-foreground')}
            disabled={branchDisabled}
            label="从这里创建分支"
            tooltip="从这里创建分支"
            onClick={() => onBranch(message)}
          >
            <GitBranch aria-hidden="true" className="size-3.5" />
          </MessageAction>
        </MessageActions>
      ) : null}
    </Message>
  )
}
