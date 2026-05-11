import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { MessageSquareText, SendHorizontal } from 'lucide-react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
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
import { Button } from '@shadcn/ui/button'
import { cn } from '@shadcn/lib/utils'
import { Textarea } from '@shadcn/ui/textarea'
import type { ProviderSettings } from '@shared/domain/settings'

function selectProviderModel(provider: ProviderSettings | undefined): string {
  if (provider === undefined) {
    return '未选择模型'
  }

  return (
    provider.model.trim() ||
    provider.models.find((model) => model.enabled)?.id.trim() ||
    provider.availableModels.find((model) => model.enabled)?.id.trim() ||
    '未选择模型'
  )
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
  const activeProvider =
    activeSession === undefined ? undefined : appSettings.providers[activeSession.provider]
  const isSending = sendStatus === 'sending'
  const canSend = content.trim().length > 0 && !isSending

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const trimmedContent = content.trim()

    if (trimmedContent.length === 0 || isSending) {
      return
    }

    setContent('')

    try {
      const result = await sendChatMessage({
        ...(routeState.activeChatId === null ? {} : { sessionId: routeState.activeChatId }),
        content: trimmedContent
      })

      setRouteState((state) => ({
        ...state,
        activeChatId: result.session.id
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
            {activeProvider?.name ?? '未选择提供商'} · {selectProviderModel(activeProvider)}
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

        <form
          aria-label="发送消息"
          className="flex shrink-0 items-end gap-3 border-t border-border px-6 py-4"
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          <Textarea
            aria-label="消息内容"
            value={content}
            placeholder="输入消息..."
            className="max-h-36 min-h-10 resize-none rounded-lg text-sm"
            disabled={isSending}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <Button type="submit" size="lg" className="gap-2" disabled={!canSend}>
            <SendHorizontal aria-hidden="true" className="size-4" />
            {isSending ? '发送中' : '发送'}
          </Button>
        </form>
      </div>
    </section>
  )
}
