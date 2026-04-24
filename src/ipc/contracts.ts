import type { AppSettings } from '../shared/domain/settings'
import type { SaveAppearanceInput, SaveProviderInput } from '../shared/domain/settings-validation'
import { ipcChannels } from './channels'
import type { OpenSettingsInput, WindowState } from './window-contracts'

export type AppIpcContractMap = {
  [ipcChannels.settings.get]: {
    request: undefined
    response: AppSettings
  }
  [ipcChannels.settings.saveProvider]: {
    request: SaveProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.saveAppearance]: {
    request: SaveAppearanceInput
    response: AppSettings
  }
  [ipcChannels.window.close]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.minimize]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.toggleMaximize]: {
    request: undefined
    response: void
  }
  [ipcChannels.window.openSettings]: {
    request: OpenSettingsInput
    response: void
  }
  [ipcChannels.window.getState]: {
    request: undefined
    response: WindowState
  }
}

export type MoonApi = {
  settings: {
    get: () => Promise<AppSettings>
    saveProvider: (input: SaveProviderInput) => Promise<AppSettings>
    saveAppearance: (input: SaveAppearanceInput) => Promise<AppSettings>
    onChange: (listener: (settings: AppSettings) => void) => () => void
  }
  windowControls: {
    close: () => Promise<void>
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    openSettings: (input?: OpenSettingsInput) => Promise<void>
    getState: () => Promise<WindowState>
    onStateChange: (listener: (state: WindowState) => void) => () => void
  }
}
