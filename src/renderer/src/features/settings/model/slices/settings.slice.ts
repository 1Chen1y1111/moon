import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { SettingsSectionId, SettingsState } from '../settings.types'

const initialState: SettingsState = {
  activeSection: 'general'
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setActiveSettingsSection(state, action: PayloadAction<SettingsSectionId>) {
      state.activeSection = action.payload
    }
  }
})

export const { setActiveSettingsSection } = settingsSlice.actions

export const settingsReducer = settingsSlice.reducer
