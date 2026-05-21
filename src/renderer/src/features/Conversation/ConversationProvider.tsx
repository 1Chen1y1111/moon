import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

import type { MessageRecord } from '@shared/domain/chat'

import { createStore, ConversationStoreProvider, useConversationStoreApi } from './store'
import type { ConversationContext, OperationState } from './types'

export interface ConversationProviderProps {
  children: ReactNode
  context: ConversationContext
  hasInitMessages?: boolean
  messages?: MessageRecord[]
  onMessagesChange?: (messages: MessageRecord[], context: ConversationContext) => void
  operationState?: OperationState
  skipFetch?: boolean
}

function getConversationContextKey(context: ConversationContext): string {
  return [
    context.sessionId ?? 'new',
    context.topicId ?? 'no-topic',
    context.threadId ?? 'no-thread',
    context.draftProviderId ?? 'no-draft-provider'
  ].join(':')
}

function StoreUpdater({
  context,
  hasInitMessages,
  messages,
  onMessagesChange,
  operationState,
  skipFetch
}: Omit<ConversationProviderProps, 'children'>): null {
  const store = useConversationStoreApi()
  const contextKey = useMemo(() => getConversationContextKey(context), [context])
  const previousContextKeyRef = useRef(contextKey)

  useEffect(() => {
    store.getState().setContext(context)
  }, [context, store])

  useEffect(() => {
    store.getState().setOnMessagesChange(onMessagesChange)
  }, [onMessagesChange, store])

  useEffect(() => {
    store.getState().setSkipFetch(skipFetch)
  }, [skipFetch, store])

  useEffect(() => {
    if (messages !== undefined) {
      store.getState().replaceMessages(messages, context)
      return
    }

    store.getState().setMessagesInit(skipFetch === true || hasInitMessages === true)
  }, [context, hasInitMessages, messages, skipFetch, store])

  useEffect(() => {
    if (operationState !== undefined) {
      store.getState().setOperationState(operationState)
    }
  }, [operationState, store])

  useLayoutEffect(() => {
    if (previousContextKeyRef.current === contextKey) {
      return
    }

    previousContextKeyRef.current = contextKey
    store.setState({
      context,
      messages: messages ?? [],
      messagesInit: false,
      onMessagesChange,
      skipFetch
    })

    if (messages !== undefined) {
      store.getState().replaceMessages(messages, context)
      return
    }

    if (skipFetch === true || hasInitMessages === true) {
      store.getState().setMessagesInit(true)
    }
  }, [context, contextKey, hasInitMessages, messages, onMessagesChange, skipFetch, store])

  return null
}

export function ConversationProvider({
  children,
  context,
  hasInitMessages,
  messages,
  onMessagesChange,
  operationState,
  skipFetch
}: ConversationProviderProps): React.JSX.Element {
  const contextKey = useMemo(() => getConversationContextKey(context), [context])

  return (
    <ConversationStoreProvider
      key={contextKey}
      createStore={() =>
        createStore({
          context,
          hasInitMessages,
          messages,
          onMessagesChange,
          operationState,
          skipFetch
        })
      }
    >
      <StoreUpdater
        context={context}
        hasInitMessages={hasInitMessages}
        messages={messages}
        operationState={operationState}
        skipFetch={skipFetch}
        onMessagesChange={onMessagesChange}
      />
      {children}
    </ConversationStoreProvider>
  )
}
