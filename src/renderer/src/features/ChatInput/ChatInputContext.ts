import { createContext, useContext } from 'react'

export type ChatInputSendSnapshot = {
  content: string
  clearContent: () => void
  restoreContent: (content: string) => void
}

export type ChatInputProviderValue = {
  content: string
  createSendSnapshot: () => ChatInputSendSnapshot
  setContent: (content: string) => void
}

export const ChatInputContext = createContext<ChatInputProviderValue | null>(null)

export function useChatInputProvider(): ChatInputProviderValue {
  const context = useContext(ChatInputContext)

  if (context === null) {
    throw new Error('useChatInputProvider must be used within ChatInputProvider')
  }

  return context
}
