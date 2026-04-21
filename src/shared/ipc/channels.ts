export const ipcChannels = {
  settings: {
    get: 'settings:get',
    saveProvider: 'settings:save-provider'
  },
  window: {
    close: 'window:close',
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    openSettings: 'window:open-settings',
    getState: 'window:get-state',
    onStateChange: 'window:on-state-change'
  }
} as const
