# Scam guard (v1.6)

InboxScout looks at every new email for the shapes scams take, on your computer, with plain rules. No AI helper
is needed and nothing is sent anywhere. When something looks wrong it is the first thing on Today, it is read
aloud first, it is in the morning report and in the helper digest, and a trusted helper gets a heads-up of its own.

## What it looks for

| Shape | Example | What the card says |
|---|---|---|
| Pretending to be a company | "PayPal" writing from `alerts@paypa1-secure.com` | It says it is from PayPal, but the address is not a PayPal address. |
| A lookalike address | `no-reply@amazon-orders-help.com` | The address only looks like Amazon; it is not Amazon's real address. |
| A "bank" on a free mailbox | "Chase Security Team" from a gmail.com address | A company would not write from a personal gmail.com mailbox. |
| Fishing for details | "Verify your account details within 24 hours" | It asks you to confirm a password or account number by email. Real companies do not. |
| Pressure | "Your account will be suspended today" | It pushes you to act right away. Pressure is how scams stop you from thinking. |
| Odd ways to pay | gift cards, wire transfer, bitcoin, Western Union | No real company or government office asks for those. |
| The grandparent emergency | "It's me, I'm in jail, wire the bail, don't tell mom" | It sounds like a relative in an emergency who needs money fast. |
| Prizes and inheritances | "You have won $1,500,000, pay the processing fee" | A prize that needs a fee first is never real. |
| Tech support and "renewals" | "Your Geek Squad plan renewed for $399.99, call (888) 555-0142" | Do not call the number and do not let anyone connect to your computer. |
| Blackmail | "I recorded you, pay in bitcoin" | Delete it. It is a bluff. |
| Hidden links | bit.ly links, links to a bare IP address, look-alike characters | Its links hide where they really go. |

Thirty-five brands and institutions are known with their real domains (PayPal, Amazon, Apple, Microsoft, Google,
the IRS, Social Security, Medicare, the big banks, the parcel carriers, the antivirus vendors, and so on). Mail that
really comes from those domains is left alone even when it talks about "your account".

## Likely vs. possible

Each signal adds to a score. At **likely**, the email is filed under promotions and noise and can never appear
under *Needs you* or *Waiting on a reply*, so a scam is never presented as a chore. At **possible**, sorting is left
alone and the warning is shown alongside. A sender you actually reply to softens the score, since a real friend may
well write "urgent, wire the deposit today".

Nothing is ever deleted, moved, or reported. The card says so.

## Where it shows

- **Today** — the first card, in red, with the reasons and one line of advice. Simple shows one reason and keeps it
  among its three cards.
- **Read aloud** — "Careful: one email looks like a scam…" before anything else.
- **The report** and **Send me my brief** — a "Looks like a scam" section at the top.
- **Trusted helpers** — a heads-up of its own (`kind: scam`), once per message, in place of the generic "pushing you
  to pay" one. Helpers at any level get it; it names the sender and subject only, never the body.

## Under the hood

`src/main/pipeline/scams.ts` (`detectScam`, `detectScams`, `trustedSendersFrom`) runs in `run.ts` right after
classification, before issues are derived. Warnings ride on `Brief.scamWarnings`. Tests: `tests/scams.test.ts`
(the classic shapes, and the real mail it must leave alone).
