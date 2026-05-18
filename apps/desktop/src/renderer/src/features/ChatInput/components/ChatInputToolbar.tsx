import type { ReactNode } from 'react'

import type { ChatInputAction } from '../types'
import { ChatInputActionButton } from './ChatInputActionButton'
import { SendControls } from './SendControls'

export function ChatInputToolbar({
  canSend,
  disabled,
  isSending,
  leftActions,
  leftContent,
  onStop
}: {
  canSend: boolean
  disabled?: boolean
  isSending?: boolean
  leftActions: ChatInputAction[]
  leftContent?: ReactNode
  onStop?: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 px-2 pb-2 pt-1">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {leftContent ??
          leftActions.map((action) => <ChatInputActionButton key={action.id} action={action} />)}
      </div>
      <SendControls canSend={canSend} disabled={disabled} isSending={isSending} onStop={onStop} />
    </div>
  )
}
