import {
  Conversation as AiConversation,
  ConversationContent,
  ConversationScrollButton
} from '@shadcn/ai-elements/conversation'
import { cn } from '@shadcn/lib/utils'

import { MessageBubble } from '../../Messages'
import { conversationSelectors, useConversationStore } from '../../store'
import type { ChatListProps } from '../../types'
import { InboxWelcome } from '../InboxWelcome'

type ChatListViewProps = ChatListProps & {
  messages: NonNullable<ChatListProps['messages']>
}

function ChatListView({
  className,
  isLoading = false,
  messages,
  showWelcome = false
}: ChatListViewProps): React.JSX.Element {
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

function ConnectedChatList(props: ChatListProps): React.JSX.Element {
  const messages = useConversationStore(conversationSelectors.messages)

  return <ChatListView {...props} messages={messages} />
}

export function ChatList(props: ChatListProps): React.JSX.Element {
  if (props.messages !== undefined) {
    return <ChatListView {...props} messages={props.messages} />
  }

  return <ConnectedChatList {...props} />
}
