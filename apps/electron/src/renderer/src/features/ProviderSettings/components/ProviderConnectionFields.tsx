/**
 * 负责渲染 provider 设置中的连接字段。
 * 它只处理表单展示和草稿回写，不直接保存设置或发起连接测试。
 */

import { ExternalLink, Eye, EyeOff, Terminal } from 'lucide-react'

import { Button } from '@moon/ui/ui/button'
import { Input } from '@moon/ui/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@moon/ui/ui/select'
import { cn } from '@moon/ui/lib/utils'
import { resolveProviderDefaultBaseUrl, type ProviderApiFormat } from '@moon/shared/domain/provider'
import type { ProviderSettings } from '@moon/shared/domain/settings'

import { FieldHint, FieldLabel } from './ProviderField'
import type { ProviderDraft, ProviderFormErrors } from '../types'
import { usesEditableProviderProtocol } from '../provider-settings.utils'

/**
 * 返回 API 协议的用户可读名称，只在自定义 endpoint 配置时展示。
 */
function formatApiFormatLabel(apiFormat: ProviderApiFormat): string {
  if (apiFormat === 'anthropic') {
    return 'Anthropic Messages (/v1/messages)'
  }

  if (apiFormat === 'openai-responses') {
    return 'OpenAI Responses (/responses)'
  }

  return 'OpenAI Chat Completions (/chat/completions)'
}

/**
 * 渲染只需要启用开关的 provider 卡片内容。
 */
export function EnableOnlyProviderCard({
  description,
  enabled,
  isSaving,
  onEnable
}: {
  description: string
  enabled: boolean
  isSaving: boolean
  onEnable: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-10 rounded-lg border border-border bg-secondary px-6 py-6">
      <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
      <Button type="button" size="lg" disabled={isSaving || enabled} onClick={onEnable}>
        {enabled ? 'Provider Enabled' : 'Enable Provider'}
      </Button>
    </div>
  )
}

/**
 * 渲染 ACP provider 的命令和参数字段。
 */
export function AcpConnectionFields({
  provider,
  draft,
  errors,
  onDraftChange
}: {
  provider: ProviderSettings
  draft: ProviderDraft
  errors: ProviderFormErrors
  onDraftChange: (field: keyof ProviderDraft, value: ProviderDraft[keyof ProviderDraft]) => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md border border-input bg-secondary px-6 py-6 text-left text-sm  leading-6 text-foreground"
      >
        <Terminal aria-hidden="true" className="size-3.5 text-muted-foreground" />
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
  )
}

/**
 * 渲染 HTTP provider 的 API Key 与 Endpoint 字段。
 */
export function ApiConnectionFields({
  provider,
  draft,
  errors,
  isSaving,
  revealsApiKey,
  onDraftChange,
  onRevealApiKeyToggle,
  children
}: {
  provider: ProviderSettings
  draft: ProviderDraft
  errors: ProviderFormErrors
  isSaving: boolean
  revealsApiKey: boolean
  onDraftChange: (field: keyof ProviderDraft, value: ProviderDraft[keyof ProviderDraft]) => void
  onRevealApiKeyToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const usesEditableProtocol = usesEditableProviderProtocol(provider)
  const defaultBaseUrl =
    resolveProviderDefaultBaseUrl(provider.provider, draft.apiFormat) || provider.defaultBaseUrl

  return (
    <div className="space-y-4">
      {children}

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
              placeholder="Enter your API key"
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
        <FieldLabel>Endpoint URL</FieldLabel>
        <Input
          aria-label={`${provider.name} Endpoint URL`}
          value={draft.baseUrl}
          disabled={isSaving}
          onChange={(event) => onDraftChange('baseUrl', event.target.value)}
          className={cn('mt-3')}
          placeholder={defaultBaseUrl || 'https://api.example.com/v1'}
        />
        {errors.baseUrl ? (
          <FieldHint>{errors.baseUrl}</FieldHint>
        ) : defaultBaseUrl ? (
          <FieldHint>默认 endpoint：{defaultBaseUrl}</FieldHint>
        ) : null}
      </div>

      {usesEditableProtocol ? (
        <div className="block">
          <FieldLabel>Protocol</FieldLabel>
          <Select
            value={draft.apiFormat}
            disabled={isSaving}
            onValueChange={(value) => onDraftChange('apiFormat', value as ProviderApiFormat)}
          >
            <SelectTrigger
              aria-label={`${provider.name} Endpoint Protocol`}
              className="mt-3 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-chat">{formatApiFormatLabel('openai-chat')}</SelectItem>
              <SelectItem value="openai-responses">
                {formatApiFormatLabel('openai-responses')}
              </SelectItem>
              <SelectItem value="anthropic">{formatApiFormatLabel('anthropic')}</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint>自定义 endpoint 需要选择对应协议。</FieldHint>
        </div>
      ) : null}
    </div>
  )
}
