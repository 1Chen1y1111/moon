#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const components = ['@ai-elements/conversation', '@ai-elements/message', '@ai-elements/reasoning']

function patchGeneratedComponents() {
  const reasoningPath = join(projectRoot, 'src/shadcn/ai-elements/reasoning.tsx')
  const source = readFileSync(reasoningPath, 'utf8')

  if (source.includes('return undefined;')) {
    return
  }

  const updated = source.replace(
    /(        return \(\) => clearTimeout\(timer\);\r?\n      }\r?\n)(    }, \[isStreaming, isOpen, setIsOpen, hasAutoClosed\];)/,
    '$1\n      return undefined;\n$2'
  )

  if (updated !== source) {
    writeFileSync(reasoningPath, updated)
  }
}

/**
 * @returns {void}
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function updateComponents() {
  if (components.length === 0) {
    console.log('AI Elements component list is empty')
    return
  }

  console.log(`Updating ${components.length} AI Elements components: ${components.join(', ')}`)

  try {
    const command = `cd "${projectRoot}" && pnpm dlx shadcn@latest add --overwrite --path src/shadcn/ai-elements ${components.join(' ')}`
    execSync(command, { stdio: 'inherit' })
    patchGeneratedComponents()
    console.log('AI Elements components updated')
  } catch (error) {
    console.error('Error updating AI Elements components:', error.message)
    process.exitCode = 1
  }
}

updateComponents()
