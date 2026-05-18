import electron from 'electron'

import windowsIcon from '../../../build/icon.ico?asset'
import icon from '../../../resources/icon.png?asset'

const { app } = electron

export const browserWindowIcon = process.platform === 'win32' ? windowsIcon : icon

export function setApplicationIcon(): void {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }
}
