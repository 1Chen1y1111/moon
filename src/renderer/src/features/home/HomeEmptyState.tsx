import { Button } from '@shadcn/ui/button'
import LogoIcon from '@renderer/assets/logo.svg'

export function HomeEmptyState(): React.JSX.Element {
  return (
    <section
      aria-label="Moon landing view"
      className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-10 text-moon-text-primary"
    >
      <div className="flex w-full max-w-[672px] flex-col items-center gap-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-moon-panel-border">
          <img src={LogoIcon} alt="" aria-hidden="true" className="h-full w-full object-contain" />
        </div>

        <div className="space-y-4">
          <h1 className="font-moon-serif text-6xl tracking-tight text-moon-text-primary sm:text-7xl">
            Moon
          </h1>
          <p className="text-base leading-7 text-moon-text-secondary sm:text-lg">
            优雅的 AI 提供商编排桌面应用
          </p>
        </div>

        <div className="flex w-full max-w-[360px] flex-col items-center gap-3">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-full bg-moon-accent text-moon-accent-text shadow-[0_20px_60px_rgba(97,175,240,0.22)] hover:brightness-105"
          >
            新建聊天
          </Button>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-full border border-moon-panel-border bg-white/[0.04] text-moon-text-primary hover:bg-white/[0.08]"
            >
              配置提供商
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-full border border-moon-panel-border bg-white/[0.04] text-moon-text-primary hover:bg-white/[0.08]"
            >
              设置
            </Button>
          </div>
        </div>

        <p className="text-sm leading-6 text-moon-text-muted">请至少配置一个 AI 提供商以开始聊天</p>
      </div>
    </section>
  )
}
