import { safeStorage } from 'electron'

import type { SecretCodec } from './secret-codec'

type SafeStorageApi = {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
  getSelectedStorageBackend?: () => string
}

export class SafeStorageSecretCodec implements SecretCodec {
  constructor(private readonly storage: SafeStorageApi) {}

  encrypt(plainText: string): string {
    this.assertEncryptionAvailable()

    return this.storage.encryptString(plainText).toString('base64')
  }

  decrypt(encryptedText: string): string {
    if (encryptedText.length === 0) {
      return ''
    }

    this.assertEncryptionAvailable()

    return this.storage.decryptString(Buffer.from(encryptedText, 'base64'))
  }

  private assertEncryptionAvailable(): void {
    if (!this.storage.isEncryptionAvailable()) {
      throw new Error('Secure storage is unavailable.')
    }

    if (this.storage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('Secure storage is unavailable.')
    }
  }
}

export function createSafeStorageSecretCodec(): SecretCodec {
  return new SafeStorageSecretCodec(safeStorage)
}
