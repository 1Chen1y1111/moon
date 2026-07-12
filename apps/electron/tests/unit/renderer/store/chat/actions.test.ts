/**
 * 负责验证 renderer chat actions 的 thread 切换与持久化顺序。
 * 测试使用 typed window.api mock，不渲染 React 组件。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { resetChatStore, useChatStore } from '@renderer/store/chat'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import type { ThreadRecord } from '@moon/shared/domain/chat'

const rootThread: ThreadRecord = {
  id: 'thread-root',
  topicId: 'topic-1',
  title: 'Root',
  type: 'standalone',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z'
}

const branchThread: ThreadRecord = {
  ...rootThread,
  id: 'thread-branch',
  title: 'Branch',
  type: 'continuation',
  parentThreadId: rootThread.id,
  sourceMessageId: 'message-source'
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: (value) => resolvePromise?.(value)
  }
}

describe('ChatActionImpl thread activation', () => {
  let api: MockMoonApi

  beforeEach(() => {
    api = installMockWindowApi({ chatThreads: [rootThread, branchThread] })
    resetChatStore({
      activeSessionId: 'session-1',
      activeTopicId: 'topic-1',
      activeThreadId: rootThread.id,
      threads: [rootThread, branchThread],
      threadsStatus: 'succeeded'
    })
  })

  it('switches immediately while serializing persisted activations in selection order', async () => {
    const firstActivation = createDeferred<ThreadRecord>()
    const persistedOrder: string[] = []

    api.sessions.activateThread.mockImplementation(async ({ threadId }) => {
      persistedOrder.push(threadId)

      if (threadId === branchThread.id) {
        return firstActivation.promise
      }

      return {
        ...rootThread,
        lastActiveAt: '2026-05-09T00:00:04.000Z',
        updatedAt: '2026-05-09T00:00:04.000Z'
      }
    })

    const branchActivation = useChatStore.getState().switchChatThread(branchThread.id)

    expect(useChatStore.getState().activeThreadId).toBe(branchThread.id)

    const rootActivation = useChatStore.getState().switchChatThread(rootThread.id)

    expect(useChatStore.getState().activeThreadId).toBe(rootThread.id)
    await Promise.resolve()
    expect(persistedOrder).toEqual([branchThread.id])

    firstActivation.resolve({
      ...branchThread,
      lastActiveAt: '2026-05-09T00:00:03.000Z',
      updatedAt: '2026-05-09T00:00:03.000Z'
    })

    await Promise.all([branchActivation, rootActivation])

    expect(persistedOrder).toEqual([branchThread.id, rootThread.id])
    expect(useChatStore.getState().activeThreadId).toBe(rootThread.id)
    expect(
      useChatStore.getState().threads.find((thread) => thread.id === rootThread.id)
    ).toMatchObject({ lastActiveAt: '2026-05-09T00:00:04.000Z' })
  })
})
