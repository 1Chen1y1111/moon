import type { ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import type { StoreSetter } from '@renderer/store/types'
import type { AgentOperationRecord, ChatAttachmentRecord, MessageRecord } from '@shared/domain/chat'
import type {
  CancelAgentOperationInput,
  SendChatMessageInput
} from '@shared/domain/chat-validation'
import type { ProviderSettings } from '@shared/domain/settings'
import useSWR, { type SWRResponse } from 'swr'

import type { ConversationContext, OperationState } from '../types'
import type { ConversationStore } from './index'

type Setter = StoreSetter<ConversationStore>

const swrFetchMessagesKey = 'moon-conversation-fetch-messages'

function getTime(value: string): number {
  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

function mergeFetchedMessagesWithLocalState(
  fetchedMessages: MessageRecord[],
  localMessages: MessageRecord[]
): MessageRecord[] {
  if (localMessages.length === 0 || fetchedMessages.length === 0) {
    return fetchedMessages
  }

  const localById = new Map(localMessages.map((message) => [message.id, message]))
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

  return changed ? mergedMessages : fetchedMessages
}

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
        window.api.chat.getMessages({
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
