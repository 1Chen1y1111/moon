/**
 * 提供 Moon headless workspace server 的最小命令行启动入口。
 * 该入口只读取环境变量并打印 WebSocket URL，不提供配置 UI 或远程认证。
 */

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMoonWorkspaceServer } from './bootstrap/workspace-server'

const packageSourceDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = join(packageSourceDir, '../../..')
const defaultStateDir = join(repositoryRoot, '.moon-server')

/**
 * 从环境变量读取可选端口，未配置时使用随机端口。
 */
function readPort(): number | undefined {
  const rawPort = process.env.MOON_SERVER_PORT?.trim()

  if (!rawPort) {
    return undefined
  }

  const port = Number(rawPort)

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid MOON_SERVER_PORT: ${rawPort}`)
  }

  return port
}

/**
 * 启动 headless server，并注册进程信号清理。
 */
async function main(): Promise<void> {
  const dataDir = process.env.MOON_SERVER_DATA_DIR ?? join(defaultStateDir, 'pglite')
  const attachmentsDirectory =
    process.env.MOON_SERVER_ATTACHMENTS_DIR ?? join(defaultStateDir, 'attachments')
  const migrationsFolder =
    process.env.MOON_SERVER_MIGRATIONS_DIR ?? join(repositoryRoot, 'apps/electron/drizzle')

  await mkdir(attachmentsDirectory, { recursive: true })

  const server = await startMoonWorkspaceServer({
    attachmentsDirectory,
    dataDir,
    host: process.env.MOON_SERVER_HOST,
    migrationsFolder,
    port: readPort()
  })

  console.log(`Moon workspace server listening on ${server.url}`)

  const shutdown = async (): Promise<void> => {
    await server.close()
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown()
  })
  process.once('SIGTERM', () => {
    void shutdown()
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
