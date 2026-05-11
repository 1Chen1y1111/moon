import { useState } from 'react'
import { Brain, Eye, ImageIcon, SlidersHorizontal, Waypoints, Wrench } from 'lucide-react'

import { Badge } from '@shadcn/ui/badge'
import { Button } from '@shadcn/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@shadcn/ui/dialog'
import { Input } from '@shadcn/ui/input'
import { Label } from '@shadcn/ui/label'
import { Switch } from '@shadcn/ui/switch'
import { Textarea } from '@shadcn/ui/textarea'
import type { ProviderModel, ProviderModelManualOverride } from '@shared/domain/provider'

import { FieldHint } from './ProviderField'
import { resolveAutoModelCapability } from '../provider-model.utils'

type ModelOptionsDraft = {
  supportsVision: boolean
  supportsImageOutput: boolean
  supportsToolCalling: boolean
  supportsReasoning: boolean
  supportsEmbedding: boolean
  contextWindow: string
  maxOutputTokens: string
  providerOptions: string
}

function createModelOptionsDraft(model: ProviderModel): ModelOptionsDraft {
  return {
    supportsVision: resolveAutoModelCapability(model, 'supportsVision'),
    supportsImageOutput: model.supportsImageOutput ?? false,
    supportsToolCalling: resolveAutoModelCapability(model, 'supportsToolCalling'),
    supportsReasoning: resolveAutoModelCapability(model, 'supportsReasoning'),
    supportsEmbedding: model.supportsEmbedding ?? false,
    contextWindow: model.contextWindow === undefined ? '' : String(model.contextWindow),
    maxOutputTokens: model.maxOutputTokens === undefined ? '' : String(model.maxOutputTokens),
    providerOptions: model.providerOptions ?? '{\n\n}'
  }
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return undefined
  }

  const parsedValue = Number(trimmedValue)

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined
}

function isJsonObject(value: string): boolean {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return true
  }

  try {
    const parsedValue = JSON.parse(trimmedValue) as unknown

    return parsedValue !== null && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
  } catch {
    return false
  }
}

function ModelCapabilityToggle({
  auto,
  checked,
  icon,
  label,
  modelId,
  onCheckedChange
}: {
  auto?: boolean
  checked: boolean
  icon: React.ReactNode
  label: string
  modelId: string
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-3 rounded-lg bg-secondary p-2">
      {icon}
      <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">
        {label}
        {auto ? <span className="ml-2 text-xs text-muted-foreground">(auto)</span> : null}
      </span>
      <Switch
        checked={checked}
        aria-label={`${modelId} supports ${label.toLowerCase()}`}
        onCheckedChange={onCheckedChange}
      />
    </label>
  )
}

export function ModelOptionsDialog({
  model,
  onClose,
  onSave
}: {
  model: ProviderModel
  onClose: () => void
  onSave: (model: ProviderModel) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<ModelOptionsDraft>(() => createModelOptionsDraft(model))
  const [manualOverrides, setManualOverrides] = useState<ProviderModelManualOverride[]>(
    () => model.manualOverrides ?? []
  )
  const parsedContextWindow = parsePositiveInteger(draft.contextWindow)
  const parsedMaxOutputTokens = parsePositiveInteger(draft.maxOutputTokens)
  const hasInvalidContextWindow =
    draft.contextWindow.trim().length > 0 && parsedContextWindow === undefined
  const hasInvalidMaxOutputTokens =
    draft.maxOutputTokens.trim().length > 0 && parsedMaxOutputTokens === undefined
  const hasInvalidProviderOptions = !isJsonObject(draft.providerOptions)
  const hasInvalidInput =
    hasInvalidContextWindow || hasInvalidMaxOutputTokens || hasInvalidProviderOptions

  function markManualOverride(field: ProviderModelManualOverride): void {
    setManualOverrides((current) => (current.includes(field) ? current : [...current, field]))
  }

  function handleSave(): void {
    if (hasInvalidInput) {
      return
    }

    const nextModel: ProviderModel = {
      ...model,
      supportsVision: draft.supportsVision,
      supportsImageOutput: draft.supportsImageOutput,
      supportsToolCalling: draft.supportsToolCalling,
      supportsReasoning: draft.supportsReasoning,
      supportsEmbedding: draft.supportsEmbedding,
      providerOptions: draft.providerOptions
    }

    if (parsedContextWindow === undefined) {
      delete nextModel.contextWindow
    } else {
      nextModel.contextWindow = parsedContextWindow
    }

    if (parsedMaxOutputTokens === undefined) {
      delete nextModel.maxOutputTokens
    } else {
      nextModel.maxOutputTokens = parsedMaxOutputTokens
    }

    if (manualOverrides.length === 0) {
      delete nextModel.manualOverrides
    } else {
      nextModel.manualOverrides = manualOverrides
    }

    onSave(nextModel)
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-120" showCloseButton={false} aria-label="Model Options">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-medium leading-7 text-foreground">
            <SlidersHorizontal aria-hidden="true" className="size-5 text-muted-foreground" />
            Model Options
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground">
            Configure options for <Badge variant="secondary">{model.id}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium leading-6 text-foreground">Model Capabilities</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              配置这个模型在列表中展示的能力标记。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ModelCapabilityToggle
              auto
              checked={draft.supportsVision}
              icon={<Eye aria-hidden="true" className="size-3.5 text-muted-foreground" />}
              label="Vision"
              modelId={model.id}
              onCheckedChange={(checked) => {
                markManualOverride('supportsVision')
                setDraft((current) => ({ ...current, supportsVision: checked }))
              }}
            />
            <ModelCapabilityToggle
              checked={draft.supportsImageOutput}
              icon={<ImageIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />}
              label="Image Output"
              modelId={model.id}
              onCheckedChange={(checked) => {
                markManualOverride('supportsImageOutput')
                setDraft((current) => ({ ...current, supportsImageOutput: checked }))
              }}
            />
            <ModelCapabilityToggle
              auto
              checked={draft.supportsToolCalling}
              icon={<Wrench aria-hidden="true" className="size-3.5 text-muted-foreground" />}
              label="Tool Calling"
              modelId={model.id}
              onCheckedChange={(checked) => {
                markManualOverride('supportsToolCalling')
                setDraft((current) => ({ ...current, supportsToolCalling: checked }))
              }}
            />
            <ModelCapabilityToggle
              auto
              checked={draft.supportsReasoning}
              icon={<Brain aria-hidden="true" className="size-3.5 text-muted-foreground" />}
              label="Reasoning"
              modelId={model.id}
              onCheckedChange={(checked) => {
                markManualOverride('supportsReasoning')
                setDraft((current) => ({ ...current, supportsReasoning: checked }))
              }}
            />
            <ModelCapabilityToggle
              checked={draft.supportsEmbedding}
              icon={<Waypoints aria-hidden="true" className="size-3.5 text-muted-foreground" />}
              label="Embedding"
              modelId={model.id}
              onCheckedChange={(checked) => {
                markManualOverride('supportsEmbedding')
                setDraft((current) => ({ ...current, supportsEmbedding: checked }))
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="model-context-window" className="text-sm leading-6 text-foreground">
                Context Window
              </Label>
              <Input
                id="model-context-window"
                aria-label={`${model.id} context window`}
                inputMode="numeric"
                value={draft.contextWindow}
                onChange={(event) => {
                  markManualOverride('contextWindow')
                  setDraft((current) => ({ ...current, contextWindow: event.target.value }))
                }}
                placeholder="e.g., 262144"
              />
              {hasInvalidContextWindow ? <FieldHint>上下文长度必须是正整数。</FieldHint> : null}
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="model-max-output-tokens"
                className="text-sm leading-6 text-foreground"
              >
                Max Output Tokens
              </Label>
              <Input
                id="model-max-output-tokens"
                aria-label={`${model.id} max output tokens`}
                inputMode="numeric"
                value={draft.maxOutputTokens}
                onChange={(event) => {
                  markManualOverride('maxOutputTokens')
                  setDraft((current) => ({ ...current, maxOutputTokens: event.target.value }))
                }}
                placeholder="e.g., 8192"
              />
              {hasInvalidMaxOutputTokens ? (
                <FieldHint>最大输出 token 必须是正整数。</FieldHint>
              ) : null}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="model-provider-options" className="text-sm leading-6 text-foreground">
              Provider Options (JSON)
            </Label>
            <Textarea
              id="model-provider-options"
              aria-label={`${model.id} provider options json`}
              value={draft.providerOptions}
              onChange={(event) => {
                markManualOverride('providerOptions')
                setDraft((current) => ({ ...current, providerOptions: event.target.value }))
              }}
              className="min-h-32 resize-none font-mono"
            />
            <FieldHint>
              {hasInvalidProviderOptions
                ? 'Provider Options 必须是 JSON object。'
                : 'Example: { "thinking": { "type": "disabled" } } to disable reasoning for models like doubao-seed-1.8'}
            </FieldHint>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={hasInvalidInput} onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
