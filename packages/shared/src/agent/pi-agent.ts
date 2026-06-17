/**
 * 负责预留 Pi agent 的统一 agent 实现边界。
 * 当前文件不直接接入 Pi SDK，避免在子进程协议落地前扩大运行时依赖。
 */

import type {
  AgentBackend,
  AgentChatOptions,
  AgentEvent,
  MessageAttachment
} from './backend/types'
import { createPiNotWiredEvent } from './backend/pi/event-adapter'

export type PiAgentInput = {
  model: string
  notWiredMessage?: string
}

export class PiAgent implements AgentBackend {
  private destroyed = false
  private model: string
  private readonly notWiredMessage?: string

  /**
   * 保存未来 Pi SDK 会话需要的模型 ID。
   */
  constructor({ model, notWiredMessage }: PiAgentInput) {
    this.model = model
    this.notWiredMessage = notWiredMessage
  }

  /**
   * 明确拒绝执行，直到 Pi 子进程和 JSONL 协议接入完成。
   */
  async *chat(
    message: string,
    attachments?: MessageAttachment[],
    options?: AgentChatOptions
  ): AsyncGenerator<AgentEvent, void, void> {
    void message
    void attachments
    void options

    if (this.destroyed) {
      yield {
        type: 'error',
        message: 'Pi backend has been destroyed.'
      }
      return
    }

    yield createPiNotWiredEvent(this.notWiredMessage)
  }

  /**
   * 响应权限请求；Pi backend 尚未接入运行时权限协议，因此当前不会产生待处理请求。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    void requestId
    void allowed
    void alwaysAllow
  }

  /**
   * 请求中止当前执行；占位实现没有长生命周期任务。
   */
  async abort(reason?: string): Promise<void> {
    void reason
  }

  /**
   * 释放 agent 资源；占位实现没有子进程或 SDK 会话。
   */
  destroy(): void {
    this.destroyed = true
  }

  /**
   * 返回占位 agent 是否正在处理消息。
   */
  isProcessing(): boolean {
    return false
  }

  /**
   * 返回当前标记的模型 ID。
   */
  getModel(): string {
    return this.model
  }

  /**
   * 更新当前标记的模型 ID。
   */
  setModel(model: string): void {
    this.model = model
  }
}
