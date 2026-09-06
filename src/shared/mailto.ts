/** Hand an item to someone else: opens the mail app with the item written out. Recipient left blank on purpose. */
export function delegateMailto(title: string, nextStep: string, whyNow?: string): string {
  const body = `Could you take this one?\n\n${title}\n${whyNow ? `Why now: ${whyNow}\n` : ''}Next step: ${nextStep}\n\nThanks,\n`
  const params = new URLSearchParams({ subject: `Please handle: ${title}`, body })
  return `mailto:?${params.toString().replace(/\+/g, '%20')}`
}

/** A mailto: link that opens the person's own mail app with a suggested reply. InboxScout never sends it. */
export function replyMailto(to: string, subject: string, counterpart: string): string {
  const firstName = (counterpart.split(/[\s<@]/)[0] || '').replace(/[^a-zA-Z'-]/g, '') || 'there'
  const body = `Hi ${firstName},\n\nThanks for your note about "${subject}".\n\n\n\nBest,\n`
  const params = new URLSearchParams({ subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, body })
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, '%20')}`
}
