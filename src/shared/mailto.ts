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

export const SUPPORT_EMAIL = 'hello@inboxscout.ai'

/**
 * "Email us" from the Health section (v1.5.7): opens the person's own mail app addressed to support with a
 * short, fill-in-the-blank body. The diagnostics themselves are put on the clipboard by the caller (mail
 * links cannot carry a long text), so the body says where to paste.
 */
export function supportMailto(version: string, platform: string): string {
  const body =
    'What I was trying to do:\n\n\nWhat happened instead:\n\n\n' +
    '(The diagnostics are already copied. Click below this line and press Paste. They hold no email text and no passwords.)\n\n' +
    `InboxScout ${version} on ${platform}\n`
  const params = new URLSearchParams({ subject: `InboxScout help (${version})`, body })
  return `mailto:${SUPPORT_EMAIL}?${params.toString().replace(/\+/g, '%20')}`
}
