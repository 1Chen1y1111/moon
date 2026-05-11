import {
  Brain,
  Download,
  Eye,
  PackageOpen,
  Search,
  SlidersHorizontal,
  Wrench,
  X
} from 'lucide-react'

import { Button } from '@shadcn/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shadcn/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@shadcn/ui/input-group'
import { ScrollArea } from '@shadcn/ui/scroll-area'
import { Switch } from '@shadcn/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shadcn/ui/tooltip'
import { cn } from '@shadcn/lib/utils'
import type { ProviderModel } from '@shared/domain/provider'
import type { ProviderSettings } from '@shared/domain/settings'

import { FieldLabel } from './ProviderField'
import { formatContextWindow, resolveAutoModelCapability } from '../provider-model.utils'

function ModelCapabilityIcon({
  children,
  label,
  supported
}: {
  children: React.ReactNode
  label: string
  supported: boolean
}): React.JSX.Element {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={cn(
            'inline-flex size-5 items-center justify-center rounded-md transition-colors',
            supported ? 'text-primary' : 'text-muted-foreground/35'
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function ModelContextWindowBadge({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className="inline-flex items-center rounded-md text-xs leading-5 text-muted-foreground"
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function ProviderModelList({
  provider,
  filteredModels,
  enabledModelCount,
  isFetchingModels,
  modelSearchQuery,
  onFetchModels,
  onModelSearchChange,
  onOpenModelOptions,
  onRemoveModel,
  onToggleModel
}: {
  provider: ProviderSettings
  filteredModels: ProviderModel[]
  enabledModelCount: number
  isFetchingModels: boolean
  modelSearchQuery: string
  onFetchModels: () => void
  onModelSearchChange: (value: string) => void
  onOpenModelOptions: (modelId: string) => void
  onRemoveModel: (modelId: string) => void
  onToggleModel: (modelId: string) => void
}): React.JSX.Element {
  return (
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

      <TooltipProvider>
        <ScrollArea className="border border-border rounded-lg">
          <div className="max-h-72">
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => {
                const contextWindow = formatContextWindow(model)
                const contextWindowLabel =
                  model.contextWindow === undefined
                    ? ''
                    : `${model.contextWindow.toLocaleString('en-US')} token context window`

                return (
                  <div
                    key={model.id}
                    className="flex items-center justify-between gap-2 border-b border-border p-2 pr-4 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-6 text-foreground">{model.name}</p>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <ModelCapabilityIcon
                          supported={resolveAutoModelCapability(model, 'supportsVision')}
                          label="Supports image input"
                        >
                          <Eye aria-hidden="true" className="size-3.5" />
                        </ModelCapabilityIcon>
                        <ModelCapabilityIcon
                          supported={resolveAutoModelCapability(model, 'supportsToolCalling')}
                          label="Supports function calling"
                        >
                          <Wrench aria-hidden="true" className="size-3.5" />
                        </ModelCapabilityIcon>
                        <ModelCapabilityIcon
                          supported={resolveAutoModelCapability(model, 'supportsReasoning')}
                          label="Extended thinking/reasoning"
                        >
                          <Brain aria-hidden="true" className="size-3.5" />
                        </ModelCapabilityIcon>
                        {contextWindow ? (
                          <ModelContextWindowBadge
                            value={contextWindow}
                            label={contextWindowLabel}
                          />
                        ) : null}
                        {model.name !== model.id ? (
                          <span className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                            {model.id}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={`配置模型 ${model.id}`}
                        title="模型配置"
                        onClick={() => onOpenModelOptions(model.id)}
                      >
                        <SlidersHorizontal aria-hidden="true" />
                      </Button>
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
                        onCheckedChange={() => onToggleModel(model.id)}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <Empty className="min-h-48 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageOpen aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>暂无模型</EmptyTitle>
                  <EmptyDescription>点击 Fetch 拉取可用模型。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </ScrollArea>
      </TooltipProvider>
    </section>
  )
}
