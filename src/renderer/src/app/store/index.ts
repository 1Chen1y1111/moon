import { configureStore } from '@reduxjs/toolkit'

import { settingsReducer } from '@renderer/entities/settings'

export const store = configureStore({
  reducer: {
    settings: settingsReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
