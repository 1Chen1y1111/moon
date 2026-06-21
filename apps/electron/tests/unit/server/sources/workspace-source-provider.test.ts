// @vitest-environment node

/**
 * 负责验证 @moon/server 的 workspace source provider 只从项目元数据派生 sources。
 * 测试不读取真实文件系统，避免把 project context loader 范围提前带进来。
 */

import { describe, expect, it } from 'vitest'

import { WorkspaceSourceProvider } from '@moon/server/sources/workspace-source-provider'
import type { SessionSourceProviderScope } from '@moon/server-core/sessions'
import type { ProjectRecord } from '@moon/shared/domain/project'

const timestamp = '2026-05-09T00:00:00.000Z'

/**
 * 创建 source provider 需要的最小会话作用域。
 */
function createScope(project: ProjectRecord | null): SessionSourceProviderScope {
  return {
    project,
    session: {
      id: 'session-1',
      projectId: project?.id ?? null,
      provider: 'claude',
      title: 'Moon',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    },
    topic: {
      id: 'topic-1',
      sessionId: 'session-1',
      title: '默认话题',
      createdAt: timestamp,
      updatedAt: timestamp
    },
    thread: {
      id: 'thread-1',
      topicId: 'topic-1',
      title: '主线',
      type: 'standalone',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }
}

describe('WorkspaceSourceProvider', () => {
  it('returns no sources when the session is not bound to a project', async () => {
    const provider = new WorkspaceSourceProvider()

    await expect(provider.resolveSources(createScope(null))).resolves.toEqual([])
  })

  it('derives an active workspace source from project metadata', async () => {
    const provider = new WorkspaceSourceProvider()
    const project: ProjectRecord = {
      id: 'project-1',
      name: 'Moon',
      path: '/workspace/moon',
      createdAt: timestamp,
      updatedAt: timestamp
    }

    await expect(provider.resolveSources(createScope(project))).resolves.toEqual([
      {
        slug: 'workspace',
        name: 'Moon',
        description: 'Workspace at /workspace/moon',
        status: 'active'
      }
    ])
  })
})
