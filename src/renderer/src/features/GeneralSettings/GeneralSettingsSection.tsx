import { ChevronDown, FlaskConical } from 'lucide-react'

import { Button } from '@shadcn/ui/button'

import { settingsPanelClassName } from '@renderer/components/SettingsPanel'

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
        className="flex h-11 min-w-0 flex-1 items-center justify-between rounded-md border border-input bg-secondary px-6 text-sm leading-6 text-foreground transition-colors hover:bg-muted"
      >
        <span className="truncate">{value}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
      </button>
      {trailing}
    </div>
  )
}

export function GeneralSettingsSection(): React.JSX.Element {
  return (
    <div className="space-y-10">
      <section className={settingsPanelClassName}>
        <h2 className="font-serif text-xl font-medium leading-7 text-foreground">工具模型</h2>
        <p className="mt-10 max-w-3xl text-sm leading-6 text-muted-foreground">
          在保证生成质量的前提下尽可能快的模型，用于对话标题生成、记忆相关操作等自动化任务。
        </p>
        <button type="button" className="mt-3 text-sm leading-6 text-primary hover:text-primary">
          了解更多
        </button>
        <div className="mt-16">
          <FakeSelect
            value="gpt-5.4"
            trailing={
              <button
                type="button"
                aria-label="实验设置"
                className="flex size-11 items-center justify-center rounded-md border border-input bg-secondary text-foreground transition-colors hover:bg-muted"
              >
                <FlaskConical aria-hidden="true" className="size-4" />
              </button>
            }
          />
        </div>
      </section>

      <section className={settingsPanelClassName}>
        <h2 className="font-serif text-xl font-medium leading-7 text-foreground">Coding Agent</h2>
        <p className="mt-10 max-w-3xl text-sm leading-6 text-muted-foreground">
          选择 coder 类型 subagent 执行代码任务时使用的后端。
        </p>

        <div className="mt-16">
          <p className="text-sm font-medium leading-6 text-foreground">默认 Coding Agent</p>
          <div className="mt-3">
            <FakeSelect value="自动" />
          </div>
        </div>

        <div className="mt-10 space-y-3 text-sm leading-6 text-muted-foreground">
          <p>优先使用 Claude Code，不可用时回退到内置 agent。</p>
          <p>直接使用本地安装的 Claude Code CLI。</p>
          <p>使用 Alma 内置 subagent，并沿用当前聊天模型。</p>
          <p>使用已配置的 ACP provider，例如 Codex CLI 或 Gemini CLI。</p>
        </div>

        <div className="mt-16 rounded-lg border border-border bg-card px-6 py-6">
          <div className="flex items-center justify-between gap-6">
            <p className="text-sm leading-6 text-muted-foreground">还没有配置 ACP provider。</p>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-md border border-input bg-secondary px-6 text-sm leading-6 text-foreground hover:bg-muted"
            >
              管理 Providers
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
