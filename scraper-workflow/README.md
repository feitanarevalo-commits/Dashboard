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

Ready-to-import files in this folder:
- **`influencer-discovery.n8n.json`** — n8n workflow (Apify)
- `influencer-discovery.make.blueprint.json` — Make.com blueprint (Apify)
- `youtube-search.make.blueprint.json` — Make + YouTube Data API (no follower counts)
- **`youtube-enriched.make.blueprint.json`** ← **use this** — Make + YouTube API **with
  subscriber counts** (search → channels.list enrichment), so the dashboard's follower
  column fills and the Min-Followers filter works.

---

## Make + YouTube with subscriber counts (youtube-enriched.make.blueprint.json)

The plain `search` endpoint returns channel name + thumbnail but **no subscriber count**. This
blueprint adds a second call to `channels.list` to fetch `statistics.subscriberCount`. It needs
**no Iterator or Aggregator** — it uses Make's `map()`/`join()` to build the channel-id list.

Flow: `Webhook → HTTP search → HTTP channels.list → Webhook Response`

- **HTTP 2 (search):** `youtube/v3/search?part=snippet&type=video&q={{keyword}}&maxResults=25`
- **HTTP 3 (channels):** `youtube/v3/channels?part=snippet,statistics&id={{join(map(2.data.items;"snippet.channelId"));",")}}`
  — `map()` pulls every `channelId` and `join()` makes the comma list the API expects.
  (Duplicate ids are harmless — `channels.list` returns one per channel and the dashboard
  also de-dupes by channel.)
- **Webhook Response:** Body `{{3.data.items}}`, Status 200, headers `Content-Type: application/json`
  + `Access-Control-Allow-Origin: *` (note: Make header field is **Key**, value `*`).

**Setup:** import → put your **YouTube Data API key** in **both** HTTP modules' `key` field →
Save → toggle the scenario **ON (live)** → paste the Webhook production URL into ⚙ Customize →
Scraper Webhook.

The dashboard reads `snippet.title`, `id` (channel id), `statistics.subscriberCount`, and the
thumbnail from each returned channel — so followers show, dedupe-by-channel works, and the
**Min Followers** dropdown rejects anyone below the threshold.

> Quota note: this makes 2 API calls per scrape (~101 units total of the 10,000/day default).

---

## Make + YouTube Data API (youtube-search.make.blueprint.json)

This is the fix for the **"Scraper response was not valid JSON (got: Accepted…)"** error. That
error happens when an Iterator feeds the Webhook Response directly — the response tries to fire
once per item, so Make falls back to its default `Accepted` ack. The blueprint adds an **Array
Aggregator** so one JSON array is returned.

Flow: `Webhook → HTTP (youtube/v3/search) → Iterator → Array Aggregator → Webhook Response`

**Setup**
1. Get a **YouTube Data API v3 key** (Google Cloud Console → enable "YouTube Data API v3" →
   create an API key).
2. Make → **Create scenario → ⋯ → Import Blueprint** → `youtube-search.make.blueprint.json`.
3. Open the **HTTP** module → replace `YOUR_YOUTUBE_API_KEY` in the `key` query field.
4. Confirm the modules linked up: Iterator array = `{{2.body.items}}`, Aggregator source = the
   Iterator, Webhook Response **Body** = `{{4.array}}` with headers `Content-Type: application/json`
   and `Access-Control-Allow-Origin: *`.
5. **Save**, toggle **ON**, copy the Webhook **production URL**, paste into the dashboard
   (⚙ Customize → Scraper Webhook).

**Field mapping** (each YouTube result → dashboard lead, built in the Aggregator):
| Dashboard field | From YouTube item |
|-----------------|-------------------|
| channelName     | `snippet.channelTitle` |
| channelId       | `snippet.channelId`    |
| url             | `https://www.youtube.com/channel/{channelId}` |
| thumbnail       | `snippet.thumbnails.high.url` |
| platform        | `YouTube` (constant) |

> `youtube/v3/search` returns **per-video** results, so a channel can repeat — the dashboard
> de-dupes by `channelId` automatically. Also note YouTube API quota: each search costs ~100
> units of the daily 10,000 default.

> If the import is finicky (Make can be picky about Aggregator blueprints), build it by hand
> with those 5 modules — the key is the **Array Aggregator between the Iterator and the Webhook
> Response**, and the Response body = the aggregated array.

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
