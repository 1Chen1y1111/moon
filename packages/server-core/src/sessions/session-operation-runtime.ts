/**
 * 负责执行已经启动的单次 agent operation。
 * 它处理 lineage 历史、backend 输入构造、事件流消费与资源释放，不拥有会话创建或取消入口。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  createAgentBackendMessage,
  type AgentBackendMessage,
  type AgentBackendWorkspace,
  type MessageAttachment
} from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  ChatOperationEvent,
  MessageRecord,
  SendMessageResult
} from '@moon/shared/domain/chat'
import type { SessionEventRouteHint } from './handlers'
import {
  type SessionAgentEventApplier,
  type SessionSourceActivationSignal
} from './session-agent-event-applier'
import type { SessionAgentRuntime, SessionSourceProviderScope } from './session-agent-runtime'
import type {
  AgentOperationsRepositoryPort,
  MessagesRepositoryPort,
  SessionsRepositoryPort,
  ThreadsRepositoryPort
} from './session-manager'
import type { SessionToolPermissionRuntime } from './session-tool-permission-runtime'
import { listSessionThreadHistory } from './session-thread-history'

export type SessionOperationRuntimeInput = {
  agentEventApplier: SessionAgentEventApplier
  agentOperationsRepository: AgentOperationsRepositoryPort
  agentRuntime: SessionAgentRuntime
  attachmentsDirectory: string
  messagesRepository: MessagesRepositoryPort
  sessionsRepository: SessionsRepositoryPort
  threadsRepository: ThreadsRepositoryPort
  toolPermissionRuntime: SessionToolPermissionRuntime
}

export type SessionOperationRuntimeExecuteInput = {
  abortSignal: AbortSignal
  assistantMessage: MessageRecord
  connection: NormalizedLlmConnection
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
  operation: AgentOperationRecord
  routeHint?: SessionEventRouteHint
  scope: SessionSourceProviderScope
}

export type SessionOperationRuntimeExecuteResult = SendMessageResult & {
  sourceActivation: SessionSourceActivationSignal | null
}

/**
 * 创建当前时间戳，统一 operation 执行阶段的落库记录时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 判断附件是否适合以内联文本形式注入模型上下文。
 */
function isTextAttachment(attachment: ChatAttachmentRecord): boolean {
  if (attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/json') {
    return true
  }

  const extension = attachment.name.split('.').at(-1)?.toLowerCase()

  return (
    extension !== undefined &&
    [
      'txt',
      'md',
      'markdown',
      'json',
      'csv',
      'log',
      'ts',
      'tsx',
      'js',
      'jsx',
      'css',
      'html',
      'xml',
      'yml',
      'yaml'
    ].includes(extension)
  )
}

/**
 * 把未知异常归一化成可展示、可持久化的错误文本。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * 读取本地附件内容，并把持久化消息转换成 backend 无关的上下文消息。
 */
async function toAgentBackendMessage(
  message: MessageRecord,
  attachmentsDirectory: string
): Promise<AgentBackendMessage | null> {
  let content = message.content

  if (message.role === 'user') {
    if ((message.attachments?.length ?? 0) > 0) {
      for (const attachment of message.attachments ?? []) {
        const attachmentPath = join(attachmentsDirectory, attachment.id)

        if (isTextAttachment(attachment)) {
          const data = await readFile(attachmentPath)

          content = `${content}\n\n[Attachment: ${attachment.name}]\n${data.toString('utf8')}`
        } else {
          content = `${content}\n\n[Attachment: ${attachment.name}]\n[Stored at: ${attachmentPath}]\n非文本附件内容未序列化到文本历史。`
        }
      }
    }
  }

  return createAgentBackendMessage({ ...message, content })
}

/**
 * 根据聊天附件元数据确定统一 agent attachment 类型，具体 provider 格式由 backend 再适配。
 */
function resolveAgentAttachmentType(attachment: ChatAttachmentRecord): MessageAttachment['type'] {
  if (attachment.mimeType.startsWith('image/')) {
    return 'image'
  }

  if (attachment.mimeType === 'application/pdf') {
    return 'pdf'
  }

  if (isTextAttachment(attachment)) {
    return 'text'
  }

  if (attachment.mimeType.startsWith('audio/')) {
    return 'audio'
  }

  return 'unknown'
}

/**
 * 将当前用户消息的持久化附件转换成 backend 输入；图片和 PDF 额外携带 base64 内容。
 */
async function createAgentMessageAttachment(
  attachment: ChatAttachmentRecord,
  attachmentsDirectory: string
): Promise<MessageAttachment> {
  const type = resolveAgentAttachmentType(attachment)
  const path = join(attachmentsDirectory, attachment.id)
  const shouldInlineBinary = type === 'image' || type === 'pdf'
  const base64 = shouldInlineBinary ? (await readFile(path)).toString('base64') : undefined

  return {
    id: attachment.id,
    type,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    path,
    ...(base64 === undefined ? {} : { base64 })
  }
}

/**
 * 从会话 scope 中提取 backend workspace 配置；未绑定项目时不传 workspace。
 */
function createBackendWorkspace(
  scope: SessionSourceProviderScope
): AgentBackendWorkspace | undefined {
  return scope.project === null
    ? undefined
    : {
        name: scope.project.name,
        path: scope.project.path
      }
}

/**
 * 执行单次 operation，把 backend 事件应用到会话状态，并在结束时释放事件流和 backend。
 */
export class SessionOperationRuntime {
  private readonly agentEventApplier: SessionAgentEventApplier
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly agentRuntime: SessionAgentRuntime
  private readonly attachmentsDirectory: string
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly sessionsRepository: SessionsRepositoryPort
  private readonly threadsRepository: ThreadsRepositoryPort
  private readonly toolPermissionRuntime: SessionToolPermissionRuntime

  /**
   * 注入 operation 执行阶段需要的仓储和 runtime 协作者。
   */
  constructor({
    agentEventApplier,
    agentOperationsRepository,
    agentRuntime,
    attachmentsDirectory,
    messagesRepository,
    sessionsRepository,
    threadsRepository,
    toolPermissionRuntime
  }: SessionOperationRuntimeInput) {
    this.agentEventApplier = agentEventApplier
    this.agentOperationsRepository = agentOperationsRepository
    this.agentRuntime = agentRuntime
    this.attachmentsDirectory = attachmentsDirectory
    this.messagesRepository = messagesRepository
    this.sessionsRepository = sessionsRepository
    this.threadsRepository = threadsRepository
    this.toolPermissionRuntime = toolPermissionRuntime
  }

  /**
   * 执行已处于 running 状态的 operation，并返回完成结果和可能的 source activation 信号。
   */
  async execute({
    abortSignal,
    assistantMessage: initialAssistantMessage,
    connection,
    onEvent,
    operation,
    routeHint,
    scope
  }: SessionOperationRuntimeExecuteInput): Promise<SessionOperationRuntimeExecuteResult> {
    let assistantMessage = initialAssistantMessage
    let currentOperation = operation
    let sourceActivationSignal: SessionSourceActivationSignal | null = null

    const previousMessages = await listSessionThreadHistory({
      messagesRepository: this.messagesRepository,
      thread: scope.thread,
      threadsRepository: this.threadsRepository
    })
    const backendMessages = (
      await Promise.all(
        previousMessages
          .filter((message) => message.id !== assistantMessage.id)
          .map((message) => toAgentBackendMessage(message, this.attachmentsDirectory))
      )
    ).filter((message): message is AgentBackendMessage => message !== null)
    const currentUserRecord = [...previousMessages]
      .reverse()
      .find((message) => message.role === 'user')
    const currentUserMessage = currentUserRecord?.content ?? ''
    const currentProviderMessage =
      [...backendMessages].reverse().find((message) => message.role === 'user')?.content ??
      currentUserMessage
    const currentAttachments =
      currentUserRecord === undefined
        ? []
        : await Promise.all(
            (currentUserRecord.attachments ?? []).map((attachment) =>
              createAgentMessageAttachment(attachment, this.attachmentsDirectory)
            )
          )
    const { agentBackend } = await this.agentRuntime.createBackend({
      connection,
      messages: backendMessages,
      originalMessage: currentUserMessage,
      scope,
      workspace: createBackendWorkspace(scope)
    })
    let agentEvents: ReturnType<typeof agentBackend.chat> | null = null

    this.toolPermissionRuntime.registerBackend(operation.id, agentBackend)

    if (onEvent !== undefined) {
      this.toolPermissionRuntime.registerOperationListener(operation.id, onEvent, routeHint)
    }

    try {
      agentEvents = agentBackend.chat(
        currentProviderMessage,
        currentAttachments.length === 0 ? undefined : currentAttachments,
        {
          abortSignal,
          turnId: operation.id
        }
      )
      let agentEventResult = await agentEvents.next()

      while (!agentEventResult.done) {
        const eventResult = await this.agentEventApplier.apply({
          event: agentEventResult.value,
          message: assistantMessage,
          onEvent,
          operation: currentOperation,
          routeHint,
          scope
        })

        assistantMessage = eventResult.message
        currentOperation = eventResult.operation
        sourceActivationSignal ??= eventResult.sourceActivation ?? null
        agentEventResult = await agentEvents.next()
      }

      return await this.completeOperation({
        assistantMessage,
        currentOperation,
        onEvent,
        routeHint,
        scope,
        sourceActivationSignal
      })
    } catch (error) {
      await this.failOperation({
        abortSignal,
        assistantMessage,
        currentOperation,
        error,
        onEvent,
        routeHint,
        scope
      })

      throw error
    } finally {
      this.toolPermissionRuntime.releaseBackend(operation.id)
      this.toolPermissionRuntime.releaseOperationListener(operation.id)
      this.agentRuntime.releaseSessionCallbacks(scope.session.id)

      try {
        await agentEvents?.return(undefined)
      } catch {
        // 保留 operation 主流程结果，事件流关闭失败不能覆盖原始完成或错误状态。
      } finally {
        agentBackend.destroy()
      }
    }
  }

  /**
   * 将成功执行的 operation 收尾为 done，并广播 operation-done。
   */
  private async completeOperation({
    assistantMessage,
    currentOperation,
    onEvent,
    routeHint,
    scope,
    sourceActivationSignal
  }: {
    assistantMessage: MessageRecord
    currentOperation: AgentOperationRecord
    onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
    routeHint?: SessionEventRouteHint
    scope: SessionSourceProviderScope
    sourceActivationSignal: SessionSourceActivationSignal | null
  }): Promise<SessionOperationRuntimeExecuteResult> {
    const completedTimestamp = createTimestamp()

    if (
      sourceActivationSignal === null &&
      assistantMessage.content.trim().length === 0 &&
      !assistantMessage.reasoning
    ) {
      throw new Error('Model returned an empty response.')
    }

    await this.messagesRepository.save({
      ...assistantMessage,
      content: assistantMessage.content.trim(),
      status: 'complete',
      updatedAt: completedTimestamp
    })

    const completedOperation = await this.agentOperationsRepository.save({
      ...currentOperation,
      status: 'done',
      completionReason: 'done',
      updatedAt: completedTimestamp,
      completedAt: completedTimestamp
    })
    const sessionAfterAssistant = await this.sessionsRepository.save({
      ...scope.session,
      updatedAt: completedTimestamp
    })
    const messages = await listSessionThreadHistory({
      messagesRepository: this.messagesRepository,
      thread: scope.thread,
      threadsRepository: this.threadsRepository
    })

    onEvent?.(
      {
        type: 'operation-done',
        operationId: currentOperation.id,
        session: sessionAfterAssistant,
        topic: scope.topic,
        thread: scope.thread,
        operation: completedOperation,
        messages
      },
      routeHint
    )

    return {
      session: sessionAfterAssistant,
      topic: scope.topic,
      thread: scope.thread,
      operation: completedOperation,
      messages,
      sourceActivation: sourceActivationSignal
    }
  }

  /**
   * 将失败或取消的 operation 收尾，并广播 operation-error。
   */
  private async failOperation({
    abortSignal,
    assistantMessage,
    currentOperation,
    error,
    onEvent,
    routeHint,
    scope
  }: {
    abortSignal: AbortSignal
    assistantMessage: MessageRecord
    currentOperation: AgentOperationRecord
    error: unknown
    onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
    routeHint?: SessionEventRouteHint
    scope: SessionSourceProviderScope
  }): Promise<void> {
    const errorMessage = getErrorMessage(error)
    const failedTimestamp = createTimestamp()
    const isCancelled = abortSignal.aborted
    const failedOperation = await this.agentOperationsRepository.save({
      ...currentOperation,
      status: isCancelled ? 'interrupted' : 'error',
      completionReason: isCancelled ? 'interrupted' : 'error',
      error: isCancelled ? null : { message: errorMessage },
      updatedAt: failedTimestamp,
      completedAt: failedTimestamp
    })

    await this.messagesRepository.save({
      ...assistantMessage,
      status: isCancelled ? 'cancelled' : 'error',
      error: isCancelled ? 'Cancelled by user.' : errorMessage,
      updatedAt: failedTimestamp
    })

    onEvent?.(
      {
        type: 'operation-error',
        operationId: currentOperation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: assistantMessage.id,
        error: isCancelled ? 'Cancelled by user.' : errorMessage,
        operation: failedOperation
      },
      routeHint
    )
  }
}
