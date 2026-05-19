import { useEffect, useMemo } from 'react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ChatInput, ChatList, ConversationProvider } from '@renderer/features/Conversation'
import { useChatStore } from '@renderer/store/chat'
import {
  selectChatActiveThreadId,
  selectChatActiveTopicId,
  selectChatBlockingOperationId,
  selectChatError,
  selectChatMessages,
  selectChatMessagesStatus,
  selectChatSendStatus,
  selectChatSessions,
  selectChatSessionsStatus,
  selectChatThreads,
  selectChatTopics
} from '@renderer/store/chat/selectors'

export function ChatPage(): React.JSX.Element {
  const { routeState } = useAppRouterContext()
  const sessions = useChatStore(selectChatSessions)
  const topics = useChatStore(selectChatTopics)
  const threads = useChatStore(selectChatThreads)
  const activeTopicId = useChatStore(selectChatActiveTopicId)
  const activeThreadId = useChatStore(selectChatActiveThreadId)
  const blockingOperationId = useChatStore(selectChatBlockingOperationId)
  const sendStatus = useChatStore(selectChatSendStatus)
  const sessionsStatus = useChatStore(selectChatSessionsStatus)
  const messages = useChatStore(selectChatMessages)
  const messagesStatus = useChatStore(selectChatMessagesStatus)
  const error = useChatStore(selectChatError)
  const loadChatSessions = useChatStore((state) => state.loadChatSessions)
  const loadChatTopics = useChatStore((state) => state.loadChatTopics)
  const loadChatThreads = useChatStore((state) => state.loadChatThreads)
  const loadChatMessages = useChatStore((state) => state.loadChatMessages)
  const applyChatOperationEvent = useChatStore((state) => state.applyChatOperationEvent)
  const clearChatMessages = useChatStore((state) => state.clearChatMessages)
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === routeState.activeChatId),
    [routeState.activeChatId, sessions]
  )
  const conversationContext = useMemo(
    () => ({
      draftProviderId: routeState.draftProviderId ?? null,
      sessionId: routeState.activeChatId,
      threadId: activeThreadId,
      topicId: activeTopicId
    }),
    [activeThreadId, activeTopicId, routeState.activeChatId, routeState.draftProviderId]
  )
  const operationState = useMemo(
    () => ({
      blockingOperationId,
      error,
      isSending: sendStatus === 'sending' || blockingOperationId !== null
    }),
    [blockingOperationId, error, sendStatus]
  )

  useEffect(() => {
    if (sessionsStatus === 'idle') {
      void loadChatSessions()
    }
  }, [loadChatSessions, sessionsStatus])

  useEffect(() => {
    return window.api.chat.onOperationEvent((event) => {
      applyChatOperationEvent(event)
    })
  }, [applyChatOperationEvent])

  useEffect(() => {
    if (routeState.activeChatId === null) {
      clearChatMessages()
      return
    }

    void loadChatTopics(routeState.activeChatId)
  }, [clearChatMessages, loadChatTopics, routeState.activeChatId])

  useEffect(() => {
    const topicId = topics[0]?.id

    if (
      topicId !== undefined &&
      (threads.length === 0 || threads.some((thread) => thread.topicId !== topicId))
    ) {
      void loadChatThreads(topicId)
    }
  }, [loadChatThreads, threads, topics])

  useEffect(() => {
    if (routeState.activeChatId !== null && activeThreadId !== null) {
      void loadChatMessages(routeState.activeChatId)
    }
  }, [activeThreadId, loadChatMessages, routeState.activeChatId])

  return (
    <section className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium leading-5">
            {activeSession?.title ?? '新聊天'}
          </h1>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ConversationProvider
            context={conversationContext}
            messages={messages}
            operationState={operationState}
          >
            <ChatList
              isLoading={messagesStatus === 'loading'}
              showWelcome={routeState.activeChatId === null && messages.length === 0}
            />

            {error === null ? null : (
              <div
                role="alert"
                className="border-t border-border px-6 py-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}

            <div className="shrink-0 border-t border-border px-6 py-4">
              <ChatInput />
            </div>
          </ConversationProvider>
        </div>
      </div>
    </section>
  )
}
