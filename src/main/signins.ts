import type { DB } from './db/index'
import { getMeta, setMeta } from './db/repo'

/**
 * Saved sign-ins: ordinary website passwords the person chooses to store so the
 * Assistant can log in for them. Passwords live in the encrypted secret store;
 * only the list of emails is kept in plain metadata. The AI model is never
 * given a password — it types a placeholder that the runner swaps at the keyboard.
 */
export interface SecretsLike {
  get(name: string): string | null
  set(name: string, value: string): void
  delete(name: string): void
  /** True when the OS keyring protects stored secrets. Optional so simple in-memory stores (tests) need not implement it. */
  isSecure?(): boolean
}

const LIST_KEY = 'signins'
const secretName = (email: string): string => `signin:${email.trim().toLowerCase()}`

export function listSignins(db: DB): string[] {
  const raw = getMeta(db, LIST_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((e) => typeof e === 'string') : []
  } catch {
    return []
  }
}

export function saveSignin(db: DB, secrets: SecretsLike, email: string, password: string): string[] {
  const e = email.trim().toLowerCase()
  if (!e || !password) throw new Error('Email and password are required.')
  secrets.set(secretName(e), password)
  const list = listSignins(db).filter((x) => x !== e)
  list.push(e)
  setMeta(db, LIST_KEY, JSON.stringify(list))
  return list
}

export function deleteSignin(db: DB, secrets: SecretsLike, email: string): string[] {
  const e = email.trim().toLowerCase()
  secrets.delete(secretName(e))
  const list = listSignins(db).filter((x) => x !== e)
  setMeta(db, LIST_KEY, JSON.stringify(list))
  return list
}

export function getSignin(db: DB, secrets: SecretsLike, email: string): { email: string; password: string } | null {
  const e = email.trim().toLowerCase()
  if (!listSignins(db).includes(e)) return null
  const password = secrets.get(secretName(e))
  return password ? { email: e, password } : null
}

/** Pick the saved sign-in that matches a site (by email domain) when none was named. */
export function pickSigninForHost(db: DB, secrets: SecretsLike, host: string): { email: string; password: string } | null {
  const h = host.toLowerCase()
  const brand = /google|gmail|youtube/.test(h) ? 'gmail.com' : /yahoo|aol/.test(h) ? 'yahoo.com' : /apple|icloud/.test(h) ? 'icloud.com' : /microsoft|live\.com|outlook|hotmail/.test(h) ? 'outlook.com' : null
  if (!brand) return null
  const same = listSignins(db).find((e) => e.endsWith(`@${brand}`) || (brand === 'gmail.com' && e.endsWith('@googlemail.com')) || (brand === 'outlook.com' && /@(hotmail|live|msn)\./.test(e)))
  return same ? getSignin(db, secrets, same) : null
}
