import { useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Check,
  FileText,
  ImageIcon,
  MessageSquareText,
  Paperclip,
  Square,
  Wrench,
  X
} from 'lucide-react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ChatInput } from '@renderer/features/ChatInput'
import { ActionBar } from '@renderer/features/ChatInput/ActionBar'
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
  selectChatTopics,
  selectPendingToolInvocations
} from '@renderer/store/chat/selectors'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { cn } from '@shadcn/lib/utils'
import { Button } from '@shadcn/ui/button'
import {
  isSupportedChatProvider,
  selectChatModelLabel,
  selectDefaultChatProvider
} from '@shared/domain/chat-provider'
import type { ChatAttachmentRecord, MessageRecord, ToolInvocationRecord } from '@shared/domain/chat'
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

function MessageAttachmentList({
  attachments
}: {
  attachments: ChatAttachmentRecord[]
}): React.JSX.Element | null {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => {
        const Icon =
          attachment.kind === 'image'
            ? ImageIcon
            : attachment.kind === 'file'
              ? FileText
              : Paperclip

        return (
          <span
            key={attachment.id}
            className="inline-flex min-w-0 max-w-48 items-center gap-1.5 rounded-md border border-current/15 bg-background/15 px-2 py-1 text-xs leading-4"
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{attachment.name}</span>
          </span>
        )
      })}
    </div>
  )
}

function ReasoningBlock({ reasoning }: { reasoning?: string }): React.JSX.Element | null {
  if (reasoning === undefined || reasoning.trim().length === 0) {
    return null
  }

  return (
    <div className="mb-2 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <Brain aria-hidden="true" className="size-3.5" />
        推理
      </div>
      <div className="whitespace-pre-wrap break-words">{reasoning}</div>
    </div>
  )
}

function ToolInvocationList({
  toolInvocations
}: {
  toolInvocations?: ToolInvocationRecord[]
}): React.JSX.Element | null {
  if (toolInvocations === undefined || toolInvocations.length === 0) {
    return null
  }

  return (
    <div className="mt-2 space-y-1.5">
      {toolInvocations.map((toolInvocation) => (
        <div
          key={toolInvocation.id}
          className="rounded-md border border-border bg-background/70 px-2 py-1.5 text-xs leading-5"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <Wrench aria-hidden="true" className="size-3.5" />
            {toolInvocation.name}
            <span className="ml-auto text-muted-foreground">{toolInvocation.status}</span>
          </div>
          {toolInvocation.error === undefined || toolInvocation.error === null ? null : (
            <div className="mt-1 text-destructive">{toolInvocation.error}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function MessageBubble({ message }: { message: MessageRecord }): React.JSX.Element {
  const isUser = message.role === 'user'

  return (
    <article className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
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
          {message.status === 'streaming' ? ' · 生成中' : null}
          {message.status === 'error' ? ' · 失败' : null}
        </div>
        <MessageAttachmentList attachments={message.attachments ?? []} />
        <ReasoningBlock reasoning={message.reasoning} />
        {message.content.length > 0 ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : null}
        {message.error === undefined || message.error === null ? null : (
          <div className="mt-2 text-xs leading-5 text-destructive">{message.error}</div>
        )}
        <ToolInvocationList toolInvocations={message.toolInvocations} />
      </div>
    </article>
  )
}

export function ChatPage(): React.JSX.Element {
  const { routeState, setRouteState } = useAppRouterContext()
  const sessions = useChatStore(selectChatSessions)
  const topics = useChatStore(selectChatTopics)
  const threads = useChatStore(selectChatThreads)
  const activeThreadId = useChatStore(selectChatActiveThreadId)
  const activeOperationId = useChatStore(selectChatActiveOperationId)
  const pendingToolInvocations = useChatStore(selectPendingToolInvocations)
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
  const approveChatToolCall = useChatStore((state) => state.approveChatToolCall)
  const rejectChatToolCall = useChatStore((state) => state.rejectChatToolCall)
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
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium leading-5">
            {activeSession?.title ?? '新聊天'}
          </h1>
          <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
            {activeProvider?.name ?? '未选择提供商'} · {selectChatModelLabel(activeProvider)}
          </div>
        </div>
        {isSending ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={handleStop}
          >
            <Square aria-hidden="true" className="size-3.5" />
            停止
          </Button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
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

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>

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

        <aside className="hidden w-64 shrink-0 border-l border-border bg-card/40 p-4 xl:block">
          <div className="space-y-5">
            <section>
              <h2 className="text-xs font-medium leading-5 text-muted-foreground">话题 / 线程</h2>
              <div className="mt-2 space-y-1">
                {topics.map((topic) => (
                  <div key={topic.id} className="rounded-md bg-secondary px-2 py-1.5 text-xs">
                    {topic.title}
                  </div>
                ))}
                {threads.map((thread) => (
                  <div key={thread.id} className="ml-3 rounded-md px-2 py-1.5 text-xs">
                    {thread.title}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-medium leading-5 text-muted-foreground">工具审批</h2>
              <div className="mt-2 space-y-2">
                {pendingToolInvocations.length === 0 ? (
                  <div className="text-xs leading-5 text-muted-foreground">暂无待审批工具</div>
                ) : null}
                {pendingToolInvocations.map((toolInvocation) => (
                  <div key={toolInvocation.id} className="rounded-md border border-border p-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Wrench aria-hidden="true" className="size-3.5" />
                      {toolInvocation.name}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 flex-1 gap-1"
                        onClick={() => {
                          void approveChatToolCall({ toolInvocationId: toolInvocation.id })
                        }}
                      >
                        <Check aria-hidden="true" className="size-3" />
                        通过
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 flex-1 gap-1"
                        onClick={() => {
                          void rejectChatToolCall({ toolInvocationId: toolInvocation.id })
                        }}
                      >
                        <X aria-hidden="true" className="size-3" />
                        拒绝
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </section>
  )
}
