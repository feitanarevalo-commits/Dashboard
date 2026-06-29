/* ═══════════════════════════════════════════════════════════
   LeadFlow Dashboard — config.js
   ═══════════════════════════════════════════════════════════
   Edit this file to customise the app without touching app logic.
   Changes here take effect on the next page reload.
   ═══════════════════════════════════════════════════════════ */

// ── PLATFORMS ──────────────────────────────────────────────
// Add or remove platforms here. The icon shows in the table.
var PLATFORMS = ['YouTube', 'TikTok', 'Instagram'];
var PLATFORM_ICON = { YouTube: '▶', TikTok: '♫', Instagram: '◈' };

// ── STATUS TAGS ────────────────────────────────────────────
// These are the standard lead statuses shown in dropdowns.
// Changing order here changes dropdown order throughout the app.
var STATUSES = ['Potential', 'Contacted', 'For Recycle'];
var STATUS_CLS = {
  'Potential':      'tag-potential',
  'Not Qualified':  'tag-nq',
  'Contacted':      'tag-contacted',
  'Existing Leads': 'tag-existing',
  'For Recycle':    'tag-recycle',
  'Duplicate':      'tag-duplicate',
};

// Tags that cause a lead to leave the Scraper queue.
// Add a tag here to make it auto-route leads out of Scraper.
var STATUS_TAGS = ['Potential', 'Contacted', 'For Recycle', 'HT'];

// ── TAG COLOURS ────────────────────────────────────────────
// Controls the colour of tag badges everywhere in the app.
var TAG_COLORS = {
  'Potential':      { bg: '#E3FCF2', color: '#00875A' },
  'Not Qualified':  { bg: '#FFEBE6', color: '#DE350B' },
  'Contacted':      { bg: '#EBF2FF', color: '#1366D6' },
  'For Recycle':    { bg: '#FFF4E5', color: '#FF8B00' },
  'Existing Leads': { bg: '#EAE6FF', color: '#6554C0' },
  'Duplicate':      { bg: '#F0F2F5', color: '#68737D' },
  'HT':             { bg: '#FFF4E5', color: '#FF8B00' },
};

// ── APP DEFAULT SETTINGS ───────────────────────────────────
// These are the factory defaults loaded on first visit.
// Users can override them in the Settings drawer — changes
// are saved to localStorage and will persist across reloads.
var DEFAULT_CONFIG = {

  // Which sidebar tabs are visible by default
  tabs: {
    home: true, scraper: true, history: true,
    'prev-scraped': true, 'lead-mgmt': true, 'google-import': true, agency: true, 'close-data': true,
    leaves: true, knowledge: true,
    pending: true, contacted: true,
    recycle: true, recent: true, duplicates: true, msn: true, vvv: true,
  },

  // Which table columns are shown by default
  columns: {
    thumbnail: true, channelName: true, url: true, platform: true,
    niche: true, followers: true, emails: true, tags: true,
    campaign: true, assignedTo: true, dateAssigned: true,
  },

  // Feature flags — toggle these on/off in the Settings drawer
  features: {
    bulkAssign: true, exportCSV: true, exportPDF: true,
    dailyRefresh: true, colorHighlights: true, webhookTrigger: true,
    historyRestore: true, emailValidation: false,
  },

  // ── Supabase (backend) ── shared, persistent data store.
  // The publishable key is meant to be public (browser-safe); access is gated by
  // Row-Level Security on the tables. Stage 1: shared profiles.
  supabaseUrl: 'https://wokrdfqzwrausazzoedi.supabase.co',
  supabaseKey: 'sb_publishable_-BsDhuAgQ8mIQfh84Jrjyg_61b_2rcK',

  // ── Webhook URLs ── live Make.com scenarios (eu1)
  closeWebhook:     'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/close-push-v2', // SAVE leads → real Enfinity Close org (Edge Function; Assigned To = importing rep)
  closeLoadWebhook: '', // PUSH-ONLY: the real Enfinity org has ~628k leads — the dashboard's store is Supabase, not Close. (close-load fn still exists for the old test org if ever needed.)
  closeCheckWebhook:'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/close-check', // dedup: which scraped channels already exist in Close (by channel id / email)
  closeMineWebhook: 'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/close-mine',  // per-rep scoped view: leads in Close Assigned To a rep (📁 Close Leads button)
  closeSearchWebhook:'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/close-search', // free-text search of the Close DB (Close Database tab) to check if a lead exists
  ytLookupWebhook:  'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/yt-lookup',     // paste a YouTube URL → auto-pull channel name + subscriber count (Add Lead form)
  // ── Leaves → Google Sheet ──────────────────────────────────
  // POST target that records every leave request + decision to a Google Sheet.
  // Leaves are stored in Supabase (source of truth); this just mirrors them to a
  // sheet for your records. Wire it to a Google Apps Script web app (Deploy →
  // Web app → "Anyone") or a Make/Zapier "Webhook → Google Sheets" scenario.
  // Each POST body: { event:'filed'|'decision', name, type, start_date, end_date,
  //   days, reason, status, decided_by, decided_at }. Leave blank to skip the sheet.
  leavesWebhook: 'https://script.google.com/macros/s/AKfycbxdtfllSCiV2KittPTAWQGcVRsTbNrZtM_lr2YZSHtLJhaHPNE-ulzPK-jPZX5SQn_Ktw/exec',
  scrapeWebhook:    'https://hook.eu1.make.com/amu0xr93i4q214760zi9rqa1lcxlch55', // YouTube scraper gateway
  smartreachWebhook:'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/smartreach-add', // SEND prospects → SmartReach (Supabase Edge Function; was Make)
  // Replies / interest feed (🔔). Each returns an array of reply objects:
  //   { rep, source:'SmartReach'|'Close', name, email, sentiment, snippet, when, campaign }
  // Wired later (SmartReach reply-webhook → Make store; Close inbound email
  // activity). Leave blank until connected — the panel shows an empty state.
  // 🔔 Replies/interest feed — one Edge Function merges Close incoming emails
  // (scoped by the rep's Close user_id) + SmartReach replies (stored by the
  // sr-reply-ingest webhook). The dashboard POSTs {rep} (or 'all' for admins).
  repliesWebhook:      'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/replies',
  closeRepliesWebhook: '', // (unified into `replies` above)

  // ── Per-rep YouTube API keys ───────────────────────────────
  // Each Google Cloud project has its own 10,000 units/day (~100 searches).
  // Give each rep their own key so they don't share one quota bucket. The
  // scraper uses the logged-in person's key here; blank → the shared default
  // key baked into the Make scraper scenario. To make a key: console.cloud.google.com
  // → new project → enable "YouTube Data API v3" → Credentials → API key.
  repApiKeys: {
    Robert:'', Chai:'', Rein:'', Jon:'', Jake:'', Czarina:'',
    Pen:'', Chase:'', Mikka:'',
  },

  // Close.io lead custom-field IDs (so loaded leads map back from separate
  // columns instead of the description). Match these to your Close custom fields.
  // Real Enfinity Close org custom-field ids (push handled server-side by the
  // close-push-v2 Edge Function; these are kept for reference / any future load).
  // The org has no single platform/campaign field, so those are blank.
  closeFields: {
    platform:  '',
    niche:     'cf_NKq9FaRQGXiXvXkqoAE37yIzzlIM97bYdx44PePYhFS',  // GENRE/CONTENT KEYWORDS
    followers: 'cf_nza46TI9wN8XHYBO4UsgMn1OZDz35YGsbMznhme2sX8',  // FOLLOWERS
    status:    '',
    campaign:  '',
    rep:       'lcf_jAlVnfW7GaOPZG2Pmaap74YBK8nITbnlAQgl6r6UU4K', // Assigned To
    assigned:  'lcf_OpXbKy0c1Ai9SuQ7Wh8egmK6RmeeyTmmZPMoT4zrrAm', // Assigned On
    channelName:'lcf_pRE5ACR0tjTiNd0OaURhOAYMxO7LLoMx5J6qiFtHPd4', // Channel Name
    channelUrl: 'lcf_yHH8kQ9ToHsQwnHANWPQ49BtTVTe6h7MgNxdqILoVNv', // Channel URL
  },

  // SmartReach campaigns per rep — [{id,label}] shown in the rep's bulk
  // "Send to SmartReach" campaign picker (only that rep's campaigns appear under
  // her). The `id` is the SmartReach v3 campaign id (cmp_aa_…) used by the
  // smartreach-add Edge Function to assign prospects. Pulled from the ENFINITY
  // LIMITED team (team_37v05DkjQRguhG7BkFGRwnja9ns) on 2026-06-26, grouped from
  // the "REP | CAMPAIGN" naming. Re-pull when reps add/rename campaigns:
  //   GET https://api.smartreach.io/api/v3/campaigns?team_id=<team>&limit=100  (X-API-KEY).
  smartReachCampaigns: {
    Pen:     [{ id: 'cmp_aa_38pcXApBGt6RpScykd1URRLLPuN', label: 'PENN | VVV' }, { id: 'cmp_aa_3COTLhBrkcbrkbCUwLsNZSyb9UM', label: 'Penn New | Boost' }, { id: 'cmp_aa_3DwWREXL5Syq2gPenMZu5rkVpcX', label: 'PENN | TERMINATED VVV' }],
    Chase:   [{ id: 'cmp_aa_38y1MsGQ3hPdMQk5Kg6WHFRMHGO', label: 'CHASE | VVV' }, { id: 'cmp_aa_38SsXvJEXKMoLpuRTHZwn4g4GMj', label: 'CHASE | ADCE' }, { id: 'cmp_aa_3DwINVBLTf3Y5RsarY8NXyHguGl', label: 'CHASE | TERMINATED VVV' }],
    Mikka:   [{ id: 'cmp_aa_3BW3Tr9X01h61ZQ2Ml6Tsaoh1nC', label: 'MIKKA | VVV' }, { id: 'cmp_aa_38SsXY2YqK196NOwRpanImKVFhc', label: 'MIKKA | ADCE' }, { id: 'cmp_aa_3DwfqEhsiLOVUxvDkRwmZzMYUMC', label: 'MIKKA | TERMINATED VVV' }],
    Rein:    [{ id: 'cmp_aa_38pUJRCEuKB38r96SqAktudh8Qy', label: 'REIN | VVV' }, { id: 'cmp_aa_37vkk7UPDs324ppe3ohgG84zei5', label: 'REIN | ADCE' }, { id: 'cmp_aa_3Di54T9wsV5oMGOEVb45Ag9fspB', label: 'REIN | MSN HIGH TICKET' }],
    Chai:    [{ id: 'cmp_aa_3FceCoPDrdE9ITT0Eijw8zkfYHV', label: 'Dashboard import test.' }, { id: 'cmp_aa_3APhyOjFpS1rDDPnjSP3eSsIa0h', label: 'CHAI | VVV' }, { id: 'cmp_aa_37vquAjmOiZfHEOYdkNp30AQZKy', label: 'CHAI | ADCE' }, { id: 'cmp_aa_3BU24L84bG2cV1fKAOMMpnpJfD9', label: 'CHAI | CREATORSHIELD' }, { id: 'cmp_aa_38pDWhNO16kBlSYk5Lg7HAr9IP2', label: 'CHAI | ENFINISHIELD' }, { id: 'cmp_aa_3Dhzbwp2SKVnz4ePyKWgpB2Z0F1', label: 'CHAI | MSN HIGH TICKET' }],
    Jon:     [{ id: 'cmp_aa_3DP0AtM9fwhNDr71nvOrmrtGSD6', label: 'Jonathan | VVV' }, { id: 'cmp_aa_3BzuXEkMCzYZR0FPR2LlC0G9kAM', label: 'Jonathan | CREATORSHIELD' }, { id: 'cmp_aa_37v3CSEVgg3z8Pj0pEgVr57blNx', label: 'Jonathan | BOOST' }],
    Czarina: [{ id: 'cmp_aa_38StlKFWU0lRSttNQ9lHOCbI3UA', label: 'CZARINA | ADCE & BOOST' }, { id: 'cmp_aa_38pbJbu4Zosf7CFRz1FflL73UDK', label: 'CZARINA | MCN' }],
  },

  // ── Campaigns ── add as many as you need
  campaigns: [
    { id: 'MSN', label: 'MSN', color: '#1366D6' },
    { id: 'VVV', label: 'VVV', color: '#6554C0' },
  ],

  // ── Sales Reps ── names and appearance
  salesReps:  ['Pen', 'Rein', 'Chase', 'Mikka', 'Chai', 'Jon', 'Czarina'],
  repColors:  { Pen: '#6366F1', Rein: '#10B981', Chase: '#F59E0B', Mikka: '#EC4899', Chai: '#0EA5E9', Jon: '#8B5CF6', Czarina: '#14B8A6' },
  repEmojis:  { Pen: '', Rein: '', Chase: '', Mikka: '', Chai: '', Jon: '', Czarina: '' },
  repPhotos:  {},

  // ── Shared profile details (team-wide) ─────────────────────
  // Optional defaults shown for everyone (birthdays drive the Home reminders;
  // titles show in the rep header + profile hover-card). Each person can still
  // override their own on their device via the "Edit Profile" modal. Format:
  //   Mikka: { title: 'Sales Rep', email: 'mikka@enfinity.co', birthday: '1996-06-25' }
  profiles: {},

  // ── USERS & LOGIN ──────────────────────────────────────────
  // role: 'admin'    = full access (open Settings, delete/edit any lead, see all analytics)
  //       'employee' = sees own leads, cannot open Settings or delete leads
  //
  // ⚠ SECURITY NOTE: passwords are stored client-side. This gates casual
  //   access for an internal team, but anyone who views the page source can
  //   read them. It is NOT bank-grade security. Change the defaults below.
  //   Admins are: Robert, Chai, Rein, Jon, Jake, Czarina.
  users: [
    { name: 'Robert',  role: 'admin',    password: 'enfinity' },
    { name: 'Chai',    role: 'admin',    password: 'enfinity' },
    { name: 'Rein',    role: 'admin',    password: 'enfinity' },
    { name: 'Jon',     role: 'admin',    password: 'enfinity' },
    { name: 'Jake',    role: 'admin',    password: 'enfinity' },
    { name: 'Czarina', role: 'admin',    password: 'enfinity' },
    { name: 'Pen',     role: 'employee', password: 'enfinity' },
    { name: 'Chase',   role: 'employee', password: 'enfinity' },
    { name: 'Mikka',   role: 'employee', password: 'enfinity' },
  ],

  // Tags shown in the Settings drawer "Status Tags" section
  statusTags: ['Potential', 'Contacted', 'For Recycle'],
};

// ── SAMPLE / SEED DATA ─────────────────────────────────────
// Add sample leads here if you want the dashboard pre-loaded.
// Each lead must have these fields (all optional except id & channelName).
// Example:
// { id: 1, channelName: 'Test Channel', url: 'https://youtube.com/@test',
//   platform: 'YouTube', niche: 'Finance', followers: '50K',
//   emails: ['test@gmail.com'], tags: [], campaigns: [],
//   assignedTo: null, dateAssigned: null, lastContactDate: null, channels: [] }
// Production: empty so the dashboard starts clean and fills from real
// scrapes / imports. (Add objects here only if you want seeded demo data.)
var SAMPLE_LEADS   = [];
var SAMPLE_HISTORY = [];

// Seed replies for the 🔔 panel (empty in production — fills from the replies
// feeds). Shape: { id, rep, source:'SmartReach'|'Close', name, email,
//   sentiment:'Interested'|'Neutral'|'Not interested'|'Reply', snippet, when, campaign }
var SAMPLE_REPLIES = [];

// ── KNOWLEDGE BASE ARTICLES ────────────────────────────────
// The Sales Operations Manual, rendered in the 📚 Knowledge Base tab.
// (Passwords from the source doc are intentionally redacted — ask an admin.)
var KB_ARTICLES = [
{ id:'ch1', chapter:'1 · Company Overview', title:'Company Overview', body:
`## About Enfinity
Enfinity is a **Creator Service Provider (CSP)**, formerly a Multi-Channel Network (MCN). A CSP partners with creators to help grow, protect, and monetize their content across platforms.

Founded in 2020 by creators, with a simple mission: **Do what is right for creators, no matter what.** Enfinity remains 100% creator and founder owned.

## Core Values
- **Creators Come First** — everything is designed around creators' needs.
- **Always Help Those In Need (AHTIN)** — a service-first mindset.
- **Creators Make the Rules** — creators keep ownership of content, brand, audience & decisions.
- **Long-Term Partnerships** — sustainable, long-term value.

## What We Do
### 1. Content Distribution (Microsoft)
- **Adcelerate** — distribute & monetize videos on Microsoft platforms.
- **EnfiniBoost** — the same Microsoft distribution under the Enfinity ecosystem.
Benefits: additional revenue, distribution to MSN & Microsoft properties, increased reach, managed publishing. Platforms: MSN, Microsoft Start, Bing, Microsoft Edge, Xbox.

### 2. Copyright Protection
- **CreatorShield** — identify, track & monetize unauthorized uploads on YouTube.
- **EnfiniShield** — the same protection under the Enfinity ecosystem.
Benefits: Content ID management, unauthorized-content tracking, revenue recovery, rights management.

### 3. Licensed Content Library
- **Very Viral Videos (VVV)** — millions of licensed clips for compilation/reaction content with full usage rights.

### 4. Creator Service Provider (CSP)
Additional support, business resources, monetization, and creator perks.

## The Enfinity Dashboard
The central hub for enrolled creators — view earnings & performance, manage payouts, track transactions, access services & perks, manage settings.` },

{ id:'ch2-msn', chapter:'2 · Services', title:'MSN — Adcelerate & EnfiniBoost', body:
`## Service Overview
Adcelerate & EnfiniBoost distribute creator content across Microsoft-owned properties (MSN, Microsoft Start, Bing, Microsoft Edge, Xbox), earning additional revenue while creators keep ownership.

## Program Benefits
- Additional revenue beyond YouTube/social
- Wider distribution & increased reach
- Managed publishing by Enfinity
- Access to Microsoft's content ecosystem
- No need to create additional content

## Content & Upload Requirements
- Original, high-quality content, consistent uploads, strong catalog.
- **English channels:** last upload within **2 weeks**.
- **Other markets:** last upload within **1 month**.
- Channels with no recent uploads should not be qualified.

## Markets to Avoid
Turkish, Arabic, Indonesian, Indian, Hindi-speaking (lower monetization).

## Low-Priority Categories (case-by-case)
Toy Reviews, Tech Reviews, Arts, Drawing, Cosplay, Makeup, ASMR, Gaming.

## Platform Qualification
### YouTube (preferred — long or short form)
- **Subscribers:** 10,000
- **Total Videos:** 300
- **Avg Views/Video:** 1,000
- **Upload Activity:** Active

*Exception:* under 10,000 subs may still qualify with exceptional quality, consistent uploads, an extensive catalog, and strong engagement — review carefully.

### TikTok
- **Followers:** 100,000 · **Likes:** 300,000 · **Videos:** 300 · **Avg Views:** 1,000

### Instagram / Facebook
- **Followers:** 100,000 · **Videos:** 300 · **Avg Views:** 1,000

## Lead Qualification Checklist
☐ Original content
☐ Meets platform requirements
☐ Active uploader
☐ Meets upload timeframe
☐ Strong content quality
☐ Email available
☐ Email validated (ZeroBounce)
☐ Not already in the lead database
☐ Appropriate market & niche

## Notes for Sales
- Quality > follower count. YouTube is the primary MSN platform.
- Review borderline cases before disqualifying; escalate if uncertain.
- Always validate emails via ZeroBounce and check for duplicates.` },

{ id:'ch2-cs', chapter:'2 · Services', title:'CreatorShield & EnfiniShield', body:
`## Service Overview
Copyright protection & digital rights management. Helps creators identify, track & monetize unauthorized uses of their content on YouTube via Content ID — recovering revenue from reuploads and strengthening IP control.

## Program Benefits
Copyright protection · unauthorized-content detection · revenue recovery from reuploads · Content ID management · rights management · ongoing monitoring.

## Ideal Creator Profile
Creators who produce original content, own their rights, create unique material consistently, have an established audience, and whose content is frequently reused by others.

## Qualification Requirements
- **Followers/Subscribers:** 100,000
- **Total Likes:** 500,000
- **Total Uploads:** 50 videos
- **Content Ownership:** original content required (all content owned by the creator)

## Content Ownership
Must own the rights, appear in / create / produce the content, have authority to grant Content ID rights, and avoid significant third-party material.

## Disqualified Markets
India, Pakistan, Russia, Turkey, Indonesia.

## Non-Eligible Content
- **Copyright/ownership risks:** copyrighted, compiled/movie/TV/series clips, celebrity/athlete clips, reaction videos, compilations, TikTok duets/stitch, split-screen.
- **Music:** music videos, DJ content, lyric videos, lip-sync.
- **Gaming:** all gaming content.
- **AI/third-party:** AI-generated content/videos, AI-tool & third-party-software tutorials.
- **Product/promo:** product reviews, promotional/sponsored, business-focused.
- **Restricted:** politics, religion, crime, violence, firearms, drugs, adult/explicit, profanity-heavy, dangerous pranks/acts.
- **Children's:** toy reviews/unboxing, slime, squishy.
- **Other:** anime/digital art with copyrighted characters, mukbang, general public-frame, travel vlogs of public locations without creator participation.

## Special Review Cases
Travel, educational, commentary, mixed-format channels — escalate rather than auto-qualify.

## Lead Qualification Checklist
☐ Creator owns the content
☐ Content is original
☐ Meets follower/like/upload minimums
☐ No significant third-party material
☐ Not a restricted country
☐ Eligible content category
☐ Email available & validated (ZeroBounce)
☐ Not already in the database

## Notes for Sales
- Original content ownership is the most important factor.
- If ownership is unclear, don't qualify immediately — escalate.
- Quality & ownership > follower count.` },

{ id:'ch2-vvv', chapter:'2 · Services', title:'Very Viral Videos (VVV)', body:
`## Service Overview
A licensed video library giving creators access to thousands of licensed clips for compilation/reaction content. Primarily for compilation channels — monetizable compilation videos with reduced copyright risk.

## Program Benefits
Licensed viral clips · thousands available · full usage rights · built for compilation creators · additional monetization · reduced copyright risk · continuous new content.

## Best-Suited Content
Compilation, viral, reaction, and entertainment-compilation channels — or creators expanding into compilation content. Prioritize channels already publishing random compilations.

## Qualification
- **Active channels:** uploaded within the last **3 months**, primarily random compilations, active & operational. (No minimum views.)
- **Aged channels:** ≥ **50,000 SocialBlade views in the last 30 days** + primarily random compilations.
- **Monetized channels:** eligible if a legitimate compilation channel (not primarily original creator-owned content).
- **Subscribers:** no minimum — evaluate by content type & activity.

## Non-Eligible Content
- **Restricted:** black/racial/religious/political/crime/violence/explicit/sexual/adult.
- **Entertainment:** anime series, movie clips, documentaries, K-Pop compilations, specific creator/influencer compilations.
- **Children's:** toy, slime, squishy.
- **Other:** gaming, POV, mukbang, promotional, business, product promos, AI-generated.

## Restricted Markets
India, Pakistan, Russia.

## Video Length
Channels primarily **under 4 minutes** are not eligible — prioritize longer-form compilation content.

## Lead Qualification Checklist
☐ Primarily compilation content
☐ Random compilations
☐ Upload activity within 3 months
☐ Eligible category
☐ Videos generally > 4 minutes
☐ Not restricted category/market
☐ Email available & validated (ZeroBounce)
☐ Not already in the database

## Notes for Sales
- Goal: recruit compilation creators (reuploaders are strong candidates).
- Original creators are generally not the target.
- Review content quality/legitimacy; escalate if uncertain.` },

{ id:'ch3', chapter:'3 · Sales Process', title:'End-to-End Sales Process (18 steps)', body:
`## Overview
The Sales Team sources qualified creators, runs outreach, manages relationships, and supports onboarding — tracking every qualified creator from first contact through activation & submission.

## Process Flow
Lead Generation → Lead Validation → Lead Assignment → CRM Import → Outreach Campaign → Creator Response → Signup → Qualification Review → Dashboard Invitation → KYC & Payment → Submission → Approval/Rejection → Ongoing Management

## Step 1 — Lead Generation
Manually scrape qualifying creators from YouTube, Instagram, TikTok, Facebook (Infludata optional). Review the qualification requirements for each service before adding.

## Step 2 — Lead Validation & Encoding
Enter qualified leads into the Lead Database: Account Name, Channel/Page URL, Email, Service Qualification. Validate all emails via **ZeroBounce** — only valid emails are added.

## Step 3 — Daily Lead Assignment
**Cut-off: 4:30 PM.** Leads move to the Assigning Tab, become the official daily record, and are assigned to the rep who sourced them.

## Step 4 — Import into Close CRM
Assigned leads go into **Close** — the primary platform for lead tracking, inbox, follow-ups, tasks, and communication history.

## Step 5 — Import into SmartReach
Export via CSV → upload to SmartReach → assign to the right campaign (MSN, CreatorShield/EnfiniShield, or VVV).

## Step 6 — Campaign Launch
Launch in SmartReach per the approved schedule. Monitor performance, track replies, manage responses.

## Step 7 — Creator Communication
Replies arrive in the **Close Inbox**. Monitor daily, respond promptly, personalize, address concerns. **Calls are strongly encouraged** — they build trust and improve conversion.

## Step 8 — Signup Monitoring
Manager reviews signups daily. Qualified creators are added to the **Enfinity Clients Database** (Full Name, Country, Social Links, Service Enrolled).

## Step 9 — Service Review
- **MSN:** if opted into CID → Ingest Team → MS Team → approved for dashboard invite.
- **CreatorShield/EnfiniShield:** Ingest Team → Content ID eligibility verified.
- **VVV:** added to database → dashboard invite → asset label assigned.

## Step 10 — Dashboard Invitation
- **Adcelerate:** sent manually.
- **EnfiniBoost:** approved in-dashboard → automatic invite.
- **VVV:** sent manually via recruit link.

## Step 11 — KYC & Payment Setup
Creators activate dashboard access, complete **Tipalti** registration & KYC — mandatory before CID ingestion, MSN submission, or revenue processing.

## Step 12 — Sales Follow-Up
Manager creates a Close task → assigned rep sends the approved signup email → schedule follow-ups until the dashboard is activated and Tipalti is completed.

## Step 13 — MSN Submission
Creator submitted to Microsoft → review queue → approval/rejection. Processing times vary.

## Step 14 — Approved Creators
Nette endorses to Rein → Rein updates dashboard info → Close task → Sales notifies the creator. Provide creator updates **quarterly**.

## Step 15 — Rejected Creators
Update dashboard access → Close task → notify creator. Review upsell options (CID, VVV). **MCN upsells handled by Czarina.**

## Step 16 — Pipeline Monitoring
Monitor: New Leads, Active Campaigns, Pending Replies/Signups/Review/Dashboard Activation/Tipalti/KYC/CID Ingestion/MSN Submission, Approved & Rejected creators.

## Step 17 — Escalation
- **Sales concerns:** Chai, Rein
- **Revenue & earnings:** Czarina

## Step 18 — Performance Monitoring
Reviewed monthly: lead generation, outreach, reply management, follow-ups, conversions, CRM updates, pipeline, communication quality.` },

{ id:'ch4', chapter:'4 · Tools & Systems', title:'Tools & Systems (with links)', body:
`## Infludata — lead generation & research
Creator discovery, audience analysis, channel research, qualification, sourcing.
🔗 https://app.infludata.com/search

## Google Sheets — lead database & monitoring
Lead storage, assignment, duplicate checking, monitoring, tracking, reporting.
Key sheets: **Lead Database** (Leads) · **Enfinity Clients Database** · **Monitoring** (SALES MONITORING 2026).

## ZeroBounce — email validation
Email verification, bounce prevention, quality control. **Only validated emails go into the database.**
🔗 https://www.zerobounce.net/members/signin

## Close CRM — primary CRM
Lead management, email, tasks, pipeline, inbox, activity logging.
🔗 https://app.close.com/tasks/inbox/

## SmartReach — outreach
Campaign management, automated follow-ups, scheduling, sequencing, performance.
🔗 https://app.smartreach.io/

## Enfinity Dashboard — creator platform
Onboarding, activation, revenue tracking, performance, service management.
🔗 https://app.enfinity.com/
**VVV Dashboard:** https://staff.veryviralvideos.com/ — Login: support@veryviralvideos.com · Password: 🔒 ask an admin

## Tipalti — payments
Payment setup, tax docs, KYC. Dashboard activation + Tipalti are required before onboarding/monetization.
🔗 https://hub.tipalti.com/login/login-user-name — Login: cyril@enfinity.co · Password: 🔒 ask an admin

## Dropbox Sign (HelloSign) — contracts
Send, track & manage creator agreements. Edit requests: escalate to Management → approval → update → upload → send for signature. **Never approve/modify contract terms without management approval.**
🔗 https://app.hellosign.com/ — Username: contracts@enfinity.com · Password: 🔒 ask an admin
Contracts: MCN Partnership · EnfiniShield · EnfiniBoost/Adcelerate · VeryViralVideos Content Distribution.

## SocialBlade — research & performance
Channel growth tracking, monthly view analysis, VVV qualification review.
🔗 https://socialblade.com/

## Gmail — direct communication
Outreach, follow-ups, creator support, internal comms.

## Email Templates
SALES TEMPLATES 2026.

> Keep all tools updated and used per company procedures — accurate records & timely documentation are essential.` },

{ id:'ch5', chapter:'5 · Commission', title:'Commission Structure & Rules', body:
`## Overview
The Sales Commission Program rewards onboarding creators into Enfinity services. A creator is a **completed sale** only once all onboarding steps for the service are finished.

## MCN Commission
- Contract signed (**100% Revenue Share**) + CMS invite accepted — **$100**
- Contract signed (**Revenue Split**) + CMS invite accepted — **$200**
Requires: fully signed contract + CMS invitation accepted + successful onboarding.

## CreatorShield / EnfiniShield
- Individual creator — **$30**
- Agency — **$200**
Complete when: approved internally + dashboard invite sent + dashboard activated + Tipalti/payment completed. *(No Tipalti = pending, no commission.)*

## Adcelerate / EnfiniBoost
- Individual creator — **$50**
- Agency — **$200**
- High Ticket creator — **$200**
Complete only when **all three** are met: Microsoft approval + dashboard activation + Tipalti setup. Rejected by Microsoft, or incomplete activation/Tipalti = not a completed sale.

## Very Viral Videos (VVV)
- Individual creator — **$25 + 10% of first revenue generated**
Complete when: dashboard activated + first upload submitted to VVV. The $25 is eligible once the first upload is submitted; the 10% bonus is paid after the creator generates first revenue. *(Dashboard activation alone is not a completed sale.)*

## General Rules
Commissions are only for completed sales meeting all requirements. Reps must actively monitor & follow up (pending signups, contracts, activations, Tipalti, KYC, CID/MSN reviews, Microsoft decisions, CMS acceptance, VVV activations & first uploads) until completion. **Disputes → escalate to Management.**` },
];
