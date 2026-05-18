import { useRef } from 'react'

import { Textarea } from '@moon/ui/ui/textarea'
import { cn } from '@moon/ui/lib/utils'

import { useTextareaAutoResize } from '../hooks/useTextareaAutoResize'

export function PlainTextComposer({
  disabled,
  maxRows,
  minRows,
  placeholder,
  value,
  onChange,
  onSend
}: {
  disabled?: boolean
  maxRows: number
  minRows: number
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onSend: () => void
}): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useTextareaAutoResize(textareaRef, value, { maxRows, minRows })

  return (
    <Textarea
      ref={textareaRef}
      aria-label="消息内容"
      disabled={disabled}
      placeholder={placeholder}
      rows={minRows}
      value={value}
      className={cn(
        'max-h-80 min-h-9 resize-none rounded-none border-0 bg-transparent px-4 py-2.5 text-sm leading-6 shadow-none outline-none focus-visible:border-transparent focus-visible:ring-0 md:text-sm'
      )}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
          return
        }

        event.preventDefault()
        onSend()
      }}
    />
  )
}
