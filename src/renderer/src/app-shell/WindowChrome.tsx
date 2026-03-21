import { PanelLeftClose, Search, SquarePen } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shadcn/ui/tooltip'

const utilityCardClassName =
  'flex h-6 w-6 cursor-default select-none items-center justify-center rounded-sm text-moon-text-secondary transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out group-hover:bg-[#3f6687] group-hover:border-[#4d7392] group-hover:text-white group-hover:shadow-[0_18px_40px_rgba(46,87,124,0.38)]'

const trafficLightButtonClassName =
  'h-3 w-3 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50'

export function WindowChrome(): React.JSX.Element {
  const handleClose = (): void => {
    void window.api.windowControls.close()
  }

  const handleMinimize = (): void => {
    void window.api.windowControls.minimize()
  }

  const handleToggleMaximize = (): void => {
    void window.api.windowControls.toggleMaximize()
  }

  return (
    <header className="flex items-center justify-between border-b border-moon-sidebar-border p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="关闭窗口"
          className={`${trafficLightButtonClassName} bg-[#ff5f57]`}
          onClick={handleClose}
        />
        <button
          type="button"
          aria-label="最小化窗口"
          className={`${trafficLightButtonClassName} bg-[#ffbd2e]`}
          onClick={handleMinimize}
        />
        <button
          type="button"
          aria-label="切换缩放窗口"
          className={`${trafficLightButtonClassName} bg-[#28c840]`}
          onClick={handleToggleMaximize}
        />
      </div>

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
              className="rounded-lg border border-white/10 bg-[#262b34] px-4 py-1 text-xs font-medium text-white shadow-[0_18px_50px_rgba(6,9,14,0.45)]"
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
              className="rounded-lg border border-white/10 bg-[#262b34] px-4 py-1 text-xs font-medium text-white shadow-[0_18px_50px_rgba(6,9,14,0.45)]"
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
              className="rounded-lg border border-white/10 bg-[#262b34] px-4 py-1 text-xs font-medium text-white shadow-[0_18px_50px_rgba(6,9,14,0.45)]"
            >
              新建聊天
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  )
}
