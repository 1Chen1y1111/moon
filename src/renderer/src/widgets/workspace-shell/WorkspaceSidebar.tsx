import { useEffect, useRef, useState } from 'react'
import {
  CircleFadingArrowUp,
  Ellipsis,
  ImageIcon,
  MessageSquareMore,
  Music4,
  Settings,
  SlidersHorizontal
} from 'lucide-react'

import { WorkspaceChrome } from './WorkspaceChrome'

export function WorkspaceSidebar(): React.JSX.Element {
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

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

  return (
    <aside
      aria-label="Workspace navigation"
      className="flex w-moon-workspace-sidebar shrink-0 p-moon-md"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-moon-panel border border-moon-border-subtle bg-moon-surface-1">
        <WorkspaceChrome />
        <div
          role="group"
          aria-label="Primary actions"
          className="flex flex-1 flex-col gap-moon-md px-moon-nav-x py-moon-lg"
        >
          <button
            type="button"
            className="flex h-moon-field items-center rounded-moon-control px-moon-lg text-left text-moon-caption font-moon-title leading-moon-caption text-moon-text-secondary transition-colors hover:bg-moon-button-ghost-bg-hover hover:text-moon-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            清除历史
          </button>
          <button
            type="button"
            className="flex h-moon-field items-center rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-left text-moon-caption font-moon-title leading-moon-caption text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            新建聊天
          </button>
        </div>

        <div className="flex items-center justify-between px-moon-nav-x pb-moon-option-gap">
          <div className="relative" onMouseEnter={openMoreActions} onMouseLeave={closeMoreActions}>
            {isMoreActionsOpen ? (
              <div className="absolute bottom-full left-0 mb-moon-md w-[12rem] rounded-moon-control border border-moon-border-default bg-moon-surface-1 p-moon-sm shadow-moon-whisper">
                <button
                  type="button"
                  className="flex w-full items-center gap-moon-md rounded-moon-control px-moon-nav-x py-moon-md text-left text-moon-caption leading-moon-caption text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                >
                  <SlidersHorizontal
                    aria-hidden="true"
                    className="size-moon-icon shrink-0 text-moon-text-secondary"
                  />
                  <span>管理提示词应用</span>
                </button>

                <div className="my-moon-sm h-moon-hairline bg-moon-border-subtle" />

                <div className="space-y-moon-sm">
                  <button
                    type="button"
                    className="flex w-full items-center gap-moon-md rounded-moon-control px-moon-nav-x py-moon-md text-left text-moon-caption leading-moon-caption text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                  >
                    <ImageIcon
                      aria-hidden="true"
                      className="size-moon-icon shrink-0 text-moon-text-secondary"
                    />
                    <span>图库</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-moon-md rounded-moon-control px-moon-nav-x py-moon-md text-left text-moon-caption leading-moon-caption text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                  >
                    <Music4
                      aria-hidden="true"
                      className="size-moon-icon shrink-0 text-moon-text-secondary"
                    />
                    <span>现场编程</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-moon-md rounded-moon-control px-moon-nav-x py-moon-md text-left text-moon-caption leading-moon-caption text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                    onClick={handleOpenSettings}
                  >
                    <Settings
                      aria-hidden="true"
                      className="size-moon-icon shrink-0 text-moon-text-secondary"
                    />
                    <span>设置</span>
                  </button>
                </div>

                <div className="my-moon-sm h-moon-hairline bg-moon-border-subtle" />

                <button
                  type="button"
                  className="flex w-full items-center gap-moon-md rounded-moon-control px-moon-nav-x py-moon-md text-left text-moon-caption leading-moon-caption text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                >
                  <MessageSquareMore
                    aria-hidden="true"
                    className="size-moon-icon shrink-0 text-moon-text-secondary"
                  />
                  <span>Show External Chats</span>
                </button>
              </div>
            ) : null}

            <button
              type="button"
              aria-label="更多操作"
              className="flex size-moon-window-button-y items-center justify-center rounded-moon-control bg-transparent text-moon-text-primary transition-[background-color,color,box-shadow] hover:bg-moon-button-ghost-bg-hover hover:shadow-moon-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
            >
              <Ellipsis aria-hidden="true" className="size-moon-icon" />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-moon-compact-control items-center gap-moon-md rounded-moon-compact border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-md text-moon-label leading-moon-label text-moon-text-primary transition-[background-color,border-color,color] dark:border-moon-accent-soft-border dark:bg-moon-accent-soft dark:text-moon-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            <CircleFadingArrowUp aria-hidden="true" className="size-moon-icon-xs" />
            更新
          </button>
        </div>
      </div>
    </aside>
  )
}
