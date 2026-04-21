import { useEffect, useState } from 'react'

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
type ProviderDirtyState = Record<ProviderId, boolean>

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
  const [drafts, setDrafts] = useState<ProviderDrafts>(() => createDraftsFromSettings(appSettings))
  const [dirtyProviders, setDirtyProviders] = useState<ProviderDirtyState>({
    claude: false,
    openai: false,
    gemini: false,
    'openai-compatible': false
  })
  const [errors, setErrors] = useState<Record<ProviderId, ProviderFormErrors>>({
    claude: {},
    openai: {},
    gemini: {},
    'openai-compatible': {}
  })

  useEffect(() => {
    const syncedDrafts = createDraftsFromSettings(appSettings)

    setDrafts((current) => {
      const nextDrafts = { ...current }

      for (const provider of providerIds) {
        if (!dirtyProviders[provider]) {
          nextDrafts[provider] = syncedDrafts[provider]
        }
      }

      return nextDrafts
    })
  }, [appSettings, dirtyProviders])

  function updateDraft(provider: ProviderId, field: keyof ProviderDraft, value: string): void {
    setDrafts((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [field]: value
      }
    }))
    setDirtyProviders((current) => ({
      ...current,
      [provider]: true
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
    setDirtyProviders((current) => ({
      ...current,
      [provider]: false
    }))
  }

  return (
    <section className={settingsPanelClassName}>
      <h2 className="text-[2rem] font-medium tracking-tight text-moon-text-primary">提供商</h2>
      <p className="mt-6 max-w-3xl text-sm leading-7 text-moon-text-secondary">
        为每个模型提供商保存一套本地配置。API Key 会在主进程使用系统安全存储能力加密后落库。
      </p>

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
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

      {saveError ? <p className="mt-4 text-sm text-amber-300">{saveError}</p> : null}
    </section>
  )
}
