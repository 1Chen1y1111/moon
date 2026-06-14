import { Plus, Search, Terminal } from 'lucide-react'

import { Button } from '@moon/ui/ui/button'
import { Input } from '@moon/ui/ui/input'

export function ProviderToolbar({
  searchQuery,
  onSearchQueryChange,
  onAddCustomProvider,
  onAddCustomAcpProvider
}: {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onAddCustomProvider: () => void
  onAddCustomAcpProvider: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="relative w-60">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="搜索提供商"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="h-9 w-full rounded-md border-input bg-secondary pl-10 pr-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 dark:focus-visible:ring-ring/50"
          placeholder="搜索提供商..."
        />
      </div>

      <div className="flex flex-col justify-end gap-3 sm:flex-row">
        <Button size="lg" variant="secondary" onClick={onAddCustomAcpProvider}>
          <Terminal aria-hidden="true" />
          Add Custom ACP Provider
        </Button>
        <Button size="lg" onClick={onAddCustomProvider}>
          <Plus aria-hidden="true" />
          Add Custom Provider
        </Button>
      </div>
    </div>
  )
}
