import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { createDefaultAppSettings, type AppSettings } from '@shared/domain/settings'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '@shared/domain/settings-validation'

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

export const createCustomProviderSettings = createAsyncThunk<
  AppSettings,
  CreateCustomProviderInput
>('settings/createCustomProviderSettings', (input) =>
  window.api.settings.createCustomProvider(input)
)

export const createCustomAcpProviderSettings = createAsyncThunk<
  AppSettings,
  CreateCustomAcpProviderInput
>('settings/createCustomAcpProviderSettings', (input) =>
  window.api.settings.createCustomAcpProvider(input)
)

export const saveProviderSettings = createAsyncThunk<AppSettings, SaveProviderInput>(
  'settings/saveProviderSettings',
  (input) => window.api.settings.saveProvider(input)
)

export const deleteProviderSettings = createAsyncThunk<AppSettings, DeleteProviderInput>(
  'settings/deleteProviderSettings',
  (input) => window.api.settings.deleteProvider(input)
)

export const fetchProviderModelsSettings = createAsyncThunk<AppSettings, ProviderConnectionInput>(
  'settings/fetchProviderModelsSettings',
  (input) => window.api.settings.fetchProviderModels(input)
)

export const saveAppearanceSettings = createAsyncThunk<AppSettings, SaveAppearanceInput>(
  'settings/saveAppearanceSettings',
  (input) => window.api.settings.saveAppearance(input)
)

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    applyAppSettings(state, action: PayloadAction<AppSettings>) {
      state.appSettings = action.payload
    },
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
      .addCase(createCustomProviderSettings.pending, (state) => {
        state.saveStatus = 'saving'
        state.error = null
      })
      .addCase(createCustomProviderSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(createCustomProviderSettings.rejected, (state, action) => {
        state.saveStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
      .addCase(createCustomAcpProviderSettings.pending, (state) => {
        state.saveStatus = 'saving'
        state.error = null
      })
      .addCase(createCustomAcpProviderSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(createCustomAcpProviderSettings.rejected, (state, action) => {
        state.saveStatus = 'failed'
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
      .addCase(deleteProviderSettings.pending, (state) => {
        state.saveStatus = 'saving'
        state.error = null
      })
      .addCase(deleteProviderSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(deleteProviderSettings.rejected, (state, action) => {
        state.saveStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
      .addCase(fetchProviderModelsSettings.pending, (state) => {
        state.saveStatus = 'saving'
        state.error = null
      })
      .addCase(fetchProviderModelsSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(fetchProviderModelsSettings.rejected, (state, action) => {
        state.saveStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
      .addCase(saveAppearanceSettings.pending, (state) => {
        state.saveStatus = 'saving'
        state.error = null
      })
      .addCase(saveAppearanceSettings.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded'
        state.appSettings = action.payload
      })
      .addCase(saveAppearanceSettings.rejected, (state, action) => {
        state.saveStatus = 'failed'
        state.error = getErrorMessage(action.error)
      })
  }
})

export const { applyAppSettings, setActiveSettingsSection } = settingsSlice.actions

export const settingsReducer = settingsSlice.reducer
