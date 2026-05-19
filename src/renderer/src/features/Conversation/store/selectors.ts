import type { ConversationStore } from './index'

const context = (state: ConversationStore): ConversationStore['context'] => state.context

const inputMessage = (state: ConversationStore): string => state.inputMessage

const messages = (state: ConversationStore): ConversationStore['messages'] => state.messages

const operationState = (state: ConversationStore): ConversationStore['operationState'] =>
  state.operationState

const runtimeInfo = (state: ConversationStore): ConversationStore['runtimeInfo'] =>
  state.runtimeInfo

export const conversationSelectors = {
  context,
  inputMessage,
  messages,
  operationState,
  runtimeInfo
}
