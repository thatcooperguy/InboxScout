import { describe, expect, it } from 'vitest'
import { MockLanguageModelV2 } from 'ai/test'
import type { LanguageModel } from 'ai'
import { openDatabase } from '../src/main/db/index'
import * as repo from '../src/main/db/repo'
import { ASK_SYSTEM, actionsFrom, askAi, askTools, buildAskCtx, sourcesFrom, type AskCtx } from '../src/main/ask/ai'

/**
 * The AI answerer with a fake model: the tools are read-only, draft_reply yields an open_draft action
 * (a mailto: the person sends themselves) and never anything that sends, and the final text is redacted.
 */

const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 }

function db() {
  const d = openDatabase(':memory:')
  repo.insertMessage(d, {
    id: 'm-jane',
    accountId: 'acc-1',
    folder: 'INBOX',
    uid: 1,
    messageId: '<1@x>',
    threadKey: 'lease renewal',
    fromAddress: 'jane.park@example.com',
    fromName: 'Jane Park',
    toAddresses: 'me@example.com',
    subject: 'Lease renewal',
    date: '2026-09-03T10:00:00.000Z',
    snippet: 'Can you sign the lease renewal this week? Password: hunter2',
    bodyText: 'Can you sign the lease renewal this week? Password: hunter2. Card 4111 1111 1111 1111.',
    fromMe: false,
    listUnsubscribe: null,
    hasAttachments: false
  })
  return d
}

function ctxWith(model: LanguageModel, d = db()): AskCtx {
  return buildAskCtx(d, model, { now: new Date(2026, 8, 6, 12), ownerName: 'Ann' })
}

describe('ask AI tools', () => {
  it('exposes exactly the eight read-only tools with zod input schemas', () => {
    const tools = askTools(ctxWith(new MockLanguageModelV2() as unknown as LanguageModel))
    expect(Object.keys(tools).sort()).toEqual(['draft_reply', 'get_brief', 'get_schedule', 'list_issues', 'list_people', 'list_promises', 'read_message', 'search_mail'])
    for (const t of Object.values(tools)) {
      expect(t.inputSchema).toBeTruthy()
      expect(typeof t.execute).toBe('function')
    }
    // Nothing that sends, resolves, or changes anything.
    for (const name of Object.keys(tools)) expect(name).not.toMatch(/send|resolve|setting|desktop|file|run|assistant|connect/)
    const draft: any = tools.draft_reply.inputSchema
    expect(draft.safeParse({ to: 'not-an-email', subject: 's', body: 'b', name: 'n' }).success).toBe(false)
    expect(draft.safeParse({ to: 'jane.park@example.com', subject: 's', body: 'b', name: 'Jane' }).success).toBe(true)
    expect(draft.safeParse({ to: 'jane.park@example.com', subject: 's', body: 'x'.repeat(1201), name: 'Jane' }).success).toBe(false)
    const search: any = tools.search_mail.inputSchema
    expect(search.safeParse({ q: 'lease', limit: 9 }).success).toBe(false)
    expect(search.safeParse({ q: 'lease' }).success).toBe(true)
  })

  it('redacts every tool result and caps search hits', async () => {
    const tools = askTools(ctxWith(new MockLanguageModelV2() as unknown as LanguageModel))
    const opts = { toolCallId: 't1', messages: [] }
    const hits: any = await tools.search_mail.execute!({ q: "Jane's lease?", limit: 8 }, opts)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ id: 'm-jane', subject: 'Lease renewal', from: 'Jane Park <jane.park@example.com>' })
    expect(hits[0].snippet).toContain('Password: ••••••')
    expect(hits[0].snippet).not.toContain('hunter2')
    const msg: any = await tools.read_message.execute!({ id: 'm-jane' }, opts)
    expect(msg.text).not.toContain('hunter2')
    expect(msg.text).not.toContain('4111')
    expect(msg.text).toContain('•••• (number hidden)')
    expect(await tools.read_message.execute!({ id: 'nope' }, opts)).toBeNull()
    expect(await tools.get_brief.execute!({}, opts)).toMatchObject({ note: expect.stringContaining('No brief yet') })
    expect(await tools.list_promises.execute!({}, opts)).toEqual([])
    expect(await tools.get_schedule.execute!({}, opts)).toEqual({ days: [], overdue: [], conflicts: [] })
    const people: any = await tools.list_people.execute!({ name: 'jane' }, opts)
    expect(people[0]).toMatchObject({ address: 'jane.park@example.com' })
    const draft: any = await tools.draft_reply.execute!({ to: 'jane.park@example.com', subject: 'Lease renewal', body: "I'll sign it Friday.", name: 'Jane' }, opts)
    expect(draft.opened).toBe(true)
    expect(draft.mailto.startsWith('mailto:jane.park%40example.com?subject=Re%3A%20Lease%20renewal')).toBe(true)
    expect(new URLSearchParams(draft.mailto.split('?')[1]).get('body')).toBe("Hi Jane,\n\nI'll sign it Friday.\n\nBest,\nAnn")
  })

  it('fills the system prompt and keeps its hard rules verbatim', () => {
    expect(ASK_SYSTEM).toContain('You can NEVER send email.')
    expect(ASK_SYSTEM).toContain('NEVER repeat passwords, codes, account numbers, card numbers, or ID numbers')
    expect(ASK_SYSTEM).toContain('Today is {today}. The person\'s name is {ownerName}.')
  })
})

describe('askAi with a fake model', () => {
  it('turns a draft_reply call into an open_draft action, never a send, with redacted text', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: [
        {
          content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'draft_reply', input: JSON.stringify({ to: 'jane.park@example.com', subject: 'Lease renewal', body: "I'll sign it Friday.", name: 'Jane' }) }],
          finishReason: 'tool-calls',
          usage,
          warnings: []
        },
        {
          content: [{ type: 'text', text: 'I opened a draft to Jane saying you will sign it Friday — press Send in your mail app. Her password: hunter2 stays private. From: Lease renewal — Jane Park — 2026-09-03' }],
          finishReason: 'stop',
          usage,
          warnings: []
        }
      ]
    })
    const ctx = ctxWith(model as unknown as LanguageModel)
    const a = await askAi(ctx, "Tell Jane I'll sign it Friday", new AbortController().signal)
    expect(a.engine).toBe('ai')
    expect(a.unsure).toBe(false)
    expect(a.text).toContain('I opened a draft to Jane')
    expect(a.text).not.toContain('hunter2')
    expect(a.actions).toHaveLength(1)
    expect(a.actions[0]).toMatchObject({ kind: 'open_draft', auto: true, label: 'Open the draft to Jane' })
    expect(a.actions[0].mailto!.startsWith('mailto:jane.park%40example.com?')).toBe(true)
    expect(a.actions.some((x) => /send/i.test(x.kind))).toBe(false)
    // The system prompt reached the model with today and the owner's name filled in.
    const first = model.doGenerateCalls[0]
    const system = first.prompt.find((m) => m.role === 'system') as { content: string }
    expect(system.content).toContain('Today is 2026-09-06. The person\'s name is Ann.')
    expect(first.tools?.map((t) => t.name).sort()).toContain('draft_reply')
  })

  it('cites the messages it read (max 3) and stops after four steps', async () => {
    const searchCall = { content: [{ type: 'tool-call' as const, toolCallId: 's', toolName: 'search_mail', input: JSON.stringify({ q: 'lease' }) }], finishReason: 'tool-calls' as const, usage, warnings: [] }
    const readCall = { content: [{ type: 'tool-call' as const, toolCallId: 'r', toolName: 'read_message', input: JSON.stringify({ id: 'm-jane' }) }], finishReason: 'tool-calls' as const, usage, warnings: [] }
    const model = new MockLanguageModelV2({ doGenerate: [searchCall, readCall, readCall, readCall, readCall, readCall] })
    const a = await askAi(ctxWith(model as unknown as LanguageModel), 'What is the lease about?', new AbortController().signal).catch((e) => e)
    // Four steps of tool calls and no text: the AI answer is refused so the local one stands.
    expect(a).toBeInstanceOf(Error)
    expect(model.doGenerateCalls.length).toBe(4)
    const steps = [{ toolResults: [{ toolName: 'search_mail', input: {}, output: [{ id: 'm-jane', subject: 'Lease renewal', from: 'Jane Park <j@x>', date: '2026-09-03T10:00:00.000Z', snippet: '' }] }] }, { toolResults: [{ toolName: 'read_message', input: {}, output: { id: 'm-jane', subject: 'Lease renewal', from: 'Jane Park <j@x>', date: '2026-09-03T10:00:00.000Z' } }] }]
    const sources = sourcesFrom(steps, new Date(2026, 8, 6))
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ messageId: 'm-jane' })
    expect(sources[0].label).toMatch(/^Lease renewal · Jane Park · Thu$/)
    expect(actionsFrom(steps)).toEqual([])
  })

  it('honours the abort signal', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: async ({ abortSignal }) => {
        await new Promise((_, reject) => abortSignal?.addEventListener('abort', () => reject(new Error('aborted'))))
        return { content: [], finishReason: 'stop', usage, warnings: [] }
      }
    })
    const controller = new AbortController()
    const p = askAi(ctxWith(model as unknown as LanguageModel), 'anything', controller.signal)
    setTimeout(() => controller.abort(), 10)
    await expect(p).rejects.toThrow()
  })
})
