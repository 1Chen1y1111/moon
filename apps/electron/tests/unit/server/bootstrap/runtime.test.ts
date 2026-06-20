// @vitest-environment node

/**
 * 负责验证 @moon/server 的本地 runtime factory 能组合数据库、仓储和 ChatService。
 * 测试使用 PGlite memory 数据库，不启动 Electron 或 WebSocket。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createMoonServerRuntime, type MoonServerRuntime } from '@moon/server'

const migrationsFolder = join(process.cwd(), 'drizzle')

let runtime: MoonServerRuntime | null = null
let attachmentsDirectory: string | null = null

/**
 * 为 runtime 测试创建临时附件目录。
 */
async function createAttachmentsDirectory(): Promise<string> {
  attachmentsDirectory = await mkdtemp(join(tmpdir(), 'moon-server-attachments-'))
  return attachmentsDirectory
}

describe('createMoonServerRuntime', () => {
  afterEach(async () => {
    await runtime?.close()
    runtime = null

    if (attachmentsDirectory !== null) {
      await rm(attachmentsDirectory, { force: true, recursive: true })
      attachmentsDirectory = null
    }
  })

  it('creates local repositories and ChatService on top of PGlite', async () => {
    runtime = await createMoonServerRuntime({
      attachmentsDirectory: await createAttachmentsDirectory(),
      dataDir: 'memory://',
      migrationsFolder
    })

    await expect(runtime.chatService.listSessions()).resolves.toEqual([])
    await expect(runtime.settingsRepository.getSettings()).resolves.toMatchObject({
      providers: expect.any(Object)
    })
    await expect(runtime.projectsRepository.list()).resolves.toEqual([])
  })

  it('closes the database connection idempotently', async () => {
    runtime = await createMoonServerRuntime({
      attachmentsDirectory: await createAttachmentsDirectory(),
      dataDir: 'memory://',
      migrationsFolder
    })

    await expect(runtime.close()).resolves.toBeUndefined()
    await expect(runtime.close()).resolves.toBeUndefined()
    runtime = null
  })
})
