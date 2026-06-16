/**
 * 负责渲染 workspace chrome 右侧的快捷工具按钮和 tooltip。
 * 这里只处理展示与提示，不直接执行工具命令。
 */

import { PanelLeftClose, Search, SquarePen } from 'lucide-react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { Tooltip, TooltipTrigger } from '@moon/ui/ui/tooltip'

const utilityCardClassName =
  'flex size-5 cursor-default select-none items-center justify-center rounded-md border border-transparent text-muted-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out group-hover:border-input group-hover:bg-accent group-hover:text-foreground'

const utilityTooltipClassName =
  'z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md border border-border bg-popover px-3 py-1 text-xs font-medium leading-4 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'

/**
 * 渲染 portal tooltip content，避免提示被 sidebar 裁切。
 */
function WorkspaceTooltipContent({ children }: { children: string }): React.JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        side="bottom"
        sideOffset={6}
        className={utilityTooltipClassName}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * 渲染顶部工具按钮组。
 */
export function WorkspaceUtilityActions(): React.JSX.Element {
  return (
    <div className="[-webkit-app-region:no-drag] relative z-20 flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="group" data-testid="window-chrome-collapse-trigger">
            <div className={utilityCardClassName}>
              <PanelLeftClose aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </div>
          </div>
        </TooltipTrigger>
        <WorkspaceTooltipContent>折叠侧边栏</WorkspaceTooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="group" data-testid="window-chrome-search-trigger">
            <div className={utilityCardClassName}>
              <Search aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </div>
          </div>
        </TooltipTrigger>
        <WorkspaceTooltipContent>搜索</WorkspaceTooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="group" data-testid="window-chrome-compose-trigger">
            <div className={utilityCardClassName}>
              <SquarePen aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </div>
          </div>
        </TooltipTrigger>
        <WorkspaceTooltipContent>新建聊天</WorkspaceTooltipContent>
      </Tooltip>
    </div>
  )
}
