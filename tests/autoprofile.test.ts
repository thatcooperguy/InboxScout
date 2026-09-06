import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { loadSettings, saveSettings } from '../src/main/settings'
import { DEFAULT_SETTINGS, type MessageRecord } from '../src/shared/types'
import { applyAutoProfile, detectNow, dismissSuggestion, readSuggestion } from '../src/main/profiles/auto'

function seed(db: ReturnType<typeof openDatabase>, rows: [string, string, string][]): void {
  rows.forEach(([subject, fromAddress, snippet], i) => {
    const m: MessageRecord = {
      id: `m${i}`,
      accountId: 'acc',
      folder: 'INBOX',
      uid: i + 1,
      messageId: `<m${i}@x>`,
      threadKey: `t${i}`,
      fromAddress,
      fromName: '',
      toAddresses: 'me@example.com',
      subject,
      date: new Date(2026, 8, 1 + (i % 28)).toISOString(),
      snippet,
      bodyText: snippet,
      fromMe: false,
      listUnsubscribe: null,
      hasAttachments: false
    }
    repo.insertMessage(db, m)
  })
}

const REALTOR: [string, string, string][] = [
  ['Showing request for 12 Oak St', 'noreply@showingtime.com', 'buyer agent requested a showing'],
  ['Counter offer on 45 Elm', 'jane@brokerage.com', 'Seller countered; escrow opens Monday'],
  ['MLS listing agreement', 'broker@realty.com', 'sign the listing agreement'],
  ['Home inspection scheduled', 'inspector@homeinspect.com', 'Inspection Tuesday 9am'],
  ['Closing disclosure ready', 'title@titleco.com', 'closing disclosure for review'],
  ['Open house Sunday', 'me@realty.com', 'open house 2-4'],
  ['Earnest money received', 'escrow@titleco.com', 'earnest money deposit received'],
  ['Appraisal came in', 'lender@bank.com', 'appraisal at value, pre-approval updated'],
  ['Price reduction on Maple', 'broker@realty.com', 'comps suggest a price reduction'],
  ...Array.from({ length: 12 }, (_, i): [string, string, string] => [`Lunch ${i}`, 'friend@example.com', 'are you free?'])
]

describe('auto profile', () => {
  it('switches a fresh install to the profile the mail looks like, and re-resolves skills', () => {
    const db = openDatabase(':memory:')
    seed(db, REALTOR)
    const s = loadSettings(db)
    expect(s.profileId).toBe('general')
    const r = applyAutoProfile(db, s)
    expect(r.changed).toBe(true)
    expect(r.profile.id).toBe('realestate')
    expect(r.notice).toMatch(/Real-estate agent/)
    expect(loadSettings(db).profileId).toBe('realestate')
    // Second run: nothing to do.
    const again = applyAutoProfile(db, loadSettings(db))
    expect(again.changed).toBe(false)
    expect(again.notice).toBeNull()
  })

  it('only suggests when the person locked their choice, and stays quiet once dismissed', () => {
    const db = openDatabase(':memory:')
    seed(db, REALTOR)
    saveSettings(db, { ...DEFAULT_SETTINGS, profileId: 'owner', profileAuto: false })
    const r = applyAutoProfile(db, loadSettings(db))
    expect(r.changed).toBe(false)
    expect(r.profile.id).toBe('owner')
    expect(r.notice).toMatch(/Looks like "Real-estate agent"/)
    expect(readSuggestion(db)?.id).toBe('realestate')
    dismissSuggestion(db)
    const after = applyAutoProfile(db, loadSettings(db))
    expect(after.notice).toBeNull()
    expect(loadSettings(db).profileId).toBe('owner')
  })

  it('does nothing on an empty or bland inbox', () => {
    const db = openDatabase(':memory:')
    expect(detectNow(db)).toBeNull()
    const r = applyAutoProfile(db, loadSettings(db))
    expect(r.changed).toBe(false)
    expect(r.notice).toBeNull()
  })
})
