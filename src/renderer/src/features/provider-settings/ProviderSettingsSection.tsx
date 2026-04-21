import { useMemo, useState } from 'react'

import {
  saveProviderSettings,
  selectAppSettings,
  selectSettingsError,
  selectSettingsSaveStatus,
  useSettingsDispatch,
  useSettingsSelector
} from '@renderer/entities/settings'
import { settingsPanelClassName } from '@renderer/shared/ui/settings-panel'
import {
  providerIds,
  saveProviderInputSchema,
  type AppSettings,
  type ProviderId
} from '@ipc/contracts'

import {
  ProviderSettingsCard,
  type ProviderDraft,
  type ProviderFormErrors
} from './ProviderSettingsCard'

type ProviderDrafts = Record<ProviderId, ProviderDraft>
type ProviderDraftOverrides = Partial<ProviderDrafts>

function createDraftsFromSettings(appSettings: AppSettings): ProviderDrafts {
  return {
    claude: {
      apiKey: appSettings.providers.claude.apiKey,
      model: appSettings.providers.claude.model,
      baseUrl: appSettings.providers.claude.baseUrl
    },
    openai: {
      apiKey: appSettings.providers.openai.apiKey,
      model: appSettings.providers.openai.model,
      baseUrl: appSettings.providers.openai.baseUrl
    },
    gemini: {
      apiKey: appSettings.providers.gemini.apiKey,
      model: appSettings.providers.gemini.model,
      baseUrl: appSettings.providers.gemini.baseUrl
    },
    'openai-compatible': {
      apiKey: appSettings.providers['openai-compatible'].apiKey,
      model: appSettings.providers['openai-compatible'].model,
      baseUrl: appSettings.providers['openai-compatible'].baseUrl
    }
  }
}

export function ProviderSettingsSection(): React.JSX.Element {
  const dispatch = useSettingsDispatch()
  const appSettings = useSettingsSelector(selectAppSettings)
  const saveStatus = useSettingsSelector(selectSettingsSaveStatus)
  const saveError = useSettingsSelector(selectSettingsError)
  const syncedDrafts = useMemo(() => createDraftsFromSettings(appSettings), [appSettings])
  const [draftOverrides, setDraftOverrides] = useState<ProviderDraftOverrides>({})
  const [errors, setErrors] = useState<Record<ProviderId, ProviderFormErrors>>({
    claude: {},
    openai: {},
    gemini: {},
    'openai-compatible': {}
  })
  const drafts = useMemo(() => {
    const nextDrafts = { ...syncedDrafts }

    for (const provider of providerIds) {
      nextDrafts[provider] = draftOverrides[provider] ?? syncedDrafts[provider]
    }

    return nextDrafts
  }, [draftOverrides, syncedDrafts])

  function updateDraft(provider: ProviderId, field: keyof ProviderDraft, value: string): void {
    setDraftOverrides((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] ?? syncedDrafts[provider]),
        [field]: value
      }
    }))
    setErrors((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [field]: undefined
      }
    }))
  }

  async function saveProvider(provider: ProviderId): Promise<void> {
    const parsed = saveProviderInputSchema.safeParse({
      provider,
      ...drafts[provider]
    })

    if (!parsed.success) {
      const nextErrors: ProviderFormErrors = {}

      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (
          field === 'apiKey' ||
          field === 'model' ||
          field === 'baseUrl' ||
          field === 'provider'
        ) {
          nextErrors[field] = issue.message
        }
      }

      setErrors((current) => ({
        ...current,
        [provider]: nextErrors
      }))
      return
    }

    await dispatch(saveProviderSettings(parsed.data)).unwrap()
    setDraftOverrides((current) => {
      const nextDraftOverrides = { ...current }
      delete nextDraftOverrides[provider]

      return nextDraftOverrides
    })
  }

  return (
    <section className={settingsPanelClassName}>
      <h2 className="font-moon-serif text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
        提供商
      </h2>
      <p className="mt-moon-xl max-w-3xl text-moon-body leading-moon-body text-moon-text-secondary">
        为每个模型提供商保存一套本地配置。API Key 会在主进程使用系统安全存储能力加密后落库。
      </p>

      <div className="mt-moon-card-stack grid gap-moon-lg xl:grid-cols-2">
        {providerIds.map((provider) => (
          <ProviderSettingsCard
            key={provider}
            provider={provider}
            draft={drafts[provider]}
            errors={errors[provider]}
            isSaving={saveStatus === 'saving'}
            updatedAt={appSettings.providers[provider].updatedAt}
            onDraftChange={updateDraft}
            onSave={(providerId) => {
              void saveProvider(providerId)
            }}
          />
        ))}
      </div>

      {saveError ? (
        <p className="mt-moon-lg text-moon-body leading-moon-body text-moon-state-danger">
          {saveError}
        </p>
      ) : null}
    </section>
  )
}
