import type { ProfileId } from '../../shared/types'

export interface WorkProfile {
  id: ProfileId
  name: string
  pulseName: string
  /** Injected into the classification prompt: what counts as "work" for this person. */
  workDescription: string
  /** Extra hints for what makes an issue urgent for this person. */
  urgencyHints: string[]
  /** Vocabulary for tracked entities, e.g. "project" vs "deal" vs "job". */
  entityNoun: string
}

export const PROFILES: Record<ProfileId, WorkProfile> = {
  owner: {
    id: 'owner',
    name: 'Business owner / executive',
    pulseName: 'Company Pulse',
    workDescription:
      'The user owns or runs a company. Work mail includes vendors, customers, finance, banking, ' +
      'legal, staff and HR matters, contracts, invoices, and anything about company operations or projects.',
    urgencyHints: [
      'contract or renewal deadlines',
      'customer escalations and complaints',
      'payments, invoices, or payroll problems',
      'anything a staff member is blocked on and waiting for the owner to approve'
    ],
    entityNoun: 'project'
  },
  realestate: {
    id: 'realestate',
    name: 'Real-estate agent',
    pulseName: 'Deal Pipeline',
    workDescription:
      'The user is a real-estate agent. Work mail includes clients (buyers and sellers), listings, showings, ' +
      'offers and counteroffers, lenders, title companies, inspectors, appraisers, escrow, MLS notices, and brokerage matters. ' +
      'Track each active deal as its own entity, named by property address or client, with a stage: ' +
      'listed, offer, under contract / escrow, or closed.',
    urgencyHints: [
      'expiring contingencies or option periods',
      'closing dates approaching',
      'unanswered client messages',
      'missing documents or signatures',
      'inspection and appraisal scheduling'
    ],
    entityNoun: 'deal'
  },
  utility: {
    id: 'utility',
    name: 'Utility / field professional',
    pulseName: 'Operations Pulse',
    workDescription:
      'The user works for a utility or field-operations company (for example a power company). Work mail includes ' +
      'shift and schedule notices, outage and safety bulletins, work orders, compliance and mandatory training deadlines, ' +
      'union or HR notices, and vendor or equipment matters.',
    urgencyHints: [
      'compliance or training due dates',
      'urgent directives from supervisors',
      'schedule or shift changes',
      'safety bulletins requiring acknowledgment'
    ],
    entityNoun: 'job'
  },
  general: {
    id: 'general',
    name: 'General professional',
    pulseName: 'Work Pulse',
    workDescription:
      'The user is a working professional. Work mail is anything from their employer, colleagues, clients, or ' +
      'professional services; personal mail is family, friends, household, health, and personal finance.',
    urgencyHints: ['deadlines', 'messages waiting on a reply from the user', 'meeting requests needing an answer'],
    entityNoun: 'project'
  }
}

export function getProfile(id: ProfileId): WorkProfile {
  return PROFILES[id] ?? PROFILES.general
}
