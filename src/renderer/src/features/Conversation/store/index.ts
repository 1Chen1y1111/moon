import { createStore as createVanillaStore, type StoreApi } from 'zustand/vanilla'
import { createContext as createZustandContext } from 'zustand-utils'

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

export const {
  Provider: ConversationStoreProvider,
  useStore: useConversationStore,
  useStoreApi: useConversationStoreApi
} = createZustandContext<ConversationStoreApi>()

export { conversationSelectors } from './selectors'
export type { ConversationAction, SendConversationMessageParams } from './action'
export type { ConversationState } from './initial-state'
