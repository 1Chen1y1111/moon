/**
 * 负责挂载 renderer 全局 providers、主题同步和路由级临时状态。
 * 它只协调 UI 全局状态，不直接执行业务 IPC 之外的持久化逻辑。
 */

import { useEffect, useState } from 'react'

import { selectProjectsLoadStatus } from '@renderer/store/projects/selectors'
import { useProjectsStore } from '@renderer/store/projects'
import { selectAppSettings, selectSettingsLoadStatus } from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { Toaster } from '@moon/ui/ui/sonner'
import { TooltipProvider } from '@moon/ui/ui/tooltip'
import type { AppearanceTheme } from '@moon/shared/domain/settings'

import { AppRouterContextStore, type AppRouteState } from './router/router-context'

/**
 * 启动后读取一次应用设置，避免每个页面重复拉取配置。
 */
function useLoadSettingsOnce(): void {
  const loadStatus = useSettingsStore(selectSettingsLoadStatus)
  const loadAppSettingsAction = useSettingsStore((state) => state.loadAppSettings)

  useEffect(() => {
    if (loadStatus === 'idle') {
      void loadAppSettingsAction()
    }
  }, [loadAppSettingsAction, loadStatus])
}

/**
 * 订阅设置变化广播，保持当前窗口主题和配置缓存同步。
 */
function useSyncSettingsChanges(): void {
  const applyAppSettings = useSettingsStore((state) => state.applyAppSettings)

  useEffect(() => {
    return window.api.settings.onChange((settings) => {
      applyAppSettings(settings)
    })
  }, [applyAppSettings])
}

/**
 * 启动后读取一次项目列表，供 workspace sidebar 和聊天上下文使用。
 */
function useLoadProjectsOnce(): void {
  const loadStatus = useProjectsStore(selectProjectsLoadStatus)
  const loadProjects = useProjectsStore((state) => state.loadProjects)

  useEffect(() => {
    if (loadStatus === 'idle') {
      void loadProjects()
    }
  }, [loadProjects, loadStatus])
}

/**
 * 订阅主进程项目变化广播，保持多窗口项目状态一致。
 */
function useSyncProjectChanges(): void {
  const applyProjectsChange = useProjectsStore((state) => state.applyProjectsChange)

  useEffect(() => {
    return window.api.projects.onChange((event) => {
      applyProjectsChange(event)
    })
  }, [applyProjectsChange])
}

/**
 * 根据用户设置和系统偏好把 resolved theme 应用到 document。
 */
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

/**
 * 承载全局副作用：设置加载、项目加载、广播订阅和主题应用。
 */
function ThemeController(): null {
  const appSettings = useSettingsStore(selectAppSettings)

  useLoadSettingsOnce()
  useSyncSettingsChanges()
  useLoadProjectsOnce()
  useSyncProjectChanges()
  useApplyTheme(appSettings.appearance.theme)

  return null
}

/**
 * 根据当前外观设置渲染全局 toast 容器。
 */
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

/**
 * 挂载 Moon renderer 的全局 provider 和路由临时状态容器。
 */
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
