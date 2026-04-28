import { useCallback, useEffect, useMemo, useState } from 'react'
import { Blocks, Bot, Cloud, Github, Plus, Search, Terminal, Workflow, Info } from 'lucide-react'

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
import { ScrollArea } from '@shadcn/ui/scroll-area'
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
  provider
}: {
  icon?: ProviderIconAsset
  provider: ProviderId
}): React.JSX.Element {
  const iconClassName = cn('size-5 shrink-0 text-muted-foreground')

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
    <Label htmlFor={htmlFor} className="block text-sm font-semibold leading-6 text-foreground">
      {children}
    </Label>
  )
}

function DialogFieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{children}</span>
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
      <DialogContent className="px-0" showCloseButton={false} aria-label="Add Custom Provider">
        <DialogHeader className="px-4">
          <DialogTitle className="text-xl font-medium leading-7 text-foreground">
            Add Custom Provider
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-2 px-4">
            <div>
              <DialogFieldLabel>Provider Name</DialogFieldLabel>
              <Input
                aria-label="Custom Provider Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={cn('mt-3')}
                placeholder="My Custom Provider"
              />
            </div>
            <div>
              <DialogFieldLabel>Base URL</DialogFieldLabel>
              <Input
                aria-label="Custom Provider Base URL"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className={cn('mt-3')}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div>
              <DialogFieldLabel>
                API Key <span className="text-xs text-muted-foreground">(可选)</span>
              </DialogFieldLabel>
              <Input
                aria-label="Custom Provider API Key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className={cn('mt-3')}
                placeholder="your-api-key"
              />
            </div>
            <div>
              <DialogFieldLabel>API Format</DialogFieldLabel>
              <Select
                value={apiFormat}
                onValueChange={(value) => setApiFormat(value as ProviderApiFormat)}
              >
                <SelectTrigger aria-label="Custom Provider API Format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-chat">Chat Completions (/chat/completions)</SelectItem>
                  <SelectItem value="openai-responses">Responses (/responses)</SelectItem>
                  <SelectItem value="anthropic">Anthropic Messages (/v1/messages)</SelectItem>
                </SelectContent>
              </Select>
              <DialogFieldHint>Choose the API endpoint format your provider uses</DialogFieldHint>
            </div>
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-semibold leading-6 text-foreground">
                  Use max_completion_tokens
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Enable for newer OpenAI models (o1, o3, etc.) that require max_completion_tokens
                  instead of max_tokens
                </p>
              </div>
              <Switch
                checked={useMaxCompletionTokens}
                aria-label="Custom Provider Use max_completion_tokens"
                onCheckedChange={setUseMaxCompletionTokens}
              />
            </div>
            <div>
              <DialogFieldLabel>Custom Headers (JSON)</DialogFieldLabel>
              <Textarea
                aria-label="Custom Provider Headers"
                value={customHeaders}
                onChange={(event) => setCustomHeaders(event.target.value)}
                className={cn('mt-3')}
                placeholder={'{\n "User-Agent": "claude-code/0.1.0"\n}'}
              />
              <DialogFieldHint>
                Optional HTTP headers to send with each request (must be valid JSON format).
              </DialogFieldHint>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-none bg-transparent px-8">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
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
      <DialogContent showCloseButton={false} aria-label="Add Custom ACP Provider">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-md text-foreground">
            <Terminal aria-hidden="true" />
            Add Custom ACP Provider
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div>
            <DialogFieldLabel>Provider Name</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Provider Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn('mt-3')}
              placeholder="Provider name"
            />
          </div>
          <div>
            <DialogFieldLabel>Command</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Command"
              value={acpCommand}
              onChange={(event) => setAcpCommand(event.target.value)}
              className={cn('mt-3')}
              placeholder="e.g., claude-code-acp, gemini, codex"
            />
            <DialogFieldHint>The CLI command to spawn the ACP agent</DialogFieldHint>
          </div>
          <div>
            <DialogFieldLabel>Arguments (optional)</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Arguments"
              value={acpArgs}
              onChange={(event) => setAcpArgs(event.target.value)}
              className={cn('mt-3')}
              placeholder="e.g.,--acp --experimental-acp"
            />
            <DialogFieldHint>Command line arguments (space-separated)</DialogFieldHint>
          </div>

          <div className="bg-card p-2 text-xs">
            <div>Note:</div>
            ACP providers spawn local CLI processes. Make sure the command is installed and
            accessible in your PATH. You can configure MCP servers after creating the provider.
          </div>
        </div>

        <DialogFooter className="border-none bg-transparent">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={isSaving || name.trim().length === 0 || acpCommand.trim().length === 0}
            onClick={() => onCreate({ name, acpCommand, acpArgs })}
          >
            Add Custom ACP Provider
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
    <section className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-60">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="搜索提供商"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 w-full rounded-md border-input bg-secondary pl-10 pr-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 dark:focus-visible:ring-ring/50"
            placeholder="搜索提供商..."
          />
        </div>

        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          <Button size="lg" variant="secondary" onClick={() => setShowCustomAcpDialog(true)}>
            <Terminal aria-hidden="true" />
            Add Custom ACP Provider
          </Button>
          <Button size="lg" onClick={() => setShowCustomDialog(true)}>
            <Plus aria-hidden="true" />
            Add Custom Provider
          </Button>
        </div>
      </div>

      <div className="h-[calc(100%-52px)] flex justify-between gap-4">
        <div className="h-full w-60 flex-none rounded-lg border border-border bg-card">
          <ScrollArea role="list" aria-label="提供商列表" className="h-full  p-3">
            <div className="w-full flex flex-col gap-2 select-none">
              {filteredProviders.map((provider) => {
                const isSelected = provider.provider === selectedProvider
                const status = getProviderStatus(provider)

                return (
                  <div key={provider.provider} role="listitem">
                    <div
                      aria-label={`选择 ${provider.name}`}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-colors',
                        isSelected
                          ? 'border-primary text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                      onClick={() => setSelectedProvider(provider.provider)}
                    >
                      <div className="flex items-center gap-2">
                        <ProviderCatalogIcon
                          icon={providerIconAssets[provider.provider]}
                          provider={provider.provider}
                        />
                        <span className="line-clamp-1 text-sm font-semibold">{provider.name}</span>
                      </div>

                      {provider.badge ? (
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                          {provider.badge}
                        </span>
                      ) : null}

                      <span
                        aria-label={
                          status === 'active'
                            ? '已启用'
                            : status === 'inactive'
                              ? '未启用'
                              : '未配置'
                        }
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          status === 'active'
                            ? 'bg-primary'
                            : status === 'inactive'
                              ? 'bg-muted-foreground'
                              : 'bg-muted-foreground/60'
                        )}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="flex px-1.5 py-3 text-xs leading-5 text-muted-foreground">
              <Info size={14} className="flex-none mt-0.75 mr-1" />
              找不到想要的提供商？请先去插件页面安装对应的插件，然后再回到此页面。
            </p>
          </ScrollArea>
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
