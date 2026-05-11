import { Paperclip, X } from 'lucide-react'

import { Button } from '@shadcn/ui/button'

import type { ChatInputAttachment } from '../ChatInput.types'

export function AttachmentTray({
  attachments,
  onRemove
}: {
  attachments: ChatInputAttachment[]
  onRemove?: (id: string) => void
}): React.JSX.Element | null {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 px-3 pb-1 pt-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex min-w-0 max-w-56 items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
        >
          <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{attachment.name}</span>
          {onRemove === undefined ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`移除附件 ${attachment.name}`}
              className="-mr-1 text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(attachment.id)}
            >
              <X aria-hidden="true" className="size-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
