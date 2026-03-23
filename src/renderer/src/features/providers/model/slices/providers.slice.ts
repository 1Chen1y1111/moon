import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { ClaudeProviderDraft, ProviderDraftState } from '../providers.types'

const initialState: ProviderDraftState = {
  claudeDraft: {
    apiKey: '',
    model: ''
  },
  isDialogOpen: false
}

const providersSlice = createSlice({
  name: 'providers',
  initialState,
  reducers: {
    openProviderSetupDialog(state) {
      state.isDialogOpen = true
    },
    closeProviderSetupDialog(state) {
      state.isDialogOpen = false
    },
    saveClaudeProviderDraft(state, action: PayloadAction<ClaudeProviderDraft>) {
      state.claudeDraft = action.payload
    }
  }
})

export const { closeProviderSetupDialog, openProviderSetupDialog, saveClaudeProviderDraft } =
  providersSlice.actions

export const providersReducer = providersSlice.reducer
