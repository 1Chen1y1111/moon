/**
 * 负责验证 thread 活跃选择策略在 server 与 renderer 之间保持稳定。
 */

import { describe, expect, it } from 'vitest'

import type { ThreadRecord } from '@moon/shared/domain/chat'
import { selectMostRecentlyActiveThread } from '@moon/shared/domain/chat-thread'

function createThread(id: string, overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id,
    topicId: 'topic-1',
    title: id,
    type: 'continuation',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    ...overrides
  }
}

describe('selectMostRecentlyActiveThread', () => {
  it('selects the thread with the latest persisted activity without reordering input', () => {
    const threads = [
      createThread('thread-root', { lastActiveAt: '2026-05-09T00:00:01.000Z' }),
      createThread('thread-branch', { lastActiveAt: '2026-05-09T00:00:03.000Z' }),
      createThread('thread-other', { lastActiveAt: '2026-05-09T00:00:02.000Z' })
    ]

    expect(selectMostRecentlyActiveThread(threads)?.id).toBe('thread-branch')
    expect(threads.map((thread) => thread.id)).toEqual([
      'thread-root',
      'thread-branch',
      'thread-other'
    ])
  })

  it('falls back to updatedAt and returns null for an empty list', () => {
    expect(
      selectMostRecentlyActiveThread([
        createThread('thread-root', { updatedAt: '2026-05-09T00:00:01.000Z' }),
        createThread('thread-branch', { updatedAt: '2026-05-09T00:00:02.000Z' })
      ])?.id
    ).toBe('thread-branch')
    expect(selectMostRecentlyActiveThread([])).toBeNull()
  })

  it('uses creation time and id as deterministic tie breakers', () => {
    expect(
      selectMostRecentlyActiveThread([
        createThread('thread-a', { createdAt: '2026-05-09T00:00:01.000Z' }),
        createThread('thread-b', { createdAt: '2026-05-09T00:00:02.000Z' })
      ])?.id
    ).toBe('thread-b')
    expect(
      selectMostRecentlyActiveThread([createThread('thread-a'), createThread('thread-b')])?.id
    ).toBe('thread-b')
  })
})
