import { useEffect } from 'react'

import {
  loadAppSettings,
  selectActiveSettingsSection,
  setActiveSettingsSection,
  settingsSections,
  useSettingsDispatch,
  useSettingsSelector,
  type SettingsSectionId
} from '@renderer/entities/settings'
import { SettingsSidebar } from '@renderer/features/settings-navigation'
import { MacWindowControls } from '@renderer/shared/ui/window-controls'
import { SettingsChrome } from '@renderer/widgets/settings-window-shell'
import { SettingsContent } from '@renderer/widgets/settings-content'

function readInitialSectionFromHash(): SettingsSectionId | null {
  const [, query = ''] = window.location.hash.split('?')
  const section = new URLSearchParams(query).get('section')

  if (section === 'providers') {
    return section
  }

  return null
}

function SettingsSidebarWindowControls(): React.JSX.Element {
  const handleClose = (): void => {
    void window.api.windowControls.close()
  }

  const handleMinimize = (): void => {
    void window.api.windowControls.minimize()
  }

  const handleToggleMaximize = (): void => {
    void window.api.windowControls.toggleMaximize()
  }

  return (
    <MacWindowControls
      onClose={handleClose}
      onMinimize={handleMinimize}
      onToggleMaximize={handleToggleMaximize}
    />
  )
}

export function SettingsPage(): React.JSX.Element {
  const dispatch = useSettingsDispatch()
  const activeSection = useSettingsSelector(selectActiveSettingsSection)
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
      className="flex h-full min-h-0 w-full overflow-hidden text-moon-text-primary shadow-[var(--moon-shadow-shell)]"
    >
      <SettingsSidebar
        activeSection={activeSection}
        headerSlot={<SettingsSidebarWindowControls />}
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
