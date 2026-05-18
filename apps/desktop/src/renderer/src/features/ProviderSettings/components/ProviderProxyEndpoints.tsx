import { Check, ChevronDown, Copy, Server } from 'lucide-react'

import { Button } from '@moon/ui/ui/button'
import { cn } from '@moon/ui/lib/utils'
import type { ProviderSettings } from '@moon/shared/domain/settings'
import type { createProviderProxyEndpoints } from '@moon/shared/domain/provider-proxy'

type ProviderProxyEndpointsValue = ReturnType<typeof createProviderProxyEndpoints>

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

export function ProviderProxyEndpoints({
  provider,
  proxyEndpoints,
  claudeCodeEnvironment,
  copiedProxyValue,
  showsProxyEndpoints,
  onCopyProxyText,
  onToggleProxyEndpoints
}: {
  provider: ProviderSettings
  proxyEndpoints: ProviderProxyEndpointsValue
  claudeCodeEnvironment: string
  copiedProxyValue: string
  showsProxyEndpoints: boolean
  onCopyProxyText: (value: string) => void
  onToggleProxyEndpoints: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div
        aria-expanded={showsProxyEndpoints}
        className="flex w-full items-center gap-3 rounded-md border border-input bg-secondary p-2 text-left text-sm  leading-6 text-foreground"
        onClick={onToggleProxyEndpoints}
      >
        <Server aria-hidden="true" className="size-3.5 text-muted-foreground" />
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
            onCopy={onCopyProxyText}
            title="OpenAI Responses API 代理"
            url={proxyEndpoints.responsesUrl}
          />
          <ProxyEndpointRow
            badge="Anthropic"
            copiedValue={copiedProxyValue}
            description="将此端点用于 Anthropic 兼容的工具。请求将被转换为 Chat Completions 格式。"
            onCopy={onCopyProxyText}
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
                  onClick={() => onCopyProxyText(claudeCodeEnvironment)}
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

              <pre className="rounded-md border border-border bg-card p-2 font-mono text-xs leading-5 text-foreground min-w-0 overflow-x-auto whitespace-pre-wrap">
                {claudeCodeEnvironment}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
