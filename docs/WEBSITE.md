# Website: inboxscout.ai

The landing page lives in `site/` and is published free with **GitHub Pages** whenever `site/` changes
(workflow: `.github/workflows/pages.yml`). HTTPS is automatic.

## One-time: point your Squarespace domains at it

### inboxscout.ai (the site)

1. GitHub → repo **Settings → Pages**: Source should read **GitHub Actions** (the workflow enables this on first run).
   Under **Custom domain** enter `inboxscout.ai`, Save, and tick **Enforce HTTPS** once the check passes.
2. Squarespace → **Domains → inboxscout.ai → DNS settings** → add these records (delete any Squarespace
   parking records for `@` first):

   | Type | Host | Value |
   |---|---|---|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | CNAME | www | thatcooperguy.github.io |

3. Wait for DNS (minutes to an hour). GitHub will show "DNS check successful"; HTTPS follows shortly after.
4. Optional but recommended: GitHub → your profile **Settings → Pages → Add a domain** to *verify*
   `inboxscout.ai`, which stops anyone else from claiming it on Pages.

### inboxscout.org (forward to the site)

Squarespace → **Domains → inboxscout.org → Forwarding** → forward to `https://inboxscout.ai` (permanent / 301).

## Editing the page

Edit `site/index.html`, push, done. The download buttons use the permanent
`releases/latest/download/...` links, so they never need updating.
