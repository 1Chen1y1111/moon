import { Button } from '@shadcn/ui/button'
import { providerLabels, type ProviderId, type SaveProviderInput } from '@ipc/contracts'

export type ProviderDraft = {
  apiKey: string
  model: string
  baseUrl: string
}

export type ProviderFormErrors = Partial<Record<keyof SaveProviderInput, string>>

type ProviderSettingsCardProps = {
  provider: ProviderId
  draft: ProviderDraft
  errors: ProviderFormErrors
  isSaving: boolean
  updatedAt: string
  onDraftChange: (provider: ProviderId, field: keyof ProviderDraft, value: string) => void
  onSave: (provider: ProviderId) => void
}

export function ProviderSettingsCard({
  provider,
  draft,
  errors,
  isSaving,
  updatedAt,
  onDraftChange,
  onSave
}: ProviderSettingsCardProps): React.JSX.Element {
  const requiresBaseUrl = provider === 'openai-compatible'

  return (
    <div
      role="region"
      aria-label={`${providerLabels[provider]} provider settings`}
      className="rounded-2xl border border-moon-panel-border bg-moon-sidebar-bg p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-moon-text-primary">{providerLabels[provider]}</h3>
          <p className="mt-1 text-sm text-moon-text-secondary">
            {updatedAt ? `已保存于 ${updatedAt}` : '尚未保存'}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-10 rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-4 text-sm text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
          disabled={isSaving}
          onClick={() => onSave(provider)}
        >
          保存
        </Button>
      </div>

      {requiresBaseUrl ? (
        <label className="mt-5 block text-sm font-medium text-moon-text-primary">
          Base URL
          <input
            aria-label={`${providerLabels[provider]} Base URL`}
            value={draft.baseUrl}
            onChange={(event) => onDraftChange(provider, 'baseUrl', event.target.value)}
            className="mt-2 h-11 w-full rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-4 text-sm text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
            placeholder="https://api.example.com/v1"
          />
          {errors.baseUrl ? (
            <span className="mt-2 block text-sm text-amber-300">{errors.baseUrl}</span>
          ) : null}
        </label>
      ) : null}

      <label className="mt-5 block text-sm font-medium text-moon-text-primary">
        API Key
        <input
          aria-label={`${providerLabels[provider]} API Key`}
          type="password"
          value={draft.apiKey}
          onChange={(event) => onDraftChange(provider, 'apiKey', event.target.value)}
          className="mt-2 h-11 w-full rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-4 text-sm text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
          placeholder="sk-..."
        />
        {errors.apiKey ? (
          <span className="mt-2 block text-sm text-amber-300">{errors.apiKey}</span>
        ) : null}
      </label>

      <label className="mt-5 block text-sm font-medium text-moon-text-primary">
        Model
        <input
          aria-label={`${providerLabels[provider]} Model`}
          value={draft.model}
          onChange={(event) => onDraftChange(provider, 'model', event.target.value)}
          className="mt-2 h-11 w-full rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-4 text-sm text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
          placeholder={
            provider === 'gemini'
              ? 'gemini-2.5-pro'
              : provider === 'openai'
                ? 'gpt-5.4'
                : 'claude-3-7-sonnet-latest'
          }
        />
        {errors.model ? (
          <span className="mt-2 block text-sm text-amber-300">{errors.model}</span>
        ) : null}
      </label>
    </div>
  )
}
