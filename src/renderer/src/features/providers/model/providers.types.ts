export type ClaudeProviderDraft = {
  apiKey: string
  model: string
}

export type ProviderDraftState = {
  claudeDraft: ClaudeProviderDraft
  isDialogOpen: boolean
}
