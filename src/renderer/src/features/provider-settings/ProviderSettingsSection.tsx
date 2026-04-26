import { useCallback, useEffect, useMemo, useState } from 'react'
import { Blocks, Bot, Cloud, Github, Plus, Search, Terminal, Workflow } from 'lucide-react'

import {
  createCustomAcpProviderSettings,
  createCustomProviderSettings,
  deleteProviderSettings,
  fetchProviderModelsSettings,
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@shadcn/ui/dialog'
import { Input } from '@shadcn/ui/input'
import { Label } from '@shadcn/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shadcn/ui/select'
import { Switch } from '@shadcn/ui/switch'
import { Textarea } from '@shadcn/ui/textarea'
import { cn } from '@shadcn/lib/utils'
import type { ProviderApiFormat, ProviderId, ProviderModel } from '@shared/domain/provider'
import type { ProviderSettings, ProviderTestResult } from '@shared/domain/settings'
import { saveProviderInputSchema } from '@shared/domain/settings-validation'

import {
  ProviderSettingsCard,
  type ProviderDraft,
  type ProviderFormErrors
} from './ProviderSettingsCard'

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

type ProviderIconAsset =
  | {
      mode: 'image'
      src: string
    }
  | {
      mode: 'component'
      Icon: React.ComponentType<React.ComponentProps<'svg'>>
    }

const fieldClassName =
  'h-moon-control-lg rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-control-x text-moon-body leading-moon-body text-moon-text-primary placeholder:text-moon-text-muted focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50 disabled:opacity-60'

const textareaClassName =
  'min-h-moon-provider-textarea rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg py-moon-md font-mono text-moon-caption leading-moon-caption text-moon-text-primary placeholder:text-moon-text-muted focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50'

const dialogContentClassName =
  'max-w-moon-provider-dialog rounded-moon-card border border-moon-border-default bg-moon-surface-1 p-moon-panel text-moon-text-primary shadow-moon-ring'

const selectTriggerClassName =
  'mt-moon-md h-moon-control-lg w-full rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-control-x text-moon-body leading-moon-body text-moon-text-primary focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50'

const selectContentClassName =
  'border border-moon-border-default bg-moon-surface-1 text-moon-text-primary shadow-moon-ring'

const selectItemClassName =
  'text-moon-body leading-moon-body focus:bg-moon-button-secondary-bg-hover focus:text-moon-text-primary'

const switchClassName = 'data-checked:bg-moon-accent data-unchecked:bg-moon-button-secondary-bg'

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
  'openai-compatible': Blocks,
  'github-copilot': Github,
  'claude-subscription': AnthropicIcon,
  'claude-code-acp': Terminal,
  'gemini-acp': Terminal,
  'codex-acp': Terminal,
  volcengine: Cloud,
  ollama: Bot,
  'cloudflare-ai-gateway': Cloud
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

  const FallbackIcon = providerFallbackIcons[provider] ?? Workflow

  return <FallbackIcon aria-hidden="true" className={iconClassName} />
}

function createDraftFromProvider(provider: ProviderSettings): ProviderDraft {
  return {
    provider: provider.provider,
    name: provider.name,
    type: provider.type,
    apiKey: '',
    model: provider.model,
    models: provider.models,
    availableModels: provider.availableModels,
    baseUrl: provider.baseUrl,
    apiFormat: provider.apiFormat,
    useMaxCompletionTokens: provider.useMaxCompletionTokens,
    customHeaders: provider.customHeaders,
    enabled: provider.enabled,
    requiresBaseUrl: provider.requiresBaseUrl,
    noApiKey: provider.noApiKey,
    isCustom: provider.isCustom,
    isACP: provider.isACP,
    isOAuth: provider.isOAuth,
    acpCommand: provider.acpCommand,
    acpArgs: provider.acpArgs,
    acpAuthMethodId: provider.acpAuthMethodId
  }
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

function getProviderStatus(provider: ProviderSettings): 'active' | 'inactive' | 'missing' {
  if (provider.enabled) {
    return 'active'
  }

  if (provider.hasApiKey || provider.noApiKey || provider.isACP || provider.isOAuth) {
    return 'inactive'
  }

  return 'missing'
}

function mergeModels(models: ProviderModel[], nextModel: ProviderModel): ProviderModel[] {
  const existingIndex = models.findIndex((model) => model.id === nextModel.id)

  if (existingIndex === -1) {
    return [...models, nextModel]
  }

  return models.map((model, index) => (index === existingIndex ? nextModel : model))
}

function upsertModel(draft: ProviderDraft, model: ProviderModel): ProviderDraft {
  const nextModels = mergeModels(draft.models, model)
  const nextAvailableModels = mergeModels(draft.availableModels, model)

  return {
    ...draft,
    model: nextModels.find((entry) => entry.enabled)?.id ?? draft.model,
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

function updateModelEnabled(draft: ProviderDraft, modelId: string): ProviderDraft {
  function toggle(models: ProviderModel[]): ProviderModel[] {
    return models.map((model) =>
      model.id === modelId
        ? {
            ...model,
            enabled: !model.enabled
          }
        : model
    )
  }

  const nextModels = toggle(draft.models)
  const nextAvailableModels = toggle(draft.availableModels)

  return {
    ...draft,
    model: nextModels.find((model) => model.enabled)?.id ?? '',
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

function removeModel(draft: ProviderDraft, modelId: string): ProviderDraft {
  const nextModels = draft.models.filter((model) => model.id !== modelId)
  const nextAvailableModels = draft.availableModels.filter((model) => model.id !== modelId)

  return {
    ...draft,
    model: nextModels.find((model) => model.enabled)?.id ?? '',
    models: nextModels,
    availableModels: nextAvailableModels
  }
}

function DialogFieldLabel({
  children,
  htmlFor
}: {
  children: React.ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <Label
      htmlFor={htmlFor}
      className="block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary"
    >
      {children}
    </Label>
  )
}

function DialogFieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="mt-moon-sm block text-moon-caption leading-moon-caption text-moon-text-muted">
      {children}
    </span>
  )
}

function CustomProviderDialog({
  isSaving,
  onClose,
  onCreate
}: {
  isSaving: boolean
  onClose: () => void
  onCreate: (input: {
    name: string
    baseUrl: string
    apiKey: string
    apiFormat: ProviderApiFormat
    useMaxCompletionTokens: boolean
    customHeaders: string
  }) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiFormat, setApiFormat] = useState<ProviderApiFormat>('openai-chat')
  const [useMaxCompletionTokens, setUseMaxCompletionTokens] = useState(false)
  const [customHeaders, setCustomHeaders] = useState('')

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent aria-label="Add Custom Provider" className={dialogContentClassName}>
        <DialogHeader>
          <DialogTitle className="text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
            Add Custom Provider
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-moon-card">
          <div className="block">
            <DialogFieldLabel>Provider Name</DialogFieldLabel>
            <Input
              aria-label="Custom Provider Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn('mt-moon-md', fieldClassName)}
              placeholder="Provider name"
            />
          </div>
          <div className="block">
            <DialogFieldLabel>Base URL</DialogFieldLabel>
            <Input
              aria-label="Custom Provider Base URL"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              className={cn('mt-moon-md', fieldClassName)}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="block">
            <DialogFieldLabel>
              API Key <span className="text-moon-caption text-moon-text-muted">(可选)</span>
            </DialogFieldLabel>
            <Input
              aria-label="Custom Provider API Key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className={cn('mt-moon-md', fieldClassName)}
              placeholder="Enter your API key"
            />
          </div>
          <div className="block">
            <DialogFieldLabel>API Format</DialogFieldLabel>
            <Select
              value={apiFormat}
              onValueChange={(value) => setApiFormat(value as ProviderApiFormat)}
            >
              <SelectTrigger
                aria-label="Custom Provider API Format"
                className={selectTriggerClassName}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClassName}>
                <SelectItem value="openai-chat" className={selectItemClassName}>
                  Chat Completions (/chat/completions)
                </SelectItem>
                <SelectItem value="openai-responses" className={selectItemClassName}>
                  Responses (/responses)
                </SelectItem>
                <SelectItem value="anthropic" className={selectItemClassName}>
                  Anthropic Messages (/v1/messages)
                </SelectItem>
              </SelectContent>
            </Select>
            <DialogFieldHint>Choose the API endpoint format your provider uses</DialogFieldHint>
          </div>
          <div className="flex items-center justify-between gap-moon-lg">
            <div>
              <p className="text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
                Use max_completion_tokens
              </p>
              <p className="text-moon-caption leading-moon-caption text-moon-text-muted">
                Enable for newer OpenAI models that require max_completion_tokens.
              </p>
            </div>
            <Switch
              checked={useMaxCompletionTokens}
              aria-label="Custom Provider Use max_completion_tokens"
              className={switchClassName}
              onCheckedChange={setUseMaxCompletionTokens}
            />
          </div>
          <div className="block">
            <DialogFieldLabel>Custom Headers (JSON)</DialogFieldLabel>
            <Textarea
              aria-label="Custom Provider Headers"
              value={customHeaders}
              onChange={(event) => setCustomHeaders(event.target.value)}
              className={cn('mt-moon-md', textareaClassName)}
              placeholder={'{\n  "User-Agent": "claude-code/0.1.0"\n}'}
            />
            <DialogFieldHint>
              Optional HTTP headers to send with each request. Must be valid JSON object.
            </DialogFieldHint>
          </div>
        </div>

        <DialogFooter className="mt-moon-card border-moon-border-subtle bg-transparent p-0">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              取消
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={isSaving || name.trim().length === 0}
            onClick={() =>
              onCreate({
                name,
                baseUrl,
                apiKey,
                apiFormat,
                useMaxCompletionTokens,
                customHeaders
              })
            }
          >
            Add Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CustomAcpProviderDialog({
  isSaving,
  onClose,
  onCreate
}: {
  isSaving: boolean
  onClose: () => void
  onCreate: (input: { name: string; acpCommand: string; acpArgs: string }) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [acpCommand, setAcpCommand] = useState('')
  const [acpArgs, setAcpArgs] = useState('')

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent aria-label="Add Custom ACP Provider" className={dialogContentClassName}>
        <DialogHeader>
          <DialogTitle className="text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
            Add Custom ACP Provider
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-moon-card">
          <div className="block">
            <DialogFieldLabel>Provider Name</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Provider Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn('mt-moon-md', fieldClassName)}
              placeholder="Provider name"
            />
          </div>
          <div className="block">
            <DialogFieldLabel>Command</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Command"
              value={acpCommand}
              onChange={(event) => setAcpCommand(event.target.value)}
              className={cn('mt-moon-md', fieldClassName)}
              placeholder="e.g., claude-code-acp, gemini, codex"
            />
            <DialogFieldHint>The CLI command to spawn the ACP agent</DialogFieldHint>
          </div>
          <div className="block">
            <DialogFieldLabel>Arguments</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Arguments"
              value={acpArgs}
              onChange={(event) => setAcpArgs(event.target.value)}
              className={cn('mt-moon-md', fieldClassName)}
              placeholder="e.g., --experimental-acp"
            />
            <DialogFieldHint>Command line arguments, separated by spaces</DialogFieldHint>
          </div>
        </div>

        <DialogFooter className="mt-moon-card border-moon-border-subtle bg-transparent p-0">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              取消
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={isSaving || name.trim().length === 0 || acpCommand.trim().length === 0}
            onClick={() => onCreate({ name, acpCommand, acpArgs })}
          >
            Add ACP Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProviderSettingsSection({
  onFooterActionChange
}: ProviderSettingsSectionProps): React.JSX.Element | null {
  const dispatch = useSettingsDispatch()
  const appSettings = useSettingsSelector(selectAppSettings)
  const saveStatus = useSettingsSelector(selectSettingsSaveStatus)
  const saveError = useSettingsSelector(selectSettingsError)
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
      await dispatch(saveProviderSettings(parsed.data)).unwrap()
      setDraftOverrides((current) => ({
        ...current,
        [selectedProvider]: undefined
      }))
    } catch {
      // The settings slice owns the displayed save error.
    }
  }, [dispatch, selectedDraft, selectedProvider])

  const handleFetchModels = useCallback(async (): Promise<void> => {
    if (selectedDraft === null) {
      return
    }

    setFetchingProviders((current) => ({ ...current, [selectedProvider]: true }))

    try {
      await dispatch(fetchProviderModelsSettings({ ...selectedDraft, selectedModel: '' })).unwrap()
      setDraftOverrides((current) => ({
        ...current,
        [selectedProvider]: undefined
      }))
    } catch {
      // The settings slice owns the displayed save error.
    } finally {
      setFetchingProviders((current) => ({ ...current, [selectedProvider]: false }))
    }
  }, [dispatch, selectedDraft, selectedProvider])

  const handleTestProvider = useCallback(
    async (modelId?: string): Promise<void> => {
      if (selectedDraft === null) {
        return
      }

      setTestingProviders((current) => ({ ...current, [selectedProvider]: true }))
      setTestResults((current) => ({ ...current, [selectedProvider]: null }))

      try {
        const result = await window.api.settings.testProvider({
          ...selectedDraft,
          selectedModel: modelId ?? ''
        })
        setTestResults((current) => ({ ...current, [selectedProvider]: result }))
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

    const action = selectedSettings.isBuiltIn ? '重置' : '删除'

    if (!window.confirm(`${action} ${selectedSettings.name}？此操作会移除本地保存的配置。`)) {
      return
    }

    try {
      await dispatch(deleteProviderSettings({ provider: selectedSettings.provider })).unwrap()
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
  }, [dispatch, providers, selectedSettings])

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
    async (input: {
      name: string
      baseUrl: string
      apiKey: string
      apiFormat: ProviderApiFormat
      useMaxCompletionTokens: boolean
      customHeaders: string
    }) => {
      const previousIds = new Set(Object.keys(appSettings.providers))
      const settings = await dispatch(createCustomProviderSettings(input)).unwrap()
      const createdProvider = Object.values(settings.providers).find(
        (provider) => !previousIds.has(provider.provider)
      )

      if (createdProvider) {
        setSelectedProvider(createdProvider.provider)
      }
      setShowCustomDialog(false)
    },
    [appSettings.providers, dispatch]
  )

  const handleCreateCustomAcpProvider = useCallback(
    async (input: { name: string; acpCommand: string; acpArgs: string }) => {
      const previousIds = new Set(Object.keys(appSettings.providers))
      const settings = await dispatch(createCustomAcpProviderSettings(input)).unwrap()
      const createdProvider = Object.values(settings.providers).find(
        (provider) => !previousIds.has(provider.provider)
      )

      if (createdProvider) {
        setSelectedProvider(createdProvider.provider)
      }
      setShowCustomAcpDialog(false)
    },
    [appSettings.providers, dispatch]
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
    <section className="flex min-h-full flex-col">
      <div className="moon-provider-toolbar">
        <div className="relative w-full">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-moon-control-x top-1/2 size-moon-icon -translate-y-1/2 text-moon-text-muted"
          />
          <Input
            aria-label="搜索提供商"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-moon-control-lg w-full rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg pl-moon-xl pr-moon-control-x text-moon-body leading-moon-body text-moon-text-primary placeholder:text-moon-text-muted focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50"
            placeholder="搜索提供商..."
          />
        </div>

        <div className="flex flex-col justify-end gap-moon-option-gap sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-moon-control rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-card text-moon-body leading-moon-body text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
            onClick={() => setShowCustomAcpDialog(true)}
          >
            <Terminal aria-hidden="true" />
            Add Custom ACP Provider
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-moon-control rounded-moon-control bg-moon-button-primary-bg px-moon-card text-moon-body font-moon-title leading-moon-body text-moon-button-primary-fg transition-colors hover:bg-moon-button-primary-bg-hover"
            onClick={() => setShowCustomDialog(true)}
          >
            <Plus aria-hidden="true" />
            Add Custom Provider
          </Button>
        </div>
      </div>

      <div className="moon-provider-layout mt-moon-card min-h-0 flex-1">
        <div className="min-h-0 rounded-moon-card border border-moon-border-default bg-moon-surface-1">
          <div
            role="list"
            aria-label="提供商列表"
            className="moon-provider-list-scroll flex min-h-0 flex-col gap-moon-option-gap overflow-y-auto p-moon-md"
          >
            {filteredProviders.map((provider) => {
              const isSelected = provider.provider === selectedProvider
              const status = getProviderStatus(provider)

              return (
                <div key={provider.provider} role="listitem">
                  <button
                    type="button"
                    aria-label={`选择 ${provider.name}`}
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
                        {provider.name}
                      </span>
                    </span>
                    {provider.badge ? <span className="moon-tag">{provider.badge}</span> : null}
                    <span
                      aria-label={
                        status === 'active' ? '已启用' : status === 'inactive' ? '未启用' : '未配置'
                      }
                      className={cn(
                        'size-moon-icon-xs shrink-0 rounded-moon-pill',
                        status === 'active'
                          ? 'bg-moon-accent'
                          : status === 'inactive'
                            ? 'bg-moon-text-muted'
                            : 'bg-moon-border-strong'
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
            <p className="px-moon-sm py-moon-md text-moon-caption leading-moon-caption text-moon-text-muted">
              找不到想要的提供商？可以添加 Custom Provider 或 Custom ACP Provider。
            </p>
          </div>
        </div>

        <ProviderSettingsCard
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
          onDraftChange={(field, value) => updateDraft(selectedSettings, field, value)}
          onRevealApiKeyToggle={() =>
            setRevealedApiKeys((current) => ({
              ...current,
              [selectedProvider]: !current[selectedProvider]
            }))
          }
          onFetchModels={() => {
            void handleFetchModels()
          }}
          onTestProvider={(modelId) => {
            void handleTestProvider(modelId)
          }}
          onDeleteProvider={() => {
            void handleDeleteProvider()
          }}
          onModelSearchChange={(value) =>
            setModelSearchQueries((current) => ({ ...current, [selectedProvider]: value }))
          }
          onManualModelIdChange={(value) =>
            setManualModelDrafts((current) => ({
              ...current,
              [selectedProvider]: { ...manualModelDraft, id: value }
            }))
          }
          onManualModelNameChange={(value) =>
            setManualModelDrafts((current) => ({
              ...current,
              [selectedProvider]: { ...manualModelDraft, name: value }
            }))
          }
          onAddManualModel={handleAddManualModel}
          onToggleModel={(modelId) => {
            setDraftOverrides((current) => ({
              ...current,
              [selectedProvider]: updateModelEnabled(selectedDraft, modelId)
            }))
          }}
          onRemoveModel={(modelId) => {
            setDraftOverrides((current) => ({
              ...current,
              [selectedProvider]: removeModel(selectedDraft, modelId)
            }))
          }}
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
