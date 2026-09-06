/**
 * Google Docs / Sheets export via the drive.file scope (only files
 * InboxScout itself creates). Used when the person signed in with Google
 * and turned on "Save briefs to Google Drive".
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink'
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

async function check(res: Response, what: string): Promise<any> {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Upload HTML and let Drive convert it into a Google Doc. */
export async function uploadBriefAsDoc(token: string, title: string, html: string): Promise<{ id: string; link: string }> {
  const boundary = 'inboxscout' + Date.now()
  const meta = JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.document' })
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`
  const json = await check(
    await fetch(UPLOAD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }),
    'Google Doc upload'
  )
  return { id: json.id, link: json.webViewLink ?? `https://docs.google.com/document/d/${json.id}` }
}

/** Create the tracker spreadsheet (once) and append rows. Returns the spreadsheet id. */
export async function appendTrackerRows(token: string, spreadsheetId: string | null, rows: string[][]): Promise<string> {
  let id = spreadsheetId
  if (!id) {
    const created = await check(
      await fetch(SHEETS, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { title: 'InboxScout Tracker' }, sheets: [{ properties: { title: 'Tracker' } }] })
      }),
      'Create tracker sheet'
    )
    id = created.spreadsheetId as string
    rows = [['Date', 'Type', 'Title', 'Status', 'Next step', 'Deadline'], ...rows]
  }
  if (rows.length === 0) return id!
  await check(
    await fetch(`${SHEETS}/${id}/values/Tracker!A1:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    }),
    'Append tracker rows'
  )
  return id!
}
