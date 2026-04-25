import { useCallback, useEffect, useRef, useState } from 'react'

import {
  selectActiveSettingsSection,
  setActiveSettingsSection,
  settingsSections,
  useSettingsDispatch,
  useSettingsSelector,
  type SettingsSectionId
} from '@renderer/entities/settings'
import { SettingsSidebar } from '@renderer/features/settings-navigation'
import type { ProviderSettingsFooterAction } from '@renderer/features/provider-settings'
import { MacWindowControls } from '@renderer/shared/ui/window-controls'
import { SettingsChrome } from '@renderer/widgets/settings-window-shell'
import { SettingsContent } from '@renderer/widgets/settings-content'

type ProviderFooterState = Omit<ProviderSettingsFooterAction, 'onSave'>

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

function isSameProviderFooterState(
  current: ProviderFooterState | null,
  next: ProviderFooterState
): boolean {
  return (
    current !== null &&
    current.selectedProvider === next.selectedProvider &&
    current.selectedProviderLabel === next.selectedProviderLabel &&
    current.statusText === next.statusText &&
    current.canSave === next.canSave &&
    current.isSaving === next.isSaving
  )
}

export function SettingsPage(): React.JSX.Element {
  const dispatch = useSettingsDispatch()
  const activeSection = useSettingsSelector(selectActiveSettingsSection)
  const activeMeta = settingsSections.find((section) => section.id === activeSection)
  const providerFooterSaveRef = useRef<(() => void) | null>(null)
  const [providerFooterState, setProviderFooterState] = useState<ProviderFooterState | null>(null)

  const handleProviderFooterActionChange = useCallback((action: ProviderSettingsFooterAction) => {
    const { onSave, ...footerState } = action

    providerFooterSaveRef.current = onSave
    setProviderFooterState((current) =>
      isSameProviderFooterState(current, footerState) ? current : footerState
    )
  }, [])

  const handleFooterClose = useCallback(() => {
    void window.api.windowControls.close()
  }, [])

  const handleFooterSave = useCallback(() => {
    providerFooterSaveRef.current?.()
  }, [])

  useEffect(() => {
    const initialSection = readInitialSectionFromHash()

    if (initialSection !== null) {
      dispatch(setActiveSettingsSection(initialSection))
    }
  }, [dispatch])

  const footerStatusText =
    activeSection === 'providers'
      ? (providerFooterState?.statusText ?? '选择提供商后保存')
      : '所有更改已保存'
  const footerSaveDisabled =
    activeSection !== 'providers' || providerFooterState === null || !providerFooterState.canSave

  return (
    <div
      data-testid="settings-shell-surface"
      className="flex h-full min-h-0 w-full overflow-hidden text-moon-text-primary shadow-moon-ring"
    >
      <SettingsSidebar
        activeSection={activeSection}
        headerSlot={<SettingsSidebarWindowControls />}
        onSectionChange={(sectionId) => dispatch(setActiveSettingsSection(sectionId))}
      />

      <section className="ml-moon-md flex min-h-0 min-w-0 flex-1 flex-col">
        <SettingsChrome title={activeMeta?.title ?? '设置'} />

        <div
          data-testid="settings-content-scroll"
          className="min-h-0 flex-1 overflow-y-auto px-moon-panel py-moon-panel"
        >
          <SettingsContent
            activeSection={activeSection}
            onProviderFooterActionChange={handleProviderFooterActionChange}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-moon-border-subtle px-moon-panel py-moon-lg">
          <p className="text-moon-body leading-moon-body text-moon-text-secondary">
            {footerStatusText}
          </p>
          <div className="flex items-center gap-moon-option-gap">
            <button
              type="button"
              className="h-moon-control rounded-moon-control border border-moon-button-secondary-border bg-moon-button-secondary-bg px-moon-card text-moon-body leading-moon-body text-moon-text-primary transition-colors hover:bg-moon-button-secondary-bg-hover"
              onClick={handleFooterClose}
            >
              关闭
            </button>
            <button
              type="button"
              className="h-moon-control rounded-moon-control bg-moon-button-primary-bg px-moon-card text-moon-body font-moon-title leading-moon-body text-moon-button-primary-fg transition-colors hover:bg-moon-button-primary-bg-hover disabled:opacity-50"
              disabled={footerSaveDisabled}
              onClick={handleFooterSave}
            >
              {providerFooterState?.isSaving ? '保存中' : '保存'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
