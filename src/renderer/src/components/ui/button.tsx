import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-zinc-900 text-zinc-50 hover:bg-zinc-800',
        secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
        ghost: 'text-zinc-900 hover:bg-zinc-100'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-10 rounded-md px-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

function Button({ className, variant, size, ...props }: ButtonProps): React.JSX.Element {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
