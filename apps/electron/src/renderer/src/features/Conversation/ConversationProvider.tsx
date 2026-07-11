/**
 * 负责为会话 UI 创建并同步局部 Zustand store。
 * 它把路由/项目/消息上下文同步进会话组件树，不直接发起业务 IPC。
 */

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

import type { MessageRecord } from '@moon/shared/domain/chat'

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

/**
 * 根据会话、线程、项目和草稿 provider 信息生成 store 重建 key。
 */
function getConversationContextKey(context: ConversationContext): string {
  return [
    context.sessionId ?? 'new',
    context.topicId ?? 'no-topic',
    context.threadId ?? 'no-thread',
    context.projectId ?? 'no-project',
    context.draftLlmConnectionId ?? 'no-draft-connection',
    context.draftProviderId ?? 'no-draft-provider'
  ].join(':')
}

/**
 * 把外部 props 同步进 Conversation 局部 store。
 */
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

  useLayoutEffect(() => {
    if (messages !== undefined) {
      store.getState().setMessages(messages, true)
      return
    }

    store.getState().setMessagesInit(skipFetch === true || hasInitMessages === true)
  }, [hasInitMessages, messages, skipFetch, store])

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
      branchTarget: null,
      context,
      messages: messages ?? [],
      messagesInit: false,
      onMessagesChange,
      skipFetch
    })

    if (messages !== undefined) {
      store.getState().setMessages(messages, true)
      return
    }

    if (skipFetch === true || hasInitMessages === true) {
      store.getState().setMessagesInit(true)
    }
  }, [context, contextKey, hasInitMessages, messages, onMessagesChange, skipFetch, store])

  return null
}

/**
 * 为会话组件树提供独立 store，并在项目/会话上下文变化时重建局部状态。
 */
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
