/**
 * 负责 Pi provider 的 agent backend driver。
 * 当前只保留未来 Pi 子进程 runtime 的接线边界，不创建占位 agent。
 */

import { piBackendNotWiredMessage } from '../../../connection-adapter'
import type { ProviderDriver } from '../driver-types'

export const piDriver: ProviderDriver = {
  provider: 'pi',

  /**
   * 明确拒绝创建 Pi backend，直到 Pi 子进程和 JSONL 协议接入完成。
   */
  createBackend() {
    throw new Error(piBackendNotWiredMessage)
  }
}
