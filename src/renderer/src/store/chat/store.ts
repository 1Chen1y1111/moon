import { create, type StateCreator } from 'zustand'

import { flattenActions } from '@renderer/store/flatten-actions'

import { createChatSlice, type ChatAction, type ChatActionImpl } from './actions'
import { createInitialChatState, initialChatState } from './initial-state'
import type { ChatState } from './types'

export type ChatStoreState = ChatState
export type ChatStore = ChatStoreState & ChatAction
export type { ChatAction } from './actions'

const createChatStore: StateCreator<ChatStore> = (...params) => ({
  ...initialChatState,
  ...flattenActions<ChatAction>([createChatSlice(...params) as ChatActionImpl])
})

export const useChatStore = create<ChatStore>()(createChatStore)

export function resetChatStore(preloadedState?: Partial<ChatStoreState>): void {
  useChatStore.setState({
    ...createInitialChatState(),
    ...preloadedState
  })
}
