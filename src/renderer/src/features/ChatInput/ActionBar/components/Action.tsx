import type { MouseEventHandler } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@shadcn/lib/utils'
import { Button } from '@shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@shadcn/ui/tooltip'

import { useActionBarContext } from '../context'

interface ActionProps {
  disabled?: boolean
  icon: LucideIcon
  pressed?: boolean
  title: string
  onClick?: MouseEventHandler<HTMLButtonElement>
}

export default function Action({
  disabled,
  icon: Icon,
  pressed,
  title,
  onClick
}: ActionProps): React.JSX.Element {
  const { actionSize } = useActionBarContext()
  const blockSize = actionSize?.blockSize ?? 32
  const iconSize = actionSize?.size ?? 16

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={title}
            aria-disabled={disabled}
            aria-pressed={pressed}
            className={cn(
              'rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/80 aria-pressed:bg-primary/10 aria-pressed:text-primary',
              disabled && 'opacity-60'
            )}
            style={{
              height: blockSize,
              width: blockSize
            }}
            onClick={(event) => {
              if (disabled) {
                event.preventDefault()
                event.stopPropagation()
                return
              }

              onClick?.(event)
            }}
          >
            <Icon
              aria-hidden="true"
              className="transition-transform duration-150 group-active/button:scale-90"
              style={{
                height: iconSize,
                width: iconSize
              }}
            />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}
