import { LoaderCircle, SendHorizontal, StopCircle } from 'lucide-react'

import { Button } from '@shadcn/ui/button'

export function SendControls({
  canSend,
  disabled,
  isSending,
  onStop
}: {
  canSend: boolean
  disabled?: boolean
  isSending?: boolean
  onStop?: () => void
}): React.JSX.Element {
  if (isSending && onStop !== undefined) {
    return (
      <Button
        type="button"
        size="icon"
        variant="destructive"
        aria-label="停止生成"
        className="rounded-full"
        disabled={disabled}
        onClick={onStop}
      >
        <StopCircle aria-hidden="true" className="size-4" />
      </Button>
    )
  }

  return (
    <Button
      type="submit"
      size="icon"
      aria-label={isSending ? '发送中' : '发送'}
      className="rounded-full"
      disabled={disabled || isSending || !canSend}
    >
      {isSending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <SendHorizontal aria-hidden="true" className="size-4" />
      )}
    </Button>
  )
}
