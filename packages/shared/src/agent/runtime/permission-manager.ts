/**
 * 负责 agent backend 运行时共享的 workspace 路径边界校验。
 * 它只做纯路径计算，不执行文件系统或命令副作用。
 */

import { isAbsolute, relative, resolve } from 'node:path'

/**
 * 将工具传入路径解析到 workspace 内的绝对路径。
 */
export function resolveWorkspacePath(workspacePath: string, inputPath = '.'): string {
  const normalizedInputPath = inputPath.trim() || '.'

  return isAbsolute(normalizedInputPath)
    ? resolve(normalizedInputPath)
    : resolve(workspacePath, normalizedInputPath)
}

/**
 * 判断目标路径是否仍位于 workspace 根目录内。
 */
export function isPathInsideWorkspace(workspacePath: string, targetPath: string): boolean {
  const relativePath = relative(resolve(workspacePath), resolve(targetPath))

  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}
