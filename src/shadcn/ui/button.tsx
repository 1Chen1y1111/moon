import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@shadcn/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-moon-control border border-transparent bg-clip-padding text-moon-body font-moon-title leading-moon-body whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-moon-icon",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-moon-button-primary-bg-hover',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input dark:hover:bg-muted',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-moon-button-secondary-bg-hover aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted',
        destructive:
          'border-moon-state-danger bg-secondary text-moon-state-danger hover:bg-moon-button-secondary-bg-hover focus-visible:border-moon-state-danger',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default:
          'h-moon-window-button-y gap-moon-tight px-moon-control-x has-data-[icon=inline-end]:pr-moon-md has-data-[icon=inline-start]:pl-moon-md',
        xs: "h-moon-compact-control gap-moon-sm rounded-moon-compact px-moon-md text-moon-caption leading-moon-caption in-data-[slot=button-group]:rounded-moon-control has-data-[icon=inline-end]:pr-moon-tight has-data-[icon=inline-start]:pl-moon-tight [&_svg:not([class*='size-'])]:size-moon-icon-xs",
        sm: "h-moon-control-sm gap-moon-sm rounded-moon-control px-moon-control-x text-moon-button-sm in-data-[slot=button-group]:rounded-moon-control has-data-[icon=inline-end]:pr-moon-tight has-data-[icon=inline-start]:pl-moon-tight [&_svg:not([class*='size-'])]:size-moon-icon-sm",
        lg: 'h-moon-control-lg gap-moon-tight px-moon-control-x has-data-[icon=inline-end]:pr-moon-nav-x has-data-[icon=inline-start]:pl-moon-nav-x',
        icon: 'size-moon-window-button-y',
        'icon-xs':
          "size-moon-compact-control rounded-moon-compact in-data-[slot=button-group]:rounded-moon-control [&_svg:not([class*='size-'])]:size-moon-icon-xs",
        'icon-sm':
          'size-moon-control-sm rounded-moon-control in-data-[slot=button-group]:rounded-moon-control',
        'icon-lg': 'size-moon-control-lg'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }): React.JSX.Element {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
