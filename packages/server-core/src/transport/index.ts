/**
 * 汇总 server-core transport-neutral RPC helpers。
 * 当前只提供 envelope codec 和内存 dispatcher，不创建 WebSocket 或 Electron IPC transport。
 */

export * from './codec'
export * from './envelope-rpc-server'
