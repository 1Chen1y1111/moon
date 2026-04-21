import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'

import type { SettingsState } from './settings.types'

type SettingsSliceState = {
  settings: SettingsState
}

type SettingsDispatch = ThunkDispatch<SettingsSliceState, unknown, UnknownAction>

export const useSettingsDispatch = useDispatch.withTypes<SettingsDispatch>()
export const useSettingsSelector: TypedUseSelectorHook<SettingsSliceState> = useSelector
