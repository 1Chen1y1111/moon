/**
 * 负责渲染 workspace 左侧导航栏。
 * 它把项目树、项目下会话和窗口级快捷入口组合在一起，不直接访问主进程实现细节。
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  ChevronRight,
  CircleFadingArrowUp,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPlus,
  ImageIcon,
  MessageSquareMore,
  Music4,
  Settings,
  SlidersHorizontal,
  SquarePen,
  Trash2
} from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { useChatStore } from '@renderer/store/chat'
import { selectChatSessions, selectChatSessionsStatus } from '@renderer/store/chat/selectors'
import { useProjectsStore } from '@renderer/store/projects'
import {
  selectActiveProject,
  selectProjects,
  selectProjectsLoadStatus
} from '@renderer/store/projects/selectors'
import type { SessionRecord } from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import { cn } from '@moon/ui/lib/utils'
import { ScrollArea } from '@moon/ui/ui/scroll-area'

import { WorkspaceChrome } from './WorkspaceChrome'

const unboundProjectKey = 'unbound'

let newChatRequestCounter = 0

/**
 * 生成新聊天 route key，确保连续点击新建时 Conversation store 会重建。
 */
function createNewChatRequestId(): string {
  newChatRequestCounter += 1

  return `new-chat-${newChatRequestCounter}`
}

/**
 * 导航到空白聊天入口。
 */
function navigateToNewChat(): void {
  window.location.hash = '#/'
}

/**
 * 导航到已有聊天详情入口。
 */
function navigateToChat(): void {
  window.location.hash = '#/chat'
}

/**
 * 按 projectId 过滤会话；null 表示侧边栏里的普通对话空间。
 */
function filterSessionsByProject(
  sessions: SessionRecord[],
  projectId: string | null
): SessionRecord[] {
  return sessions.filter((session) => session.projectId === projectId)
}

/**
 * 返回项目在展开状态集合里的稳定 key。
 */
function getProjectKey(projectId: string | null): string {
  return projectId ?? unboundProjectKey
}

/**
 * 渲染项目树、项目内会话和底部窗口操作入口。
 */
export function WorkspaceSidebar(): React.JSX.Element {
  const sessions = useChatStore(selectChatSessions)
  const sessionsStatus = useChatStore(selectChatSessionsStatus)
  const loadChatSessions = useChatStore((state) => state.loadChatSessions)
  const clearChatDraftAttachments = useChatStore((state) => state.clearChatDraftAttachments)
  const clearChatError = useChatStore((state) => state.clearChatError)
  const clearChatMessages = useChatStore((state) => state.clearChatMessages)
  const deleteChatSession = useChatStore((state) => state.deleteChatSession)
  const projects = useProjectsStore(selectProjects)
  const activeProject = useProjectsStore(selectActiveProject)
  const projectsLoadStatus = useProjectsStore(selectProjectsLoadStatus)
  const loadProjects = useProjectsStore((state) => state.loadProjects)
  const setActiveProject = useProjectsStore((state) => state.setActiveProject)
  const addExistingProjectFolder = useProjectsStore((state) => state.useExistingProjectFolder)
  const deleteProject = useProjectsStore((state) => state.deleteProject)
  const { routeState, setRouteState } = useAppRouterContext()
  const [expandedProjectKeys, setExpandedProjectKeys] = useState<Set<string>>(() => new Set())
  const [collapsedProjectKeys, setCollapsedProjectKeys] = useState<Set<string>>(() => new Set())
  const [isProjectSectionExpanded, setIsProjectSectionExpanded] = useState(true)
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const unboundSessions = useMemo(() => filterSessionsByProject(sessions, null), [sessions])
  const shouldShowConversationSection = activeProject === null || unboundSessions.length > 0
  const activeProjectKey = getProjectKey(activeProject?.id ?? null)

  useEffect(() => {
    if (sessionsStatus === 'idle') {
      void loadChatSessions()
    }
  }, [loadChatSessions, sessionsStatus])

  useEffect(() => {
    if (projectsLoadStatus === 'idle') {
      void loadProjects()
    }
  }, [loadProjects, projectsLoadStatus])

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

  const isProjectExpanded = (projectKey: string): boolean =>
    expandedProjectKeys.has(projectKey) ||
    (projectKey === activeProjectKey && !collapsedProjectKeys.has(projectKey))

  const expandProject = (projectId: string | null): void => {
    const projectKey = getProjectKey(projectId)

    setCollapsedProjectKeys((current) => {
      if (!current.has(projectKey)) {
        return current
      }

      const next = new Set(current)
      next.delete(projectKey)
      return next
    })
    setExpandedProjectKeys((current) => {
      if (current.has(projectKey)) {
        return current
      }

      return new Set([...current, projectKey])
    })
  }

  const toggleProject = (projectId: string | null): void => {
    const projectKey = getProjectKey(projectId)

    if (isProjectExpanded(projectKey)) {
      setExpandedProjectKeys((current) => {
        if (!current.has(projectKey)) {
          return current
        }

        const next = new Set(current)
        next.delete(projectKey)
        return next
      })
      setCollapsedProjectKeys((current) => {
        if (current.has(projectKey)) {
          return current
        }

        return new Set([...current, projectKey])
      })
      return
    }

    expandProject(projectId)
  }

  const selectProject = (projectId: string | null): void => {
    void setActiveProject({ projectId })
    toggleProject(projectId)
  }

  const handleAddExistingProject = async (): Promise<void> => {
    setIsProjectMenuOpen(false)

    const project = await addExistingProjectFolder()

    if (project !== null) {
      expandProject(project.id)
    }
  }

  const handleStartNewChat = async (projectId: string | null): Promise<void> => {
    await setActiveProject({ projectId })
    expandProject(projectId)
    clearChatDraftAttachments()
    clearChatError()
    clearChatMessages()
    setRouteState((state) => ({
      ...state,
      activeChatId: null,
      draftLlmConnectionId: null,
      draftProviderId: null,
      newChatRequestId: createNewChatRequestId()
    }))
    navigateToNewChat()
  }

  const handleSelectSession = async (session: SessionRecord): Promise<void> => {
    await setActiveProject({ projectId: session.projectId })
    expandProject(session.projectId)
    setRouteState((state) => ({
      ...state,
      activeChatId: session.id
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
        draftLlmConnectionId: null,
        draftProviderId: null
      }))
    }
  }

  const handleDeleteProject = async (
    event: MouseEvent<HTMLButtonElement>,
    projectId: string
  ): Promise<void> => {
    event.stopPropagation()

    await deleteProject({ projectId })
    await loadChatSessions()

    setExpandedProjectKeys((current) => {
      const projectKey = getProjectKey(projectId)

      if (!current.has(projectKey)) {
        return current
      }

      const next = new Set(current)
      next.delete(projectKey)
      return next
    })
    setCollapsedProjectKeys((current) => {
      const projectKey = getProjectKey(projectId)

      if (!current.has(projectKey)) {
        return current
      }

      const next = new Set(current)
      next.delete(projectKey)
      return next
    })
  }

  const renderSession = (session: SessionRecord): React.JSX.Element => {
    const isActive = routeState.activeChatId === session.id
    const title = session.title ?? '未命名会话'

    return (
      <div key={session.id} role="listitem">
        <div className="group/session flex h-7 min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent focus-within:bg-accent">
          <button
            type="button"
            aria-current={isActive ? 'page' : undefined}
            className="flex h-full min-w-0 flex-1 items-center rounded-md py-1 pl-2 text-left text-xs leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-current:bg-accent"
            onClick={() => {
              void handleSelectSession(session)
            }}
          >
            <span className="truncate">{title}</span>
          </button>
          <div className="flex h-full shrink-0 items-center justify-end pr-0.5">
            <button
              type="button"
              aria-label={`删除会话 ${title}`}
              className="flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[background-color,color,opacity] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/session:opacity-100"
              onClick={(event) => {
                void handleDeleteSession(event, session.id)
              }}
            >
              <Trash2 aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderProject = (
    project: Pick<ProjectRecord, 'id' | 'name'>,
    projectSessions: SessionRecord[]
  ): React.JSX.Element => {
    const projectId = project.id
    const projectKey = getProjectKey(projectId)
    const isExpanded = isProjectExpanded(projectKey)
    const isActiveProject = activeProject?.id === projectId
    const ProjectIcon = isExpanded ? FolderOpen : Folder
    const title = project.name

    return (
      <section key={projectKey} className="min-w-0">
        <div
          className={cn(
            'group/project flex h-8 min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent focus-within:bg-accent',
            isActiveProject && 'bg-accent'
          )}
        >
          <button
            type="button"
            aria-expanded={isExpanded}
            className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pl-2 text-left text-xs leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              selectProject(projectId)
            }}
          >
            <ProjectIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
            />
            <span className="truncate">{title}</span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
          <div className="flex h-full shrink-0 items-center justify-end gap-0.5 pr-0.5">
            <button
              type="button"
              aria-label={`在 ${title} 下新建对话`}
              className="flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[background-color,color,opacity] hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/project:opacity-100"
              onClick={(event) => {
                event.stopPropagation()
                void handleStartNewChat(projectId)
              }}
            >
              <SquarePen aria-hidden="true" className="size-3" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={`删除项目 ${title}`}
              className="flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[background-color,color,opacity] hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/project:opacity-100"
              onClick={(event) => {
                void handleDeleteProject(event, projectId)
              }}
            >
              <Trash2 aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {isExpanded ? (
          <div role="list" aria-label={`${title} 的会话`} className="mt-1 space-y-1">
            {projectSessions.length === 0 ? (
              <button
                type="button"
                className="flex h-7 w-full min-w-0 rounded-md py-1 pl-2 pr-2 text-left text-xs leading-5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  void handleStartNewChat(projectId)
                }}
              >
                新对话
              </button>
            ) : (
              projectSessions.map(renderSession)
            )}
          </div>
        ) : null}
      </section>
    )
  }

  const renderConversationSection = (): React.JSX.Element => {
    const projectKey = getProjectKey(null)
    const isExpanded = isProjectExpanded(projectKey)

    return (
      <section className="min-w-0">
        <div className="flex h-8 items-center justify-between px-1.5">
          <button
            type="button"
            aria-expanded={isExpanded}
            className="flex min-w-0 items-center gap-1 text-left text-xs font-medium leading-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => toggleProject(null)}
          >
            <span>对话</span>
            <ChevronRight
              aria-hidden="true"
              className={cn('size-3.5 shrink-0 transition-transform', isExpanded && 'rotate-90')}
            />
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="对话更多操作"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ellipsis aria-hidden="true" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="新建对话"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                void handleStartNewChat(null)
              }}
            >
              <SquarePen aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {isExpanded ? (
          <div role="list" aria-label="对话列表" className="mt-1 space-y-1">
            {unboundSessions.length === 0 ? (
              <button
                type="button"
                className="flex h-7 w-full min-w-0 rounded-md py-1 pl-2 pr-2 text-left text-xs leading-5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  void handleStartNewChat(null)
                }}
              >
                新对话
              </button>
            ) : (
              unboundSessions.map(renderSession)
            )}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <aside aria-label="Workspace navigation" className="relative z-30 flex w-52 shrink-0 p-2">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-visible rounded-lg border border-border bg-card">
        <WorkspaceChrome />

        <ScrollArea role="group" aria-label="项目和对话" className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-2 py-3">
            <PopoverPrimitive.Root
              modal={false}
              open={isProjectMenuOpen}
              onOpenChange={setIsProjectMenuOpen}
            >
              <div className="flex h-8 items-center justify-between px-1.5">
                <button
                  type="button"
                  aria-expanded={isProjectSectionExpanded}
                  className="flex min-w-0 items-center gap-1 text-left text-xs font-medium leading-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setIsProjectSectionExpanded((value) => !value)}
                >
                  <span>项目</span>
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 shrink-0 transition-transform',
                      isProjectSectionExpanded && 'rotate-90'
                    )}
                  />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="项目更多操作"
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Ellipsis aria-hidden="true" className="size-3.5" />
                  </button>
                  <PopoverPrimitive.Trigger asChild>
                    <button
                      type="button"
                      aria-label="添加项目"
                      aria-expanded={isProjectMenuOpen}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FolderPlus aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                    </button>
                  </PopoverPrimitive.Trigger>
                </div>
              </div>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                  align="start"
                  collisionPadding={12}
                  side="bottom"
                  sideOffset={6}
                  className="[-webkit-app-region:no-drag] z-50 w-56 max-w-[calc(100vw-1rem)] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      void handleAddExistingProject()
                    }}
                  >
                    <FolderPlus
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span>使用现有文件夹</span>
                  </button>
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>

            <div className="space-y-1">
              {isProjectSectionExpanded
                ? projects.map((project) =>
                    renderProject(project, filterSessionsByProject(sessions, project.id))
                  )
                : null}

              {shouldShowConversationSection ? renderConversationSection() : null}

              {isProjectSectionExpanded &&
              projects.length === 0 &&
              !shouldShowConversationSection ? (
                <div className="px-2 py-6 text-center text-xs leading-5 text-muted-foreground">
                  选择一个文件夹开始项目对话。
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="relative" onMouseEnter={openMoreActions} onMouseLeave={closeMoreActions}>
            {isMoreActionsOpen ? (
              <div className="[-webkit-app-region:no-drag] absolute bottom-full left-0 z-50 mb-2 w-40 rounded-md border border-border bg-card p-1 shadow-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SlidersHorizontal
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>管理提示词应用</span>
                </button>

                <div className="my-1 h-px bg-border" />

                <div className="space-y-1.5">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ImageIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span>图库</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Music4
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span>现场编程</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={handleOpenSettings}
                  >
                    <Settings
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span>设置</span>
                  </button>
                </div>

                <div className="my-1 h-px bg-border" />

                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs leading-4 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MessageSquareMore
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span>Show External Chats</span>
                </button>
              </div>
            ) : null}

            <button
              type="button"
              aria-label="更多操作"
              className="flex size-7 items-center justify-center rounded-md bg-transparent text-foreground transition-[background-color,color,box-shadow] hover:bg-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ellipsis aria-hidden="true" className="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-6 items-center gap-2 rounded-md border border-input bg-secondary px-2.5 text-xs leading-4 text-foreground transition-[background-color,border-color,color] dark:border-primary/20 dark:bg-primary/10 dark:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleFadingArrowUp aria-hidden="true" className="size-3" />
            更新
          </button>
        </div>
      </div>
    </aside>
  )
}
