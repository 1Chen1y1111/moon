import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ChatInputProvider, useChatInputProvider } from '@renderer/features/ChatInput'

function Harness(): React.JSX.Element {
  const { content, createSendSnapshot, setContent } = useChatInputProvider()
  const [snapshotContent, setSnapshotContent] = useState('')

  return (
    <>
      <input
        aria-label="输入内容"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <output aria-label="快照内容">{snapshotContent}</output>
      <button
        type="button"
        onClick={() => {
          const snapshot = createSendSnapshot()

          setSnapshotContent(snapshot.content)
          snapshot.clearContent()
        }}
      >
        创建快照并清空
      </button>
      <button
        type="button"
        onClick={() => {
          createSendSnapshot().restoreContent('恢复内容')
        }}
      >
        恢复内容
      </button>
    </>
  )
}

describe('ChatInputProvider', () => {
  it('keeps local content and exposes clear/restore snapshots', async () => {
    const user = userEvent.setup()

    render(
      <ChatInputProvider>
        <Harness />
      </ChatInputProvider>
    )

    await user.type(screen.getByRole('textbox', { name: '输入内容' }), 'hello')
    await user.click(screen.getByRole('button', { name: '创建快照并清空' }))

    expect(screen.getByLabelText('快照内容')).toHaveTextContent('hello')
    expect(screen.getByRole('textbox', { name: '输入内容' })).toHaveValue('')

    await user.click(screen.getByRole('button', { name: '恢复内容' }))

    expect(screen.getByRole('textbox', { name: '输入内容' })).toHaveValue('恢复内容')
  })
})
