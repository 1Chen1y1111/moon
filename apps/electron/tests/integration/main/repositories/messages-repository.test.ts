// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@moon/server/db/bootstrap'
import { createDatabaseConnection, type AppDatabaseConnection } from '@moon/server/db/connection'
import { MessagesRepository } from '@moon/server/repositories/messages-repository'
import { SessionsRepository } from '@moon/server/repositories/sessions-repository'
import { ThreadsRepository } from '@moon/server/repositories/threads-repository'
import { TopicsRepository } from '@moon/server/repositories/topics-repository'

const pgliteTestTimeout = 30_000

async function createBootstrappedConnection(directoryPath: string): Promise<AppDatabaseConnection> {
  const connection = await createDatabaseConnection(join(directoryPath, 'moon-pglite'))

  await bootstrapDatabase(connection)

  return connection
}

async function createSessionScope(connection: AppDatabaseConnection): Promise<void> {
  await new SessionsRepository(connection).save({
    id: 'session-1',
    projectId: null,
    provider: 'claude',
    title: 'Search Test',
    status: 'active',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z'
  })
  await new TopicsRepository(connection).save({
    id: 'topic-1',
    sessionId: 'session-1',
    title: '默认话题',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z'
  })
  await new ThreadsRepository(connection).save({
    id: 'thread-1',
    topicId: 'topic-1',
    title: '主线',
    type: 'standalone',
    status: 'active',
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z'
  })
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

      await createSessionScope(connection)

      expect(await new SessionsRepository(connection).list()).toEqual([
        expect.objectContaining({
          id: 'session-1',
          projectId: null,
          provider: 'claude',
          title: 'Search Test',
          status: 'active',
          type: 'agent',
          userId: 'local-user',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        })
      ])

      const repository = new MessagesRepository(connection)

      await repository.save({
        id: 'message-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Moon can search local conversation history.',
        status: 'complete',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z'
      })

      expect(await repository.list()).toEqual([
        expect.objectContaining({
          id: 'message-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          role: 'assistant',
          content: 'Moon can search local conversation history.',
          status: 'complete',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        })
      ])

      expect(await repository.search('conversation')).toEqual([
        {
          messageId: 'message-1',
          sessionId: 'session-1',
          threadId: 'thread-1',
          content: 'Moon can search local conversation history.'
        }
      ])

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'rejects unsupported session statuses before writing',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-messages-repository-'))
      tempDirectories.push(directoryPath)
      const connection = await createBootstrappedConnection(directoryPath)
      const repository = new SessionsRepository(connection)

      await expect(
        repository.save({
          id: 'session-1',
          projectId: null,
          provider: 'claude',
          title: 'Invalid Status Test',
          status: 'paused',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        } as never)
      ).rejects.toThrow()

      expect(await repository.list()).toEqual([])

      await connection.close()
    },
    pgliteTestTimeout
  )

  it(
    'rejects unsupported message roles before writing',
    async () => {
      const directoryPath = mkdtempSync(join(tmpdir(), 'moon-messages-repository-'))
      tempDirectories.push(directoryPath)
      const connection = await createBootstrappedConnection(directoryPath)

      await createSessionScope(connection)

      const repository = new MessagesRepository(connection)

      await expect(
        repository.save({
          id: 'message-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          threadId: 'thread-1',
          role: 'developer',
          content: 'This role is not part of the persisted chat domain.',
          status: 'complete',
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        } as never)
      ).rejects.toThrow()

      expect(await repository.list()).toEqual([])

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

      await createSessionScope(connection)

      const repository = new MessagesRepository(connection)

      await repository.save({
        id: 'message-1',
        sessionId: 'session-1',
        topicId: 'topic-1',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'This message belongs to a session.',
        status: 'complete',
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
