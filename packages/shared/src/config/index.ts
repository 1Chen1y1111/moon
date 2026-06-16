/**
 * 负责暴露 shared config 层的公开入口，边界止于跨运行环境可复用的配置类型与校验。
 * Electron 的密钥存取、窗口设置和持久化实现不应放在这里。
 */

export * from './llm-connections'
