import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { createDefaultAppSettings, type AppSettings, type SaveProviderInput } from '@ipc/contracts'

import type { SettingsSectionId, SettingsState } from '../settings.types'

const initialState: SettingsState = {
  activeSection: 'general',
  appSettings: createDefaultAppSettings(),
  loadStatus: 'idle',
  saveStatus: 'idle',
  error: null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '操作失败'
}

export const loadAppSettings = createAsyncThunk<AppSettings>('settings/loadAppSettings', () =>
  window.api.settings.get()
)

export const saveProviderSettings = createAsyncThunk<AppSettings, SaveProviderInput>(
  'settings/saveProviderSettings',
  (input) => window.api.settings.saveProvider(input)
)

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setActiveSettingsSection(state, action: PayloadAction<SettingsSectionId>) {
      state.activeSection = action.payload
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAppSettings.pending, (state) => {
        state.loadStatus = 'loading'
        state.error = null
      })
      .addCase(loadAppSettings.fulfilled, (state, action) => {
        state.loadStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(loadAppSettings.rejected, (state, action) => {
        state.loadStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
      .addCase(saveProviderSettings.pending, (state) => {
        state.saveStatus = 'saving'
        state.error = null
      })
      .addCase(saveProviderSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(saveProviderSettings.rejected, (state, action) => {
        state.saveStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
  }
})

export const { setActiveSettingsSection } = settingsSlice.actions

export const settingsReducer = settingsSlice.reducer
