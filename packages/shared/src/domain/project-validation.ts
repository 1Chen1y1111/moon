/**
 * 负责定义项目/workspace 相关 IPC 输入和记录的运行时校验规则。
 * 它只校验跨进程数据形状，不访问文件系统或持久化层。
 */

import { z } from 'zod'

export const projectRecordSchema = z.object({
  id: z.string().min(1),
  path: z.string().trim().min(1),
  name: z.string().trim().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const setActiveProjectInputSchema = z.object({
  projectId: z.string().trim().min(1).nullable()
})

export type SetActiveProjectInput = z.infer<typeof setActiveProjectInputSchema>

export const deleteProjectInputSchema = z.object({
  projectId: z.string().trim().min(1)
})

export type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>
