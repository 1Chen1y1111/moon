// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { bootstrapDatabase } from '@main/db/bootstrap'
import { createDatabaseConnection } from '@main/db/connection'
import { MessagesRepository } from '@main/repositories/messages-repository'
import { SessionsRepository } from '@main/repositories/sessions-repository'

describe('MessagesRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    for (const directoryPath of tempDirectories.splice(0)) {
      rmSync(directoryPath, { recursive: true, force: true })
    }
  })

  it('indexes saved messages for SQLite FTS search', () => {
    const directoryPath = mkdtempSync(join(tmpdir(), 'moon-messages-repository-'))
    tempDirectories.push(directoryPath)
    const connection = createDatabaseConnection(join(directoryPath, 'moon.sqlite'))
    bootstrapDatabase(connection)

    new SessionsRepository(connection).save({
      id: 'session-1',
      projectId: null,
      provider: 'claude',
      title: 'Search Test',
      status: 'active',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z'
    })

    const repository = new MessagesRepository(connection)

    repository.save({
      id: 'message-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'Moon can search local conversation history.',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z'
    })

    expect(repository.search('conversation')).toEqual([
      {
        messageId: 'message-1',
        sessionId: 'session-1',
        content: 'Moon can search local conversation history.'
      }
    ])

    connection.close()
  })
})
