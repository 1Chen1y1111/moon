import type { ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import type { StoreSetter } from '@renderer/store/types'
import type { AgentOperationRecord, ChatAttachmentRecord, MessageRecord } from '@shared/domain/chat'
import type { CancelAgentOperationInput, SendChatMessageInput } from '@shared/domain/chat-validation'
import type { ProviderSettings } from '@shared/domain/settings'

import type { ConversationContext, OperationState } from '../types'
import type { ConversationStore } from './index'

type Setter = StoreSetter<ConversationStore>

export type SendConversationMessageParams = {
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

  restoreInputMessage = (content: string): void => {
    this.#set({ inputMessage: content })
  }

  sendMessage = async ({
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
    const { context, operationState } = this.#get()
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
      const result = await sendChatMessage({
        ...(context.sessionId === null ? {} : { sessionId: context.sessionId }),
        ...(context.threadId === null ? {} : { threadId: context.threadId }),
        ...((context.sessionId === null || context.draftProviderId !== null) &&
        activeProvider !== undefined
          ? { provider: activeProvider.provider }
          : {}),
        content: trimmedContent,
        ...(readyAttachments.length === 0 ? {} : { attachments: readyAttachments })
      })

      clearDraftAttachments()
      onSessionResolved(result.session.id)
    } catch {
      restoreContent(trimmedContent)
      this.restoreInputMessage(trimmedContent)
    }
  }

  setContext = (context: ConversationContext): void => {
    this.#set({ context })
  }

  setMessages = (messages: MessageRecord[]): void => {
    this.#set({ messages })
  }

  setOperationState = (operationState: OperationState): void => {
    this.#set({ operationState })
  }

  setRuntimeInfo = (runtimeInfo: ChatInputRuntimeInfo): void => {
    this.#set({ runtimeInfo })
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
}

export type ConversationAction = Pick<ConversationActionImpl, keyof ConversationActionImpl>

export const createConversationAction = (
  set: Setter,
  get: () => ConversationStore,
  api?: unknown
): ConversationActionImpl => new ConversationActionImpl(set, get, api)
