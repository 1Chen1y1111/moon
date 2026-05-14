import { Button } from '@shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@shadcn/ui/tooltip'

import type { ChatInputAction } from '../types'

export function ChatInputActionButton({ action }: { action: ChatInputAction }): React.JSX.Element {
  const Icon = action.icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={action.label}
            aria-pressed={action.pressed}
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <Icon aria-hidden="true" className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{action.label}</TooltipContent>
    </Tooltip>
  )
}
