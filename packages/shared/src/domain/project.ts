/**
 * 负责定义本地项目/workspace 的共享领域类型。
 * 它只描述跨进程传输的数据结构，不包含 Electron dialog、数据库或 renderer 状态逻辑。
 */

export type ProjectRecord = {
  id: string
  path: string
  name: string
  createdAt: string
  updatedAt: string
}

export type ProjectsChangeEvent = {
  activeProject: ProjectRecord | null
  projects: ProjectRecord[]
}
