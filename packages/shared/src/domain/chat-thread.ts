/**
 * 负责定义 thread 活跃度的共享选择规则。
 * 本文件只比较持久化时间字段，不读取仓储或修改 renderer 状态。
 */

import type { ThreadRecord } from './chat'

/**
 * 把 ISO 时间转换为可比较数值；损坏值排在所有有效时间之前。
 */
function toTimestamp(value: string): number {
  const timestamp = Date.parse(value)

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

/**
 * 从 thread 列表中选择最近活跃项；活跃时间相同时按创建时间和 ID 稳定决胜。
 */
export function selectMostRecentlyActiveThread(
  threads: readonly ThreadRecord[]
): ThreadRecord | null {
  return threads.reduce<ThreadRecord | null>((selected, candidate) => {
    if (selected === null) {
      return candidate
    }

    const selectedActivity = toTimestamp(selected.lastActiveAt ?? selected.updatedAt)
    const candidateActivity = toTimestamp(candidate.lastActiveAt ?? candidate.updatedAt)

    if (candidateActivity !== selectedActivity) {
      return candidateActivity > selectedActivity ? candidate : selected
    }

    const selectedCreatedAt = toTimestamp(selected.createdAt)
    const candidateCreatedAt = toTimestamp(candidate.createdAt)

    if (candidateCreatedAt !== selectedCreatedAt) {
      return candidateCreatedAt > selectedCreatedAt ? candidate : selected
    }

    return candidate.id.localeCompare(selected.id) > 0 ? candidate : selected
  }, null)
}
