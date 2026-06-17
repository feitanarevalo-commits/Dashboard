# Influencer Discovery Scraper — Make.com Scenario

This connects the dashboard's **Influencer Discovery → Find Influencer** button to a
[Make.com](https://www.make.com) scenario that scrapes real profiles via
[Apify](https://apify.com) and returns them straight into the dashboard.

```
Dashboard "Find Influencer"  ──POST search query──▶  Make Webhook
                                                          │
                                                     Router (by platform)
                                                          │
                                              Apify actor (run-sync-get-dataset-items)
                                                          │
Dashboard ingests results  ◀──JSON array (CORS)──  Webhook Response
```

Delivery is **synchronous**: the dashboard waits for the same HTTP response. Keep the
result limit modest (≈25) because Make webhooks time out around **40 seconds**.

---

## 1. Prerequisites

- A Make.com account (any paid tier; the free tier works for testing).
- An Apify account + **API token** (Apify → Settings → Integrations → API token).
- Apify actors you intend to use. Defaults in the blueprint:
  | Platform  | Apify actor (id)                  |
  |-----------|-----------------------------------|
  | Instagram | `apify/instagram-scraper`         |
  | TikTok    | `clockworks/tiktok-scraper`       |
  | YouTube   | `streamers/youtube-scraper`       |

  > Actor IDs and their input fields change over time. Open each actor's page on Apify,
  > check its **Input schema**, and adjust the JSON body in the matching HTTP module if needed.

---

## 2. Import the blueprint

1. In Make: **Create a new scenario → ⋯ (top-right) → Import Blueprint**.
2. Upload `influencer-discovery.blueprint.json`.
3. Open each **HTTP** module and replace `YOUR_APIFY_TOKEN` in the URL with your real token
   (or better: store it as a Make *connection*/variable and reference it).
4. Click the **Webhook** module → **copy the webhook URL** (looks like
   `https://hook.eu2.make.com/xxxxxxxxxxxxxxxx`).
5. **Save** and toggle the scenario **ON** (scheduling = *Immediately / on webhook*).

> If the import errors out (Make is picky about blueprint versions), use the
> **Manual build** steps in section 6 — it's the same scenario, built by hand in ~10 min.

---

## 3. Connect the dashboard

1. Log in to the dashboard as an **admin**.
2. **⚙ Customize → Webhook URLs → Scraper Webhook (n8n)** field.
3. Paste the Make webhook URL from step 2.4. **Apply Changes.**

That's it. Now **Influencer Discovery → Find Influencer** POSTs your filters to Make,
and the returned profiles are added to your leads as **Fresh** (un-worked) influencers.

> The dashboard already allows-lists `*.make.com` and `api.apify.com` in its
> Content-Security-Policy (`vercel.json`). If you use a different Make region/host,
> add it to `connect-src` there.

---

## 4. Request contract (what the dashboard sends)

`POST <webhook>` with JSON body:

```json
{
  "platform": "Instagram",          // "All" | "Instagram" | "YouTube" | "TikTok" | "Amazon"
  "keyword": "fitness",             // free-text search
  "interest": "Fitness",            // selected interest, "" if none
  "minFollowers": 10000,            // number or null
  "maxFollowers": 1000000,          // number or null
  "gender": "All", "age": "All", "location": "All", "language": "All",
  "engagementRate": "Any", "growthRate": "Any", "lastPost": "Any", "mediaCount": "Any",
  "accountType": "Any", "verified": "Any", "sponsorship": "Any", "contact": "Any",
  "audience": { "gender": "All", "age": "All", "location": "All", "language": "All" },
  "sortBy": "relevance",
  "limit": 25
}
```

The functional filters today are **platform, keyword, interest, minFollowers, maxFollowers,
sortBy, limit**. The rest are passed through for when you wire richer Apify/Modash inputs.

---

## 5. Response contract (what Make must return)

A **JSON array** of influencer objects. The dashboard maps fields tolerantly, so any of
these key names work:

| Dashboard field | Accepted source keys (first non-empty wins)                          |
|-----------------|----------------------------------------------------------------------|
| `channelName`   | `username`, `handle`, `ownerUsername`, `name`, `channelName`, `title`, `fullName` |
| `url`           | `url`, `profileUrl`, `channelUrl`, `inputUrl`, `link`, `webUrl`       |
| `followers`     | `followersCount`, `followers`, `subscriberCount`, `subscribers`, `fansCount`, `fans` |
| `niche`         | `niche`, `category`, `businessCategoryName`, `categoryName`          |
| `emails[0]`     | `email`, `publicEmail`, `businessEmail`                              |
| `platform`      | `platform` (else falls back to the platform tab you searched)        |

Example minimal response:

```json
[
  { "username": "fitqueen", "followersCount": 340000, "url": "https://instagram.com/fitqueen", "category": "Fitness", "email": "fit@q.com", "platform": "Instagram" }
]
```

The blueprint returns Apify's raw dataset items directly — the dashboard normalizes them.
If you prefer to normalize inside Make, add an **Iterator → Array aggregator** before the
Webhook Response and emit the exact shape above.

**CORS:** the Webhook Response modules already send `Access-Control-Allow-Origin: *`. This
is required for the browser to read the response. Keep it.

---

## 6. Manual build (if import fails)

1. **Webhook** (`Webhooks → Custom webhook`) → *Add* → name it, copy the URL.
2. **Router** after the webhook.
3. On each route add an **HTTP → Make a request** module:
   - **URL:** `https://api.apify.com/v2/acts/<actor-id>/run-sync-get-dataset-items?token=<APIFY_TOKEN>`
     (use `~` instead of `/` in the actor id, e.g. `apify~instagram-scraper`)
   - **Method:** POST · **Body type:** Raw · **Content-Type:** application/json
   - **Request content:** the actor's input JSON, mapping `{{1.keyword}}` / `{{1.interest}}` / `{{1.limit}}`
   - **Parse response:** Yes
   - **Route filter:** `platform` = `Instagram` (etc.); make the last route the catch-all.
4. After each HTTP module add **Webhooks → Webhook response**:
   - **Status:** 200 · **Body:** `{{<httpModuleId>.data}}`
   - **Headers:** `Content-Type: application/json`, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type`
5. Save, turn the scenario **ON**, paste the webhook URL into the dashboard (section 3).

---

## 7. Notes & limits

- **Timeout:** synchronous webhooks must finish in ~40s. If a scrape is slow, lower `limit`,
  or switch to the async pattern (Make writes to a Google Sheet → use the dashboard's
  Google Sheets import). Ask and this can be added.
- **Cost:** Apify bills per actor run/result. Start with small limits while testing.
- **De-duplication:** the dashboard skips any returned profile whose `url` already exists,
  so re-running a search won't create duplicates.
- **Placeholder filters** (ER, growth, audience, verified, etc.) are sent but not yet used
  by the default Apify actors. Swap in an actor/provider that supports them (e.g. Modash)
  and map those fields in the HTTP body to make them functional.
