/**
 * 负责实现项目 store 的异步动作和状态写入。
 * 它只通过 window.api.projects 访问主进程，不直接触碰文件系统或数据库。
 */

import type { ProjectRecord, ProjectsChangeEvent } from '@moon/shared/domain/project'
import type { SetActiveProjectInput } from '@moon/shared/domain/project-validation'

import type { StoreSetter } from '@renderer/store/types'

import type { ProjectsStore } from './store'
import type { ProjectsState } from './types'

type Setter = StoreSetter<ProjectsStore>

/**
 * 把未知异常归一化为适合 UI 展示的短错误文本。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '项目操作失败'
}

export class ProjectsActionImpl {
  readonly #set: Setter

  /**
   * 保存 Zustand set 函数；项目 store 不需要读取其他 action 状态。
   */
  constructor(set: Setter, _get: () => ProjectsStore, _api?: unknown) {
    void _get
    void _api
    this.#set = set
  }

  /**
   * 应用主进程广播的项目快照。
   */
  applyProjectsChange = (event: ProjectsChangeEvent): void => {
    this.internal_applyProjectsChange(event)
  }

  /**
   * 首次读取项目列表和当前激活项目。
   */
  loadProjects = (): Promise<ProjectsChangeEvent> => this.internal_loadProjects()

  /**
   * 通过系统目录选择器添加已有文件夹。
   */
  useExistingProjectFolder = (): Promise<ProjectRecord | null> =>
    this.internal_useExistingProjectFolder()

  /**
   * 设置当前激活项目；null 表示切到未绑定聊天空间。
   */
  setActiveProject = (input: SetActiveProjectInput): Promise<ProjectRecord | null> =>
    this.internal_setActiveProject(input)

  internal_applyProjectsChange = (event: ProjectsChangeEvent): void => {
    this.internal_dispatchProjects({
      activeProject: event.activeProject,
      error: null,
      loadStatus: 'succeeded',
      projects: event.projects
    })
  }

  internal_loadProjects = async (): Promise<ProjectsChangeEvent> => {
    this.internal_dispatchProjects({ loadStatus: 'loading', error: null })

    try {
      const [projects, activeProject] = await Promise.all([
        window.api.projects.list(),
        window.api.projects.getActive()
      ])
      const event = { activeProject, projects }

      this.internal_applyProjectsChange(event)

      return event
    } catch (error) {
      this.internal_dispatchProjects({ loadStatus: 'failed', error: getErrorMessage(error) })
      throw error
    }
  }

  internal_useExistingProjectFolder = async (): Promise<ProjectRecord | null> => {
    this.internal_dispatchProjects({ saveStatus: 'saving', error: null })

    try {
      const project = await window.api.projects.useExistingFolder()

      if (project !== null) {
        await this.internal_loadProjects()
      }

      this.internal_dispatchProjects({ saveStatus: 'succeeded' })

      return project
    } catch (error) {
      this.internal_dispatchProjects({ saveStatus: 'failed', error: getErrorMessage(error) })
      throw error
    }
  }

  internal_setActiveProject = async (
    input: SetActiveProjectInput
  ): Promise<ProjectRecord | null> => {
    this.internal_dispatchProjects({ saveStatus: 'saving', error: null })

    try {
      const activeProject = await window.api.projects.setActive(input)

      this.internal_dispatchProjects({ activeProject, saveStatus: 'succeeded' })

      return activeProject
    } catch (error) {
      this.internal_dispatchProjects({ saveStatus: 'failed', error: getErrorMessage(error) })
      throw error
    }
  }

  internal_dispatchProjects = (state: Partial<ProjectsState>): void => {
    this.#set(state)
  }
}

export type ProjectsAction = Pick<ProjectsActionImpl, keyof ProjectsActionImpl>

/**
 * 创建项目 action 实例，保持与其他 Zustand slice 的 class-based 约定一致。
 */
export const createProjectsSlice = (
  set: Setter,
  get: () => ProjectsStore,
  api?: unknown
): ProjectsActionImpl => new ProjectsActionImpl(set, get, api)
