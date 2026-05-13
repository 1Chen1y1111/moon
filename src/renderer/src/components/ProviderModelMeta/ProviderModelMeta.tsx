import { Brain, Eye, ImageIcon, Wrench } from 'lucide-react'

import { cn } from '@shadcn/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@shadcn/ui/tooltip'
import {
  formatProviderModelContextWindow,
  resolveAutoProviderModelCapability,
  type ProviderModel
} from '@shared/domain/provider'

function ModelCapabilityIcon({
  children,
  label,
  supported
}: {
  children: React.ReactNode
  label: string
  supported: boolean
}): React.JSX.Element | null {
  if (!supported) {
    return null
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className="inline-flex size-5 items-center justify-center rounded-md text-primary transition-colors"
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

export function ProviderModelMeta({
  className,
  model,
  showImageOutput = false,
  showModelId = true
}: {
  className?: string
  model: ProviderModel
  showImageOutput?: boolean
  showModelId?: boolean
}): React.JSX.Element {
  const contextWindow = formatProviderModelContextWindow(model)
  const contextWindowLabel =
    model.contextWindow === undefined
      ? ''
      : `${model.contextWindow.toLocaleString('en-US')} token context window`

  return (
    <div className={cn('mt-1 flex min-w-0 items-center gap-2', className)}>
      <ModelCapabilityIcon
        supported={resolveAutoProviderModelCapability(model, 'supportsVision')}
        label="Supports image input"
      >
        <Eye aria-hidden="true" className="size-3.5" />
      </ModelCapabilityIcon>
      <ModelCapabilityIcon
        supported={resolveAutoProviderModelCapability(model, 'supportsToolCalling')}
        label="Supports function calling"
      >
        <Wrench aria-hidden="true" className="size-3.5" />
      </ModelCapabilityIcon>
      <ModelCapabilityIcon
        supported={resolveAutoProviderModelCapability(model, 'supportsReasoning')}
        label="Extended thinking/reasoning"
      >
        <Brain aria-hidden="true" className="size-3.5" />
      </ModelCapabilityIcon>
      {showImageOutput ? (
        <ModelCapabilityIcon
          supported={model.supportsImageOutput ?? false}
          label="Supports image output"
        >
          <ImageIcon aria-hidden="true" className="size-3.5" />
        </ModelCapabilityIcon>
      ) : null}
      {contextWindow ? (
        <ModelContextWindowBadge value={contextWindow} label={contextWindowLabel} />
      ) : null}
      {showModelId && model.name !== model.id ? (
        <span className="min-w-0 truncate text-xs leading-5 text-muted-foreground">{model.id}</span>
      ) : null}
    </div>
  )
}
