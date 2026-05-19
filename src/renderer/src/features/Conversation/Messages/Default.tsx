import { Message, MessageContent } from '@shadcn/ai-elements/message'
import { cn } from '@shadcn/lib/utils'
import type { MessageRecord } from '@shared/domain/chat'

import { AssistantMessage } from './Assistant'
import { ToolInvocationList } from './Tool'
import { UserMessage } from './User'
import { MessageAttachmentList } from './components/MessageAttachmentList'
import { ReasoningBlock } from './components/ReasoningBlock'

export function MessageBubble({ message }: { message: MessageRecord }): React.JSX.Element {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

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
        <div
          className={cn(
            'mb-1 text-[11px] font-medium leading-4',
            isUser ? 'text-primary-foreground/75' : 'text-muted-foreground'
          )}
        >
          {isUser ? '你' : 'Moon'}
          {message.status === 'streaming' ? ' · 生成中' : null}
          {message.status === 'error' ? ' · 失败' : null}
        </div>
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
    </Message>
  )
}
