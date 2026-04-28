import {
  Bolt,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Search,
  Server,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@shadcn/ui/button'
import { Input } from '@shadcn/ui/input'
import { Label } from '@shadcn/ui/label'
import { Switch } from '@shadcn/ui/switch'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@shadcn/ui/input-group'
import { ScrollArea } from '@shadcn/ui/scroll-area'
import { cn } from '@shadcn/lib/utils'
import type { ProviderModel } from '@shared/domain/provider'
import { createProviderProxyEndpoints } from '@shared/domain/provider-proxy'
import type { ProviderSettings, ProviderTestResult } from '@shared/domain/settings'
import type { SaveProviderInput } from '@shared/domain/settings-validation'

export type ProviderDraft = SaveProviderInput

export type ProviderFormErrors = Partial<Record<keyof SaveProviderInput, string>>

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
}

const switchClassName = 'data-checked:bg-primary data-unchecked:bg-secondary'

function formatContextWindow(model: ProviderModel): string {
  if (model.contextWindow === undefined) {
    return ''
  }

  if (model.contextWindow >= 1000) {
    return `${Math.round(model.contextWindow / 1000)}K`
  }

  return String(model.contextWindow)
}

function FieldLabel({
  children,
  htmlFor
}: {
  children: React.ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <Label htmlFor={htmlFor} className="block text-sm  leading-6 text-foreground">
      {children}
    </Label>
  )
}

function FieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{children}</span>
}

function ProxyEndpointRow({
  badge,
  copiedValue,
  description,
  onCopy,
  title,
  url
}: {
  badge: string
  copiedValue: string
  description: string
  onCopy: (value: string) => void
  title: string
  url: string
}): React.JSX.Element {
  const isCopied = copiedValue === url

  return (
    <div className="space-y-1.5">
      <p className="text-sm  leading-6 text-foreground">{title}</p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-card px-3 py-1.5">
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
          {badge}
        </span>
        <code className="truncate font-mono text-xs leading-5 text-foreground">{url}</code>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={`复制 ${title}`}
          onClick={() => onCopy(url)}
        >
          {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

export function ProviderSettingsCard({
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
  onRemoveModel
}: ProviderSettingsCardProps): React.JSX.Element {
  const statusLabel = provider.enabled
    ? 'Active'
    : provider.hasApiKey || provider.noApiKey
      ? 'Inactive'
      : 'Not configured'
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
  const [showsProxyEndpoints, setShowsProxyEndpoints] = useState(false)
  const [copiedProxyValue, setCopiedProxyValue] = useState('')
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

  return (
    <div
      role="region"
      aria-label={`${provider.name} provider details`}
      className="w-full rounded-lg border border-border bg-card"
    >
      <div className="flex items-start justify-between gap-6 border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-sans text-xl font-medium leading-7 text-foreground">
              {provider.name}
            </h2>
            {provider.badge ? (
              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
                {provider.badge}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
              {statusLabel}
            </span>
            {hasDraftOverride ? (
              <span className="inline-flex items-center rounded-md bg-primary/20 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
                Unsaved
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{displayBaseUrl}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {provider.updatedAt ? `上次保存于 ${provider.updatedAt}` : '尚未保存'}
          </p>
        </div>

        {!usesEnableOnlyCard ? (
          <div className="flex shrink-0 items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              aria-label={provider.isBuiltIn ? '重置提供商' : '删除提供商'}
              title={provider.isBuiltIn ? '重置提供商' : '删除提供商'}
              onClick={onDeleteProvider}
            >
              <Trash2 aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              aria-label="测试连接"
              disabled={isTesting || isSaving}
              onClick={() => onTestProvider()}
            >
              <Bolt aria-hidden="true" />
              {isTesting ? 'Testing' : 'Test'}
              <ChevronDown aria-hidden="true" />
            </Button>
            <Switch
              checked={draft.enabled}
              aria-label="启用提供商"
              disabled={isSaving}
              className={switchClassName}
              onCheckedChange={(checked) => onDraftChange('enabled', checked)}
            />
          </div>
        ) : null}
      </div>

      <ScrollArea className="h-[calc(100%-115px)]">
        <div className="px-6 py-6">
          {testResult ? (
            <div
              className={cn(
                'mb-6 rounded-md border px-6 py-3 text-sm leading-6',
                testResult.success
                  ? 'border-primary/20 bg-primary/10 text-foreground'
                  : 'border-destructive bg-secondary text-destructive'
              )}
            >
              {testResult.message}
            </div>
          ) : null}

          {usesEnableOnlyCard ? (
            <div className="flex items-start justify-between gap-10 rounded-lg border border-border bg-secondary px-6 py-6">
              <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">
                {provider.description}
              </p>
              <Button
                type="button"
                size="lg"
                disabled={isSaving || draft.enabled}
                onClick={() => onDraftChange('enabled', true)}
              >
                {draft.enabled ? 'Provider Enabled' : 'Enable Provider'}
              </Button>
            </div>
          ) : provider.isACP ? (
            <div className="space-y-4">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md border border-input bg-secondary px-6 py-6 text-left text-sm  leading-6 text-foreground"
              >
                <Terminal aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">ACP 代理端点</span>
                <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
                  高级
                </span>
              </button>

              <div className="block">
                <FieldLabel>Command</FieldLabel>
                <Input
                  aria-label={`${provider.name} ACP Command`}
                  value={draft.acpCommand}
                  onChange={(event) => onDraftChange('acpCommand', event.target.value)}
                  className={cn('mt-3')}
                  placeholder="e.g., claude-code-acp, gemini, codex"
                />
                {errors.acpCommand ? (
                  <FieldHint>{errors.acpCommand}</FieldHint>
                ) : (
                  <FieldHint>The CLI command to spawn the ACP agent</FieldHint>
                )}
              </div>

              <div className="block">
                <FieldLabel>Arguments</FieldLabel>
                <Input
                  aria-label={`${provider.name} ACP Arguments`}
                  value={draft.acpArgs.join(' ')}
                  onChange={(event) =>
                    onDraftChange('acpArgs', event.target.value.split(/\s+/).filter(Boolean))
                  }
                  className={cn('mt-3')}
                  placeholder="e.g., --acp --experimental-acp"
                />
                <FieldHint>Command line arguments, separated by spaces</FieldHint>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <div
                  aria-expanded={showsProxyEndpoints}
                  className="flex w-full items-center gap-3 rounded-md border border-input bg-secondary px-3 py-3 text-left text-sm  leading-6 text-foreground"
                  onClick={() => setShowsProxyEndpoints((current) => !current)}
                >
                  <Server aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">API 代理端点</span>
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
                    高级
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform',
                      showsProxyEndpoints ? 'rotate-180' : ''
                    )}
                  />
                </div>

                {showsProxyEndpoints ? (
                  <div className="space-y-4 rounded-lg border border-border bg-secondary p-4">
                    <p className="text-xs leading-6 text-muted-foreground">
                      Moon 为 {provider.name} 提供 API
                      代理端点。这些端点会将请求转换为当前提供商配置可用的格式。
                    </p>
                    <ProxyEndpointRow
                      badge="OpenAI"
                      copiedValue={copiedProxyValue}
                      description="将此端点用于需要 OpenAI Responses API 的工具（如 Codex）。请求将被转换为 Chat Completions 格式。"
                      onCopy={handleCopyProxyText}
                      title="OpenAI Responses API 代理"
                      url={proxyEndpoints.responsesUrl}
                    />
                    <ProxyEndpointRow
                      badge="Anthropic"
                      copiedValue={copiedProxyValue}
                      description="将此端点用于 Anthropic 兼容的工具。请求将被转换为 Chat Completions 格式。"
                      onCopy={handleCopyProxyText}
                      title="Anthropic Messages API 代理"
                      url={proxyEndpoints.anthropicMessagesUrl}
                    />
                    <div className="space-y-1.5">
                      <div className="flex flex-col rounded-md border border-border bg-card gap-3 p-3">
                        <div className="w-full flex items-center justify-between text-sm text-foreground">
                          与 Claude Code 一起使用
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-sm"
                            aria-label="复制 Claude Code 环境变量"
                            onClick={() => handleCopyProxyText(claudeCodeEnvironment)}
                          >
                            {copiedProxyValue === claudeCodeEnvironment ? (
                              <Check aria-hidden="true" />
                            ) : (
                              <Copy aria-hidden="true" />
                            )}
                          </Button>
                        </div>

                        <div className="text-xs">
                          您可以通过设置以下环境变量，将此提供商与 Claude Code 一起使用：
                        </div>

                        <pre className="rounded-md border border-border bg-card px-3 py-3 font-mono text-xs leading-5 text-foreground min-w-0 overflow-x-auto whitespace-pre-wrap">
                          {claudeCodeEnvironment}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {!provider.noApiKey ? (
                <div className="block">
                  <FieldLabel>API Key</FieldLabel>
                  <div className="mt-3 flex gap-3">
                    <Input
                      aria-label={`${provider.name} API Key`}
                      type={revealsApiKey ? 'text' : 'password'}
                      value={draft.apiKey}
                      disabled={isSaving}
                      onChange={(event) => onDraftChange('apiKey', event.target.value)}
                      className={cn('min-w-0 flex-1')}
                      placeholder={
                        provider.hasApiKey ? '留空以保留已保存密钥' : 'Enter your API key'
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-lg"
                      aria-label={revealsApiKey ? '隐藏 API Key' : '显示 API Key'}
                      onClick={onRevealApiKeyToggle}
                    >
                      {revealsApiKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </Button>
                  </div>
                  {errors.apiKey ? (
                    <FieldHint>{errors.apiKey}</FieldHint>
                  ) : provider.apiKeyPreview ? (
                    <FieldHint>当前密钥：{provider.apiKeyPreview}</FieldHint>
                  ) : provider.apiKeyHelpUrl ? (
                    <FieldHint>
                      Get your API key from{' '}
                      <a
                        href={provider.apiKeyHelpUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary"
                      >
                        {provider.name} API Keys
                        <ExternalLink aria-hidden="true" className="size-3" />
                      </a>
                    </FieldHint>
                  ) : null}
                </div>
              ) : null}

              <div className="block">
                <FieldLabel>Base URL</FieldLabel>
                <Input
                  aria-label={`${provider.name} Base URL`}
                  value={draft.baseUrl}
                  onChange={(event) => onDraftChange('baseUrl', event.target.value)}
                  className={cn('mt-3')}
                  placeholder={provider.defaultBaseUrl || 'https://api.example.com/v1'}
                />
                {errors.baseUrl ? (
                  <FieldHint>{errors.baseUrl}</FieldHint>
                ) : provider.defaultBaseUrl ? (
                  <FieldHint>留空时使用默认端点：{provider.defaultBaseUrl}</FieldHint>
                ) : null}
              </div>
            </div>
          )}

          {!usesEnableOnlyCard ? (
            <section className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-6">
                <FieldLabel>Models</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={isFetchingModels || provider.isACP || provider.isOAuth}
                  onClick={onFetchModels}
                >
                  <Download aria-hidden="true" />
                  {isFetchingModels ? 'Fetching' : 'Fetch'}
                </Button>
              </div>

              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={`${provider.name} Search models`}
                  value={modelSearchQuery}
                  onChange={(event) => onModelSearchChange(event.target.value)}
                  placeholder="Search models..."
                />
              </InputGroup>

              <p className="text-xs leading-5 text-muted-foreground">
                Showing {filteredModels.length} models ({enabledModelCount} enabled)
              </p>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                {filteredModels.length > 0 ? (
                  filteredModels.map((model) => {
                    const contextWindow = formatContextWindow(model)

                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between gap-2 border-b border-border px-3 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm leading-6 text-foreground">{model.name}</p>
                          {model.name !== model.id ? (
                            <p className="truncate text-xs leading-5 text-muted-foreground">
                              {model.id}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          {contextWindow ? (
                            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
                              {contextWindow}
                            </span>
                          ) : null}
                          {model.isManual ? (
                            <button
                              type="button"
                              aria-label={`删除模型 ${model.id}`}
                              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              onClick={() => onRemoveModel(model.id)}
                            >
                              <X aria-hidden="true" className="size-3.5" />
                            </button>
                          ) : (
                            <span />
                          )}
                          <Switch
                            checked={model.enabled}
                            aria-label={`启用模型 ${model.id}`}
                            className={switchClassName}
                            onCheckedChange={() => onToggleModel(model.id)}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="px-6 py-6 text-center text-sm leading-6 text-muted-foreground">
                    No model found.
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
