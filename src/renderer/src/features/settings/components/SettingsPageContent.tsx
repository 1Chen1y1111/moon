import { Minus, Square, X } from 'lucide-react'

import { useAppDispatch, useAppSelector } from '@renderer/app/store/hooks'

import { settingsSections } from '../config/settings-sections'
import { selectActiveSettingsSection } from '../model/settings.selectors'
import { setActiveSettingsSection } from '../model/slices'
import { SettingsContent } from './SettingsContent'
import { SettingsSidebar } from './SettingsSidebar'

export function SettingsPageContent(): React.JSX.Element {
  const dispatch = useAppDispatch()
  const activeSection = useAppSelector(selectActiveSettingsSection)
  const activeMeta = settingsSections.find((section) => section.id === activeSection)

  return (
    <div
      data-testid="settings-shell-surface"
      className="flex h-full min-h-0 w-full overflow-hidden rounded-3xl border border-moon-sidebar-border bg-moon-sidebar-bg text-moon-text-primary shadow-[var(--moon-shadow-shell)]"
    >
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={(sectionId) => dispatch(setActiveSettingsSection(sectionId))}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-moon-sidebar-border px-6">
          <h1 className="text-[2rem] font-semibold tracking-tight text-moon-text-primary">
            {activeMeta?.title ?? '设置'}
          </h1>

          <div className="flex items-center gap-1 text-moon-text-secondary">
            <button
              type="button"
              aria-label="最小化设置"
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-moon-button-ghost-bg-hover"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="最大化设置"
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-moon-button-ghost-bg-hover"
            >
              <Square aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="关闭设置窗口"
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-moon-menu-item-bg-hover hover:text-moon-text-primary"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div
          data-testid="settings-content-scroll"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          <SettingsContent activeSection={activeSection} />
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-moon-sidebar-border px-6 py-4">
          <p className="text-sm text-moon-text-secondary">所有更改已保存</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-10 rounded-2xl border border-moon-button-secondary-border bg-moon-button-secondary-bg px-5 text-sm text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
            >
              关闭
            </button>
            <button
              type="button"
              className="h-10 rounded-2xl bg-moon-button-primary-bg px-5 text-sm font-medium text-moon-button-primary-fg transition-colors hover:bg-moon-button-primary-bg-hover"
            >
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
