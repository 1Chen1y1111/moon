/**
 * 负责 Pi provider 的 agent backend driver。
 * 当前只创建占位 PiAgent，实际 Pi SDK/子进程接入会继续收敛在此 driver 下。
 */

import { PiAgent } from '../../../pi-agent'
import { piBackendNotWiredMessage } from '../../../connection-adapter'
import type { AgentBackendDriver } from '../driver-types'

export const piDriver: AgentBackendDriver = {
  provider: 'pi',

  /**
   * 创建当前阶段的 Pi 占位 agent 实例。
   */
  createAgent(config) {
    return new PiAgent({ model: config.model, notWiredMessage: piBackendNotWiredMessage })
  }
}
