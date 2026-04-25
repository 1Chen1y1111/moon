import {
  Bolt,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Server,
  ToggleLeft,
  Trash2
} from 'lucide-react'

import { Button } from '@shadcn/ui/button'
import { cn } from '@shadcn/lib/utils'
import { providerMetadata, type ProviderId } from '@shared/domain/provider'
import type { SaveProviderInput } from '@shared/domain/settings-validation'

export type ProviderDraft = {
  apiKey: string
  model: string
  baseUrl: string
}

export type ProviderFormErrors = Partial<Record<keyof SaveProviderInput, string>>

type ProviderSettingsCardProps = {
  provider: ProviderId
  draft: ProviderDraft
  errors: ProviderFormErrors
  hasApiKey: boolean
  apiKeyPreview: string
  isSaving: boolean
  updatedAt: string
  isAdvancedOpen: boolean
  revealsApiKey: boolean
  onDraftChange: (provider: ProviderId, field: keyof ProviderDraft, value: string) => void
  onAdvancedToggle: (provider: ProviderId) => void
  onRevealApiKeyToggle: (provider: ProviderId) => void
}

export function ProviderSettingsCard({
  provider,
  draft,
  errors,
  hasApiKey,
  apiKeyPreview,
  isSaving,
  updatedAt,
  isAdvancedOpen,
  revealsApiKey,
  onDraftChange,
  onAdvancedToggle,
  onRevealApiKeyToggle
}: ProviderSettingsCardProps): React.JSX.Element {
  const metadata = providerMetadata[provider]
  const statusLabel = hasApiKey ? '已配置' : '未配置'
  const displayBaseUrl = draft.baseUrl.trim() || metadata.defaultBaseUrl || metadata.description
  const showsModelPicker = metadata.kind !== 'custom'

  return (
    <div
      role="region"
      aria-label={`${metadata.label} provider details`}
      className="min-h-0 rounded-moon-card border border-moon-border-default bg-moon-surface-1 p-moon-panel"
    >
      <div className="flex items-start justify-between gap-moon-lg">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-moon-option-gap">
            <h2 className="font-moon-ui text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
              {metadata.label}
            </h2>
            {metadata.badge ? <span className="moon-tag">{metadata.badge}</span> : null}
            <span className="moon-tag moon-tag-standard">{statusLabel}</span>
          </div>
          <p className="mt-moon-sm text-moon-body leading-moon-body text-moon-text-muted">
            {displayBaseUrl}
          </p>
          <p className="mt-moon-xs text-moon-caption leading-moon-caption text-moon-text-muted">
            {updatedAt ? `上次保存于 ${updatedAt}` : '尚未保存'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-moon-option-gap">
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            aria-label="删除提供商"
            disabled
            title="删除 provider 待接入"
          >
            <Trash2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            aria-label="测试连接"
            disabled
            title="测试连接待接入"
          >
            <Bolt aria-hidden="true" />
            <ChevronDown aria-hidden="true" />
          </Button>
          <button
            type="button"
            aria-label="启用提供商"
            disabled
            title="启用开关待接入"
            className="moon-window-no-drag inline-flex h-moon-control-lg items-center rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-control-x text-moon-text-muted opacity-60"
          >
            <ToggleLeft aria-hidden="true" className="size-moon-control-sm" />
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={isAdvancedOpen}
        className="mt-moon-card flex w-full items-center gap-moon-option-gap rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-card py-moon-lg text-left text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
        onClick={() => onAdvancedToggle(provider)}
      >
        <Server aria-hidden="true" className="size-moon-icon text-moon-text-muted" />
        <span className="min-w-0 flex-1">API 代理端点</span>
        <span className="moon-tag">高级</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-moon-icon-sm text-moon-text-muted transition-transform',
            isAdvancedOpen ? 'rotate-90' : ''
          )}
        />
      </button>

      {isAdvancedOpen ? (
        <div className="mt-moon-card space-y-moon-card">
          <label className="block">
            <span className="block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
              Provider Name
            </span>
            <input
              aria-label={`${metadata.label} Provider Name`}
              value={metadata.label}
              readOnly
              className="mt-moon-md h-moon-field w-full rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
            />
          </label>

          <label className="block">
            <span className="block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
              Base URL
            </span>
            <input
              aria-label={`${metadata.label} Base URL`}
              value={draft.baseUrl}
              onChange={(event) => onDraftChange(provider, 'baseUrl', event.target.value)}
              className="mt-moon-md h-moon-field w-full rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent"
              placeholder={metadata.defaultBaseUrl || 'https://api.example.com/v1'}
            />
            {errors.baseUrl ? (
              <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-state-danger">
                {errors.baseUrl}
              </span>
            ) : metadata.defaultBaseUrl ? (
              <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-text-muted">
                留空时使用默认端点：{metadata.defaultBaseUrl}
              </span>
            ) : null}
          </label>
        </div>
      ) : null}

      <label className="mt-moon-card block">
        <span className="block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
          API Key
        </span>
        <div className="mt-moon-md flex gap-moon-option-gap">
          <input
            aria-label={`${metadata.label} API Key`}
            type={revealsApiKey ? 'text' : 'password'}
            value={draft.apiKey}
            disabled={isSaving}
            onChange={(event) => onDraftChange(provider, 'apiKey', event.target.value)}
            className="h-moon-field min-w-0 flex-1 rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent disabled:opacity-60"
            placeholder={hasApiKey ? '留空以保留已保存密钥' : 'sk-...'}
          />
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            aria-label={revealsApiKey ? '隐藏 API Key' : '显示 API Key'}
            onClick={() => onRevealApiKeyToggle(provider)}
          >
            {revealsApiKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        {errors.apiKey ? (
          <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-state-danger">
            {errors.apiKey}
          </span>
        ) : apiKeyPreview ? (
          <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-text-muted">
            当前密钥：{apiKeyPreview}
          </span>
        ) : null}
        {metadata.apiKeyHelpUrl ? (
          <a
            className="mt-moon-sm inline-flex items-center gap-moon-sm text-moon-caption leading-moon-caption text-moon-accent hover:underline"
            href={metadata.apiKeyHelpUrl}
            target="_blank"
            rel="noreferrer"
          >
            获取 {metadata.label} API Key
            <ExternalLink aria-hidden="true" className="size-moon-icon-xs" />
          </a>
        ) : null}
      </label>

      {metadata.kind === 'custom' ? (
        <label className="mt-moon-card block">
          <span className="block text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary">
            API Format
          </span>
          <button
            type="button"
            disabled
            className="mt-moon-md flex h-moon-field w-full items-center justify-between rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-left text-moon-body leading-moon-body text-moon-text-primary opacity-80"
          >
            <span>Chat Completions (/chat/completions)</span>
            <ChevronDown aria-hidden="true" className="size-moon-icon-sm text-moon-text-muted" />
          </button>
        </label>
      ) : null}

      <div className="mt-moon-card">
        <div className="flex items-center justify-between gap-moon-lg">
          <label
            htmlFor={`provider-model-${provider}`}
            className="text-moon-body-lead font-moon-label leading-moon-body-lead text-moon-text-primary"
          >
            Models
          </label>
          <Button type="button" variant="secondary" size="lg" disabled title="模型拉取待接入">
            <Download aria-hidden="true" />
            Fetch
          </Button>
        </div>
        <input
          id={`provider-model-${provider}`}
          aria-label={`${metadata.label} Model`}
          value={draft.model}
          disabled={isSaving}
          onChange={(event) => onDraftChange(provider, 'model', event.target.value)}
          className="mt-moon-md h-moon-field w-full rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary outline-none transition-colors focus:border-moon-accent disabled:opacity-60"
          placeholder={metadata.modelPlaceholder}
        />
        {errors.model ? (
          <span className="mt-moon-md block text-moon-caption leading-moon-caption text-moon-state-danger">
            {errors.model}
          </span>
        ) : null}
        {showsModelPicker ? (
          <div className="mt-moon-xl rounded-moon-card border border-moon-border-subtle bg-moon-surface-2 px-moon-card py-moon-panel text-center">
            <p className="text-moon-body-lead leading-moon-body-lead text-moon-text-muted">
              {draft.model.trim().length > 0 ? `当前模型：${draft.model.trim()}` : '暂无可用模型'}
            </p>
            <p className="mt-moon-sm text-moon-caption leading-moon-caption text-moon-text-muted">
              模型拉取接入前，请先手动填写模型名称
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
