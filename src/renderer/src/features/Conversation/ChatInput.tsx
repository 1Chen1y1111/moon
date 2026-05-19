import { useEffect, useMemo } from 'react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ActionBar } from '@renderer/features/ChatInput/ActionBar'
import { ChatInput as BaseChatInput } from '@renderer/features/ChatInput'
import type { ChatInputAttachment, ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import { useChatStore } from '@renderer/store/chat'
import {
  selectChatDraftAttachments,
  selectChatSessions
} from '@renderer/store/chat/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import {
  isSupportedChatProvider,
  selectChatModelLabel,
  selectDefaultChatProvider
} from '@shared/domain/chat-provider'
import type { ChatAttachmentRecord } from '@shared/domain/chat'
import type { ProviderSettings } from '@shared/domain/settings'

import { conversationSelectors, useConversationStore } from './store'

function selectConversationProvider(
  providers: Record<string, ProviderSettings>,
  activeSessionProvider: string | undefined,
  draftProviderId: string | null
): ProviderSettings | undefined {
  const draftProvider = draftProviderId === null ? undefined : providers[draftProviderId]

  if (draftProvider?.enabled && isSupportedChatProvider(draftProvider)) {
    return draftProvider
  }

  if (activeSessionProvider !== undefined) {
    return providers[activeSessionProvider]
  }

  try {
    return selectDefaultChatProvider({ appearance: { theme: 'system' }, providers })
  } catch {
    return undefined
  }
}

function toInputAttachments(attachments: ReturnType<typeof selectChatDraftAttachments>) {
  return attachments.map((attachment) => ({
    ...attachment,
    type: attachment.mimeType
  })) satisfies ChatInputAttachment[]
}

function toReadyAttachments(
  attachments: ReturnType<typeof selectChatDraftAttachments>
): ChatAttachmentRecord[] {
  return attachments
    .filter((attachment) => attachment.status === 'success')
    .map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      createdAt: attachment.createdAt
    }))
}

export function ChatInput(): React.JSX.Element {
  const { setRouteState } = useAppRouterContext()
  const context = useConversationStore(conversationSelectors.context)
  const content = useConversationStore(conversationSelectors.inputMessage)
  const operationState = useConversationStore(conversationSelectors.operationState)
  const clearInputMessage = useConversationStore((state) => state.clearInputMessage)
  const restoreInputMessage = useConversationStore((state) => state.restoreInputMessage)
  const sendMessage = useConversationStore((state) => state.sendMessage)
  const setRuntimeInfo = useConversationStore((state) => state.setRuntimeInfo)
  const stopGenerating = useConversationStore((state) => state.stopGenerating)
  const updateInputMessage = useConversationStore((state) => state.updateInputMessage)
  const sessions = useChatStore(selectChatSessions)
  const draftAttachments = useChatStore(selectChatDraftAttachments)
  const sendChatMessage = useChatStore((state) => state.sendChatMessage)
  const cancelChatOperation = useChatStore((state) => state.cancelChatOperation)
  const clearChatDraftAttachments = useChatStore((state) => state.clearChatDraftAttachments)
  const removeChatDraftAttachment = useChatStore((state) => state.removeChatDraftAttachment)
  const appSettings = useSettingsStore(selectAppSettings)
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === context.sessionId),
    [context.sessionId, sessions]
  )
  const activeProvider = selectConversationProvider(
    appSettings.providers,
    activeSession?.provider,
    context.draftProviderId
  )
  const isSending = operationState.isSending
  const hasUnreadyDraftAttachments = draftAttachments.some(
    (attachment) => attachment.status !== 'success'
  )
  const attachments = useMemo(() => toInputAttachments(draftAttachments), [draftAttachments])
  const readyDraftAttachments = useMemo(
    () => toReadyAttachments(draftAttachments),
    [draftAttachments]
  )
  const runtimeInfo = useMemo<ChatInputRuntimeInfo>(
    () => ({
      providerLabel: activeProvider?.name ?? '未选择提供商',
      modelLabel: selectChatModelLabel(activeProvider),
      shortcutLabel: 'Enter 发送，Shift+Enter 换行',
      statusLabel: isSending ? '发送中' : undefined
    }),
    [activeProvider, isSending]
  )

  useEffect(() => {
    setRuntimeInfo(runtimeInfo)
  }, [runtimeInfo, setRuntimeInfo])

  return (
    <BaseChatInput
      attachments={attachments}
      value={content}
      isSending={isSending}
      leftContent={<ActionBar />}
      runtimeInfo={runtimeInfo}
      onChange={updateInputMessage}
      onAttachmentRemove={removeChatDraftAttachment}
      onSend={() => {
        void sendMessage({
          activeProvider,
          clearContent: clearInputMessage,
          clearDraftAttachments: clearChatDraftAttachments,
          content,
          hasUnreadyAttachments: hasUnreadyDraftAttachments,
          onSessionResolved: (sessionId) => {
            setRouteState((state) => ({
              ...state,
              activeChatId: sessionId,
              draftProviderId: null
            }))
          },
          readyAttachments: readyDraftAttachments,
          restoreContent: restoreInputMessage,
          sendChatMessage
        })
      }}
      onStop={() => stopGenerating(cancelChatOperation)}
    />
  )
}
