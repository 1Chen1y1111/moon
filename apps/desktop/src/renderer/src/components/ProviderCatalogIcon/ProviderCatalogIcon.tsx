import type { ComponentProps, ComponentType } from 'react'
import { Bot, Cloud, Github, Terminal, Workflow } from 'lucide-react'

import AihubmixIconUrl from '@renderer/assets/llm-icons/aihubmix.png'
import AnthropicIcon from '@renderer/assets/llm-icons/anthropic.svg?react'
import AzureAiIcon from '@renderer/assets/llm-icons/azureai.svg?react'
import DeepSeekIcon from '@renderer/assets/llm-icons/deepseek.svg?react'
import GeminiIcon from '@renderer/assets/llm-icons/gemini.svg?react'
import KimiIcon from '@renderer/assets/llm-icons/kimi.svg?react'
import MoonshotIcon from '@renderer/assets/llm-icons/moonshot.svg?react'
import OpenAiIcon from '@renderer/assets/llm-icons/openai.svg?react'
import OpenRouterIcon from '@renderer/assets/llm-icons/openrouter.svg?react'
import ZhipuIcon from '@renderer/assets/llm-icons/zhipu.svg?react'
import { cn } from '@moon/ui/lib/utils'
import type { ProviderId } from '@moon/shared/domain/provider'

type ProviderIconAsset =
  | {
      mode: 'image'
      src: string
    }
  | {
      mode: 'component'
      Icon: ComponentType<ComponentProps<'svg'>>
    }

const providerIconAssets = {
  moonshot: {
    mode: 'component',
    Icon: MoonshotIcon
  },
  openai: {
    mode: 'component',
    Icon: OpenAiIcon
  },
  claude: {
    mode: 'component',
    Icon: AnthropicIcon
  },
  gemini: {
    mode: 'component',
    Icon: GeminiIcon
  },
  aihubmix: {
    mode: 'image',
    src: AihubmixIconUrl
  },
  deepseek: {
    mode: 'component',
    Icon: DeepSeekIcon
  },
  'z-ai-coding-plan': {
    mode: 'component',
    Icon: ZhipuIcon
  },
  'kimi-coding-plan': {
    mode: 'component',
    Icon: KimiIcon
  },
  openrouter: {
    mode: 'component',
    Icon: OpenRouterIcon
  },
  'azure-openai': {
    mode: 'component',
    Icon: AzureAiIcon
  }
} as const satisfies Partial<Record<ProviderId, ProviderIconAsset>>

const providerFallbackIcons = {
  'github-copilot': Github,
  'claude-subscription': AnthropicIcon,
  'claude-code-acp': Terminal,
  'gemini-acp': Terminal,
  'codex-acp': Terminal,
  volcengine: Cloud,
  ollama: Bot,
  'cloudflare-ai-gateway': Cloud
} as const satisfies Partial<Record<ProviderId, ComponentType<{ className?: string }>>>

const providerIconSizeClassNames = {
  sm: 'size-4',
  md: 'size-5'
} as const

type ProviderCatalogIconProps = {
  provider: ProviderId
  size?: keyof typeof providerIconSizeClassNames
}

export function ProviderCatalogIcon({
  provider,
  size = 'md'
}: ProviderCatalogIconProps): React.JSX.Element {
  const icon = providerIconAssets[provider]
  const iconClassName = cn(providerIconSizeClassNames[size], 'shrink-0 text-muted-foreground')

  if (icon?.mode === 'component') {
    const Icon = icon.Icon

    return <Icon aria-hidden="true" focusable="false" className={iconClassName} />
  }

  if (icon?.mode === 'image') {
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        className={cn(iconClassName, 'object-contain opacity-80')}
      />
    )
  }

  const FallbackIcon = providerFallbackIcons[provider] ?? Workflow

  return <FallbackIcon aria-hidden="true" className={iconClassName} />
}
