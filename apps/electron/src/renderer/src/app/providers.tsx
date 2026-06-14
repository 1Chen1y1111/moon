import { useEffect, useState } from 'react'

import {
  selectAppSettings,
  selectSettingsLoadStatus
} from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { Toaster } from '@moon/ui/ui/sonner'
import { TooltipProvider } from '@moon/ui/ui/tooltip'
import type { AppearanceTheme } from '@moon/shared/domain/settings'

import { AppRouterContextStore, type AppRouteState } from './router/router-context'

function useLoadSettingsOnce(): void {
  const loadStatus = useSettingsStore(selectSettingsLoadStatus)
  const loadAppSettingsAction = useSettingsStore((state) => state.loadAppSettings)

  useEffect(() => {
    if (loadStatus === 'idle') {
      void loadAppSettingsAction()
    }
  }, [loadAppSettingsAction, loadStatus])
}

function useSyncSettingsChanges(): void {
  const applyAppSettings = useSettingsStore((state) => state.applyAppSettings)

  useEffect(() => {
    return window.api.settings.onChange((settings) => {
      applyAppSettings(settings)
    })
  }, [applyAppSettings])
}

function useApplyTheme(theme: AppearanceTheme): void {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function applyResolvedTheme(): void {
      const shouldUseDarkTheme = theme === 'dark' || (theme === 'system' && mediaQuery.matches)

      document.documentElement.classList.toggle('dark', shouldUseDarkTheme)
      document.documentElement.style.colorScheme = shouldUseDarkTheme ? 'dark' : 'light'
    }

    applyResolvedTheme()

    if (theme !== 'system') {
      return
    }

    mediaQuery.addEventListener('change', applyResolvedTheme)

    return () => {
      mediaQuery.removeEventListener('change', applyResolvedTheme)
    }
  }, [theme])
}

function ThemeController(): null {
  const appSettings = useSettingsStore(selectAppSettings)

  useLoadSettingsOnce()
  useSyncSettingsChanges()
  useApplyTheme(appSettings.appearance.theme)

  return null
}

function AppToaster(): React.JSX.Element {
  const appSettings = useSettingsStore(selectAppSettings)

  return (
    <Toaster
      richColors
      icons={{ error: null, info: null, loading: null, success: null, warning: null }}
      position="top-center"
      theme={appSettings.appearance.theme}
    />
  )
}

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [routeState, setRouteState] = useState<AppRouteState>({ activeChatId: null })

  return (
    <AppRouterContextStore.Provider value={{ routeState, setRouteState }}>
      <ThemeController />
      <TooltipProvider>{children}</TooltipProvider>
      <AppToaster />
    </AppRouterContextStore.Provider>
  )
}
