/**
 * 负责渲染当前 thread 的消息投影并连接 Conversation 局部状态。
 * 消息加载和 branch draft 由局部 store 提供，组件本身不调用 IPC。
 */

import {
  Conversation as AiConversation,
  ConversationContent,
  ConversationScrollButton
} from '@moon/ui/ai-elements/conversation'
import { cn } from '@moon/ui/lib/utils'
import type { MessageRecord } from '@moon/shared/domain/chat'

import { MessageBubble } from '../../Messages'
import { conversationSelectors, useConversationStore } from '../../store'
import type { ChatListProps } from '../../types'
import { InboxWelcome } from '../InboxWelcome'
import SkeletonList from '../SkeletonList'

type ChatListViewProps = ChatListProps & {
  branchDisabled?: boolean
  branchTargetSourceMessageId?: string
  messages: NonNullable<ChatListProps['messages']>
  onBranchFromMessage?: (message: MessageRecord) => void
}

function ChatListView({
  branchDisabled,
  branchTargetSourceMessageId,
  className,
  messages,
  onBranchFromMessage,
  showWelcome = false
}: ChatListViewProps): React.JSX.Element {
  return (
    <AiConversation aria-label="聊天消息" className={cn('min-h-0', className)}>
      <ConversationContent className="min-h-full gap-4 px-6 py-6">
        {showWelcome ? <InboxWelcome /> : null}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            branchDisabled={branchDisabled}
            isBranchTarget={branchTargetSourceMessageId === message.id}
            message={message}
            onBranch={onBranchFromMessage}
          />
        ))}
      </ConversationContent>
      <ConversationScrollButton className="bottom-6" />
    </AiConversation>
  )
}

function ConnectedChatList(props: ChatListProps): React.JSX.Element {
  const branchTarget = useConversationStore((state) => state.branchTarget)
  const context = useConversationStore(conversationSelectors.context)
  const messages = useConversationStore(conversationSelectors.messages)
  const messagesInit = useConversationStore(conversationSelectors.messagesInit)
  const operationState = useConversationStore(conversationSelectors.operationState)
  const skipFetch = useConversationStore(conversationSelectors.skipFetch)
  const startBranch = useConversationStore((state) => state.startBranch)
  const useFetchMessages = useConversationStore((state) => state.useFetchMessages)

  useFetchMessages(context, skipFetch)

  const isNewConversation = context.sessionId === null

  if (!messagesInit && !isNewConversation) {
    return <SkeletonList />
  }

  return (
    <ChatListView
      {...props}
      branchDisabled={operationState.isSending}
      branchTargetSourceMessageId={branchTarget?.sourceMessageId}
      messages={messages}
      onBranchFromMessage={startBranch}
    />
  )
}

/**
 * 渲染显式消息列表，或连接局部 store 加载当前 thread 消息。
 */
export function ChatList(props: ChatListProps): React.JSX.Element {
  if (props.messages !== undefined) {
    return <ChatListView {...props} messages={props.messages} />
  }

  return <ConnectedChatList {...props} />
}
