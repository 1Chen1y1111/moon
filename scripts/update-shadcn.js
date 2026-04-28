#!/usr/bin/env node

import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const components = [
  'button',
  'tooltip',
  'checkbox',
  'dialog',
  'input',
  'label',
  'select',
  'switch',
  'textarea',
  'scroll-area',
  'input-group'
]

/**
 * @returns {void}
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function updateComponents() {
  if (components.length === 0) {
    console.log('组件列表为空，请在脚本中配置组件')
    return
  }

  console.log(`正在更新 ${components.length} 个组件: ${components.join(', ')}`)

  try {
    const command = `cd "${projectRoot}" && pnpm dlx shadcn@latest add --overwrite ${components.join(' ')}`
    execSync(command, { stdio: 'inherit' })
    console.log('组件更新完成 ✓')
  } catch (error) {
    console.error('更新组件时出错:', error.message)
  }
}

updateComponents()
