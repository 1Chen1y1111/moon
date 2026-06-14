import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Blocks,
  Check,
  ChevronRight,
  Code2,
  FileText,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Store
} from 'lucide-react'

import { cn } from '@moon/ui/lib/utils'
import { Badge } from '@moon/ui/ui/badge'
import { Button } from '@moon/ui/ui/button'
import { Input } from '@moon/ui/ui/input'
import { ScrollArea } from '@moon/ui/ui/scroll-area'
import Action from '../components/Action'

type SkillActivateMode = 'auto' | 'manual'
type SkillGroupId = 'builtin' | 'recommended'

type SkillGroup = {
  label: string
  value: SkillGroupId
}

type SkillOption = {
  description: string
  group: SkillGroupId
  icon: LucideIcon
  id: string
  source: string
  title: string
}

const skillGroups: SkillGroup[] = [
  { label: '内置', value: 'builtin' },
  { label: '推荐', value: 'recommended' }
]

const skillOptions: SkillOption[] = [
  {
    description: '压缩长对话里的关键线索。',
    group: 'builtin',
    icon: Blocks,
    id: 'context-organizer',
    source: 'Moon',
    title: '上下文整理'
  },
  {
    description: '解释代码、生成小块补丁和检查错误。',
    group: 'builtin',
    icon: Code2,
    id: 'code-helper',
    source: 'Moon',
    title: '代码助手'
  },
  {
    description: '提取本地附件或长文档重点。',
    group: 'builtin',
    icon: FileText,
    id: 'document-reader',
    source: 'Moon',
    title: '文档阅读'
  },
  {
    description: '把开放问题拆成可执行步骤。',
    group: 'recommended',
    icon: Search,
    id: 'research-planner',
    source: 'Community',
    title: '研究规划'
  },
  {
    description: '调整语气、结构和表达密度。',
    group: 'recommended',
    icon: Sparkles,
    id: 'writing-polish',
    source: 'Community',
    title: '写作润色'
  }
]

function filterSkillOptions(query: string): SkillOption[] {
  const keyword = query.trim().toLowerCase()

  if (keyword.length === 0) {
    return skillOptions
  }

  return skillOptions.filter((skill) =>
    [skill.id, skill.title, skill.description, skill.source].some((value) =>
      value.toLowerCase().includes(keyword)
    )
  )
}

function SkillModeControl({
  mode,
  onModeChange
}: {
  mode: SkillActivateMode
  onModeChange: (mode: SkillActivateMode) => void
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="技能启用模式"
      className="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-secondary p-1"
    >
      <Button
        type="button"
        variant="ghost"
        aria-label="自动选择技能"
        aria-pressed={mode === 'auto'}
        className={cn(
          'h-7 gap-1.5 rounded-sm px-2 text-xs',
          mode === 'auto' && 'bg-background text-foreground shadow-sm hover:bg-background'
        )}
        onClick={() => onModeChange('auto')}
      >
        <Sparkles aria-hidden="true" className="size-3.5" />
        自动
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="手动选择技能"
        aria-pressed={mode === 'manual'}
        className={cn(
          'h-7 gap-1.5 rounded-sm px-2 text-xs',
          mode === 'manual' && 'bg-background text-foreground shadow-sm hover:bg-background'
        )}
        onClick={() => onModeChange('manual')}
      >
        <SlidersHorizontal aria-hidden="true" className="size-3.5" />
        手动
      </Button>
    </div>
  )
}

function SkillItem({
  selected,
  skill,
  onToggle
}: {
  selected: boolean
  skill: SkillOption
  onToggle: (id: string) => void
}): React.JSX.Element {
  const Icon = skill.icon

  return (
    <button
      type="button"
      aria-label={`${selected ? '停用' : '启用'}技能 ${skill.title}`}
      aria-pressed={selected}
      className={cn(
        'flex w-full min-w-0 items-start gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors',
        'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40',
        selected && 'bg-primary/10 text-primary hover:bg-primary/10'
      )}
      onClick={() => onToggle(skill.id)}
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
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium leading-5">{skill.title}</span>
          <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
            {skill.source}
          </Badge>
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {skill.description}
        </span>
      </span>
      {selected ? <Check aria-hidden="true" className="mt-1 size-4 shrink-0" /> : null}
    </button>
  )
}

function EmptySkillPanel(): React.JSX.Element {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
        <Blocks aria-hidden="true" className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium leading-6 text-foreground">没有匹配的技能</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">换个关键词再试试。</p>
      </div>
    </div>
  )
}

function SkillsPanel({
  mode,
  query,
  selectedSkillIds,
  onModeChange,
  onQueryChange,
  onToggleSkill
}: {
  mode: SkillActivateMode
  query: string
  selectedSkillIds: Set<string>
  onModeChange: (mode: SkillActivateMode) => void
  onQueryChange: (query: string) => void
  onToggleSkill: (id: string) => void
}): React.JSX.Element {
  const visibleSkills = useMemo(() => filterSkillOptions(query), [query])

  return (
    <div className="w-full overflow-hidden" onKeyDown={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="搜索技能"
            className="pl-8"
            placeholder="搜索技能..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
              }
            }}
          />
        </div>
        <SkillModeControl mode={mode} onModeChange={onModeChange} />
      </div>

      {visibleSkills.length === 0 ? (
        <EmptySkillPanel />
      ) : (
        <ScrollArea className="h-80">
          <div className="space-y-3 p-2">
            {skillGroups.map((group) => {
              const groupSkills = visibleSkills.filter((skill) => skill.group === group.value)

              if (groupSkills.length === 0) {
                return null
              }

              return (
                <section key={group.value} className="min-w-0">
                  <p className="px-2 py-1.5 text-xs font-medium leading-5 text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {groupSkills.map((skill) => (
                      <SkillItem
                        key={skill.id}
                        selected={selectedSkillIds.has(skill.id)}
                        skill={skill}
                        onToggle={onToggleSkill}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </ScrollArea>
      )}

      <div className="grid gap-1 border-t border-border p-1">
        <Button
          type="button"
          variant="ghost"
          disabled
          className="h-9 justify-start gap-3 rounded-md px-2.5 text-muted-foreground"
        >
          <Store aria-hidden="true" className="size-4" />
          <span className="min-w-0 flex-1 truncate text-left">技能商店</span>
          <Badge variant="secondary" className="shrink-0">
            即将支持
          </Badge>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9 justify-start gap-3 rounded-md px-2.5"
          onClick={() => {
            void window.api.windowControls.openSettings()
          }}
        >
          <Settings aria-hidden="true" className="size-4" />
          <span className="min-w-0 flex-1 truncate text-left">管理技能</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </div>
    </div>
  )
}

export default function Skills(): React.JSX.Element {
  const [mode, setMode] = useState<SkillActivateMode>('auto')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set())

  function handleToggleSkill(id: string): void {
    setSelectedSkillIds((current) => {
      const next = new Set(current)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  return (
    <Action
      icon={Blocks}
      open={open}
      pressed={selectedSkillIds.size > 0}
      title="技能"
      popover={{
        content: (
          <SkillsPanel
            mode={mode}
            query={query}
            selectedSkillIds={selectedSkillIds}
            onModeChange={setMode}
            onQueryChange={setQuery}
            onToggleSkill={handleToggleSkill}
          />
        ),
        contentClassName: 'p-0',
        maxWidth: 400,
        minWidth: 360,
        placement: 'topLeft'
      }}
      onOpenChange={setOpen}
    />
  )
}
