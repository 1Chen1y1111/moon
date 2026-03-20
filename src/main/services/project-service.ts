import type { ProjectRecord } from '../ipc/contracts'
import type { ProjectsRepository } from '../repositories/projects-repository'

export class ProjectService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  listProjects(): ProjectRecord[] {
    return this.projectsRepository.list()
  }

  saveProject(project: ProjectRecord): ProjectRecord {
    return this.projectsRepository.save(project)
  }
}
