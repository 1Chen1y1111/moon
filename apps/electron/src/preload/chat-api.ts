/**
 * 负责通过 RPC client 和 session channel map 构建 renderer 可用的 chat API。
 * 本文件只生成 `window.api.chat`，不处理 settings、projects 或 windowControls。
 */

import type { MoonApi } from '@ipc/contracts'
import type { RpcClientPort } from '@moon/server-core/transport'
import { RPC_CHANNELS } from '@moon/shared/protocol'

type ChatApi = MoonApi['chat']
type ChatInvokeMethod = Exclude<keyof ChatApi, 'onSessionEvent'>

const chatRpcChannelByMethod = {
  listSessions: RPC_CHANNELS.sessions.listSessions,
  getMessages: RPC_CHANNELS.sessions.getMessages,
  listTopics: RPC_CHANNELS.sessions.listTopics,
  listThreads: RPC_CHANNELS.sessions.listThreads,
  createSession: RPC_CHANNELS.sessions.createSession,
  deleteSession: RPC_CHANNELS.sessions.deleteSession,
  importAttachment: RPC_CHANNELS.sessions.importAttachment,
  createMessageTurn: RPC_CHANNELS.sessions.createMessageTurn,
  runOperation: RPC_CHANNELS.sessions.runOperation,
  sendMessage: RPC_CHANNELS.sessions.sendMessage,
  cancelOperation: RPC_CHANNELS.sessions.cancelOperation,
  approveToolCall: RPC_CHANNELS.sessions.approveToolCall,
  rejectToolCall: RPC_CHANNELS.sessions.rejectToolCall
} satisfies Record<ChatInvokeMethod, string>

/**
 * 使用 RPC client 构建 chat namespace，保持 renderer-facing 方法签名不变。
 */
export function buildChatApi(client: RpcClientPort): ChatApi {
  return {
    listSessions: () =>
      client.invoke(chatRpcChannelByMethod.listSessions) as ReturnType<ChatApi['listSessions']>,
    getMessages: (input) =>
      client.invoke(chatRpcChannelByMethod.getMessages, input) as ReturnType<
        ChatApi['getMessages']
      >,
    listTopics: (input) =>
      client.invoke(chatRpcChannelByMethod.listTopics, input) as ReturnType<ChatApi['listTopics']>,
    listThreads: (input) =>
      client.invoke(chatRpcChannelByMethod.listThreads, input) as ReturnType<
        ChatApi['listThreads']
      >,
    createSession: () =>
      client.invoke(chatRpcChannelByMethod.createSession) as ReturnType<ChatApi['createSession']>,
    deleteSession: (input) =>
      client.invoke(chatRpcChannelByMethod.deleteSession, input) as ReturnType<
        ChatApi['deleteSession']
      >,
    importAttachment: (input) =>
      client.invoke(chatRpcChannelByMethod.importAttachment, input) as ReturnType<
        ChatApi['importAttachment']
      >,
    createMessageTurn: (input) =>
      client.invoke(chatRpcChannelByMethod.createMessageTurn, input) as ReturnType<
        ChatApi['createMessageTurn']
      >,
    runOperation: (input) =>
      client.invoke(chatRpcChannelByMethod.runOperation, input) as ReturnType<
        ChatApi['runOperation']
      >,
    sendMessage: (input) =>
      client.invoke(chatRpcChannelByMethod.sendMessage, input) as ReturnType<
        ChatApi['sendMessage']
      >,
    cancelOperation: (input) =>
      client.invoke(chatRpcChannelByMethod.cancelOperation, input) as ReturnType<
        ChatApi['cancelOperation']
      >,
    approveToolCall: (input) =>
      client.invoke(chatRpcChannelByMethod.approveToolCall, input) as ReturnType<
        ChatApi['approveToolCall']
      >,
    rejectToolCall: (input) =>
      client.invoke(chatRpcChannelByMethod.rejectToolCall, input) as ReturnType<
        ChatApi['rejectToolCall']
      >,
    onSessionEvent: (listener) =>
      client.on(RPC_CHANNELS.sessions.event, (event) => {
        listener(event as Parameters<typeof listener>[0])
      })
  }
}
