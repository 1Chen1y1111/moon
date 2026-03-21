import { Button } from '@shadcn/ui/button'
import almaLogo from '@renderer/assets/alma-logo.svg'

export function HomeEmptyState(): React.JSX.Element {
  return (
    <section
      aria-label="Alma landing view"
      className="flex w-full justify-center px-6 py-10 text-[var(--alma-text-primary)]"
    >
      <div className="flex w-full max-w-[672px] flex-col items-center gap-8 text-center">
        <div className="flex h-[210px] w-[194px] items-center justify-center rounded-[28px] border border-[color:var(--alma-panel-border)] bg-[rgba(14,18,25,0.28)] p-4 shadow-[0_32px_90px_rgba(7,10,18,0.36)]">
          <img src={almaLogo} alt="" aria-hidden="true" className="h-full w-full object-contain" />
        </div>

        <div className="space-y-4">
          <h1
            className="text-6xl tracking-tight text-white sm:text-7xl"
            style={{ fontFamily: 'var(--alma-serif)' }}
          >
            Alma
          </h1>
          <p className="text-base leading-7 text-[var(--alma-text-secondary)] sm:text-lg">
            优雅的 AI 提供商编排桌面应用
          </p>
        </div>

        <div className="flex w-full max-w-[360px] flex-col items-center gap-3">
          <Button
            size="lg"
            className="h-12 w-full rounded-full bg-[var(--alma-accent)] text-[var(--alma-accent-text)] shadow-[0_20px_60px_rgba(97,175,240,0.22)] hover:brightness-105"
          >
            新建聊天
          </Button>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              size="lg"
              className="h-12 rounded-full border border-[color:var(--alma-panel-border)] bg-white/[0.04] text-[var(--alma-text-primary)] hover:bg-white/[0.08]"
            >
              配置提供商
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="h-12 rounded-full border border-[color:var(--alma-panel-border)] bg-white/[0.04] text-[var(--alma-text-primary)] hover:bg-white/[0.08]"
            >
              设置
            </Button>
          </div>
        </div>

        <p className="text-sm leading-6 text-[var(--alma-text-muted)]">
          请至少配置一个 AI 提供商以开始聊天
        </p>
      </div>
    </section>
  )
}
