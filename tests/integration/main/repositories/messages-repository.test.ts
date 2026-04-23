// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '@main/db/connection'
import { MessagesRepository } from '@main/repositories/messages-repository'
import { SessionsRepository } from '@main/repositories/sessions-repository'

const pgliteTestTimeout = 30_000

async function createBootstrappedConnection(directoryPath: string): Promise<AppDatabaseConnection> {
  const connection = await createDatabaseConnection(join(directoryPath, 'moon-pglite'))

  await bootstrapDatabase(connection)

  return connection
}

describe('MessagesRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it(
    'indexes saved messages for PostgreSQL full text search',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-messages-repository-'))
      tempDirectories.push(directoryPath)
      const connection = await createBootstrappedConnection(directoryPath)

      await new SessionsRepository(connection).save({
        id: 'session-1',
        projectId: null,
        provider: 'claude',
        title: 'Search Test',
        status: 'active',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z'
      })

      expect(await new SessionsRepository(connection).list()).toEqual([
        {
          id: 'session-1',
          projectId: null,
          provider: 'claude',
          title: 'Search Test',
          status: 'active',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      ])

      const repository = new MessagesRepository(connection)

      await repository.save({
        id: 'message-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Moon can search local conversation history.',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z'
      })

      expect(await repository.list()).toEqual([
        {
          id: 'message-1',
          sessionId: 'session-1',
          role: 'assistant',
          content: 'Moon can search local conversation history.',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      ])

      expect(await repository.search('conversation')).toEqual([
        {
          messageId: 'message-1',
          sessionId: 'session-1',
          content: 'Moon can search local conversation history.'
        }
      ])

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'cascades messages when their session is deleted',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-messages-repository-'))
      tempDirectories.push(directoryPath)
      const connection = await createBootstrappedConnection(directoryPath)

      await new SessionsRepository(connection).save({
        id: 'session-1',
        projectId: null,
        provider: 'claude',
        title: 'Cascade Test',
        status: 'active',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z'
      })

      const repository = new MessagesRepository(connection)

      await repository.save({
        id: 'message-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'This message belongs to a session.',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z'
      })

      await connection.client.query('DELETE FROM sessions WHERE id = $1', ['session-1'])

      expect(await repository.list()).toEqual([])

      await connection.close()
    },
    pgliteTestTimeout
  )
})
