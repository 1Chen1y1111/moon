import { useEffect, useMemo, useState } from 'react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ChatInput } from '@renderer/features/ChatInput'
import { ActionBar } from '@renderer/features/ChatInput/ActionBar'
import { Conversation } from '@renderer/features/Conversation'
import { useChatStore } from '@renderer/store/chat'
import {
  selectChatActiveOperationId,
  selectChatActiveThreadId,
  selectChatDraftAttachments,
  selectChatError,
  selectChatMessages,
  selectChatMessagesStatus,
  selectChatSendStatus,
  selectChatSessions,
  selectChatSessionsStatus,
  selectChatThreads,
  selectChatTopics
} from '@renderer/store/chat/selectors'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import {
  isSupportedChatProvider,
  selectChatModelLabel,
  selectDefaultChatProvider
} from '@shared/domain/chat-provider'
import type { ProviderSettings } from '@shared/domain/settings'

function selectPageProvider(
  providers: Record<string, ProviderSettings>,
  activeSessionProvider: string | undefined,
  draftProviderId: string | null | undefined
): ProviderSettings | undefined {
  const draftProvider =
    draftProviderId === undefined || draftProviderId === null
      ? undefined
      : providers[draftProviderId]

  if (draftProvider?.enabled && isSupportedChatProvider(draftProvider)) {
    return draftProvider
  }

  if (activeSessionProvider !== undefined) {
    return providers[activeSessionProvider]
  }

  try {
    return selectDefaultChatProvider({ appearance: { theme: 'system' }, providers })
  } catch {
    return undefined
  }
}

export function ChatPage(): React.JSX.Element {
  const { routeState, setRouteState } = useAppRouterContext()
  const sessions = useChatStore(selectChatSessions)
  const topics = useChatStore(selectChatTopics)
  const threads = useChatStore(selectChatThreads)
  const activeThreadId = useChatStore(selectChatActiveThreadId)
  const activeOperationId = useChatStore(selectChatActiveOperationId)
  const sessionsStatus = useChatStore(selectChatSessionsStatus)
  const messages = useChatStore(selectChatMessages)
  const draftAttachments = useChatStore(selectChatDraftAttachments)
  const messagesStatus = useChatStore(selectChatMessagesStatus)
  const sendStatus = useChatStore(selectChatSendStatus)
  const error = useChatStore(selectChatError)
  const loadChatSessions = useChatStore((state) => state.loadChatSessions)
  const loadChatTopics = useChatStore((state) => state.loadChatTopics)
  const loadChatThreads = useChatStore((state) => state.loadChatThreads)
  const loadChatMessages = useChatStore((state) => state.loadChatMessages)
  const sendChatMessage = useChatStore((state) => state.sendChatMessage)
  const cancelChatOperation = useChatStore((state) => state.cancelChatOperation)
  const applySendMessageEvent = useChatStore((state) => state.applySendMessageEvent)
  const clearChatMessages = useChatStore((state) => state.clearChatMessages)
  const clearChatDraftAttachments = useChatStore((state) => state.clearChatDraftAttachments)
  const removeChatDraftAttachment = useChatStore((state) => state.removeChatDraftAttachment)
  const appSettings = useSettingsStore(selectAppSettings)
  const [content, setContent] = useState('')
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === routeState.activeChatId),
    [routeState.activeChatId, sessions]
  )
  const activeProvider = selectPageProvider(
    appSettings.providers,
    activeSession?.provider,
    routeState.draftProviderId
  )
  const isSending = sendStatus === 'sending'
  const readyDraftAttachments = useMemo(
    () =>
      draftAttachments
        .filter((attachment) => attachment.status === 'success')
        .map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          kind: attachment.kind,
          createdAt: attachment.createdAt
        })),
    [draftAttachments]
  )
  const hasUnreadyDraftAttachments = draftAttachments.some(
    (attachment) => attachment.status !== 'success'
  )

  useEffect(() => {
    if (sessionsStatus === 'idle') {
      void loadChatSessions()
    }
  }, [loadChatSessions, sessionsStatus])

  useEffect(() => {
    return window.api.chat.onSendMessageEvent((event) => {
      applySendMessageEvent(event)
    })
  }, [applySendMessageEvent])

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

  const handleSend = async (): Promise<void> => {
    const trimmedContent = content.trim()

    if (
      (trimmedContent.length === 0 && readyDraftAttachments.length === 0) ||
      hasUnreadyDraftAttachments ||
      isSending
    ) {
      return
    }

    setContent('')

    try {
      const result = await sendChatMessage({
        ...(routeState.activeChatId === null ? {} : { sessionId: routeState.activeChatId }),
        ...(activeThreadId === null ? {} : { threadId: activeThreadId }),
        ...((routeState.activeChatId === null || routeState.draftProviderId != null) &&
        activeProvider !== undefined
          ? { provider: activeProvider.provider }
          : {}),
        content: trimmedContent,
        ...(readyDraftAttachments.length === 0 ? {} : { attachments: readyDraftAttachments })
      })

      clearChatDraftAttachments()

      setRouteState((state) => ({
        ...state,
        activeChatId: result.session.id,
        draftProviderId: null
      }))
    } catch {
      setContent(trimmedContent)
    }
  }

  const handleStop = (): void => {
    if (activeOperationId !== null) {
      void cancelChatOperation({ operationId: activeOperationId })
    }
  }

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
          <Conversation
            isLoading={messagesStatus === 'loading'}
            messages={messages}
            showWelcome={routeState.activeChatId === null && messages.length === 0}
          />

          {error === null ? null : (
            <div role="alert" className="border-t border-border px-6 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="shrink-0 border-t border-border px-6 py-4">
            <ChatInput
              attachments={draftAttachments.map((attachment) => ({
                ...attachment,
                type: attachment.mimeType
              }))}
              value={content}
              isSending={isSending}
              leftContent={<ActionBar />}
              runtimeInfo={{
                providerLabel: activeProvider?.name ?? '未选择提供商',
                modelLabel: selectChatModelLabel(activeProvider),
                shortcutLabel: 'Enter 发送，Shift+Enter 换行',
                statusLabel: isSending ? '发送中' : undefined
              }}
              onChange={setContent}
              onAttachmentRemove={removeChatDraftAttachment}
              onSend={() => {
                void handleSend()
              }}
              onStop={handleStop}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
