import type { MouseEventHandler, ReactNode } from 'react'
import { useCallback, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'

import { cn } from '@moon/ui/lib/utils'
import { Button } from '@moon/ui/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@moon/ui/ui/tooltip'

import type { ActionPopupTrigger } from '../context'
import { useActionBarContext } from '../context'
import ActionDropdown, { type ActionDropdownProps } from './ActionDropdown'
import ActionPopover, { type ActionPopoverProps } from './ActionPopover'

interface ActionProps {
  defaultOpen?: boolean
  disabled?: boolean
  dropdown?: Omit<
    ActionDropdownProps,
    'children' | 'defaultOpen' | 'disabled' | 'onOpenChange' | 'open' | 'trigger'
  >
  icon: LucideIcon
  iconNode?: ReactNode
  loading?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
  popover?: Omit<
    ActionPopoverProps,
    'children' | 'defaultOpen' | 'disabled' | 'onOpenChange' | 'open' | 'trigger'
  >
  pressed?: boolean
  showTooltip?: boolean
  title: string
  trigger?: ActionPopupTrigger
  onClick?: MouseEventHandler<HTMLButtonElement>
}

export default function Action({
  defaultOpen,
  disabled,
  dropdown,
  icon: Icon,
  iconNode,
  loading,
  onOpenChange,
  open,
  popover,
  pressed,
  showTooltip,
  title,
  trigger,
  onClick
}: ActionProps): React.JSX.Element {
  const { actionSize, borderRadius, dropdownPlacement } = useActionBarContext()
  const blockSize = actionSize?.blockSize ?? 32
  const iconSize = actionSize?.size ?? 16
  const [internalOpen, setInternalOpen] = useState(Boolean(defaultOpen))
  const isOpen = open ?? internalOpen
  const hasPopup = Boolean(dropdown || popover)
  const inactive = disabled || loading
  const shouldShowTooltip = showTooltip ?? !hasPopup

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (inactive && nextOpen) return
      if (open === undefined) setInternalOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [inactive, onOpenChange, open]
  )

  const iconClassName = cn(
    'transition-transform duration-150 group-active/button:scale-90',
    loading && 'animate-spin'
  )
  const iconStyle = {
    height: iconSize,
    width: iconSize
  }
  const renderedIcon = loading ? (
    <LoaderCircle aria-hidden="true" className={iconClassName} style={iconStyle} />
  ) : iconNode ? (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center', iconClassName)}
      style={iconStyle}
    >
      {iconNode}
    </span>
  ) : (
    <Icon aria-hidden="true" className={iconClassName} style={iconStyle} />
  )
  const buttonNode = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={title}
      aria-busy={loading || undefined}
      aria-disabled={inactive}
      aria-expanded={hasPopup ? isOpen : undefined}
      aria-haspopup={dropdown ? 'menu' : popover ? 'dialog' : undefined}
      aria-pressed={pressed}
      className={cn(
        'rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/80 aria-pressed:bg-primary/10 aria-pressed:text-primary',
        inactive && 'opacity-60'
      )}
      style={{
        borderRadius,
        height: blockSize,
        width: blockSize
      }}
      onClick={(event) => {
        if (inactive) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        onClick?.(event)
      }}
    >
      {renderedIcon}
    </Button>
  )

  const triggerNode = shouldShowTooltip ? (
    <TooltipTrigger asChild>{buttonNode}</TooltipTrigger>
  ) : (
    buttonNode
  )
  const actionNode = dropdown ? (
    <ActionDropdown
      {...dropdown}
      disabled={inactive}
      open={isOpen}
      placement={dropdownPlacement ?? dropdown.placement}
      trigger={trigger}
      onOpenChange={handleOpenChange}
    >
      {triggerNode}
    </ActionDropdown>
  ) : popover ? (
    <ActionPopover
      {...popover}
      disabled={inactive}
      loading={loading}
      open={isOpen}
      placement={dropdownPlacement ?? popover.placement}
      trigger={trigger}
      onOpenChange={handleOpenChange}
    >
      {triggerNode}
    </ActionPopover>
  ) : (
    triggerNode
  )

  if (!shouldShowTooltip) return actionNode

  return (
    <Tooltip>
      {actionNode}
      <TooltipContent side="bottom" sideOffset={6}>
        {title}
      </TooltipContent>
    </Tooltip>
  )
}
