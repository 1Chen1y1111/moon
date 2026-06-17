import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ChatInput } from '@renderer/features/ChatInput'

function renderControlledChatInput(
  options: { disabled?: boolean; initialValue?: string; isSending?: boolean } = {}
): {
  onSend: ReturnType<typeof vi.fn>
  user: ReturnType<typeof userEvent.setup>
} {
  const onSend = vi.fn()

  function Harness(): React.JSX.Element {
    const [value, setValue] = useState(options.initialValue ?? '')

    return (
      <ChatInput
        value={value}
        disabled={options.disabled}
        isSending={options.isSending}
        onChange={setValue}
        onSend={onSend}
      />
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

  it('does not send while disabled', async () => {
    const { onSend, user } = renderControlledChatInput({
      disabled: true,
      initialValue: 'hello'
    })
    const sendButton = screen.getByRole('button', { name: '发送' })

    expect(sendButton).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '消息内容' }), '{Enter}')
    await user.click(sendButton)

    expect(onSend).not.toHaveBeenCalled()
  })

  it('allows sending a ready attachment without text', async () => {
    const { onSend, user } = renderChatInputWithAttachment()

    await user.click(screen.getByRole('button', { name: /发送/ }))

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('blocks sending while attachments are importing or failed', async () => {
    const onSend = vi.fn()
    const { rerender } = render(
      <ChatInput
        value="hello"
        attachments={[
          {
            id: 'attachment-1',
            name: 'importing.txt',
            kind: 'file',
            status: 'importing'
          }
        ]}
        onChange={() => undefined}
        onSend={onSend}
      />
    )

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    rerender(
      <ChatInput
        value="hello"
        attachments={[
          {
            id: 'attachment-1',
            name: 'broken.txt',
            error: '解析失败',
            kind: 'file',
            status: 'error'
          }
        ]}
        onChange={() => undefined}
        onSend={onSend}
      />
    )

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('removes attachments through the remove callback', async () => {
    const onAttachmentRemove = vi.fn()
    const user = userEvent.setup()

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
        onAttachmentRemove={onAttachmentRemove}
        onChange={() => undefined}
        onSend={() => undefined}
      />
    )

    await user.click(screen.getByRole('button', { name: '移除附件 note.txt' }))

    expect(onAttachmentRemove).toHaveBeenCalledWith('attachment-1')
  })

  it('shows and triggers the stop control while sending', async () => {
    const onStop = vi.fn()
    const user = userEvent.setup()

    render(
      <ChatInput
        value="hello"
        isSending
        onChange={() => undefined}
        onSend={() => undefined}
        onStop={onStop}
      />
    )

    await user.click(screen.getByRole('button', { name: '停止生成' }))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '发送中' })).not.toBeInTheDocument()
  })

  it('renders runtime info only when labels are present', () => {
    const { rerender } = render(
      <ChatInput value="" runtimeInfo={{}} onChange={() => undefined} onSend={() => undefined} />
    )

    expect(screen.queryByText(/Moon Provider/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Enter 发送/)).not.toBeInTheDocument()

    rerender(
      <ChatInput
        value=""
        runtimeInfo={{
          providerLabel: 'Moon Provider',
          modelLabel: 'gpt-5.4',
          shortcutLabel: 'Enter 发送，Shift+Enter 换行',
          statusLabel: '发送中',
          workspaceLabel: 'moon'
        }}
        onChange={() => undefined}
        onSend={() => undefined}
      />
    )

    expect(screen.getByText('Moon Provider · gpt-5.4 · moon')).toBeInTheDocument()
    expect(screen.getByText('发送中 · Enter 发送，Shift+Enter 换行')).toBeInTheDocument()
  })
})
