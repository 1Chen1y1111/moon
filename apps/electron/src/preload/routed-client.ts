/**
 * 负责在 preload 内部按 shared protocol routing 选择 RPC client。
 * 当前 v1 只区分 local/workspace 目标，不处理远程连接、工作区切换或重连状态。
 */

import type {
  RpcClientCapabilityHandler,
  RpcClientCapabilityPort,
  RpcClientListener,
  RpcClientPort
} from '@moon/server-core/transport'
import { isLocalOnly } from '@moon/shared/protocol'

type CapabilityAwareRpcClient = RpcClientPort & Partial<RpcClientCapabilityPort>

/**
 * Craft 风格的 preload RPC 路由器：LOCAL_ONLY 留在本地，其余交给 workspace client。
 */
export class RoutedClient implements RpcClientPort {
  private readonly workspaceClient: CapabilityAwareRpcClient

  /**
   * 创建路由 client；未提供 workspace client 时默认复用 local client，保持当前 IPC 行为不变。
   */
  constructor(
    private readonly localClient: RpcClientPort,
    workspaceClient?: CapabilityAwareRpcClient
  ) {
    this.workspaceClient = workspaceClient ?? localClient
  }

  /**
   * 按 channel routing 调用目标 client，并保持参数和返回值不变。
   */
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    return this.getTargetClient(channel).invoke(channel, ...args)
  }

  /**
   * 按 channel routing 订阅目标 client 事件，并透传其取消订阅函数。
   */
  on(channel: string, listener: RpcClientListener): () => void {
    return this.getTargetClient(channel).on(channel, listener)
  }

  /**
   * 注册 workspace client capability；v1 不把 capability 暴露给 renderer。
   */
  handleCapability(channel: string, handler: RpcClientCapabilityHandler): void {
    this.workspaceClient.handleCapability?.(channel, handler)
  }

  /**
   * 根据 shared routing contract 选择本地或工作区 client。
   */
  private getTargetClient(channel: string): RpcClientPort {
    return isLocalOnly(channel) ? this.localClient : this.workspaceClient
  }
}
