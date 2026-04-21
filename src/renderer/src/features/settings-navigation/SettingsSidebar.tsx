import { settingsSections, type SettingsSectionId } from '@renderer/entities/settings'

type SettingsSidebarProps = {
  activeSection: SettingsSectionId
  headerSlot: React.ReactNode
  onSectionChange: (sectionId: SettingsSectionId) => void
}

export function SettingsSidebar({
  activeSection,
  headerSlot,
  onSectionChange
}: SettingsSidebarProps): React.JSX.Element {
  return (
    <aside
      data-testid="settings-sidebar-shell"
      className="flex h-full w-57 shrink-0 rounded-3xl border-r border-moon-sidebar-border bg-moon-sidebar-bg py-3 overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="pb-4 px-3">{headerSlot}</div>

        <div
          role="tablist"
          aria-label="设置分类"
          className="flex min-h-0 flex-1 flex-col gap-1 px-3 overflow-y-auto"
        >
          {settingsSections.map((section) => {
            const isActive = section.id === activeSection
            const Icon = section.icon

            return (
              <button
                key={section.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                className={
                  isActive
                    ? 'flex items-center gap-3 rounded-xl border border-moon-menu-item-border-hover bg-moon-menu-item-bg-hover px-3 py-2.5 text-left text-sm font-medium text-moon-accent'
                    : 'flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover hover:text-moon-text-primary'
                }
                onClick={() => onSectionChange(section.id)}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-moon-text-secondary" />
                <span>{section.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
