import dayjs from 'dayjs'
import { Check, ChevronDown, Search, Trash2, X, Zap } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { Button } from '@moon/ui/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@moon/ui/ui/input-group'
import { Switch } from '@moon/ui/ui/switch'
import { cn } from '@moon/ui/lib/utils'
import type { ProviderModel } from '@moon/shared/domain/provider'
import type { ProviderSettings, ProviderTestResult } from '@moon/shared/domain/settings'

export function ProviderHeader({
  provider,
  enabled,
  displayBaseUrl,
  allModels,
  filteredTestModels,
  hasDraftOverride,
  isSaving,
  isTesting,
  isTestModelPopoverOpen,
  testModelQuery,
  testResult,
  usesEnableOnlyCard,
  onDeleteProvider,
  onEnabledChange,
  onTestModelQueryChange,
  onTestModelSelect,
  onTestModelPopoverOpenChange
}: {
  provider: ProviderSettings
  enabled: boolean
  displayBaseUrl: string
  allModels: ProviderModel[]
  filteredTestModels: ProviderModel[]
  hasDraftOverride: boolean
  isSaving: boolean
  isTesting: boolean
  isTestModelPopoverOpen: boolean
  testModelQuery: string
  testResult: ProviderTestResult | null
  usesEnableOnlyCard: boolean
  onDeleteProvider: () => void
  onEnabledChange: (enabled: boolean) => void
  onTestModelQueryChange: (value: string) => void
  onTestModelSelect: (modelId: string) => void
  onTestModelPopoverOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const statusLabel = provider.enabled
    ? 'Active'
    : provider.hasApiKey || provider.noApiKey
      ? 'Inactive'
      : 'Not configured'
  const formattedUpdatedAt = provider.updatedAt
    ? dayjs(provider.updatedAt).format('YYYY-MM-DD HH:mm:ss')
    : ''
  const testButtonTitle = isTesting
    ? '正在测试连接'
    : testResult?.success === true
      ? '连接成功，选择模型重新测试'
      : testResult?.success === false
        ? '连接失败，选择模型重新测试'
        : '选择要测试的模型'

  return (
    <div className="flex items-start justify-between gap-6 border-b border-border p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2 className="font-sans text-xl font-medium leading-9 text-foreground">
            {provider.name}
          </h2>
          {provider.badge ? (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
              {provider.badge}
            </span>
          ) : null}
          <span className="inline-flex flex-none  items-center rounded-md bg-primary/10 px-2 py-1 text-xs  uppercase tracking-wide text-primary">
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
          {formattedUpdatedAt ? `上次保存于 ${formattedUpdatedAt}` : '尚未保存'}
        </p>
        {testResult ? (
          <p
            className={cn(
              'mt-3 text-xs leading-6',
              testResult.success ? 'text-primary' : 'text-destructive'
            )}
          >
            {testResult.message}
          </p>
        ) : null}
      </div>

      {!usesEnableOnlyCard ? (
        <div className="flex shrink-0 items-center gap-3">
          {!provider.isBuiltIn ? (
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              aria-label="删除提供商"
              title="删除提供商"
              onClick={onDeleteProvider}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
          <PopoverPrimitive.Root
            open={isTestModelPopoverOpen}
            onOpenChange={(open) => {
              onTestModelPopoverOpenChange(open)
              if (open) {
                onTestModelQueryChange('')
              }
            }}
          >
            <PopoverPrimitive.Trigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                aria-label={testButtonTitle}
                title={testButtonTitle}
                aria-expanded={isTestModelPopoverOpen}
                className={cn(
                  'h-9 min-w-16 justify-center gap-2 rounded-lg px-3',
                  testResult?.success === true
                    ? 'text-primary'
                    : testResult?.success === false
                      ? 'text-destructive'
                      : ''
                )}
                disabled={isTesting || isSaving || allModels.length === 0}
              >
                {testResult?.success === true ? (
                  <Check aria-hidden="true" />
                ) : testResult?.success === false ? (
                  <X aria-hidden="true" />
                ) : (
                  <Zap aria-hidden="true" />
                )}
                <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
              </Button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="end"
                sideOffset={10}
                className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
              >
                <InputGroup className="h-10 rounded-md border-transparent bg-secondary">
                  <InputGroupAddon align="inline-start">
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="搜索要测试的模型"
                    value={testModelQuery}
                    onChange={(event) => onTestModelQueryChange(event.target.value)}
                    placeholder="选择要测试的模型"
                  />
                </InputGroup>

                <div className="mt-2 max-h-80 overflow-y-auto">
                  {filteredTestModels.length > 0 ? (
                    filteredTestModels.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        className={cn(
                          'flex w-full min-w-0 items-center rounded-md px-3 py-2 text-left text-sm leading-6 text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
                          testResult?.modelId === model.id ? 'bg-accent text-accent-foreground' : ''
                        )}
                        onClick={() => onTestModelSelect(model.id)}
                      >
                        <span className="min-w-0 truncate">{model.name}</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-6 text-center text-sm leading-6 text-muted-foreground">
                      未找到匹配模型
                    </p>
                  )}
                </div>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
          <Switch
            checked={enabled}
            aria-label="启用提供商"
            disabled={isSaving}
            onCheckedChange={onEnabledChange}
          />
        </div>
      ) : null}
    </div>
  )
}
