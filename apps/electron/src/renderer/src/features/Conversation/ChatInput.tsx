/**
 * 负责把会话上下文、设置状态和聊天输入组件连接起来。
 * 它只编排渲染端状态与发送参数，不直接访问 Electron IPC 之外的运行时实现。
 */

import { useEffect, useMemo } from 'react'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { ActionBar } from '@renderer/features/ChatInput/ActionBar'
import { ChatInput as BaseChatInput } from '@renderer/features/ChatInput'
import type { ChatInputAttachment, ChatInputRuntimeInfo } from '@renderer/features/ChatInput'
import { selectChatTarget } from '@renderer/features/ChatInput/chat-target-selection'
import { useChatStore } from '@renderer/store/chat'
import { selectChatDraftAttachments, selectChatSessions } from '@renderer/store/chat/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import type { ChatAttachmentRecord } from '@moon/shared/domain/chat'

import { conversationSelectors, useConversationStore } from './store'

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
  const activeTarget = selectChatTarget(appSettings, {
    activeSessionConnectionId: activeSession?.llmConnectionId,
    activeSessionProvider: activeSession?.provider,
    draftProviderId: context.draftProviderId
  })
  const activeProvider = activeTarget.provider
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
      modelLabel: activeTarget.modelLabel,
      shortcutLabel: 'Enter 发送，Shift+Enter 换行',
      statusLabel: isSending ? '发送中' : undefined
    }),
    [activeProvider, activeTarget.modelLabel, isSending]
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
