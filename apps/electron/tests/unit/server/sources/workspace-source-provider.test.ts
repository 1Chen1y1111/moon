// @vitest-environment node

/**
 * 负责验证 @moon/server 的 workspace source provider 如何把项目元数据和 AGENTS.md 派生成 sources。
 * 测试使用临时目录，不触发真实项目文件。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { WorkspaceSourceProvider } from '@moon/server/sources/workspace-source-provider'
import type { SessionSourceProviderScope } from '@moon/server-core/sessions'
import type { ProjectRecord } from '@moon/shared/domain/project'

const timestamp = '2026-05-09T00:00:00.000Z'
let projectDirectory: string | null = null

/**
 * 创建用于 provider 测试的临时项目目录。
 */
async function createProjectDirectory(): Promise<string> {
  projectDirectory = await mkdtemp(join(tmpdir(), 'moon-source-project-'))
  return projectDirectory
}

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
  afterEach(async () => {
    if (projectDirectory !== null) {
      await rm(projectDirectory, { force: true, recursive: true })
      projectDirectory = null
    }
  })

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

  it('loads AGENTS.md as workspace source instructions', async () => {
    const provider = new WorkspaceSourceProvider()
    const projectPath = await createProjectDirectory()
    const instructions = 'Always explain project context before editing.'

    await writeFile(join(projectPath, 'AGENTS.md'), instructions, 'utf8')

    const project: ProjectRecord = {
      id: 'project-1',
      name: 'Moon',
      path: projectPath,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    await expect(provider.resolveSources(createScope(project))).resolves.toEqual([
      {
        slug: 'workspace',
        name: 'Moon',
        description: `Workspace at ${projectPath}`,
        guidePath: join(projectPath, 'AGENTS.md'),
        instructions,
        status: 'active'
      }
    ])
  })

  it('keeps workspace source active when AGENTS.md cannot be read', async () => {
    const provider = new WorkspaceSourceProvider()
    const projectPath = await createProjectDirectory()

    await mkdir(join(projectPath, 'AGENTS.md'))

    const project: ProjectRecord = {
      id: 'project-1',
      name: 'Moon',
      path: projectPath,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    await expect(provider.resolveSources(createScope(project))).resolves.toEqual([
      {
        slug: 'workspace',
        name: 'Moon',
        description: `Workspace at ${projectPath}`,
        guidePath: join(projectPath, 'AGENTS.md'),
        error: expect.stringContaining('AGENTS.md'),
        status: 'active'
      }
    ])
  })
})
