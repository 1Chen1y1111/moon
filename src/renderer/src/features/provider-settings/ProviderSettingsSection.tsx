import { useCallback, useEffect, useMemo, useState } from 'react'
import { Blocks, Plus, Search, Terminal } from 'lucide-react'

import {
  saveProviderSettings,
  selectAppSettings,
  selectSettingsError,
  selectSettingsSaveStatus,
  useSettingsDispatch,
  useSettingsSelector
} from '@renderer/entities/settings'
import AihubmixIconUrl from '@renderer/shared/assets/llm-icons/aihubmix.png'
import AnthropicIcon from '@renderer/shared/assets/llm-icons/anthropic.svg?react'
import AzureAiIcon from '@renderer/shared/assets/llm-icons/azureai.svg?react'
import DeepSeekIcon from '@renderer/shared/assets/llm-icons/deepseek.svg?react'
import GeminiIcon from '@renderer/shared/assets/llm-icons/gemini.svg?react'
import KimiIcon from '@renderer/shared/assets/llm-icons/kimi.svg?react'
import MoonshotIcon from '@renderer/shared/assets/llm-icons/moonshot.svg?react'
import OpenAiIcon from '@renderer/shared/assets/llm-icons/openai.svg?react'
import OpenRouterIcon from '@renderer/shared/assets/llm-icons/openrouter.svg?react'
import ZhipuIcon from '@renderer/shared/assets/llm-icons/zhipu.svg?react'
import { Button } from '@shadcn/ui/button'
import { cn } from '@shadcn/lib/utils'
import {
  providerCatalog,
  providerIds,
  providerMetadata,
  type ProviderId
} from '@shared/domain/provider'
import type { AppSettings } from '@shared/domain/settings'
import { saveProviderInputSchema } from '@shared/domain/settings-validation'

import {
  ProviderSettingsCard,
  type ProviderDraft,
  type ProviderFormErrors
} from './ProviderSettingsCard'

type ProviderDrafts = Record<ProviderId, ProviderDraft>
type ProviderDraftOverrides = Partial<ProviderDrafts>
type ProviderErrorMap = Record<ProviderId, ProviderFormErrors>
type ProviderBooleanMap = Record<ProviderId, boolean>

export type ProviderSettingsFooterAction = {
  selectedProvider: ProviderId
  selectedProviderLabel: string
  statusText: string
  canSave: boolean
  isSaving: boolean
  onSave: () => void
}

type ProviderSettingsSectionProps = {
  onFooterActionChange?: (action: ProviderSettingsFooterAction) => void
}

type ProviderIconAsset =
  | {
      mode: 'image'
      src: string
    }
  | {
      mode: 'component'
      Icon: React.ComponentType<React.ComponentProps<'svg'>>
    }

const providerIconAssets = {
  moonshot: {
    mode: 'component',
    Icon: MoonshotIcon
  },
  openai: {
    mode: 'component',
    Icon: OpenAiIcon
  },
  claude: {
    mode: 'component',
    Icon: AnthropicIcon
  },
  gemini: {
    mode: 'component',
    Icon: GeminiIcon
  },
  aihubmix: {
    mode: 'image',
    src: AihubmixIconUrl
  },
  deepseek: {
    mode: 'component',
    Icon: DeepSeekIcon
  },
  'z-ai-coding-plan': {
    mode: 'component',
    Icon: ZhipuIcon
  },
  'kimi-coding-plan': {
    mode: 'component',
    Icon: KimiIcon
  },
  openrouter: {
    mode: 'component',
    Icon: OpenRouterIcon
  },
  'azure-openai': {
    mode: 'component',
    Icon: AzureAiIcon
  }
} as const satisfies Partial<Record<ProviderId, ProviderIconAsset>>

const providerFallbackIcons = {
  'openai-compatible': Blocks
} as const satisfies Partial<Record<ProviderId, React.ComponentType<{ className?: string }>>>

function ProviderCatalogIcon({
  icon,
  isSelected,
  provider
}: {
  icon?: ProviderIconAsset
  isSelected: boolean
  provider: ProviderId
}): React.JSX.Element {
  const iconClassName = cn(
    'size-5 shrink-0',
    isSelected ? 'text-moon-accent' : 'text-moon-text-muted'
  )

  if (icon?.mode === 'component') {
    const Icon = icon.Icon

    return <Icon aria-hidden="true" focusable="false" className={iconClassName} />
  }

  if (icon?.mode === 'image') {
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        className={cn(iconClassName, 'object-contain opacity-80')}
      />
    )
  }

  const FallbackIcon = providerFallbackIcons[provider]

  return FallbackIcon ? <FallbackIcon aria-hidden="true" className={iconClassName} /> : <span />
}

function createProviderRecord<T>(createValue: (provider: ProviderId) => T): Record<ProviderId, T> {
  return Object.fromEntries(
    providerIds.map((provider) => [provider, createValue(provider)])
  ) as Record<ProviderId, T>
}

function createDraftsFromSettings(appSettings: AppSettings): ProviderDrafts {
  return createProviderRecord((provider) => ({
    apiKey: '',
    model: appSettings.providers[provider].model,
    baseUrl: appSettings.providers[provider].baseUrl
  }))
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

export function ProviderSettingsSection({
  onFooterActionChange
}: ProviderSettingsSectionProps): React.JSX.Element {
  const dispatch = useSettingsDispatch()
  const appSettings = useSettingsSelector(selectAppSettings)
  const saveStatus = useSettingsSelector(selectSettingsSaveStatus)
  const saveError = useSettingsSelector(selectSettingsError)
  const syncedDrafts = useMemo(() => createDraftsFromSettings(appSettings), [appSettings])
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openai')
  const [searchQuery, setSearchQuery] = useState('')
  const [draftOverrides, setDraftOverrides] = useState<ProviderDraftOverrides>({})
  const [advancedOpen, setAdvancedOpen] = useState<ProviderBooleanMap>(() =>
    createProviderRecord(() => true)
  )
  const [revealedApiKeys, setRevealedApiKeys] = useState<ProviderBooleanMap>(() =>
    createProviderRecord(() => false)
  )
  const [errors, setErrors] = useState<ProviderErrorMap>(() => createProviderRecord(() => ({})))
  const drafts = useMemo(() => {
    const nextDrafts = { ...syncedDrafts }

    for (const provider of providerIds) {
      nextDrafts[provider] = draftOverrides[provider] ?? syncedDrafts[provider]
    }

    return nextDrafts
  }, [draftOverrides, syncedDrafts])
  const filteredProviders = useMemo(() => {
    const query = normalizeSearchText(searchQuery)

    if (query.length === 0) {
      return providerCatalog
    }

    return providerCatalog.filter((provider) =>
      normalizeSearchText(
        `${provider.label} ${provider.description} ${provider.kind} ${provider.badge ?? ''}`
      ).includes(query)
    )
  }, [searchQuery])

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

  function toggleAdvanced(provider: ProviderId): void {
    setAdvancedOpen((current) => ({
      ...current,
      [provider]: !current[provider]
    }))
  }

  function toggleRevealApiKey(provider: ProviderId): void {
    setRevealedApiKeys((current) => ({
      ...current,
      [provider]: !current[provider]
    }))
  }

  const saveProvider = useCallback(
    async (provider: ProviderId): Promise<void> => {
      const nextErrors: ProviderFormErrors = {}
      const providerSettings = appSettings.providers[provider]
      const parsed = saveProviderInputSchema.safeParse({
        provider,
        ...drafts[provider]
      })

      if (!providerSettings.hasApiKey && drafts[provider].apiKey.trim().length === 0) {
        nextErrors.apiKey = 'API key is required.'
      }

      if (!parsed.success) {
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
      }

      if (!parsed.success || Object.keys(nextErrors).length > 0) {
        setErrors((current) => ({
          ...current,
          [provider]: nextErrors
        }))
        return
      }

      try {
        await dispatch(saveProviderSettings(parsed.data)).unwrap()
        setDraftOverrides((current) => {
          const nextDraftOverrides = { ...current }
          delete nextDraftOverrides[provider]

          return nextDraftOverrides
        })
      } catch {
        // The settings slice owns the displayed save error.
      }
    },
    [appSettings.providers, dispatch, drafts]
  )

  const selectedMetadata = providerMetadata[selectedProvider]
  const selectedErrors = errors[selectedProvider]
  const hasSelectedErrors = Object.values(selectedErrors).some(Boolean)
  const selectedHasDraftOverride = draftOverrides[selectedProvider] !== undefined
  const selectedStatusText = useMemo(() => {
    if (saveStatus === 'saving') {
      return `正在保存 ${selectedMetadata.label}`
    }

    if (saveError !== null) {
      return `保存失败：${saveError}`
    }

    if (hasSelectedErrors) {
      return `请先修正 ${selectedMetadata.label} 表单`
    }

    if (selectedHasDraftOverride) {
      return `${selectedMetadata.label} 有未保存更改`
    }

    if (appSettings.providers[selectedProvider].updatedAt) {
      return `${selectedMetadata.label} 已保存`
    }

    return `${selectedMetadata.label} 尚未保存`
  }, [
    appSettings.providers,
    hasSelectedErrors,
    saveError,
    saveStatus,
    selectedHasDraftOverride,
    selectedMetadata.label,
    selectedProvider
  ])
  const handleFooterSave = useCallback(() => {
    void saveProvider(selectedProvider)
  }, [saveProvider, selectedProvider])

  useEffect(() => {
    onFooterActionChange?.({
      selectedProvider,
      selectedProviderLabel: selectedMetadata.label,
      statusText: selectedStatusText,
      canSave: saveStatus !== 'saving',
      isSaving: saveStatus === 'saving',
      onSave: handleFooterSave
    })
  }, [
    handleFooterSave,
    onFooterActionChange,
    saveStatus,
    selectedMetadata.label,
    selectedProvider,
    selectedStatusText
  ])

  return (
    <section className="flex min-h-full flex-col">
      <div className="moon-provider-toolbar">
        <div className="flex h-moon-field w-full items-center gap-moon-option-gap rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg focus-within:border-moon-accent">
          <Search aria-hidden="true" className="size-moon-icon text-moon-text-muted" />
          <input
            aria-label="搜索提供商"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-moon-body leading-moon-body text-moon-text-primary outline-none placeholder:text-moon-text-muted"
            placeholder="搜索提供商..."
          />
        </div>

        <div className="flex flex-col justify-end gap-moon-option-gap sm:flex-row">
          <Button type="button" variant="secondary" size="lg" disabled title="ACP provider 待接入">
            <Terminal aria-hidden="true" />
            Add Custom ACP Provider
          </Button>
          <Button type="button" size="lg" disabled title="自定义 provider 待接入">
            <Plus aria-hidden="true" />
            Add Custom Provider
          </Button>
        </div>
      </div>

      <div className="moon-provider-layout mt-moon-card min-h-0 flex-1">
        <div className="min-h-0 rounded-moon-card border border-moon-border-default bg-moon-surface-1 p-moon-lg">
          <div
            role="list"
            aria-label="提供商列表"
            className="moon-provider-list-scroll flex min-h-0 flex-col gap-moon-option-gap overflow-y-auto pr-moon-sm"
          >
            {filteredProviders.map((provider) => {
              const isSelected = provider.provider === selectedProvider
              const isConfigured = appSettings.providers[provider.provider].hasApiKey

              return (
                <div key={provider.provider} role="listitem">
                  <button
                    type="button"
                    aria-label={`选择 ${provider.label}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-center gap-moon-option-gap rounded-moon-control border px-moon-lg py-moon-nav-y text-left transition-colors',
                      isSelected
                        ? 'border-moon-accent bg-moon-accent-soft text-moon-text-primary'
                        : 'border-moon-border-default bg-moon-surface-2 text-moon-text-muted hover:bg-moon-button-secondary-bg-hover'
                    )}
                    onClick={() => setSelectedProvider(provider.provider)}
                  >
                    <ProviderCatalogIcon
                      icon={providerIconAssets[provider.provider]}
                      isSelected={isSelected}
                      provider={provider.provider}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-moon-body-lead font-moon-label leading-moon-body-lead">
                        {provider.label}
                      </span>
                    </span>
                    {provider.badge ? <span className="moon-tag">{provider.badge}</span> : null}
                    <span
                      aria-label={isConfigured ? '已配置' : '未配置'}
                      className={cn(
                        'size-moon-icon-xs shrink-0 rounded-full',
                        isConfigured ? 'bg-moon-accent' : 'bg-moon-text-muted'
                      )}
                    />
                  </button>
                </div>
              )
            })}
            {filteredProviders.length === 0 ? (
              <p className="px-moon-lg py-moon-card text-center text-moon-body leading-moon-body text-moon-text-muted">
                没有匹配的提供商
              </p>
            ) : null}
          </div>
        </div>

        <ProviderSettingsCard
          provider={selectedProvider}
          draft={drafts[selectedProvider]}
          errors={errors[selectedProvider]}
          hasApiKey={appSettings.providers[selectedProvider].hasApiKey}
          apiKeyPreview={appSettings.providers[selectedProvider].apiKeyPreview}
          isSaving={saveStatus === 'saving'}
          updatedAt={appSettings.providers[selectedProvider].updatedAt}
          isAdvancedOpen={advancedOpen[selectedProvider]}
          revealsApiKey={revealedApiKeys[selectedProvider]}
          onDraftChange={updateDraft}
          onAdvancedToggle={toggleAdvanced}
          onRevealApiKeyToggle={toggleRevealApiKey}
        />
      </div>
    </section>
  )
}
