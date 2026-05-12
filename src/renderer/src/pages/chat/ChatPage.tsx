import { useEffect, useMemo, useState } from 'react'
import { MessageSquareText } from 'lucide-react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ChatInput } from '@renderer/features/ChatInput'
import { ActionBar } from '@renderer/features/ChatInput/ActionBar'
import {
  selectChatError,
  selectChatMessages,
  selectChatMessagesStatus,
  selectChatSendStatus,
  selectChatSessions,
  selectChatSessionsStatus
} from '@renderer/store/chat/selectors'
import { useChatStore } from '@renderer/store/chat'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { cn } from '@shadcn/lib/utils'
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
  const sessionsStatus = useChatStore(selectChatSessionsStatus)
  const messages = useChatStore(selectChatMessages)
  const messagesStatus = useChatStore(selectChatMessagesStatus)
  const sendStatus = useChatStore(selectChatSendStatus)
  const error = useChatStore(selectChatError)
  const loadChatSessions = useChatStore((state) => state.loadChatSessions)
  const loadChatMessages = useChatStore((state) => state.loadChatMessages)
  const sendChatMessage = useChatStore((state) => state.sendChatMessage)
  const applySendMessageEvent = useChatStore((state) => state.applySendMessageEvent)
  const clearChatMessages = useChatStore((state) => state.clearChatMessages)
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

    void loadChatMessages(routeState.activeChatId)
  }, [clearChatMessages, loadChatMessages, routeState.activeChatId])

  const handleSend = async (): Promise<void> => {
    const trimmedContent = content.trim()

    if (trimmedContent.length === 0 || isSending) {
      return
    }

    setContent('')

    try {
      const result = await sendChatMessage({
        ...(routeState.activeChatId === null ? {} : { sessionId: routeState.activeChatId }),
        ...((routeState.activeChatId === null || routeState.draftProviderId != null) &&
        activeProvider !== undefined
          ? { provider: activeProvider.provider }
          : {}),
        content: trimmedContent
      })

      setRouteState((state) => ({
        ...state,
        activeChatId: result.session.id,
        draftProviderId: null
      }))
    } catch {
      setContent(trimmedContent)
      return
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium leading-5">
            {activeSession?.title ?? '新聊天'}
          </h1>
          <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
            {activeProvider?.name ?? '未选择提供商'} · {selectChatModelLabel(activeProvider)}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          role="log"
          aria-label="聊天消息"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6"
        >
          {routeState.activeChatId === null && messages.length === 0 ? (
            <div className="flex min-h-full items-center justify-center">
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                  <MessageSquareText aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-foreground">准备开始聊天</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    从左侧选择最近会话，或直接输入第一条消息。
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {messagesStatus === 'loading' ? (
            <div className="text-sm leading-6 text-muted-foreground">正在加载消息...</div>
          ) : null}

          {messages.map((message) => {
            const isUser = message.role === 'user'

            return (
              <article
                key={message.id}
                className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[72%] rounded-lg px-3 py-2 text-sm leading-6',
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-secondary text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 text-[11px] font-medium leading-4',
                      isUser ? 'text-primary-foreground/75' : 'text-muted-foreground'
                    )}
                  >
                    {isUser ? '你' : 'Moon'}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                </div>
              </article>
            )
          })}
        </div>

        {error === null ? null : (
          <div role="alert" className="border-t border-border px-6 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="shrink-0 border-t border-border px-6 py-4">
          <ChatInput
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
            onSend={() => {
              void handleSend()
            }}
          />
        </div>
      </div>
    </section>
  )
}
