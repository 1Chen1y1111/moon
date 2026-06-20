/**
 * 负责把 server-core push 调用编码成 event MessageEnvelope。
 * 本文件只做 envelope 创建和发送转交。
 * 它不负责具体 client 查找、广播或网络连接。
 */

import { randomUUID } from 'node:crypto'

import type { MessageEnvelope, PushTarget } from '@moon/shared/protocol'
import type { RpcPushPort } from './types'

export type EnvelopePushPortSend = (target: PushTarget, envelope: MessageEnvelope) => void

export type EnvelopePushPortOptions = {
  /**
   * 接收已编码的 event envelope，并由具体 transport 决定如何投递。
   */
  send: EnvelopePushPortSend

  /**
   * 创建 event envelope id；测试可注入固定 id，运行时默认使用 randomUUID。
   */
  createId?: () => string
}

/**
 * 将 RpcPushPort 调用转换成可跨 transport 发送的 event envelope。
 */
export class EnvelopePushPort implements RpcPushPort {
  private readonly createId: () => string
  private readonly send: EnvelopePushPortSend

  /**
   * 创建 envelope push port，只注入发送函数，不绑定任何具体 transport。
   */
  constructor({ createId = randomUUID, send }: EnvelopePushPortOptions) {
    this.createId = createId
    this.send = send
  }

  /**
   * 编码 event envelope 并保留原始 PushTarget，供下游 transport 执行路由。
   */
  push(channel: string, target: PushTarget, ...args: unknown[]): void {
    this.send(target, createEventEnvelope(this.createId(), channel, target, args))
  }
}

/**
 * 根据 PushTarget 把 client/workspace 路由信息投射到 event envelope。
 */
function createEventEnvelope(
  id: string,
  channel: string,
  target: PushTarget,
  args: unknown[]
): MessageEnvelope {
  const envelope: MessageEnvelope = {
    id,
    type: 'event',
    channel,
    args
  }

  if (target.to === 'client') {
    return {
      ...envelope,
      clientId: target.clientId
    }
  }

  if (target.to === 'workspace') {
    return {
      ...envelope,
      workspaceId: target.workspaceId
    }
  }

  return envelope
}
