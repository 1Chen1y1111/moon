/**
 * 负责渲染 provider 设置里的新增 provider 对话框。
 * 它只收集用户输入并回传给父级，不直接调用 IPC 或保存设置。
 */

import { useState } from 'react'
import { Terminal } from 'lucide-react'

import { Button } from '@moon/ui/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@moon/ui/ui/dialog'
import { Input } from '@moon/ui/ui/input'
import { Label } from '@moon/ui/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@moon/ui/ui/select'
import { ScrollArea } from '@moon/ui/ui/scroll-area'
import { Switch } from '@moon/ui/ui/switch'
import { Textarea } from '@moon/ui/ui/textarea'
import { cn } from '@moon/ui/lib/utils'
import type { ProviderApiFormat } from '@moon/shared/domain/provider'

import type { CustomAcpProviderInput, CustomProviderInput } from '../types'

/**
 * 渲染对话框内字段标题，保持新增 provider 表单的标签样式一致。
 */
function DialogFieldLabel({
  children,
  htmlFor
}: {
  children: React.ReactNode
  htmlFor?: string
}): React.JSX.Element {
  return (
    <Label htmlFor={htmlFor} className="block text-sm font-semibold leading-6 text-foreground">
      {children}
    </Label>
  )
}

/**
 * 渲染对话框内字段说明，承载输入格式或协议边界提示。
 */
function DialogFieldHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{children}</span>
}

/**
 * 渲染自定义 HTTP provider 创建表单，并把 endpoint 与协议配置回传给父级。
 */
export function CustomProviderDialog({
  isSaving,
  onClose,
  onCreate
}: {
  isSaving: boolean
  onClose: () => void
  onCreate: (input: CustomProviderInput) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiFormat, setApiFormat] = useState<ProviderApiFormat>('openai-chat')
  const [useMaxCompletionTokens, setUseMaxCompletionTokens] = useState(false)
  const [customHeaders, setCustomHeaders] = useState('')

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        className="px-0 sm:max-w-105"
        showCloseButton={false}
        aria-label="Add Custom Provider"
      >
        <DialogHeader className="px-4">
          <DialogTitle className="text-xl font-medium leading-7 text-foreground">
            Add Custom Provider
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-2 px-4">
            <div>
              <DialogFieldLabel>Provider Name</DialogFieldLabel>
              <Input
                aria-label="Custom Provider Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={cn('mt-3')}
                placeholder="My Custom Provider"
              />
            </div>
            <div>
              <DialogFieldLabel>Endpoint URL</DialogFieldLabel>
              <Input
                aria-label="Custom Provider Endpoint URL"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className={cn('mt-3')}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div>
              <DialogFieldLabel>
                API Key <span className="text-xs text-muted-foreground">(可选)</span>
              </DialogFieldLabel>
              <Input
                aria-label="Custom Provider API Key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className={cn('mt-3')}
                placeholder="your-api-key"
              />
            </div>
            <div>
              <DialogFieldLabel>Protocol</DialogFieldLabel>
              <Select
                value={apiFormat}
                onValueChange={(value) => setApiFormat(value as ProviderApiFormat)}
              >
                <SelectTrigger aria-label="Custom Provider Protocol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-chat">Chat Completions (/chat/completions)</SelectItem>
                  <SelectItem value="openai-responses">Responses (/responses)</SelectItem>
                  <SelectItem value="anthropic">Anthropic Messages (/v1/messages)</SelectItem>
                </SelectContent>
              </Select>
              <DialogFieldHint>Choose the protocol this custom endpoint uses.</DialogFieldHint>
            </div>
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-semibold leading-6 text-foreground">
                  Use max_completion_tokens
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Enable for newer OpenAI models (o1, o3, etc.) that require max_completion_tokens
                  instead of max_tokens
                </p>
              </div>
              <Switch
                checked={useMaxCompletionTokens}
                aria-label="Custom Provider Use max_completion_tokens"
                onCheckedChange={setUseMaxCompletionTokens}
              />
            </div>
            <div>
              <DialogFieldLabel>Custom Headers (JSON)</DialogFieldLabel>
              <Textarea
                aria-label="Custom Provider Headers"
                value={customHeaders}
                onChange={(event) => setCustomHeaders(event.target.value)}
                className={cn('mt-3')}
                placeholder={'{\n "User-Agent": "claude-code/0.1.0"\n}'}
              />
              <DialogFieldHint>
                Optional HTTP headers to send with each request (must be valid JSON format).
              </DialogFieldHint>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-none bg-transparent px-8">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={isSaving || name.trim().length === 0}
            onClick={() =>
              onCreate({
                name,
                baseUrl,
                apiKey,
                apiFormat,
                useMaxCompletionTokens,
                customHeaders
              })
            }
          >
            Add Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 渲染自定义 ACP provider 创建表单，并把命令配置回传给父级。
 */
export function CustomAcpProviderDialog({
  isSaving,
  onClose,
  onCreate
}: {
  isSaving: boolean
  onClose: () => void
  onCreate: (input: CustomAcpProviderInput) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [acpCommand, setAcpCommand] = useState('')
  const [acpArgs, setAcpArgs] = useState('')

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        className="sm:max-w-105"
        showCloseButton={false}
        aria-label="Add Custom ACP Provider"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-md text-foreground">
            <Terminal aria-hidden="true" />
            Add Custom ACP Provider
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div>
            <DialogFieldLabel>Provider Name</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Provider Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn('mt-3')}
              placeholder="Provider name"
            />
          </div>
          <div>
            <DialogFieldLabel>Command</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Command"
              value={acpCommand}
              onChange={(event) => setAcpCommand(event.target.value)}
              className={cn('mt-3')}
              placeholder="e.g., claude-code-acp, gemini, codex"
            />
            <DialogFieldHint>The CLI command to spawn the ACP agent</DialogFieldHint>
          </div>
          <div>
            <DialogFieldLabel>Arguments (optional)</DialogFieldLabel>
            <Input
              aria-label="Custom ACP Arguments"
              value={acpArgs}
              onChange={(event) => setAcpArgs(event.target.value)}
              className={cn('mt-3')}
              placeholder="e.g.,--acp --experimental-acp"
            />
            <DialogFieldHint>Command line arguments (space-separated)</DialogFieldHint>
          </div>

          <div className="bg-card p-2 text-xs">
            <div>Note:</div>
            ACP providers spawn local CLI processes. Make sure the command is installed and
            accessible in your PATH. You can configure MCP servers after creating the provider.
          </div>
        </div>

        <DialogFooter className="border-none bg-transparent">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={isSaving || name.trim().length === 0 || acpCommand.trim().length === 0}
            onClick={() => onCreate({ name, acpCommand, acpArgs })}
          >
            Add Custom ACP Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
