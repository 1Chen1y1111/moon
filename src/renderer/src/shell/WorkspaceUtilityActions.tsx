import { PanelLeftClose, Search, SquarePen } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shadcn/ui/tooltip'

const utilityCardClassName =
  'flex h-6 w-6 cursor-default select-none items-center justify-center rounded-sm text-moon-text-secondary transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out group-hover:bg-moon-menu-item-bg-hover group-hover:border-moon-menu-item-border-hover group-hover:text-moon-fg-inverse group-hover:shadow-[var(--moon-shadow-menu-hover)]'

export function WorkspaceUtilityActions(): React.JSX.Element {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group" data-testid="window-chrome-collapse-trigger">
              <div className={utilityCardClassName}>
                <PanelLeftClose aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={8}
            className="rounded-lg border border-moon-tooltip-border bg-moon-tooltip-bg px-4 py-1 text-xs font-medium text-moon-tooltip-fg shadow-[var(--moon-shadow-tooltip)]"
          >
            折叠侧边栏
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group" data-testid="window-chrome-search-trigger">
              <div className={utilityCardClassName}>
                <Search aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={8}
            className="rounded-lg border border-moon-tooltip-border bg-moon-tooltip-bg px-4 py-1 text-xs font-medium text-moon-tooltip-fg shadow-[var(--moon-shadow-tooltip)]"
          >
            搜索
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group" data-testid="window-chrome-compose-trigger">
              <div className={utilityCardClassName}>
                <SquarePen aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={8}
            className="rounded-lg border border-moon-tooltip-border bg-moon-tooltip-bg px-4 py-1 text-xs font-medium text-moon-tooltip-fg shadow-[var(--moon-shadow-tooltip)]"
          >
            新建聊天
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
