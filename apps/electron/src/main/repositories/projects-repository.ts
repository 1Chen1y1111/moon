/**
 * 负责本地项目记录和当前激活项目的持久化读写。
 * 它只处理 projects 表和项目相关 settings key，不访问 Electron dialog 或 renderer 状态。
 */

import { randomUUID } from 'node:crypto'

import { desc, eq } from 'drizzle-orm'

import { projectRecordSchema } from '@moon/shared/domain/project-validation'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type { AppDatabaseConnection } from '../db/connection'
import { projects, settings as settingsTable } from '../db/schema'
import { toIsoTimestamp } from '../db/timestamps'

const activeProjectSettingKey = 'projects.activeProjectId'

type ProjectSaveInput = {
  name: string
  path: string
}

/**
 * 把数据库行转换成跨进程使用的项目记录。
 */
function toProjectRecord(project: typeof projects.$inferSelect): ProjectRecord {
  return {
    ...project,
    createdAt: toIsoTimestamp(project.createdAt),
    updatedAt: toIsoTimestamp(project.updatedAt)
  }
}

export class ProjectsRepository {
  /**
   * 保存数据库连接，后续方法只通过该连接访问项目和设置表。
   */
  constructor(private readonly database: AppDatabaseConnection) {}

  /**
   * 按更新时间倒序列出本地项目。
   */
  async list(): Promise<ProjectRecord[]> {
    const rows = await this.database.db.select().from(projects).orderBy(desc(projects.updatedAt))

    return rows.map(toProjectRecord)
  }

  /**
   * 按项目 id 查找记录，找不到时返回 null。
   */
  async findById(id: string): Promise<ProjectRecord | null> {
    const row = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .then((rows) => rows[0])

    return row === undefined ? null : toProjectRecord(row)
  }

  /**
   * 按真实目录路径查找项目，路径去重逻辑依赖 projects.path 唯一约束。
   */
  async findByPath(path: string): Promise<ProjectRecord | null> {
    const row = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.path, path))
      .then((rows) => rows[0])

    return row === undefined ? null : toProjectRecord(row)
  }

  /**
   * 按项目 id 删除本地项目记录；关联会话由数据库外键转为未绑定项目。
   */
  async deleteById(id: string): Promise<void> {
    await this.database.db.delete(projects).where(eq(projects.id, id))

    if ((await this.getActiveProjectId()) === id) {
      await this.setActiveProjectId(null)
    }
  }

  /**
   * 按路径新增或更新项目，并返回最终持久化记录。
   */
  async upsertByPath(input: ProjectSaveInput): Promise<ProjectRecord> {
    const timestamp = new Date().toISOString()
    const project = projectRecordSchema.parse({
      id: randomUUID(),
      path: input.path,
      name: input.name,
      createdAt: timestamp,
      updatedAt: timestamp
    })

    await this.database.db
      .insert(projects)
      .values(project)
      .onConflictDoUpdate({
        target: projects.path,
        set: {
          name: project.name,
          updatedAt: project.updatedAt
        }
      })

    const savedProject = await this.findByPath(project.path)

    if (savedProject === null) {
      throw new Error(`Project was not saved: ${project.path}`)
    }

    return savedProject
  }

  /**
   * 读取当前激活项目 id；返回 null 表示用户处于未绑定聊天空间。
   */
  async getActiveProjectId(): Promise<string | null> {
    const row = await this.database.db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, activeProjectSettingKey))
      .then((rows) => rows[0])

    return row?.value ?? null
  }

  /**
   * 持久化当前激活项目 id；null 会进入未绑定聊天空间。
   */
  async setActiveProjectId(projectId: string | null): Promise<void> {
    const updatedAt = new Date().toISOString()

    if (projectId === null) {
      await this.database.db
        .delete(settingsTable)
        .where(eq(settingsTable.key, activeProjectSettingKey))
      return
    }

    await this.database.db
      .insert(settingsTable)
      .values({
        key: activeProjectSettingKey,
        value: projectId,
        updatedAt
      })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: {
          value: projectId,
          updatedAt
        }
      })
  }

  /**
   * 读取当前激活项目记录，配置指向失效项目时返回 null。
   */
  async getActiveProject(): Promise<ProjectRecord | null> {
    const activeProjectId = await this.getActiveProjectId()

    return activeProjectId === null ? null : this.findById(activeProjectId)
  }
}
