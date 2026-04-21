import type { MoonApi } from '../shared/ipc/contracts'

declare global {
  interface Window {
    api: MoonApi
  }
}

export {}
