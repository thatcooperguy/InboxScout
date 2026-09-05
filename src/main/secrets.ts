import { safeStorage } from 'electron'
import type { DB } from './db/index'
import { getMeta, setMeta } from './db/repo'

/**
 * Secrets (mail app passwords, AI API keys) are encrypted with the OS
 * keystore (DPAPI on Windows, Keychain on macOS) via Electron safeStorage
 * and stored as base64 ciphertext in the local database.
 */
export class SecretStore {
  constructor(private db: DB) {}

  private available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  set(name: string, value: string): void {
    if (this.available()) {
      const enc = safeStorage.encryptString(value).toString('base64')
      setMeta(this.db, `secret:${name}`, `enc:${enc}`)
    } else {
      // Dev/headless fallback; flagged so the UI can warn.
      setMeta(this.db, `secret:${name}`, `plain:${Buffer.from(value, 'utf8').toString('base64')}`)
    }
  }

  get(name: string): string | null {
    const stored = getMeta(this.db, `secret:${name}`)
    if (!stored) return null
    if (stored.startsWith('enc:')) {
      if (!this.available()) return null
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    return null
  }

  delete(name: string): void {
    setMeta(this.db, `secret:${name}`, '')
  }
}

export const accountSecretName = (accountId: string): string => `account:${accountId}`
export const providerSecretName = (provider: string): string => `provider:${provider}`
