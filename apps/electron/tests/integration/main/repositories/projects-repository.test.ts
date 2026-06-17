// @vitest-environment node

/**
 * 负责验证 ProjectsRepository 的 PGlite 持久化行为。
 * 测试覆盖项目路径去重和 active project 设置，不触发 Electron dialog。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '@main/db/connection'
import { ProjectsRepository } from '@main/repositories/projects-repository'

const pgliteTestTimeout = 30_000

async function createBootstrappedConnection(directoryPath: string): Promise<AppDatabaseConnection> {
  const connection = await createDatabaseConnection(join(directoryPath, 'moon-pglite'))

  await bootstrapDatabase(connection)

  return connection
}

describe('ProjectsRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it(
    'upserts projects by path and persists the active project id',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-projects-repository-'))
      tempDirectories.push(directoryPath)
      const connection = await createBootstrappedConnection(directoryPath)
      const repository = new ProjectsRepository(connection)

      const firstProject = await repository.upsertByPath({
        name: 'moon',
        path: '/workspace/moon'
      })
      const secondProject = await repository.upsertByPath({
        name: 'Moon Renamed',
        path: '/workspace/moon'
      })

      expect(secondProject.id).toBe(firstProject.id)
      expect(secondProject.name).toBe('Moon Renamed')
      expect(await repository.list()).toHaveLength(1)

      await repository.setActiveProjectId(secondProject.id)

      expect(await repository.getActiveProject()).toMatchObject({
        id: secondProject.id,
        path: '/workspace/moon',
        name: 'Moon Renamed'
      })

      await repository.setActiveProjectId(null)

      expect(await repository.getActiveProjectId()).toBeNull()
      expect(await repository.getActiveProject()).toBeNull()

      await repository.setActiveProjectId(secondProject.id)
      await repository.deleteById(secondProject.id)

      expect(await repository.list()).toEqual([])
      expect(await repository.getActiveProjectId()).toBeNull()

      await connection.close()
    },
    pgliteTestTimeout
  )
})
