import type { MoonApi } from '@moon/ipc/contracts'

declare global {
  interface Window {
    api: MoonApi
  }
}

export {}
