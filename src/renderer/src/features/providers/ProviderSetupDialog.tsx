import { useState } from 'react'

import { Button } from '@renderer/components/ui/button'
import { providerFormSchema, type ProviderFormValues } from './provider-form-schema'
import { useSettingsStore } from '@renderer/lib/stores/settings-store'
import { useUiStore } from '@renderer/lib/stores/ui-store'

type ProviderSetupDialogProps = {
  onSubmit?: (values: ProviderFormValues) => void
}

type FormErrors = Partial<Record<keyof ProviderFormValues, string>>

const inputClassName =
  'mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-zinc-600'

export function ProviderSetupDialog({
  onSubmit
}: ProviderSetupDialogProps): React.JSX.Element | null {
  const isOpen = useUiStore((state) => state.isProviderSetupDialogOpen)
  const claudeDraft = useSettingsStore((state) => state.providerDrafts.claude)

  if (!isOpen) {
    return null
  }

  return <ProviderSetupDialogContent initialValues={claudeDraft} onSubmit={onSubmit} />
}

type ProviderSetupDialogContentProps = ProviderSetupDialogProps & {
  initialValues: {
    apiKey: string
    model: string
  }
}

function ProviderSetupDialogContent({
  initialValues,
  onSubmit
}: ProviderSetupDialogContentProps): React.JSX.Element {
  const closeDialog = useUiStore((state) => state.closeProviderSetupDialog)
  const saveProviderDraft = useSettingsStore((state) => state.saveProviderDraft)
  const [values, setValues] = useState<ProviderFormValues>({
    provider: 'claude',
    apiKey: initialValues.apiKey,
    model: initialValues.model
  })
  const [errors, setErrors] = useState<FormErrors>({})

  function updateField(field: 'apiKey' | 'model', value: string): void {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleDismiss(): void {
    setErrors({})
    closeDialog()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const parsed = providerFormSchema.safeParse(values)
    if (!parsed.success) {
      const nextErrors: FormErrors = {}

      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (field === 'apiKey' || field === 'model' || field === 'provider') {
          nextErrors[field] = issue.message
        }
      }

      setErrors(nextErrors)
      return
    }

    saveProviderDraft(parsed.data.provider, {
      apiKey: parsed.data.apiKey,
      model: parsed.data.model
    })
    onSubmit?.(parsed.data)
    handleDismiss()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configure Provider"
        className="w-full max-w-2xl rounded-[28px] border border-zinc-800 bg-zinc-900/95 p-6 text-zinc-100 shadow-2xl shadow-black/40 backdrop-blur"
      >
        <div className="flex items-start justify-between gap-6 border-b border-zinc-800 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Provider Setup</p>
            <h2 className="mt-3 text-2xl font-semibold text-zinc-50">Claude Provider</h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Connect Anthropic credentials in a provider-ready flow. Submission stays local to this
              session until IPC wiring lands.
            </p>
          </div>
          <Button variant="secondary" onClick={handleDismiss}>
            Close
          </Button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-5 md:grid-cols-[1.1fr_1.4fr]">
            <label className="block text-sm font-medium text-zinc-200">
              Provider
              <select
                aria-label="Provider"
                className={inputClassName}
                value="claude"
                onChange={() => undefined}
              >
                <option value="claude">Claude</option>
              </select>
            </label>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 text-sm text-zinc-400">
              <p className="font-medium text-zinc-200">Provider Notes</p>
              <p className="mt-2">
                Use a Claude API key and a model slug like `claude-3-7-sonnet-latest`.
              </p>
            </div>
          </div>

          <label className="block text-sm font-medium text-zinc-200">
            API Key
            <input
              aria-label="API Key"
              type="password"
              value={values.apiKey}
              onChange={(event) => updateField('apiKey', event.target.value)}
              className={inputClassName}
              placeholder="sk-ant-..."
            />
            {errors.apiKey ? (
              <span className="mt-2 block text-sm text-amber-300">{errors.apiKey}</span>
            ) : null}
          </label>

          <label className="block text-sm font-medium text-zinc-200">
            Model
            <input
              aria-label="Model"
              value={values.model}
              onChange={(event) => updateField('model', event.target.value)}
              className={inputClassName}
              placeholder="claude-3-7-sonnet-latest"
            />
            {errors.model ? (
              <span className="mt-2 block text-sm text-amber-300">{errors.model}</span>
            ) : null}
          </label>

          <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-5">
            <Button variant="secondary" onClick={handleDismiss}>
              Cancel
            </Button>
            <Button type="submit">Save Provider</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
