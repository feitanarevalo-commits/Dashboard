# LeadFlow — YouTube & Social Scraper Dashboard

A single-page lead management dashboard for YouTube, TikTok, and Instagram channels. Built with React 18 (CDN) + Babel Standalone — no build step required.

## Features

- Lead table with sortable columns, tag filters, and campaign color-coding
- Edit leads with multi-URL support (for channels with multiple accounts)
- Assign leads to sales reps with color-coded avatars
- Google Sheets import (CSV / CORS proxy / JSONP fallback)
- Export leads to CSV
- Webhook triggers to n8n (scrape + close import)
- Dark mode
- Fully configurable via `config.js` — no code changes needed for most customizations

## File Structure

```
├── index.html     # React app (all component logic + JSX)
├── styles.css     # All CSS styles and CSS variables
├── config.js      # App settings: campaigns, reps, webhooks, statuses
├── vercel.json    # Vercel deployment config
├── package.json   # Dev server script
└── .gitignore
```

## Local Development

```bash
npx serve -s . -l 3456
# or
npm run dev
```

Then open http://localhost:3456

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npm i -g vercel
vercel
```

### Option B — GitHub + Vercel Dashboard
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. No build settings needed (static site)
4. Deploy

## Configuration

Edit `config.js` to customize without touching app logic:

| Setting | Description |
|---|---|
| `PLATFORMS` | List of platforms (YouTube, TikTok, Instagram) |
| `STATUSES` | Lead status labels and colors |
| `DEFAULT_CONFIG.campaigns` | Campaign names and badge colors |
| `DEFAULT_CONFIG.salesReps` | Rep names |
| `DEFAULT_CONFIG.repColors` | Rep avatar colors |
| `DEFAULT_CONFIG.closeWebhook` | n8n webhook URL for Close CRM import |
| `DEFAULT_CONFIG.scrapeWebhook` | n8n webhook URL to trigger scrape |
| `SAMPLE_LEADS` | Pre-load leads on first visit |

## Google Sheets Import

1. Share your Google Sheet as **"Anyone with the link can view"**
2. Go to **Google Sheets** tab in the app
3. Paste the sheet URL or ID
4. The app tries three strategies in order:
   - Direct CSV export
   - CORS proxy (corsproxy.io)
   - JSONP via Google Visualization API

## Tech Stack

- React 18 (unpkg CDN)
- Babel Standalone (in-browser JSX compilation)
- Pure CSS with CSS custom properties (no framework)
- No npm dependencies, no build step
