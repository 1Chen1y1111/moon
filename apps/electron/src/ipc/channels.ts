/**
 * 负责集中定义主进程、preload 和 renderer 共享的 IPC channel 名称。
 * 这里只维护 wire contract 的字符串入口，不承载请求参数或业务逻辑。
 */

/**
 * IPC channel 常量；新增跨进程能力时先在这里声明稳定名称。
 */
export const ipcChannels = {
  rpc: {
    request: 'rpc:request',
    event: 'rpc:event'
  },
} as const
