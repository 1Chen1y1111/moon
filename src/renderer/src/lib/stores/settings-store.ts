import { create } from 'zustand'

export type SettingsSection = 'general' | 'providers' | 'appearance' | 'projects'

export type ProviderDraft = {
  apiKey: string
  model: string
}

type SettingsState = {
  activeSettingsSection: SettingsSection
  providerDrafts: {
    claude: ProviderDraft
  }
  setActiveSettingsSection: (section: SettingsSection) => void
  updateProviderDraftField: (provider: 'claude', field: keyof ProviderDraft, value: string) => void
  saveProviderDraft: (provider: 'claude', draft: ProviderDraft) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  activeSettingsSection: 'general',
  providerDrafts: {
    claude: {
      apiKey: '',
      model: ''
    }
  },
  setActiveSettingsSection: (section) => set({ activeSettingsSection: section }),
  updateProviderDraftField: (provider, field, value) =>
    set((state) => ({
      providerDrafts: {
        ...state.providerDrafts,
        [provider]: {
          ...state.providerDrafts[provider],
          [field]: value
        }
      }
    })),
  saveProviderDraft: (provider, draft) =>
    set((state) => ({
      providerDrafts: {
        ...state.providerDrafts,
        [provider]: draft
      }
    }))
}))
