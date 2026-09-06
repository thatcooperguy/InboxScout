import type { MessageRecord } from '../../shared/types'
import type { IncomingAttachment } from '../attachments/types'

/** A message as returned by the fetchers: the record plus any attachment bytes that passed the policy. */
export type FetchedMessage = MessageRecord & { attachments?: IncomingAttachment[] }
