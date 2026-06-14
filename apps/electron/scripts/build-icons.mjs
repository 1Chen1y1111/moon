#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const buildDir = join(projectRoot, 'build')
const resourcesDir = join(projectRoot, 'resources')
const sourceLogo = join(resourcesDir, 'logo.png')
const staleBuildIconsDir = join(buildDir, 'icons')
const resourcesIconsDir = join(resourcesDir, 'icons')
const buildIconPng = join(buildDir, 'icon.png')
const resourceIconPng = join(resourcesDir, 'icon.png')
const buildIconIcns = join(buildDir, 'icon.icns')
const buildIconIco = join(buildDir, 'icon.ico')
const trayIconPng = join(resourcesDir, 'tray_icon.png')
const trayIconRetinaPng = join(resourcesDir, 'tray_icon@2x.png')

const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const iconArtworkScale = 0.84

const icnsEntries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

const icoSizes = [16, 24, 32, 48, 64, 128, 256]

function iconPath(iconDir, size) {
  return join(iconDir, `${size}x${size}.png`)
}

function assertDarwinTool(toolName) {
  if (process.platform !== 'darwin') {
    throw new Error(`build:icons 需要 macOS 自带的 ${toolName}`)
  }

  execFileSync('/usr/bin/which', [toolName], { stdio: 'ignore' })
}

function readPngSize(filePath) {
  const data = readFileSync(filePath)
  const pngSignature = '89504e470d0a1a0a'

  if (data.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('源 logo 必须是 PNG 文件')
  }

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  }
}

function assertSourceLogo() {
  if (!existsSync(sourceLogo)) {
    throw new Error(`找不到源 logo: ${sourceLogo}`)
  }

  const { width, height } = readPngSize(sourceLogo)

  if (width !== height) {
    throw new Error(`源 logo 必须是正方形，当前是 ${width}x${height}`)
  }

  if (width < 1024) {
    throw new Error(`源 logo 至少需要 1024x1024，当前是 ${width}x${height}`)
  }
}

function resizePng(size, outputPath) {
  const artworkSize = Math.max(1, Math.round(size * iconArtworkScale))

  execFileSync(
    'sips',
    [
      '-z',
      String(artworkSize),
      String(artworkSize),
      '--padToHeightWidth',
      String(size),
      String(size),
      sourceLogo,
      '--out',
      outputPath
    ],
    {
      stdio: 'ignore'
    }
  )
}

function createIco(entries, outputPath) {
  const images = entries.map(({ size, path }) => ({
    size,
    data: readFileSync(path)
  }))
  const headerSize = 6
  const entrySize = 16
  const header = Buffer.alloc(headerSize)
  let dataOffset = headerSize + entrySize * images.length

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directoryEntries = images.map(({ size, data }) => {
    const directoryEntry = Buffer.alloc(entrySize)
    const iconSize = size >= 256 ? 0 : size

    directoryEntry.writeUInt8(iconSize, 0)
    directoryEntry.writeUInt8(iconSize, 1)
    directoryEntry.writeUInt8(0, 2)
    directoryEntry.writeUInt8(0, 3)
    directoryEntry.writeUInt16LE(1, 4)
    directoryEntry.writeUInt16LE(32, 6)
    directoryEntry.writeUInt32LE(data.length, 8)
    directoryEntry.writeUInt32LE(dataOffset, 12)
    dataOffset += data.length

    return directoryEntry
  })

  writeFileSync(
    outputPath,
    Buffer.concat([header, ...directoryEntries, ...images.map(({ data }) => data)])
  )
}

function buildIcons() {
  assertDarwinTool('sips')
  assertDarwinTool('iconutil')
  assertSourceLogo()
  mkdirSync(buildDir, { recursive: true })
  mkdirSync(resourcesDir, { recursive: true })
  rmSync(staleBuildIconsDir, { recursive: true, force: true })
  rmSync(resourcesIconsDir, { recursive: true, force: true })
  mkdirSync(resourcesIconsDir, { recursive: true })

  const tempDir = mkdtempSync(join(tmpdir(), 'moon-icons-'))
  const iconsetDir = join(tempDir, 'Moon.iconset')

  try {
    mkdirSync(iconsetDir)
    for (const size of iconSizes) {
      resizePng(size, iconPath(resourcesIconsDir, size))
    }

    copyFileSync(iconPath(resourcesIconsDir, 512), buildIconPng)
    copyFileSync(buildIconPng, resourceIconPng)
    copyFileSync(iconPath(resourcesIconsDir, 16), trayIconPng)
    copyFileSync(iconPath(resourcesIconsDir, 32), trayIconRetinaPng)

    for (const [fileName, size] of icnsEntries) {
      copyFileSync(iconPath(resourcesIconsDir, size), join(iconsetDir, fileName))
    }

    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', buildIconIcns], {
      stdio: 'ignore'
    })

    const icoEntries = icoSizes.map((size) => {
      return {
        size,
        path: iconPath(resourcesIconsDir, size)
      }
    })

    createIco(icoEntries, buildIconIco)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

buildIcons()
console.log(
  '已从 resources/logo.png 生成 build/icon.png、build/icon.icns、build/icon.ico、resources/icon.png、resources/icons/* 和 resources/tray_icon*.png'
)
