# Influencer Scraper Workflow

Connects the dashboard's **Scraper → Run Scraper** button to an automation that scrapes
real profiles via [Apify](https://apify.com) and returns them straight into the lead queue.

```
Dashboard "Run Scraper"  ──POST search query──▶  n8n (or Make) Webhook
                                                       │
                                                  pick Apify actor by platform
                                                       │
                                          Apify  run-sync-get-dataset-items
                                                       │
Dashboard ingests results  ◀──JSON array (CORS)──  Respond to Webhook
```

Delivery is **synchronous** — the dashboard waits for the same HTTP response. Keep the
result limit modest (≈25); webhooks time out around 40–100s depending on host.

Two ready-to-import files are in this folder:
- **`influencer-discovery.n8n.json`** — n8n workflow ← use this
- `influencer-discovery.make.blueprint.json` — Make.com blueprint (alternative)

---

## n8n setup

### 1. Prerequisites
- An n8n instance (n8n Cloud or self-hosted).
- An Apify account + **API token** (Apify → Settings → Integrations → API token).

### 2. Import the workflow
1. n8n → **Workflows → Import from File** → choose `influencer-discovery.n8n.json`.
2. Open the **Apify Run (sync)** node → in the URL, replace `YOUR_APIFY_TOKEN` with your
   real Apify token. *(Better: create an n8n credential / HTTP Query Auth and reference it
   instead of hard-coding.)*
3. **Save**, then toggle the workflow **Active**.
4. Open the **Webhook** node → copy the **Production URL** (looks like
   `https://<you>.app.n8n.cloud/webhook/influencer-discovery`).

### 3. Connect the dashboard
1. Log in as an **admin** → **⚙ Customize → Webhook URLs → Scraper Webhook (n8n)**.
2. Paste the production webhook URL → **Apply Changes**.

Now **Scraper → Run Scraper** sends your Platform / Niche / Min-Followers to n8n and the
returned profiles drop into the queue as **Fresh** leads (deduped by URL).

### CORS (important)
The Webhook node has **Allowed Origins (CORS) = `*`** set in the imported file — this makes
n8n answer the browser's pre-flight `OPTIONS` request. Without it the browser blocks the
call. Keep it (or set it to your dashboard's exact origin). The Respond node also sends
`Access-Control-Allow-Origin: *`.

### Self-hosted n8n
The dashboard's CSP allow-lists `*.n8n.cloud` and `*.app.n8n.cloud`. If you self-host on a
custom domain, add that domain to `connect-src` in `vercel.json`.

---

## How platforms map to Apify actors

The **Build Apify Request** Code node picks the actor and input from the `platform` field:

| Platform        | Apify actor (id)             | Search input built                                  |
|-----------------|------------------------------|-----------------------------------------------------|
| Instagram / All | `apify~instagram-scraper`    | `{ search, searchType:'hashtag', resultsLimit }`    |
| TikTok          | `clockworks~tiktok-scraper`  | `{ hashtags:[term], resultsPerPage }`               |
| YouTube         | `streamers~youtube-scraper`  | `{ searchKeywords, maxResults }`                    |

> Actor IDs and their input fields change over time. Open each actor on Apify, check its
> **Input** schema, and adjust the Code node if needed. Edit the `switch` to add platforms
> or swap providers (e.g. Modash for ER/audience filters).

---

## Request contract (what the dashboard sends)

`POST <webhook>` with JSON body:

```json
{
  "platform": "Instagram",          // "All" | "Instagram" | "YouTube" | "TikTok" | "Amazon"
  "keyword": "fitness",
  "interest": "Fitness",
  "minFollowers": 10000,
  "maxFollowers": null,
  "sortBy": "relevance",
  "limit": 25
}
```

In n8n the body arrives under `{{ $json.body }}` (the Code node already handles this).
Functional filters today: **platform, keyword, minFollowers, limit**. Others are passed
through for when you wire a richer provider.

## Response contract (what the workflow returns)

A **JSON array** of influencer objects. The dashboard maps field names tolerantly — any of
these work (first non-empty wins):

| Dashboard field | Accepted source keys                                                  |
|-----------------|-----------------------------------------------------------------------|
| `channelName`   | `username`, `handle`, `ownerUsername`, `name`, `channelName`, `title`, `fullName` |
| `url`           | `url`, `profileUrl`, `channelUrl`, `inputUrl`, `link`, `webUrl`        |
| `followers`     | `followersCount`, `followers`, `subscriberCount`, `subscribers`, `fansCount`, `fans` |
| `niche`         | `niche`, `category`, `businessCategoryName`, `categoryName`           |
| `emails[0]`     | `email`, `publicEmail`, `businessEmail`                               |
| `platform`      | `platform` (else the platform you searched)                          |

The workflow returns Apify's raw dataset items; the dashboard normalizes them. To normalize
inside n8n instead, add a **Set/Code** node before *Respond to Dashboard* that emits the
exact shape above.

---

## Notes & limits
- **Timeout:** synchronous webhooks must finish fast — keep `limit` ~25. For long/large
  scrapes, switch to async (n8n writes results to a Google Sheet → use the dashboard's
  Google Sheets import). Ask and this can be added.
- **Cost:** Apify bills per run/result. Start small while testing.
- **De-dup:** the dashboard skips returned profiles whose `url` already exists.
- Until a real webhook URL is set in Customize, **Run Scraper** just shows a notice.
