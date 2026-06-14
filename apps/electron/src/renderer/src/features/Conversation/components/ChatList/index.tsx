import {
  Conversation as AiConversation,
  ConversationContent,
  ConversationScrollButton
} from '@moon/ui/ai-elements/conversation'
import { cn } from '@moon/ui/lib/utils'

import { MessageBubble } from '../../Messages'
import { conversationSelectors, useConversationStore } from '../../store'
import type { ChatListProps } from '../../types'
import { InboxWelcome } from '../InboxWelcome'
import SkeletonList from '../SkeletonList'

type ChatListViewProps = ChatListProps & {
  messages: NonNullable<ChatListProps['messages']>
}

function ChatListView({
  className,
  messages,
  showWelcome = false
}: ChatListViewProps): React.JSX.Element {
  return (
    <AiConversation aria-label="聊天消息" className={cn('min-h-0', className)}>
      <ConversationContent className="min-h-full gap-4 px-6 py-6">
        {showWelcome ? <InboxWelcome /> : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ConversationContent>
      <ConversationScrollButton className="bottom-6" />
    </AiConversation>
  )
}

function ConnectedChatList(props: ChatListProps): React.JSX.Element {
  const context = useConversationStore(conversationSelectors.context)
  const messages = useConversationStore(conversationSelectors.messages)
  const messagesInit = useConversationStore(conversationSelectors.messagesInit)
  const skipFetch = useConversationStore(conversationSelectors.skipFetch)
  const useFetchMessages = useConversationStore((state) => state.useFetchMessages)

  useFetchMessages(context, skipFetch)

  const isNewConversation = context.sessionId === null

  if (!messagesInit && !isNewConversation) {
    return <SkeletonList />
  }

  return <ChatListView {...props} messages={messages} />
}

export function ChatList(props: ChatListProps): React.JSX.Element {
  if (props.messages !== undefined) {
    return <ChatListView {...props} messages={props.messages} />
  }

  return <ConnectedChatList {...props} />
}
