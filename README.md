# Niche Signal — web dashboard

Your lead-management dashboard as a standalone website (Vite + React). Same
features as the preview — scraper, tagging, multi-campaigns, bulk assign, sales
routing, history, Google Sheets importer — now runnable and deployable.

## Run locally

```bash
cd niche-signal-web
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). Data is saved in your
browser via `localStorage`, so it persists between visits on that device.

## Build for production

```bash
npm run build      # outputs static files to dist/
npm run preview    # preview the production build locally
```

## Deploy (pick one)

- **Vercel** — push this folder to a Git repo and "Import Project", or run
  `npx vercel`. Framework preset: Vite. Build command `npm run build`,
  output dir `dist`.
- **Netlify** — drag the `dist/` folder onto app.netlify.com, or connect the
  repo with build command `npm run build` and publish dir `dist`.
- **Any static host** — upload the contents of `dist/`.

## Notes

- This build stores data per-browser. For a shared, multi-user dashboard with a
  real database, connect it to a backend (e.g. Supabase) and replace the
  `loadState` / `saveState` helpers in `src/App.jsx` with API calls.
- Scraping is still simulated here. To pull real data, point the Scraper's
  `run()` at the YouTube worker API (`POST /api/scrape`) from the companion
  worker project.
