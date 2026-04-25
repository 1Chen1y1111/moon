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
      className="flex h-full w-moon-settings-sidebar shrink-0 overflow-hidden rounded-moon-panel border-r border-moon-border-subtle bg-moon-surface-1 py-moon-option-gap"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="moon-window-drag-region px-moon-nav-x pb-moon-lg">{headerSlot}</div>

        <div
          role="tablist"
          aria-label="设置分类"
          className="flex min-h-0 flex-1 flex-col gap-moon-sm overflow-y-auto px-moon-nav-x"
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
                    ? 'moon-window-no-drag relative z-20 flex items-center gap-moon-option-gap rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-nav-x py-moon-nav-y text-left text-moon-body-lead font-moon-title leading-moon-body-lead text-moon-text-primary'
                    : 'moon-window-no-drag relative z-20 flex items-center gap-moon-option-gap rounded-moon-control border border-transparent px-moon-nav-x py-moon-nav-y text-left text-moon-body-lead font-moon-title leading-moon-body-lead text-moon-text-primary transition-colors hover:bg-moon-button-ghost-bg-hover hover:text-moon-text-primary'
                }
                onClick={() => onSectionChange(section.id)}
              >
                <Icon
                  aria-hidden="true"
                  className="size-moon-icon shrink-0 text-moon-text-secondary"
                />
                <span>{section.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
