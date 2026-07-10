/**
 * 负责创建单轮 Claude SDK query 所需的 runtime 对象。
 * 它只组装 SDK options、stderr 缓冲和诊断摘要，不执行 query 或处理事件流。
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk'

import type { ThinkingLevel } from '../../../config'
import type { AgentBackendWorkspace } from '../types'
import { createClaudeQueryOptions } from '../internal/runtime-resolver'
import {
  createClaudePreToolUseHooks,
  type ClaudeSourceActivationRequester,
  type ClaudeToolPermissionRequester,
  type ClaudeToolUseBlockedReporter,
  type ClaudeToolUseChecker
} from '../internal/tool-permission-hooks'
import { ClaudeStderrBuffer, createClaudeRuntimeSummary } from './sdk-diagnostics'

export type ClaudeQueryRuntimeInput = {
  abortController: AbortController
  apiKey?: string
  baseUrl?: string
  checkToolUse: ClaudeToolUseChecker
  model: string
  onToolUseBlocked?: ClaudeToolUseBlockedReporter
  requestPermission?: ClaudeToolPermissionRequester
  requestSourceActivation?: ClaudeSourceActivationRequester | null
  resumeSessionId?: string
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

export type ClaudeQueryRuntime = {
  queryOptions: Options
  runtimeSummary: string
  stderrBuffer: ClaudeStderrBuffer
}

/**
 * 创建本轮 Claude SDK query runtime，并在有 workspace 时接入 Moon PreToolUse hook。
 */
export function createClaudeQueryRuntime({
  abortController,
  apiKey,
  baseUrl,
  checkToolUse,
  model,
  onToolUseBlocked,
  requestPermission,
  requestSourceActivation,
  resumeSessionId,
  thinkingLevel,
  workspace
}: ClaudeQueryRuntimeInput): ClaudeQueryRuntime {
  const stderrBuffer = new ClaudeStderrBuffer()
  const hooks =
    workspace === undefined
      ? undefined
      : createClaudePreToolUseHooks({
          checkToolUse,
          onToolUseBlocked,
          requestPermission,
          requestSourceActivation: requestSourceActivation ?? undefined
        })
  const queryOptions = createClaudeQueryOptions({
    abortController,
    apiKey,
    baseUrl,
    hooks,
    model,
    resumeSessionId,
    stderr: (data) => stderrBuffer.append(data),
    thinkingLevel,
    workspace
  })

  return {
    queryOptions,
    runtimeSummary: createClaudeRuntimeSummary(queryOptions),
    stderrBuffer
  }
}
