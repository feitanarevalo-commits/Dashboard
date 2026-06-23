# Enfinity Sales Dashboard — Project Handoff

This file is the single source of context for continuing work on the dashboard.
If you're a new Claude Code session: **read this top to bottom before editing.**
Last updated: 2026-06-22.

---

## What this is

A **no-bundler React 18 app** (loaded from unpkg CDN) that serves as Enfinity's
internal sales/lead dashboard. There is **no backend** — it's a single static
`index.html` with inline JS, plus `styles.css` and `config.js`. State is
in-memory (resets on reload) until Close CRM storage is wired (see Pending).

Live at: **dashboard-beta-sooty-84.vercel.app**

## Repository layout

This repo is BOTH the editable source and the deploy target.

| File | Role |
|------|------|
| `_app_temp.jsx` | **Source of truth** — the entire app, written in JSX. Edit this. |
| `styles.css` | All styling (edited directly, deployed as-is). |
| `config.js` | Users/roles, sales reps, campaigns, tabs, webhooks, feature flags, `SAMPLE_LEADS`. Edited directly, shipped to the browser as-is. |
| `.babelrc` | Babel config (`runtime: classic`). |
| `_embed.mjs` | Build step 2 — wraps `app.js` in an IIFE and writes `index.html`. |
| `index.html` | **Generated** build output (what Vercel serves). Do not hand-edit. |
| `app.js` | **Generated** Babel output (gitignored). |
| `package.json` / `package-lock.json` | Dev deps (Babel). |
| `vercel.json` | Forces static hosting (`buildCommand: ""`, `outputDirectory: "."`). |
| `close-crm/` | n8n load+save workflows for the (pending) Close CRM persistence. |
| `scraper-workflow/` | Make.com / n8n blueprints for the scraper. Use `youtube-enriched.make.blueprint.json`. |

## Build & deploy

From the repo root:

```bash
npm install                                              # once, installs Babel
node_modules/.bin/babel _app_temp.jsx --out-file app.js  # 1. compile JSX → app.js
node _embed.mjs                                           # 2. embed app.js → index.html
git add -A && git commit -m "…" && git push origin main  # 3. Vercel auto-redeploys
```

**Critical:** the mount call
`ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App))`
MUST be the last line of `_app_temp.jsx`, or the page renders blank.

> Historical note: this repo previously held ONLY the built output; the JSX
> source lived in a separate local folder
> (`…/Desktop/Claude/youtube-scraper-dashboard/`) and was gitignored. As of this
> handoff the source lives here so the project is fully recoverable from the repo
> alone. If both locations exist, treat **this repo** as canonical going forward.

## What's live & working

- Login + roles (admins: Robert / Chai / Rein; sales reps: Pen, Rein, Chase, Mikka).
- Scraper tab → Make.com webhook → YouTube Data API search + `channels.list`
  enrichment (subscriber counts) → results ingested. Newest results prepend to
  the top (page 1). Min-Followers dropdown filters on ingest.
- Lead queue: click/shift/drag selection, inline single-select status tag,
  inline email editing, bulk assign.
- Campaigns (MSN / VVV), per-rep dashboards, Home analytics
  (Daily/Weekly/Monthly/Yearly) with rich CSV + PDF export.
- Google Sheets import (auto-maps Channel/URL/Email/LG SCRAPER→rep/Tags/
  SERVICES→campaign/DATE/IMPORTED flag).
- Global ⌘K search, dark mode, 3D panel animations.

## Recent work (2026-06-22)

1. **Sheets imports kept out of the Scraper tab.** `ScraperView` now filters
   `!hasStatusTag(l) && leadOrigin(l) !== 'Imported'`, so the scraper queue shows
   only fresh, untriaged channels. Imported tags are normalized to canonical
   `STATUS_TAGS` via `canonTag()` so Potential/Contacted routing works regardless
   of how the sheet cases/spells them.
2. **Richer Home metrics + downloads.** Added Potential / With Email / Avg
   Followers stat cards and Contact % / Pot % / Email % / Avg Followers columns.
   The KPI CSV is now a full report (header block, conversion + qualified rates,
   email coverage, avg followers, per-campaign & per-platform splits, totals row).
   Per-lead CSV expanded to 17 columns.
3. **Duplicates tab.** `dupGroups` groups leads by `leadKey` (channelId>url>name)
   and flags any channel held in 2+ records, cross-rep conflicts first, with
   reassign/remove actions. Sheets-import dedup is now per **(channel + rep)** —
   same channel under a different rep is kept on purpose so the conflict surfaces
   instead of being silently dropped. The tab is gated by `config.tabs.duplicates`.

## Pending / not finished

- **Close CRM as persistent storage** (load on login + Save to Close). Dashboard
  side is built (`loadFromClose` / `saveToClose`, JSON-in-description approach;
  workflows in `close-crm/`), but not confirmed working on the temp Close account.
  Until this lands, **leads are in-memory only and reset on reload.**

## Conventions & preferences

- **Always build + deploy after a verified change** (Robert's standing request —
  don't ask each time). Verify in a local preview first, then push.
- Preview locally: serve the folder statically (e.g. `npx serve`, port 3456) and
  open it; the app gates behind login.
- `config` resets to `DEFAULT_CONFIG` (from `config.js`) on every load — there's
  no localStorage persistence of config — so adding a key to `config.tabs` in
  `config.js` applies to all users immediately.
- Note: because there's no backend, everything in `config.js` (webhooks, etc.) is
  shipped to the browser. Treat it as public; don't put real secrets there.

## Gotchas solved (don't re-debug these)

- Make Webhook Response headers use field **`key`**, not `name`.
- `Access-Control-Allow-Origin` value must be `*` (CORS).
- The Make scenario must be **ON/live**, not "Run once".
- Webhook Response Body must point at the `channels.list` module
  (`{{N.data.items}}`), not the search module.
