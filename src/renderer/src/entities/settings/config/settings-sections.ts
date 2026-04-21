import {
  Bot,
  Brain,
  Cable,
  Database,
  FolderOpen,
  Gauge,
  Globe,
  Hand,
  Info,
  Keyboard,
  Languages,
  MemoryStick,
  MessageCircle,
  Package2,
  Palette,
  PersonStanding,
  Plug,
  ScanSearch,
  Settings,
  Sparkles,
  VenetianMask,
  WalletCards,
  Wifi,
  Workflow
} from 'lucide-react'

import type { SettingsSection } from '../model/settings.types'

export const settingsSections: SettingsSection[] = [
  {
    id: 'general',
    label: '通用',
    title: '通用',
    description: '应用级通用配置与默认行为。',
    icon: Settings,
    kind: 'general'
  },
  {
    id: 'providers',
    label: '提供商',
    title: '提供商',
    description: '模型提供商与认证相关设置。',
    icon: WalletCards,
    kind: 'providers'
  },
  {
    id: 'agents',
    label: 'Agents',
    title: 'Agents',
    description: 'Agent 行为与默认选择。',
    icon: Bot,
    kind: 'placeholder'
  },
  {
    id: 'channels',
    label: '渠道',
    title: '渠道',
    description: '消息渠道与工作流入口。',
    icon: Cable,
    kind: 'placeholder'
  },
  {
    id: 'projects',
    label: '项目',
    title: '项目',
    description: '项目上下文与目录关联。',
    icon: FolderOpen,
    kind: 'placeholder'
  },
  {
    id: 'chat',
    label: '聊天',
    title: '聊天',
    description: '会话体验与默认行为。',
    icon: MessageCircle,
    kind: 'placeholder'
  },
  {
    id: 'token-savings',
    label: 'Token 节省',
    title: 'Token 节省',
    description: 'Token 使用和压缩策略。',
    icon: ScanSearch,
    kind: 'placeholder'
  },
  {
    id: 'quick-prompts',
    label: '快捷提示',
    title: '快捷提示',
    description: '提示模板与快捷入口。',
    icon: Sparkles,
    kind: 'placeholder'
  },
  {
    id: 'memory',
    label: '记忆',
    title: '记忆',
    description: '上下文记忆与保留策略。',
    icon: MemoryStick,
    kind: 'placeholder'
  },
  {
    id: 'mcp-servers',
    label: 'MCP 服务器',
    title: 'MCP 服务器',
    description: 'MCP 服务发现与连接。',
    icon: Plug,
    kind: 'placeholder'
  },
  {
    id: 'skills',
    label: '技能',
    title: '技能',
    description: '技能扩展与启用状态。',
    icon: Brain,
    kind: 'placeholder'
  },
  {
    id: 'plugins',
    label: 'Plugins',
    title: 'Plugins',
    description: '插件安装与管理。',
    icon: Package2,
    kind: 'placeholder'
  },
  {
    id: 'hooks',
    label: '钩子',
    title: '钩子',
    description: '自动化触发器与回调。',
    icon: Hand,
    kind: 'placeholder'
  },
  {
    id: 'voice',
    label: '语音',
    title: '语音',
    description: '语音输入与识别设置。',
    icon: VenetianMask,
    kind: 'placeholder'
  },
  {
    id: 'text-to-speech',
    label: 'Text-to-Speech',
    title: 'Text-to-Speech',
    description: '语音播报与声音偏好。',
    icon: Languages,
    kind: 'placeholder'
  },
  {
    id: 'people',
    label: 'People',
    title: 'People',
    description: '人物与角色配置。',
    icon: PersonStanding,
    kind: 'placeholder'
  },
  {
    id: 'web-search',
    label: '网络搜索',
    title: '网络搜索',
    description: '联网搜索能力与偏好。',
    icon: Globe,
    kind: 'placeholder'
  },
  {
    id: 'chrome-relay',
    label: 'Chrome Relay',
    title: 'Chrome Relay',
    description: '浏览器 relay 与连接状态。',
    icon: Workflow,
    kind: 'placeholder'
  },
  {
    id: 'user-interface',
    label: '用户界面',
    title: '用户界面',
    description: '界面布局与交互体验设置。',
    icon: PersonStanding,
    kind: 'user-interface'
  },
  {
    id: 'color-schemes',
    label: '配色方案',
    title: '配色方案',
    description: '主题、配色和外观方案。',
    icon: Palette,
    kind: 'placeholder'
  },
  {
    id: 'network',
    label: '网络',
    title: '网络',
    description: '网络连接与代理相关设置。',
    icon: Wifi,
    kind: 'placeholder'
  },
  {
    id: 'shortcuts',
    label: '快捷键',
    title: '快捷键',
    description: '全局和局部快捷键配置。',
    icon: Keyboard,
    kind: 'placeholder'
  },
  {
    id: 'data',
    label: '数据',
    title: '数据',
    description: '数据目录、缓存和导入导出。',
    icon: Database,
    kind: 'placeholder'
  },
  {
    id: 'usage',
    label: '使用量',
    title: '使用量',
    description: '用量统计和资源消耗信息。',
    icon: Gauge,
    kind: 'placeholder'
  },
  {
    id: 'about',
    label: '关于',
    title: '关于',
    description: '版本信息与应用说明。',
    icon: Info,
    kind: 'placeholder'
  }
]
