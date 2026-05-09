import { configureStore } from '@reduxjs/toolkit'

import { chatReducer } from '@renderer/entities/chat'
import { settingsReducer } from '@renderer/entities/settings'

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    settings: settingsReducer
  }
})

export type RootState = ReturnType<typeof store.getState>
