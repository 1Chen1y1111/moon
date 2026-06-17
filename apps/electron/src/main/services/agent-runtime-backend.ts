/**
 * 负责把基础本地工具 runtime 包装成 AgentBackend 能消费的事件流。
 * 普通消息透传给底层 LLM backend，显式工具命令在 Electron main 进程内执行。
 */

import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

import {
  AgentPermissionManager,
  resolveWorkspacePath,
  type AgentBackend,
  type AgentChatOptions,
  type AgentEvent,
  type AgentPermissionDecision,
  type AgentRuntimeToolRequest,
  type AgentWorkspaceContext,
  type AgentPermissionMode
} from '@moon/shared/agent'

type AgentRuntimeBackendInput = {
  delegate: AgentBackend
  permissionMode?: AgentPermissionMode
  workspace?: AgentWorkspaceContext
}

type ToolExecutionResult = {
  output: string
  title: string
}

const maxTextOutputLength = 20_000
const maxDirectoryEntries = 200
const bashTimeoutMs = 30_000

/**
 * 截断过大的工具输出，避免单次工具结果撑爆消息和持久化 payload。
 */
function truncateOutput(output: string): string {
  if (output.length <= maxTextOutputLength) {
    return output
  }

  return `${output.slice(0, maxTextOutputLength)}\n\n[output truncated]`
}

/**
 * 将显式 slash command 解析成本地工具请求；非工具输入返回 null 并交给 LLM。
 */
function parseRuntimeToolCommand(message: string): AgentRuntimeToolRequest | null {
  const trimmedMessage = message.trim()

  if (trimmedMessage.startsWith('/read ')) {
    return {
      id: randomUUID(),
      name: 'read_file',
      input: { path: trimmedMessage.slice('/read '.length).trim() }
    }
  }

  if (trimmedMessage === '/ls' || trimmedMessage.startsWith('/ls ')) {
    const path = trimmedMessage === '/ls' ? '.' : trimmedMessage.slice('/ls '.length).trim()

    return {
      id: randomUUID(),
      name: 'list_dir',
      input: { path }
    }
  }

  if (trimmedMessage.startsWith('/bash ')) {
    return {
      id: randomUUID(),
      name: 'bash',
      input: { command: trimmedMessage.slice('/bash '.length).trim() }
    }
  }

  return null
}

/**
 * 读取项目内文本文件。
 */
async function executeReadFile(
  request: AgentRuntimeToolRequest,
  workspace: AgentWorkspaceContext
): Promise<ToolExecutionResult> {
  const targetPath = resolveWorkspacePath(workspace.path, request.input.path)
  const content = await readFile(targetPath, 'utf8')

  return {
    title: `读取完成：${request.input.path ?? targetPath}`,
    output: truncateOutput(content)
  }
}

/**
 * 列出项目内目录内容。
 */
async function executeListDir(
  request: AgentRuntimeToolRequest,
  workspace: AgentWorkspaceContext
): Promise<ToolExecutionResult> {
  const targetPath = resolveWorkspacePath(workspace.path, request.input.path)
  const entries = await readdir(targetPath, { withFileTypes: true })
  const output = entries
    .slice(0, maxDirectoryEntries)
    .map((entry) => `${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`)
    .join('\n')
  const overflow = entries.length > maxDirectoryEntries ? '\n[entries truncated]' : ''

  return {
    title: `目录列表：${request.input.path ?? '.'}`,
    output: `${output}${overflow}`
  }
}

/**
 * 在项目根目录执行 shell 命令并收集有限输出。
 */
function executeBash(
  request: AgentRuntimeToolRequest,
  workspace: AgentWorkspaceContext,
  abortSignal?: AbortSignal
): Promise<ToolExecutionResult> {
  const command = request.input.command?.trim()

  if (command === undefined || command.length === 0) {
    throw new Error('Missing bash command.')
  }

  return new Promise((resolve, reject) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command]
    const child = spawn(shell, args, {
      cwd: workspace.path,
      env: process.env,
      windowsHide: true
    })
    const chunks: Buffer[] = []
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Command timed out after ${bashTimeoutMs / 1000}s.`))
    }, bashTimeoutMs)
    const abort = (): void => {
      child.kill()
      reject(new Error('Cancelled by user.'))
    }

    abortSignal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timeout)
      abortSignal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timeout)
      abortSignal?.removeEventListener('abort', abort)

      const output = truncateOutput(Buffer.concat(chunks).toString('utf8'))

      if (exitCode !== 0) {
        reject(new Error(output.trim() || `Command exited with code ${exitCode ?? 'unknown'}.`))
        return
      }

      resolve({
        title: `命令完成：${command}`,
        output
      })
    })
  })
}

/**
 * 执行已通过权限检查的本地工具。
 */
async function executeRuntimeTool(
  request: AgentRuntimeToolRequest,
  workspace: AgentWorkspaceContext,
  abortSignal?: AbortSignal
): Promise<ToolExecutionResult> {
  if (request.name === 'read_file') {
    return executeReadFile(request, workspace)
  }

  if (request.name === 'list_dir') {
    return executeListDir(request, workspace)
  }

  return executeBash(request, workspace, abortSignal)
}

/**
 * 等待人工权限决策，并在取消时返回拒绝决策。
 */
function waitForPermissionDecision(
  promise: Promise<AgentPermissionDecision>,
  abortSignal?: AbortSignal
): Promise<AgentPermissionDecision> {
  if (abortSignal?.aborted === true) {
    return Promise.resolve({ requestId: '', approved: false, reason: 'Cancelled by user.' })
  }

  return new Promise((resolve) => {
    const abort = (): void =>
      resolve({ requestId: '', approved: false, reason: 'Cancelled by user.' })

    abortSignal?.addEventListener('abort', abort, { once: true })
    promise.then((decision) => {
      abortSignal?.removeEventListener('abort', abort)
      resolve(decision)
    })
  })
}

/**
 * 包装底层 LLM backend，提供显式本地工具命令、权限暂停和工具事件输出。
 */
export class AgentRuntimeBackend implements AgentBackend {
  private readonly delegate: AgentBackend
  private readonly permissionManager: AgentPermissionManager
  private readonly pendingPermissions = new Map<
    string,
    (decision: AgentPermissionDecision) => void
  >()
  private readonly workspace?: AgentWorkspaceContext

  /**
   * 保存底层 backend、权限模式和 workspace 边界。
   */
  constructor({ delegate, permissionMode = 'ask', workspace }: AgentRuntimeBackendInput) {
    this.delegate = delegate
    this.workspace = workspace
    this.permissionManager = new AgentPermissionManager({ mode: permissionMode, workspace })
  }

  /**
   * 处理显式工具命令；非工具消息透传给底层 LLM backend。
   */
  async *chat(
    message: string,
    attachments?: Parameters<AgentBackend['chat']>[1],
    options?: AgentChatOptions
  ): AsyncGenerator<AgentEvent, void, void> {
    const request = parseRuntimeToolCommand(message)

    if (request === null) {
      yield* this.delegate.chat(message, attachments, options)
      return
    }

    yield* this.runToolRequest(request, options?.abortSignal)
  }

  /**
   * 响应等待中的本地工具权限；未知请求透传给底层 backend。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    const resolvePermission = this.pendingPermissions.get(requestId)

    if (resolvePermission === undefined) {
      this.delegate.respondToPermission(requestId, allowed, alwaysAllow)
      return
    }

    this.pendingPermissions.delete(requestId)
    resolvePermission(
      allowed
        ? { requestId, approved: true, ...(alwaysAllow ? { alwaysAllow } : {}) }
        : { requestId, approved: false }
    )
  }

  /**
   * 中止本地等待和底层 backend。
   */
  abort(reason?: string): Promise<void> {
    return this.delegate.abort(reason)
  }

  /**
   * 释放底层 backend 和本地等待状态。
   */
  destroy(): void {
    this.pendingPermissions.clear()
    this.delegate.destroy()
  }

  /**
   * 返回底层 backend 是否正在处理消息。
   */
  isProcessing(): boolean {
    return this.delegate.isProcessing()
  }

  /**
   * 返回底层 backend 当前模型 ID。
   */
  getModel(): string {
    return this.delegate.getModel()
  }

  /**
   * 更新底层 backend 当前模型 ID。
   */
  setModel(model: string): void {
    this.delegate.setModel(model)
  }

  /**
   * 执行本地工具请求并输出统一 agent 事件。
   */
  private async *runToolRequest(
    request: AgentRuntimeToolRequest,
    abortSignal?: AbortSignal
  ): AsyncGenerator<AgentEvent, void, void> {
    const permission = this.permissionManager.evaluate(request)

    if (this.workspace === undefined || (!permission.allowed && !permission.requiresPermission)) {
      yield {
        type: 'text_delta',
        text: permission.reason ?? permission.description
      }
      return
    }

    if (permission.requiresPermission) {
      const permissionDecisionPromise = new Promise<AgentPermissionDecision>((resolve) => {
        this.pendingPermissions.set(request.id, resolve)
      })

      yield {
        type: 'permission_request',
        request: {
          requestId: request.id,
          toolName: request.name,
          description: permission.description,
          ...(request.input.command === undefined ? {} : { command: request.input.command }),
          ...(permission.reason === undefined ? {} : { reason: permission.reason }),
          ...(permission.type === undefined ? {} : { type: permission.type })
        }
      }

      const decision = await waitForPermissionDecision(permissionDecisionPromise, abortSignal)

      if (decision.approved === false) {
        yield {
          type: 'text_delta',
          text: decision.reason ?? '工具执行已拒绝。'
        }
        return
      }
    }

    yield {
      type: 'tool_start',
      toolUseId: request.id,
      toolName: request.name,
      input: request.input
    }

    try {
      const result = await executeRuntimeTool(request, this.workspace, abortSignal)

      yield {
        type: 'tool_result',
        toolUseId: request.id,
        toolName: request.name,
        result,
        isError: false,
        input: request.input
      }
      yield {
        type: 'text_delta',
        text: `${result.title}\n\n${result.output}`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      yield {
        type: 'tool_result',
        toolUseId: request.id,
        toolName: request.name,
        result: message,
        isError: true,
        input: request.input
      }
      yield {
        type: 'text_delta',
        text: message
      }
    }
  }
}

/**
 * 创建带基础本地工具 runtime 的 backend 包装器。
 */
export function createAgentRuntimeBackend(input: AgentRuntimeBackendInput): AgentBackend {
  return new AgentRuntimeBackend(input)
}
