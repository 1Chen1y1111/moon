/**
 * 负责项目/workspace 的主进程业务编排。
 * 它处理目录选择、路径归一化和 active project 选择，不直接操作 renderer 状态。
 */

import { dialog } from 'electron'
import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  setActiveProjectInputSchema,
  type SetActiveProjectInput
} from '@moon/shared/domain/project-validation'
import type { ProjectRecord, ProjectsChangeEvent } from '@moon/shared/domain/project'
import type { ProjectsRepository } from '../repositories/projects-repository'

type DirectoryPicker = () => Promise<string | null>

type ProjectsServiceDependencies = {
  pickDirectory?: DirectoryPicker
  projectsRepository: ProjectsRepository
}

/**
 * 使用系统目录选择器读取一个现有文件夹路径，取消时返回 null。
 */
async function pickExistingDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })

  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/**
 * 解析并校验项目目录，返回真实路径和可展示名称。
 */
async function resolveProjectDirectory(path: string): Promise<{ name: string; path: string }> {
  const realProjectPath = await realpath(path)
  const projectStats = await stat(realProjectPath)

  if (!projectStats.isDirectory()) {
    throw new Error('Project path must be a directory.')
  }

  return {
    name: basename(realProjectPath) || realProjectPath,
    path: realProjectPath
  }
}

export class ProjectsService {
  private readonly pickDirectory: DirectoryPicker
  private readonly projectsRepository: ProjectsRepository

  /**
   * 保存项目仓储和可替换的目录选择器，方便测试替换 Electron dialog。
   */
  constructor({
    pickDirectory = pickExistingDirectory,
    projectsRepository
  }: ProjectsServiceDependencies) {
    this.pickDirectory = pickDirectory
    this.projectsRepository = projectsRepository
  }

  /**
   * 列出本地项目。
   */
  listProjects(): Promise<ProjectRecord[]> {
    return this.projectsRepository.list()
  }

  /**
   * 读取当前激活项目。
   */
  getActiveProject(): Promise<ProjectRecord | null> {
    return this.projectsRepository.getActiveProject()
  }

  /**
   * 打开系统目录选择器，把选中的现有文件夹保存为项目并设为激活项。
   */
  async useExistingFolder(): Promise<ProjectRecord | null> {
    const selectedPath = await this.pickDirectory()

    if (selectedPath === null) {
      return null
    }

    const directory = await resolveProjectDirectory(selectedPath)
    const project = await this.projectsRepository.upsertByPath(directory)

    await this.projectsRepository.setActiveProjectId(project.id)

    return project
  }

  /**
   * 设置当前激活项目；null 表示切换到未绑定聊天空间。
   */
  async setActiveProject(input: SetActiveProjectInput): Promise<ProjectRecord | null> {
    const parsedInput = setActiveProjectInputSchema.parse(input)

    if (parsedInput.projectId === null) {
      await this.projectsRepository.setActiveProjectId(null)
      return null
    }

    const project = await this.projectsRepository.findById(parsedInput.projectId)

    if (project === null) {
      throw new Error('Project not found.')
    }

    await this.projectsRepository.setActiveProjectId(project.id)

    return project
  }

  /**
   * 生成用于广播给 renderer 的项目状态快照。
   */
  async createChangeEvent(): Promise<ProjectsChangeEvent> {
    const [projects, activeProject] = await Promise.all([
      this.projectsRepository.list(),
      this.projectsRepository.getActiveProject()
    ])

    return { activeProject, projects }
  }
}
