import { useEffect, useState } from 'react'
import { Provider } from 'react-redux'

import {
  applyAppSettings,
  loadAppSettings,
  selectAppSettings,
  selectSettingsLoadStatus,
  useSettingsDispatch,
  useSettingsSelector
} from '@renderer/entities/settings'
import type { AppearanceTheme } from '@ipc/contracts'

import { AppRouterContextStore, type AppRouteState } from './router/router-context'
import { store } from './store'

function useLoadSettingsOnce(): void {
  const dispatch = useSettingsDispatch()
  const loadStatus = useSettingsSelector(selectSettingsLoadStatus)

  useEffect(() => {
    if (loadStatus === 'idle') {
      void dispatch(loadAppSettings())
    }
  }, [dispatch, loadStatus])
}

function useSyncSettingsChanges(): void {
  const dispatch = useSettingsDispatch()

  useEffect(() => {
    return window.api.settings.onChange((settings) => {
      dispatch(applyAppSettings(settings))
    })
  }, [dispatch])
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
  const appSettings = useSettingsSelector(selectAppSettings)

  useLoadSettingsOnce()
  useSyncSettingsChanges()
  useApplyTheme(appSettings.appearance.theme)

  return null
}

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [routeState, setRouteState] = useState<AppRouteState>({ activeChatId: null })

  return (
    <Provider store={store}>
      <AppRouterContextStore.Provider value={{ routeState, setRouteState }}>
        <ThemeController />
        {children}
      </AppRouterContextStore.Provider>
    </Provider>
  )
}
