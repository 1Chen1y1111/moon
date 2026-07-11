/**
 * 负责实现会话局部 store 的输入、消息加载和发送动作。
 * 它只编排 renderer 状态与 chat IPC 调用，不直接访问主进程实现细节。
 */

import type { ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import type { StoreSetter } from '@renderer/store/types'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  MessageRecord
} from '@moon/shared/domain/chat'
import type {
  CancelAgentOperationInput,
  SendChatMessageInput
} from '@moon/shared/domain/chat-validation'
import type { ProviderSettings } from '@moon/shared/domain/settings'
import useSWR, { type SWRResponse } from 'swr'

import type { ConversationContext, OperationState } from '../types'
import type { ConversationStore } from './index'

type Setter = StoreSetter<ConversationStore>

const swrFetchMessagesKey = 'moon-conversation-fetch-messages'

/**
 * 生成分支输入条展示的单行回复摘要，避免完整 markdown 挤占输入区。
 */
function createBranchSourcePreview(content: string): string {
  const preview = content.replace(/\s+/g, ' ').trim()

  if (preview.length === 0) {
    return '该回复'
  }

  return preview.length <= 80 ? preview : `${preview.slice(0, 80)}...`
}

function getTime(value: string): number {
  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

/**
 * 合并历史拉取结果和本地 live state，避免迟到的空/旧响应覆盖流式事件。
 */
function mergeFetchedMessagesWithLocalState(
  fetchedMessages: MessageRecord[],
  localMessages: MessageRecord[]
): MessageRecord[] {
  if (localMessages.length === 0) {
    return fetchedMessages
  }

  if (fetchedMessages.length === 0) {
    return localMessages
  }

  const localById = new Map(localMessages.map((message) => [message.id, message]))
  const fetchedIds = new Set(fetchedMessages.map((message) => message.id))
  let changed = false

  const mergedMessages = fetchedMessages.map((message) => {
    const localMessage = localById.get(message.id)

    if (localMessage === undefined) {
      return message
    }

    if (getTime(localMessage.updatedAt) <= getTime(message.updatedAt)) {
      return message
    }

    changed = true
    return localMessage
  })
  const localOnlyMessages = localMessages.filter((message) => !fetchedIds.has(message.id))

  if (localOnlyMessages.length > 0) {
    changed = true
  }

  return changed ? [...mergedMessages, ...localOnlyMessages] : fetchedMessages
}

export type SendConversationMessageParams = {
  activeLlmConnectionId?: string
  activeProvider?: ProviderSettings
  clearContent: () => void
  clearDraftAttachments: () => void
  content: string
  hasUnreadyAttachments: boolean
  onSessionResolved: (sessionId: string) => void
  readyAttachments: ChatAttachmentRecord[]
  restoreContent: (content: string) => void
  sendChatMessage: (input: SendChatMessageInput) => Promise<{ session: { id: string } }>
}

export class ConversationActionImpl {
  readonly #get: () => ConversationStore
  readonly #set: Setter

  constructor(set: Setter, get: () => ConversationStore, _api?: unknown) {
    void _api
    this.#get = get
    this.#set = set
  }

  clearInputMessage = (): void => {
    this.#set({ inputMessage: '' })
  }

  /**
   * 取消当前一次性分支输入目标，后续发送恢复到 active thread。
   */
  clearBranchTarget = (): void => {
    this.#set({ branchTarget: null })
  }

  restoreInputMessage = (content: string): void => {
    this.#set({ inputMessage: content })
  }

  /**
   * 把已完成 assistant 消息设为下一次发送的 branch source。
   */
  startBranch = (message: MessageRecord): void => {
    const { context, operationState } = this.#get()

    if (
      context.sessionId === null ||
      context.threadId === null ||
      operationState.isSending ||
      message.threadId !== context.threadId ||
      message.role !== 'assistant' ||
      message.status !== 'complete'
    ) {
      return
    }

    this.#set({
      branchTarget: {
        parentThreadId: message.threadId,
        sourceMessageId: message.id,
        sourcePreview: createBranchSourcePreview(message.content)
      }
    })
  }

  sendMessage = async ({
    activeLlmConnectionId,
    activeProvider,
    clearContent,
    clearDraftAttachments,
    content,
    hasUnreadyAttachments,
    onSessionResolved,
    readyAttachments,
    restoreContent,
    sendChatMessage
  }: SendConversationMessageParams): Promise<void> => {
    const { branchTarget, context, operationState } = this.#get()
    const trimmedContent = content.trim()

    if (
      (trimmedContent.length === 0 && readyAttachments.length === 0) ||
      hasUnreadyAttachments ||
      operationState.isSending
    ) {
      return
    }

    clearContent()
    this.clearInputMessage()

    try {
      const messageInput = {
        content: trimmedContent,
        ...(readyAttachments.length === 0 ? {} : { attachments: readyAttachments })
      }
      const result = await sendChatMessage(
        branchTarget !== null && context.sessionId !== null
          ? {
              sessionId: context.sessionId,
              parentThreadId: branchTarget.parentThreadId,
              sourceMessageId: branchTarget.sourceMessageId,
              ...messageInput
            }
          : {
              ...(context.sessionId === null ? {} : { sessionId: context.sessionId }),
              ...(context.threadId === null ? {} : { threadId: context.threadId }),
              projectId: context.projectId,
              ...(activeLlmConnectionId === undefined
                ? {}
                : { llmConnectionId: activeLlmConnectionId }),
              ...((context.sessionId === null || context.draftProviderId !== null) &&
              activeLlmConnectionId === undefined &&
              activeProvider !== undefined
                ? { provider: activeProvider.provider }
                : {}),
              ...messageInput
            }
      )

      clearDraftAttachments()
      this.clearBranchTarget()
      onSessionResolved(result.session.id)
    } catch {
      restoreContent(trimmedContent)
      this.restoreInputMessage(trimmedContent)
    }
  }

  setContext = (context: ConversationContext): void => {
    this.#set({ context })
  }

  replaceMessages = (messages: MessageRecord[], context = this.#get().context): void => {
    this.#set({ messages, messagesInit: true })
    this.#get().onMessagesChange?.(messages, context)
  }

  setMessages = (messages: MessageRecord[], messagesInit = true): void => {
    this.#set({ messages, messagesInit })
  }

  setMessagesInit = (messagesInit: boolean): void => {
    this.#set({ messagesInit })
  }

  setOnMessagesChange = (
    onMessagesChange: ConversationStore['onMessagesChange'] | undefined
  ): void => {
    this.#set({ onMessagesChange })
  }

  setOperationState = (operationState: OperationState): void => {
    this.#set({ operationState })
  }

  setRuntimeInfo = (runtimeInfo: ChatInputRuntimeInfo): void => {
    this.#set({ runtimeInfo })
  }

  setSkipFetch = (skipFetch: boolean | undefined): void => {
    this.#set({ skipFetch })
  }

  stopGenerating = (
    cancelChatOperation: (input: CancelAgentOperationInput) => Promise<AgentOperationRecord>
  ): void => {
    const { blockingOperationId } = this.#get().operationState

    if (blockingOperationId !== null) {
      void cancelChatOperation({ operationId: blockingOperationId })
    }
  }

  updateInputMessage = (inputMessage: string): void => {
    this.#set({ inputMessage })
  }

  useFetchMessages = (
    context: ConversationContext,
    skipFetch?: boolean
  ): SWRResponse<MessageRecord[]> => {
    const shouldFetch =
      skipFetch !== true && context.sessionId !== null && context.threadId !== null

    return useSWR<MessageRecord[]>(
      shouldFetch
        ? [swrFetchMessagesKey, context.sessionId, context.topicId, context.threadId]
        : null,
      async () =>
        window.api.sessions.getMessages({
          sessionId: context.sessionId as string,
          threadId: context.threadId as string
        }),
      {
        onSuccess: (messages) => {
          const mergedMessages = mergeFetchedMessagesWithLocalState(messages, this.#get().messages)

          this.replaceMessages(mergedMessages, context)
        },
        revalidateOnFocus: false,
        shouldRetryOnError: false
      }
    )
  }
}

export type ConversationAction = Pick<ConversationActionImpl, keyof ConversationActionImpl>

export const createConversationAction = (
  set: Setter,
  get: () => ConversationStore,
  api?: unknown
): ConversationActionImpl => new ConversationActionImpl(set, get, api)
