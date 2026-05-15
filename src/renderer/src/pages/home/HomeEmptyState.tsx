import LogoIcon from '@renderer/assets/logo.png'
import { useAppRouterContext } from '@renderer/app/router/router-context'
import { useChatStore } from '@renderer/store/chat'
import { Button } from '@shadcn/ui/button'

export function HomeEmptyState(): React.JSX.Element {
  const { setRouteState } = useAppRouterContext()
  const createChatSession = useChatStore((state) => state.createChatSession)

  const handleCreateChat = async (): Promise<void> => {
    const session = await createChatSession()

    setRouteState((state) => ({
      ...state,
      activeChatId: session.id
    }))
    window.location.hash = '#/chat'
  }

  const handleOpenProviderSettings = (): void => {
    void window.api.windowControls.openSettings({ section: 'providers' })
  }

  const handleOpenSettings = (): void => {
    void window.api.windowControls.openSettings()
  }

  return (
    <section
      aria-label="Moon landing view"
      className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-16 text-foreground"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-16 text-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg shadow-sm">
          <img src={LogoIcon} alt="" aria-hidden="true" className="h-full w-full object-contain" />
        </div>

        <div className="space-y-6">
          <h1 className="font-serif text-6xl font-medium leading-tight text-foreground">Moon</h1>
          <p className="text-sm leading-6 text-muted-foreground">优雅的 AI 提供商编排桌面应用</p>
        </div>

        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            onClick={() => {
              void handleCreateChat()
            }}
          >
            新建聊天
          </Button>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-md border border-input bg-secondary text-foreground hover:bg-muted"
              onClick={handleOpenProviderSettings}
            >
              配置提供商
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-12 rounded-md border border-input bg-secondary text-foreground hover:bg-muted"
              onClick={handleOpenSettings}
            >
              设置
            </Button>
          </div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          请至少配置一个 AI 提供商以开始聊天
        </p>
      </div>
    </section>
  )
}
