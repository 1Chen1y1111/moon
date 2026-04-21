import type { MoonApi } from '@ipc/contracts'

declare global {
  interface Window {
    api: MoonApi
  }
}

export {}
