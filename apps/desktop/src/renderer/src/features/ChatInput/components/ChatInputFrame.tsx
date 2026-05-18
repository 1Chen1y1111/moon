import { cn } from '@moon/ui/lib/utils'

export function ChatInputFrame({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/30',
        className
      )}
    >
      {children}
    </div>
  )
}
