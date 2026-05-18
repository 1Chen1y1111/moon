import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Brain, Check, CircleOff, Gauge } from 'lucide-react'

import { cn } from '@moon/ui/lib/utils'
import { Button } from '@moon/ui/ui/button'
import Action from '../components/Action'

type MemoryMode = 'off' | 'on'
type MemoryEffort = 'low' | 'medium' | 'high'

type MemoryModeOption = {
  description: string
  icon: LucideIcon
  label: string
  value: MemoryMode
}

type MemoryEffortOption = {
  label: string
  value: MemoryEffort
}

const memoryModeOptions: MemoryModeOption[] = [
  {
    description: '不把当前会话沉淀为长期偏好。',
    icon: CircleOff,
    label: '关闭记忆',
    value: 'off'
  },
  {
    description: '允许 Moon 在后续对话中复用稳定偏好。',
    icon: Brain,
    label: '开启记忆',
    value: 'on'
  }
]

const memoryEffortOptions: MemoryEffortOption[] = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]

function MemoryModeItem({
  option,
  selected,
  onSelect
}: {
  option: MemoryModeOption
  selected: boolean
  onSelect: (value: MemoryMode) => void
}): React.JSX.Element {
  const Icon = option.icon

  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={selected}
      className={cn(
        'h-auto w-full justify-start gap-3 rounded-md px-2.5 py-2 text-left whitespace-normal',
        selected && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
      )}
      onClick={() => onSelect(option.value)}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground',
          selected && 'border-primary/20 bg-primary/10 text-primary'
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5">{option.label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {option.description}
        </span>
      </span>
      {selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
    </Button>
  )
}

function MemoryControls({
  enabled,
  effort,
  onEnabledChange,
  onEffortChange
}: {
  enabled: boolean
  effort: MemoryEffort
  onEnabledChange: (enabled: boolean) => void
  onEffortChange: (effort: MemoryEffort) => void
}): React.JSX.Element {
  return (
    <div className="w-full space-y-3" onKeyDown={(event) => event.stopPropagation()}>
      <p className="px-1 text-xs leading-5 text-muted-foreground">
        记忆会帮助后续对话保留偏好和上下文线索。
      </p>

      <div className="space-y-1">
        {memoryModeOptions.map((option) => (
          <MemoryModeItem
            key={option.value}
            option={option}
            selected={enabled === (option.value === 'on')}
            onSelect={(value) => onEnabledChange(value === 'on')}
          />
        ))}
      </div>

      {enabled ? (
        <div className="border-t border-border pt-3">
          <div className="flex min-w-0 items-start gap-3 px-1">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
              <Gauge aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-5 text-foreground">记忆强度</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                控制提取和复用记忆的积极程度。
              </span>
            </span>
          </div>

          <div
            role="group"
            aria-label="记忆强度"
            className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-secondary p-1"
          >
            {memoryEffortOptions.map((option) => {
              const selected = option.value === effort

              return (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  aria-pressed={selected}
                  className={cn(
                    'h-7 rounded-sm px-2 text-xs',
                    selected && 'bg-background text-foreground shadow-sm hover:bg-background'
                  )}
                  onClick={() => onEffortChange(option.value)}
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function Memory(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [effort, setEffort] = useState<MemoryEffort>('medium')
  const [open, setOpen] = useState(false)

  return (
    <Action
      icon={Brain}
      open={open}
      pressed={enabled}
      title="记忆"
      popover={{
        content: (
          <MemoryControls
            enabled={enabled}
            effort={effort}
            onEnabledChange={setEnabled}
            onEffortChange={setEffort}
          />
        ),
        contentClassName: 'p-3',
        maxWidth: 360,
        minWidth: 320,
        placement: 'topLeft',
        title: '记忆'
      }}
      onOpenChange={setOpen}
    />
  )
}
