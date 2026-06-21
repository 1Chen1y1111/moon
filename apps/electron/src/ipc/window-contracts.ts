/**
 * 定义窗口控制 IPC 使用的输入 schema，并复用 shared protocol 的窗口状态类型。
 * 本文件只承载 Electron IPC contract，不直接操作 BrowserWindow。
 */

import { z } from 'zod'

/**
 * 打开设置窗口时 renderer 可以传递的目标定位参数。
 */
export const openSettingsInputSchema = z
  .object({
    section: z.literal('providers').optional()
  })
  .optional()

/**
 * 打开设置窗口 IPC 的输入类型，undefined 表示打开默认设置入口。
 */
export type OpenSettingsInput = z.infer<typeof openSettingsInputSchema>

/**
 * 打开外部链接时 preload 内部 capability handler 传递的请求参数。
 */
export const openExternalInputSchema = z.object({
  url: z.string().min(1)
})

/**
 * 打开外部链接 IPC 的输入类型；该能力不暴露给 renderer-facing MoonApi。
 */
export type OpenExternalInput = z.infer<typeof openExternalInputSchema>

/**
 * 窗口状态事件 payload 由 shared protocol 定义，Electron IPC 只复用该 wire contract。
 */
export type { WindowState } from '@moon/shared/protocol'
