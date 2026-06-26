/**
 * 负责渲染聊天路由并把全局 chat/project 状态注入 Conversation。
 * 页面只做路由级组合，聊天发送和持久化由下层 store 与 IPC 处理。
 */

import { useEffect, useMemo } from 'react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ChatInput, ChatList, ConversationProvider } from '@renderer/features/Conversation'
import { useProjectsStore } from '@renderer/store/projects'
import { selectActiveProject } from '@renderer/store/projects/selectors'
import { useChatStore } from '@renderer/store/chat'
import {
  selectChatActiveSessionId,
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

/**
 * 渲染当前聊天页面，并根据 active project/session 生成发送消息所需上下文。
 */
export function ChatPage(): React.JSX.Element {
  const { routeState } = useAppRouterContext()
  const sessions = useChatStore(selectChatSessions)
  const topics = useChatStore(selectChatTopics)
  const threads = useChatStore(selectChatThreads)
  const activeSessionId = useChatStore(selectChatActiveSessionId)
  const activeTopicId = useChatStore(selectChatActiveTopicId)
  const activeThreadId = useChatStore(selectChatActiveThreadId)
  const blockingOperationId = useChatStore(selectChatBlockingOperationId)
  const sendStatus = useChatStore(selectChatSendStatus)
  const sessionsStatus = useChatStore(selectChatSessionsStatus)
  const messages = useChatStore(selectChatMessages)
  const messagesStatus = useChatStore(selectChatMessagesStatus)
  const error = useChatStore(selectChatError)
  const activeProject = useProjectsStore(selectActiveProject)
  const loadChatSessions = useChatStore((state) => state.loadChatSessions)
  const loadChatTopics = useChatStore((state) => state.loadChatTopics)
  const loadChatThreads = useChatStore((state) => state.loadChatThreads)
  const replaceChatMessages = useChatStore((state) => state.replaceChatMessages)
  const applyChatOperationEvent = useChatStore((state) => state.applyChatOperationEvent)
  const clearChatMessages = useChatStore((state) => state.clearChatMessages)
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === routeState.activeChatId),
    [routeState.activeChatId, sessions]
  )
  const hasTopicsForActiveRoute =
    routeState.activeChatId !== null &&
    activeSessionId === routeState.activeChatId &&
    topics.length > 0 &&
    topics.every((topic) => topic.sessionId === routeState.activeChatId)
  const conversationContext = useMemo(
    () => ({
      draftLlmConnectionId: routeState.draftLlmConnectionId ?? null,
      draftProviderId: routeState.draftProviderId ?? null,
      projectId: activeSession?.projectId ?? activeProject?.id ?? null,
      sessionId: routeState.activeChatId,
      threadId: activeSessionId === routeState.activeChatId ? activeThreadId : null,
      topicId: activeSessionId === routeState.activeChatId ? activeTopicId : null
    }),
    [
      activeProject?.id,
      activeSession?.projectId,
      activeSessionId,
      activeThreadId,
      activeTopicId,
      routeState.activeChatId,
      routeState.draftLlmConnectionId,
      routeState.draftProviderId
    ]
  )
  const operationState = useMemo(
    () => ({
      blockingOperationId,
      error,
      isSending: sendStatus === 'sending' || blockingOperationId !== null
    }),
    [blockingOperationId, error, sendStatus]
  )
  const messagesBelongToActiveRoute =
    routeState.activeChatId !== null &&
    messages.every((message) => message.sessionId === routeState.activeChatId)
  const hasInitializedActiveMessages =
    routeState.activeChatId !== null &&
    activeSessionId === routeState.activeChatId &&
    messagesStatus === 'succeeded'
  const visibleMessages =
    routeState.activeChatId === null
      ? []
      : messagesBelongToActiveRoute && (messages.length > 0 || hasInitializedActiveMessages)
        ? messages
        : undefined
  const hasInitMessages = routeState.activeChatId === null || visibleMessages !== undefined
  const conversationKey =
    routeState.activeChatId === null
      ? `new:${conversationContext.projectId ?? 'unbound'}:${routeState.newChatRequestId ?? 'initial'}`
      : `session:${routeState.activeChatId}:topic:${conversationContext.topicId ?? 'none'}:thread:${conversationContext.threadId ?? 'none'}`
  const isEmptyChatEntry = routeState.activeChatId === null
  const errorAlert =
    error === null ? null : (
      <div
        role="alert"
        className="w-full border-t border-border px-6 py-2 text-xs text-destructive"
      >
        {error}
      </div>
    )

  useEffect(() => {
    if (sessionsStatus === 'idle') {
      void loadChatSessions()
    }
  }, [loadChatSessions, sessionsStatus])

  useEffect(() => {
    return window.api.sessions.onSessionEvent((event) => {
      applyChatOperationEvent(event)
    })
  }, [applyChatOperationEvent])

  useEffect(() => {
    if (routeState.activeChatId === null) {
      clearChatMessages()
      return
    }

    if (hasTopicsForActiveRoute) {
      return
    }

    void loadChatTopics(routeState.activeChatId)
  }, [clearChatMessages, hasTopicsForActiveRoute, loadChatTopics, routeState.activeChatId])

  useEffect(() => {
    const topicId = topics[0]?.id

    if (
      topicId !== undefined &&
      (threads.length === 0 || threads.some((thread) => thread.topicId !== topicId))
    ) {
      void loadChatThreads(topicId)
    }
  }, [loadChatThreads, threads, topics])

  return (
    <section className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <ConversationProvider
        key={conversationKey}
        context={conversationContext}
        hasInitMessages={hasInitMessages}
        messages={visibleMessages}
        operationState={operationState}
        skipFetch={routeState.activeChatId === null}
        onMessagesChange={(nextMessages, context) => replaceChatMessages(context, nextMessages)}
      >
        {isEmptyChatEntry ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-20 pt-8">
            <div className="flex w-full max-w-3xl flex-col items-center gap-8">
              <h1 className="text-center text-3xl font-medium leading-tight text-foreground">
                我们该做什么？
              </h1>
              <div className="w-full">
                <ChatInput />
              </div>
              {errorAlert}
            </div>
          </div>
        ) : (
          <>
            <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-6">
              <div className="min-w-0">
                <h1 className="truncate text-sm font-medium leading-5">
                  {activeSession?.title ?? '新聊天'}
                </h1>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <ChatList />

                {errorAlert}

                <div className="shrink-0 border-t border-border px-6 py-4">
                  <ChatInput />
                </div>
              </div>
            </div>
          </>
        )}
      </ConversationProvider>
    </section>
  )
}
