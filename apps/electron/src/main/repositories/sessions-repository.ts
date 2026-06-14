import { randomUUID } from 'node:crypto'

import { desc, eq } from 'drizzle-orm'

import { sessionRecordSchema } from '@moon/shared/domain/chat-validation'

import { defaultChatUserId, type SessionRecord } from '@moon/shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { sessions } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

type PersistedSessionRecord = SessionRecord & {
  avatar: string | null
  backgroundColor: string | null
  clientId: string | null
  description: string | null
  groupId: string | null
  pinned: boolean
  slug: string
  title: string | null
  type: NonNullable<SessionRecord['type']>
  userId: string
}

export class SessionsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async list(): Promise<SessionRecord[]> {
    const rows = await this.database.db.select().from(sessions).orderBy(desc(sessions.updatedAt))

    return rows.map(toSessionRecord)
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await this.database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toSessionRecord(row)
  }

  async deleteById(id: string): Promise<void> {
    await this.database.db.delete(sessions).where(eq(sessions.id, id))
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const parsedSession = sessionRecordSchema.parse(session)
    const sessionValues = normalizeSessionRecord(parsedSession)

    await this.database.db
      .insert(sessions)
      .values(sessionValues)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          slug: sessionValues.slug,
          projectId: sessionValues.projectId,
          provider: sessionValues.provider,
          title: sessionValues.title,
          description: sessionValues.description,
          avatar: sessionValues.avatar,
          backgroundColor: sessionValues.backgroundColor,
          type: sessionValues.type,
          status: sessionValues.status,
          userId: sessionValues.userId,
          groupId: sessionValues.groupId,
          clientId: sessionValues.clientId,
          pinned: sessionValues.pinned,
          updatedAt: sessionValues.updatedAt
        }
      })

    return sessionValues
  }
}

function toSessionRecord(session: typeof sessions.$inferSelect): SessionRecord {
  return {
    ...session,
    createdAt: toIsoTimestamp(session.createdAt),
    updatedAt: toIsoTimestamp(session.updatedAt)
  }
}

function createSessionSlug(): string {
  return randomUUID().slice(0, 8)
}

function normalizeSessionRecord(session: SessionRecord): PersistedSessionRecord {
  return {
    ...session,
    slug: session.slug ?? createSessionSlug(),
    title: session.title ?? null,
    description: session.description ?? null,
    avatar: session.avatar ?? null,
    backgroundColor: session.backgroundColor ?? null,
    type: session.type ?? 'agent',
    userId: session.userId ?? defaultChatUserId,
    groupId: session.groupId ?? null,
    clientId: session.clientId ?? session.id,
    pinned: session.pinned ?? false
  }
}
