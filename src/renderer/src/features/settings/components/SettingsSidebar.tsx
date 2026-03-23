import { settingsSections } from '../config/settings-sections'
import type { SettingsSectionId } from '../model/settings.types'

type SettingsSidebarProps = {
  activeSection: SettingsSectionId
  onSectionChange: (sectionId: SettingsSectionId) => void
}

export function SettingsSidebar({
  activeSection,
  onSectionChange
}: SettingsSidebarProps): React.JSX.Element {
  return (
    <aside className="flex h-full w-[228px] shrink-0 border-r border-[#3a414f] bg-[#242a32] px-2 py-2">
      <div
        role="tablist"
        aria-label="设置分类"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
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
                  ? 'flex items-center gap-3 rounded-lg border border-[#58708a] bg-[#33475d] px-3 py-2.5 text-left text-sm font-medium text-[#83c7ff]'
                  : 'flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm font-medium text-[#eef2f7] transition-colors hover:bg-[#2b3440]'
              }
              onClick={() => onSectionChange(section.id)}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span>{section.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
