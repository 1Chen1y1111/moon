/**
 * 定义 server-core handler 注册所需的最小 RPC server 抽象。
 * 具体 transport 可以是 Electron IPC、WebSocket 或测试 fake，本层不关心 wire 实现。
 */

/**
 * transport adapter 调用 server-core handler 时使用的最小请求函数形态。
 */
export type RpcRequestHandler<
  TArgs extends readonly unknown[] = readonly unknown[],
  TResult = unknown
> = (...args: TArgs) => TResult | Promise<TResult>

/**
 * server-core 注册 handler 所依赖的最小 RPC server 端口。
 */
export type RpcServerPort = {
  /**
   * 注册一个 RPC channel 的请求处理函数，生命周期由具体 transport adapter 负责。
   */
  handle: <TArgs extends readonly unknown[], TResult>(
    channel: string,
    handler: RpcRequestHandler<TArgs, TResult>
  ) => void
}
