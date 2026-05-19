import { createContext, useContext, type ReactNode } from 'react'
import { createStore as createVanillaStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'

import { flattenActions } from '@renderer/store/flatten-actions'

import { createConversationAction, type ConversationAction } from './action'
import {
  createInitialConversationState,
  type ConversationState,
  type CreateConversationStoreParams
} from './initial-state'

export type ConversationStore = ConversationState & ConversationAction
export type ConversationStoreApi = StoreApi<ConversationStore>

export function createStore(params: CreateConversationStoreParams): ConversationStoreApi {
  return createVanillaStore<ConversationStore>()((...storeParams) => ({
    ...createInitialConversationState(params),
    ...flattenActions<ConversationAction>([createConversationAction(...storeParams)])
  }))
}

const ConversationStoreContext = createContext<ConversationStoreApi | null>(null)

export function ConversationStoreProvider({
  children,
  store
}: {
  children: ReactNode
  store: ConversationStoreApi
}): React.JSX.Element {
  return (
    <ConversationStoreContext.Provider value={store}>{children}</ConversationStoreContext.Provider>
  )
}

export function useConversationStoreApi(): ConversationStoreApi {
  const store = useContext(ConversationStoreContext)

  if (store === null) {
    throw new Error('useConversationStoreApi must be used within ConversationProvider')
  }

  return store
}

export function useConversationStore<T>(
  selector: (state: ConversationStore) => T
): T {
  const store = useConversationStoreApi()

  return useStore(store, selector)
}

export { conversationSelectors } from './selectors'
export type { ConversationAction, SendConversationMessageParams } from './action'
export type { ConversationState } from './initial-state'
