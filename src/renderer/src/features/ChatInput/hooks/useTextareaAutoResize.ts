import { useLayoutEffect } from 'react'

function readPixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function useTextareaAutoResize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  options: { maxRows?: number; minRows?: number } = {}
): void {
  const { maxRows = 6, minRows = 2 } = options

  useLayoutEffect(() => {
    const textarea = ref.current

    if (textarea === null) {
      return
    }

    const style = window.getComputedStyle(textarea)
    const fontSize = readPixelValue(style.fontSize) || 16
    const lineHeight = readPixelValue(style.lineHeight) || fontSize * 1.5
    const verticalPadding = readPixelValue(style.paddingTop) + readPixelValue(style.paddingBottom)
    const minHeight = lineHeight * minRows + verticalPadding
    const maxHeight = lineHeight * maxRows + verticalPadding

    textarea.style.height = 'auto'

    const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))

    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [maxRows, minRows, ref, value])
}
