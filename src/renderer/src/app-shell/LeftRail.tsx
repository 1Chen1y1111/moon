import { useEffect, useRef, useState } from 'react'
import {
  Ellipsis,
  ImageIcon,
  MessageSquareMore,
  Music4,
  Settings,
  SlidersHorizontal,
  CircleFadingArrowUp
} from 'lucide-react'

import { WindowChrome } from './WindowChrome'

export function LeftRail(): React.JSX.Element {
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

  return (
    <aside aria-label="Workspace navigation" className="flex w-58 shrink-0 p-2">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-moon-sidebar-border bg-moon-sidebar-bg shadow-[0_28px_80px_rgba(5,8,15,0.45)]">
        <WindowChrome />
        <div
          role="group"
          aria-label="Primary actions"
          className="flex flex-1 flex-col gap-2 px-3 py-4"
        >
          <button
            type="button"
            className="flex h-11 items-center rounded-2xl px-4 text-left text-xs font-medium text-moon-text-secondary transition-colors hover:bg-white/[0.03] hover:text-moon-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            清除历史
          </button>
          <button
            type="button"
            className="flex h-11 items-center rounded-2xl border border-white/6 bg-white/[0.04] px-4 text-left text-xs font-medium text-moon-text-primary transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            新建聊天
          </button>
        </div>

        <div className="flex items-center justify-between px-3 pb-3">
          <div
            className="relative"
            onMouseEnter={openMoreActions}
            onMouseLeave={closeMoreActions}
          >
            {isMoreActionsOpen ? (
              <div className="absolute bottom-full left-0 mb-2 w-48 rounded-md border border-moon-panel-border bg-moon-sidebar-bg p-1 shadow-[0_18px_40px_rgba(5,8,15,0.45)]">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-moon-text-primary transition-colors hover:bg-[#3f6687] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                >
                  <SlidersHorizontal
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-moon-text-secondary"
                  />
                  <span>管理提示词应用</span>
                </button>

                <div className="my-1 h-px bg-moon-sidebar-border" />

                <div className="space-y-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-moon-text-primary transition-colors hover:bg-[#3f6687] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                  >
                    <ImageIcon
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-moon-text-secondary"
                    />
                    <span>图库</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-moon-text-primary transition-colors hover:bg-[#3f6687] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                  >
                    <Music4
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-moon-text-secondary"
                    />
                    <span>现场编程</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-moon-text-primary transition-colors hover:bg-[#3f6687] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                  >
                    <Settings
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-moon-text-secondary"
                    />
                    <span>设置</span>
                  </button>
                </div>

                <div className="my-1 h-px bg-moon-sidebar-border" />

                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-moon-text-primary transition-colors hover:bg-[#3f6687] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
                >
                  <MessageSquareMore
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-moon-text-secondary"
                  />
                  <span>Show External Chats</span>
                </button>
              </div>
            ) : null}

            <button
              type="button"
              aria-label="更多操作"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-moon-text-primary transition-[background-color,color,box-shadow] hover:bg-[#3a5674] hover:shadow-[0_18px_40px_rgba(46,87,124,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
            >
              <Ellipsis aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-6 items-center gap-2 rounded-sm border px-2 text-xs text-moon-accent transition-[background-color,border-color,color,box-shadow] border-[#3f6687] bg-[#31475f] shadow-[0_18px_40px_rgba(46,87,124,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moon-accent"
          >
            <CircleFadingArrowUp aria-hidden="true" className="h-3 w-3" />
            更新
          </button>
        </div>
      </div>
    </aside>
  )
}
