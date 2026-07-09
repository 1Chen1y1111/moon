// @vitest-environment node

/**
 * 负责验证 SessionAttachmentRuntime 的附件导入文件系统边界。
 * 测试只覆盖附件目录写入和附件记录生成，不经过 IPC 或完整 SessionManager。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SessionAttachmentRuntime } from '@moon/server-core/sessions/session-attachment-runtime'

const tempDirectories: string[] = []

/**
 * 创建本测试独占的临时附件目录路径。
 */
async function createAttachmentsDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'moon-session-attachments-'))

  tempDirectories.push(directory)

  return join(directory, 'attachments')
}

/**
 * 清理测试创建的临时目录。
 */
afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

describe('SessionAttachmentRuntime', () => {
  it('imports a regular file attachment and writes bytes to the attachment directory', async () => {
    const attachmentsDirectory = await createAttachmentsDirectory()
    const runtime = new SessionAttachmentRuntime({ attachmentsDirectory })
    const data = new TextEncoder().encode('hello moon')

    const attachment = await runtime.importAttachment({
      name: 'note.txt',
      mimeType: 'text/plain',
      size: data.byteLength,
      data
    })

    await expect(readFile(join(attachmentsDirectory, attachment.id), 'utf8')).resolves.toBe(
      'hello moon'
    )
    expect(attachment).toMatchObject({
      name: 'note.txt',
      mimeType: 'text/plain',
      size: data.byteLength,
      kind: 'file'
    })
    expect(attachment.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(Number.isNaN(Date.parse(attachment.createdAt))).toBe(false)
  })

  it('marks image MIME types as image attachments', async () => {
    const attachmentsDirectory = await createAttachmentsDirectory()
    const runtime = new SessionAttachmentRuntime({ attachmentsDirectory })
    const data = new Uint8Array([1, 2, 3])

    const attachment = await runtime.importAttachment({
      name: 'diagram.png',
      mimeType: 'image/png',
      size: data.byteLength,
      data
    })

    expect(attachment.kind).toBe('image')
    await expect(readFile(join(attachmentsDirectory, attachment.id))).resolves.toEqual(
      Buffer.from([1, 2, 3])
    )
  })

  it('writes only the byte range covered by an ArrayBufferView', async () => {
    const attachmentsDirectory = await createAttachmentsDirectory()
    const runtime = new SessionAttachmentRuntime({ attachmentsDirectory })
    const source = new Uint8Array([0, 10, 20, 30, 40])
    const view = new Uint8Array(source.buffer, 1, 3)

    const attachment = await runtime.importAttachment({
      name: 'slice.bin',
      mimeType: 'application/octet-stream',
      size: view.byteLength,
      data: view
    })

    await expect(readFile(join(attachmentsDirectory, attachment.id))).resolves.toEqual(
      Buffer.from([10, 20, 30])
    )
  })

  it('creates the attachment directory when it does not exist', async () => {
    const attachmentsDirectory = join(await createAttachmentsDirectory(), 'nested')
    const runtime = new SessionAttachmentRuntime({ attachmentsDirectory })
    const data = new Uint8Array([7])

    const attachment = await runtime.importAttachment({
      name: 'missing-dir.txt',
      mimeType: 'text/plain',
      size: data.byteLength,
      data
    })

    await expect(readFile(join(attachmentsDirectory, attachment.id))).resolves.toEqual(
      Buffer.from([7])
    )
  })
})
