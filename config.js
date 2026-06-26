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
  closeWebhook:     'https://hook.eu1.make.com/s46mezye3pzk5vyxshdegdn1ze4ojiry', // SAVE leads → Close (batch import)
  closeLoadWebhook: 'https://hook.eu1.make.com/d35hvlju9cgea3mdwcr782ui5vldrkl5',   // LOAD leads ← Close
  scrapeWebhook:    'https://hook.eu1.make.com/amu0xr93i4q214760zi9rqa1lcxlch55', // YouTube scraper gateway
  smartreachWebhook:'https://hook.eu1.make.com/rk8bt363npu9bclbpquev0avr9na6wal', // SEND prospects → SmartReach (name+email)
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
  closeFields: {
    platform:  'cf_3I6WswyUcem4aIkbPuH3K0oJOMeBALyl4PDcKfqoN0i',
    niche:     'cf_NGmsaHgyJvjOncLROmO47XO4KWKyItrKtyb2wvsnIqW',
    followers: 'cf_YcckM323CSeoUI3AsfjTCnhaNfZxOL6f1oQNKBhGii1',
    status:    'cf_jCpSD0TPP9wZ7EvfHkYPploR6owqOmw5bN5qBbrNAFb',
    campaign:  'cf_eXC6A7sn7297LyoHaThBTc6sjLcgqQFFpEJGTxVQMDd',
    rep:       'cf_1oxAKioArRCXyqidp6OsbEEzWdBD8EU82EtzmOM5ZdH',
    assigned:  'cf_mV4TQoYmUEAWJOZyqzCjblulhPPyM3NczEb5TSe9zVt',
  },

  // SmartReach campaigns per rep — [{id,label}] shown in the rep's bulk
  // "Send to SmartReach" campaign picker (only that rep's campaigns appear under
  // her). Real ids pulled from the ENFINITY LIMITED team (tid 28076) on
  // 2026-06-25, grouped from the "REP | CAMPAIGN" naming. "TERMINATED" campaigns
  // and the test campaign are intentionally left out. Re-pull when reps add or
  // rename campaigns (Make RPC smartreach-io:getCampaignList on connection 8529390).
  smartReachCampaigns: {
    Pen:     [{ id: 195653, label: 'PENN | VVV' }, { id: 201846, label: 'Penn New | Boost' }, { id: 203950, label: 'PENN | TERMINATED VVV' }],
    Chase:   [{ id: 196002, label: 'CHASE | VVV' }, { id: 195047, label: 'CHASE | ADCE' }, { id: 203942, label: 'CHASE | TERMINATED VVV' }],
    Mikka:   [{ id: 200573, label: 'MIKKA | VVV' }, { id: 195045, label: 'MIKKA | ADCE' }, { id: 203956, label: 'MIKKA | TERMINATED VVV' }],
    Rein:    [{ id: 195648, label: 'REIN | VVV' }, { id: 194054, label: 'REIN | ADCE' }, { id: 203665, label: 'REIN | MSN HIGH TICKET' }],
    Chai:    [{ id: 206087, label: 'Dashboard import test.' }, { id: 198593, label: 'CHAI | VVV' }, { id: 194062, label: 'CHAI | ADCE' }, { id: 200522, label: 'CHAI | CREATORSHIELD' }, { id: 195643, label: 'CHAI | ENFINISHIELD' }, { id: 203661, label: 'CHAI | MSN HIGH TICKET' }],
    Jon:     [{ id: 203163, label: 'Jonathan | VVV' }, { id: 201174, label: 'Jonathan | CREATORSHIELD' }, { id: 194006, label: 'Jonathan | BOOST' }],
    Czarina: [{ id: 195054, label: 'CZARINA | ADCE & BOOST' }, { id: 195652, label: 'CZARINA | MCN' }],
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
