/**
 * 负责 agent backend 运行时共享的 source 状态管理和 prompt context 串行化。
 * 它只维护纯内存状态，不负责 MCP 连接、credential、OAuth 或文件系统读取。
 */

export type AgentSourceStatus = 'active' | 'inactive' | 'needs_auth' | 'failed'

export type AgentSourceRecord = {
  slug: string
  name: string
  status: AgentSourceStatus
  description?: string
  guidePath?: string
  instructions?: string
  error?: string
}

export type SourceManagerInput = {
  sources?: AgentSourceRecord[]
}

const sourceStatusOrder: AgentSourceStatus[] = ['active', 'needs_auth', 'failed', 'inactive']

const sourceStatusLabels: Record<AgentSourceStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  needs_auth: 'Needs auth',
  failed: 'Failed'
}

/**
 * 复制 source 记录，避免调用方通过返回值反向修改内部状态。
 */
function cloneSource(source: AgentSourceRecord): AgentSourceRecord {
  return { ...source }
}

/**
 * 把单个 source 记录格式化为 `<sources>` block 内的一行和附加诊断。
 */
function formatSourceLine(source: AgentSourceRecord): string {
  const label = `- ${source.slug} (${source.name})`
  const line = source.description === undefined ? label : `${label}: ${source.description}`
  const details = [
    source.guidePath === undefined ? undefined : `  Guide: ${source.guidePath}`,
    source.instructions === undefined ? undefined : `  Instructions:\n${source.instructions}`,
    source.error === undefined ? undefined : `  Error: ${source.error}`
  ].filter((detail): detail is string => detail !== undefined)

  return details.length === 0 ? line : [line, ...details].join('\n')
}

/**
 * 把同一状态下的 sources 格式化为稳定的 prompt 小节。
 */
function formatSourceSection(status: AgentSourceStatus, sources: AgentSourceRecord[]): string {
  return [sourceStatusLabels[status] + ':', ...sources.map(formatSourceLine)].join('\n')
}

/**
 * 集中维护当前 agent turn 可见的 source 状态，作为未来 Claude/Pi backend 共用的上下文边界。
 */
export class SourceManager {
  private readonly sourcesBySlug = new Map<string, AgentSourceRecord>()

  /**
   * 初始化当前 runtime 已知的 sources；传入值会被复制进内部状态。
   */
  constructor({ sources = [] }: SourceManagerInput = {}) {
    this.setSources(sources)
  }

  /**
   * 用一组 sources 替换当前内部状态，适合未来 workspace source 列表刷新时调用。
   */
  setSources(sources: AgentSourceRecord[]): void {
    this.sourcesBySlug.clear()

    for (const source of sources) {
      this.upsertSource(source)
    }
  }

  /**
   * 按 slug 新增或覆盖一个 source，保持 source 状态刷新时的最小写入边界。
   */
  upsertSource(source: AgentSourceRecord): void {
    this.sourcesBySlug.set(source.slug, cloneSource(source))
  }

  /**
   * 返回当前所有 source 记录的副本，避免外部直接修改 runtime 内存状态。
   */
  listSources(): AgentSourceRecord[] {
    return Array.from(this.sourcesBySlug.values()).map(cloneSource)
  }

  /**
   * 返回当前真正可用的 active sources；鉴权失败或构建失败的 source 不会出现在这里。
   */
  listActiveSources(): AgentSourceRecord[] {
    return this.listSources().filter((source) => source.status === 'active')
  }

  /**
   * 将当前 source 状态格式化为可注入 prompt 的 `<sources>` context block。
   */
  buildContextBlock(): string {
    const sources = this.listSources()

    if (sources.length === 0) {
      return ''
    }

    const sections = sourceStatusOrder
      .map((status) => {
        const sourcesForStatus = sources.filter((source) => source.status === status)

        return sourcesForStatus.length === 0
          ? undefined
          : formatSourceSection(status, sourcesForStatus)
      })
      .filter((section): section is string => section !== undefined)

    return `<sources>\n${sections.join('\n\n')}\n</sources>`
  }
}
