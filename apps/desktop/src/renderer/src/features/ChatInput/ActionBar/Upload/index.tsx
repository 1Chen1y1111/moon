import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, FolderUp, ImageUp, Paperclip } from 'lucide-react'
import { toast } from 'sonner'

import { useAppRouterContext } from '@renderer/app/router/router-context'
import { selectChatSessions } from '@renderer/store/chat/selectors'
import { useChatStore } from '@renderer/store/chat'
import { selectAppSettings } from '@renderer/store/settings/selectors'
import { useSettingsStore } from '@renderer/store/settings'
import {
  findChatProviderModel,
  isSupportedChatProvider,
  selectChatModelId,
  selectDefaultChatProvider
} from '@moon/shared/domain/chat-provider'
import { resolveAutoProviderModelCapability } from '@moon/shared/domain/provider'
import type { ProviderSettings } from '@moon/shared/domain/settings'
import { maxChatAttachmentsPerMessage } from '@moon/shared/domain/chat-validation'

import Action from '../components/Action'

const supportedTextFileExtensions = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'log',
  'ts',
  'tsx',
  'js',
  'jsx',
  'css',
  'html',
  'xml',
  'yml',
  'yaml'
])

const textFileAccept = [
  'text/*',
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.xml',
  '.yml',
  '.yaml'
].join(',')

function selectProviderForPage(
  providers: Record<string, ProviderSettings>,
  activeSessionProvider: string | undefined,
  draftProviderId: string | null | undefined
): ProviderSettings | undefined {
  const draftProvider =
    draftProviderId === undefined || draftProviderId === null
      ? undefined
      : providers[draftProviderId]

  if (draftProvider?.enabled && isSupportedChatProvider(draftProvider)) {
    return draftProvider
  }

  if (activeSessionProvider !== undefined) {
    return providers[activeSessionProvider]
  }

  try {
    return selectDefaultChatProvider({ appearance: { theme: 'system' }, providers })
  } catch {
    return undefined
  }
}

function isSupportedTextFile(file: File): boolean {
  if (file.type.startsWith('text/') || file.type === 'application/json') {
    return true
  }

  const extension = file.name.split('.').at(-1)?.toLowerCase()

  return extension !== undefined && supportedTextFileExtensions.has(extension)
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function isSupportedFolderFile(file: File, canUploadImage: boolean): boolean {
  return isSupportedTextFile(file) || (canUploadImage && isImageFile(file))
}

export default function Upload(): React.JSX.Element {
  const { routeState } = useAppRouterContext()
  const appSettings = useSettingsStore(selectAppSettings)
  const sessions = useChatStore(selectChatSessions)
  const draftAttachmentCount = useChatStore((state) => state.draftAttachments.length)
  const uploadChatAttachments = useChatStore((state) => state.uploadChatAttachments)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === routeState.activeChatId),
    [routeState.activeChatId, sessions]
  )
  const activeProvider = selectProviderForPage(
    appSettings.providers,
    activeSession?.provider,
    routeState.draftProviderId
  )
  const selectedModelId = selectChatModelId(activeProvider)
  const selectedModel = findChatProviderModel(activeProvider, selectedModelId)
  const canUploadImage =
    selectedModel !== undefined &&
    resolveAutoProviderModelCapability(selectedModel, 'supportsVision')

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    folderInputRef.current?.setAttribute('directory', '')
  }, [])

  function handleFiles(fileList: FileList | null, kind: 'image' | 'file' | 'folder'): void {
    const files = Array.from(fileList ?? [])

    if (files.length === 0) {
      return
    }

    const remainingSlots = Math.max(maxChatAttachmentsPerMessage - draftAttachmentCount, 0)
    const supportedCandidates =
      kind === 'image'
        ? files.filter(isImageFile)
        : kind === 'folder'
          ? files.filter((file) => isSupportedFolderFile(file, canUploadImage))
          : files.filter(isSupportedTextFile)
    const supportedFiles = supportedCandidates.slice(0, remainingSlots)

    if (kind === 'folder') {
      const skippedImages = files.some((file) => isImageFile(file) && !canUploadImage)
      if (skippedImages) {
        toast.warning('当前模型不支持图片输入，已跳过文件夹中的图片')
      } else if (supportedCandidates.length !== files.length) {
        toast.warning('已跳过文件夹中不支持的文件')
      }
    } else if (supportedCandidates.length !== files.length) {
      toast.warning(kind === 'image' ? '只能上传图片文件' : '当前仅支持文本类文件')
    }

    if (supportedCandidates.length > supportedFiles.length) {
      toast.warning(`每条消息最多 ${maxChatAttachmentsPerMessage} 个附件`)
    }

    if (supportedFiles.length > 0) {
      void uploadChatAttachments(supportedFiles)
    }
  }

  return (
    <>
      <Action
        icon={Paperclip}
        open={open}
        pressed={open}
        showTooltip={false}
        title="上传附件"
        trigger="both"
        dropdown={{
          items: [
            {
              key: 'upload-image',
              icon: ImageUp,
              label: '上传图片',
              disabled: !canUploadImage,
              onSelect: (event) => {
                event.preventDefault()
                if (!canUploadImage) {
                  toast.warning('当前模型不支持图片输入')
                  return
                }
                setOpen(false)
                imageInputRef.current?.click()
              }
            },
            {
              key: 'upload-file',
              icon: FileUp,
              label: '上传文件',
              onSelect: (event) => {
                event.preventDefault()
                setOpen(false)
                fileInputRef.current?.click()
              }
            },
            {
              key: 'upload-folder',
              icon: FolderUp,
              label: '上传文件夹',
              onSelect: (event) => {
                event.preventDefault()
                setOpen(false)
                folderInputRef.current?.click()
              }
            }
          ],
          minWidth: 180,
          placement: 'topLeft'
        }}
        onOpenChange={setOpen}
      />
      <input
        ref={imageInputRef}
        multiple
        hidden
        accept="image/*"
        data-upload-kind="image"
        type="file"
        onChange={(event) => {
          handleFiles(event.currentTarget.files, 'image')
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        multiple
        hidden
        accept={textFileAccept}
        data-upload-kind="file"
        type="file"
        onChange={(event) => {
          handleFiles(event.currentTarget.files, 'file')
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        multiple
        hidden
        accept={canUploadImage ? `image/*,${textFileAccept}` : textFileAccept}
        data-upload-kind="folder"
        type="file"
        onChange={(event) => {
          handleFiles(event.currentTarget.files, 'folder')
          event.currentTarget.value = ''
        }}
      />
    </>
  )
}
