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
      className="rounded-moon-card border border-moon-panel-border bg-moon-sidebar-bg p-moon-card"
    >
      <div className="flex items-start justify-between gap-moon-lg">
        <div>
          <h3 className="text-moon-h3 font-moon-title leading-moon-h3 text-moon-text-primary">
            {providerLabels[provider]}
          </h3>
          <p className="mt-moon-sm text-moon-caption leading-moon-caption text-moon-text-secondary">
            {updatedAt ? `已保存于 ${updatedAt}` : '尚未保存'}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-moon-control rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
          disabled={isSaving}
          onClick={() => onSave(provider)}
        >
          保存
        </Button>
      </div>

      {requiresBaseUrl ? (
        <label className="mt-moon-card block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
          Base URL
          <input
            aria-label={`${providerLabels[provider]} Base URL`}
            value={draft.baseUrl}
            onChange={(event) => onDraftChange(provider, 'baseUrl', event.target.value)}
            className="mt-moon-md h-moon-field w-full rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
            placeholder="https://api.example.com/v1"
          />
          {errors.baseUrl ? (
            <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-state-danger">
              {errors.baseUrl}
            </span>
          ) : null}
        </label>
      ) : null}

      <label className="mt-moon-card block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
        API Key
        <input
          aria-label={`${providerLabels[provider]} API Key`}
          type="password"
          value={draft.apiKey}
          onChange={(event) => onDraftChange(provider, 'apiKey', event.target.value)}
          className="mt-moon-md h-moon-field w-full rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
          placeholder="sk-..."
        />
        {errors.apiKey ? (
          <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-state-danger">
            {errors.apiKey}
          </span>
        ) : null}
      </label>

      <label className="mt-moon-card block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
        Model
        <input
          aria-label={`${providerLabels[provider]} Model`}
          value={draft.model}
          onChange={(event) => onDraftChange(provider, 'model', event.target.value)}
          className="mt-moon-md h-moon-field w-full rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
          placeholder={
            provider === 'gemini'
              ? 'gemini-2.5-pro'
              : provider === 'openai'
                ? 'gpt-5.4'
                : 'claude-3-7-sonnet-latest'
          }
        />
        {errors.model ? (
          <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-state-danger">
            {errors.model}
          </span>
        ) : null}
      </label>
    </div>
  )
}
