import {
  Conversation as AiConversation,
  ConversationContent,
  ConversationScrollButton
} from '@shadcn/ai-elements/conversation'
import { cn } from '@shadcn/lib/utils'

import { MessageBubble } from '../../Messages'
import type { ConversationProps } from '../../types'
import { InboxWelcome } from '../InboxWelcome'

export function ChatList({
  className,
  isLoading = false,
  messages,
  showWelcome = false
}: ConversationProps): React.JSX.Element {
  return (
    <AiConversation aria-label="聊天消息" className={cn('min-h-0', className)}>
      <ConversationContent className="min-h-full gap-4 px-6 py-6">
        {showWelcome ? <InboxWelcome /> : null}

        {isLoading ? (
          <div className="text-sm leading-6 text-muted-foreground">正在加载消息...</div>
        ) : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ConversationContent>
      <ConversationScrollButton className="bottom-6" />
    </AiConversation>
  )
}
