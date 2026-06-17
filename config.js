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
// Demo data so every view has something to show. Set back to [] for production.
// Dates are relative to mid-2026 so the Home Daily/Weekly/Monthly/Yearly views differ.
var SAMPLE_LEADS = [
  // ── Fresh discovery queue (untagged → show in Influencer Discovery) ──
  { id: 1001, channelName: 'glowwithava',     url: 'https://instagram.com/glowwithava',  platform: 'Instagram', niche: 'Beauty & Cosmetics', followers: '1.5M', emails: ['ava@glowmail.com'],        tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },
  { id: 1002, channelName: 'pautips',          url: 'https://youtube.com/@pautips',       platform: 'YouTube',   niche: 'Fashion',            followers: '780K', emails: ['pautips@hotmail.com'],       tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },
  { id: 1003, channelName: 'trailmikedaily',   url: 'https://tiktok.com/@trailmikedaily',  platform: 'TikTok',    niche: 'Travel',             followers: '240K', emails: [],                            tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },
  { id: 1004, channelName: 'liftwithleo',      url: 'https://instagram.com/liftwithleo',  platform: 'Instagram', niche: 'Fitness',            followers: '95K',  emails: ['leo@fitmail.com'],          tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },
  { id: 1005, channelName: 'thefinanceguy',    url: 'https://youtube.com/@thefinanceguy', platform: 'YouTube',   niche: 'Finance',            followers: '430K', emails: ['hello@financeguy.io'],       tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },
  { id: 1006, channelName: 'pixelpawsgaming',  url: 'https://tiktok.com/@pixelpawsgaming', platform: 'TikTok',    niche: 'Gaming',             followers: '1.2M', emails: [],                            tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },
  { id: 1007, channelName: 'cocinaconmaria',   url: 'https://instagram.com/cocinaconmaria',platform: 'Instagram', niche: 'Food & Drink',       followers: '58K',  emails: ['maria@cocina.com'],         tags: [], campaigns: [], assignedTo: null,   dateAssigned: null,         lastContactDate: null,         channels: [] },

  // ── Potential (assigned, recent) ──
  { id: 1008, channelName: 'styledbysam',      url: 'https://instagram.com/styledbysam',  platform: 'Instagram', niche: 'Fashion',            followers: '320K', emails: ['sam@styled.co'],            tags: ['Potential'],      campaigns: ['VVV'],        assignedTo: 'Pen',   dateAssigned: '2026-06-17', lastContactDate: null,         channels: [] },
  { id: 1009, channelName: 'wanderwithzoe',    url: 'https://youtube.com/@wanderwithzoe', platform: 'YouTube',   niche: 'Travel',             followers: '610K', emails: ['zoe@wander.tv'],            tags: ['Potential','HT'], campaigns: ['MSN'],        assignedTo: 'Rein',  dateAssigned: '2026-06-16', lastContactDate: null,         channels: [] },
  { id: 1010, channelName: 'gymrattyler',      url: 'https://tiktok.com/@gymrattyler',     platform: 'TikTok',    niche: 'Fitness',            followers: '880K', emails: ['tyler@gymrat.fit'],         tags: ['Potential'],      campaigns: ['VVV'],        assignedTo: 'Chase', dateAssigned: '2026-06-15', lastContactDate: null,         channels: [] },
  { id: 1011, channelName: 'artbyjuno',        url: 'https://instagram.com/artbyjuno',    platform: 'Instagram', niche: 'Art & Design',       followers: '47K',  emails: ['juno@artjuno.com'],         tags: ['Potential'],      campaigns: [],             assignedTo: 'Mikka', dateAssigned: '2026-06-12', lastContactDate: null,         channels: [] },

  // ── Contacted (assigned, has lastContactDate → Imported origin) ──
  { id: 1012, channelName: 'dailydoseofdan',   url: 'https://youtube.com/@dailydoseofdan', platform: 'YouTube',   niche: 'Business & Careers', followers: '210K', emails: ['dan@dose.co'],              tags: ['Contacted'],      campaigns: ['MSN'],        assignedTo: 'Pen',   dateAssigned: '2026-06-08', lastContactDate: '2026-06-10', channels: [] },
  { id: 1013, channelName: 'beautybybella',    url: 'https://instagram.com/beautybybella',platform: 'Instagram', niche: 'Beauty & Cosmetics', followers: '1.1M', emails: ['bella@bbeauty.com'],        tags: ['Contacted','HT'], campaigns: ['VVV'],        assignedTo: 'Rein',  dateAssigned: '2026-06-05', lastContactDate: '2026-06-09', channels: [] },
  { id: 1014, channelName: 'roadtripruby',     url: 'https://tiktok.com/@roadtripruby',    platform: 'TikTok',    niche: 'Travel',             followers: '156K', emails: ['ruby@rtr.travel'],          tags: ['Contacted'],      campaigns: ['MSN'],        assignedTo: 'Chase', dateAssigned: '2026-06-02', lastContactDate: '2026-06-06', channels: [] },
  { id: 1015, channelName: 'techtipstom',      url: 'https://youtube.com/@techtipstom',   platform: 'YouTube',   niche: 'Camera & Photography',followers:'520K', emails: ['tom@techtips.dev'],         tags: ['Contacted'],      campaigns: [],             assignedTo: 'Mikka', dateAssigned: '2026-05-28', lastContactDate: '2026-05-30', channels: [] },

  // ── For Recycle (recycled → counts as Recycled in graph) ──
  { id: 1016, channelName: 'fitfoodiefran',    url: 'https://instagram.com/fitfoodiefran',platform: 'Instagram', niche: 'Food & Drink',       followers: '290K', emails: ['fran@fitfoodie.com'],       tags: ['For Recycle'],    campaigns: ['VVV'],        assignedTo: 'Pen',   dateAssigned: '2026-05-20', lastContactDate: '2026-04-15', channels: [] },
  { id: 1017, channelName: 'vanlifevera',      url: 'https://youtube.com/@vanlifevera',   platform: 'YouTube',   niche: 'Travel',             followers: '74K',  emails: ['vera@vanlife.co'],          tags: ['For Recycle'],    campaigns: ['MSN'],        assignedTo: 'Rein',  dateAssigned: '2026-04-22', lastContactDate: '2026-03-01', channels: [] },
  { id: 1018, channelName: 'makeupmaverick',   url: 'https://tiktok.com/@makeupmaverick',  platform: 'TikTok',    niche: 'Beauty & Cosmetics', followers: '2.1M', emails: ['hi@maverick.beauty'],       tags: ['For Recycle','HT'],campaigns: ['VVV'],       assignedTo: 'Chase', dateAssigned: '2026-03-15', lastContactDate: '2026-02-10', channels: [] },

  // ── Existing Leads / Not Qualified / Duplicate (mixed) ──
  { id: 1019, channelName: 'investingisaac',   url: 'https://youtube.com/@investingisaac', platform: 'YouTube',   niche: 'Finance',            followers: '340K', emails: ['isaac@invest.io'],          tags: ['Existing Leads'], campaigns: ['MSN'],        assignedTo: 'Mikka', dateAssigned: '2026-02-10', lastContactDate: '2026-02-12', channels: [] },
  { id: 1020, channelName: 'crochetcorner',    url: 'https://instagram.com/crochetcorner',platform: 'Instagram', niche: 'Art & Design',       followers: '12K',  emails: [],                            tags: ['Not Qualified'],  campaigns: [],             assignedTo: 'Pen',   dateAssigned: '2025-12-01', lastContactDate: null,         channels: [] },
  { id: 1021, channelName: 'petsofpaige',      url: 'https://tiktok.com/@petsofpaige',     platform: 'TikTok',    niche: 'Food & Drink',       followers: '8K',   emails: ['paige@pets.com'],           tags: ['Not Qualified'],  campaigns: [],             assignedTo: 'Rein',  dateAssigned: '2025-09-10', lastContactDate: null,         channels: [] },
  { id: 1022, channelName: 'duplicatedave',    url: 'https://youtube.com/@duplicatedave',  platform: 'YouTube',   niche: 'Gaming',             followers: '60K',  emails: ['dave@dup.com'],             tags: ['Duplicate'],      campaigns: [],             assignedTo: null,    dateAssigned: null,         lastContactDate: null,         channels: [] },
];
var SAMPLE_HISTORY = [
  { id: 9001, icon: '📊', text: 'Google Sheets import: 22 leads added',        time: '2026-06-17 09:14:02', restorable: false },
  { id: 9002, icon: '✅', text: 'Bulk: 4 leads → Pen',                          time: '2026-06-17 09:20:41', restorable: true  },
  { id: 9003, icon: '✏️', text: 'Lead "beautybybella" updated',                 time: '2026-06-09 14:02:11', restorable: true  },
  { id: 9004, icon: '♻️', text: 'Auto-recycled 1 lead(s): makeupmaverick',      time: '2026-05-12 06:00:00', restorable: false },
];
