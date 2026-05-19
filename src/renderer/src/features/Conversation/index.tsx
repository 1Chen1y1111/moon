import { Suspense } from 'react'

import SkeletonList from './components/SkeletonList'
import { ChatList } from './components/ChatList'
import { MessageBubble } from './Messages'
import type { ChatListProps } from './types'

export { ChatInput } from './ChatInput'
export { ConversationProvider, type ConversationProviderProps } from './ConversationProvider'
export {
  conversationSelectors,
  createStore as createConversationStore,
  useConversationStore,
  useConversationStoreApi,
  type ConversationStore
} from './store'
export type {
  ChatListProps,
  ConversationContext,
  ConversationProps,
  OperationState
} from './types'

export { ChatList }
export { MessageBubble as MessageItem }

export function Conversation(props: ChatListProps): React.JSX.Element {
  return (
    <Suspense fallback={<SkeletonList />}>
      <ChatList {...props} />
    </Suspense>
  )
}

export type ConversationComponentProps = ChatListProps
