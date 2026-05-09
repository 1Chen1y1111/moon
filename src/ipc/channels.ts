export const ipcChannels = {
  chat: {
    listSessions: 'chat:listSessions',
    getMessages: 'chat:getMessages',
    createSession: 'chat:createSession',
    sendMessage: 'chat:sendMessage',
    sendMessageEvent: 'chat:sendMessageEvent'
  },
  settings: {
    get: 'settings:get',
    createCustomProvider: 'settings:create-custom-provider',
    createCustomAcpProvider: 'settings:create-custom-acp-provider',
    saveProvider: 'settings:save-provider',
    deleteProvider: 'settings:delete-provider',
    fetchProviderModels: 'settings:fetch-provider-models',
    testProvider: 'settings:test-provider',
    saveAppearance: 'settings:save-appearance',
    onChange: 'settings:on-change'
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
