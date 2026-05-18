import { app, BrowserWindow } from 'electron'

type RegisterAppLifecycleInput = {
  createMainWindow: () => BrowserWindow
  closeApplicationResources: () => Promise<void>
}

function destroyOpenWindows(): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.destroy()
    }
  })
}

export function registerAppLifecycle({
  createMainWindow,
  closeApplicationResources
}: RegisterAppLifecycleInput): void {
  let isQuitting = false
  let hasClosedResources = false

  app.on('activate', () => {
    if (isQuitting) {
      return
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (isQuitting) {
      return
    }

    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', (event) => {
    if (hasClosedResources) {
      return
    }

    event.preventDefault()

    if (isQuitting) {
      return
    }

    isQuitting = true
    destroyOpenWindows()

    void closeApplicationResources()
      .catch((error) => {
        console.error('Failed to close application resources', error)
      })
      .finally(() => {
        hasClosedResources = true
        app.quit()
      })
  })
}
