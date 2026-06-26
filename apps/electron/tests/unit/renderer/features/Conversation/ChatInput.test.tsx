import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ChatInput as ConversationChatInput,
  ConversationProvider
} from '@renderer/features/Conversation'
import type { ConversationContext, OperationState } from '@renderer/features/Conversation'
import type { ChatState } from '@renderer/store/chat'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'

const context: ConversationContext = {
  draftLlmConnectionId: null,
  draftProviderId: null,
  projectId: null,
  sessionId: null,
  threadId: null,
  topicId: null
}

function renderConversationInput({
  operationState,
  preloadedChat
}: {
  operationState?: OperationState
  preloadedChat?: Partial<ChatState>
} = {}): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <ConversationProvider context={context} operationState={operationState}>
      <ConversationChatInput />
    </ConversationProvider>,
    { preloadedChat }
  )
}

describe('Conversation ChatInput', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi()
  })

  it('blocks empty sends', async () => {
    const { user } = renderConversationInput()

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(api.sessions.createMessageTurn).not.toHaveBeenCalled()
  })

  it('blocks sending while a draft attachment is not ready', async () => {
    const { user } = renderConversationInput({
      preloadedChat: {
        draftAttachments: [
          {
            id: 'attachment-1',
            name: 'note.txt',
            mimeType: 'text/plain',
            size: 100,
            kind: 'file',
            status: 'importing',
            createdAt: '2026-05-09T00:00:00.000Z'
          }
        ]
      }
    })

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(api.sessions.createMessageTurn).not.toHaveBeenCalled()
  })

  it('stops the blocking operation', async () => {
    const { user } = renderConversationInput({
      operationState: {
        blockingOperationId: 'operation-1',
        error: null,
        isSending: true
      }
    })

    await user.click(screen.getByRole('button', { name: '停止生成' }))

    await waitFor(() =>
      expect(api.sessions.cancelOperation).toHaveBeenCalledWith({ operationId: 'operation-1' })
    )
  })
})
