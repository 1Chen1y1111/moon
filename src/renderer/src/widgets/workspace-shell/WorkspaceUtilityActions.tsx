import { PanelLeftClose, Search, SquarePen } from 'lucide-react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { Tooltip, TooltipProvider, TooltipTrigger } from '@shadcn/ui/tooltip'

const utilityCardClassName =
  'flex size-moon-compact-control cursor-default select-none items-center justify-center rounded-moon-compact border border-transparent text-moon-text-secondary transition-[background-color,border-color,color,transform] duration-200 ease-out group-hover:border-moon-button-secondary-border group-hover:bg-moon-button-ghost-bg-hover group-hover:text-moon-text-primary'

const utilityTooltipClassName =
  'z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-moon-tight rounded-moon-control border border-moon-tooltip-border bg-moon-tooltip-bg px-moon-lg py-moon-sm text-moon-caption font-moon-title leading-moon-caption text-moon-tooltip-fg shadow-moon-tooltip data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'

function WorkspaceTooltipContent({ children }: { children: string }): React.JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        side="bottom"
        sideOffset={8}
        className={utilityTooltipClassName}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export function WorkspaceUtilityActions(): React.JSX.Element {
  return (
    <TooltipProvider>
      <div className="moon-window-no-drag relative z-20 flex items-center gap-moon-tight">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group" data-testid="window-chrome-collapse-trigger">
              <div className={utilityCardClassName}>
                <PanelLeftClose
                  aria-hidden="true"
                  className="size-moon-icon-xs"
                  strokeWidth={1.75}
                />
              </div>
            </div>
          </TooltipTrigger>
          <WorkspaceTooltipContent>折叠侧边栏</WorkspaceTooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group" data-testid="window-chrome-search-trigger">
              <div className={utilityCardClassName}>
                <Search aria-hidden="true" className="size-moon-icon-xs" strokeWidth={1.75} />
              </div>
            </div>
          </TooltipTrigger>
          <WorkspaceTooltipContent>搜索</WorkspaceTooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group" data-testid="window-chrome-compose-trigger">
              <div className={utilityCardClassName}>
                <SquarePen aria-hidden="true" className="size-moon-icon-xs" strokeWidth={1.75} />
              </div>
            </div>
          </TooltipTrigger>
          <WorkspaceTooltipContent>新建聊天</WorkspaceTooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
