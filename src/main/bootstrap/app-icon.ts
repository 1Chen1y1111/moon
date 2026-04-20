import { app } from 'electron'

import icon from '../../../resources/icon.png?asset'

export function setApplicationIcon(): void {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }
}
