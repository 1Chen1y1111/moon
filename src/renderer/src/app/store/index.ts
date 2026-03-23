import { configureStore } from '@reduxjs/toolkit'

import { providersReducer } from '@renderer/features/providers'
import { settingsReducer } from '@renderer/features/settings'

export const store = configureStore({
  reducer: {
    providers: providersReducer,
    settings: settingsReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
