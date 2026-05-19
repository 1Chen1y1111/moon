import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { ChatInputContext } from './ChatInputContext'

export function ChatInputProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [content, setContent] = useState('')
  const clearContent = useCallback(() => setContent(''), [])
  const restoreContent = useCallback((nextContent: string) => setContent(nextContent), [])
  const createSendSnapshot = useCallback(
    () => ({
      content,
      clearContent,
      restoreContent
    }),
    [clearContent, content, restoreContent]
  )
  const value = useMemo(
    () => ({
      content,
      createSendSnapshot,
      setContent
    }),
    [content, createSendSnapshot]
  )

  return <ChatInputContext.Provider value={value}>{children}</ChatInputContext.Provider>
}
