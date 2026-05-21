import { useEffect, useRef, useState, type MouseEvent } from 'react'
import {
  CircleFadingArrowUp,
  Ellipsis,
  ImageIcon,
  MessageSquareMore,
  Music4,
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'

import { selectChatSessions, selectChatSessionsStatus } from '@renderer/store/chat/selectors'
import { useChatStore } from '@renderer/store/chat'
import { useAppRouterContext } from '@renderer/app/router/router-context'
import { Button } from '@shadcn/ui/button'
import { ScrollArea } from '@shadcn/ui/scroll-area'

import { WorkspaceChrome } from './WorkspaceChrome'

let newChatRequestCounter = 0

function createNewChatRequestId(): string {
  newChatRequestCounter += 1

  return `new-chat-${newChatRequestCounter}`
}

function navigateToNewChat(): void {
  window.location.hash = '#/'
}

function navigateToChat(): void {
  window.location.hash = '#/chat'
}

export function WorkspaceSidebar(): React.JSX.Element {
  const sessions = useChatStore(selectChatSessions)
  const sessionsStatus = useChatStore(selectChatSessionsStatus)
  const loadChatSessions = useChatStore((state) => state.loadChatSessions)
  const clearChatDraftAttachments = useChatStore((state) => state.clearChatDraftAttachments)
  const clearChatError = useChatStore((state) => state.clearChatError)
  const clearChatMessages = useChatStore((state) => state.clearChatMessages)
  const deleteChatSession = useChatStore((state) => state.deleteChatSession)
  const { routeState, setRouteState } = useAppRouterContext()
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (sessionsStatus === 'idle') {
      void loadChatSessions()
    }
  }, [loadChatSessions, sessionsStatus])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const openMoreActions = (): void => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    setIsMoreActionsOpen(true)
  }

  const closeMoreActions = (): void => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      setIsMoreActionsOpen(false)
      closeTimeoutRef.current = null
    }, 180)
  }

  const handleOpenSettings = (): void => {
    void window.api.windowControls.openSettings()
  }

  const handleStartNewChat = (): void => {
    clearChatDraftAttachments()
    clearChatError()
    clearChatMessages()
    setRouteState((state) => ({
      ...state,
      activeChatId: null,
      draftProviderId: null,
      newChatRequestId: createNewChatRequestId()
    }))
    navigateToNewChat()
  }

  const handleSelectSession = (sessionId: string): void => {
    setRouteState((state) => ({
      ...state,
      activeChatId: sessionId
    }))
    navigateToChat()
  }

  const handleDeleteSession = async (
    event: MouseEvent<HTMLButtonElement>,
    sessionId: string
  ): Promise<void> => {
    event.stopPropagation()

    await deleteChatSession(sessionId)

    if (routeState.activeChatId === sessionId) {
      setRouteState((state) => ({
        ...state,
        activeChatId: null,
        draftProviderId: null
      }))
    }
  }

  return (
    <aside aria-label="Workspace navigation" className="relative z-30 flex w-56 shrink-0 p-3">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-visible rounded-xl border border-border bg-card">
        <WorkspaceChrome />

        <ScrollArea role="group" aria-label="Primary actions" className="h-[calc(100%-93px)]">
          <div className="flex flex-col gap-4 px-3 py-6">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="justify-start gap-2"
              onClick={handleStartNewChat}
            >
              <Plus aria-hidden="true" className="size-4" />
              新建聊天
            </Button>

            <div className="space-y-2">
              <div className="px-2 text-xs font-medium leading-5 text-muted-foreground">
                最近会话
              </div>
              <div role="list" aria-label="最近会话" className="space-y-1">
                {sessions.map((session) => {
                  const isActive = routeState.activeChatId === session.id

                  const title = session.title ?? '未命名会话'

                  return (
                    <div key={session.id} role="listitem">
                      <div className="group/session relative">
                        <button
                          type="button"
                          aria-current={isActive ? 'page' : undefined}
                          className="flex w-full min-w-0 rounded-md py-2 pl-2 pr-9 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-current:bg-accent"
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <span className="truncate">{title}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`删除会话 ${title}`}
                          className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[background-color,color,opacity] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/session:opacity-100"
                          onClick={(event) => {
                            void handleDeleteSession(event, session.id)
                          }}
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between px-3 pb-3">
          <div className="relative" onMouseEnter={openMoreActions} onMouseLeave={closeMoreActions}>
            {isMoreActionsOpen ? (
              <div className="[-webkit-app-region:no-drag] absolute bottom-full left-0 z-50 mb-3 w-44 rounded-md border border-border bg-card p-1.5 shadow-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SlidersHorizontal
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span>管理提示词应用</span>
                </button>

                <div className="my-1.5 h-px bg-border" />

                <div className="space-y-1.5">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ImageIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span>图库</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Music4 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span>现场编程</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={handleOpenSettings}
                  >
                    <Settings
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span>设置</span>
                  </button>
                </div>

                <div className="my-1.5 h-px bg-border" />

                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MessageSquareMore
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span>Show External Chats</span>
                </button>
              </div>
            ) : null}

            <button
              type="button"
              aria-label="更多操作"
              className="flex size-8 items-center justify-center rounded-md bg-transparent text-foreground transition-[background-color,color,box-shadow] hover:bg-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ellipsis aria-hidden="true" className="size-4" />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-6 items-center gap-3 rounded-md border border-input bg-secondary px-3 text-xs leading-4 text-foreground transition-[background-color,border-color,color] dark:border-primary/20 dark:bg-primary/10 dark:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleFadingArrowUp aria-hidden="true" className="size-3" />
            更新
          </button>
        </div>
      </div>
    </aside>
  )
}
