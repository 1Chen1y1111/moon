import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'

import type { ChatState } from './chat.types'

type ChatSliceState = {
  chat: ChatState
}

type ChatDispatch = ThunkDispatch<ChatSliceState, unknown, UnknownAction>

export const useChatDispatch = useDispatch.withTypes<ChatDispatch>()
export const useChatSelector: TypedUseSelectorHook<ChatSliceState> = useSelector
