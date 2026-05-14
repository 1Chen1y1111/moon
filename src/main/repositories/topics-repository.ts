import { asc, eq } from 'drizzle-orm'

import { topicRecordSchema } from '@shared/domain/chat-validation'

import { defaultChatUserId, type TopicRecord } from '../../shared/domain/chat'
import type { AppDatabaseConnection } from '../db/connection'
import { topics } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

export class TopicsRepository {
  constructor(private readonly database: AppDatabaseConnection) {}

  async listBySession(sessionId: string): Promise<TopicRecord[]> {
    const rows = await this.database.db
      .select()
      .from(topics)
      .where(eq(topics.sessionId, sessionId))
      .orderBy(asc(topics.createdAt))

    return rows.map(toTopicRecord)
  }

  async findById(id: string): Promise<TopicRecord | null> {
    const row = await this.database.db
      .select()
      .from(topics)
      .where(eq(topics.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toTopicRecord(row)
  }

  async save(topic: TopicRecord): Promise<TopicRecord> {
    const parsedTopic = topicRecordSchema.parse(topic)
    const topicValues = normalizeTopicRecord(parsedTopic)

    await this.database.db
      .insert(topics)
      .values(topicValues)
      .onConflictDoUpdate({
        target: topics.id,
        set: {
          sessionId: topicValues.sessionId,
          title: topicValues.title,
          favorite: topicValues.favorite,
          content: topicValues.content,
          editorData: topicValues.editorData,
          agentId: topicValues.agentId,
          groupId: topicValues.groupId,
          userId: topicValues.userId,
          clientId: topicValues.clientId,
          description: topicValues.description,
          historySummary: topicValues.historySummary,
          metadata: topicValues.metadata,
          trigger: topicValues.trigger,
          mode: topicValues.mode,
          status: topicValues.status,
          completedAt: topicValues.completedAt,
          updatedAt: topicValues.updatedAt
        }
      })

    return topicValues
  }
}

function toTopicRecord(topic: typeof topics.$inferSelect): TopicRecord {
  const { completedAt, createdAt, metadata, updatedAt, ...topicRecord } = topic

  return topicRecordSchema.parse({
    ...topicRecord,
    ...(metadata === null ? {} : { metadata }),
    completedAt: completedAt === null ? null : toIsoTimestamp(completedAt),
    createdAt: toIsoTimestamp(createdAt),
    updatedAt: toIsoTimestamp(updatedAt)
  })
}

function normalizeTopicRecord(topic: TopicRecord) {
  return {
    ...topic,
    sessionId: topic.sessionId ?? null,
    title: topic.title ?? null,
    favorite: topic.favorite ?? false,
    content: topic.content ?? null,
    agentId: topic.agentId ?? null,
    groupId: topic.groupId ?? null,
    userId: topic.userId ?? defaultChatUserId,
    clientId: topic.clientId ?? topic.id,
    description: topic.description ?? null,
    historySummary: topic.historySummary ?? null,
    trigger: topic.trigger ?? 'chat',
    mode: topic.mode ?? 'default',
    status: topic.status ?? 'active',
    completedAt: topic.completedAt ?? null
  }
}
