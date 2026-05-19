export const ipcChannels = {
  chat: {
    listSessions: 'chat:listSessions',
    getMessages: 'chat:getMessages',
    listTopics: 'chat:listTopics',
    listThreads: 'chat:listThreads',
    createSession: 'chat:createSession',
    importAttachment: 'chat:importAttachment',
    createMessageTurn: 'chat:createMessageTurn',
    runOperation: 'chat:runOperation',
    sendMessage: 'chat:sendMessage',
    cancelOperation: 'chat:cancelOperation',
    approveToolCall: 'chat:approveToolCall',
    rejectToolCall: 'chat:rejectToolCall',
    operationEvent: 'chat:operationEvent',
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
