import type { ClaudeProviderDraft } from './providers.types'
import type { ProviderDraftState } from './providers.types'

type ProvidersSliceState = {
  providers: ProviderDraftState
}

export function selectIsProviderSetupDialogOpen(state: ProvidersSliceState): boolean {
  return state.providers.isDialogOpen
}

export function selectClaudeProviderDraft(state: ProvidersSliceState): ClaudeProviderDraft {
  return state.providers.claudeDraft
}
