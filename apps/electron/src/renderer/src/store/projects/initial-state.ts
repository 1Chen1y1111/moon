/**
 * 负责创建项目 store 的初始状态。
 * 初始状态保持未加载，等待 AppProviders 或页面触发首次 IPC 读取。
 */

import type { ProjectsState } from './types'

/**
 * 创建一份新的项目 store 初始状态，避免测试之间共享引用。
 */
export function createInitialProjectsState(): ProjectsState {
  return {
    activeProject: null,
    error: null,
    loadStatus: 'idle',
    projects: [],
    saveStatus: 'idle'
  }
}

export const initialProjectsState = createInitialProjectsState()
