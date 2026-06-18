/**
 * 负责集中定义主进程、preload 和 renderer 共享的 IPC channel 名称。
 * 这里只维护 wire contract 的字符串入口，不承载请求参数或业务逻辑。
 */

import { RPC_CHANNELS } from '@moon/shared/protocol'

/**
 * IPC channel 常量；新增跨进程能力时先在这里声明稳定名称。
 */
export const ipcChannels = {
  chat: {
    listSessions: 'chat:listSessions',
    getMessages: 'chat:getMessages',
    listTopics: 'chat:listTopics',
    listThreads: 'chat:listThreads',
    createSession: 'chat:createSession',
    deleteSession: 'chat:deleteSession',
    importAttachment: 'chat:importAttachment',
    createMessageTurn: 'chat:createMessageTurn',
    runOperation: 'chat:runOperation',
    sendMessage: 'chat:sendMessage',
    cancelOperation: 'chat:cancelOperation',
    approveToolCall: 'chat:approveToolCall',
    rejectToolCall: 'chat:rejectToolCall',
    sessionEvent: RPC_CHANNELS.sessions.event
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
  projects: {
    list: 'projects:list',
    getActive: 'projects:get-active',
    useExistingFolder: 'projects:use-existing-folder',
    delete: 'projects:delete',
    setActive: 'projects:set-active',
    onChange: 'projects:on-change'
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
