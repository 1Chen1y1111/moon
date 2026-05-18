import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '@moon/ui/lib/utils'

import type { ActionPopupTrigger, DropdownPlacement } from '../context'
import { getPopupPlacement, useHoverOpen } from './popup'

export interface ActionPopoverProps {
  children?: ReactNode
  className?: string
  content?: ReactNode
  contentClassName?: string
  contentStyle?: CSSProperties
  defaultOpen?: boolean
  disabled?: boolean
  extra?: ReactNode
  loading?: boolean
  maxHeight?: number | string
  maxWidth?: number | string
  minWidth?: number | string
  onOpenChange?: (open: boolean) => void
  open?: boolean
  placement?: DropdownPlacement
  sideOffset?: number
  title?: ReactNode
  trigger?: ActionPopupTrigger
}

export default function ActionPopover({
  children,
  className,
  content,
  contentClassName,
  contentStyle,
  defaultOpen,
  disabled,
  extra,
  loading,
  maxHeight,
  maxWidth,
  minWidth,
  onOpenChange,
  open,
  placement = 'top',
  sideOffset = 8,
  title,
  trigger
}: ActionPopoverProps): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(Boolean(defaultOpen))
  const isOpen = open ?? internalOpen
  const { align, side } = getPopupPlacement(placement)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (disabled && nextOpen) return
      if (open === undefined) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [disabled, onOpenChange, open]
  )

  const hoverProps = useHoverOpen(trigger, disabled, handleOpenChange)

  return (
    <PopoverPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild {...hoverProps}>
        {children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          {...hoverProps}
          className={cn(
            'z-50 w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none sm:w-auto',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            contentClassName
          )}
          style={{
            maxHeight,
            maxWidth,
            minWidth,
            ...contentStyle
          }}
        >
          {title ? (
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 text-sm font-medium leading-6 text-foreground">{title}</div>
              <div className="flex shrink-0 items-center gap-2">
                {extra}
                {loading ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin text-muted-foreground"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          <div className={className}>{content}</div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
