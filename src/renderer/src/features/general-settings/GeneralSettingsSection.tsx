import { ChevronDown, FlaskConical } from 'lucide-react'

import { Button } from '@shadcn/ui/button'

import { settingsPanelClassName } from '@renderer/shared/ui/settings-panel'

function FakeSelect({
  value,
  trailing
}: {
  value: string
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-moon-option-gap">
      <button
        type="button"
        className="flex h-moon-field min-w-0 flex-1 items-center justify-between rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
      >
        <span className="truncate">{value}</span>
        <ChevronDown aria-hidden="true" className="size-moon-icon text-moon-text-secondary" />
      </button>
      {trailing}
    </div>
  )
}

export function GeneralSettingsSection(): React.JSX.Element {
  return (
    <div className="space-y-moon-xl">
      <section className={settingsPanelClassName}>
        <h2 className="font-moon-serif text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
          工具模型
        </h2>
        <p className="mt-moon-xl max-w-3xl text-moon-body leading-moon-body text-moon-text-secondary">
          在保证生成质量的前提下尽可能快的模型，用于对话标题生成、记忆相关操作等自动化任务。
        </p>
        <button
          type="button"
          className="mt-moon-md text-moon-body leading-moon-body text-moon-accent hover:text-moon-accent"
        >
          了解更多
        </button>
        <div className="mt-moon-section-gap">
          <FakeSelect
            value="gpt-5.4"
            trailing={
              <button
                type="button"
                aria-label="实验设置"
                className="flex size-moon-field items-center justify-center rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
              >
                <FlaskConical aria-hidden="true" className="size-moon-icon" />
              </button>
            }
          />
        </div>
      </section>

      <section className={settingsPanelClassName}>
        <h2 className="font-moon-serif text-moon-h2 font-moon-title leading-moon-h2 text-moon-text-primary">
          Coding Agent
        </h2>
        <p className="mt-moon-xl max-w-3xl text-moon-body leading-moon-body text-moon-text-secondary">
          选择 coder 类型 subagent 执行代码任务时使用的后端。
        </p>

        <div className="mt-moon-section-gap">
          <p className="text-moon-body-lead font-moon-title leading-moon-body-lead text-moon-text-primary">
            默认 Coding Agent
          </p>
          <div className="mt-moon-option-gap">
            <FakeSelect value="自动" />
          </div>
        </div>

        <div className="mt-moon-xl space-y-moon-md text-moon-body leading-moon-body text-moon-text-secondary">
          <p>优先使用 Claude Code，不可用时回退到内置 agent。</p>
          <p>直接使用本地安装的 Claude Code CLI。</p>
          <p>使用 Alma 内置 subagent，并沿用当前聊天模型。</p>
          <p>使用已配置的 ACP provider，例如 Codex CLI 或 Gemini CLI。</p>
        </div>

        <div className="mt-moon-card-stack rounded-moon-card border border-moon-panel-border bg-moon-sidebar-bg px-moon-lg py-moon-card">
          <div className="flex items-center justify-between gap-moon-lg">
            <p className="text-moon-body leading-moon-body text-moon-text-secondary">
              还没有配置 ACP provider。
            </p>
            <Button
              type="button"
              variant="secondary"
              className="h-moon-control rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-lg text-moon-body leading-moon-body text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
            >
              管理 Providers
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
