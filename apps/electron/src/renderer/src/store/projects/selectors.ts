/**
 * 负责提供项目 store 的稳定选择器。
 * 组件通过这些函数读取状态，避免散落字段访问。
 */

import type { ProjectRecord } from '@moon/shared/domain/project'

import type { ProjectsState } from './types'

/**
 * 选择全部本地项目。
 */
export function selectProjects(state: ProjectsState): ProjectRecord[] {
  return state.projects
}

/**
 * 选择当前激活项目，null 表示未绑定聊天空间。
 */
export function selectActiveProject(state: ProjectsState): ProjectRecord | null {
  return state.activeProject
}

/**
 * 选择项目加载状态。
 */
export function selectProjectsLoadStatus(state: ProjectsState): ProjectsState['loadStatus'] {
  return state.loadStatus
}

/**
 * 选择项目保存状态。
 */
export function selectProjectsSaveStatus(state: ProjectsState): ProjectsState['saveStatus'] {
  return state.saveStatus
}

/**
 * 选择项目操作错误。
 */
export function selectProjectsError(state: ProjectsState): string | null {
  return state.error
}
