import type { ElectronAPI } from '@electron-toolkit/preload'

import type { MoonApi } from '../main/ipc/contracts'

declare global {
  interface Window {
    electron: ElectronAPI
    api: MoonApi
  }
}

export {}
