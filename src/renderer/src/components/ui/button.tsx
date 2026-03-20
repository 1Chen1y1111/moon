import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'

import { cn } from '@renderer/lib/utils'
import { buttonVariants } from '@renderer/components/ui/button-variants'

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
}

export { Button }
