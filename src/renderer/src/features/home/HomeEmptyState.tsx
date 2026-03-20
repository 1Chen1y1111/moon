import { Button } from '@renderer/components/ui/button'
import { useUiStore } from '@renderer/lib/stores/ui-store'

export function HomeEmptyState(): React.JSX.Element {
  const openProviderSetupDialog = useUiStore((state) => state.openProviderSetupDialog)
  const openSettingsDialog = useUiStore((state) => state.openSettingsDialog)

  return (
    <section
      aria-label="Home empty state"
      className="flex min-h-full flex-col justify-between px-6 pb-8 pt-10 text-zinc-50"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-3xl flex-col items-center gap-10">
          <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
            <div className="flex items-center gap-3 rounded-full border border-zinc-800/80 bg-zinc-900/70 px-4 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_24px_rgba(110,231,183,0.85)]"
              />
              <span className="text-sm font-medium tracking-[0.24em] text-zinc-200 uppercase">
                Moon
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                How can I help you today?
              </h1>
              <p className="mx-auto max-w-lg text-sm leading-6 text-zinc-400 sm:text-base">
                Start a fresh conversation, connect a provider, or adjust settings.
              </p>
            </div>

            <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
              <Button
                size="lg"
                className="h-11 min-w-[10rem] rounded-full bg-zinc-100 text-zinc-950 hover:bg-white"
              >
                New Chat
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="h-11 rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800"
                onClick={openProviderSetupDialog}
              >
                Configure Provider
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="h-11 rounded-full border border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100"
                onClick={openSettingsDialog}
              >
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl justify-center">
        <div
          aria-hidden="true"
          className="w-full max-w-2xl rounded-[28px] border border-zinc-800/80 bg-zinc-900/75 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
        >
          <div className="min-h-24 px-3 py-2 text-sm leading-6 text-zinc-500">Message Moon...</div>
          <div className="flex items-center justify-between px-3 pb-1 pt-2 text-xs text-zinc-500">
            <span>Moon is ready when you are.</span>
            <span>Composer coming soon</span>
          </div>
        </div>
      </div>
    </section>
  )
}
