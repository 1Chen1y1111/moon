import LogoIcon from '@renderer/shared/assets/logo.png'
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
      className="flex min-h-full w-full flex-1 items-center justify-center px-moon-panel py-moon-section-gap text-moon-text-primary"
    >
      <div className="flex w-full max-w-moon-hero flex-col items-center gap-moon-card-stack text-center">
        <div className="flex size-moon-brand-mark items-center justify-center overflow-hidden rounded-moon-card shadow-moon-ring">
          <img src={LogoIcon} alt="" aria-hidden="true" className="h-full w-full object-contain" />
        </div>

        <div className="space-y-moon-lg">
          <h1 className="font-moon-serif text-moon-display font-moon-title leading-moon-display text-moon-text-primary">
            Moon
          </h1>
          <p className="text-moon-body-lead leading-moon-body-lead text-moon-text-secondary">
            优雅的 AI 提供商编排桌面应用
          </p>
        </div>

        <div className="flex w-full max-w-moon-actions flex-col items-center gap-moon-option-gap">
          <Button
            type="button"
            size="lg"
            className="h-moon-cta w-full rounded-moon-control bg-moon-button-primary-bg text-moon-button-primary-fg shadow-moon-accent hover:bg-moon-button-primary-bg-hover"
          >
            新建聊天
          </Button>
          <div className="grid w-full gap-moon-option-gap sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-moon-cta rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
              onClick={handleOpenProviderSettings}
            >
              配置提供商
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-moon-cta rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg text-moon-text-primary hover:bg-moon-button-secondary-bg-hover"
              onClick={handleOpenSettings}
            >
              设置
            </Button>
          </div>
        </div>

        <p className="text-moon-caption leading-moon-caption text-moon-text-muted">
          请至少配置一个 AI 提供商以开始聊天
        </p>
      </div>
    </section>
  )
}
