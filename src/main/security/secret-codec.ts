export type SecretCodec = {
  encrypt: (plainText: string) => string
  decrypt: (encryptedText: string) => string
}
