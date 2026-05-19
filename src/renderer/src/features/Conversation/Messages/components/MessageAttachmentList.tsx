import { FileText, ImageIcon, Paperclip } from 'lucide-react'

import type { ChatAttachmentRecord } from '@shared/domain/chat'

export function MessageAttachmentList({
  attachments
}: {
  attachments: ChatAttachmentRecord[]
}): React.JSX.Element | null {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => {
        const Icon =
          attachment.kind === 'image'
            ? ImageIcon
            : attachment.kind === 'file'
              ? FileText
              : Paperclip

        return (
          <span
            key={attachment.id}
            className="inline-flex min-w-0 max-w-48 items-center gap-1.5 rounded-md border border-current/15 bg-background/15 px-2 py-1 text-xs leading-4"
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{attachment.name}</span>
          </span>
        )
      })}
    </div>
  )
}
