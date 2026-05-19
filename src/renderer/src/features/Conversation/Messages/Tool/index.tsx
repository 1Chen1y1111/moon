import { Wrench } from 'lucide-react'

import type { ToolInvocationRecord } from '@shared/domain/chat'

export function ToolInvocationList({
  toolInvocations
}: {
  toolInvocations?: ToolInvocationRecord[]
}): React.JSX.Element | null {
  if (toolInvocations === undefined || toolInvocations.length === 0) {
    return null
  }

  return (
    <div className="mt-2 space-y-1.5">
      {toolInvocations.map((toolInvocation) => (
        <div
          key={toolInvocation.id}
          className="rounded-md border border-border bg-background/70 px-2 py-1.5 text-xs leading-5"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <Wrench aria-hidden="true" className="size-3.5" />
            {toolInvocation.name}
            <span className="ml-auto text-muted-foreground">{toolInvocation.status}</span>
          </div>
          {toolInvocation.error === undefined || toolInvocation.error === null ? null : (
            <div className="mt-1 text-destructive">{toolInvocation.error}</div>
          )}
        </div>
      ))}
    </div>
  )
}
