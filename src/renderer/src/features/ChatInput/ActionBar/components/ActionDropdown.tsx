import type { CSSProperties, ReactNode } from 'react'
import { isValidElement, useCallback, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'

import { cn } from '@shadcn/lib/utils'

import type { ActionPopupTrigger, DropdownPlacement } from '../context'
import { getPopupPlacement, useHoverOpen } from './popup'

export type ActionDropdownItem =
  | {
      key?: string
      type: 'divider'
    }
  | {
      closeOnSelect?: boolean
      destructive?: boolean
      disabled?: boolean
      icon?: LucideIcon
      key: string
      label: ReactNode
      onSelect?: (event: Event) => void
      selected?: boolean
      type?: 'item'
    }

export interface ActionDropdownProps {
  children?: ReactNode
  className?: string
  contentClassName?: string
  contentStyle?: CSSProperties
  defaultOpen?: boolean
  disabled?: boolean
  items: ActionDropdownItem[] | (() => ActionDropdownItem[])
  maxHeight?: number | string
  maxWidth?: number | string
  minHeight?: number | string
  minWidth?: number | string
  onOpenChange?: (open: boolean) => void
  open?: boolean
  placement?: DropdownPlacement
  sideOffset?: number
  trigger?: ActionPopupTrigger
}

export default function ActionDropdown({
  children,
  className,
  contentClassName,
  contentStyle,
  defaultOpen,
  disabled,
  items,
  maxHeight,
  maxWidth,
  minHeight,
  minWidth,
  onOpenChange,
  open,
  placement = 'top',
  sideOffset = 8,
  trigger
}: ActionDropdownProps): React.JSX.Element {
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
  const resolvedItems = useMemo(() => (typeof items === 'function' ? items() : items), [items])

  return (
    <DropdownMenuPrimitive.Root modal={false} open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuPrimitive.Trigger asChild disabled={disabled} {...hoverProps}>
        {children}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          {...hoverProps}
          className={cn(
            'z-50 flex w-[calc(100vw-1rem)] min-w-44 max-w-[calc(100vw-1rem)] flex-col gap-1 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none sm:w-auto',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            contentClassName
          )}
          style={{
            maxHeight,
            maxWidth,
            minHeight,
            minWidth,
            ...contentStyle
          }}
        >
          <div className={className}>
            {resolvedItems.map((item, index) => {
              if (item.type === 'divider') {
                return (
                  <DropdownMenuPrimitive.Separator
                    key={item.key ?? `divider-${index}`}
                    className="-mx-1 my-1 h-px bg-border"
                  />
                )
              }

              const Icon = item.icon
              const shouldClose = item.closeOnSelect ?? (isValidElement(item.label) ? false : true)

              return (
                <DropdownMenuPrimitive.Item
                  key={item.key}
                  disabled={item.disabled}
                  className={cn(
                    'flex min-h-8 min-w-0 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm leading-5 outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                    item.destructive && 'text-destructive focus:text-destructive'
                  )}
                  onSelect={(event) => {
                    if (!shouldClose) event.preventDefault()
                    item.onSelect?.(event)
                  }}
                >
                  {Icon ? (
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.selected ? (
                    <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  ) : null}
                </DropdownMenuPrimitive.Item>
              )
            })}
          </div>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
