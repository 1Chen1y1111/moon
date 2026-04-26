import {
  Bolt,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Server,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@shadcn/ui/button'
import { Input } from '@shadcn/ui/input'
import { Label } from '@shadcn/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shadcn/ui/select'
import { Switch } from '@shadcn/ui/switch'
import { Textarea } from '@shadcn/ui/textarea'
import { cn } from '@shadcn/lib/utils'
import type { ProviderApiFormat, ProviderModel } from '@shared/domain/provider'
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

const fieldClassName =
  'h-moon-control-lg rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-control-x text-moon-body leading-moon-body text-moon-text-primary placeholder:text-moon-text-muted focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50 disabled:opacity-60'

const textareaClassName =
  'min-h-moon-provider-textarea rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg py-moon-md font-mono text-moon-caption leading-moon-caption text-moon-text-primary placeholder:text-moon-text-muted focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50'

const selectTriggerClassName =
  'mt-moon-md h-moon-control-lg w-full rounded-moon-control border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-control-x text-moon-body leading-moon-body text-moon-text-primary focus-visible:border-moon-accent focus-visible:ring-3 focus-visible:ring-moon-accent/20 dark:focus-visible:ring-moon-accent/50'

const selectContentClassName =
  'border border-moon-border-default bg-moon-surface-1 text-moon-text-primary shadow-moon-ring'

const selectItemClassName =
  'text-moon-body leading-moon-body focus:bg-moon-button-secondary-bg-hover focus:text-moon-text-primary'

const switchClassName = 'data-checked:bg-moon-accent data-unchecked:bg-moon-button-secondary-bg'

const apiFormatLabels: Record<ProviderApiFormat, string> = {
  'openai-chat': 'Chat Completions (/chat/completions)',
  'openai-responses': 'Responses (/responses)',
  anthropic: 'Anthropic Messages (/v1/messages)'
}

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
    <Label
      htmlFor={htmlFor}
      className="block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary"
    >
      {children}
    </Label>
  )
}

function FieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="mt-moon-sm block text-moon-caption leading-moon-caption text-moon-text-muted">
      {children}
    </span>
  )
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
    <div className="space-y-moon-sm">
      <p className="text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
        {title}
      </p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-moon-option-gap rounded-moon-control border border-moon-border-subtle bg-moon-surface-1 px-moon-control-x py-moon-sm">
        <span className="moon-tag moon-tag-standard">{badge}</span>
        <code className="truncate font-mono text-moon-caption leading-moon-caption text-moon-text-primary">
          {url}
        </code>
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
      <p className="text-moon-caption leading-moon-caption text-moon-text-muted">{description}</p>
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
  manualModelId,
  manualModelName,
  onDraftChange,
  onRevealApiKeyToggle,
  onFetchModels,
  onTestProvider,
  onDeleteProvider,
  onModelSearchChange,
  onManualModelIdChange,
  onManualModelNameChange,
  onAddManualModel,
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
  const canAddManualModel = manualModelId.trim().length > 0
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
      className="min-h-0 overflow-hidden rounded-moon-card border border-moon-border-default bg-moon-surface-1"
    >
      <div className="flex items-start justify-between gap-moon-lg border-b border-moon-border-subtle px-moon-panel py-moon-card">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-moon-option-gap">
            <h2 className="font-moon-ui text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
              {provider.name}
            </h2>
            {provider.badge ? <span className="moon-tag">{provider.badge}</span> : null}
            <span className="moon-tag moon-tag-standard">{statusLabel}</span>
            {hasDraftOverride ? <span className="moon-tag moon-tag-strong">Unsaved</span> : null}
          </div>
          <p className="mt-moon-sm text-moon-body leading-moon-body text-moon-text-muted">
            {displayBaseUrl}
          </p>
          <p className="mt-moon-xs text-moon-caption leading-moon-caption text-moon-text-muted">
            {provider.updatedAt ? `上次保存于 ${provider.updatedAt}` : '尚未保存'}
          </p>
        </div>

        {!usesEnableOnlyCard ? (
          <div className="flex shrink-0 items-center gap-moon-option-gap">
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

      <div className="moon-provider-detail-scroll min-h-0 overflow-y-auto px-moon-panel py-moon-card">
        {testResult ? (
          <div
            className={cn(
              'mb-moon-card rounded-moon-control border px-moon-lg py-moon-md text-moon-body leading-moon-body',
              testResult.success
                ? 'border-moon-accent-soft-border bg-moon-accent-soft text-moon-text-primary'
                : 'border-moon-state-danger bg-moon-button-secondary-bg text-moon-state-danger'
            )}
          >
            {testResult.message}
          </div>
        ) : null}

        {usesEnableOnlyCard ? (
          <div className="flex items-start justify-between gap-moon-xl rounded-moon-card border border-moon-border-subtle bg-moon-surface-2 px-moon-card py-moon-panel">
            <p className="min-w-0 flex-1 text-moon-body leading-moon-body text-moon-text-muted">
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
          <div className="space-y-moon-card">
            <button
              type="button"
              className="flex w-full items-center gap-moon-option-gap rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-card py-moon-lg text-left text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary"
            >
              <Terminal aria-hidden="true" className="size-moon-icon text-moon-text-muted" />
              <span className="min-w-0 flex-1">ACP 代理端点</span>
              <span className="moon-tag">高级</span>
            </button>

            <div className="block">
              <FieldLabel>Command</FieldLabel>
              <Input
                aria-label={`${provider.name} ACP Command`}
                value={draft.acpCommand}
                onChange={(event) => onDraftChange('acpCommand', event.target.value)}
                className={cn('mt-moon-md', fieldClassName)}
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
                className={cn('mt-moon-md', fieldClassName)}
                placeholder="e.g., --acp --experimental-acp"
              />
              <FieldHint>Command line arguments, separated by spaces</FieldHint>
            </div>
          </div>
        ) : (
          <div className="space-y-moon-card">
            <div className="space-y-moon-md">
              <button
                type="button"
                aria-expanded={showsProxyEndpoints}
                className="flex w-full items-center gap-moon-option-gap rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-card py-moon-md text-left text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary"
                onClick={() => setShowsProxyEndpoints((current) => !current)}
              >
                <Server aria-hidden="true" className="size-moon-icon text-moon-text-muted" />
                <span className="min-w-0 flex-1">API 代理端点</span>
                <span className="moon-tag">高级</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    'size-moon-icon-sm text-moon-text-muted transition-transform',
                    showsProxyEndpoints ? 'rotate-180' : ''
                  )}
                />
              </button>

              {showsProxyEndpoints ? (
                <div className="space-y-moon-card rounded-moon-card border border-moon-border-subtle bg-moon-surface-2 p-moon-card">
                  <p className="text-moon-body leading-moon-body text-moon-text-muted">
                    Moon 为 {provider.name} 提供 API
                    代理端点。这些端点会将请求转换为当前提供商配置可用的格式。
                  </p>
                  <ProxyEndpointRow
                    badge="OpenAI"
                    copiedValue={copiedProxyValue}
                    description="将此端点用于需要 OpenAI Responses API 的工具。"
                    onCopy={handleCopyProxyText}
                    title="OpenAI Responses API 代理"
                    url={proxyEndpoints.responsesUrl}
                  />
                  <ProxyEndpointRow
                    badge="Anthropic"
                    copiedValue={copiedProxyValue}
                    description="将此端点用于 Anthropic Messages API 兼容的工具。"
                    onCopy={handleCopyProxyText}
                    title="Anthropic Messages API 代理"
                    url={proxyEndpoints.anthropicMessagesUrl}
                  />
                  <div className="space-y-moon-sm">
                    <p className="text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
                      与 Claude Code 一起使用
                    </p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-moon-option-gap">
                      <pre className="moon-code-block min-w-0 overflow-x-auto whitespace-pre-wrap">
                        {claudeCodeEnvironment}
                      </pre>
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
                  </div>
                </div>
              ) : null}
            </div>

            <div className="block">
              <FieldLabel>Provider Name</FieldLabel>
              <Input
                aria-label={`${provider.name} Provider Name`}
                value={draft.name}
                onChange={(event) => onDraftChange('name', event.target.value)}
                readOnly={!provider.isCustom}
                className={cn('mt-moon-md read-only:opacity-80', fieldClassName)}
                placeholder="Provider name"
              />
              {errors.name ? <FieldHint>{errors.name}</FieldHint> : null}
            </div>

            <div className="block">
              <FieldLabel>Base URL</FieldLabel>
              <Input
                aria-label={`${provider.name} Base URL`}
                value={draft.baseUrl}
                onChange={(event) => onDraftChange('baseUrl', event.target.value)}
                className={cn('mt-moon-md', fieldClassName)}
                placeholder={provider.defaultBaseUrl || 'https://api.example.com/v1'}
              />
              {errors.baseUrl ? (
                <FieldHint>{errors.baseUrl}</FieldHint>
              ) : provider.defaultBaseUrl ? (
                <FieldHint>留空时使用默认端点：{provider.defaultBaseUrl}</FieldHint>
              ) : null}
            </div>

            {!provider.noApiKey ? (
              <div className="block">
                <FieldLabel>API Key</FieldLabel>
                <div className="mt-moon-md flex gap-moon-option-gap">
                  <Input
                    aria-label={`${provider.name} API Key`}
                    type={revealsApiKey ? 'text' : 'password'}
                    value={draft.apiKey}
                    disabled={isSaving}
                    onChange={(event) => onDraftChange('apiKey', event.target.value)}
                    className={cn('min-w-0 flex-1', fieldClassName)}
                    placeholder={provider.hasApiKey ? '留空以保留已保存密钥' : 'Enter your API key'}
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
                      className="inline-flex items-center gap-moon-xs text-moon-accent"
                    >
                      {provider.name} API Keys
                      <ExternalLink aria-hidden="true" className="size-moon-icon-xs" />
                    </a>
                  </FieldHint>
                ) : null}
              </div>
            ) : null}

            <div className="block">
              <FieldLabel>API Format</FieldLabel>
              <Select
                value={draft.apiFormat}
                onValueChange={(value) => onDraftChange('apiFormat', value as ProviderApiFormat)}
              >
                <SelectTrigger
                  aria-label={`${provider.name} API Format`}
                  className={selectTriggerClassName}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClassName}>
                  {Object.entries(apiFormatLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value} className={selectItemClassName}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldHint>Choose the API endpoint format your provider uses</FieldHint>
            </div>

            {draft.apiFormat === 'openai-chat' ? (
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
                  checked={draft.useMaxCompletionTokens}
                  aria-label="Use max_completion_tokens"
                  className={switchClassName}
                  onCheckedChange={(checked) => onDraftChange('useMaxCompletionTokens', checked)}
                />
              </div>
            ) : null}

            <div className="block">
              <FieldLabel>Custom Headers (JSON)</FieldLabel>
              <Textarea
                aria-label={`${provider.name} Custom Headers`}
                value={draft.customHeaders}
                onChange={(event) => onDraftChange('customHeaders', event.target.value)}
                className={cn('mt-moon-md resize-y', textareaClassName)}
                placeholder={'{\n  "User-Agent": "claude-code/0.1.0"\n}'}
              />
              {errors.customHeaders ? (
                <FieldHint>{errors.customHeaders}</FieldHint>
              ) : (
                <FieldHint>
                  Optional HTTP headers to send with each request. Must be valid JSON object.
                </FieldHint>
              )}
            </div>
          </div>
        )}

        {!usesEnableOnlyCard ? (
          <section className="mt-moon-card space-y-moon-card">
            <div className="flex items-center justify-between gap-moon-lg">
              <FieldLabel>Models</FieldLabel>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={isFetchingModels || provider.isACP || provider.isOAuth}
                onClick={onFetchModels}
              >
                <Download aria-hidden="true" />
                {isFetchingModels ? 'Fetching' : 'Fetch'}
              </Button>
            </div>

            <div className="grid gap-moon-option-gap md:grid-cols-[1fr_1fr_auto]">
              <Input
                aria-label={`${provider.name} Model ID`}
                value={manualModelId}
                onChange={(event) => onManualModelIdChange(event.target.value)}
                className={cn('min-w-0', fieldClassName)}
                placeholder={
                  provider.type === 'azure'
                    ? 'Deployment name (e.g., gpt-4o)'
                    : 'Model ID (e.g., gpt-4o)'
                }
              />
              <Input
                aria-label={`${provider.name} Display Name`}
                value={manualModelName}
                onChange={(event) => onManualModelNameChange(event.target.value)}
                className={cn('min-w-0', fieldClassName)}
                placeholder="Display Name (optional)"
              />
              <Button
                type="button"
                size="lg"
                disabled={!canAddManualModel}
                onClick={onAddManualModel}
              >
                <Plus aria-hidden="true" />
                Add
              </Button>
            </div>
            <FieldHint>Add models manually or use Fetch to load from API</FieldHint>

            <Input
              aria-label={`${provider.name} Search models`}
              value={modelSearchQuery}
              onChange={(event) => onModelSearchChange(event.target.value)}
              className={fieldClassName}
              placeholder="Search models..."
            />
            <p className="text-moon-caption leading-moon-caption text-moon-text-muted">
              Showing {filteredModels.length} models ({enabledModelCount} enabled)
            </p>

            <div className="moon-model-list max-h-moon-provider-model-list overflow-y-auto rounded-moon-card border border-moon-border-subtle bg-moon-surface-2">
              {filteredModels.length > 0 ? (
                filteredModels.map((model) => {
                  const contextWindow = formatContextWindow(model)

                  return (
                    <div
                      key={model.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-moon-option-gap border-b border-moon-border-subtle px-moon-lg py-moon-md last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
                          {model.name}
                        </p>
                        {model.name !== model.id ? (
                          <p className="truncate text-moon-caption leading-moon-caption text-moon-text-muted">
                            {model.id}
                          </p>
                        ) : null}
                      </div>
                      {contextWindow ? (
                        <span className="moon-tag moon-tag-standard">{contextWindow}</span>
                      ) : null}
                      {model.isManual ? (
                        <button
                          type="button"
                          aria-label={`删除模型 ${model.id}`}
                          className="flex size-moon-control-sm items-center justify-center rounded-moon-control text-moon-text-muted transition-colors hover:bg-moon-button-secondary-bg-hover hover:text-moon-text-primary"
                          onClick={() => onRemoveModel(model.id)}
                        >
                          <X aria-hidden="true" className="size-moon-icon-sm" />
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
                  )
                })
              ) : (
                <p className="px-moon-lg py-moon-card text-center text-moon-body leading-moon-body text-moon-text-muted">
                  No model found.
                </p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
