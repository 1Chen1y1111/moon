import { create } from 'zustand'

type UiState = {
  isProviderSetupDialogOpen: boolean
  isSettingsDialogOpen: boolean
  openProviderSetupDialog: () => void
  closeProviderSetupDialog: () => void
  openSettingsDialog: () => void
  closeSettingsDialog: () => void
}

export const useUiStore = create<UiState>((set) => ({
  isProviderSetupDialogOpen: false,
  isSettingsDialogOpen: false,
  openProviderSetupDialog: () => set({ isProviderSetupDialogOpen: true }),
  closeProviderSetupDialog: () => set({ isProviderSetupDialogOpen: false }),
  openSettingsDialog: () => set({ isSettingsDialogOpen: true }),
  closeSettingsDialog: () => set({ isSettingsDialogOpen: false })
}))
