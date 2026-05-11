import Memory from './Memory'
import Model from './Model'
import Search from './Search'
import Skills from './Skills'
import Upload from './Upload'

export const actionMap = {
  fileUpload: Upload,
  memory: Memory,
  model: Model,
  search: Search,
  skills: Skills
} as const

export type ActionKey = keyof typeof actionMap
export type ActionKeys = ActionKey | ActionKey[] | '---'

export const defaultActionKeys: ActionKeys[] = ['model', 'fileUpload', 'search', 'memory', 'skills']
