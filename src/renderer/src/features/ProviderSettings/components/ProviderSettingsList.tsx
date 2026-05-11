import { memo } from 'react'
import { Info } from 'lucide-react'

import { ScrollArea } from '@shadcn/ui/scroll-area'
import { cn } from '@shadcn/lib/utils'
import type { ProviderId } from '@shared/domain/provider'
import type { ProviderSettings } from '@shared/domain/settings'

import { ProviderCatalogIcon } from './ProviderCatalogIcon'
import { getProviderStatus } from '../provider-settings.utils'

type ProviderListItemProps = {
  provider: ProviderSettings
  isSelected: boolean
  onSelect: (providerId: ProviderId) => void
}

const ProviderListItem = memo(function ProviderListItem({
  provider,
  isSelected,
  onSelect
}: ProviderListItemProps): React.JSX.Element {
  const status = getProviderStatus(provider)

  return (
    <div role="listitem">
      <div
        aria-label={`选择 ${provider.name}`}
        aria-pressed={isSelected}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-colors',
          isSelected
            ? 'border-primary text-foreground'
            : 'border-border text-muted-foreground hover:bg-muted'
        )}
        onClick={() => onSelect(provider.provider)}
      >
        <div className="flex items-center gap-2">
          <ProviderCatalogIcon provider={provider.provider} />
          <span className="line-clamp-1 text-sm font-semibold">{provider.name}</span>
        </div>

        {provider.badge ? (
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            {provider.badge}
          </span>
        ) : null}

        <span
          aria-label={status === 'active' ? '已启用' : status === 'inactive' ? '未启用' : '未配置'}
          className={cn(
            'size-2 shrink-0 rounded-full',
            status === 'active'
              ? 'bg-primary'
              : status === 'inactive'
                ? 'bg-muted-foreground'
                : 'bg-muted-foreground/60'
          )}
        />
      </div>
    </div>
  )
})

export function ProviderSettingsList({
  providers,
  selectedProvider,
  onSelectProvider
}: {
  providers: ProviderSettings[]
  selectedProvider: ProviderId
  onSelectProvider: (providerId: ProviderId) => void
}): React.JSX.Element {
  return (
    <div className="h-full w-60 flex-none rounded-lg border border-border bg-card">
      <ScrollArea role="list" aria-label="提供商列表" className="h-full  p-3">
        <div className="w-full flex flex-col gap-2 select-none">
          {providers.map((provider) => (
            <ProviderListItem
              key={provider.provider}
              provider={provider}
              isSelected={provider.provider === selectedProvider}
              onSelect={onSelectProvider}
            />
          ))}
        </div>

        <p className="flex px-1.5 py-3 text-xs leading-5 text-muted-foreground">
          <Info size={14} className="flex-none mt-0.75 mr-1" />
          找不到想要的提供商？请先去插件页面安装对应的插件，然后再回到此页面。
        </p>
      </ScrollArea>
    </div>
  )
}
