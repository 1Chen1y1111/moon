/**
 * 负责预留 Pi SDK/子进程事件到 Moon 统一事件的转换边界。
 * 当前尚未接入 Pi 运行协议，因此只提供占位错误事件。
 */

import type { AgentEvent } from '../types'

/**
 * 返回当前 Pi backend 尚未接线的统一错误事件。
 */
export function createPiNotWiredEvent(message?: string): AgentEvent {
  return {
    type: 'error',
    message: message ?? 'Pi backend is not wired yet. Configure an Anthropic provider for now.'
  }
}
