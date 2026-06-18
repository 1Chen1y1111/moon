/**
 * 汇总 server-core handler 注册边界。
 * 这里不创建具体 transport，只暴露可被 adapter 复用的类型和注册函数。
 */

export * from './types'
export * from './rpc'
