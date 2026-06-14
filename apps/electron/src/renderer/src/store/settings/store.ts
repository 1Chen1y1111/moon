import { create, type StateCreator } from 'zustand'

import { flattenActions } from '@renderer/store/flatten-actions'

import { createSettingsSlice, type SettingsAction, type SettingsActionImpl } from './actions'
import { createInitialSettingsState, initialSettingsState } from './initial-state'
import type { SettingsState } from './types'

export type SettingsStoreState = SettingsState
export type SettingsStore = SettingsStoreState & SettingsAction
export type { SettingsAction } from './actions'

const createSettingsStore: StateCreator<SettingsStore> = (...params) => ({
  ...initialSettingsState,
  ...flattenActions<SettingsAction>([createSettingsSlice(...params) as SettingsActionImpl])
})

export const useSettingsStore = create<SettingsStore>()(createSettingsStore)

export function resetSettingsStore(preloadedState?: Partial<SettingsStoreState>): void {
  useSettingsStore.setState({
    ...createInitialSettingsState(),
    ...preloadedState
  })
}
