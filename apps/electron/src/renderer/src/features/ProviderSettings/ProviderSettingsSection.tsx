import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  selectAppSettings,
  selectSettingsError,
  selectSettingsSaveStatus
} from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import type { ProviderId, ProviderModel } from '@moon/shared/domain/provider'
import type { ProviderSettings, ProviderTestResult } from '@moon/shared/domain/settings'
import { saveProviderInputSchema } from '@moon/shared/domain/settings-validation'

import { ProviderSettingsCard } from './ProviderSettingsCard'
import { CustomAcpProviderDialog, CustomProviderDialog } from './components/ProviderSettingsDialogs'
import { ProviderSettingsList } from './components/ProviderSettingsList'
import { ProviderToolbar } from './components/ProviderToolbar'
import type {
  CustomAcpProviderInput,
  CustomProviderInput,
  ProviderDraft,
  ProviderFormErrors
} from './types'
import {
  createDraftFromProvider,
  getErrorMessage,
  normalizeSearchText,
  removeModel,
  updateModelEnabled,
  updateModelOptions,
  upsertModel
} from './provider-settings.utils'

type ProviderDraftOverrides = Record<ProviderId, ProviderDraft | undefined>
type ProviderErrorMap = Record<ProviderId, ProviderFormErrors | undefined>
type ProviderBooleanMap = Record<ProviderId, boolean | undefined>
type ProviderTestResultMap = Record<ProviderId, ProviderTestResult | null | undefined>
type ManualModelDraftMap = Record<ProviderId, { id: string; name: string } | undefined>

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

export function ProviderSettingsSection({
  onFooterActionChange
}: ProviderSettingsSectionProps): React.JSX.Element | null {
  const appSettings = useSettingsStore(selectAppSettings)
  const saveStatus = useSettingsStore(selectSettingsSaveStatus)
  const saveError = useSettingsStore(selectSettingsError)
  const saveProviderSettings = useSettingsStore((state) => state.saveProviderSettings)
  const fetchProviderModelsSettings = useSettingsStore((state) => state.fetchProviderModelsSettings)
  const deleteProviderSettings = useSettingsStore((state) => state.deleteProviderSettings)
  const createCustomProviderSettings = useSettingsStore(
    (state) => state.createCustomProviderSettings
  )
  const createCustomAcpProviderSettings = useSettingsStore(
    (state) => state.createCustomAcpProviderSettings
  )
  const providers = useMemo(() => Object.values(appSettings.providers), [appSettings.providers])
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openai')
  const [searchQuery, setSearchQuery] = useState('')
  const [draftOverrides, setDraftOverrides] = useState<ProviderDraftOverrides>({})
  const [revealedApiKeys, setRevealedApiKeys] = useState<ProviderBooleanMap>({})
  const [errors, setErrors] = useState<ProviderErrorMap>({})
  const [testResults, setTestResults] = useState<ProviderTestResultMap>({})
  const [testingProviders, setTestingProviders] = useState<ProviderBooleanMap>({})
  const [fetchingProviders, setFetchingProviders] = useState<ProviderBooleanMap>({})
  const [modelSearchQueries, setModelSearchQueries] = useState<Record<ProviderId, string>>({})
  const [manualModelDrafts, setManualModelDrafts] = useState<ManualModelDraftMap>({})
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [showCustomAcpDialog, setShowCustomAcpDialog] = useState(false)

  useEffect(() => {
    if (!appSettings.providers[selectedProvider] && providers.length > 0) {
      setSelectedProvider(providers[0].provider)
    }
  }, [appSettings.providers, providers, selectedProvider])

  const selectedSettings = appSettings.providers[selectedProvider] ?? providers[0]
  const selectedDraft =
    selectedSettings === undefined
      ? null
      : (draftOverrides[selectedProvider] ?? createDraftFromProvider(selectedSettings))
  const filteredProviders = useMemo(() => {
    const query = normalizeSearchText(searchQuery)

    if (query.length === 0) {
      return providers
    }

    return providers.filter((provider) =>
      normalizeSearchText(
        `${provider.name} ${provider.description} ${provider.type} ${provider.badge}`
      ).includes(query)
    )
  }, [providers, searchQuery])
  const hasSelectedDraftOverride = draftOverrides[selectedProvider] !== undefined
  const manualModelDraft = manualModelDrafts[selectedProvider] ?? { id: '', name: '' }
  const selectedStatusText = useMemo(() => {
    if (saveStatus === 'saving') {
      return `正在保存 ${selectedSettings?.name ?? 'Provider'}`
    }

    if (saveError !== null) {
      return `保存失败：${saveError}`
    }

    if (errors[selectedProvider] && Object.values(errors[selectedProvider] ?? {}).some(Boolean)) {
      return `请先修正 ${selectedSettings?.name ?? 'Provider'} 表单`
    }

    if (hasSelectedDraftOverride) {
      return `${selectedSettings?.name ?? 'Provider'} 有未保存更改`
    }

    return '所有更改已保存'
  }, [
    errors,
    hasSelectedDraftOverride,
    saveError,
    saveStatus,
    selectedProvider,
    selectedSettings?.name
  ])

  const updateDraft = useCallback(
    (
      provider: ProviderSettings,
      field: keyof ProviderDraft,
      value: ProviderDraft[keyof ProviderDraft]
    ) => {
      setDraftOverrides((current) => {
        const baseDraft = current[provider.provider] ?? createDraftFromProvider(provider)

        return {
          ...current,
          [provider.provider]: {
            ...baseDraft,
            [field]: value
          }
        }
      })
      setErrors((current) => ({
        ...current,
        [provider.provider]: {
          ...current[provider.provider],
          [field]: undefined
        }
      }))
    },
    []
  )

  const handleSaveProvider = useCallback(async (): Promise<void> => {
    if (selectedDraft === null) {
      return
    }

    const parsed = saveProviderInputSchema.safeParse(selectedDraft)

    if (!parsed.success) {
      const nextErrors: ProviderFormErrors = {}

      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          nextErrors[field as keyof ProviderDraft] = issue.message
        }
      }

      setErrors((current) => ({
        ...current,
        [selectedProvider]: nextErrors
      }))
      return
    }

    try {
      await saveProviderSettings(parsed.data)
      setDraftOverrides((current) => ({
        ...current,
        [selectedProvider]: undefined
      }))
    } catch {
      // The settings slice owns the displayed save error.
    }
  }, [saveProviderSettings, selectedDraft, selectedProvider])

  const handleFetchModels = useCallback(async (): Promise<void> => {
    if (selectedDraft === null) {
      return
    }

    setFetchingProviders((current) => ({ ...current, [selectedProvider]: true }))

    try {
      await fetchProviderModelsSettings({ ...selectedDraft, selectedModel: '' })
      setDraftOverrides((current) => ({
        ...current,
        [selectedProvider]: undefined
      }))
    } catch (error) {
      toast.error('获取模型失败', {
        description: getErrorMessage(error)
      })
    } finally {
      setFetchingProviders((current) => ({ ...current, [selectedProvider]: false }))
    }
  }, [fetchProviderModelsSettings, selectedDraft, selectedProvider])

  const handleTestProvider = useCallback(
    async (modelId?: string): Promise<void> => {
      if (selectedDraft === null) {
        return
      }

      setTestingProviders((current) => ({ ...current, [selectedProvider]: true }))
      setTestResults((current) => ({ ...current, [selectedProvider]: null }))

      try {
        const startedAt = performance.now()
        const result = await window.api.settings.testProvider({
          ...selectedDraft,
          selectedModel: modelId ?? ''
        })
        const elapsedMs = Math.round(performance.now() - startedAt)
        setTestResults((current) => ({
          ...current,
          [selectedProvider]: {
            ...result,
            message: result.success ? `连接成功！ (${elapsedMs}ms)` : result.message
          }
        }))
      } finally {
        setTestingProviders((current) => ({ ...current, [selectedProvider]: false }))
      }
    },
    [selectedDraft, selectedProvider]
  )

  const handleDeleteProvider = useCallback(async (): Promise<void> => {
    if (selectedSettings === undefined) {
      return
    }

    if (selectedSettings.isBuiltIn) {
      return
    }

    if (!window.confirm(`删除 ${selectedSettings.name}？此操作会移除本地保存的配置。`)) {
      return
    }

    try {
      await deleteProviderSettings({ provider: selectedSettings.provider })
      setDraftOverrides((current) => ({
        ...current,
        [selectedSettings.provider]: undefined
      }))
      const nextProvider = providers.find(
        (provider) => provider.provider !== selectedSettings.provider
      )
      if (nextProvider) {
        setSelectedProvider(nextProvider.provider)
      }
    } catch {
      // The settings slice owns the displayed save error.
    }
  }, [deleteProviderSettings, providers, selectedSettings])

  const handleAddManualModel = useCallback(() => {
    if (selectedSettings === undefined || selectedDraft === null) {
      return
    }

    const id = manualModelDraft.id.trim()

    if (id.length === 0) {
      return
    }

    const nextDraft = upsertModel(selectedDraft, {
      id,
      name: manualModelDraft.name.trim() || id,
      enabled: true,
      isManual: true
    })

    setDraftOverrides((current) => ({
      ...current,
      [selectedProvider]: nextDraft
    }))
    setManualModelDrafts((current) => ({
      ...current,
      [selectedProvider]: { id: '', name: '' }
    }))
  }, [
    manualModelDraft.id,
    manualModelDraft.name,
    selectedDraft,
    selectedProvider,
    selectedSettings
  ])

  const handleCreateCustomProvider = useCallback(
    async (input: CustomProviderInput) => {
      const previousIds = new Set(Object.keys(appSettings.providers))
      const settings = await createCustomProviderSettings(input)
      const createdProvider = Object.values(settings.providers).find(
        (provider) => !previousIds.has(provider.provider)
      )

      if (createdProvider) {
        setSelectedProvider(createdProvider.provider)
      }
      setShowCustomDialog(false)
    },
    [appSettings.providers, createCustomProviderSettings]
  )

  const handleCreateCustomAcpProvider = useCallback(
    async (input: CustomAcpProviderInput) => {
      const previousIds = new Set(Object.keys(appSettings.providers))
      const settings = await createCustomAcpProviderSettings(input)
      const createdProvider = Object.values(settings.providers).find(
        (provider) => !previousIds.has(provider.provider)
      )

      if (createdProvider) {
        setSelectedProvider(createdProvider.provider)
      }
      setShowCustomAcpDialog(false)
    },
    [appSettings.providers, createCustomAcpProviderSettings]
  )

  const handleDraftChange = useCallback(
    (field: keyof ProviderDraft, value: ProviderDraft[keyof ProviderDraft]) => {
      if (selectedSettings !== undefined) {
        updateDraft(selectedSettings, field, value)
      }
    },
    [selectedSettings, updateDraft]
  )

  const handleRevealApiKeyToggle = useCallback(() => {
    setRevealedApiKeys((current) => ({
      ...current,
      [selectedProvider]: !current[selectedProvider]
    }))
  }, [selectedProvider])

  const handleFetchModelsCb = useCallback(() => {
    void handleFetchModels()
  }, [handleFetchModels])

  const handleTestProviderCb = useCallback(
    (modelId?: string) => {
      void handleTestProvider(modelId)
    },
    [handleTestProvider]
  )

  const handleDeleteProviderCb = useCallback(() => {
    void handleDeleteProvider()
  }, [handleDeleteProvider])

  const handleModelSearchChange = useCallback(
    (value: string) => {
      setModelSearchQueries((current) => ({ ...current, [selectedProvider]: value }))
    },
    [selectedProvider]
  )

  const handleManualModelIdChange = useCallback(
    (value: string) => {
      setManualModelDrafts((current) => {
        const existingDraft = current[selectedProvider] ?? { id: '', name: '' }
        return { ...current, [selectedProvider]: { ...existingDraft, id: value } }
      })
    },
    [selectedProvider]
  )

  const handleManualModelNameChange = useCallback(
    (value: string) => {
      setManualModelDrafts((current) => {
        const existingDraft = current[selectedProvider] ?? { id: '', name: '' }
        return { ...current, [selectedProvider]: { ...existingDraft, name: value } }
      })
    },
    [selectedProvider]
  )

  const handleToggleModel = useCallback(
    (modelId: string) => {
      setDraftOverrides((current) => {
        const draft =
          selectedSettings === undefined
            ? null
            : (current[selectedProvider] ?? createDraftFromProvider(selectedSettings))
        if (draft === null) return current
        return { ...current, [selectedProvider]: updateModelEnabled(draft, modelId) }
      })
    },
    [selectedProvider, selectedSettings]
  )

  const handleRemoveModel = useCallback(
    (modelId: string) => {
      setDraftOverrides((current) => {
        const draft =
          selectedSettings === undefined
            ? null
            : (current[selectedProvider] ?? createDraftFromProvider(selectedSettings))
        if (draft === null) return current
        return { ...current, [selectedProvider]: removeModel(draft, modelId) }
      })
    },
    [selectedProvider, selectedSettings]
  )

  const handleUpdateModel = useCallback(
    (model: ProviderModel) => {
      setDraftOverrides((current) => {
        const draft =
          selectedSettings === undefined
            ? null
            : (current[selectedProvider] ?? createDraftFromProvider(selectedSettings))
        if (draft === null) return current
        return { ...current, [selectedProvider]: updateModelOptions(draft, model) }
      })
    },
    [selectedProvider, selectedSettings]
  )

  useEffect(() => {
    if (selectedSettings === undefined) {
      return
    }

    onFooterActionChange?.({
      selectedProvider,
      selectedProviderLabel: selectedSettings.name,
      statusText: selectedStatusText,
      canSave: saveStatus !== 'saving' && hasSelectedDraftOverride,
      isSaving: saveStatus === 'saving',
      onSave: () => {
        void handleSaveProvider()
      }
    })
  }, [
    handleSaveProvider,
    hasSelectedDraftOverride,
    onFooterActionChange,
    saveStatus,
    selectedProvider,
    selectedSettings,
    selectedStatusText
  ])

  if (selectedSettings === undefined || selectedDraft === null) {
    return null
  }

  return (
    <section className="flex h-full flex-col gap-4">
      <ProviderToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onAddCustomProvider={() => setShowCustomDialog(true)}
        onAddCustomAcpProvider={() => setShowCustomAcpDialog(true)}
      />

      <div className="h-[calc(100%-52px)] flex justify-between gap-4">
        <ProviderSettingsList
          providers={filteredProviders}
          selectedProvider={selectedProvider}
          onSelectProvider={setSelectedProvider}
        />

        <ProviderSettingsCard
          key={selectedProvider}
          provider={selectedSettings}
          draft={selectedDraft}
          errors={errors[selectedProvider] ?? {}}
          hasDraftOverride={hasSelectedDraftOverride}
          isSaving={saveStatus === 'saving'}
          isFetchingModels={Boolean(fetchingProviders[selectedProvider])}
          isTesting={Boolean(testingProviders[selectedProvider])}
          testResult={testResults[selectedProvider] ?? null}
          revealsApiKey={Boolean(revealedApiKeys[selectedProvider])}
          modelSearchQuery={modelSearchQueries[selectedProvider] ?? ''}
          manualModelId={manualModelDraft.id}
          manualModelName={manualModelDraft.name}
          onDraftChange={handleDraftChange}
          onRevealApiKeyToggle={handleRevealApiKeyToggle}
          onFetchModels={handleFetchModelsCb}
          onTestProvider={handleTestProviderCb}
          onDeleteProvider={handleDeleteProviderCb}
          onModelSearchChange={handleModelSearchChange}
          onManualModelIdChange={handleManualModelIdChange}
          onManualModelNameChange={handleManualModelNameChange}
          onAddManualModel={handleAddManualModel}
          onToggleModel={handleToggleModel}
          onRemoveModel={handleRemoveModel}
          onUpdateModel={handleUpdateModel}
        />
      </div>

      {showCustomDialog ? (
        <CustomProviderDialog
          isSaving={saveStatus === 'saving'}
          onClose={() => setShowCustomDialog(false)}
          onCreate={(input) => {
            void handleCreateCustomProvider(input)
          }}
        />
      ) : null}

      {showCustomAcpDialog ? (
        <CustomAcpProviderDialog
          isSaving={saveStatus === 'saving'}
          onClose={() => setShowCustomAcpDialog(false)}
          onCreate={(input) => {
            void handleCreateCustomAcpProvider(input)
          }}
        />
      ) : null}
    </section>
  )
}
