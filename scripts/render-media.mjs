#!/usr/bin/env node
/**
 * Renders the README/site images from the landing page's own CSS, so the
 * pictures always match the design: docs/assets/hero.png, docs/assets/layouts.png,
 * site/og.png. Needs a Chromium/Chrome binary (CHROME env var, or the Playwright
 * install at /opt/pw-browsers, or `chromium`/`google-chrome` on PATH).
 *
 *   node scripts/render-media.mjs
 *   FONTS_CSS=/path/to/local/fonts.css node scripts/render-media.mjs   # offline fonts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const site = readFileSync(join(root, 'site/index.html'), 'utf8')
const style = site.match(/<style>([\s\S]*?)<\/style>/)[1]
const fontsLink = process.env.FONTS_CSS
  ? `<link rel="stylesheet" href="file://${resolve(process.env.FONTS_CSS)}">`
  : site.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0]

/** Lift a block of markup straight out of the landing page. */
function section(id) {
  if (id === 'stage') return site.match(/<div class="stage[^"]*"[\s\S]*?<\/header>/)[0].replace(/<\/header>$/, '')
  return site.match(/<div class="levels">[\s\S]*?<\/div>\s*<\/section>/)[0].replace(/<\/section>$/, '')
}

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (existsSync(pw)) {
    for (const d of readdirSync(pw)) {
      for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
        const p = join(pw, d, rel)
        if (existsSync(p)) return p
      }
    }
  }
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      return execFileSync('which', [c]).toString().trim()
    } catch {
      /* try the next one */
    }
  }
  throw new Error('No Chromium found. Set CHROME=/path/to/chrome.')
}

const page = (body, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">${fontsLink}<style>${style}
.up,.float{animation:none!important;opacity:1!important;transform:none!important}
body{background:transparent}
${extra}</style></head><body>${body}</body></html>`

const shots = [
  {
    out: 'docs/assets/hero.png',
    width: 760,
    height: 600,
    scale: 2,
    html: page(`<div style="padding:34px 40px 40px 34px">${section('stage')}</div>`, '.stage{max-width:660px}')
  },
  {
    out: 'docs/assets/layouts.png',
    width: 1180,
    height: 540,
    scale: 2,
    html: page(
      `<div class="wrap" style="padding:24px">${section('levels')}</div>`,
      '.wrap{max-width:none} .levels{align-items:stretch} .lvl{display:flex;flex-direction:column} .lvl .win{flex:1} .lvl .cap p{display:none}'
    )
  },
  {
    out: 'site/og.png',
    width: 1200,
    height: 630,
    scale: 1,
    html: page(
      `<div class="og">
        <div class="og-l">
          <div class="brand"><img src="file://${join(root, 'site/logo.svg')}" alt="">InboxScout</div>
          <h1>Know what<br>needs you.<br><em>Skip the rest.</em></h1>
          <p>A free desktop app that reads your email and hands you a 30-second brief in plain words. Windows &amp; Mac.</p>
          <div class="trust"><span>Read-only</span><span>Private</span><span>Fixes itself</span><span>Free forever</span></div>
        </div>
        <div class="og-r">${section('stage')}</div>
      </div>`,
      `body{background:#fbfbf8;margin:0}
       .og{display:grid;grid-template-columns:520px 1fr;gap:20px;width:1200px;height:630px;padding:48px 0 48px 56px;box-sizing:border-box;position:relative;overflow:hidden;
         background:radial-gradient(700px 400px at 20% 30%, #e8eef8 0%, transparent 70%), radial-gradient(600px 360px at 90% 10%, #fbeae8 0%, transparent 70%), #fbfbf8}
       .og::before{content:"";position:absolute;top:0;left:0;right:0;height:10px;background:repeating-linear-gradient(135deg,#2456a6 0 18px,#fbfbf8 18px 26px,#c0392f 26px 44px,#fbfbf8 44px 52px)}
       .og .brand{display:flex;align-items:center;gap:12px;font-family:"Libre Franklin",sans-serif;font-weight:900;font-size:28px;margin-bottom:26px}
       .og .brand img{width:44px;height:44px}
       .og h1{font-size:64px;font-weight:900;line-height:1.02;margin:0 0 18px}
       .og h1 em{font-style:normal;color:#2456a6}
       .og p{font-size:21px;color:#4a5261;margin:0 0 20px;max-width:30ch}
       .og .trust{margin-top:0;font-size:16px}
       .og-r{position:relative;transform:scale(.8) translate(50px,36px);transform-origin:top left}
       .toast{max-width:260px}.toast.top{left:-10px;top:-26px}`
    )
  }
]

const chrome = findChrome()
const work = join(tmpdir(), `inboxscout-media-${process.pid}`)
mkdirSync(work, { recursive: true })
for (const s of shots) {
  const html = join(work, `${s.out.replace(/[/.]/g, '_')}.html`)
  writeFileSync(html, s.html)
  const out = join(root, s.out)
  mkdirSync(dirname(out), { recursive: true })
  execFileSync(
    chrome,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${s.scale}`,
      '--default-background-color=00000000',
      `--window-size=${s.width},${s.height}`,
      `--screenshot=${out}`,
      `file://${html}`
    ],
    { stdio: ['ignore', 'ignore', 'inherit'], timeout: 90_000 }
  )
  console.log(`wrote ${s.out} (${s.width * s.scale}×${s.height * s.scale})`)
}
