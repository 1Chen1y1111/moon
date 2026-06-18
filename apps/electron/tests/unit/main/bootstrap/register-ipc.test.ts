// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeHandlerMock = vi.fn()
const handleMock = vi.fn()
const fromWebContentsMock = vi.fn()
const getAllWindowsMock = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: fromWebContentsMock,
    getAllWindows: getAllWindowsMock
  },
  ipcMain: {
    removeHandler: removeHandlerMock,
    handle: handleMock
  }
}))

function getRegisteredHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  return handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1]
}

describe('registerIpcHandlers', () => {
  const chatService = {
    approveToolCall: vi.fn(),
    cancelOperation: vi.fn(),
    createMessageTurn: vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    getMessages: vi.fn(),
    importAttachment: vi.fn(),
    listThreads: vi.fn(),
    listSessions: vi.fn(),
    listTopics: vi.fn(),
    rejectToolCall: vi.fn(),
    runOperation: vi.fn(),
    sendMessage: vi.fn()
  }
  const settingsService = {
    getSettings: vi.fn(),
    saveAppearance: vi.fn(),
    saveProvider: vi.fn()
  }
  const projectsService = {
    createChangeEvent: vi.fn(),
    deleteProject: vi.fn(),
    getActiveProject: vi.fn(),
    listProjects: vi.fn(),
    setActiveProject: vi.fn(),
    useExistingFolder: vi.fn()
  }
  const openSettingsWindow = vi.fn()

  beforeEach(() => {
    removeHandlerMock.mockReset()
    handleMock.mockReset()
    fromWebContentsMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([])
    chatService.approveToolCall.mockReset()
    chatService.cancelOperation.mockReset()
    chatService.createMessageTurn.mockReset()
    chatService.createSession.mockReset()
    chatService.deleteSession.mockReset()
    chatService.getMessages.mockReset()
    chatService.importAttachment.mockReset()
    chatService.listThreads.mockReset()
    chatService.listSessions.mockReset()
    chatService.listTopics.mockReset()
    chatService.rejectToolCall.mockReset()
    chatService.runOperation.mockReset()
    chatService.sendMessage.mockReset()
    settingsService.getSettings.mockReset()
    settingsService.saveAppearance.mockReset()
    settingsService.saveProvider.mockReset()
    projectsService.createChangeEvent.mockReset()
    projectsService.deleteProject.mockReset()
    projectsService.getActiveProject.mockReset()
    projectsService.listProjects.mockReset()
    projectsService.setActiveProject.mockReset()
    projectsService.useExistingFolder.mockReset()
    openSettingsWindow.mockReset()
  })

  it('registers settings handlers that delegate through the settings service', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const settings = createDefaultAppSettings()
    const input = {
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    }

    settingsService.getSettings.mockResolvedValue(settings)
    settingsService.saveAppearance.mockResolvedValue(settings)
    settingsService.saveProvider.mockResolvedValue(settings)

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    const getSettingsHandler = getRegisteredHandler(ipcChannels.settings.get)
    const saveAppearanceHandler = getRegisteredHandler(ipcChannels.settings.saveAppearance)
    const saveProviderHandler = getRegisteredHandler(ipcChannels.settings.saveProvider)

    expect(getSettingsHandler).toBeTypeOf('function')
    expect(saveAppearanceHandler).toBeTypeOf('function')
    expect(saveProviderHandler).toBeTypeOf('function')
    expect(await getSettingsHandler?.({ sender: {} })).toBe(settings)
    expect(await saveAppearanceHandler?.({ sender: {} }, { theme: 'dark' })).toBe(settings)
    expect(await saveProviderHandler?.({ sender: {} }, input)).toBe(settings)
    expect(settingsService.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
    expect(settingsService.saveProvider).toHaveBeenCalledWith(input)
  })

  it('registers chat handlers that delegate through the chat service', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const session = {
      id: 'session-1',
      projectId: null,
      provider: 'openai',
      title: '新聊天',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const message = {
      id: 'message-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      threadId: 'thread-1',
      role: 'user',
      content: 'hello',
      status: 'complete',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const topic = {
      id: 'topic-1',
      sessionId: 'session-1',
      title: '默认话题',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const thread = {
      id: 'thread-1',
      topicId: 'topic-1',
      title: '主线',
      type: 'standalone',
      status: 'active',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const operation = {
      id: 'operation-1',
      appContext: { sessionId: 'session-1' },
      topicId: 'topic-1',
      threadId: 'thread-1',
      status: 'done',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:01.000Z',
      completedAt: '2026-05-09T00:00:01.000Z'
    }
    const toolInvocation = {
      id: 'tool-1',
      operationId: 'operation-1',
      messageId: 'message-1',
      name: 'read_file',
      arguments: {},
      status: 'done',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:01.000Z'
    }
    const attachment = {
      id: 'attachment-1',
      name: 'note.txt',
      mimeType: 'text/plain',
      size: 5,
      kind: 'file',
      createdAt: '2026-05-09T00:00:00.000Z'
    }
    const attachmentInput = {
      name: 'note.txt',
      mimeType: 'text/plain',
      size: 5,
      data: new ArrayBuffer(5)
    }

    chatService.listSessions.mockResolvedValue([session])
    chatService.getMessages.mockResolvedValue([message])
    chatService.listTopics.mockResolvedValue([topic])
    chatService.listThreads.mockResolvedValue([thread])
    chatService.createSession.mockResolvedValue(session)
    chatService.deleteSession.mockResolvedValue(undefined)
    chatService.importAttachment.mockResolvedValue(attachment)
    chatService.createMessageTurn.mockResolvedValue({
      session,
      topic,
      thread,
      operation,
      userMessage: message,
      assistantMessage: { ...message, id: 'message-2', role: 'assistant', content: '' }
    })
    chatService.runOperation.mockResolvedValue({
      operation,
      messages: [message]
    })
    chatService.sendMessage.mockResolvedValue({
      session,
      topic,
      thread,
      operation,
      messages: [message]
    })
    chatService.cancelOperation.mockResolvedValue(operation)
    chatService.approveToolCall.mockResolvedValue(toolInvocation)
    chatService.rejectToolCall.mockResolvedValue({ ...toolInvocation, status: 'rejected' })

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(await getRegisteredHandler(ipcChannels.chat.listSessions)?.({ sender: {} })).toEqual([
      session
    ])
    expect(
      await getRegisteredHandler(ipcChannels.chat.getMessages)?.(
        { sender: {} },
        { sessionId: 'session-1' }
      )
    ).toEqual([message])
    expect(
      await getRegisteredHandler(ipcChannels.chat.listTopics)?.(
        { sender: {} },
        { sessionId: 'session-1' }
      )
    ).toEqual([topic])
    expect(
      await getRegisteredHandler(ipcChannels.chat.listThreads)?.(
        { sender: {} },
        { topicId: 'topic-1' }
      )
    ).toEqual([thread])
    expect(await getRegisteredHandler(ipcChannels.chat.createSession)?.({ sender: {} })).toBe(
      session
    )
    await expect(
      getRegisteredHandler(ipcChannels.chat.deleteSession)?.(
        { sender: {} },
        { sessionId: 'session-1' }
      )
    ).resolves.toBeUndefined()
    expect(
      await getRegisteredHandler(ipcChannels.chat.importAttachment)?.(
        { sender: {} },
        attachmentInput
      )
    ).toBe(attachment)
    const sender = { send: vi.fn() }
    expect(
      await getRegisteredHandler(ipcChannels.chat.createMessageTurn)?.(
        { sender: {} },
        { content: 'hello' }
      )
    ).toEqual({
      session,
      topic,
      thread,
      operation,
      userMessage: message,
      assistantMessage: { ...message, id: 'message-2', role: 'assistant', content: '' }
    })
    expect(
      await getRegisteredHandler(ipcChannels.chat.runOperation)?.(
        { sender },
        { operationId: 'operation-1' }
      )
    ).toEqual({
      operation,
      messages: [message]
    })
    expect(
      await getRegisteredHandler(ipcChannels.chat.sendMessage)?.({ sender }, { content: 'hello' })
    ).toEqual({
      session,
      topic,
      thread,
      operation,
      messages: [message]
    })
    expect(
      await getRegisteredHandler(ipcChannels.chat.cancelOperation)?.(
        { sender: {} },
        { operationId: 'operation-1' }
      )
    ).toBe(operation)
    expect(
      await getRegisteredHandler(ipcChannels.chat.approveToolCall)?.(
        { sender: {} },
        { toolInvocationId: 'tool-1' }
      )
    ).toBe(toolInvocation)
    expect(
      await getRegisteredHandler(ipcChannels.chat.rejectToolCall)?.(
        { sender: {} },
        { toolInvocationId: 'tool-1' }
      )
    ).toEqual({ ...toolInvocation, status: 'rejected' })
    expect(chatService.getMessages).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(chatService.listTopics).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(chatService.listThreads).toHaveBeenCalledWith({ topicId: 'topic-1' })
    expect(chatService.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(chatService.importAttachment).toHaveBeenCalledWith(attachmentInput)
    expect(chatService.createMessageTurn).toHaveBeenCalledWith({ content: 'hello' })
    expect(chatService.runOperation).toHaveBeenCalledWith(
      { operationId: 'operation-1' },
      expect.any(Function)
    )
    expect(chatService.sendMessage).toHaveBeenCalledWith({ content: 'hello' }, expect.any(Function))

    const operationEventListener = chatService.runOperation.mock.calls[0][1]
    operationEventListener({
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      message
    })

    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, {
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      message
    })

    const eventListener = chatService.sendMessage.mock.calls[0][1]
    eventListener({
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      message
    })

    expect(sender.send).toHaveBeenCalledWith(ipcChannels.chat.sessionEvent, {
      type: 'message-created',
      operationId: 'operation-1',
      session,
      topic,
      thread,
      message
    })
  })

  it('broadcasts saved settings to open renderer windows', async () => {
    const { createDefaultAppSettings } = await import('@moon/shared/domain/settings')
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const settings = createDefaultAppSettings()
    const firstWebContents = { send: vi.fn() }
    const secondWebContents = { send: vi.fn() }

    settingsService.saveAppearance.mockResolvedValue(settings)
    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    const saveAppearanceHandler = getRegisteredHandler(ipcChannels.settings.saveAppearance)

    expect(await saveAppearanceHandler?.({ sender: {} }, { theme: 'dark' })).toBe(settings)
    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.settings.onChange, settings)
  })

  it('registers project handlers and broadcasts project changes', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')
    const project = {
      id: 'project-1',
      name: 'moon',
      path: '/workspace/moon',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z'
    }
    const event = {
      activeProject: project,
      projects: [project]
    }
    const firstWebContents = { send: vi.fn() }
    const secondWebContents = { send: vi.fn() }

    projectsService.listProjects.mockResolvedValue([project])
    projectsService.getActiveProject.mockResolvedValue(project)
    projectsService.useExistingFolder.mockResolvedValue(project)
    projectsService.setActiveProject.mockResolvedValue(project)
    projectsService.deleteProject.mockResolvedValue(undefined)
    projectsService.createChangeEvent.mockResolvedValue(event)
    getAllWindowsMock.mockReturnValue([
      { webContents: firstWebContents },
      { webContents: secondWebContents }
    ])

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    expect(await getRegisteredHandler(ipcChannels.projects.list)?.({ sender: {} })).toEqual([
      project
    ])
    expect(await getRegisteredHandler(ipcChannels.projects.getActive)?.({ sender: {} })).toBe(
      project
    )
    expect(
      await getRegisteredHandler(ipcChannels.projects.useExistingFolder)?.({ sender: {} })
    ).toBe(project)
    expect(
      await getRegisteredHandler(ipcChannels.projects.setActive)?.(
        { sender: {} },
        { projectId: 'project-1' }
      )
    ).toBe(project)
    expect(
      await getRegisteredHandler(ipcChannels.projects.delete)?.(
        { sender: {} },
        { projectId: 'project-1' }
      )
    ).toBeUndefined()

    expect(projectsService.setActiveProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(projectsService.deleteProject).toHaveBeenCalledWith({ projectId: 'project-1' })
    expect(firstWebContents.send).toHaveBeenCalledWith(ipcChannels.projects.onChange, event)
    expect(secondWebContents.send).toHaveBeenCalledWith(ipcChannels.projects.onChange, event)
  })

  it('registers window control handlers that operate on the sender window', async () => {
    const browserWindow = {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn()
    }

    fromWebContentsMock.mockReturnValue(browserWindow)

    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      chatService: chatService as never,
      openSettingsWindow,
      projectsService: projectsService as never,
      settingsService: settingsService as never
    })

    const closeHandler = getRegisteredHandler(ipcChannels.window.close)
    const minimizeHandler = getRegisteredHandler(ipcChannels.window.minimize)
    const toggleMaximizeHandler = getRegisteredHandler(ipcChannels.window.toggleMaximize)

    expect(closeHandler).toBeTypeOf('function')
    expect(minimizeHandler).toBeTypeOf('function')
    expect(toggleMaximizeHandler).toBeTypeOf('function')

    const event = { sender: {} }

    await closeHandler?.(event)
    await minimizeHandler?.(event)
    await toggleMaximizeHandler?.(event)

    expect(fromWebContentsMock).toHaveBeenCalledTimes(3)
    expect(browserWindow.close).toHaveBeenCalledTimes(1)
    expect(browserWindow.minimize).toHaveBeenCalledTimes(1)
    expect(browserWindow.maximize).toHaveBeenCalledTimes(1)
    expect(browserWindow.unmaximize).not.toHaveBeenCalled()
  })

  it('registers a handler that opens the dedicated settings window', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      chatService: chatService as never,
      projectsService: projectsService as never,
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const openSettingsHandler = getRegisteredHandler(ipcChannels.window.openSettings)

    expect(openSettingsHandler).toBeTypeOf('function')

    await openSettingsHandler?.()
    await openSettingsHandler?.({ sender: {} }, { section: 'providers' })

    expect(openSettingsWindow).toHaveBeenCalledTimes(2)
    expect(openSettingsWindow).toHaveBeenCalledWith(undefined)
    expect(openSettingsWindow).toHaveBeenCalledWith({ section: 'providers' })
  })

  it('rejects unsupported settings-window sections before opening a window', async () => {
    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      chatService: chatService as never,
      projectsService: projectsService as never,
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const openSettingsHandler = getRegisteredHandler(ipcChannels.window.openSettings)

    expect(() => openSettingsHandler?.({ sender: {} }, { section: 'general' })).toThrow()
    expect(openSettingsWindow).not.toHaveBeenCalled()
  })

  it('registers a handler that reads the sender window state', async () => {
    const browserWindow = {
      isMaximized: vi.fn(() => true)
    }

    fromWebContentsMock.mockReturnValue(browserWindow)

    const { registerIpcHandlers } = await import('@main/bootstrap/register-ipc')
    const { ipcChannels } = await import('@ipc/channels')

    registerIpcHandlers({
      chatService: chatService as never,
      projectsService: projectsService as never,
      settingsService: settingsService as never,
      openSettingsWindow
    })

    const getStateHandler = getRegisteredHandler(ipcChannels.window.getState)

    expect(getStateHandler).toBeTypeOf('function')
    expect(getStateHandler?.({ sender: {} })).toEqual({ isMaximized: true })
  })
})
