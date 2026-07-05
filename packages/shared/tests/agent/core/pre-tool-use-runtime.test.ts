/**
 * 负责验证 Claude-first PreToolUse 运行时编排边界。
 * 测试只覆盖 source、prerequisite、权限管线和 guide read 跟踪的组合顺序。
 */

import { describe, expect, it } from 'vitest'

import { AgentSourceRuntime } from '../../../src/agent/core/agent-source-runtime'
import { PermissionManager } from '../../../src/agent/core/permission-manager'
import {
  runAgentPreToolUseRuntime,
  type AgentPreToolUseRuntimeInput
} from '../../../src/agent/core/pre-tool-use-runtime'
import { PrerequisiteManager } from '../../../src/agent/core/prerequisite-manager'
import {
  createAgentSessionRuntimeState,
  type AgentSessionRuntimeState
} from '../../../src/agent/core/session-runtime-state'
import type { AgentSourceRecord } from '../../../src/agent/core/source-manager'
import type { AgentPermissionMode } from '../../../src/agent/core/types'

const workspace = { path: '/workspace/moon' }
const sourceToolPolicyBlockReason =
  'Moon 已识别 source "linear" 的工具 mcp__linear__createIssue，但当前阶段尚未接入 source tool execution，已阻止该工具调用。'

type RuntimeHarnessInput = {
  agentSessionState?: AgentSessionRuntimeState
  permissionMode?: AgentPermissionMode
  sources?: AgentSourceRecord[]
}

/**
 * 创建最小 PreToolUse runtime harness，让测试只声明本次工具调用关心的状态。
 */
function createHarness({
  agentSessionState = createAgentSessionRuntimeState(),
  permissionMode = 'ask',
  sources = []
}: RuntimeHarnessInput = {}) {
  const sourceRuntime = new AgentSourceRuntime({ sources })
  const prerequisiteManager = new PrerequisiteManager({ agentSessionState, workspace })
  const permissionManager = new PermissionManager({ permissionMode, workspace })

  return {
    agentSessionState,
    check(input: AgentPreToolUseRuntimeInput['input']) {
      return runAgentPreToolUseRuntime({
        agentSessionState,
        input,
        permissionManager,
        permissionMode,
        prerequisiteManager,
        sourceRuntime
      })
    }
  }
}

describe('runAgentPreToolUseRuntime', () => {
  it('returns source activation before prerequisite and permission checks', () => {
    const { check } = createHarness({
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          guidePath: 'sources/linear/guide.md',
          status: 'inactive'
        }
      ]
    })

    expect(
      check({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toEqual({
      type: 'source_activation_needed',
      sourceSlug: 'linear',
      sourceExists: true
    })
  })

  it('blocks active source tools until their guide has been read', () => {
    const { check } = createHarness({
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          guidePath: 'sources/linear/guide.md',
          status: 'active'
        }
      ]
    })

    expect(
      check({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toEqual({
      type: 'block',
      reason:
        '使用 source "linear" 的工具前，必须先用 Read 读取 source guide：sources/linear/guide.md。'
    })
  })

  it('tracks guide reads with modified read-only tool input', () => {
    const { agentSessionState, check } = createHarness({
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          guidePath: 'sources/linear/guide.md',
          status: 'active'
        }
      ]
    })

    expect(
      check({
        toolName: 'Read',
        toolInput: { file_path: './sources/linear/../linear/guide.md' },
        toolUseId: 'read-tool-1'
      })
    ).toEqual({
      type: 'modify',
      toolInput: { file_path: 'sources/linear/guide.md' }
    })

    expect(agentSessionState.sourceGuideReads).toEqual([
      {
        sourceSlug: 'linear',
        guidePath: '/workspace/moon/sources/linear/guide.md'
      }
    ])
  })

  it('returns source policy block after the guide has been read', () => {
    const { check } = createHarness({
      sources: [
        {
          slug: 'linear',
          name: 'Linear',
          guidePath: 'sources/linear/guide.md',
          status: 'active'
        }
      ]
    })

    check({
      toolName: 'Read',
      toolInput: { file_path: 'sources/linear/guide.md' },
      toolUseId: 'read-tool-1'
    })

    expect(
      check({
        toolName: 'mcp__linear__createIssue',
        toolInput: { title: 'Bug' },
        toolUseId: 'source-tool-1'
      })
    ).toEqual({
      type: 'block',
      reason: sourceToolPolicyBlockReason
    })
  })

  it('allows write tools when a session permission grant matches', () => {
    const agentSessionState = createAgentSessionRuntimeState()

    agentSessionState.permissionGrants.push({
      type: 'file_write',
      toolName: 'Edit',
      path: 'README.md'
    })

    const { check } = createHarness({ agentSessionState })

    expect(
      check({
        toolName: 'Edit',
        toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
        toolUseId: 'edit-tool-1'
      })
    ).toEqual({ type: 'allow' })
  })

  it('prompts for write tools in ask mode when no grant matches', () => {
    const { check } = createHarness()

    expect(
      check({
        toolName: 'Edit',
        toolInput: { file_path: 'README.md', old_string: 'old', new_string: 'new' },
        toolUseId: 'edit-tool-1'
      })
    ).toEqual({
      type: 'prompt',
      request: {
        requestId: 'perm-edit-tool-1',
        toolName: 'Edit',
        description: '需要修改项目文件：README.md',
        path: 'README.md',
        type: 'file_write',
        impact: '写操作会改变当前项目工作区文件。'
      }
    })
  })
})
