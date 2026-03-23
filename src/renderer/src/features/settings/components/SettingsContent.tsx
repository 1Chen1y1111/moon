import { ChevronDown, FlaskConical } from 'lucide-react'

import { Button } from '@shadcn/ui/button'

import { settingsSections } from '../config/settings-sections'
import type { SettingsSectionId } from '../model/settings.types'

type SettingsContentProps = {
  activeSection: SettingsSectionId
}

const panelClassName =
  'rounded-3xl border border-moon-panel-border bg-moon-panel-bg px-6 py-6 shadow-[var(--moon-shadow-shell)]'

function FakeSelect({
  value,
  trailing
}: {
  value: string
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="flex h-11 min-w-0 flex-1 items-center justify-between rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-4 text-sm text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
      >
        <span className="truncate">{value}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-moon-text-secondary" />
      </button>
      {trailing}
    </div>
  )
}

function GeneralSettingsContent(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <section className={panelClassName}>
        <h2 className="text-[2rem] font-medium tracking-tight text-moon-text-primary">工具模型</h2>
        <p className="mt-6 max-w-3xl text-sm leading-7 text-moon-text-secondary">
          在保证生成质量的前提下尽可能快的模型，用于对话标题生成、记忆相关操作等自动化任务。
        </p>
        <button type="button" className="mt-2 text-sm text-moon-accent hover:text-moon-accent">
          了解更多
        </button>
        <div className="mt-10">
          <FakeSelect
            value="gpt-5.4"
            trailing={
              <button
                type="button"
                aria-label="实验设置"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
              >
                <FlaskConical aria-hidden="true" className="h-4 w-4" />
              </button>
            }
          />
        </div>
      </section>

      <section className={panelClassName}>
        <h2 className="text-[2rem] font-medium tracking-tight text-moon-text-primary">
          Coding Agent
        </h2>
        <p className="mt-6 max-w-3xl text-sm leading-7 text-moon-text-secondary">
          选择 coder 类型 subagent 执行代码任务时使用的后端。
        </p>

        <div className="mt-10">
          <p className="text-sm font-medium text-moon-text-primary">默认 Coding Agent</p>
          <div className="mt-3">
            <FakeSelect value="自动" />
          </div>
        </div>

        <div className="mt-6 space-y-2 text-sm leading-7 text-moon-text-secondary">
          <p>优先使用 Claude Code，不可用时回退到内置 agent。</p>
          <p>直接使用本地安装的 Claude Code CLI。</p>
          <p>使用 Alma 内置 subagent，并沿用当前聊天模型。</p>
          <p>使用已配置的 ACP provider，例如 Codex CLI 或 Gemini CLI。</p>
        </div>

        <div className="mt-8 rounded-2xl border border-moon-panel-border bg-moon-sidebar-bg px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-moon-text-secondary">还没有配置 ACP provider。</p>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-4 text-sm text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
            >
              管理 Providers
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

export function SettingsContent({ activeSection }: SettingsContentProps): React.JSX.Element {
  const activeMeta = settingsSections.find((section) => section.id === activeSection)

  if (activeMeta?.kind === 'general') {
    return <GeneralSettingsContent />
  }

  return (
    <section className={panelClassName}>
      <p className="text-[2rem] font-medium tracking-tight text-moon-text-primary">
        {activeMeta?.title}
      </p>
      <p className="mt-6 text-sm leading-7 text-moon-text-secondary">
        {activeMeta?.description ?? '该设置分类尚未配置描述。'}
      </p>
      <div className="mt-8 rounded-2xl border border-dashed border-moon-panel-border bg-moon-sidebar-bg px-4 py-6 text-sm text-moon-text-secondary">
        页面内容待补齐
      </div>
    </section>
  )
}
