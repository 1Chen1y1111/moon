import { vi } from 'vitest'

import {
  createDefaultAppSettings,
  type AppSettings,
  type MoonApi,
  type OpenSettingsInput,
  type SaveProviderInput,
  type WindowState
} from '@ipc/contracts'

type MockFn<T extends (...args: never[]) => unknown> = ReturnType<typeof vi.fn<T>>

export type MockMoonApi = {
  settings: {
    get: MockFn<() => Promise<AppSettings>>
    saveProvider: MockFn<(input: SaveProviderInput) => Promise<AppSettings>>
  }
  windowControls: {
    close: MockFn<() => Promise<void>>
    minimize: MockFn<() => Promise<void>>
    toggleMaximize: MockFn<() => Promise<void>>
    openSettings: MockFn<(input?: OpenSettingsInput) => Promise<void>>
    getState: MockFn<() => Promise<WindowState>>
    onStateChange: MockFn<(listener: (state: WindowState) => void) => () => void>
  }
}

type MockWindowApiOptions = {
  appSettings?: AppSettings
  savedSettings?: AppSettings
  windowState?: WindowState
}

function createMockWindowApi(options: MockWindowApiOptions = {}): MockMoonApi {
  const appSettings = options.appSettings ?? createDefaultAppSettings()
  const savedSettings = options.savedSettings ?? appSettings
  const windowState = options.windowState ?? { isMaximized: false }

  return {
    settings: {
      get: vi.fn<() => Promise<AppSettings>>().mockResolvedValue(appSettings),
      saveProvider: vi
        .fn<(input: SaveProviderInput) => Promise<AppSettings>>()
        .mockResolvedValue(savedSettings)
    },
    windowControls: {
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      minimize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      toggleMaximize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      openSettings: vi
        .fn<(input?: OpenSettingsInput) => Promise<void>>()
        .mockResolvedValue(undefined),
      getState: vi.fn<() => Promise<WindowState>>().mockResolvedValue(windowState),
      onStateChange: vi
        .fn<(listener: (state: WindowState) => void) => () => void>()
        .mockReturnValue(() => undefined)
    }
  }
}

export function installMockWindowApi(options?: MockWindowApiOptions): MockMoonApi
export function installMockWindowApi(api: MockMoonApi): MockMoonApi
export function installMockWindowApi(input: MockWindowApiOptions | MockMoonApi = {}): MockMoonApi {
  const api = 'settings' in input ? input : createMockWindowApi(input)

  window.api = api as MoonApi

  return api
}
