/**
 * "InboxScout on your phone": the phone-friendly web app the desktop serves over the home Wi‑Fi.
 *
 * One HTML string, vanilla JS, no build step. It talks to /api/<op> on the same origin with the
 * bearer token it read from the `#t=` part of the QR link. Brand: paper / ink / blue / red, system
 * font stack, big tap targets, dark mode from the phone's own setting.
 *
 * Electron-free so it can be unit-tested.
 */

/** App icon: an envelope with a red compass dot (the InboxScout mark), as a standalone SVG. */
export const PHONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#2456a6"/>
  <rect x="11" y="20" width="42" height="29" rx="4" fill="#fbfbf8"/>
  <path d="M13 24.5 32 38.5 51 24.5" fill="none" stroke="#2456a6" stroke-width="3.2" stroke-linejoin="round"/>
  <circle cx="49" cy="18" r="8" fill="#c0392f" stroke="#fbfbf8" stroke-width="2.4"/>
  <path d="M49 12.6 51.2 18 49 23.4 46.8 18Z" fill="#fbfbf8"/>
</svg>`

const ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(PHONE_ICON_SVG)}`

/**
 * Web app manifest. `startUrl` carries the `#t=` token when the manifest was requested with it, so a
 * home-screen install (iPhone and Android alike) opens with the key it needs — iPhone home-screen apps
 * keep their own storage, separate from Safari, so the key has to travel in the URL.
 */
export function phoneManifest(startUrl = '/'): Record<string, unknown> {
  return {
    name: 'InboxScout',
    short_name: 'InboxScout',
    description: 'Your email brief, on your phone.',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: '#fbfbf8',
    theme_color: '#2456a6',
    icons: [
      { src: ICON_DATA_URI, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  }
}

const CSS = `
:root {
  --paper: #fbfbf8; --card: #ffffff; --ink: #1e2430; --ink-soft: #4a5261; --ink-faint: #5b6473;
  --line: #d9dad1; --blue: #2456a6; --blue-soft: #e8eef8; --red: #c0392f; --red-soft: #f8e9e7;
  --good: #2e7d4f; --good-soft: #e6f2ea; --amber: #a6641b; --amber-soft: #fdf3e0;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #14171d; --card: #1e2430; --ink: #e8eaf0; --ink-soft: #b8bec9; --ink-faint: #9aa2b0;
    --line: #333a47; --blue: #6b93e0; --blue-soft: #22304a; --red: #e3695f; --red-soft: #3d2320;
    --good: #5fbf85; --good-soft: #1f3327; --amber: #d99a4a; --amber-soft: #3a2c16;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  padding-bottom: env(safe-area-inset-bottom);
}
button { font: inherit; }
.top {
  position: sticky; top: 0; z-index: 2; background: var(--paper); border-bottom: 1px solid var(--line);
  padding: calc(10px + env(safe-area-inset-top)) 16px 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.top h1 { font-size: 20px; margin: 0; flex: 1; min-width: 0; }
.top .checked { width: 100%; font-size: 13px; color: var(--ink-faint); }
main { padding: 14px 14px 32px; max-width: 640px; margin: 0 auto; }
.big {
  display: block; width: 100%; min-height: 64px; background: var(--blue); color: #fff; border: none; border-radius: 14px;
  font-size: 20px; font-weight: 700; padding: 14px 18px; cursor: pointer; box-shadow: 0 6px 18px rgba(36, 86, 166, .25);
}
.big:active { transform: translateY(1px); }
.big[disabled] { opacity: .65; box-shadow: none; }
.ghost {
  background: none; border: 1px solid var(--line); border-radius: 10px; color: var(--ink-soft);
  min-height: 44px; padding: 8px 14px; cursor: pointer; font-size: 15px;
}
.ghost.done { border-color: var(--good); color: var(--good); font-weight: 600; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px 16px 6px; margin-top: 14px; }
.card h2 { font-size: 15px; margin: 0 0 8px; letter-spacing: .01em; }
.card h2 .n { color: var(--ink-faint); font-weight: 500; margin-left: 6px; font-size: 13px; }
.card ul { list-style: none; margin: 0; padding: 0; }
.card li { padding: 12px 0; border-bottom: 1px solid var(--line); }
.card li:last-child { border-bottom: none; }
.headline { font-size: 18px; margin: 16px 2px 0; color: var(--ink-soft); }
.row { display: flex; gap: 10px; align-items: flex-start; }
.row .txt { flex: 1; min-width: 0; }
.title { font-weight: 600; }
.next { color: var(--ink-soft); font-size: 14.5px; margin-top: 4px; }
.why { color: var(--ink-faint); font-size: 13.5px; margin-top: 2px; }
.pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; margin-left: 6px; vertical-align: middle; }
.pill.urgent, .pill.high, .pill.overdue { background: var(--red-soft); color: var(--red); }
.pill.medium { background: var(--amber-soft); color: var(--amber); }
.pill.low { background: var(--blue-soft); color: var(--blue); }
.day { font-weight: 700; margin: 10px 0 2px; }
.day:first-child { margin-top: 0; }
.ev { display: flex; gap: 10px; padding: 6px 0; font-size: 15px; }
.ev .t { color: var(--ink-faint); min-width: 64px; font-variant-numeric: tabular-nums; }
.all-clear { text-align: center; padding: 34px 12px; font-size: 19px; color: var(--good); }
.muted { color: var(--ink-faint); }
.banner { border-radius: 12px; padding: 12px 14px; margin: 0 0 12px; font-size: 15px; }
.banner.err { background: var(--red-soft); color: var(--red); }
.banner.info { background: var(--blue-soft); color: var(--blue); }
.reports button { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--line); color: var(--ink); padding: 14px 4px; min-height: 48px; cursor: pointer; font-size: 16px; }
.reports button:last-child { border-bottom: none; }
.reports .when { font-weight: 600; }
.reports .kind { color: var(--ink-faint); font-size: 13.5px; margin-left: 8px; }
.panel { position: fixed; inset: 0; z-index: 5; background: var(--paper); display: flex; flex-direction: column; }
.panel-bar { display: flex; align-items: center; gap: 10px; padding: calc(8px + env(safe-area-inset-top)) 12px 8px; border-bottom: 1px solid var(--line); background: var(--paper); }
.panel-bar span { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-body { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; }
.panel-body iframe { width: 100%; height: 100%; border: none; background: #fff; }
.md { padding: 14px 16px 40px; max-width: 640px; margin: 0 auto; }
.md h1, .md h2, .md h3 { font-size: 17px; margin: 18px 0 6px; }
.md h1 { font-size: 20px; }
.md ul { padding-left: 20px; }
.md li { margin: 4px 0; }
.md p { margin: 8px 0; }
.spin { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.5); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: -2px; margin-right: 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
[hidden] { display: none !important; }
`

/* The page script. Plain ES2017; no backticks or template placeholders so it can live in this template literal. */
const JS = `
(function () {
  'use strict';
  var KEY = 'inboxscout-phone-token';
  var token = '';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---- Key handling: the QR link carries #t=<key>. Remember it, and keep it in the address so a
  // home-screen install (which gets its own storage on iPhone) still has it.
  (function () {
    var m = /(?:^|[#&])t=([A-Za-z0-9]+)/.exec(location.hash || '');
    var stored = '';
    try { stored = localStorage.getItem(KEY) || ''; } catch (e) { stored = ''; }
    token = (m && m[1]) || stored;
    if (token) {
      try { localStorage.setItem(KEY, token); } catch (e) { /* private mode: the address still has it */ }
      if (!m) { try { history.replaceState(null, '', '#t=' + token); } catch (e) { /* ignore */ } }
      var link = document.getElementById('manifest');
      if (link) link.setAttribute('href', '/manifest.webmanifest?t=' + encodeURIComponent(token));
    }
  })();

  var OFFLINE = "Can't reach your computer. Is it on and on the same Wi‑Fi?";
  var EXPIRED = 'This link no longer works. On your computer, open Setup → On your phone and scan the code again.';

  function api(op, args) {
    return fetch('/api/' + op, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      if (r.status === 401) { var e = new Error(EXPIRED); e.expired = true; throw e; }
      return r.json().then(function (body) {
        if (!r.ok) throw new Error((body && body.error) || ('Something went wrong (' + r.status + ').'));
        return body;
      });
    }, function () { throw new Error(OFFLINE); });
  }

  function banner(kind, text) {
    var b = $('banner');
    if (!text) { b.hidden = true; b.textContent = ''; return; }
    b.className = 'banner ' + kind; b.textContent = text; b.hidden = false;
  }
  function fail(err) { banner('err', (err && err.message) || OFFLINE); }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'Checked today at ' + time;
    var y = new Date(now.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) return 'Checked yesterday at ' + time;
    return 'Checked ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + time;
  }
  function dateOnly(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ---- Rendering the brief ----
  function card(title, count, inner) {
    return '<section class="card"><h2>' + esc(title) + (count ? '<span class="n">' + count + '</span>' : '') + '</h2>' + inner + '</section>';
  }
  function lines(arr) {
    return '<ul>' + arr.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
  }

  function renderBrief(latest) {
    var out = '';
    if (!latest || !latest.brief) {
      $('checked').textContent = 'No brief yet.';
      $('content').innerHTML = '<div class="all-clear muted">No brief yet. Tap <strong>Check my email</strong> above.</div>';
      return;
    }
    var b = latest.brief;
    $('checked').textContent = when(latest.createdAt);
    if (b.headline) out += '<p class="headline">' + esc(b.headline) + '</p>';

    var issues = (b.topIssues || []);
    var waiting = (b.waitingOnYou || []);
    var deadlines = (b.deadlines || []);
    if (!issues.length && !waiting.length && !deadlines.length) out += '<div class="all-clear">✅ You\\'re all caught up.</div>';

    if (issues.length) {
      out += card('Needs you', issues.length, '<ul>' + issues.map(function (i, idx) {
        return '<li class="row" data-idx="' + idx + '"><div class="txt"><div class="title">' + esc(i.title) +
          (i.severity ? '<span class="pill ' + esc(i.severity) + '">' + esc(i.severity) + '</span>' : '') + '</div>' +
          (i.nextStep ? '<div class="next">→ ' + esc(i.nextStep) + '</div>' : '') +
          (i.whyNow ? '<div class="why">' + esc(i.whyNow) + '</div>' : '') + '</div>' +
          (i.issueId ? '<button class="ghost done" data-done="' + esc(i.issueId) + '">Done</button>' : '') + '</li>';
      }).join('') + '</ul>');
    }
    if (waiting.length) out += card("They're waiting on you", waiting.length, lines(waiting));
    if (deadlines.length) out += card('Deadlines', deadlines.length, lines(deadlines));

    var sch = b.schedule;
    if (sch && ((sch.days && sch.days.length) || (sch.overdue && sch.overdue.length) || (sch.conflicts && sch.conflicts.length))) {
      var inner = '';
      if (sch.overdue && sch.overdue.length) inner += '<div class="day" style="color:var(--red)">Overdue</div>' + sch.overdue.map(function (s) { return '<div class="ev"><span>' + esc(s) + '</span></div>'; }).join('');
      (sch.days || []).forEach(function (d) {
        inner += '<div class="day">' + esc(d.label || d.date) + '</div>' + (d.events || []).map(function (e) {
          return '<div class="ev"><span class="t">' + esc(e.time || 'All day') + '</span><span>' + esc(e.title) + (e.conflict ? ' <span class="pill overdue">overlap</span>' : '') + '</span></div>';
        }).join('');
      });
      if (sch.conflicts && sch.conflicts.length) inner += '<div class="why" style="padding:8px 0">' + sch.conflicts.map(esc).join('<br>') + '</div>';
      if (sch.recurring && sch.recurring.length) inner += '<div class="why" style="padding:8px 0">Every week: ' + sch.recurring.map(esc).join(' · ') + '</div>';
      out += card('Coming up', 0, '<div style="padding-bottom:10px">' + inner + '</div>');
    }

    var promises = (b.promises || []);
    if (promises.length) {
      out += card('Promises you made', promises.length, '<ul>' + promises.map(function (p) {
        return '<li><div class="title">' + esc(p.text) + (p.overdue ? '<span class="pill overdue">overdue</span>' : '') + '</div><div class="why">To ' + esc(p.to) + (p.due ? ' · due ' + esc(dateOnly(p.due)) : '') + '</div></li>';
      }).join('') + '</ul>');
    }

    var sections = (b.skillSections || []).filter(function (s) { return s.lines && s.lines.length; });
    sections.forEach(function (s) { out += card((s.icon ? s.icon + ' ' : '') + s.title, s.lines.length, lines(s.lines)); });

    if (b.pulse && b.pulse.length) {
      out += card("Topics I'm following", b.pulse.length, '<ul>' + b.pulse.map(function (p) {
        var arrow = p.trend === 'up' ? '↑ ' : p.trend === 'down' ? '↓ ' : '';
        return '<li><div class="title">' + arrow + esc(p.projectName) + '</div><div class="next">' + esc(p.status) + '</div>' + (p.whatChanged ? '<div class="why">' + esc(p.whatChanged) + '</div>' : '') + '</li>';
      }).join('') + '</ul>');
    }
    if (b.waitingOnThem && b.waitingOnThem.length) out += card("You're waiting on", b.waitingOnThem.length, lines(b.waitingOnThem));
    if (b.personal && b.personal.length) out += card('Personal', b.personal.length, lines(b.personal));

    var people = b.people;
    if (people && ((people.inner && people.inner.length) || (people.goingQuiet && people.goingQuiet.length) || (people.newFaces && people.newFaces.length))) {
      var pi = '<ul>';
      (people.inner || []).forEach(function (p) { pi += '<li><div class="title">' + esc(p.name || p.address) + '</div><div class="why">' + esc(p.note) + '</div></li>'; });
      (people.goingQuiet || []).forEach(function (s) { pi += '<li>🔕 ' + esc(s) + '</li>'; });
      (people.newFaces || []).forEach(function (s) { pi += '<li>👋 ' + esc(s) + '</li>'; });
      out += card('Your circle', 0, pi + '</ul>');
    }
    if (b.sensitiveNotices && b.sensitiveNotices.length) out += card('Private or confidential mail spotted', b.sensitiveNotices.length, lines(b.sensitiveNotices));
    if (b.resolvedRecently && b.resolvedRecently.length) out += card('Done recently', b.resolvedRecently.length, lines(b.resolvedRecently));

    $('content').innerHTML = out;
  }

  function load() {
    return api('get_brief').then(function (latest) { banner('', ''); renderBrief(latest); }).catch(fail);
  }

  function loadReports() {
    return api('list_reports', { limit: 30 }).then(function (list) {
      var el = $('reports');
      if (!list || !list.length) { el.innerHTML = '<div class="muted" style="padding:6px 0 12px">None yet.</div>'; return; }
      el.innerHTML = list.map(function (r) {
        var d = new Date(r.createdAt);
        return '<button data-report="' + esc(r.id) + '"><span class="when">' + esc(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) +
          '</span><span class="kind">' + esc(r.periodType === 'weekly' ? 'weekly' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })) + '</span></button>';
      }).join('');
    }).catch(function () { $('reports').innerHTML = ''; });
  }

  // ---- Past briefs, full screen ----
  function markdownToHtml(md) {
    var html = '', inList = false, para = [];
    var flush = function () { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
    var inline = function (s) {
      return esc(s).replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>').replace(/(^|\\s)_(.+?)_(?=\\s|$)/g, '$1<em>$2</em>');
    };
    String(md || '').split(/\\r?\\n/).forEach(function (line) {
      var h = /^(#{1,3})\\s+(.*)$/.exec(line);
      var li = /^\\s*[-*]\\s+(.*)$/.exec(line);
      if (li) { flush(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(li[1]) + '</li>'; return; }
      if (inList) { html += '</ul>'; inList = false; }
      if (h) { flush(); html += '<h' + (h[1].length + 1) + '>' + inline(h[2]) + '</h' + (h[1].length + 1) + '>'; return; }
      if (!line.trim()) { flush(); return; }
      para.push(line.trim());
    });
    if (inList) html += '</ul>';
    flush();
    return html;
  }

  function openReport(id) {
    var panel = $('panel'), body = $('panel-body');
    $('panel-title').textContent = 'Loading…';
    body.innerHTML = '';
    panel.hidden = false;
    api('read_report', { id: id }).then(function (r) {
      if (!r) { $('panel-title').textContent = 'Brief'; body.innerHTML = '<div class="md muted">That brief is gone.</div>'; return; }
      $('panel-title').textContent = 'Brief · ' + new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (r.html) {
        var frame = document.createElement('iframe');
        frame.setAttribute('sandbox', '');
        frame.setAttribute('title', 'Brief');
        frame.srcdoc = '<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{max-width:100%;overflow-wrap:anywhere;padding:0 12px}img,table{max-width:100%}</style>' + r.html;
        body.appendChild(frame);
      } else {
        body.innerHTML = '<div class="md">' + markdownToHtml(r.markdown) + '</div>';
      }
    }).catch(function (err) {
      $('panel-title').textContent = 'Brief';
      body.innerHTML = '<div class="md" style="color:var(--red)">' + esc((err && err.message) || OFFLINE) + '</div>';
    });
  }

  // ---- Check my email: start, then wait for the scan to finish ----
  var checking = false;
  function setChecking(on) {
    checking = on;
    var btn = $('check');
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spin"></span>Checking…' : '✉ Check my email';
  }
  function check() {
    if (checking) return;
    setChecking(true);
    banner('', '');
    api('run_scan').then(function () {
      var started = Date.now();
      var poll = function () {
        if (Date.now() - started > 15 * 60 * 1000) { setChecking(false); banner('info', 'Still checking on your computer. Tap Refresh in a minute.'); return; }
        api('scan_status').then(function (s) {
          if (s && s.running) { setTimeout(poll, 2000); return; }
          setChecking(false);
          load().then(loadReports);
        }).catch(function (err) { setChecking(false); fail(err); });
      };
      setTimeout(poll, 1500);
    }).catch(function (err) { setChecking(false); fail(err); });
  }

  function markDone(id, li) {
    li.style.opacity = '.5';
    api('resolve_issue', { id: id }).then(function () {
      li.parentNode.removeChild(li);
      var left = document.querySelectorAll('[data-done]').length;
      if (!left) load();
    }).catch(function (err) { li.style.opacity = ''; fail(err); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-done],[data-report]') : null;
    if (!t) return;
    if (t.getAttribute('data-done')) markDone(t.getAttribute('data-done'), t.closest('li'));
    else openReport(t.getAttribute('data-report'));
  });
  $('check').addEventListener('click', check);
  $('refresh').addEventListener('click', function () { load().then(loadReports); });
  $('close').addEventListener('click', function () { $('panel').hidden = true; $('panel-body').innerHTML = ''; });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !checking) load(); });

  if (!token) {
    banner('err', 'Open this page by scanning the code on your computer (Setup → On your phone).');
    $('check').disabled = true;
  } else {
    load().then(loadReports);
  }
})();
`

/** The complete phone page. Contains no secrets: the key arrives in the URL the QR code carries. */
export const PHONE_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2456a6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="InboxScout">
<meta name="format-detection" content="telephone=no">
<link id="manifest" rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<title>InboxScout</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <h1>📬 InboxScout</h1>
  <button id="refresh" class="ghost" type="button">↻ Refresh</button>
  <div id="checked" class="checked" role="status" aria-live="polite"></div>
</header>
<main>
  <div id="banner" class="banner" role="alert" hidden></div>
  <button id="check" class="big" type="button">✉ Check my email</button>
  <div id="content"></div>
  <section class="card reports">
    <h2>Past briefs</h2>
    <div id="reports"></div>
  </section>
  <p class="muted" style="font-size:13px;text-align:center;margin-top:20px">Same Wi‑Fi as your computer · your computer has to be on.</p>
</main>
<div id="panel" class="panel" hidden>
  <div class="panel-bar"><button id="close" class="ghost" type="button">← Back</button><span id="panel-title"></span></div>
  <div id="panel-body" class="panel-body"></div>
</div>
<noscript>InboxScout needs JavaScript turned on.</noscript>
<script>${JS}</script>
</body>
</html>
`
