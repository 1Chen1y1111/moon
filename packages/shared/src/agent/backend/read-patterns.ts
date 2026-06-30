/**
 * 负责识别安全的文件读取 shell 命令，并输出适合映射为 Read 工具的结构化信息。
 * 这里只处理低误判的简单命令，不尝试完整解释 shell 语法。
 */

const SHELL_EXECUTABLES = new Set(['/bin/zsh', '/bin/bash', '/bin/sh', 'zsh', 'bash', 'sh'])
const SHELL_META_CHARS = new Set(['|', '&', ';', '<', '>'])

export type ReadCommandInfo = {
  /** 被读取的文件路径，保持命令里的原始路径文本。 */
  filePath: string
  /** 读取起始行，按 Claude Read 工具语义使用 1-based 行号。 */
  startLine?: number
  /** 读取结束行，包含该行；tail 这类无法确定起点的命令不会填。 */
  endLine?: number
  /** 原始 shell 命令，用于后续展示或调试。 */
  originalCommand: string
}

/**
 * 尝试把简单 shell 读取命令解析为 Read 工具输入所需的信息。
 */
export function parseReadCommand(command: string): ReadCommandInfo | null {
  const trimmed = command.trim()

  if (trimmed.length === 0) {
    return null
  }

  const tokens = tokenizeSimpleCommand(trimmed)

  if (tokens === null) {
    return null
  }

  const wrappedRead = parseShellWrappedReadCommand(tokens, command)

  if (wrappedRead !== null) {
    return wrappedRead
  }

  return parseDirectReadCommand(tokens, command)
}

/**
 * 把命令切成简单 token；遇到管道、重定向、链式命令或未闭合引号时直接放弃。
 */
function tokenizeSimpleCommand(command: string): string[] | null {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]

    if (quote === null && SHELL_META_CHARS.has(char)) {
      return null
    }

    if (quote === null && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    if (quote === null && (char === '"' || char === "'")) {
      quote = char
      continue
    }

    if (quote !== null && char === quote) {
      quote = null
      continue
    }

    if (quote !== "'" && char === '\\' && index + 1 < command.length) {
      index += 1
      current += command[index]
      continue
    }

    current += char
  }

  if (quote !== null) {
    return null
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens.length === 0 ? null : tokens
}

/**
 * 识别 `/bin/zsh -lc 'cat file'` 这类简单 shell wrapper，并递归解析内部命令。
 */
function parseShellWrappedReadCommand(tokens: string[], originalCommand: string): ReadCommandInfo | null {
  if (!SHELL_EXECUTABLES.has(tokens[0])) {
    return null
  }

  const commandFlagIndex = tokens.findIndex(
    (token) => token === '-c' || /^-[A-Za-z]*c$/.test(token)
  )

  if (commandFlagIndex < 0 || tokens.length !== commandFlagIndex + 2) {
    return null
  }

  const readInfo = parseReadCommand(tokens[commandFlagIndex + 1])

  return readInfo === null ? null : { ...readInfo, originalCommand }
}

/**
 * 根据首个命令名分发到低误判的读取命令解析器。
 */
function parseDirectReadCommand(tokens: string[], originalCommand: string): ReadCommandInfo | null {
  switch (tokens[0]) {
    case 'cat':
      return parseCatCommand(tokens, originalCommand)
    case 'sed':
      return parseSedCommand(tokens, originalCommand)
    case 'head':
      return parseHeadCommand(tokens, originalCommand)
    case 'tail':
      return parseTailCommand(tokens, originalCommand)
    default:
      return null
  }
}

/**
 * 只接受无参数、单文件的 `cat file`。
 */
function parseCatCommand(tokens: string[], originalCommand: string): ReadCommandInfo | null {
  const filePath = tokens[1]

  if (tokens.length !== 2 || !isReadablePathToken(filePath)) {
    return null
  }

  return { filePath, originalCommand }
}

/**
 * 只接受 `sed -n 'start,endp' file` 和 `sed -n 'linep' file`。
 */
function parseSedCommand(tokens: string[], originalCommand: string): ReadCommandInfo | null {
  const pattern = tokens[2]
  const filePath = tokens[3]

  if (tokens.length !== 4 || tokens[1] !== '-n' || !isReadablePathToken(filePath)) {
    return null
  }

  const rangeMatch = pattern.match(/^(\d+),(\d+)p$/)

  if (rangeMatch !== null) {
    const startLine = readPositiveInteger(rangeMatch[1])
    const endLine = readPositiveInteger(rangeMatch[2])

    if (startLine === null || endLine === null || endLine < startLine) {
      return null
    }

    return { filePath, startLine, endLine, originalCommand }
  }

  const singleLineMatch = pattern.match(/^(\d+)p$/)

  if (singleLineMatch !== null) {
    const line = readPositiveInteger(singleLineMatch[1])

    return line === null
      ? null
      : { filePath, startLine: line, endLine: line, originalCommand }
  }

  return null
}

/**
 * 解析 `head -n 50 file` 和 `head -50 file`，并映射为从第 1 行开始的范围。
 */
function parseHeadCommand(tokens: string[], originalCommand: string): ReadCommandInfo | null {
  const parsed =
    tokens.length === 4 && tokens[1] === '-n'
      ? { limit: readPositiveInteger(tokens[2]), filePath: tokens[3] }
      : tokens.length === 3 && /^-\d+$/.test(tokens[1])
        ? { limit: readPositiveInteger(tokens[1].slice(1)), filePath: tokens[2] }
        : null

  if (parsed === null || parsed.limit === null || !isReadablePathToken(parsed.filePath)) {
    return null
  }

  return {
    filePath: parsed.filePath,
    startLine: 1,
    endLine: parsed.limit,
    originalCommand
  }
}

/**
 * 解析 `tail -n 50 file` 和 `tail -50 file`；因不知道文件总行数，不填 offset/limit。
 */
function parseTailCommand(tokens: string[], originalCommand: string): ReadCommandInfo | null {
  const parsed =
    tokens.length === 4 && tokens[1] === '-n'
      ? { limit: readPositiveInteger(tokens[2]), filePath: tokens[3] }
      : tokens.length === 3 && /^-\d+$/.test(tokens[1])
        ? { limit: readPositiveInteger(tokens[1].slice(1)), filePath: tokens[2] }
        : null

  if (parsed === null || parsed.limit === null || !isReadablePathToken(parsed.filePath)) {
    return null
  }

  return { filePath: parsed.filePath, originalCommand }
}

/**
 * 判断文件路径 token 是否足够普通；以短横线开头的路径需要 `--`，本阶段先不支持。
 */
function isReadablePathToken(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && !value.startsWith('-')
}

/**
 * 读取正整数，避免 0、负数、NaN 或小数进入 line range。
 */
function readPositiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number.parseInt(value, 10)

  return parsed > 0 ? parsed : null
}
