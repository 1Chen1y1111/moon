/**
 * 负责首页聊天输入区的模型切换弹层。
 * 它优先展示可用 LLM connection，并在缺少 connection 时回退 provider 模型。
 */

import { useMemo, useState } from 'react'
import { Bot, Check, Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ProviderCatalogIcon } from '@renderer/components/ProviderCatalogIcon'
import { ProviderModelMeta } from '@renderer/components/ProviderModelMeta'
import { selectChatSessions } from '@renderer/store/chat/selectors'
import { useChatStore } from '@renderer/store/chat'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { cn } from '@moon/ui/lib/utils'
import { Badge } from '@moon/ui/ui/badge'
import { Button } from '@moon/ui/ui/button'
import { Input } from '@moon/ui/ui/input'
import { ScrollArea } from '@moon/ui/ui/scroll-area'
import { formatProviderModelContextWindow, type ProviderModel } from '@moon/shared/domain/provider'
import type { ProviderSettings } from '@moon/shared/domain/settings'
import type { SaveProviderInput } from '@moon/shared/domain/settings-validation'
import {
  createChatProviderGroups,
  selectChatTarget,
  type ChatModelOption,
  type ChatProviderGroup
} from '../../chat-target-selection'

import Action from '../components/Action'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '请检查 Provider 配置后重试。'
}

function ensureSelectedModel(
  models: ProviderModel[],
  selectedModel: ProviderModel
): ProviderModel[] {
  const nextModel = { ...selectedModel, enabled: true }

  if (models.some((model) => model.id === selectedModel.id)) {
    return models.map((model) => (model.id === selectedModel.id ? nextModel : model))
  }

  return [...models, nextModel]
}

function createSaveProviderInput(
  provider: ProviderSettings,
  selectedModel: ProviderModel
): SaveProviderInput {
  return {
    provider: provider.provider,
    name: provider.name,
    type: provider.type,
    apiKey: provider.apiKey,
    model: selectedModel.id,
    models: ensureSelectedModel(provider.models, selectedModel),
    availableModels: ensureSelectedModel(provider.availableModels, selectedModel),
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

/**
 * 为模型选项生成稳定 key；有 connection 时优先使用 connection 身份。
 */
function createModelOptionKey(provider: ProviderSettings, option: ChatModelOption): string {
  return option.connection === undefined
    ? `${provider.provider}:${option.model.id}`
    : `connection:${option.connection.id}`
}

function filterProviderGroups(
  groups: ChatProviderGroup[],
  searchQuery: string
): ChatProviderGroup[] {
  const query = searchQuery.trim().toLowerCase()

  if (query.length === 0) {
    return groups
  }

  return groups
    .map(({ provider, models }) => {
      const providerMatches = `${provider.name} ${provider.provider}`.toLowerCase().includes(query)
      const filteredModels = providerMatches
        ? models
        : models.filter(({ model }) =>
            `${model.id} ${model.name}`.toLowerCase().includes(query)
          )

      return {
        provider,
        models: filteredModels
      }
    })
    .filter(({ provider, models }) => {
      const providerMatches = `${provider.name} ${provider.provider}`.toLowerCase().includes(query)

      return providerMatches || models.length > 0
    })
}

function openProviderSettings(): void {
  void window.api.windowControls.openSettings({ section: 'providers' })
}

function EmptyModelPanel(): React.JSX.Element {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
        <Bot aria-hidden="true" className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium leading-6 text-foreground">没有可选模型</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          先启用一个聊天 Provider 和模型。
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={openProviderSettings}>
        <SlidersHorizontal aria-hidden="true" />
        Provider 设置
      </Button>
    </div>
  )
}

function ModelSwitchPanel({
  groups,
  pendingModelKey,
  searchQuery,
  selectedModelKey,
  onModelSelect,
  onSearchChange
}: {
  groups: ChatProviderGroup[]
  pendingModelKey: string | null
  searchQuery: string
  selectedModelKey: string
  onModelSelect: (provider: ProviderSettings, option: ChatModelOption) => void
  onSearchChange: (value: string) => void
}): React.JSX.Element {
  const visibleGroups = filterProviderGroups(groups, searchQuery)

  return (
    <div className="w-full overflow-hidden" onKeyDown={(event) => event.stopPropagation()}>
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="搜索模型"
            className="pl-8"
            placeholder="搜索模型..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
              }
            }}
          />
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <EmptyModelPanel />
      ) : (
        <ScrollArea className="h-80">
          <div className="space-y-2 p-2">
            {visibleGroups.map(({ provider, models }) => (
              <section key={provider.provider} className="min-w-0">
                <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderCatalogIcon provider={provider.provider} size="sm" />
                    <p className="truncate text-xs font-medium leading-5 text-foreground">
                      {provider.name}
                    </p>
                  </div>
                </div>

                {models.length === 0 ? (
                  <div className="px-2 py-2 text-xs leading-5 text-muted-foreground">
                    该 Provider 没有启用模型。
                  </div>
                ) : (
                  <div className="space-y-1">
                    {models.map((option) => {
                      const { model } = option
                      const modelKey = createModelOptionKey(provider, option)
                      const selected = modelKey === selectedModelKey
                      const pending = modelKey === pendingModelKey

                      return (
                        <button
                          key={modelKey}
                          type="button"
                          aria-current={selected}
                          aria-label={`选择模型 ${model.name || model.id}`}
                          disabled={pendingModelKey !== null}
                          className={cn(
                            'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors',
                            'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40',
                            selected && 'bg-primary/10 text-primary',
                            pendingModelKey !== null && !pending && 'opacity-60'
                          )}
                          onClick={() => onModelSelect(provider, option)}
                        >
                          <span className="min-w-0 flex-1 ml-6">
                            <span className="block truncate text-sm leading-5">
                              {model.name || model.id}
                            </span>
                            <ProviderModelMeta model={model} showImageOutput />
                          </span>
                          {selected || pending ? (
                            <Check
                              aria-hidden="true"
                              className={cn(
                                'size-4 shrink-0',
                                pending ? 'animate-pulse text-muted-foreground' : 'text-primary'
                              )}
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function ModelDetailPanel({
  model,
  provider
}: {
  model: ProviderModel
  provider: ProviderSettings
}): React.JSX.Element {
  const contextWindow = formatProviderModelContextWindow(model)
  const providerOptions = model.providerOptions?.trim()

  return (
    <div className="space-y-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium leading-6 text-foreground">{model.name || model.id}</p>
        <p className="truncate text-xs leading-5 text-muted-foreground">
          {provider.name} · {model.id}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-secondary px-2 py-1.5">
          <p className="text-muted-foreground">上下文</p>
          <p className="mt-0.5 font-medium text-foreground">{contextWindow || '未知'}</p>
        </div>
        <div className="rounded-md bg-secondary px-2 py-1.5">
          <p className="text-muted-foreground">输出上限</p>
          <p className="mt-0.5 font-medium text-foreground">
            {model.maxOutputTokens?.toLocaleString('en-US') ?? '未知'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {model.supportsVision ? <Badge variant="secondary">图像输入</Badge> : null}
        {model.supportsToolCalling ? <Badge variant="secondary">工具调用</Badge> : null}
        {model.supportsReasoning ? <Badge variant="secondary">推理</Badge> : null}
        {model.supportsImageOutput ? <Badge variant="secondary">图像输出</Badge> : null}
      </div>

      {providerOptions ? (
        <pre className="max-h-28 overflow-auto rounded-md bg-secondary p-2 text-xs leading-5 text-muted-foreground">
          {providerOptions}
        </pre>
      ) : null}

      <Button type="button" variant="outline" size="sm" onClick={openProviderSettings}>
        <SlidersHorizontal aria-hidden="true" />
        Provider 设置
      </Button>
    </div>
  )
}

export default function Model(): React.JSX.Element {
  const appSettings = useSettingsStore(selectAppSettings)
  const saveProviderSettings = useSettingsStore((state) => state.saveProviderSettings)
  const sessions = useChatStore(selectChatSessions)
  const { routeState, setRouteState } = useAppRouterContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [switchOpen, setSwitchOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pendingModelKey, setPendingModelKey] = useState<string | null>(null)
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === routeState.activeChatId),
    [routeState.activeChatId, sessions]
  )
  const activeTarget = selectChatTarget(appSettings, {
    activeSessionConnectionId: activeSession?.llmConnectionId,
    activeSessionProvider: activeSession?.provider,
    draftLlmConnectionId: routeState.draftLlmConnectionId,
    draftProviderId: routeState.draftProviderId
  })
  const activeProvider = activeTarget.provider
  const selectedModelId = activeTarget.modelId
  const selectedModel = activeTarget.model
  const selectedModelKey =
    activeProvider === undefined || selectedModelId.length === 0
      ? ''
      : activeTarget.connection === undefined
        ? `${activeProvider.provider}:${selectedModelId}`
        : `connection:${activeTarget.connection.id}`
  const providerGroups = useMemo<ChatProviderGroup[]>(
    () => createChatProviderGroups(appSettings),
    [appSettings]
  )
  const switchTitle =
    activeProvider === undefined
      ? '选择模型'
      : `切换模型：${activeProvider.name} · ${activeTarget.modelLabel}`

  async function handleModelSelect(
    provider: ProviderSettings,
    option: ChatModelOption
  ): Promise<void> {
    const modelKey = createModelOptionKey(provider, option)

    setPendingModelKey(modelKey)

    try {
      if (option.connection === undefined) {
        await saveProviderSettings(createSaveProviderInput(provider, option.model))
      }

      setRouteState((state) => ({
        ...state,
        draftLlmConnectionId: option.connection?.id ?? null,
        draftProviderId: provider.provider
      }))

      setSwitchOpen(false)
    } catch (error) {
      toast.error('切换模型失败', {
        description: getErrorMessage(error)
      })
    } finally {
      setPendingModelKey(null)
    }
  }

  return (
    <div
      className={cn('flex min-w-0 items-center rounded-full', selectedModel && 'bg-secondary/70')}
    >
      <Action
        icon={Bot}
        iconNode={
          selectedModel && activeProvider ? (
            <ProviderCatalogIcon provider={activeProvider.provider} size="sm" />
          ) : undefined
        }
        loading={pendingModelKey !== null}
        open={switchOpen}
        pressed={switchOpen}
        title={switchTitle}
        popover={{
          content: (
            <ModelSwitchPanel
              groups={providerGroups}
              pendingModelKey={pendingModelKey}
              searchQuery={searchQuery}
              selectedModelKey={selectedModelKey}
              onModelSelect={(provider, option) => {
                void handleModelSelect(provider, option)
              }}
              onSearchChange={setSearchQuery}
            />
          ),
          contentClassName: 'p-0',
          maxWidth: 480,
          minWidth: 360,
          placement: 'topLeft'
        }}
        onOpenChange={setSwitchOpen}
      />

      {selectedModel && activeProvider ? (
        <Action
          icon={Settings2}
          open={detailOpen}
          pressed={detailOpen}
          title="模型详情"
          popover={{
            content: <ModelDetailPanel model={selectedModel} provider={activeProvider} />,
            maxWidth: 360,
            minWidth: 320,
            placement: 'topLeft',
            title: '模型详情'
          }}
          onOpenChange={setDetailOpen}
        />
      ) : null}
    </div>
  )
}
