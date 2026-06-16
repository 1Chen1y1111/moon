/**
 * 负责定义 renderer 项目状态的本地 store 结构。
 * 它只描述 UI 侧缓存和请求状态，不定义 IPC 合同或数据库结构。
 */

import type { ProjectRecord } from '@moon/shared/domain/project'

export type ProjectsState = {
  activeProject: ProjectRecord | null
  error: string | null
  loadStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  projects: ProjectRecord[]
  saveStatus: 'idle' | 'saving' | 'succeeded' | 'failed'
}
