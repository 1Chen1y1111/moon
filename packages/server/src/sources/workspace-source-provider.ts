/**
 * 负责把当前会话绑定的项目元数据转换成 agent 可见的 workspace source。
 * 本文件不读取项目文件，也不负责 source 持久化或鉴权。
 */

import type {
  SessionSourceProviderPort,
  SessionSourceProviderScope
} from '@moon/server-core/sessions'
import type { AgentSourceRecord } from '@moon/shared/agent'

/**
 * 基于项目元数据提供当前 workspace source，作为 SourceProvider port 的本地默认实现。
 */
export class WorkspaceSourceProvider implements SessionSourceProviderPort {
  /**
   * 根据会话作用域派生 sources；未绑定项目的会话不注入 source context。
   */
  async resolveSources(scope: SessionSourceProviderScope): Promise<AgentSourceRecord[]> {
    if (scope.project === null) {
      return []
    }

    return [
      {
        slug: 'workspace',
        name: scope.project.name,
        description: `Workspace at ${scope.project.path}`,
        status: 'active'
      }
    ]
  }
}
