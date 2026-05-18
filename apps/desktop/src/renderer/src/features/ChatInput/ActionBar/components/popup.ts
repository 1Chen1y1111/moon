import { useCallback, useEffect, useRef } from 'react'

import type { ActionPopupTrigger, DropdownPlacement } from '../context'

type PopupSide = 'bottom' | 'top'
type PopupAlign = 'center' | 'end' | 'start'

export function getPopupPlacement(placement: DropdownPlacement = 'top'): {
  align: PopupAlign
  side: PopupSide
} {
  if (placement === 'bottomLeft') return { align: 'start', side: 'bottom' }
  if (placement === 'bottomRight') return { align: 'end', side: 'bottom' }
  if (placement === 'topLeft') return { align: 'start', side: 'top' }
  if (placement === 'topRight') return { align: 'end', side: 'top' }

  return {
    align: 'center',
    side: placement === 'bottom' ? 'bottom' : 'top'
  }
}

export function useHoverOpen(
  trigger: ActionPopupTrigger | undefined,
  disabled: boolean | undefined,
  setOpen: (open: boolean) => void
): {
  onPointerEnter?: () => void
  onPointerLeave?: () => void
} {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openOnHover = trigger === 'both' || trigger === 'hover'

  const clearCloseTimer = useCallback(() => {
    if (!closeTimer.current) return

    clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])

  useEffect(() => clearCloseTimer, [clearCloseTimer])

  const handlePointerEnter = useCallback(() => {
    if (!openOnHover || disabled) return

    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer, disabled, openOnHover, setOpen])

  const handlePointerLeave = useCallback(() => {
    if (!openOnHover) return

    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      closeTimer.current = null
    }, 120)
  }, [clearCloseTimer, openOnHover, setOpen])

  if (!openOnHover) return {}

  return {
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave
  }
}
