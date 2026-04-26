import type { AppSettings, ProviderTestResult } from '../shared/domain/settings'
import type {
  CreateCustomAcpProviderInput,
  CreateCustomProviderInput,
  DeleteProviderInput,
  ProviderConnectionInput,
  SaveAppearanceInput,
  SaveProviderInput
} from '../shared/domain/settings-validation'
import { ipcChannels } from './channels'
import type { OpenSettingsInput, WindowState } from './window-contracts'

export type AppIpcContractMap = {
  [ipcChannels.settings.get]: {
    request: undefined
    response: AppSettings
  }
  [ipcChannels.settings.createCustomProvider]: {
    request: CreateCustomProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.createCustomAcpProvider]: {
    request: CreateCustomAcpProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.saveProvider]: {
    request: SaveProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.deleteProvider]: {
    request: DeleteProviderInput
    response: AppSettings
  }
  [ipcChannels.settings.fetchProviderModels]: {
    request: ProviderConnectionInput
    response: AppSettings
  }
  [ipcChannels.settings.testProvider]: {
    request: ProviderConnectionInput
    response: ProviderTestResult
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
    createCustomProvider: (input: CreateCustomProviderInput) => Promise<AppSettings>
    createCustomAcpProvider: (input: CreateCustomAcpProviderInput) => Promise<AppSettings>
    saveProvider: (input: SaveProviderInput) => Promise<AppSettings>
    deleteProvider: (input: DeleteProviderInput) => Promise<AppSettings>
    fetchProviderModels: (input: ProviderConnectionInput) => Promise<AppSettings>
    testProvider: (input: ProviderConnectionInput) => Promise<ProviderTestResult>
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
