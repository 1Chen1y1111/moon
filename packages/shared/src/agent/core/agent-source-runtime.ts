/**
 * 负责 agent backend 使用 source 状态的运行时 façade。
 * 具体 source 状态规则仍由 SourceManager 维护，这里只收束 backend 访问边界。
 */

import {
  SourceManager,
  type AgentSourceRecord,
  type InactiveSourceToolError,
  type SourceToolActivationCheckResult,
  type SourceToolCheckResult
} from './source-manager'

export type AgentSourceRuntimeInput = {
  sources?: AgentSourceRecord[]
}

/**
 * 包装 SourceManager，向 BaseAgent、prompt、PreToolUse 和 Claude tool_result handler 暴露稳定边界。
 */
export class AgentSourceRuntime {
  private readonly sourceManager: SourceManager

  /**
   * 初始化当前 backend runtime 可见的 source 列表。
   */
  constructor({ sources = [] }: AgentSourceRuntimeInput = {}) {
    this.sourceManager = new SourceManager({ sources })
  }

  /**
   * 用 provider 解析出的 source 列表替换当前运行态 source 集合。
   */
  setSources(sources: AgentSourceRecord[]): void {
    this.sourceManager.setSources(sources)
  }

  /**
   * 新增或覆盖一个已知 source，不创建额外运行协议。
   */
  upsertSource(source: AgentSourceRecord): void {
    this.sourceManager.upsertSource(source)
  }

  /**
   * 将已知 source 标记为 active，并记录本 turn 的 activation。
   */
  markSourceActive(slug: string): boolean {
    return this.sourceManager.markSourceActive(slug)
  }

  /**
   * 将已知 source 标记为 inactive。
   */
  markSourceInactive(slug: string): boolean {
    return this.sourceManager.markSourceInactive(slug)
  }

  /**
   * 将已知 source 标记为 needs_auth，可附带鉴权失败原因。
   */
  markSourceNeedsAuth(slug: string, error?: string): boolean {
    return this.sourceManager.markSourceNeedsAuth(slug, error)
  }

  /**
   * 将已知 source 标记为 failed，可附带运行失败原因。
   */
  markSourceFailed(slug: string, error?: string): boolean {
    return this.sourceManager.markSourceFailed(slug, error)
  }

  /**
   * 返回当前所有 source 记录副本，供 prerequisite 和 source policy 判断使用。
   */
  listSources(): AgentSourceRecord[] {
    return this.sourceManager.listSources()
  }

  /**
   * 返回当前 active source 记录副本。
   */
  listActiveSources(): AgentSourceRecord[] {
    return this.sourceManager.listActiveSources()
  }

  /**
   * 判断 MCP source 工具是否指向已知但未 active 的 source。
   */
  checkInactiveMcpSourceTool(toolName: string): SourceToolActivationCheckResult | null {
    return this.sourceManager.checkInactiveMcpSourceTool(toolName)
  }

  /**
   * 判断 MCP source 工具是否指向当前 runtime 已知 source。
   */
  checkKnownMcpSourceTool(toolName: string): SourceToolCheckResult | null {
    return this.sourceManager.checkKnownMcpSourceTool(toolName)
  }

  /**
   * 判断 tool_result 错误是否代表 Claude 调用了未激活 source 的 MCP 工具。
   */
  detectInactiveSourceToolError(
    toolName: string,
    errorMessage: string
  ): InactiveSourceToolError | null {
    return this.sourceManager.detectInactiveSourceToolError(toolName, errorMessage)
  }

  /**
   * 消费本 turn 新激活的 source slugs。
   */
  consumeActivatedSources(): string[] {
    return this.sourceManager.consumeActivatedSources()
  }

  /**
   * 清理本 turn 的 source activation 记录，不改变 source 状态。
   */
  clearActivatedSources(): void {
    this.sourceManager.clearActivatedSources()
  }

  /**
   * 构造可注入 provider prompt 的 `<sources>` context block。
   */
  buildContextBlock(): string {
    return this.sourceManager.buildContextBlock()
  }
}
