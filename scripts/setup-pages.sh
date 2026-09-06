#!/usr/bin/env bash
# One-time: enable GitHub Pages (GitHub Actions source), set the custom domain, and run the deploy.
#
# Needs a GitHub personal access token with "repo" (classic) or Pages: write + Actions: write (fine-grained).
# Create one at https://github.com/settings/tokens, then:
#
#   GITHUB_TOKEN=ghp_xxx bash scripts/setup-pages.sh
#
# Works in Termux on Android too (pkg install curl). DNS at Squarespace stays manual (docs/PHONE-SETUP.md).
set -euo pipefail
OWNER=thatcooperguy
REPO=InboxScout
DOMAIN=${DOMAIN:-inboxscout.ai}
: "${GITHUB_TOKEN:?Set GITHUB_TOKEN to a personal access token}"

api() { curl -sS -X "$1" "https://api.github.com/repos/$OWNER/$REPO$2" \
  -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" ${3:+-d "$3"}; }

echo "→ Enabling GitHub Pages (source: GitHub Actions)…"
if api GET /pages | grep -q '"html_url"'; then
  echo "  already enabled"
else
  api POST /pages '{"build_type":"workflow"}' >/dev/null && echo "  enabled"
fi

echo "→ Setting custom domain $DOMAIN…"
api PUT /pages "{\"cname\":\"$DOMAIN\",\"build_type\":\"workflow\"}" >/dev/null && echo "  set"

echo "→ Running the Website deploy workflow…"
api POST /actions/workflows/pages.yml/dispatches '{"ref":"claude/email-intelligence-app-design-sh8tmz"}' >/dev/null && echo "  queued"

echo
echo "Done on the GitHub side. Now add the DNS records at Squarespace (docs/PHONE-SETUP.md, Part 2),"
echo "then tick 'Enforce HTTPS' at https://github.com/$OWNER/$REPO/settings/pages once the DNS check passes."
