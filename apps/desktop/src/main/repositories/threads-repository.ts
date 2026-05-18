import { asc, eq } from 'drizzle-orm'

import { threadRecordSchema } from '@moon/shared/domain/chat-validation'

import { defaultChatUserId, type ThreadRecord } from '@moon/shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { threads, topics } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class ThreadsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async listBySession(sessionId: string): Promise<ThreadRecord[]> {
    const rows = await this.database.db
      .select({ thread: threads })
      .from(threads)
      .innerJoin(topics, eq(threads.topicId, topics.id))
      .where(eq(topics.sessionId, sessionId))
      .orderBy(asc(threads.createdAt))

    return rows.map((row) => toThreadRecord(row.thread))
  }

  async listByTopic(topicId: string): Promise<ThreadRecord[]> {
    const rows = await this.database.db
      .select()
      .from(threads)
      .where(eq(threads.topicId, topicId))
      .orderBy(asc(threads.createdAt))

    return rows.map(toThreadRecord)
  }

  async findById(id: string): Promise<ThreadRecord | null> {
    const row = await this.database.db
      .select()
      .from(threads)
      .where(eq(threads.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toThreadRecord(row)
  }

  async save(thread: ThreadRecord): Promise<ThreadRecord> {
    const parsedThread = threadRecordSchema.parse(thread)
    const threadValues = normalizeThreadRecord(parsedThread)

    await this.database.db
      .insert(threads)
      .values(threadValues)
      .onConflictDoUpdate({
        target: threads.id,
        set: {
          topicId: threadValues.topicId,
          title: threadValues.title,
          content: threadValues.content,
          editorData: threadValues.editorData,
          type: threadValues.type,
          status: threadValues.status,
          sourceMessageId: threadValues.sourceMessageId,
          parentThreadId: threadValues.parentThreadId,
          clientId: threadValues.clientId,
          agentId: threadValues.agentId,
          groupId: threadValues.groupId,
          metadata: threadValues.metadata,
          userId: threadValues.userId,
          lastActiveAt: threadValues.lastActiveAt,
          updatedAt: threadValues.updatedAt
        }
      })

    return threadRecordSchema.parse(threadValues)
  }
}

function toThreadRecord(thread: typeof threads.$inferSelect): ThreadRecord {
  const { createdAt, lastActiveAt, metadata, updatedAt, ...threadRecord } = thread

  return threadRecordSchema.parse({
    ...threadRecord,
    ...(metadata === null ? {} : { metadata }),
    lastActiveAt: lastActiveAt === null ? null : toIsoTimestamp(lastActiveAt),
    createdAt: toIsoTimestamp(createdAt),
    updatedAt: toIsoTimestamp(updatedAt)
  })
}

function normalizeThreadRecord(thread: ThreadRecord): typeof threads.$inferInsert {
  return {
    ...thread,
    title: thread.title ?? null,
    content: thread.content ?? null,
    type: thread.type,
    status: thread.status ?? 'active',
    sourceMessageId: thread.sourceMessageId ?? null,
    parentThreadId: thread.parentThreadId ?? null,
    clientId: thread.clientId ?? thread.id,
    agentId: thread.agentId ?? null,
    groupId: thread.groupId ?? null,
    userId: thread.userId ?? defaultChatUserId,
    lastActiveAt: thread.lastActiveAt ?? thread.updatedAt
  }
}
