import { describe, expect, it } from 'vitest'
import { applyTrackingDecisions } from '../src/main/ai/track'
import type { IssueRecord, ProjectRecord } from '../src/shared/types'

const NOW = '2026-09-05T12:00:00.000Z'
let counter = 0
const newId = (): string => `new-${++counter}`

const project = (id: string, name: string): ProjectRecord => ({
  id,
  name,
  statusSummary: 'old status',
  trend: 'steady',
  state: 'active',
  lastActivity: '2026-09-01T00:00:00.000Z',
  lastChange: 'nothing'
})

const issue = (id: string, title: string): IssueRecord => ({
  id,
  title,
  severity: 'medium',
  state: 'emerging',
  ownerAction: null,
  deadline: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
})

describe('applyTrackingDecisions', () => {
  it('updates an existing project by id and advances status', () => {
    const result = applyTrackingDecisions(
      [project('p1', 'Website relaunch')],
      [],
      {
        projects: [
          {
            action: 'update',
            id: 'p1',
            name: 'Website relaunch',
            statusSummary: 'Staging review this week',
            trend: 'up',
            state: 'active',
            whatChanged: 'Design signoff received'
          }
        ],
        issues: []
      },
      NOW,
      newId
    )
    expect(result.projects).toHaveLength(1)
    expect(result.projects[0].id).toBe('p1')
    expect(result.projects[0].statusSummary).toBe('Staging review this week')
    expect(result.projects[0].trend).toBe('up')
    expect(result.projects[0].lastActivity).toBe(NOW)
  })

  it('creates a project when update targets an unknown id (nothing lost)', () => {
    const result = applyTrackingDecisions(
      [],
      [],
      {
        projects: [
          {
            action: 'update',
            id: 'ghost',
            name: 'Q4 budget',
            statusSummary: 'Waiting on dept heads',
            trend: 'steady',
            state: 'active',
            whatChanged: '2 of 5 in'
          }
        ],
        issues: []
      },
      NOW,
      newId
    )
    expect(result.projects).toHaveLength(1)
    expect(result.projects[0].id).not.toBe('ghost')
    expect(result.projects[0].name).toBe('Q4 budget')
  })

  it('resolves an existing issue and ignores resolve on unknown ids', () => {
    const result = applyTrackingDecisions(
      [],
      [issue('i1', 'Contract unsigned')],
      {
        projects: [],
        issues: [
          { action: 'resolve', id: 'i1', title: 'Contract unsigned', severity: 'high', ownerAction: null, deadline: null },
          { action: 'resolve', id: 'nope', title: 'Ghost', severity: 'low', ownerAction: null, deadline: null }
        ]
      },
      NOW,
      newId
    )
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].state).toBe('resolved')
    expect(result.issues[0].updatedAt).toBe(NOW)
  })

  it('promotes an emerging issue to active on update and creates new issues as emerging', () => {
    const result = applyTrackingDecisions(
      [],
      [issue('i1', 'Outage complaints')],
      {
        projects: [],
        issues: [
          {
            action: 'update',
            id: 'i1',
            title: 'Outage complaints escalating',
            severity: 'urgent',
            ownerAction: 'Call Northwind back',
            deadline: null
          },
          { action: 'create', id: null, title: 'Invoice overdue', severity: 'medium', ownerAction: 'Pay it', deadline: '2026-09-12' }
        ]
      },
      NOW,
      newId
    )
    const updated = result.issues.find((i) => i.id === 'i1')!
    expect(updated.state).toBe('active')
    expect(updated.severity).toBe('urgent')
    const created = result.issues.find((i) => i.id !== 'i1')!
    expect(created.state).toBe('emerging')
    expect(created.deadline).toBe('2026-09-12')
  })
})
