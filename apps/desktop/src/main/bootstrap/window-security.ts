import electron from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { is } from '@electron-toolkit/utils'

const { shell } = electron

type SecuredWindow = {
  webContents: {
    on: (
      eventName: 'will-navigate',
      listener: (event: { preventDefault: () => void }, url: string) => void
    ) => void
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => void
  }
}

const rendererFileUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href

function parseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

export function isAllowedExternalUrl(url: string): boolean {
  const parsedUrl = parseUrl(url)

  if (parsedUrl === null) {
    return false
  }

  if (parsedUrl.protocol === 'https:') {
    return true
  }

  return parsedUrl.protocol === 'http:' && is.dev && isLoopbackHost(parsedUrl.hostname)
}

export function isAllowedAppNavigation(url: string): boolean {
  const parsedUrl = parseUrl(url)

  if (parsedUrl === null) {
    return false
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = parseUrl(process.env['ELECTRON_RENDERER_URL'])

    return rendererUrl !== null && parsedUrl.origin === rendererUrl.origin
  }

  parsedUrl.hash = ''
  return parsedUrl.href === rendererFileUrl
}

export function registerWindowSecurity(window: SecuredWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      setImmediate(() => {
        void shell.openExternal(url)
      })
    }

    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url)) {
      event.preventDefault()
    }
  })
}
