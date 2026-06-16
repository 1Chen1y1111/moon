// @vitest-environment node

/**
 * 负责验证 ProjectsService 的目录选择和 active project 编排。
 * 测试使用 mock repository 和临时目录，不打开真实系统文件选择器。
 */

import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectsService } from '@main/services/projects-service'
import type { ProjectRecord } from '@moon/shared/domain/project'

class ProjectsRepositoryMock {
  readonly projects: ProjectRecord[] = []
  activeProjectId: string | null = null

  async list(): Promise<ProjectRecord[]> {
    return this.projects
  }

  async findById(id: string): Promise<ProjectRecord | null> {
    return this.projects.find((project) => project.id === id) ?? null
  }

  async upsertByPath(input: { name: string; path: string }): Promise<ProjectRecord> {
    const existing = this.projects.find((project) => project.path === input.path)
    const timestamp = '2026-05-09T00:00:00.000Z'

    if (existing !== undefined) {
      Object.assign(existing, { name: input.name, updatedAt: timestamp })
      return existing
    }

    const project = {
      id: `project-${this.projects.length + 1}`,
      name: input.name,
      path: input.path,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    this.projects.push(project)

    return project
  }

  async setActiveProjectId(projectId: string | null): Promise<void> {
    this.activeProjectId = projectId
  }

  async getActiveProject(): Promise<ProjectRecord | null> {
    return this.activeProjectId === null ? null : this.findById(this.activeProjectId)
  }
}

describe('ProjectsService', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directoryPath) => rm(directoryPath, { recursive: true, force: true }))
    )
  })

  it('adds an existing folder and makes it active', async () => {
    const directoryPath = await mkdtemp(join(tmpdir(), 'moon-project-service-'))
    const realDirectoryPath = await realpath(directoryPath)
    const repository = new ProjectsRepositoryMock()
    tempDirectories.push(directoryPath)

    const service = new ProjectsService({
      pickDirectory: vi.fn(async () => directoryPath),
      projectsRepository: repository as never
    })

    const project = await service.useExistingFolder()

    expect(project).toMatchObject({
      id: 'project-1',
      name: expect.stringMatching(/^moon-project-service-/),
      path: realDirectoryPath
    })
    expect(repository.activeProjectId).toBe('project-1')
    expect(await service.createChangeEvent()).toEqual({
      activeProject: project,
      projects: [project]
    })
  })

  it('returns null when the directory picker is cancelled', async () => {
    const repository = new ProjectsRepositoryMock()
    const service = new ProjectsService({
      pickDirectory: vi.fn(async () => null),
      projectsRepository: repository as never
    })

    await expect(service.useExistingFolder()).resolves.toBeNull()
    expect(repository.projects).toEqual([])
    expect(repository.activeProjectId).toBeNull()
  })
})
