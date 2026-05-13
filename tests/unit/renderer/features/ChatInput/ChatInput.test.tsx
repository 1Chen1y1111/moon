import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatInput } from '@renderer/features/ChatInput'

function renderControlledChatInput(options: { initialValue?: string; isSending?: boolean } = {}): {
  onSend: ReturnType<typeof vi.fn>
  user: ReturnType<typeof userEvent.setup>
} {
  const onSend = vi.fn()

  function Harness(): React.JSX.Element {
    const [value, setValue] = useState(options.initialValue ?? '')

    return (
      <ChatInput value={value} isSending={options.isSending} onChange={setValue} onSend={onSend} />
    )
  }

  render(<Harness />)

  return {
    onSend,
    user: userEvent.setup()
  }
}

function renderChatInputWithAttachment(): {
  onSend: ReturnType<typeof vi.fn>
  user: ReturnType<typeof userEvent.setup>
} {
  const onSend = vi.fn()

  render(
    <ChatInput
      value=""
      attachments={[
        {
          id: 'attachment-1',
          name: 'note.txt',
          kind: 'file',
          status: 'success'
        }
      ]}
      onChange={() => undefined}
      onSend={onSend}
    />
  )

  return {
    onSend,
    user: userEvent.setup()
  }
}

describe('ChatInput', () => {
  it('sends with Enter', async () => {
    const { onSend, user } = renderControlledChatInput()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello{Enter}')

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('keeps Shift+Enter as a newline', async () => {
    const { onSend, user } = renderControlledChatInput()
    const textbox = screen.getByRole('textbox', { name: '消息内容' })

    await user.click(textbox)
    await user.keyboard('hello')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(onSend).not.toHaveBeenCalled()
    expect(textbox).toHaveValue('hello\n')
  })

  it('disables sending when empty or already sending', async () => {
    const { user } = renderControlledChatInput()

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), 'hello')

    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()

    render(
      <ChatInput value="hello" isSending onChange={() => undefined} onSend={() => undefined} />
    )

    expect(screen.getByRole('button', { name: '发送中' })).toBeDisabled()
  })
  it('allows sending a ready attachment without text', async () => {
    const { onSend, user } = renderChatInputWithAttachment()

    await user.click(screen.getByRole('button', { name: /发送/ }))

    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
