/**
 * 负责提供 provider event adapter 共用的 turn 生命周期状态。
 * 具体 SDK 消息到 AgentEvent 的转换由子类实现。
 */

import type { AgentEvent } from './types'
import { parseReadCommand, type ReadCommandInfo } from './read-patterns'

type TurnScopedAgentEvent = Extract<
  AgentEvent,
  {
    type:
      | 'text_delta'
      | 'text_complete'
      | 'reasoning_delta'
      | 'tool_start'
      | 'tool_result'
      | 'permission_request'
      | 'source_activated'
      | 'error'
      | 'typed_error'
  }
>
type ToolStartAgentEvent = Extract<AgentEvent, { type: 'tool_start' }>

/**
 * provider 事件适配器的最小公共基类。
 */
export abstract class BaseEventAdapter {
  protected readonly blockReasons = new Map<string, string>()
  protected readonly commandOutput = new Map<string, string>()
  protected readonly readCommands = new Map<string, ReadCommandInfo>()
  protected turnIndex = 0
  protected currentTurnId: string | null = null

  /**
   * 启动一轮 provider 事件适配，并重置子类的 per-turn 状态。
   */
  startTurn(turnId?: string): void {
    this.turnIndex += 1
    this.currentTurnId = turnId ?? null
    this.blockReasons.clear()
    this.commandOutput.clear()
    this.readCommands.clear()
    this.onTurnStart()
  }

  /**
   * 记录某个工具调用被权限规则阻止的原因，供后续 tool_result 事件补充上下文。
   */
  setBlockReason(id: string, reason: string): void {
    this.blockReasons.set(id, reason)
  }

  /**
   * 累积某个工具调用的流式输出，供 provider 在最终 tool_result 时合并。
   */
  accumulateOutput(id: string, delta: string): void {
    const current = this.commandOutput.get(id) ?? ''

    this.commandOutput.set(id, `${current}${delta}`)
  }

  /**
   * 取出并清理已记录的阻止原因，避免同一原因跨工具或跨 turn 泄漏。
   */
  protected consumeBlockReason(...keys: string[]): string | undefined {
    for (const key of keys) {
      const reason = this.blockReasons.get(key)

      if (reason !== undefined) {
        this.blockReasons.delete(key)
        return reason
      }
    }

    return undefined
  }

  /**
   * 取出并清理已累积的工具输出，避免同一输出被多个结果事件重复消费。
   */
  protected consumeOutput(id: string): string | undefined {
    const output = this.commandOutput.get(id)

    if (output !== undefined) {
      this.commandOutput.delete(id)
    }

    return output
  }

  /**
   * 尝试把 Bash 命令归类为 Read 工具，并把结果记录到当前 turn 的工具索引状态中。
   */
  protected classifyReadCommand(id: string, command: string): ReadCommandInfo | null {
    const readInfo = parseReadCommand(command)

    if (readInfo !== null) {
      this.readCommands.set(id, readInfo)
    }

    return readInfo
  }

  /**
   * 取出并清理某个工具调用对应的 Read 归类结果，避免跨结果或跨 turn 复用。
   */
  protected consumeReadCommand(id: string): ReadCommandInfo | undefined {
    const readInfo = this.readCommands.get(id)

    if (readInfo !== undefined) {
      this.readCommands.delete(id)
    }

    return readInfo
  }

  /**
   * 根据 Read 归类结果构造统一的 Read 工具开始事件。
   */
  protected createReadToolStart(
    toolUseId: string,
    readInfo: ReadCommandInfo,
    parentToolUseId?: string
  ): ToolStartAgentEvent {
    return {
      type: 'tool_start',
      toolUseId,
      toolName: 'Read',
      input: this.createReadToolInput(readInfo),
      ...(parentToolUseId === undefined ? {} : { parentToolUseId })
    }
  }

  /**
   * 把 Read 归类信息转成 Moon 现有 AgentEvent input 结构。
   */
  protected createReadToolInput(readInfo: ReadCommandInfo): Record<string, unknown> {
    const input: Record<string, unknown> = {
      file_path: readInfo.filePath,
      _command: readInfo.originalCommand
    }

    if (readInfo.startLine !== undefined) {
      input.offset = readInfo.startLine
    }

    if (readInfo.startLine !== undefined && readInfo.endLine !== undefined) {
      input.limit = readInfo.endLine - readInfo.startLine + 1
    }

    return input
  }

  /**
   * 给属于当前 turn 的事件补充 turnId，供 backend event loop 处理 synthetic event 时复用。
   */
  withCurrentTurnId(event: AgentEvent): AgentEvent {
    if (this.currentTurnId === null || !this.supportsTurnId(event)) {
      return event
    }

    return event.turnId === undefined ? { ...event, turnId: this.currentTurnId } : event
  }

  /**
   * 子类在每轮开始时重置 provider 专属状态。
   */
  protected abstract onTurnStart(): void

  /**
   * 判断事件协议是否允许携带 turnId，避免污染 usage/status/complete 等全局事件。
   */
  private supportsTurnId(event: AgentEvent): event is TurnScopedAgentEvent {
    return (
      event.type === 'text_delta' ||
      event.type === 'text_complete' ||
      event.type === 'reasoning_delta' ||
      event.type === 'tool_start' ||
      event.type === 'tool_result' ||
      event.type === 'permission_request' ||
      event.type === 'source_activated' ||
      event.type === 'error' ||
      event.type === 'typed_error'
    )
  }
}
