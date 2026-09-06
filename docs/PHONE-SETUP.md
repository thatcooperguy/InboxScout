# Finish the website from your phone (≈10 minutes)

Everything below works in a phone browser (Chrome/Safari). Use **"Request desktop site"** from the browser
menu if a page looks cramped. Nothing here can break the app — worst case a step just needs redoing.

## Part 1 — Turn on the website (GitHub, ~2 min)

1. Open **https://github.com/thatcooperguy/InboxScout/settings/pages** (sign in if asked).
2. Under **Build and deployment → Source**, pick **GitHub Actions**. (No Save button — it applies instantly.)
3. Open **https://github.com/thatcooperguy/InboxScout/actions/workflows/pages.yml** → tap **Run workflow** → **Run workflow**.
   About a minute later the site is live at **https://thatcooperguy.github.io/InboxScout/**.
4. Back on **…/settings/pages**, under **Custom domain** type `inboxscout.ai` → **Save**.
   It will say "DNS check unsuccessful" until Part 2 is done — that's expected.

## Part 2 — Point the domain at it (Squarespace, ~5 min)

1. Open **https://account.squarespace.com/domains** → tap **inboxscout.ai** → **DNS** (or *DNS settings*).
2. If there are existing records for host **@** of type **A** or **CNAME** (Squarespace parking), delete them.
3. Tap **Add record** and add these five, one at a time:

   | Type | Host | Data / Points to |
   |---|---|---|
   | A | @ | `185.199.108.153` |
   | A | @ | `185.199.109.153` |
   | A | @ | `185.199.110.153` |
   | A | @ | `185.199.111.153` |
   | CNAME | www | `thatcooperguy.github.io` |

   (Leave TTL/priority at defaults.)
4. Go back to **Domains** → tap **inboxscout.org** → **Forwarding** (may be under *Domain settings*) →
   forward to `https://inboxscout.ai` → **Permanent (301)** → Save.

## Part 3 — Lock in HTTPS (GitHub, ~1 min, after DNS spreads: 10 min to an hour)

1. Reopen **https://github.com/thatcooperguy/InboxScout/settings/pages**.
2. When it shows **"DNS check successful"**, tick **Enforce HTTPS**.
3. Visit **https://inboxscout.ai** — done. (Optional: GitHub → your **profile Settings → Pages → Add a domain**
   to *verify* `inboxscout.ai`, which prevents anyone else from claiming it.)

## Later, at a computer (optional)

`scripts/setup-pages.sh` does Part 1 and the custom-domain step automatically with a GitHub token
(see the comment at the top of the script). DNS at Squarespace is always manual — they have no API.

## If something looks wrong

- Buttons on inboxscout.ai don't download: the release exists at
  https://github.com/thatcooperguy/InboxScout/releases/latest — the site just links there.
- "DNS check unsuccessful" for more than an hour: re-check the four A records and that no old **@** records remain.
- Site shows a 404: make sure the Website workflow's latest run is green under Actions.
