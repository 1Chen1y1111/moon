import { FileText, ImageIcon, LoaderCircle, Paperclip, X } from 'lucide-react'

import { Button } from '@shadcn/ui/button'

import type { ChatInputAttachment } from '../types'

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
          data-status={attachment.status}
          className="flex min-w-0 max-w-64 items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground data-[status=error]:border-destructive/40 data-[status=error]:bg-destructive/10"
        >
          {attachment.status === 'importing' ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            />
          ) : attachment.kind === 'image' ? (
            <ImageIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : attachment.kind === 'file' ? (
            <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {attachment.previewUrl !== undefined ? (
            <img
              alt=""
              className="size-6 shrink-0 rounded-sm object-cover"
              src={attachment.previewUrl}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
          {attachment.status === 'error' && attachment.error ? (
            <span className="max-w-28 shrink-0 truncate text-destructive">{attachment.error}</span>
          ) : null}
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
