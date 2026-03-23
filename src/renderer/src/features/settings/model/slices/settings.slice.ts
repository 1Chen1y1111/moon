import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { SettingsSectionId, SettingsState } from '../settings.types'

const initialState: SettingsState = {
  activeSection: 'general',
  isOpen: false
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    openSettingsDialog(state) {
      state.isOpen = true
    },
    closeSettingsDialog(state) {
      state.isOpen = false
    },
    setActiveSettingsSection(state, action: PayloadAction<SettingsSectionId>) {
      state.activeSection = action.payload
    }
  }
})

export const { openSettingsDialog, closeSettingsDialog, setActiveSettingsSection } =
  settingsSlice.actions

export const settingsReducer = settingsSlice.reducer
