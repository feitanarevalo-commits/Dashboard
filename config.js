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
var STATUSES = ['Potential', 'Not Qualified', 'Contacted', 'Existing Leads', 'For Recycle', 'Duplicate'];
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
var STATUS_TAGS = ['Potential', 'Not Qualified', 'Contacted', 'Existing Leads', 'For Recycle', 'Duplicate', 'HT'];

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
    'prev-scraped': true, 'lead-mgmt': true, 'google-import': true,
    potential: true, nq: true, contacted: true,
    recycle: true, recent: true, msn: true, vvv: true,
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

  // ── Webhook URLs ── paste your n8n webhook URLs here
  closeWebhook:  'https://app.n8n.cloud/webhook/your-close-import-webhook',
  scrapeWebhook: 'https://app.n8n.cloud/webhook/your-scrape-webhook',

  // ── Campaigns ── add as many as you need
  campaigns: [
    { id: 'MSN', label: 'MSN', color: '#1366D6' },
    { id: 'VVV', label: 'VVV', color: '#6554C0' },
  ],

  // ── Sales Reps ── names and appearance
  salesReps:  ['Pen', 'Rein', 'Chase', 'Mikka'],
  repColors:  { Pen: '#6366F1', Rein: '#10B981', Chase: '#F59E0B', Mikka: '#EC4899' },
  repEmojis:  { Pen: '', Rein: '', Chase: '', Mikka: '' },
  repPhotos:  {},

  // ── USERS & LOGIN ──────────────────────────────────────────
  // role: 'admin'    = full access (open Settings, delete/edit any lead, see all analytics)
  //       'employee' = sees own leads, cannot open Settings or delete leads
  //
  // ⚠ SECURITY NOTE: passwords are stored client-side. This gates casual
  //   access for an internal team, but anyone who views the page source can
  //   read them. It is NOT bank-grade security. Change the defaults below.
  //   Admins are: Robert, Chai, Rein.
  users: [
    { name: 'Robert', role: 'admin',    password: 'enfinity' },
    { name: 'Chai',   role: 'admin',    password: 'enfinity' },
    { name: 'Rein',   role: 'admin',    password: 'enfinity' },
    { name: 'Pen',    role: 'employee', password: 'enfinity' },
    { name: 'Chase',  role: 'employee', password: 'enfinity' },
    { name: 'Mikka',  role: 'employee', password: 'enfinity' },
  ],

  // Tags shown in the Settings drawer "Status Tags" section
  statusTags: ['Potential', 'Not Qualified', 'Contacted', 'Existing Leads', 'For Recycle', 'Duplicate'],
};

// ── SAMPLE / SEED DATA ─────────────────────────────────────
// Add sample leads here if you want the dashboard pre-loaded.
// Each lead must have these fields (all optional except id & channelName).
// Example:
// { id: 1, channelName: 'Test Channel', url: 'https://youtube.com/@test',
//   platform: 'YouTube', niche: 'Finance', followers: '50K',
//   emails: ['test@gmail.com'], tags: [], campaigns: [],
//   assignedTo: null, dateAssigned: null, lastContactDate: null, channels: [] }
var SAMPLE_LEADS   = [];
var SAMPLE_HISTORY = [];
