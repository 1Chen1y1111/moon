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

import { Button } from '@shadcn/ui/button'

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
      className="flex w-full h-screen bg-background text-foreground"
    >
      <SettingsSidebar
        activeSection={activeSection}
        headerSlot={<SettingsSidebarWindowControls />}
        onSectionChange={(sectionId) => dispatch(setActiveSettingsSection(sectionId))}
      />

      <main className="w-full h-screen flex flex-1 flex-col">
        <SettingsChrome title={activeMeta?.title ?? '设置'} />

        <div
          data-testid="settings-content-scroll"
          className="h-[calc(100%-120px)] flex-1 px-6 py-6"
        >
          <SettingsContent
            activeSection={activeSection}
            onProviderFooterActionChange={handleProviderFooterActionChange}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-border px-6 h-16">
          <p className="text-sm leading-6 text-muted-foreground">{footerStatusText}</p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleFooterClose}>
              关闭
            </Button>
            <Button variant="secondary" disabled={footerSaveDisabled} onClick={handleFooterSave}>
              {providerFooterState?.isSaving ? '保存中' : '保存'}
            </Button>
          </div>
        </footer>
      </main>
    </div>
  )
}
