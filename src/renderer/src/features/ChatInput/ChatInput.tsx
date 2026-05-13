import { AttachmentTray } from './components/AttachmentTray'
import { ChatInputFrame } from './components/ChatInputFrame'
import { ChatInputToolbar } from './components/ChatInputToolbar'
import { PlainTextComposer } from './components/PlainTextComposer'
import { RuntimeBar } from './components/RuntimeBar'
import type { ChatInputProps } from './ChatInput.types'

export function ChatInput({
  attachments = [],
  disabled,
  isSending,
  leftActions = [],
  leftContent,
  maxRows = 10,
  minRows = 2,
  placeholder = '从任何想法开始… 按 shift + enter 换行…',
  runtimeInfo,
  value,
  onAttachmentRemove,
  onChange,
  onSend,
  onStop
}: ChatInputProps): React.JSX.Element {
  const hasReadyAttachment =
    attachments.length > 0 &&
    attachments.every(
      (attachment) => attachment.status === undefined || attachment.status === 'success'
    )
  const hasBusyAttachment = attachments.some((attachment) => attachment.status === 'importing')
  const hasFailedAttachment = attachments.some((attachment) => attachment.status === 'error')
  const canSend =
    !disabled &&
    !isSending &&
    !hasBusyAttachment &&
    !hasFailedAttachment &&
    (value.trim().length > 0 || hasReadyAttachment)

  function handleSend(): void {
    if (!canSend) {
      return
    }

    onSend()
  }

  return (
    <form
      aria-label="发送消息"
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        handleSend()
      }}
    >
      <ChatInputFrame>
        <AttachmentTray attachments={attachments} onRemove={onAttachmentRemove} />
        <PlainTextComposer
          disabled={disabled}
          maxRows={maxRows}
          minRows={minRows}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onSend={handleSend}
        />
        <ChatInputToolbar
          canSend={canSend}
          disabled={disabled}
          isSending={isSending}
          leftContent={leftContent}
          leftActions={leftActions}
          onStop={onStop}
        />
      </ChatInputFrame>
      <RuntimeBar runtimeInfo={runtimeInfo} />
    </form>
  )
}
