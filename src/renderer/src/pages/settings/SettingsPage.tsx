import { useCallback, useEffect, useRef, useState } from 'react'

import {
  selectActiveSettingsSection,
  setActiveSettingsSection,
  settingsSections,
  useSettingsDispatch,
  useSettingsSelector,
  type SettingsSectionId
} from '@renderer/entities/settings'
import type { ProviderSettingsFooterAction } from '@renderer/features/provider-settings'
import { SettingsContent } from '@renderer/widgets/settings-content'
import { SettingsShell } from '@renderer/widgets/settings-shell'

type ProviderFooterState = Omit<ProviderSettingsFooterAction, 'onSave'>

function readInitialSectionFromHash(): SettingsSectionId | null {
  const [, query = ''] = window.location.hash.split('?')
  const section = new URLSearchParams(query).get('section')

  if (section === 'providers') {
    return section
  }

  return null
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
  const footerSaveLabel = providerFooterState?.isSaving ? '保存中' : '保存'

  return (
    <SettingsShell
      activeSection={activeSection}
      title={activeMeta?.title ?? '设置'}
      footerStatusText={footerStatusText}
      footerSaveDisabled={footerSaveDisabled}
      footerSaveLabel={footerSaveLabel}
      onFooterSave={handleFooterSave}
      onSectionChange={(sectionId) => dispatch(setActiveSettingsSection(sectionId))}
    >
      <SettingsContent
        activeSection={activeSection}
        onProviderFooterActionChange={handleProviderFooterActionChange}
      />
    </SettingsShell>
  )
}
