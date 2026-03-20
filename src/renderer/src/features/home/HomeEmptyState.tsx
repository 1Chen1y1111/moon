import { Button } from '@renderer/components/ui/button'

export function HomeEmptyState(): React.JSX.Element {
  return (
    <section
      aria-label="Home empty state"
      className="flex min-h-full items-center justify-center bg-zinc-950 p-6 text-zinc-50"
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
        <Button>New Chat</Button>
        <Button variant="secondary">Configure Provider</Button>
        <Button variant="ghost" className="text-zinc-100 hover:bg-zinc-800">
          Settings
        </Button>
      </div>
    </section>
  )
}
