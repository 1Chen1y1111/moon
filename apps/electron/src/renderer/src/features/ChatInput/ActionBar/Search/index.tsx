import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check, Globe, GlobeOff, SearchCheck, Sparkles } from 'lucide-react'

import { cn } from '@moon/ui/lib/utils'
import { Button } from '@moon/ui/ui/button'
import { Switch } from '@moon/ui/ui/switch'
import Action from '../components/Action'

type SearchMode = 'off' | 'auto'

type SearchModeOption = {
  description: string
  icon: LucideIcon
  label: string
  value: SearchMode
}

const searchModeOptions: SearchModeOption[] = [
  {
    description: '禁用网络访问。',
    icon: GlobeOff,
    label: '关闭搜索',
    value: 'off'
  },
  {
    description: '在需要时自动搜索网络。',
    icon: Sparkles,
    label: '智能联网',
    value: 'auto'
  }
]

function SearchModeItem({
  option,
  selected,
  onSelect
}: {
  option: SearchModeOption
  selected: boolean
  onSelect: (value: SearchMode) => void
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

function SearchControls({
  mode,
  onModeChange
}: {
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
}): React.JSX.Element {
  return (
    <div className="w-full space-y-3" onKeyDown={(event) => event.stopPropagation()}>
      <p className="px-1 text-xs leading-5 text-muted-foreground">
        搜索结果与来源引用会在回复中展示。
      </p>

      <div className="space-y-1">
        {searchModeOptions.map((option) => (
          <SearchModeItem
            key={option.value}
            option={option}
            selected={mode === option.value}
            onSelect={onModeChange}
          />
        ))}
      </div>

      {mode !== 'off' ? (
        <div className="border-t border-border">
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
                <SearchCheck aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="text-xs leading-5 text-muted-foreground">
                  使用模型内置的网络搜索。
                </span>
              </span>
            </div>
            <Switch disabled checked={false} aria-label="模型内置搜索" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function Search(): React.JSX.Element {
  const [mode, setMode] = useState<SearchMode>('off')
  const [open, setOpen] = useState(false)
  const enabled = mode !== 'off'

  return (
    <Action
      icon={enabled ? Globe : GlobeOff}
      open={open}
      pressed={enabled}
      title="联网搜索"
      popover={{
        content: <SearchControls mode={mode} onModeChange={setMode} />,
        contentClassName: 'p-3',
        maxWidth: 320,
        minWidth: 300,
        placement: 'topLeft',
        title: '联网搜索'
      }}
      onOpenChange={setOpen}
    />
  )
}
