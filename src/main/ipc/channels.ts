export const ipcChannels = {
  settings: {
    get: 'settings:get',
    saveProvider: 'settings:save-provider'
  },
  window: {
    close: 'window:close',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize'
  }
} as const
