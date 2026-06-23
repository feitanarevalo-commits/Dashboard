# Enfinity — Make.com workflow blueprints

Three importable Make scenarios that wire the dashboard to **YouTube scraping**,
**Close.io**, **Slack**, and **Google Forms**. A Make scenario has exactly one
trigger, so the diagram is three scenarios:

| File | Trigger | Covers |
|------|---------|--------|
| `1-enfinity-gateway.make.blueprint.json` | Custom webhook (from the dashboard) | **Scraper** (flow 1) + **Close.io pull/create/update/read** (flow 2) + Slack ping on save |
| `2-enfinity-slack-replies.make.blueprint.json` | Schedule (poll Close) | **Slack reply notifications** (flow 3) |
| `3-enfinity-google-form-agency.make.blueprint.json` | Custom webhook (from a Google Form) | **Agency roster intake** (flow 4) |

Import each in Make → **Create a new scenario → ⋯ → Import Blueprint**.

---

## Placeholders to replace (all three)
- `YOUR_YOUTUBE_API_KEY` — YouTube Data API v3 key.
- `YOUR_CLOSE_API_KEY_BASE64` — base64 of `yourCloseApiKey:` (note the **trailing colon**;
  Close uses HTTP Basic with the API key as the username, blank password).
  e.g. `printf 'api_abc123:' | base64`.
- `YOUR/SLACK/INCOMING/WEBHOOK` — a Slack **Incoming Webhook** URL.
- The blueprints default to zone `eu2.make.com`; Make rewrites this on import.

---

## 1) Gateway — Scraper + Close.io  (`1-…gateway`)
One webhook, a **Router**, and a `action` discriminator. The dashboard posts
`{ "action": "...", ... }` and the matching route runs, then responds.

| `action` | Dashboard sends | Route does | Responds |
|----------|-----------------|------------|----------|
| `scrape` | `keyword`, `limit` | YouTube `search` → `channels.list` (sub counts) | `channels.items[]` |
| `close.pull` | — | `GET /lead/?_limit=200` | Close `data[]` |
| `close.create` | `channelName`, `primaryEmail`, `leadJson` | `POST /lead/` + Slack ping | `[{id, closeLeadId}]` |
| `close.update` | `leadId`, `channelName`, `leadJson` | `PUT /lead/{leadId}/` | `[{id, closeLeadId}]` |
| `close.read` | `leadId` | `GET /activity/email/?lead_id=` | email activities (status, replies) |

**Matches the dashboard today** with two small wiring notes:
- The app currently posts to **three** webhook URLs (`scrapeWebhook`,
  `closeWebhook`, `closeLoadWebhook`). To use this single gateway, point all three at the
  same URL and have the app send an `action` field. The current shapes still map:
  scrape already sends `{type:'search', keyword, limit}` (route on that, or add `action`),
  save sends `{leads:[…]}`, load sends `{}`.
- **JSON-in-description:** dashboard-only fields round-trip as JSON in the Close lead's
  `description`. `close.create/update` expect the app to send `leadJson` (the lead object
  already `JSON.stringify`-ed). `close.pull` returns Close leads — parse each
  `description` back to a lead object (see `close-crm/close-load.n8n.json` for the exact
  parse, or add an Iterator + Parse JSON + Array aggregator before the Respond).

## 2) Slack reply notifier  (`2-…slack-replies`)
Scheduled poll (set the scenario to run e.g. every 15 min). Pulls **inbound** Close email
activities created since the last run, fetches each lead, and posts the reply to Slack with
the **assigned rep** (read from the dashboard JSON in `description`).

- **Route to the right rep:** the simplest version posts everything to one channel. To
  notify each rep, map the Close `user_id`/`assignedTo` to a Slack channel or user id and
  swap the Incoming Webhook for a per-rep target (or the native Slack module). 
- **No native Close app needed** — it polls the REST API. If you have the Close app
  connected, replace module 1 with Close ▸ *Watch Activities* (instant, no polling).

## 3) Google Form → Agency tab  (`3-…google-form-agency`)
A Google Form submission becomes a Close lead carrying the **agency name** (and assigned
rep) in its `description` JSON, then pings Slack.

- **Wire the form:** add an on-submit Apps Script that POSTs the response fields to this
  webhook (or use Make's *Google Forms ▸ Watch Responses* trigger in place of module 1).
- **Required field:** `agency` must equal an **Agency folder name** in the dashboard.
- **Getting it onto the Agency tab:** the lead lands in Close; the dashboard pulls it on
  the next *Load from Close*. Auto-filing it into the matching Agency folder needs one small
  dashboard change — have the Close loader read each lead's `agency` field and add its
  `leadKey` to (or create) the folder of that name. **Say the word and I'll add it** (it's a
  few lines in `loadFromClose`/`normalizeLead` + the agencies state).

---

## CORS / hosts
All webhook responses set `Access-Control-Allow-Origin: *` (the dashboard is a static site).
The app's CSP already allows `*.make.com` / `*.app.n8n.cloud`; a custom Make domain would
need adding to `connect-src` in `vercel.json`.

## Notes
- Built with the same portable module set as the existing blueprints (`gateway:*`,
  `http:ActionSendData`, `builtin:BasicRouter`/`BasicFeeder`) so they import without a
  pre-set Close/Slack/Google connection. Swap in native app modules anytime for a nicer UI.
- These are workflow files only — they are **not** part of the dashboard build.
