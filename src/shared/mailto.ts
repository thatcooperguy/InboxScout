/** A mailto: link that opens the person's own mail app with a suggested reply. InboxScout never sends it. */
export function replyMailto(to: string, subject: string, counterpart: string): string {
  const firstName = (counterpart.split(/[\s<@]/)[0] || '').replace(/[^a-zA-Z'-]/g, '') || 'there'
  const body = `Hi ${firstName},\n\nThanks for your note about "${subject}".\n\n\n\nBest,\n`
  const params = new URLSearchParams({ subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, body })
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, '%20')}`
}
