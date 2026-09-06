import type { Category, MessageRecord } from '../../shared/types'

export interface ThreadReplyState {
  subject: string
  counterpart: string
  /** Email address of the other party (for reply drafts). */
  address: string
  daysWaiting: number
}

export interface ReplyTrackerResult {
  /** Threads where the last message is inbound work mail that needs a reply. */
  waitingOnYou: ThreadReplyState[]
  /** Threads where the user spoke last and nobody has replied for a while. */
  waitingOnThem: ThreadReplyState[]
}

const WAITING_ON_THEM_MIN_DAYS = 2

/**
 * Pure reply-tracking over synced messages (INBOX + Sent).
 * Groups by threadKey, looks at who spoke last.
 */
export function trackReplies(
  messages: MessageRecord[],
  categoryOf: (messageId: string) => Category | undefined,
  now: Date
): ReplyTrackerResult {
  const threads = new Map<string, MessageRecord[]>()
  for (const m of messages) {
    const list = threads.get(m.threadKey) ?? []
    list.push(m)
    threads.set(m.threadKey, list)
  }
  const waitingOnYou: ThreadReplyState[] = []
  const waitingOnThem: ThreadReplyState[] = []
  for (const list of threads.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    const last = list[list.length - 1]
    const daysWaiting = Math.floor((now.getTime() - new Date(last.date).getTime()) / 86400000)
    if (last.fromMe) {
      if (daysWaiting >= WAITING_ON_THEM_MIN_DAYS) {
        const counterpartMsg = [...list].reverse().find((m) => !m.fromMe)
        waitingOnThem.push({
          subject: last.subject,
          counterpart: counterpartMsg
            ? counterpartMsg.fromName || counterpartMsg.fromAddress
            : last.toAddresses.split(',')[0]?.trim() || 'recipient',
          address: counterpartMsg?.fromAddress ?? last.toAddresses.split(',')[0]?.trim() ?? '',
          daysWaiting
        })
      }
    } else {
      const category = categoryOf(last.id)
      if (category === 'work') {
        waitingOnYou.push({
          subject: last.subject,
          counterpart: last.fromName || last.fromAddress,
          address: last.fromAddress,
          daysWaiting
        })
      }
    }
  }
  waitingOnYou.sort((a, b) => b.daysWaiting - a.daysWaiting)
  waitingOnThem.sort((a, b) => b.daysWaiting - a.daysWaiting)
  return { waitingOnYou: waitingOnYou.slice(0, 10), waitingOnThem: waitingOnThem.slice(0, 10) }
}
