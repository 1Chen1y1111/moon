/**
 * 负责 Pi-compatible 自定义端点的 agent backend driver。
 * 当前 Pi-compatible 语义保留给未来 Pi 子进程 runtime，不再直连 HTTP 兼容端点。
 */

import { piBackendNotWiredMessage } from '../../../connection-adapter'
import type { AgentBackendDriver } from '../driver-types'

export const piCompatDriver: AgentBackendDriver = {
  provider: 'pi_compat',

  /**
   * 明确拒绝创建 Pi-compatible backend，直到 Pi 子进程协议接入完成。
   */
  createAgent() {
    throw new Error(piBackendNotWiredMessage)
  }
}
