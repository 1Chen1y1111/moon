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

/**
 * 描述一次 MCP source 工具调用是否需要先激活对应 source。
 */
export type SourceToolActivationCheckResult = {
  sourceSlug: string
  sourceExists: boolean
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
  private readonly activatedSourceSlugs = new Set<string>()
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

    this.pruneActivatedSources()
  }

  /**
   * 按 slug 新增或覆盖一个 source，保持 source 状态刷新时的最小写入边界。
   */
  upsertSource(source: AgentSourceRecord): void {
    this.sourcesBySlug.set(source.slug, cloneSource(source))
  }

  /**
   * 将已知 source 标记为 active；只有从非 active 变为 active 时才记录为本 turn 激活。
   */
  markSourceActive(slug: string): boolean {
    const source = this.sourcesBySlug.get(slug)

    if (source === undefined) {
      return false
    }

    const wasActive = source.status === 'active'
    const updatedSource = cloneSource(source)

    updatedSource.status = 'active'
    delete updatedSource.error
    this.sourcesBySlug.set(slug, updatedSource)

    if (!wasActive) {
      this.activatedSourceSlugs.add(slug)
    }

    return true
  }

  /**
   * 将已知 source 标记为 inactive，并保留它的描述、guide 和 instructions 元数据。
   */
  markSourceInactive(slug: string): boolean {
    return this.updateSourceStatus(slug, 'inactive')
  }

  /**
   * 将已知 source 标记为 needs_auth，可附带鉴权失败原因。
   */
  markSourceNeedsAuth(slug: string, error?: string): boolean {
    return this.updateSourceStatus(slug, 'needs_auth', error)
  }

  /**
   * 将已知 source 标记为 failed，可附带运行时错误原因。
   */
  markSourceFailed(slug: string, error?: string): boolean {
    return this.updateSourceStatus(slug, 'failed', error)
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
   * 判断 Claude MCP 工具名是否指向已知但尚未 active 的 source。
   */
  checkInactiveMcpSourceTool(toolName: string): SourceToolActivationCheckResult | null {
    const parts = toolName.split('__')

    if (parts.length < 3 || parts[0] !== 'mcp') {
      return null
    }

    const sourceSlug = parts[1]
    const source = sourceSlug === undefined ? undefined : this.sourcesBySlug.get(sourceSlug)

    if (source === undefined || source.status === 'active') {
      return null
    }

    return {
      sourceSlug,
      sourceExists: true
    }
  }

  /**
   * 返回本 turn 新激活的 source slugs，并清空已消费记录。
   */
  consumeActivatedSources(): string[] {
    const activatedSources = Array.from(this.activatedSourceSlugs)

    this.activatedSourceSlugs.clear()

    return activatedSources
  }

  /**
   * 清理本 turn 的 source activation 记录，不影响 source 列表和状态。
   */
  clearActivatedSources(): void {
    this.activatedSourceSlugs.clear()
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

  /**
   * 更新已知 source 的状态；未知 slug 返回 false，避免创建未经过 provider 解析的 source。
   */
  private updateSourceStatus(slug: string, status: AgentSourceStatus, error?: string): boolean {
    const source = this.sourcesBySlug.get(slug)

    if (source === undefined) {
      return false
    }

    const updatedSource = cloneSource(source)

    updatedSource.status = status

    if (error === undefined) {
      delete updatedSource.error
    } else {
      updatedSource.error = error
    }

    this.sourcesBySlug.set(slug, updatedSource)
    this.activatedSourceSlugs.delete(slug)

    return true
  }

  /**
   * source 列表刷新后移除已经不存在的 activation 记录。
   */
  private pruneActivatedSources(): void {
    for (const slug of this.activatedSourceSlugs) {
      if (!this.sourcesBySlug.has(slug)) {
        this.activatedSourceSlugs.delete(slug)
      }
    }
  }
}
