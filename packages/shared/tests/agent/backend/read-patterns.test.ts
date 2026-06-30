/**
 * 负责验证 shell read pattern 的保守识别规则。
 * 这些测试不运行真实 shell，只检查命令字符串到 ReadCommandInfo 的纯转换。
 */

import { describe, expect, it } from 'vitest'

import { parseReadCommand } from '../../../src/agent/backend/read-patterns'

describe('parseReadCommand', () => {
  it('detects cat with a single file path', () => {
    expect(parseReadCommand('cat README.md')).toEqual({
      filePath: 'README.md',
      originalCommand: 'cat README.md'
    })

    expect(parseReadCommand('cat /home/user/guide.md')).toEqual({
      filePath: '/home/user/guide.md',
      originalCommand: 'cat /home/user/guide.md'
    })
  })

  it('detects sed line ranges and single-line reads', () => {
    expect(parseReadCommand("sed -n '10,20p' src/app.ts")).toEqual({
      filePath: 'src/app.ts',
      startLine: 10,
      endLine: 20,
      originalCommand: "sed -n '10,20p' src/app.ts"
    })

    expect(parseReadCommand("sed -n '50p' src/app.ts")).toEqual({
      filePath: 'src/app.ts',
      startLine: 50,
      endLine: 50,
      originalCommand: "sed -n '50p' src/app.ts"
    })
  })

  it('detects head and tail limit forms', () => {
    expect(parseReadCommand('head -n 25 src/app.ts')).toEqual({
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 25,
      originalCommand: 'head -n 25 src/app.ts'
    })

    expect(parseReadCommand('head -25 src/app.ts')).toEqual({
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 25,
      originalCommand: 'head -25 src/app.ts'
    })

    expect(parseReadCommand('tail -n 25 src/app.ts')).toEqual({
      filePath: 'src/app.ts',
      originalCommand: 'tail -n 25 src/app.ts'
    })

    expect(parseReadCommand('tail -25 src/app.ts')).toEqual({
      filePath: 'src/app.ts',
      originalCommand: 'tail -25 src/app.ts'
    })
  })

  it('detects simple shell-wrapped read commands', () => {
    expect(parseReadCommand("/bin/zsh -lc 'cat guide.md'")).toEqual({
      filePath: 'guide.md',
      originalCommand: "/bin/zsh -lc 'cat guide.md'"
    })

    expect(parseReadCommand("bash -c 'cat /path/to/guide.md'")).toEqual({
      filePath: '/path/to/guide.md',
      originalCommand: "bash -c 'cat /path/to/guide.md'"
    })
  })

  it('returns null for ambiguous or non-read commands', () => {
    expect(parseReadCommand('cat -n README.md')).toBeNull()
    expect(parseReadCommand('cat README.md package.json')).toBeNull()
    expect(parseReadCommand('cat README.md | grep Moon')).toBeNull()
    expect(parseReadCommand('cat README.md > copy.md')).toBeNull()
    expect(parseReadCommand('cat README.md && echo done')).toBeNull()
    expect(parseReadCommand('ls -la')).toBeNull()
    expect(parseReadCommand('echo hello')).toBeNull()
    expect(parseReadCommand('rm -rf /')).toBeNull()
  })
})
