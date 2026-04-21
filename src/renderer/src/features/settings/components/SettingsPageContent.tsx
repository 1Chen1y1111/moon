import { useEffect } from 'react'

import { useAppDispatch, useAppSelector } from '@renderer/app/store/hooks'
import { SettingsChrome } from '@renderer/shell/SettingsChrome'

import { settingsSections } from '../config/settings-sections'
import { selectActiveSettingsSection } from '../model/settings.selectors'
import { loadAppSettings, setActiveSettingsSection } from '../model/slices'
import type { SettingsSectionId } from '../model/settings.types'
import { SettingsContent } from './SettingsContent'
import { SettingsSidebar } from './SettingsSidebar'

function readInitialSectionFromHash(): SettingsSectionId | null {
  const [, query = ''] = window.location.hash.split('?')
  const section = new URLSearchParams(query).get('section')

  if (section === 'providers') {
    return section
  }

  return null
}

export function SettingsPageContent(): React.JSX.Element {
  const dispatch = useAppDispatch()
  const activeSection = useAppSelector(selectActiveSettingsSection)
  const activeMeta = settingsSections.find((section) => section.id === activeSection)

  useEffect(() => {
    const initialSection = readInitialSectionFromHash()

    if (initialSection !== null) {
      dispatch(setActiveSettingsSection(initialSection))
    }

    void dispatch(loadAppSettings())
  }, [dispatch])

  return (
    <div
      data-testid="settings-shell-surface"
      className="flex h-full min-h-0 w-full overflow-hidden  text-moon-text-primary shadow-[var(--moon-shadow-shell)]"
    >
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={(sectionId) => dispatch(setActiveSettingsSection(sectionId))}
      />

      <section className="ml-2 flex min-h-0 min-w-0 flex-1 flex-col">
        <SettingsChrome title={activeMeta?.title ?? '设置'} />

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
