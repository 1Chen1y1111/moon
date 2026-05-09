import { useEffect, useRef, useState } from 'react'
import {
  CircleFadingArrowUp,
  Ellipsis,
  ImageIcon,
  MessageSquareMore,
  Music4,
  Plus,
  Settings,
  SlidersHorizontal
} from 'lucide-react'

import {
  createChatSession,
  loadChatSessions,
  selectChatCreateStatus,
  selectChatSessions,
  selectChatSessionsStatus,
  useChatDispatch,
  useChatSelector
} from '@renderer/entities/chat'
import { useAppRouterContext } from '@renderer/app/router/router-context'
import { Button } from '@shadcn/ui/button'
import { ScrollArea } from '@shadcn/ui/scroll-area'

import { WorkspaceChrome } from './WorkspaceChrome'

function navigateToChat(): void {
  window.location.hash = '#/chat'
}

export function WorkspaceSidebar(): React.JSX.Element {
  const dispatch = useChatDispatch()
  const sessions = useChatSelector(selectChatSessions)
  const sessionsStatus = useChatSelector(selectChatSessionsStatus)
  const createStatus = useChatSelector(selectChatCreateStatus)
  const { routeState, setRouteState } = useAppRouterContext()
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (sessionsStatus === 'idle') {
      void dispatch(loadChatSessions())
    }
  }, [dispatch, sessionsStatus])

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

  const handleCreateSession = async (): Promise<void> => {
    try {
      const session = await dispatch(createChatSession()).unwrap()

      setRouteState((state) => ({
        ...state,
        activeChatId: session.id
      }))
      navigateToChat()
    } catch {
      navigateToChat()
    }
  }

  const handleSelectSession = (sessionId: string): void => {
    setRouteState((state) => ({
      ...state,
      activeChatId: sessionId
    }))
    navigateToChat()
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
              disabled={createStatus === 'creating'}
              onClick={() => {
                void handleCreateSession()
              }}
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

                  return (
                    <div key={session.id} role="listitem">
                      <button
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        className="flex w-full min-w-0 rounded-md px-2 py-2 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-current:bg-accent"
                        onClick={() => handleSelectSession(session.id)}
                      >
                        <span className="truncate">{session.title}</span>
                      </button>
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
