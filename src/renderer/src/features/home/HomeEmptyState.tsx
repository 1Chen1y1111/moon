import { Button } from '@renderer/components/ui/button'

export function HomeEmptyState(): React.JSX.Element {
  return (
    <section className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-50">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <Button type="button">New Chat</Button>
        <Button type="button" variant="secondary">
          Configure Provider
        </Button>
        <Button type="button" variant="ghost" className="text-zinc-100 hover:bg-zinc-800">
          Settings
        </Button>
      </div>
    </section>
  )
}
