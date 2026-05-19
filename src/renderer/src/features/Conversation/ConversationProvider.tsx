import { useEffect, useState, type ReactNode } from 'react'

import type { MessageRecord } from '@shared/domain/chat'

import { createStore, ConversationStoreProvider, useConversationStoreApi } from './store'
import type { ConversationContext, OperationState } from './types'

export interface ConversationProviderProps {
  children: ReactNode
  context: ConversationContext
  messages?: MessageRecord[]
  operationState?: OperationState
}

function StoreUpdater({
  context,
  messages = [],
  operationState
}: Omit<ConversationProviderProps, 'children'>): null {
  const store = useConversationStoreApi()

  useEffect(() => {
    store.getState().setContext(context)
  }, [context, store])

  useEffect(() => {
    store.getState().setMessages(messages)
  }, [messages, store])

  useEffect(() => {
    if (operationState !== undefined) {
      store.getState().setOperationState(operationState)
    }
  }, [operationState, store])

  return null
}

export function ConversationProvider({
  children,
  context,
  messages,
  operationState
}: ConversationProviderProps): React.JSX.Element {
  const [store] = useState(() => createStore({ context, messages, operationState }))

  return (
    <ConversationStoreProvider store={store}>
      <StoreUpdater context={context} messages={messages} operationState={operationState} />
      {children}
    </ConversationStoreProvider>
  )
}
