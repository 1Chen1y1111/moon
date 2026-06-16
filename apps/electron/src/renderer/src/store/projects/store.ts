/**
 * 负责创建 renderer 项目 Zustand store。
 * 它组合初始状态和 class-based actions，供项目侧边栏与聊天上下文共享。
 */

import { create, type StateCreator } from 'zustand'

import { flattenActions } from '@renderer/store/flatten-actions'

import { createProjectsSlice, type ProjectsAction, type ProjectsActionImpl } from './actions'
import { createInitialProjectsState, initialProjectsState } from './initial-state'
import type { ProjectsState } from './types'

export type ProjectsStoreState = ProjectsState
export type ProjectsStore = ProjectsStoreState & ProjectsAction
export type { ProjectsAction } from './actions'

const createProjectsStore: StateCreator<ProjectsStore> = (...params) => ({
  ...initialProjectsState,
  ...flattenActions<ProjectsAction>([createProjectsSlice(...params) as ProjectsActionImpl])
})

export const useProjectsStore = create<ProjectsStore>()(createProjectsStore)

/**
 * 重置项目 store，供 renderer 单元测试隔离状态。
 */
export function resetProjectsStore(preloadedState?: Partial<ProjectsStoreState>): void {
  useProjectsStore.setState({
    ...createInitialProjectsState(),
    ...preloadedState
  })
}
