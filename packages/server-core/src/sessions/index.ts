/**
 * 负责导出会话运行时相关类型和实现。
 * Electron main 只能依赖这些纯 runtime 边界，不应反向进入具体实现细节。
 */

export * from './session-manager'
