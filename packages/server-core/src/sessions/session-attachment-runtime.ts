/**
 * 负责聊天附件导入的文件系统边界。
 * 它只把 renderer 传入的二进制数据落到附件目录，并生成聊天域附件记录。
 */

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  ChatAttachmentKind,
  ChatAttachmentRecord
} from '@moon/shared/domain/chat'
import type { ImportChatAttachmentInput } from '@moon/shared/domain/chat-validation'

export type SessionAttachmentRuntimeInput = {
  attachmentsDirectory: string
}

export type SessionAttachmentRuntimeImportInput = ImportChatAttachmentInput

/**
 * 根据 MIME 类型确定附件在聊天域里的粗粒度类型。
 */
function resolveAttachmentKind(mimeType: string): ChatAttachmentKind {
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

/**
 * 把 renderer 传入的二进制附件数据转换成 Node Buffer。
 */
function toBuffer(data: ArrayBuffer | ArrayBufferView): Buffer {
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

/**
 * 管理附件导入时的目录创建、文件写入和附件记录生成。
 */
export class SessionAttachmentRuntime {
  private readonly attachmentsDirectory: string

  /**
   * 注入附件目录；后续模型读取附件时复用同一个目录。
   */
  constructor({ attachmentsDirectory }: SessionAttachmentRuntimeInput) {
    this.attachmentsDirectory = attachmentsDirectory
  }

  /**
   * 把附件数据写入附件目录，并返回可挂到消息上的附件记录。
   */
  async importAttachment(
    input: SessionAttachmentRuntimeImportInput
  ): Promise<ChatAttachmentRecord> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()

    await mkdir(this.attachmentsDirectory, { recursive: true })
    await writeFile(join(this.attachmentsDirectory, id), toBuffer(input.data))

    return {
      id,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      kind: resolveAttachmentKind(input.mimeType),
      createdAt
    }
  }
}
