import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  ConversationProvider,
  createConversationStore,
  conversationSelectors,
  useConversationStore
} from '@renderer/features/Conversation'
import type { ConversationContext } from '@renderer/features/Conversation'
import type { MessageRecord } from '@moon/shared/domain/chat'

const context: ConversationContext = {
  draftProviderId: null,
  sessionId: 'session-1',
  threadId: 'thread-1',
  topicId: 'topic-1'
}

const nextContext: ConversationContext = {
  draftProviderId: null,
  sessionId: 'session-2',
  threadId: 'thread-2',
  topicId: 'topic-2'
}

const message: MessageRecord = {
  id: 'message-1',
  sessionId: 'session-1',
  topicId: 'topic-1',
  threadId: 'thread-1',
  role: 'user',
  content: '你好',
  status: 'complete',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

function StoreProbe(): React.JSX.Element {
  const storeContext = useConversationStore(conversationSelectors.context)
  const inputMessage = useConversationStore(conversationSelectors.inputMessage)
  const messages = useConversationStore(conversationSelectors.messages)
  const messagesInit = useConversationStore(conversationSelectors.messagesInit)
  const updateInputMessage = useConversationStore((state) => state.updateInputMessage)

  return (
    <>
      <output aria-label="session id">{storeContext.sessionId}</output>
      <output aria-label="input message">{inputMessage}</output>
      <output aria-label="messages count">{messages.length}</output>
      <output aria-label="messages init">{String(messagesInit)}</output>
      <button type="button" onClick={() => updateInputMessage('hello')}>
        写入输入
      </button>
    </>
  )
}

describe('ConversationProvider', () => {
  it('provides isolated conversation state to children', async () => {
    const user = userEvent.setup()

    render(
      <ConversationProvider context={context}>
        <StoreProbe />
      </ConversationProvider>
    )

    expect(screen.getByLabelText('session id')).toHaveTextContent('session-1')
    await user.click(screen.getByRole('button', { name: '写入输入' }))

    expect(screen.getByLabelText('input message')).toHaveTextContent('hello')
  })

  it('resets messages before exposing the next conversation context', () => {
    const { rerender } = render(
      <ConversationProvider context={context} hasInitMessages messages={[message]}>
        <StoreProbe />
      </ConversationProvider>
    )

    expect(screen.getByLabelText('session id')).toHaveTextContent('session-1')
    expect(screen.getByLabelText('messages count')).toHaveTextContent('1')
    expect(screen.getByLabelText('messages init')).toHaveTextContent('true')

    rerender(
      <ConversationProvider context={nextContext} hasInitMessages={false}>
        <StoreProbe />
      </ConversationProvider>
    )

    expect(screen.getByLabelText('session id')).toHaveTextContent('session-2')
    expect(screen.getByLabelText('messages count')).toHaveTextContent('0')
    expect(screen.getByLabelText('messages init')).toHaveTextContent('false')
  })

  it('marks external messages as initialized immediately', () => {
    render(
      <ConversationProvider context={context} messages={[message]}>
        <StoreProbe />
      </ConversationProvider>
    )

    expect(screen.getByLabelText('messages count')).toHaveTextContent('1')
    expect(screen.getByLabelText('messages init')).toHaveTextContent('true')
  })

  it('clears input after a successful send and restores it after a failed send', async () => {
    const store = createConversationStore({ context })
    const sendChatMessage = vi.fn().mockResolvedValue({ session: { id: 'session-1' } })
    const clearContent = vi.fn()
    const clearDraftAttachments = vi.fn()
    const restoreContent = vi.fn()
    const onSessionResolved = vi.fn()

    store.getState().updateInputMessage('hello')
    await store.getState().sendMessage({
      clearContent,
      clearDraftAttachments,
      content: 'hello',
      hasUnreadyAttachments: false,
      onSessionResolved,
      readyAttachments: [],
      restoreContent,
      sendChatMessage
    })

    expect(clearContent).toHaveBeenCalledTimes(1)
    expect(clearDraftAttachments).toHaveBeenCalledTimes(1)
    expect(onSessionResolved).toHaveBeenCalledWith('session-1')
    expect(store.getState().inputMessage).toBe('')

    sendChatMessage.mockRejectedValueOnce(new Error('down'))
    store.getState().updateInputMessage('retry')
    await store.getState().sendMessage({
      clearContent,
      clearDraftAttachments,
      content: 'retry',
      hasUnreadyAttachments: false,
      onSessionResolved,
      readyAttachments: [],
      restoreContent,
      sendChatMessage
    })

    expect(restoreContent).toHaveBeenCalledWith('retry')
    expect(store.getState().inputMessage).toBe('retry')
  })
})
