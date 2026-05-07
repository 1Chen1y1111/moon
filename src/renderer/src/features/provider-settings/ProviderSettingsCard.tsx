import { memo, useState } from 'react'

import { ScrollArea } from '@shadcn/ui/scroll-area'
import type { ProviderModel } from '@shared/domain/provider'
import { createProviderProxyEndpoints } from '@shared/domain/provider-proxy'
import type { ProviderSettings, ProviderTestResult } from '@shared/domain/settings'
import {
  AcpConnectionFields,
  ApiConnectionFields,
  EnableOnlyProviderCard
} from './components/ProviderConnectionFields'
import { ProviderHeader } from './components/ProviderHeader'
import { ProviderModelList } from './components/ProviderModelList'
import { ModelOptionsDialog } from './components/ProviderModelOptionsDialog'
import { ProviderProxyEndpoints } from './components/ProviderProxyEndpoints'
import type { ProviderDraft, ProviderFormErrors } from './provider-settings.types'

export type { ProviderDraft, ProviderFormErrors } from './provider-settings.types'

type ProviderSettingsCardProps = {
  provider: ProviderSettings
  draft: ProviderDraft
  errors: ProviderFormErrors
  hasDraftOverride: boolean
  isSaving: boolean
  isFetchingModels: boolean
  isTesting: boolean
  testResult: ProviderTestResult | null
  revealsApiKey: boolean
  modelSearchQuery: string
  manualModelId: string
  manualModelName: string
  onDraftChange: (field: keyof ProviderDraft, value: ProviderDraft[keyof ProviderDraft]) => void
  onRevealApiKeyToggle: () => void
  onFetchModels: () => void
  onTestProvider: (modelId?: string) => void
  onDeleteProvider: () => void
  onModelSearchChange: (value: string) => void
  onManualModelIdChange: (value: string) => void
  onManualModelNameChange: (value: string) => void
  onAddManualModel: () => void
  onToggleModel: (modelId: string) => void
  onRemoveModel: (modelId: string) => void
  onUpdateModel: (model: ProviderModel) => void
}

function ProviderSettingsCardBase({
  provider,
  draft,
  errors,
  hasDraftOverride,
  isSaving,
  isFetchingModels,
  isTesting,
  testResult,
  revealsApiKey,
  modelSearchQuery,
  onDraftChange,
  onRevealApiKeyToggle,
  onFetchModels,
  onTestProvider,
  onDeleteProvider,
  onModelSearchChange,
  onToggleModel,
  onRemoveModel,
  onUpdateModel
}: ProviderSettingsCardProps): React.JSX.Element {
  const displayBaseUrl =
    draft.baseUrl.trim() || provider.defaultBaseUrl || provider.description || 'No endpoint'
  const draftModels = draft.models ?? []
  const draftAvailableModels = draft.availableModels ?? []
  const allModels = draftAvailableModels.length > 0 ? draftAvailableModels : draftModels
  const filteredModels = allModels.filter((model) =>
    `${model.id} ${model.name}`.toLowerCase().includes(modelSearchQuery.trim().toLowerCase())
  )
  const enabledModelCount = draftModels.filter((model) => model.enabled).length
  const usesEnableOnlyCard = provider.isOAuth || (provider.isACP && !provider.isCustom)
  const showsModelsSection =
    !usesEnableOnlyCard && (provider.noApiKey || draft.apiKey.trim().length > 0)
  const [showsProxyEndpoints, setShowsProxyEndpoints] = useState(false)
  const [copiedProxyValue, setCopiedProxyValue] = useState('')
  const [optionsModelId, setOptionsModelId] = useState<string | null>(null)
  const [isTestModelPopoverOpen, setIsTestModelPopoverOpen] = useState(false)
  const [testModelQuery, setTestModelQuery] = useState('')
  const optionsModel = optionsModelId
    ? allModels.find((model) => model.id === optionsModelId)
    : undefined
  const testModelSearch = testModelQuery.trim().toLowerCase()
  const filteredTestModels = allModels.filter((model) =>
    `${model.id} ${model.name}`.toLowerCase().includes(testModelSearch)
  )
  const proxyEndpoints = createProviderProxyEndpoints(provider.provider)
  const claudeCodeEnvironment = [
    `export ANTHROPIC_BASE_URL=${proxyEndpoints.anthropicBaseUrl}`,
    'export ANTHROPIC_MODEL=<model-id>',
    'export ANTHROPIC_SMALL_FAST_MODEL=<model-id>',
    'export CLAUDE_CODE_SUBAGENT_MODEL=<model-id>'
  ].join('\n')

  function handleCopyProxyText(value: string): void {
    if (navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(value).catch(() => undefined)
    }

    setCopiedProxyValue(value)
    window.setTimeout(() => setCopiedProxyValue(''), 1600)
  }

  function handleTestModelSelect(modelId: string): void {
    setIsTestModelPopoverOpen(false)
    setTestModelQuery('')
    onTestProvider(modelId)
  }

  return (
    <div
      role="region"
      aria-label={`${provider.name} provider details`}
      className="w-full rounded-lg border border-border bg-card"
    >
      <ProviderHeader
        provider={provider}
        enabled={draft.enabled}
        displayBaseUrl={displayBaseUrl}
        allModels={allModels}
        filteredTestModels={filteredTestModels}
        hasDraftOverride={hasDraftOverride}
        isSaving={isSaving}
        isTesting={isTesting}
        isTestModelPopoverOpen={isTestModelPopoverOpen}
        testModelQuery={testModelQuery}
        testResult={testResult}
        usesEnableOnlyCard={usesEnableOnlyCard}
        onDeleteProvider={onDeleteProvider}
        onEnabledChange={(checked) => onDraftChange('enabled', checked)}
        onTestModelQueryChange={setTestModelQuery}
        onTestModelSelect={handleTestModelSelect}
        onTestModelPopoverOpenChange={setIsTestModelPopoverOpen}
      />

      <ScrollArea className={testResult ? 'h-[calc(100%-159px)]' : 'h-[calc(100%-123px)]'}>
        <div className="px-6 py-6">
          {usesEnableOnlyCard ? (
            <EnableOnlyProviderCard
              description={provider.description}
              enabled={draft.enabled}
              isSaving={isSaving}
              onEnable={() => onDraftChange('enabled', true)}
            />
          ) : provider.isACP ? (
            <AcpConnectionFields
              provider={provider}
              draft={draft}
              errors={errors}
              onDraftChange={onDraftChange}
            />
          ) : (
            <ApiConnectionFields
              provider={provider}
              draft={draft}
              errors={errors}
              isSaving={isSaving}
              revealsApiKey={revealsApiKey}
              onDraftChange={onDraftChange}
              onRevealApiKeyToggle={onRevealApiKeyToggle}
            >
              <ProviderProxyEndpoints
                provider={provider}
                proxyEndpoints={proxyEndpoints}
                claudeCodeEnvironment={claudeCodeEnvironment}
                copiedProxyValue={copiedProxyValue}
                showsProxyEndpoints={showsProxyEndpoints}
                onCopyProxyText={handleCopyProxyText}
                onToggleProxyEndpoints={() => setShowsProxyEndpoints((current) => !current)}
              />
            </ApiConnectionFields>
          )}

          {showsModelsSection ? (
            <ProviderModelList
              provider={provider}
              filteredModels={filteredModels}
              enabledModelCount={enabledModelCount}
              isFetchingModels={isFetchingModels}
              modelSearchQuery={modelSearchQuery}
              onFetchModels={onFetchModels}
              onModelSearchChange={onModelSearchChange}
              onOpenModelOptions={setOptionsModelId}
              onRemoveModel={onRemoveModel}
              onToggleModel={onToggleModel}
            />
          ) : null}
        </div>
      </ScrollArea>

      {optionsModel ? (
        <ModelOptionsDialog
          key={optionsModel.id}
          model={optionsModel}
          onClose={() => setOptionsModelId(null)}
          onSave={(model) => {
            onUpdateModel(model)
            setOptionsModelId(null)
          }}
        />
      ) : null}
    </div>
  )
}

export const ProviderSettingsCard = memo(ProviderSettingsCardBase)
