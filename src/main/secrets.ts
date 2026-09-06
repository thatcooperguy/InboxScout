import { safeStorage } from 'electron'
import type { DB } from './db/index'
import { getMeta, setMeta } from './db/repo'

/**
 * Secrets (mail app passwords, AI API keys) are encrypted with the OS
 * keystore (DPAPI on Windows, Keychain on macOS, gnome-keyring/kwallet on
 * Linux) via Electron safeStorage and stored as base64 ciphertext in the
 * local database.
 *
 * Linux without a keyring: Electron falls back to its `basic_text` backend
 * (a fixed key, so obfuscated rather than encrypted) when index.ts turns it on;
 * if even that is unavailable the store keeps a base64 copy. Either way nothing
 * crashes and saved passwords keep working; the "Password storage" health check
 * tells the person how to get real encryption.
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

  /** True when the OS keyring/keychain protects stored secrets; false for the obfuscated fallbacks. */
  isSecure(): boolean {
    if (!this.available()) return false
    if (process.platform !== 'linux') return true
    try {
      return safeStorage.getSelectedStorageBackend() !== 'basic_text'
    } catch {
      return true
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
      try {
        return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      } catch {
        // The key that encrypted this is gone (keyring reset, a different backend than when it was saved).
        // Treat it as "no saved password" so the health check can ask the person to reconnect instead of crashing.
        return null
      }
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
