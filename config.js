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
  scrapeWebhook:    'https://hook.eu1.make.com/amu0xr93i4q214760zi9rqa1lcxlch55', // YouTube scraper gateway
  smartreachWebhook:'https://wokrdfqzwrausazzoedi.supabase.co/functions/v1/smartreach-add', // SEND prospects → SmartReach (Supabase Edge Function; was Make)
  // Replies / interest feed (🔔). Each returns an array of reply objects:
  //   { rep, source:'SmartReach'|'Close', name, email, sentiment, snippet, when, campaign }
  // Wired later (SmartReach reply-webhook → Make store; Close inbound email
  // activity). Leave blank until connected — the panel shows an empty state.
  repliesWebhook:      '', // SmartReach replies/interest
  closeRepliesWebhook: '', // Close.io inbound email replies

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
