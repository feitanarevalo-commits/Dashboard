# Close CRM as storage (via n8n)

Use Close CRM as the dashboard's backing store, so leads persist across reloads and
are shared across reps. The dashboard is a static site, so it never holds your Close
API key — it talks to **n8n**, and n8n calls Close.

```
LOGIN ─▶ dashboard ──POST {}──▶ n8n "close-load" ──▶ Close: List Leads ──▶ JSON array ──▶ dashboard fills queue
SAVE  ─▶ dashboard ──POST {leads:[…]}──▶ n8n "close-save" ──▶ Close: Create/Update Lead (per lead)
```

**Simulation design (minimal Close setup):** each dashboard lead is stored as **JSON in
the Close lead's `description`** field. No custom fields to create — we round-trip the
whole object. (You can move to proper Close custom fields later.)

---

## 1. Close API key + n8n credential
1. Close → **Settings → API Keys** → create a key (use your **temporary** account).
2. In n8n → **Credentials → New → Basic Auth**:
   - **User** = your Close API key
   - **Password** = leave blank
   - Name it e.g. "Close API (key as username)".
   *(Close uses HTTP Basic auth with the API key as the username.)*

## 2. Import the two workflows
- `close-load.n8n.json`  → pulls leads **from** Close
- `close-save.n8n.json`  → pushes leads **to** Close

For each: n8n → **Import from File** → open each HTTP node → set its **Credential** to the
Basic Auth you made in step 1 (the imported `REPLACE_WITH_CREDENTIAL` won't auto-link).
Then **Save** and **Activate** both workflows.

Copy each Webhook's **Production URL**.

## 3. Point the dashboard at them
Dashboard → **⚙ Customize → Webhook URLs**:
- **Close — Save Webhook** = the `close-save` production URL
- **Close — Load Webhook** = the `close-load` production URL
- **Apply Changes**

## 4. Use it
- **Save to Close** (sidebar, admin) → pushes all current leads into Close.
- **Load from Close** (sidebar, admin) → pulls them back.
- On **login**, if a Load Webhook is set, the dashboard auto-loads from Close.

**Simulate persistence:** scrape a few leads → **Save to Close** → check they appear in
Close → reload the dashboard (queue empties) → **Load from Close** (or just log in) → the
leads come back. That's Close acting as storage. ✅

---

## Request / response contracts

**close-load** — dashboard sends `POST {}`. Must return a **JSON array** of dashboard-shaped
leads (the load workflow reads each Close lead's `description` JSON):
```json
[ { "channelName":"Chef Tyler", "platform":"YouTube", "url":"https://youtube.com/channel/UC1",
    "followers":"5.59M", "niche":"Cooking", "emails":[], "tags":["Potential"],
    "campaigns":[], "assignedTo":"Pen", "closeLeadId":"lead_abc" } ]
```
Each returned lead should include its **`closeLeadId`** so future saves update instead of
duplicating.

**close-save** — dashboard sends `POST { "leads":[ …full lead objects… ] }`. The workflow
upserts each into Close:
- lead **has `closeLeadId`** → `PUT /lead/{id}/` (update)
- lead **has no `closeLeadId`** → `POST /lead/` (create)

The save workflow responds immediately (200) — the dashboard just needs the OK. If you want
no-duplicate guarantees on re-save, have the create branch return `[{ "id": <dashboardId>,
"closeLeadId": <newCloseId> }]` and switch the Webhook to "Respond to Webhook Node"; the
dashboard will store those IDs back on each lead.

---

## CORS & hosts
- Both Webhook nodes have **Allowed Origins (CORS) = `*`** preset in the JSON — keep it.
- The dashboard only ever calls **n8n** (never Close directly — n8n holds the key), and the
  CSP already allows `*.app.n8n.cloud`. Self-hosted n8n on a custom domain needs that domain
  added to `connect-src` in `vercel.json`.

## Notes & limits
- **Speed:** Load is synchronous; keep `_limit` modest (200 is fine for a temp account).
- **Mapping later:** when you outgrow JSON-in-description, create Close custom fields
  (platform, followers, niche, tags, assigned rep, channel URL/ID) and map them field-by-field
  in the two workflows. Ask and I'll write that mapping.
- **Auth note:** API key lives only in n8n. The dashboard never sees it.
