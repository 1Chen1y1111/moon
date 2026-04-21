import LogoIcon from '@renderer/shared/assets/logo.svg'
import { Button } from '@shadcn/ui/button'

export function HomeEmptyState(): React.JSX.Element {
  const handleOpenProviderSettings = (): void => {
    void window.api.windowControls.openSettings({ section: 'providers' })
  }

  const handleOpenSettings = (): void => {
    void window.api.windowControls.openSettings()
  }

  return (
    <section
      aria-label="Moon landing view"
      className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-10 text-moon-text-primary"
    >
      <div className="flex w-full max-w-[672px] flex-col items-center gap-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-moon-panel-border shadow-[var(--moon-shadow-menu-hover)]">
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
            className="h-12 w-full rounded-full bg-moon-button-primary-bg text-moon-button-primary-fg shadow-[var(--moon-shadow-accent)] hover:bg-moon-button-primary-bg-hover"
          >
            新建聊天
          </Button>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-full border border-moon-button-secondary-border bg-moon-button-secondary-bg text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
              onClick={handleOpenProviderSettings}
            >
              配置提供商
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-full border border-moon-button-secondary-border bg-moon-button-secondary-bg text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
              onClick={handleOpenSettings}
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
