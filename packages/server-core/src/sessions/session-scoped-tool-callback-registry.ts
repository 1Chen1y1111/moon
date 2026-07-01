/**
 * 负责管理单个 SessionManager 实例内的 session-scoped tool 回调。
 * 当前只承载 source activation，后续 source_test 等工具可复用同一个会话级入口。
 */

export type SessionScopedToolCallbacks = {
  /**
   * 请求在当前运行中的 session 激活指定 source，并返回本轮是否可以进入重启流程。
   */
  activateSourceInSessionFn?: (sourceSlug: string) => Promise<boolean>
}

/**
 * 以 sessionId 为键保存 session-scoped tool 回调，生命周期由 SessionManager 控制。
 */
export class SessionScopedToolCallbackRegistry {
  private readonly callbacksBySessionId = new Map<string, SessionScopedToolCallbacks>()

  /**
   * 注册当前 session 的完整回调集合；同一个 sessionId 会覆盖旧集合。
   */
  register(sessionId: string, callbacks: SessionScopedToolCallbacks): void {
    this.callbacksBySessionId.set(sessionId, callbacks)
  }

  /**
   * 合并当前 session 的部分回调，供后续工具分阶段接入。
   */
  merge(sessionId: string, callbacks: Partial<SessionScopedToolCallbacks>): void {
    const existingCallbacks = this.callbacksBySessionId.get(sessionId) ?? {}

    this.callbacksBySessionId.set(sessionId, { ...existingCallbacks, ...callbacks })
  }

  /**
   * 读取当前 session 已注册的 tool 回调。
   */
  get(sessionId: string): SessionScopedToolCallbacks | undefined {
    return this.callbacksBySessionId.get(sessionId)
  }

  /**
   * 清理当前 session 的回调，避免 operation 结束后留下可被旧 backend 调用的状态。
   */
  unregister(sessionId: string): void {
    this.callbacksBySessionId.delete(sessionId)
  }
}
