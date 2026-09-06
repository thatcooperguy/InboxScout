# Reads attachments and photos (v1.5)

Most of the important mail people get has the important part in a file: the invoice is a PDF, the school form is
a Word document, the quote is a spreadsheet, the bill Mom photographed with her phone is a JPEG. InboxScout now
reads what is *inside* those files, not just that they exist, and what it finds feeds the same brief — bills,
deadlines, private documents, "needs you" — as if it had been written in the email itself.

Everything happens on your computer. A photo or scan goes to your AI helper only when you connected one that can
see images; otherwise a built-in reader (OCR) does it offline. One switch turns it off: **Settings → Reading &
display → Read attachments and photos**.

## What it reads

| File | How | What you get |
|---|---|---|
| PDF | the text layer, on this computer | full text, a one-line summary, amounts, dates, who it is from or to |
| Word (`.docx`) | on this computer | same |
| Excel (`.xlsx`, `.csv`) | first 200 rows of each sheet, on this computer | same, with the numbers |
| Plain text, Markdown, JSON, HTML, forwarded `.eml` | on this computer | same |
| Photos and screenshots (`.png`, `.jpg`, `.webp`, `.gif`) | your AI helper if it can see images, else the built-in reader (OCR, English) | a summary of what the picture shows and the text in it |

The summary is one or two plain sentences — *"Invoice from Acme — $450.00 due Sep 30"* — written from the facts
by the built-in engine, or by the AI helper when it read the image.

## Where it shows up

- **The brief and Today.** A bland email that says "see attached" with an invoice inside becomes a bill with the
  amount and the due date. An item whose facts came from a file says so: *from the attached invoice.pdf* in its
  sources, and a small 📎 on the Today row.
- **Inbox review.** Under each email, one 📎 line per file: the file name, what it said, and **Open** while the
  file is still kept.
- **Ask about your mail.** *"What was in the pdf from Ron?"*, *"What did the invoice say?"*, *"Show me the photo
  from Mom"*. The local engine answers from the file's summary and facts; with an AI helper connected, the AI can
  read the file's text itself (`read_attachment`, redacted, first 1 500 characters).
- **Your phone.** The 📎 line under a Needs-you item, and the same questions in the Ask box.
- **Hermes and other agents.** Three bridge operations — see below.

## Privacy

- Files are saved under InboxScout's own data folder (`attachments/`), never anywhere else, and never sent by
  InboxScout to anyone.
- Documents are always read on this computer. Nothing about them leaves it unless you connected an AI helper, in
  which case the *text* the classifier sees (a capped excerpt, like the email body) goes to that helper — the
  same rule as for every email.
- Images go to the AI helper **only** if it can see images (Gemini, OpenAI, Claude, Grok, OpenRouter, or a custom
  endpoint). With Groq, Mistral, DeepSeek, Ollama, LM Studio, or the built-in engine, photos are read by the
  offline OCR reader and never leave the computer.
- Private details are hidden before an answer reaches the Ask AI (the same redaction as for email).
- The **files** are cleared after **Keep attachment files for this many days** (90 by default, Settings →
  Advanced); what they said stays in the local database and stays searchable. The **Attachment files** health
  check warns when they take more than 2 GB or outlive that setting, and **Fix it for me** clears the old ones.

## Limits

- **Scanned PDFs** (a picture of a page, no text layer) are listed with *"Scanned document, N pages — open it to
  read"* rather than read. Photograph the page or export it as an image if you want the text.
- **HEIC** photos from an iPhone are not read; the phone can be set to take JPEG, or the mail app converts them
  when you share.
- Files over **10 MB** are skipped, as is anything past **60 MB per message** or **250 MB per check**. Tiny inline
  images (logos, signatures under 20 KB) are ignored.
- OCR reads English. Handwriting, low light, and skewed photos come through only partly — the summary says so
  when little text was found.
- Reading is bounded per run (40 files, about 90 seconds); anything left waits for the next check.

## For Hermes and other agents

With the **Agent bridge** on:

| Goal | MCP tool | REST |
|---|---|---|
| Files attached to a message, with summaries and facts (never the path) | `list_attachments {messageId}` | `GET /v1/messages/{messageId}/attachments` |
| What a file said (summary, facts, text ≤ 20 000 chars) | `read_attachment {id}` | `GET /v1/attachments/{id}` |
| Open a file on the person's computer with its default app (Full access, desktop only) | `open_attachment {id}` | `POST /v1/attachments/{id}/open` |

`search_mail` and `recent_mail` hits still return message ids; call `list_attachments` for a hit to see its files.
The phone's API allows the two read operations and never `open_attachment`.

## Under the hood

- `src/main/attachments/` — the store (`saveIncoming`, `extractPending`, `findingsFor`, `attachmentsFor`,
  `attachmentText`, `searchAttachments`, `storageStats`, `cleanupFiles`), the readers, facts, and OCR.
- `src/main/mail/attachmentsPolicy.ts` — the size caps and the inline-image rule the fetchers apply.
- `src/main/pipeline/attachments.ts` — the pipeline's side: the `attachments` text block per message
  (`attachmentContext`), the vision function (`buildVision`, only for providers in `VISION_PROVIDERS`), and the
  "from the attached …" source line.
- `src/main/ai/classify.ts` (prompt), `src/main/ai/builtin.ts` (`attachmentSignals`: amounts → bills, dates →
  deadlines, private-document words → sensitivity), `src/main/ai/brief.ts` (`withAttachmentSources`).
- Settings `readAttachments` ('on' | 'off') and `attachmentsKeepDays` (90) in `src/shared/types.ts`.
- Spec: `docs/design/ATTACHMENTS-CONTRACT.md`.
