#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = new Set(process.argv.slice(2))

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage:
  pnpm reset:data      Back up and reset Moon database + attachments
  pnpm reset:data:all  Back up and reset the whole Electron userData directory

Options:
  --dry-run            Print what would be moved without changing files`)
  process.exit(0)
}

const resetAll = args.has('--all')
const dryRun = args.has('--dry-run')
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = join(scriptDirectory, '..')
const cwd = process.cwd()
const cwdPackageJson = join(cwd, 'package.json')
const projectRoot =
  existsSync(cwdPackageJson) && JSON.parse(readFileSync(cwdPackageJson, 'utf8')).productName
    ? cwd
    : join(workspaceRoot, 'apps', 'desktop')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const appNames = [...new Set([packageJson.productName, packageJson.name].filter(Boolean))]

function getAppDataRoot() {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support')
  }

  if (platform() === 'win32') {
    return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  }

  return process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
}

function getBackupRoot() {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  return join(homedir(), 'Desktop', `moon-user-data-backup-${timestamp}`)
}

function getTargetPaths(appDataRoot) {
  const userDataDirectories = appNames.map((appName) => join(appDataRoot, appName))

  if (resetAll) {
    return userDataDirectories
  }

  return userDataDirectories.flatMap((userDataDirectory) => [
    join(userDataDirectory, 'moon-pglite'),
    join(userDataDirectory, 'attachments')
  ])
}

function getExistingUniquePaths(paths) {
  const seen = new Set()
  const existingPaths = []

  for (const path of paths) {
    if (!existsSync(path)) {
      continue
    }

    const stats = statSync(path)
    const realPath = `${stats.dev}:${stats.ino}`

    if (seen.has(realPath)) {
      continue
    }

    seen.add(realPath)
    existingPaths.push(path)
  }

  return existingPaths
}

function createBackupPath(targetPath, backupRoot) {
  const parentName = basename(dirname(targetPath))
  const targetName = basename(targetPath)

  if (resetAll) {
    return join(backupRoot, targetName)
  }

  return join(backupRoot, `${parentName}-${targetName}`)
}

const appDataRoot = getAppDataRoot()
const targets = getExistingUniquePaths(getTargetPaths(appDataRoot))

if (targets.length === 0) {
  console.log('No Moon user data found to reset.')
  process.exit(0)
}

const backupRoot = getBackupRoot()

console.log('Close Moon before running this command to avoid an open database handle.')
console.log(`Backup directory: ${backupRoot}`)

if (!dryRun) {
  mkdirSync(backupRoot, { recursive: true })
}

for (const target of targets) {
  const backupPath = createBackupPath(target, backupRoot)

  console.log(`${dryRun ? 'Would move' : 'Moving'} ${target}`)
  console.log(`  -> ${backupPath}`)

  if (!dryRun) {
    renameSync(target, backupPath)
  }
}

console.log(
  dryRun
    ? 'Dry run complete. Re-run without --dry-run to reset Moon user data.'
    : 'Moon user data reset complete. Restart Moon to create a fresh database.'
)
