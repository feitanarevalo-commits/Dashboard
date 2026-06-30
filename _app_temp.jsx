const { useState, useEffect, useCallback, useRef } = React;
// All constants (PLATFORMS, STATUSES, STATUS_TAGS, TAG_COLORS,
// DEFAULT_CONFIG, SAMPLE_LEADS, SAMPLE_HISTORY) come from config.js

// ─── UTILS ────────────────────────────────────────────────
function getRowClass(lead) {
  const c = lead.campaigns;
  if(c.includes('MSN') && c.includes('VVV')) return 'row-both';
  if(c.includes('MSN')) return 'row-msn';
  if(c.includes('VVV')) return 'row-vvv';
  return '';
}
function avatarLetter(name){ return name ? name[0].toUpperCase() : '?'; }
function hasStatusTag(lead){ return STATUS_TAGS.some(t=>lead.tags.includes(t)); }
// The taggable statuses shown on every lead picker. Driven by the admin-editable
// config.statusTags (so "+ Add tag" in Customize actually adds a usable tag),
// with HT always available. Falls back to the built-in STATUSES.
function statusOptions(config){
  const base=(config&&Array.isArray(config.statusTags)&&config.statusTags.length)?config.statusTags:STATUSES;
  return [...new Set([...base,'HT'])];
}
// Normalize a raw status/tag string from a sheet into a canonical STATUS_TAGS
// value, so tag-based routing (Potential → rep, Contacted → Contacted tab, …)
// works no matter how the sheet spells or cases it. Unknown tags pass through.
function canonTag(raw){
  const s=String(raw||'').trim();
  if(!s) return '';
  const k=s.toLowerCase().replace(/[^a-z]/g,'');
  const MAP={
    potential:'Potential', potentials:'Potential', potentiallead:'Potential', potentialleads:'Potential',
    contacted:'Contacted', contact:'Contacted', contacting:'Contacted',
    notqualified:'Not Qualified', nq:'Not Qualified', unqualified:'Not Qualified', disqualified:'Not Qualified',
    existingleads:'Existing Leads', existinglead:'Existing Leads', existing:'Existing Leads',
    forrecycle:'For Recycle', recycle:'For Recycle', recycled:'For Recycle', recycling:'For Recycle',
    duplicate:'Duplicate', duplicates:'Duplicate', dupe:'Duplicate', dup:'Duplicate',
    ht:'HT', hot:'HT', hotlead:'HT', hottlead:'HT',
  };
  return MAP[k] || s;
}

// ─── LEAD ORIGIN: Fresh vs Imported (re: Close.io) ─────────
// Fresh   = NOT yet on Close — still needs to be imported. The import queue.
// Imported= already on Close: it was pushed via "Send to Close" (importedToClose),
//           pulled back from Close (fromClose), or carries a Close lead id.
// "Send to Close" only sends Fresh leads and flips them to Imported on success,
// so the same lead is never pushed (and duplicated in Close) twice.
function leadOrigin(lead){
  // Explicit flag (e.g. a sheet's IMPORTED Yes/No column) always wins.
  if(lead.imported === true) return 'Imported';
  if(lead.imported === false) return 'Fresh';
  if(lead.importedToClose || lead.fromClose || lead.closeLeadId) return 'Imported';
  return 'Fresh';
}
// Convenience: a Fresh lead is one not yet on Close.
function isFresh(lead){ return leadOrigin(lead)==='Fresh'; }
function isRecycled(lead){
  return (lead.tags||[]).includes('For Recycle') || lead.recycled === true;
}
// Parse "1.5M" / "23K" / "12000" → a number for range filtering.
function parseFollowers(v){
  if(v==null) return 0;
  const s=String(v).trim().toUpperCase();
  const n=parseFloat(s.replace(/[^0-9.]/g,''))||0;
  if(s.includes('M')) return n*1e6;
  if(s.includes('K')) return n*1e3;
  return n;
}
function fmtFollowers(n){
  if(n>=1e6) return (n/1e6).toFixed(n%1e6?1:0)+'M';
  if(n>=1e3) return (n/1e3).toFixed(n%1e3?1:0)+'K';
  return String(n);
}
// Deterministic pseudo stat so placeholder ER/Growth look stable per lead
// (clearly cosmetic until real audience data is wired in).
function pseudoStat(seed, lo, hi){
  let h=0; const s=String(seed||'x');
  for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; }
  return (lo + (h%1000)/1000*(hi-lo));
}

// Pull email addresses out of free text (a YouTube channel's description /
// "for business inquiries: x@gmail.com"). The Data API doesn't expose the gated
// business email, so this catches the ones creators list publicly.
function extractEmails(text){
  if(!text) return [];
  const m=String(text).match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)||[];
  return [...new Set(m.map(e=>e.replace(/[.,;:>)\]]+$/,'').toLowerCase()))]
    .filter(e=>!/\.(png|jpg|jpeg|gif|webp)$/.test(e));
}
// Map a raw result from the Make/Apify scraper into a dashboard lead.
// Tolerant of field-name variations across Apify actors/platforms.
function mapDiscoveryResult(item, fallbackPlatform, i){
  item = item || {};
  const get=(...keys)=>{ for(const k of keys){ const v=item[k]; if(v!=null && v!=='') return v; } return ''; };
  // Support raw YouTube Data API search items (nested snippet / id objects).
  const sn = item.snippet || {};
  const idObj = (item.id && typeof item.id === 'object') ? item.id : {};
  const idStr = (typeof item.id === 'string') ? item.id : '';  // channels.list: id is the channel id
  const ytChannelId = sn.channelId || idObj.channelId || idStr || '';
  const ytThumb = (sn.thumbnails && (sn.thumbnails.high||sn.thumbnails.medium||sn.thumbnails.default)||{}).url || '';
  const name=get('channel_name','channelName','username','handle','ownerUsername','name','fullName') || sn.channelTitle || sn.title;
  let url=get('url','channel_url','channelUrl','profile_url','profileUrl','webUrl','link','video_url','videoUrl','inputUrl');
  if(!url){
    if(ytChannelId) url='https://www.youtube.com/channel/'+ytChannelId;
    else if(idObj.videoId) url='https://www.youtube.com/watch?v='+idObj.videoId;
  }
  // Subscriber/follower count — incl. YouTube channels.list statistics (nested).
  const stats=item.statistics||{};
  const followersRaw=get('followersCount','followers','subscriberCount','subscribers','subscribers_count','fansCount','fans') || stats.subscriberCount || '';
  const followers = followersRaw==='' ? '' :
    ((typeof followersRaw==='number' || /^\d+$/.test(String(followersRaw))) ? fmtFollowers(Number(followersRaw)) : String(followersRaw));
  const niche=get('niche','category','businessCategoryName','categoryName');
  // Email: explicit field first, then scraped from the channel description.
  const explicitEmail=get('email','publicEmail','businessEmail');
  const descText=[sn.description, item.description,
    (item.brandingSettings&&item.brandingSettings.channel&&item.brandingSettings.channel.description)].filter(Boolean).join('  ');
  const emails=[...new Set([...(explicitEmail?[String(explicitEmail).toLowerCase()]:[]), ...extractEmails(descText)])];
  const thumb=get('thumbnail','thumbnailUrl','avatar','profilePic','profilePicUrl','profilePicUrlHD','displayUrl','image','picture','imageUrl') || ytThumb;
  const channelId=get('channel_id','channelId','channelID','ownerId','authorId','userId','user_id') || ytChannelId;
  // Determine platform: explicit field → infer from URL → searched tab → fallback.
  let platform=item.platform || fallbackPlatform || '';
  if(!platform || platform==='All'){
    const u=String(url).toLowerCase();
    platform = (u.includes('youtube')||u.includes('youtu.be')) ? 'YouTube'
             : u.includes('tiktok') ? 'TikTok'
             : u.includes('instagram') ? 'Instagram'
             : (fallbackPlatform || 'YouTube');
  }
  return {
    id: Date.now()+Math.floor(Math.random()*1e6)+i,
    channelName: String(name||('influencer_'+(i+1))),
    url: String(url||''),
    platform: platform,
    niche: String(niche||''),
    followers: followers,
    emails: emails,
    thumbnail: thumb ? String(thumb) : '',
    channelId: channelId ? String(channelId) : '',
    addedAt: new Date().toISOString(),
    tags: [], campaigns: [], assignedTo: null, dateAssigned: null, lastContactDate: null, channels: [],
  };
}
// Stable identity key for de-duplicating leads: channel ID > URL > name.
function leadKey(l){
  return String(l.channelId || l.url || l.channelName || '').trim().toLowerCase();
}
// Parse the pipe-delimited Close description we write on push back into fields,
// e.g. "URL: x | Platform: YouTube | Niche: Fit | Followers: 90K | Status: Potential
// | Campaign: MSN | Rep: Pen | Assigned: 2026-06-23". Skips empty/null values.
function parseCloseDescription(desc){
  const out={};
  if(typeof desc!=='string' || !desc) return out;
  desc.split('|').forEach(part=>{
    const idx=part.indexOf(':'); if(idx<0) return;
    const k=part.slice(0,idx).trim().toLowerCase();
    const v=part.slice(idx+1).trim();
    if(!v || v.toLowerCase()==='null' || v.toLowerCase()==='undefined') return;
    if(['url','platform','niche','followers','status','campaign','rep','assigned'].includes(k)) out[k]=v;
  });
  return out;
}

// ─── PERMISSIONS ──────────────────────────────────────────
function userRole(name, config){
  const u = (config.users||[]).find(x=>x.name===name);
  return u ? u.role : 'employee';
}
function isAdminUser(user){ return user && user.role === 'admin'; }

// Effective password = per-browser override (if the user changed it) else the
// default from config.js. Overrides live in localStorage, so they are
// per-device only — there is no backend to sync them across browsers.
function pwKey(name){ return 'enfinity_pw_'+name; }
function effectivePassword(user){
  try{ const o=localStorage.getItem(pwKey(user.name)); if(o!=null) return o; }catch(e){}
  return user.password;
}

// CSV-safe cell: quote + escape only when the value contains a comma, quote,
// or newline. Keeps numbers/plain text unquoted so spreadsheets parse cleanly.
function csvCell(v){
  const s=v==null?'':String(v);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function csvRow(arr){ return arr.map(csvCell).join(','); }
function downloadFile(text, filename, type='text/csv;charset=utf-8'){
  const blob = new Blob([text],{type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function pct(n,d){ return d ? Math.round(n/d*1000)/10 : 0; }      // one-decimal %
function daysSince(dateStr){
  if(!dateStr) return '';
  const d=new Date(dateStr); if(isNaN(d)) return '';
  return Math.max(0,Math.round((Date.now()-d.getTime())/864e5));
}

// When a lead first entered the dashboard (scraped or imported), as epoch ms.
// Prefers the explicit `addedAt` ISO stamp, then falls back to `dateAssigned`,
// then to the numeric `id` (ids are Date.now()-based), so even leads created
// before this field existed still sort roughly right. Returns 0 if unknown.
function leadAddedMs(l){
  if(l && l.addedAt){ const t=new Date(l.addedAt).getTime(); if(!isNaN(t)) return t; }
  if(l && l.dateAssigned){ const t=new Date(l.dateAssigned).getTime(); if(!isNaN(t)) return t; }
  const n=l?Number(l.id):NaN;
  if(!isNaN(n) && n>1e12 && n<2e13) return n;   // id looks like a ms timestamp
  return 0;
}
// Human-readable "added" timestamp for a lead, or '—' when unknown.
function fmtAddedAt(l){
  const ms=leadAddedMs(l); if(!ms) return '—';
  return new Date(ms).toLocaleString('en-CA',
    {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',','');
}
// Local YYYY-MM-DD for a date/ms (uses local calendar day, not UTC).
function ymdLocal(d){
  const x=new Date(d); if(isNaN(x)) return '';
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}
// The calendar day a lead belongs to for daily tracking: the day it was
// assigned to the rep (a plain YYYY-MM-DD string, used as-is), else the day it
// was added/scraped. Returns '' if neither is known.
function leadDayStr(l){
  if(l && l.dateAssigned){
    const s=String(l.dateAssigned);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);   // already a date string — no TZ shift
    const d=new Date(s); if(!isNaN(d)) return ymdLocal(d);
  }
  const ms=leadAddedMs(l); return ms?ymdLocal(ms):'';
}

// Per-lead export — one row per lead with the full detail set (raw + derived
// fields) so the download is useful for offline analysis, not just a name list.
function exportCSV(leads, filename='leads.csv') {
  const cols = ['Channel','Platform','Niche','URL','Followers','Followers (#)',
    'Email(s)','# Emails','Status Tags','Origin','Recycled','Campaign(s)',
    'Assigned To','Added','Date Assigned','Last Contact','Days Since Assigned','# Channels'];
  const rows = [csvRow(cols), ...leads.map(l => csvRow([
    l.channelName, l.platform, l.niche, l.url,
    l.followers, parseFollowers(l.followers)||'',
    (l.emails||[]).join('; '), (l.emails||[]).length,
    (l.tags||[]).join('; '), leadOrigin(l), isRecycled(l)?'Yes':'No',
    (l.campaigns||[]).join(', '), l.assignedTo||'',
    fmtAddedAt(l), l.dateAssigned||'', l.lastContactDate||'', daysSince(l.dateAssigned),
    (l.channels||[]).length
  ]))].join('\n');
  downloadFile(rows, filename);
}

// Close.io-ready export — one row per lead with the columns Close's lead
// importer recognises (Company / Contact Name / Contact Email + useful custom
// fields). The rep downloads this and imports it in her own Close account; it's
// the same data the automated Make push sends.
function exportCloseCSV(leads, filename='close_import.csv') {
  const cols = ['Company','Contact Name','Contact Email','URL','Platform','Niche',
    'Followers','Status','Campaign','Assigned Rep','Date Assigned'];
  const rows = [csvRow(cols), ...leads.map(l => csvRow([
    l.channelName, l.channelName, (l.emails||[])[0]||'',
    l.url, l.platform, l.niche, l.followers,
    (l.tags||[]).join('; '), (l.campaigns||[]).join(', '),
    l.assignedTo||'', l.dateAssigned||''
  ]))].join('\n');
  downloadFile(rows, filename);
}

// One lead in the shape the Make "Close batch import" scenario iterates over:
// flat fields for the Close contact + leadJson (full object) for round-tripping.
function toCloseLeadItem(l){
  // Make builds Close's JSON body by raw string-substitution, so:
  //  - j()  : JSON-escaped string for QUOTED body slots ("name":"{{name}}").
  //           A " or \ in a channel name would otherwise break the body (400).
  //  - lit(): a JSON LITERAL ("value" or null) for UNQUOTED custom-field slots
  //           ("custom.cf":{{x}}). Close rejects empty-string custom fields, so
  //           empty values must become null, not "".
  const j=s=>JSON.stringify(String(s==null?'':s)).slice(1,-1);
  const lit=v=>{ const s=String(v==null?'':v).trim(); return s?JSON.stringify(s):'null'; };
  const email0=(l.emails||[])[0]||'';
  // contacts as a JSON-array literal — Close rejects a contact with an empty
  // email, so leads with no email get an empty array (no contact) instead.
  const contacts=email0
    ? JSON.stringify([{name:String(l.channelName||''),emails:[{email:email0,type:'office'}]}])
    : '[]';
  return {
    name:j(l.channelName), email:j(email0), emails:l.emails||[], contacts,
    url:j(l.url), closeLeadId:l.closeLeadId||null, leadJson:JSON.stringify(l),
    platform:lit(l.platform), niche:lit(l.niche), followers:lit(l.followers),
    status:lit((l.tags||[]).join(', ')), campaign:lit((l.campaigns||[]).join(', ')),
    assignedTo:lit(l.assignedTo), dateAssigned:lit(l.dateAssigned)
  };
}

// SmartReach is an email-outreach tool, so its export carries ONLY the channel
// name + email (one prospect per lead's primary email; leads without an email
// are skipped since they can't be emailed).
function exportSmartReachCSV(leads, filename='smartreach.csv') {
  // SmartReach's CSV importer expects lowercase headers `email,first_name`
  // (email first). first_name carries the channel/contact name as shown.
  const cols = ['email','first_name'];
  const rows = [csvRow(cols), ...leads
    .filter(l=>(l.emails||[]).length>0)
    .map(l => csvRow([(l.emails||[])[0]||'', l.channelName]))
  ].join('\n');
  downloadFile(rows, filename);
}
// One prospect for the Make "SmartReach add" scenario — name + email only.
// One prospect for the Make "SmartReach add" scenario. campaign_id is the
// SmartReach campaign the rep picked in the bulk send — Make creates the
// prospect then assigns it to that campaign (not just the global Prospects list).
function toSmartReachItem(l, campaignId){
  return { name:l.channelName, email:(l.emails||[])[0]||'', campaign_id: campaignId?String(campaignId):'' };
}

// Comprehensive Sales KPI report (one row per rep + a totals row). Includes
// raw counts, derived conversion rates, email coverage, average audience size,
// and per-campaign / per-platform splits, under a titled header block.
function exportKpiCSV(repRows, info, filename='enfinity_sales_kpis.csv') {
  info = info || {};
  const camps = info.campaigns || [];          // [{id,label}]
  const plats = info.platforms || [];           // ['YouTube',...]
  const fmtRow = r => {
    return csvRow([
      r.rep, r.total, r.fresh, r.recycled, r.potential, r.contacted, r.ht,
      pct(r.contacted,r.total), pct(r.potential,r.total),
      r.withEmail, pct(r.withEmail,r.total), r.avgFoll||0,
      ...camps.map(c=>(r.byCampaign&&r.byCampaign[c.id])||0),
      ...plats.map(p=>(r.byPlatform&&r.byPlatform[p])||0),
    ]);
  };
  // Totals row: sum counts, recompute rates/averages on the aggregate.
  const sum = k => repRows.reduce((s,r)=>s+(r[k]||0),0);
  const tFoll = repRows.reduce((s,r)=>s+((r.avgFoll||0)*(r.follKnown||0)),0);
  const tFollKnown = sum('follKnown');
  const totals = {
    rep:'All Reps', total:sum('total'), fresh:sum('fresh'), recycled:sum('recycled'),
    potential:sum('potential'), contacted:sum('contacted'), ht:sum('ht'),
    withEmail:sum('withEmail'), avgFoll: tFollKnown?Math.round(tFoll/tFollKnown):0,
    byCampaign:Object.fromEntries(camps.map(c=>[c.id,repRows.reduce((s,r)=>s+((r.byCampaign&&r.byCampaign[c.id])||0),0)])),
    byPlatform:Object.fromEntries(plats.map(p=>[p,repRows.reduce((s,r)=>s+((r.byPlatform&&r.byPlatform[p])||0),0)])),
  };
  const cols = ['Sales Rep','Total Assigned','Fresh','Recycled','Potential','Contacted','High Ticket',
    'Contact Rate %','Potential Rate %','With Email','Email Coverage %','Avg Followers',
    ...camps.map(c=>`Campaign: ${c.label}`), ...plats.map(p=>`Platform: ${p}`)];
  // Per-rep × campaign section: one row per (rep, campaign) + All Reps totals.
  const campRow = (repLabel,c,s)=>csvRow([repLabel, c.label, s.total, s.potential,
    pct(s.potential,s.total), s.contacted, pct(s.contacted,s.total), s.ht]);
  const campSection = [];
  if(camps.length){
    campSection.push('', 'Per-Rep x Campaign Breakdown',
      csvRow(['Sales Rep','Campaign','Total','Potential','Pot %','Contacted','Contact %','High Ticket']));
    const blank = {total:0,potential:0,contacted:0,ht:0};
    repRows.forEach(r=>camps.forEach(c=>campSection.push(campRow(r.rep,c,(r.campaignStats&&r.campaignStats[c.id])||blank))));
    camps.forEach(c=>{
      const s=repRows.reduce((a,r)=>{const x=(r.campaignStats&&r.campaignStats[c.id])||{};a.total+=x.total||0;a.potential+=x.potential||0;a.contacted+=x.contacted||0;a.ht+=x.ht||0;return a;},{total:0,potential:0,contacted:0,ht:0});
      campSection.push(campRow('All Reps',c,s));
    });
  }
  const lines = [
    'Enfinity Sales Dashboard — Sales KPI Report',
    `Period:,${info.period||''}`,
    `Date range:,${info.rangeStart||''} to ${info.rangeEnd||''}`,
    `Generated:,${new Date().toISOString().replace('T',' ').slice(0,16)}`,
    '',
    csvRow(cols),
    ...repRows.map(fmtRow),
    fmtRow(totals),
    ...campSection,
  ];
  downloadFile(lines.join('\n'), filename);
}

function exportPDF(repName) {
  const style = document.createElement('style');
  style.id = 'print-style';
  style.textContent = `@media print { .no-print,.sidebar,.topbar,.toolbar,.main-header,.drawer,.drawer-overlay,.toasts { display: none !important; } .print-header { display: block !important; } body { font-size: 11pt; } }`;
  document.head.appendChild(style);
  document.querySelector('.print-header') && (document.querySelector('.print-header').style.display='block');
  window.print();
  setTimeout(() => { const s = document.getElementById('print-style'); s && s.remove(); }, 500);
}

// ─── TOAST ────────────────────────────────────────────────
function Toast({toasts}) {
  const icons = {success:'✅',error:'❌',info:'ℹ️'};
  return <div className="toasts">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}><span>{icons[t.type]}</span>{t.msg}</div>)}</div>;
}

// ─── TAG BADGE ────────────────────────────────────────────
const TAG_COLORS={
  'Potential':{bg:'#E3FCF2',color:'#00875A'},
  'Not Qualified':{bg:'#FFEBE6',color:'#DE350B'},
  'Contacted':{bg:'#EBF2FF',color:'#1366D6'},
  'For Recycle':{bg:'#FFF4E5',color:'#FF8B00'},
  'Existing Leads':{bg:'#EAE6FF',color:'#6554C0'},
  'Duplicate':{bg:'#F0F2F5',color:'#68737D'},
  'HT':{bg:'#FFF4E5',color:'#FF8B00'},
};

function TagBadge({tag}) {
  if(tag==='HT') return <span className="tag tag-ht">⚡ HT</span>;
  return <span className={`tag ${STATUS_CLS[tag]||'tag-duplicate'}`}>{tag}</span>;
}

// ─── TOGGLE ───────────────────────────────────────────────
function Toggle({checked,onChange}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  );
}

// Build the editable per-URL links list for a lead: each entry is
// {url, campaigns}. Prefers an existing structured `lead.links`; otherwise
// derives one from url + channels, attaching the lead's campaigns to the
// primary URL. Reconciles any lead.campaigns not yet mapped to a URL.
function buildLeadLinks(lead){
  if(Array.isArray(lead.links) && lead.links.length){
    const links=lead.links.map(l=>({url:l.url||'',campaigns:[...(l.campaigns||[])]}));
    const known=new Set(links.flatMap(l=>l.campaigns));
    const extras=(lead.campaigns||[]).filter(c=>!known.has(c));
    if(extras.length && links[0]) links[0].campaigns=[...new Set([...links[0].campaigns,...extras])];
    return links;
  }
  const urls=[lead.url||'', ...((lead.channels)||[]).filter(Boolean)];
  return urls.map((u,i)=>({url:u, campaigns:i===0?[...(lead.campaigns||[])]:[]}));
}

// ─── LEAD MODAL ───────────────────────────────────────────
function LeadModal({lead,onClose,onSave,onDelete,config}) {
  const [form,setForm] = useState({
    ...lead,
    emails:[...(lead.emails||[])],
    tags: Array.isArray(lead.tags) ? [...lead.tags] : [],
    links: buildLeadLinks(lead),
  });
  const [newEmail,setNewEmail] = useState('');
  const [newUrl,setNewUrl] = useState('');
  const [confirmDel,setConfirmDel] = useState(false);
  function upd(k,v){setForm(f=>({...f,[k]:v}));}
  function addEmail(){if(newEmail&&!form.emails.includes(newEmail)){setForm(f=>({...f,emails:[...f.emails,newEmail]}));setNewEmail('');}}
  function delEmail(e){setForm(f=>({...f,emails:f.emails.filter(x=>x!==e)}));}
  function addLink(){const u=newUrl.trim();if(u){setForm(f=>({...f,links:[...(f.links||[]),{url:u,campaigns:[]}]}));setNewUrl('');}}
  function delLink(i){setForm(f=>({...f,links:(f.links||[]).filter((_,j)=>j!==i)}));}
  function updLink(i,patch){setForm(f=>{const links=[...(f.links||[])];links[i]={...links[i],...patch};return{...f,links};});}
  function toggleLinkCampaign(i,campId){setForm(f=>{const links=[...(f.links||[])];const cur=links[i].campaigns||[];links[i]={...links[i],campaigns:cur.includes(campId)?cur.filter(x=>x!==campId):[...cur,campId]};return{...f,links};});}
  // Derive url / channels / campaigns from the per-URL links, then save.
  function saveLead(){
    const links=(form.links||[]).map(l=>({url:(l.url||'').trim(),campaigns:[...(l.campaigns||[])]}));
    const primary=links[0]||{url:'',campaigns:[]};
    const extra=links.slice(1).filter(l=>l.url);
    const ordered=[primary,...extra];
    const campaigns=[...new Set(ordered.flatMap(l=>l.campaigns))];
    onSave({...form, links:ordered, url:primary.url, channels:extra.map(l=>l.url), campaigns});
    onClose();
  }
  function toggleTag(t){
    const tags=form.tags||[];
    upd('tags', tags.includes(t) ? tags.filter(x=>x!==t) : [...tags,t]);
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Edit Lead</h2>
            <p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>{lead.channelName}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <div className="form-group"><label className="form-label">Channel Name</label><input value={form.channelName} onChange={e=>upd('channelName',e.target.value)}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="form-group"><label className="form-label">Platform</label><select value={form.platform} onChange={e=>upd('platform',e.target.value)} style={{width:'100%'}}>{PLATFORMS.map(p=><option key={p}>{p}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Niche</label><input value={form.niche} onChange={e=>upd('niche',e.target.value)}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="form-group"><label className="form-label">Followers / Subscribers</label><input value={form.followers} onChange={e=>upd('followers',e.target.value)}/></div>
        </div>
        <div className="form-group">
          <label className="form-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            Channel URLs
            <span style={{fontSize:10,fontWeight:400,color:'var(--text-light)',textTransform:'none',letterSpacing:0}}>First URL = primary · tag each URL with the campaign it qualifies for</span>
          </label>
          <div className="email-rows">
            {(form.links||[]).map((lnk,i)=>(
              <div key={i} style={{display:'flex',flexDirection:'column',gap:6,padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,marginBottom:6,background:'var(--bg)'}}>
                <div className="email-row" style={{margin:0}}>
                  <input value={lnk.url} onChange={e=>updLink(i,{url:e.target.value})} placeholder={i===0?'Primary channel URL (e.g. youtube.com/@handle)':'Additional channel URL...'} style={{flex:1}}/>
                  {i===0
                    ? <span style={{fontSize:10,color:'var(--text-light)',padding:'0 6px',whiteSpace:'nowrap'}}>primary</span>
                    : <button className="btn btn-danger btn-xs" onClick={()=>delLink(i)}>✕</button>}
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:10,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'.3px',fontWeight:600}}>Campaign</span>
                  {(config.campaigns||[]).map(c=>{
                    const on=(lnk.campaigns||[]).includes(c.id);
                    return <button key={c.id} type="button" onClick={()=>toggleLinkCampaign(i,c.id)}
                      style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,cursor:'pointer',border:`1px solid ${on?c.color:'var(--border)'}`,background:on?c.color+'22':'transparent',color:on?c.color:'var(--text-dim)'}}>
                      {on?'● ':'○ '}{c.label}</button>;
                  })}
                  {(config.campaigns||[]).length===0 && <span style={{fontSize:11,color:'var(--text-light)'}}>No campaigns configured</span>}
                </div>
              </div>
            ))}
            <div className="email-row">
              <input placeholder="Add another channel URL..." value={newUrl} onChange={e=>setNewUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addLink()}/>
              <button className="btn btn-outline btn-xs" onClick={addLink}>+ Add URL</button>
            </div>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Emails</label>
          <div className="email-rows">
            {form.emails.map((em,i)=>(
              <div className="email-row" key={i}>
                <input value={em} onChange={e=>{const arr=[...form.emails];arr[i]=e.target.value;upd('emails',arr);}}/>
                <button className="btn btn-danger btn-xs" onClick={()=>delEmail(em)}>✕</button>
              </div>
            ))}
            <div className="email-row">
              <input placeholder="Add email address..." value={newEmail} onChange={e=>setNewEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addEmail()}/>
              <button className="btn btn-outline btn-xs" onClick={addEmail}>+ Add</button>
            </div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="form-group">
            <label className="form-label">Assign to Rep</label>
            <select value={form.assignedTo||''} onChange={e=>{upd('assignedTo',e.target.value||null);if(e.target.value&&!form.dateAssigned)upd('dateAssigned',new Date().toISOString().split('T')[0]);}} style={{width:'100%'}}>
              <option value="">— Unassigned —</option>
              {(config.salesReps||[]).map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date Assigned</label>
            <input type="date" value={form.dateAssigned||''} onChange={e=>upd('dateAssigned',e.target.value)}/>
          </div>
        </div>
        <div className="modal-footer">
          <div>
            {!confirmDel
              ? <button className="btn btn-danger btn-sm" onClick={()=>setConfirmDel(true)}>🗑 Delete Lead</button>
              : <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:'var(--danger)',fontWeight:600}}>Confirm delete?</span>
                  <button className="btn btn-danger btn-sm" onClick={()=>{onDelete(lead.id);onClose();}}>Yes, Delete</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setConfirmDel(false)}>Cancel</button>
                </div>
            }
          </div>
          <div className="modal-footer-right">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={saveLead}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONTEXT MENU ────────────────────────────────────────
function ContextMenu({x,y,lead,sel,allLeads,config,campColorMap,onEdit,onDelete,onOpenEdit,onClose}) {
  const isBulk=sel&&sel.length>1&&sel.includes(lead.id);
  const [live,setLive]=useState({...lead});
  const ref=React.useRef(null);
  useEffect(()=>{
    function outside(e){if(ref.current&&!ref.current.contains(e.target))onClose();}
    function esc(e){if(e.key==='Escape')onClose();}
    document.addEventListener('mousedown',outside);
    document.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',esc);};
  },[]);
  const pos={top:y,left:x};
  useEffect(()=>{
    const el=ref.current; if(!el) return;
    const m=8, vw=window.innerWidth, vh=window.innerHeight;
    const w=el.offsetWidth, fullH=el.scrollHeight;
    // Clamp horizontally, choose a top that keeps the menu on-screen, then cap
    // its height to the space below that top so it scrolls instead of overflowing.
    let left=x, top=y;
    if(left + w > vw - m) left = Math.max(m, vw - w - m);
    const h = Math.min(fullH, vh - 2*m);
    if(top + h > vh - m) top = Math.max(m, vh - h - m);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.maxHeight = (vh - top - m) + 'px';
  },[]);
  function applyToTargets(patch){
    if(isBulk){
      (allLeads||[]).filter(l=>sel.includes(l.id)).forEach(l=>{
        let u={...l};
        if(patch.tags!==undefined) u.tags=patch.tags(l.tags);
        if(patch.campaigns!==undefined) u.campaigns=patch.campaigns(l.campaigns);
        if(patch.assignedTo!==undefined){u.assignedTo=patch.assignedTo;u.dateAssigned=new Date().toISOString().split('T')[0];}
        onEdit(u);
      });
    }
  }
  function toggleTag(t){
    // Single-select: choosing a tag replaces any existing one (toggles off if same).
    const nextTags=tags=>tags.includes(t)?[]:[t];
    if(isBulk){applyToTargets({tags:nextTags});}
    const u={...live,tags:nextTags(live.tags)};setLive(u);onEdit(u);
  }
  function toggleCamp(c){
    const nextCamps=camps=>camps.includes(c)?camps.filter(x=>x!==c):[...camps,c];
    if(isBulk){applyToTargets({campaigns:nextCamps});}
    const u={...live,campaigns:nextCamps(live.campaigns)};setLive(u);onEdit(u);
  }
  function assignRep(r){
    if(isBulk){applyToTargets({assignedTo:r});}
    const u={...live,assignedTo:r,dateAssigned:new Date().toISOString().split('T')[0]};
    setLive(u);onEdit(u);onClose();
  }
  function openAll(){
    const targets = isBulk ? (allLeads||[]).filter(l=>sel.includes(l.id)) : [live];
    const urls = targets.map(l=>l.url).filter(Boolean);
    urls.forEach(u=>{
      const a=document.createElement('a');
      a.href=u; a.target='_blank'; a.rel='noopener noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
    });
    onClose();
  }
  const openCount = isBulk ? (allLeads||[]).filter(l=>sel.includes(l.id) && l.url).length : (live.url?1:0);
  return(
    <div className="ctx-menu" ref={ref} style={{top:y,left:x}}>
      {isBulk&&<div style={{background:'var(--accent)',color:'white',fontSize:11,fontWeight:700,padding:'6px 14px',textAlign:'center'}}>
        Applying to {sel.length} selected leads
      </div>}
      {!isBulk&&<div className="ctx-item" onClick={()=>{onOpenEdit(live);onClose();}}>
        <span>✏</span> Edit Lead
      </div>}
      {openCount>0&&<div className="ctx-item" onClick={openAll}>
        <span>🔗</span> {isBulk?`Open ${openCount} profile${openCount!==1?'s':''} in new tabs`:'Open profile in new tab'}
      </div>}
      <div className="ctx-sep"/>
      <div className="ctx-section-label">Tags</div>
      {statusOptions(config).map(t=>{
        const on=live.tags.includes(t);
        const c=TAG_COLORS[t]||{bg:'#F0F2F5',color:'#68737D'};
        return(
          <div key={t} className="ctx-item" onClick={()=>toggleTag(t)}>
            <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${on?c.color:'var(--border)'}`,background:on?c.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {on&&<span style={{color:'white',fontSize:8,lineHeight:1}}>✓</span>}
            </div>
            <span style={on?{color:c.color,fontWeight:600}:{}}>{t==='HT'?'⚡ HT':t}</span>
          </div>
        );
      })}
      <div className="ctx-sep"/>
      <div className="ctx-section-label">Campaign</div>
      {(config.campaigns||[]).map(camp=>{
        const on=live.campaigns.includes(camp.id);
        return(
          <div key={camp.id} className="ctx-item" onClick={()=>toggleCamp(camp.id)}>
            <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${on?camp.color:'var(--border)'}`,background:on?camp.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              {on&&<span style={{color:'white',fontSize:8,lineHeight:1}}>✓</span>}
            </div>
            <span style={{color:camp.color,fontWeight:600}}>● {camp.label}</span>
          </div>
        );
      })}
      <div className="ctx-sep"/>
      <div className="ctx-section-label">Assign to Rep</div>
      {(config.salesReps||[]).map(r=>{
        const on=live.assignedTo===r;
        return(
          <div key={r} className="ctx-item" onClick={()=>assignRep(r)}>
            <div style={{width:20,height:20,borderRadius:'50%',background:on?'var(--accent)':'var(--accent-light)',color:on?'white':'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0}}>{r[0]}</div>
            <span style={on?{fontWeight:600}:{}}>{r}</span>
            {on&&<span style={{marginLeft:'auto',color:'var(--accent)',fontSize:11}}>✓</span>}
          </div>
        );
      })}
      <div className="ctx-sep"/>
      <div className="ctx-item danger" onClick={()=>{if(window.confirm(`Delete "${live.channelName}"?`)){onDelete(live.id);}onClose();}}>
        <span>🗑</span> Delete Lead
      </div>
    </div>
  );
}

// ─── INLINE PICKER ───────────────────────────────────────
function InlinePicker({type,selected,options,campColorMap,onChange,single=false}) {
  const [open,setOpen]=useState(false);
  const ref=React.useRef(null);
  useEffect(()=>{
    function outside(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener('mousedown',outside);
    return()=>document.removeEventListener('mousedown',outside);
  },[]);
  function toggle(val){
    // single = only one selection allowed (replace); else multi-select toggle.
    const next = single
      ? (selected.includes(val) ? [] : [val])
      : (selected.includes(val) ? selected.filter(x=>x!==val) : [...selected,val]);
    onChange(next);
    if(single) setOpen(false);
  }
  return(
    <div className="inline-picker" style={{position:'relative',minWidth:80}} ref={ref}>
      <div style={{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center',cursor:'pointer',minHeight:24}} onClick={()=>setOpen(o=>!o)}>
        {selected.length===0&&<span style={{fontSize:11,color:'var(--text-light)',padding:'2px 4px'}}>— ▾</span>}
        {type==='tag'&&selected.map(t=>{
          const c=TAG_COLORS[t]||{bg:'#F0F2F5',color:'#68737D'};
          return<span key={t} style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:20,background:c.bg,color:c.color,whiteSpace:'nowrap'}}>{t==='HT'?'⚡ HT':t}</span>;
        })}
        {type==='campaign'&&selected.map(c=>{
          const col=(campColorMap&&campColorMap[c])||'var(--accent)';
          return<span key={c} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:col+'20',color:col,whiteSpace:'nowrap'}}>● {c}</span>;
        })}
        {selected.length>0&&<span style={{fontSize:9,color:'var(--text-dim)',opacity:.7}}>▾</span>}
      </div>
      {open&&(
        <div style={{position:'fixed',zIndex:500,background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--radius)',boxShadow:'var(--shadow-lg)',minWidth:170,padding:'6px 0',marginTop:4}}
          ref={el=>{if(el){const r=ref.current.getBoundingClientRect();el.style.top=(r.bottom+4)+'px';el.style.left=r.left+'px';}}}>
          {options.map(opt=>{
            const val=opt.id||opt;
            const active=selected.includes(val);
            let pill;
            if(type==='tag'){const c=TAG_COLORS[val]||{bg:'#F0F2F5',color:'#68737D'};pill=<span style={{fontSize:11,fontWeight:600,padding:'1px 8px',borderRadius:20,background:c.bg,color:c.color}}>{val==='HT'?'⚡ HT':val}</span>;}
            else{const col=(campColorMap&&campColorMap[val])||'var(--accent)';pill=<span style={{fontSize:11,fontWeight:700,padding:'1px 8px',borderRadius:20,background:col+'20',color:col}}>● {val}</span>;}
            return(
              <div key={val} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 14px',cursor:'pointer',background:active?'var(--accent-light)':'transparent'}} onClick={()=>toggle(val)}>
                <div style={{width:14,height:14,borderRadius:3,border:`2px solid ${active?'var(--accent)':'var(--border)'}`,background:active?'var(--accent)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {active&&<span style={{color:'white',fontSize:9,fontWeight:700}}>✓</span>}
                </div>
                {pill}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── COL HEADER (with filter dropdown) ───────────────────
function ColHeader({col, label, sortCol, sortDir, onSort, leads, colFilter, setColFilter, openFilterCol, setOpenFilterCol}) {
  const ref = useRef(null);
  const isOpen = openFilterCol === col;
  const hasFilter = colFilter[col] != null;

  useEffect(()=>{
    if(!isOpen) return;
    function outside(e){
      if(ref.current && !ref.current.contains(e.target)) setOpenFilterCol(null);
    }
    function esc(e){ if(e.key==='Escape') setOpenFilterCol(null); }
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return()=>{ document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  },[isOpen]);

  // Build filter options for this column
  function getOptions(){
    if(col==='tags'){
      const all=new Set();
      leads.forEach(l=>(l.tags||[]).forEach(t=>all.add(t)));
      const opts=[...all];
      opts.push('Unassigned');
      return opts;
    }
    if(col==='assignedTo'){
      const all=new Set();
      leads.forEach(l=>{ if(l.assignedTo) all.add(l.assignedTo); });
      return [...all,'Unassigned'];
    }
    if(col==='campaign'){
      const all=new Set();
      leads.forEach(l=>(l.campaigns||[]).forEach(c=>all.add(c)));
      return [...all,'None'];
    }
    if(col==='platform'){
      const all=new Set();
      leads.forEach(l=>{ if(l.platform) all.add(l.platform); });
      return [...all];
    }
    if(col==='origin'){
      return ['Fresh','Imported'];
    }
    return [];
  }

  const filterOpts = getOptions();
  const isSorted = sortCol===col;
  const sortLabel = isSorted ? (sortDir==='asc'?'▲':'▼') : '⇅';

  function handleSort(dir){
    onSort(col, dir);
    setOpenFilterCol(null);
  }
  function handleFilter(val){
    setColFilter(f=>({...f,[col]:val}));
    setOpenFilterCol(null);
  }
  function clearFilter(){
    setColFilter(f=>{const n={...f};delete n[col];return n;});
    setOpenFilterCol(null);
  }

  return(
    <th style={{position:'relative',userSelect:'none',whiteSpace:'nowrap',cursor:'pointer'}}
      className={`sortable${isSorted?' sort-'+sortDir:''}`}
      ref={ref}>
      <span onClick={()=>setOpenFilterCol(isOpen?null:col)} style={{display:'inline-flex',alignItems:'center',gap:4}}>
        {label}
        <span className="sort-chevron" style={{fontSize:9,opacity: hasFilter?1:.4,color:hasFilter?'var(--accent)':undefined}}>
          {hasFilter ? '●' : sortLabel}
        </span>
      </span>
      {isOpen&&(
        <div style={{position:'fixed',zIndex:600,background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--radius)',boxShadow:'var(--shadow-lg)',minWidth:180,padding:'4px 0'}}
          ref={el=>{
            if(el){
              const thRect=ref.current.getBoundingClientRect();
              el.style.top=(thRect.bottom+2)+'px';
              el.style.left=thRect.left+'px';
            }
          }}
          onClick={e=>e.stopPropagation()}>
          <div className="col-filter-item" onClick={()=>handleSort('asc')}>Sort A → Z</div>
          <div className="col-filter-item" onClick={()=>handleSort('desc')}>Sort Z → A</div>
          {filterOpts.length>0&&<>
            <div className="col-filter-sep"/>
            <div className="col-filter-section">Filter</div>
            {filterOpts.map(opt=>(
              <div key={opt} className={`col-filter-item${colFilter[col]===opt?' col-filter-active':''}`} onClick={()=>handleFilter(opt)}>
                {opt}
              </div>
            ))}
          </>}
          {hasFilter&&<>
            <div className="col-filter-sep"/>
            <div className="col-filter-item col-filter-clear" onClick={clearFilter}>✕ Clear filter</div>
          </>}
        </div>
      )}
    </th>
  );
}

// ─── INLINE EMAIL (paste/edit email directly in the table) ──
function InlineEmail({emails, onSave}) {
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState('');
  const list=Array.isArray(emails)?emails:[];
  const rest=list.slice(1);
  function start(e){ e.stopPropagation(); setVal(list[0]||''); setEditing(true); }
  function commit(){ const v=val.trim(); onSave(v?[v,...rest]:rest); setEditing(false); }
  const stop=e=>e.stopPropagation();
  if(editing){
    return <input className="inline-email-input" autoFocus value={val}
      onClick={stop} onMouseDown={stop}
      onChange={e=>setVal(e.target.value)} onBlur={commit}
      onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();commit();} else if(e.key==='Escape'){setEditing(false);} }}
      placeholder="paste email…"/>;
  }
  return (
    <span className="inline-picker" onMouseDown={stop} onClick={start} title="Click to add / edit email">
      {list[0]
        ? <span className="inline-email">{list[0]}</span>
        : <span className="inline-email-empty">+ email</span>}
      {list.length>1 && <span className="more-emails">+{list.length-1}</span>}
    </span>
  );
}

// ─── LEADS TABLE ──────────────────────────────────────────
function LeadsTable({leads,onEdit,onDelete,onBulkDelete=null,onBulkAssign,showAssigned=false,showCampaign=true,showOrigin=false,onRowOpen=null,embedded=false,toolbarStart=null,toolbarAfterSearch=null,searchValue=null,onSearchChange=null,searchFilters=true,searchPlaceholder='Search channels, niches, platforms...',smartReachSend=null,closeSend=null,hideExport=false,config,feats,campColorMap,filename='leads',printTitle='Lead Report'}) {
  const [sel,setSel] = useState([]);
  const [searchState,setSearchState] = useState('');
  // When the parent provides search control (e.g. Scraper uses it as the
  // scrape keyword), the box is controlled by the parent; otherwise local.
  const search = onSearchChange!=null ? (searchValue||'') : searchState;
  const setSearch = onSearchChange!=null ? onSearchChange : setSearchState;
  const [filterStatus,setFilterStatus] = useState('');
  const [filterRep,setFilterRep] = useState('');
  const [sortCol,setSortCol] = useState('');
  const [sortDir,setSortDir] = useState('asc');
  const [bulkRep,setBulkRep] = useState('');
  const [bulkTags,setBulkTags] = useState([]);
  const [bulkCamps,setBulkCamps] = useState([]);
  const [editLead,setEditLead] = useState(null);
  const [ctxMenu,setCtxMenu] = useState(null);
  const [page,setPage] = useState(1);
  const [colFilter,setColFilter] = useState({});
  const [openFilterCol,setOpenFilterCol] = useState(null);
  const [srCampaign,setSrCampaign] = useState('');  // selected SmartReach campaign id (rep dashboard)
  const PAGE_SIZE=25;

  const cols = config.columns||{};
  const allReps = config.salesReps||[];

  function handleSort(col, dir){
    setSortCol(col);
    setSortDir(dir||'asc');
  }

  // Apply column filters on top of search/status/rep filters
  const filtered = leads.filter(l=>{
    const s=(searchFilters?search:'').toLowerCase();
    if(s && !l.channelName.toLowerCase().includes(s) && !l.niche.toLowerCase().includes(s) && !l.platform.toLowerCase().includes(s)) return false;
    if(filterStatus && !l.tags.includes(filterStatus)) return false;
    if(filterRep && l.assignedTo!==filterRep) return false;
    // Column filters
    if(colFilter.tags){
      if(colFilter.tags==='Unassigned'){if((l.tags||[]).length>0) return false;}
      else{if(!(l.tags||[]).includes(colFilter.tags)) return false;}
    }
    if(colFilter.assignedTo){
      if(colFilter.assignedTo==='Unassigned'){if(l.assignedTo) return false;}
      else{if(l.assignedTo!==colFilter.assignedTo) return false;}
    }
    if(colFilter.campaign){
      if(colFilter.campaign==='None'){if((l.campaigns||[]).length>0) return false;}
      else{if(!(l.campaigns||[]).includes(colFilter.campaign)) return false;}
    }
    if(colFilter.platform){
      if(l.platform!==colFilter.platform) return false;
    }
    if(colFilter.origin){
      if(leadOrigin(l)!==colFilter.origin) return false;
    }
    return true;
  }).sort((a,b)=>{
    if(!sortCol) return 0;
    const dir=sortDir==='asc'?1:-1;
    if(sortCol==='channelName') return dir*a.channelName.localeCompare(b.channelName);
    if(sortCol==='platform') return dir*(a.platform||'').localeCompare(b.platform||'');
    if(sortCol==='niche') return dir*(a.niche||'').localeCompare(b.niche||'');
    if(sortCol==='followers'){
      const fa=parseInt(String(a.followers).replace(/[^0-9]/g,''))||0;
      const fb=parseInt(String(b.followers).replace(/[^0-9]/g,''))||0;
      return dir*(fa-fb);
    }
    if(sortCol==='assignedTo') return dir*(a.assignedTo||'').localeCompare(b.assignedTo||'');
    if(sortCol==='dateAssigned') return dir*(a.dateAssigned||'').localeCompare(b.dateAssigned||'');
    return 0;
  });

  useEffect(()=>setPage(1),[search,filterStatus,filterRep,sortCol,sortDir,colFilter,leads.length]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const paginated=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  const allSel=filtered.length>0&&filtered.every(l=>sel.includes(l.id));
  // Selected leads that actually have an email (the SmartReach-sendable subset).
  const selEmailable=filtered.filter(l=>sel.includes(l.id)&&(l.emails||[]).length>0);
  function toggleAll(){setSel(allSel?[]:filtered.map(l=>l.id));}
  function toggleOne(id){setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);}
  const lastIdx=useRef(null);
  // Drag-to-select (marquee): press on a row/empty area and sweep across rows.
  const dragging=useRef(false);
  const dragStart=useRef(null);
  const didDrag=useRef(false);
  const INTERACTIVE='input,select,button,a,.inline-picker,.channel-name-link';
  useEffect(()=>{
    function up(){ dragging.current=false; }
    document.addEventListener('mouseup',up);
    return()=>document.removeEventListener('mouseup',up);
  },[]);
  function rowMouseDown(e,idx){
    if(e.button!==0 || e.target.closest(INTERACTIVE)) return;
    dragging.current=true; didDrag.current=false; dragStart.current=idx;
  }
  function containerMouseDown(e){
    if(e.button!==0) return;
    if(e.target.closest('tr')||e.target.closest('thead')||e.target.closest(INTERACTIVE)) return;
    dragging.current=true; didDrag.current=false; dragStart.current=null;
  }
  function rowMouseEnter(idx){
    if(!dragging.current) return;
    if(dragStart.current==null) dragStart.current=idx;
    if(idx!==dragStart.current) didDrag.current=true;
    const a=Math.min(dragStart.current,idx), b=Math.max(dragStart.current,idx);
    setSel(paginated.slice(a,b+1).map(l=>l.id));
  }
  function rowClick(e,lead,idx){
    // Ignore clicks on interactive cell content (links, inputs, pickers, buttons).
    if(e.target.closest(INTERACTIVE)) return;
    if(didDrag.current){ didDrag.current=false; return; } // was a drag-select, not a click
    if(e.shiftKey && lastIdx.current!=null){
      const a=Math.min(lastIdx.current,idx), b=Math.max(lastIdx.current,idx);
      const ids=paginated.slice(a,b+1).map(l=>l.id);
      setSel(s=>Array.from(new Set([...s,...ids])));
    } else {
      toggleOne(lead.id);
      lastIdx.current=idx;
    }
  }
  function openSelected(){
    const targets=filtered.filter(l=>sel.includes(l.id));
    targets.map(l=>l.url).filter(Boolean).forEach(u=>{
      const a=document.createElement('a'); a.href=u; a.target='_blank'; a.rel='noopener noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function doSaveBulk(){
    const today=new Date().toISOString().split('T')[0];
    sel.forEach(id=>{
      const l=leads.find(x=>x.id===id);if(!l)return;
      let u={...l};
      if(bulkRep){u.assignedTo=bulkRep;u.dateAssigned=today;}
      if(bulkTags.length){u.tags=[...bulkTags];}  // single-select: replace tag
      bulkCamps.forEach(c=>{if(!u.campaigns.includes(c))u.campaigns=[...u.campaigns,c];});
      onEdit(u);
    });
    setSel([]);setBulkRep('');setBulkTags([]);setBulkCamps([]);
  }
  function toggleBulkTag(t){setBulkTags(ts=>ts.includes(t)?[]:[t]);}
  function toggleBulkCamp(c){setBulkCamps(cs=>cs.includes(c)?cs.filter(x=>x!==c):[...cs,c]);}
  function patchLead(id,patch){const l=leads.find(x=>x.id===id);if(l)onEdit({...l,...patch});}
  function handleCtx(e,lead){e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,lead});}

  const colHeaderProps = {sortCol,sortDir,onSort:handleSort,leads,colFilter,setColFilter,openFilterCol,setOpenFilterCol};

  return (
    <div className={embedded?'lt-embedded':''} style={embedded?{display:'flex',flexDirection:'column'}:{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      <div className="toolbar no-print">
        {toolbarStart}
        <div className="search-field">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder={searchPlaceholder} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {toolbarAfterSearch}
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          {statusOptions(config).map(s=><option key={s} value={s}>{s==='HT'?'HT (High Ticket)':s}</option>)}
        </select>
        {showAssigned && (
          <select value={filterRep} onChange={e=>setFilterRep(e.target.value)}>
            <option value="">All Reps</option>
            {allReps.map(r=><option key={r}>{r}</option>)}
          </select>
        )}
        <span className="count-label no-print">{filtered.length} lead{filtered.length!==1?'s':''}{sel.length>0&&` · ${sel.length} selected`}</span>
        {!hideExport && <div className="export-group no-print" style={{marginLeft:'auto'}}>
          {feats.exportCSV && <button className="btn btn-outline btn-sm" onClick={()=>exportCSV(filtered,`${filename}.csv`)}>⬇ CSV</button>}
          {feats.exportPDF && <button className="btn btn-outline btn-sm" onClick={()=>exportPDF()}>🖨 PDF</button>}
        </div>}
      </div>

      {sel.length>0&&(
        <div className="bulk-panel no-print">
          <span style={{fontWeight:700,color:'var(--accent)',fontSize:13,whiteSpace:'nowrap'}}>✓ {sel.length} selected</span>
          <div className="toolbar-sep"/>
          {feats.bulkAssign&&<>
            <span className="bulk-panel-label">Rep</span>
            <select value={bulkRep} onChange={e=>setBulkRep(e.target.value)} style={{fontSize:12,padding:'5px 10px'}}>
              <option value="">— none —</option>
              {allReps.map(r=><option key={r}>{r}</option>)}
            </select>
          </>}
          <div className="toolbar-sep"/>
          <span className="bulk-panel-label">Tags</span>
          <div className="bulk-chip">
            {statusOptions(config).map(t=>{
              const on=bulkTags.includes(t);
              const c=TAG_COLORS[t]||{bg:'#F0F2F5',color:'#68737D'};
              return<span key={t} className={`bulk-chip-item${on?' active':''}`}
                style={on?{background:c.bg,color:c.color}:{}}
                onClick={()=>toggleBulkTag(t)}>{t==='HT'?'⚡ HT':t}</span>;
            })}
          </div>
          <div className="toolbar-sep"/>
          <span className="bulk-panel-label">Campaign</span>
          <div className="bulk-chip">
            {(config.campaigns||[]).map(c=>{
              const on=bulkCamps.includes(c.id);
              return<span key={c.id} className={`bulk-chip-item${on?' active':''}`}
                style={on?{background:c.color+'22',color:c.color,borderColor:c.color}:{}}
                onClick={()=>toggleBulkCamp(c.id)}>● {c.label}</span>;
            })}
          </div>
          <div className="toolbar-sep"/>
          <button className="btn btn-primary btn-sm" onClick={doSaveBulk}
            disabled={!bulkRep&&bulkTags.length===0&&bulkCamps.length===0}>
            Save Changes
          </button>
          <button className="btn btn-outline btn-sm" onClick={openSelected} title="Open each selected lead's URL in a new tab">🔗 Open {sel.length}</button>
          {closeSend&&(<>
            <div className="toolbar-sep"/>
            <button className="btn btn-primary btn-sm" disabled={!sel.length}
              onClick={()=>{ closeSend.onSend(leads.filter(l=>sel.includes(l.id))); setSel([]); }}
              title="Send the selected leads to Close.io (assigned to their rep)">⬆ Send {sel.length} to Close</button>
          </>)}
          {smartReachSend&&(<>
            <div className="toolbar-sep"/>
            <span className="bulk-panel-label">SmartReach</span>
            <select value={srCampaign} onChange={e=>setSrCampaign(e.target.value)} style={{fontSize:12,padding:'5px 10px'}}>
              <option value="">{(smartReachSend.campaigns||[]).length?'— campaign —':'no campaigns synced'}</option>
              {(smartReachSend.campaigns||[]).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!srCampaign||selEmailable.length===0}
              onClick={()=>{
                const camp=(smartReachSend.campaigns||[]).find(c=>String(c.id)===String(srCampaign));
                smartReachSend.onSend(selEmailable, srCampaign, camp?camp.label:'');
                setSel([]); setSrCampaign('');
              }}
              title={selEmailable.length?`Send the ${selEmailable.length} selected lead(s) with an email to the chosen SmartReach campaign`:'Select leads that have an email first'}>
              ✉ Send {selEmailable.length} to SmartReach
            </button>
          </>)}
          {(onBulkDelete||onDelete)&&(<>
            <div className="toolbar-sep"/>
            <button className="btn btn-sm" style={{background:'#DE350B',color:'#fff',borderColor:'#DE350B'}}
              onClick={()=>{ if(window.confirm(`Delete ${sel.length} selected lead(s)?\n\nThis removes them from the dashboard and the shared database. This cannot be undone.`)){ (onBulkDelete||((ids)=>ids.forEach(onDelete)))(sel); setSel([]); } }}
              title="Permanently delete the selected leads">🗑 Delete {sel.length}</button>
          </>)}
          <button className="btn btn-ghost btn-sm" onClick={()=>{setSel([]);setBulkRep('');setBulkTags([]);setBulkCamps([]);setSrCampaign('');}}>✕ Clear</button>
        </div>
      )}

      <div className="print-header">{printTitle} — {filtered.length} leads — {new Date().toLocaleDateString()}</div>

      <div className="table-container" onMouseDown={containerMouseDown}>
        {filtered.length===0
          ? <div className="empty"><div className="empty-icon">📭</div><h3>No leads found</h3><p>Try adjusting your filters</p></div>
          : (
          <table>
            <thead>
              <tr>
                {feats.bulkAssign && <th style={{width:40}}><input type="checkbox" checked={allSel} onChange={toggleAll}/></th>}
                {cols.thumbnail && <th style={{width:50}}>Photo</th>}
                {cols.channelName && <ColHeader col="channelName" label="Channel" {...colHeaderProps}/>}
                {cols.url && <th>URL</th>}
                {cols.platform && <ColHeader col="platform" label="Platform" {...colHeaderProps}/>}
                {cols.niche && <ColHeader col="niche" label="Niche" {...colHeaderProps}/>}
                {cols.followers && <ColHeader col="followers" label="Followers" {...colHeaderProps}/>}
                {cols.emails && <th>Email</th>}
                {cols.tags && <ColHeader col="tags" label="Tags" {...colHeaderProps}/>}
                {showOrigin && <ColHeader col="origin" label="Origin" {...colHeaderProps}/>}
                {showCampaign && cols.campaign && <ColHeader col="campaign" label="Campaign" {...colHeaderProps}/>}
                {showAssigned && cols.assignedTo && <ColHeader col="assignedTo" label="Assigned To" {...colHeaderProps}/>}
                {showAssigned && cols.dateAssigned && <ColHeader col="dateAssigned" label="Date Assigned" {...colHeaderProps}/>}
                <th style={{width:80}} className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((lead,idx)=>(
                <tr key={lead.id} className={`${getRowClass(lead)}${sel.includes(lead.id)?' row-selected':''}`} onContextMenu={e=>handleCtx(e,lead)} onClick={e=>rowClick(e,lead,idx)} onMouseDown={e=>rowMouseDown(e,idx)} onMouseEnter={()=>rowMouseEnter(idx)} style={{cursor:'pointer'}}>
                  {feats.bulkAssign && <td><input type="checkbox" checked={sel.includes(lead.id)} onChange={()=>toggleOne(lead.id)}/></td>}
                  {cols.thumbnail && (
                    <td>
                      <a href={lead.url} target="_blank" rel="noopener noreferrer">
                        <div className="thumb thumb-lg" title={`Visit ${lead.channelName}`}>
                          {lead.thumbnail
                            ? <img src={lead.thumbnail} alt={lead.channelName} loading="lazy" onError={e=>{e.target.style.display='none';e.target.parentNode.textContent=avatarLetter(lead.channelName);}}/>
                            : avatarLetter(lead.channelName)}
                        </div>
                      </a>
                    </td>
                  )}
                  {cols.channelName && (
                    <td>
                      <div className={`channel-name${onRowOpen?' channel-name-link':''}`} onClick={onRowOpen?()=>onRowOpen(lead):undefined}>{lead.channelName}</div>
                      {lead.channels && lead.channels.length>1 && <div className="channel-sub">{lead.channels.length} channels</div>}
                    </td>
                  )}
                  {cols.url && (
                    <td style={{maxWidth:160}}>
                      {lead.url
                        ? <a href={lead.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',textDecoration:'none',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={lead.url}>
                            {lead.url.replace(/https?:\/\/(www\.)?/,'')}
                          </a>
                        : <span style={{color:'var(--text-light)'}}>—</span>}
                    </td>
                  )}
                  {cols.platform && <td><span className="platform-badge">{PLATFORM_ICON[lead.platform]} {lead.platform}</span></td>}
                  {cols.niche && <td style={{color:'var(--text-dim)',fontSize:11}}>{lead.niche}</td>}
                  {cols.followers && <td><span className="followers-val">{lead.followers}</span></td>}
                  {cols.emails && (
                    <td className="email-cell">
                      <InlineEmail emails={lead.emails||[]} onSave={arr=>patchLead(lead.id,{emails:arr})}/>
                    </td>
                  )}
                  {cols.tags && (
                    <td>
                      <InlinePicker type="tag" selected={lead.tags} options={statusOptions(config)} campColorMap={campColorMap}
                        onChange={tags=>patchLead(lead.id,{tags})} single/>
                    </td>
                  )}
                  {showOrigin && (
                    <td>
                      {leadOrigin(lead)==='Fresh'
                        ? <span className="origin-badge fresh">● Fresh</span>
                        : <span className="origin-badge imported">↻ Imported</span>}
                    </td>
                  )}
                  {showCampaign && cols.campaign && (
                    <td>
                      <InlinePicker type="campaign" selected={lead.campaigns} options={(config.campaigns||[]).map(c=>c.id)} campColorMap={campColorMap}
                        onChange={campaigns=>patchLead(lead.id,{campaigns})}/>
                    </td>
                  )}
                  {showAssigned && cols.assignedTo && (
                    <td>
                      {lead.assignedTo
                        ? <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:22,height:22,borderRadius:'50%',background:'var(--accent-light)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{lead.assignedTo[0]}</div><span style={{fontWeight:600}}>{lead.assignedTo}</span></div>
                        : <span style={{color:'var(--text-light)',fontSize:11}}>Unassigned</span>}
                    </td>
                  )}
                  {showAssigned && cols.dateAssigned && (
                    <td style={{fontSize:11,color:'var(--text-dim)'}}>{lead.dateAssigned||'—'}</td>
                  )}
                  <td className="no-print">
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn-icon" onClick={()=>onRowOpen?onRowOpen(lead):setEditLead(lead)} title={onRowOpen?'View profile':'Edit lead'}>{onRowOpen?'👁':'✏'}</button>
                      {onDelete && <button className="btn-icon" style={{color:'var(--danger)',borderColor:'rgba(222,53,11,.25)'}} onClick={()=>{if(window.confirm(`Delete "${lead.channelName}"?`))onDelete(lead.id);}} title="Delete lead">🗑</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages>1&&(
        <div className="pagination no-print">
          <button className="page-btn" onClick={()=>setPage(1)} disabled={page===1}>«</button>
          <button className="page-btn" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>‹</button>
          {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=2).reduce((acc,p,i,arr)=>{
            if(i>0&&p-arr[i-1]>1)acc.push(<span key={'e'+p} style={{padding:'0 4px',color:'var(--text-dim)'}}>…</span>);
            acc.push(<button key={p} className={`page-btn${page===p?' active':''}`} onClick={()=>setPage(p)}>{p}</button>);
            return acc;
          },[])}
          <button className="page-btn" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>›</button>
          <button className="page-btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>»</button>
          <span style={{fontSize:12,color:'var(--text-dim)',marginLeft:8}}>Page {page} of {totalPages} · {filtered.length} leads</span>
        </div>
      )}
      {editLead&&<LeadModal lead={editLead} config={config} onClose={()=>setEditLead(null)} onSave={l=>{if(onEdit)onEdit(l);setEditLead(null);}} onDelete={id=>{if(onDelete)onDelete(id);setEditLead(null);}}/>}
      {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} lead={ctxMenu.lead} sel={sel} allLeads={leads} config={config} campColorMap={campColorMap} onEdit={l=>{if(onEdit)onEdit(l);}} onDelete={id=>{if(onDelete)onDelete(id);setCtxMenu(null);}} onOpenEdit={l=>setEditLead(l)} onClose={()=>setCtxMenu(null)}/>}
    </div>
  );
}

// ─── HOME VIEW ────────────────────────────────────────────
const PERIODS=[{id:'daily',label:'Daily',days:1},{id:'weekly',label:'Weekly',days:7},{id:'monthly',label:'Monthly',days:30},{id:'yearly',label:'Yearly',days:365}];

// ─── LEAVES VIEW ──────────────────────────────────────────
// Everyone files leave requests; admins approve/reject. Stored in Supabase and
// (optionally) mirrored to a Google Sheet via config.leavesWebhook.
function LeavesView({leaves,currentUser,isAdmin,onFile,onDecide,onDelete}) {
  const LEAVE_TYPES=['Vacation','Sick','Personal','Emergency','Unpaid','Other'];
  const today=new Date().toISOString().split('T')[0];
  const [type,setType]=useState('Vacation');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [reason,setReason]=useState('');
  const dayCount=(()=>{ if(!start||!end) return 0; const d=Math.round((new Date(end)-new Date(start))/86400000)+1; return d>0?d:0; })();
  function submit(e){ e.preventDefault(); if(!start||!end||end<start) return; onFile({type,start,end,days:dayCount,reason:reason.trim()}); setType('Vacation');setStart('');setEnd('');setReason(''); }
  const visible=isAdmin?leaves:leaves.filter(l=>l.name===currentUser.name);
  const pending=visible.filter(l=>l.status==='Pending').length;
  const sorted=[...visible].sort((a,b)=>((a.status==='Pending'?0:1)-(b.status==='Pending'?0:1))||(b.id-a.id));
  const badge=s=> s==='Approved'?{background:'#E3FCF2',color:'#00875A'}:s==='Rejected'?{background:'#FFEBE6',color:'#DE350B'}:{background:'#FFF4E5',color:'#FF8B00'};
  return (
    <div className="home-content">
      <div className="card">
        <div className="card-header"><div className="card-title">🌴 File a Leave Request</div></div>
        <div className="card-body">
          <form onSubmit={submit} style={{display:'flex',flexWrap:'wrap',gap:14,alignItems:'flex-end'}}>
            <div style={{display:'flex',flexDirection:'column',gap:4}}><label className="form-label">Type</label>
              <select value={type} onChange={e=>setType(e.target.value)} style={{padding:'7px 10px',minWidth:130}}>{LEAVE_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}><label className="form-label">From</label>
              <input type="date" value={start} min={today} onChange={e=>setStart(e.target.value)}/></div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}><label className="form-label">To</label>
              <input type="date" value={end} min={start||today} onChange={e=>setEnd(e.target.value)}/></div>
            <div style={{display:'flex',flexDirection:'column',gap:4,flex:1,minWidth:220}}><label className="form-label">Reason</label>
              <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Optional note for the approver"/></div>
            <div style={{fontSize:12,color:'var(--text-dim)',alignSelf:'center',minWidth:60}}>{dayCount>0?`${dayCount} day${dayCount>1?'s':''}`:''}</div>
            <button type="submit" className="btn btn-primary" disabled={!start||!end||end<start}>Submit Request</button>
          </form>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">{isAdmin?'All Leave Requests':'My Leave Requests'}{pending?` · ${pending} pending`:''}</div></div>
        <div className="card-body" style={{padding:0,overflowX:'auto'}}>
          <table className="kpi-table">
            <thead><tr>{isAdmin&&<th>Name</th>}<th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th><th>Decided by</th></tr></thead>
            <tbody>
              {sorted.length===0 && <tr><td colSpan={isAdmin?9:8} style={{padding:16,color:'var(--text-dim)'}}>No leave requests yet.</td></tr>}
              {sorted.map(l=>{ const canDelete=isAdmin||l.name===currentUser.name; return (
                <tr key={l.id}>
                  {isAdmin&&<td style={{fontWeight:600}}>{l.name}</td>}
                  <td>{l.type}</td><td>{l.start_date||'—'}</td><td>{l.end_date||'—'}</td><td>{l.days||'—'}</td>
                  <td style={{maxWidth:240,whiteSpace:'normal'}}>{l.reason||'—'}</td>
                  <td><span style={{...badge(l.status),fontWeight:700,fontSize:11,padding:'2px 9px',borderRadius:8}}>{l.status}</span></td>
                  <td><div style={{display:'flex',gap:6}}>
                    {isAdmin&&l.status==='Pending'&&<>
                      <button className="btn btn-sm" style={{background:'#00875A',color:'#fff'}} onClick={()=>onDecide(l.id,'Approved')}>Approve</button>
                      <button className="btn btn-sm" style={{background:'#DE350B',color:'#fff'}} onClick={()=>onDecide(l.id,'Rejected')}>Reject</button>
                    </>}
                    {canDelete&&<button className="btn btn-sm btn-ghost" title="Delete this request" style={{color:'#DE350B'}} onClick={()=>onDelete(l)}>🗑</button>}
                    {!canDelete&&!(isAdmin&&l.status==='Pending')&&<span style={{color:'var(--text-dim)',fontSize:12}}>—</span>}
                  </div></td>
                  <td style={{fontSize:12,color:'var(--text-dim)'}}>{l.decided_by||'—'}{l.decided_by&&l.decided_at?` · ${String(l.decided_at).slice(0,10)}`:''}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE VIEW (admin-only) ─────────────────────────
// Automatic login sessions: login time, duration on the dashboard, logout time.
// Recorded automatically on sign-in/out; only admins see this log.
function AttendanceView({sessions,config}) {
  const [rep,setRep]=useState('');
  const reps=config.salesReps||[];
  const rows=sessions.filter(s=>!rep||s.name===rep);
  const names=[...new Set([...reps,...sessions.map(s=>s.name)])];
  const fmt=ts=>{ if(!ts) return '—'; try{ return new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }catch(e){ return ts; } };
  const isActive=s=> !s.logout_at && (Date.now()-new Date(s.last_seen).getTime())<5*60*1000;
  const dur=s=>{ const end=s.logout_at||s.last_seen; if(!s.login_at||!end) return '—'; return fmtDuration((new Date(end)-new Date(s.login_at))/1000); };
  const stat=s=> isActive(s)?{t:'Active',bg:'#E3FCF2',c:'#00875A'}:(s.logout_at?{t:'Logged out',bg:'#F0F2F5',c:'#68737D'}:{t:'Ended',bg:'#FFF4E5',c:'#FF8B00'});
  return (
    <div className="home-content">
      <div className="card">
        <div className="card-header" style={{display:'flex',gap:10,alignItems:'center'}}>
          <div className="card-title">⏱ Login Sessions <span style={{fontWeight:400,color:'var(--text-dim)',fontSize:12}}>· {rows.length} session{rows.length!==1?'s':''}</span></div>
          <select value={rep} onChange={e=>setRep(e.target.value)} style={{marginLeft:'auto',padding:'6px 10px',border:`1px solid ${rep?'var(--accent)':'var(--border)'}`,borderRadius:8,fontSize:13,background:'var(--bg)',color:'var(--text)'}}>
            <option value="">All people</option>
            {names.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="card-body" style={{padding:0,overflowX:'auto'}}>
          <table className="kpi-table">
            <thead><tr><th>Name</th><th>Login</th><th>Logout</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length===0 && <tr><td colSpan={5} style={{padding:16,color:'var(--text-dim)'}}>No login sessions recorded yet.</td></tr>}
              {rows.map(s=>{ const st=stat(s); return (
                <tr key={s.id}>
                  <td style={{fontWeight:600}}>{s.name}</td>
                  <td>{fmt(s.login_at)}</td>
                  <td>{s.logout_at?fmt(s.logout_at):(isActive(s)?'—':fmt(s.last_seen))}</td>
                  <td>{dur(s)}</td>
                  <td><span style={{background:st.bg,color:st.c,fontWeight:700,fontSize:11,padding:'2px 9px',borderRadius:8}}>{st.t}</span></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── CLOSE DATABASE SEARCH ────────────────────────────────
// Live free-text search of the real Close org (~628k leads) to check whether a
// lead already exists. Replaces the old (now-empty) "loaded from Close" view.
// Compact date + "Nd ago" for Close conversation timestamps.
function fmtCloseDate(iso){
  if(!iso) return '';
  const d=new Date(iso); if(isNaN(d)) return '';
  const days=Math.round((Date.now()-d.getTime())/864e5);
  const ds=d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'});
  return ds+(days>=0?` · ${days===0?'today':days===1?'1d ago':days+'d ago'}`:'');
}
// Statuses that mean "don't re-pitch" — highlighted red in the Close search.
function isNegCloseStatus(s){
  return /not\s*interested|unqualified|not\s*qualif|do\s*not\s*contact|lost|bad\s*fit|dead|reject|declin/i.test(String(s||''));
}
function CloseSearchView({config}) {
  const [q,setQ]=useState('');
  const [leads,setLeads]=useState([]);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [total,setTotal]=useState(0);
  const wh=(config.closeSearchWebhook||'').trim();
  function run(e){ e&&e.preventDefault(); const term=q.trim(); if(!term||!wh) return; setLoading(true); setSearched(true);
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:term})})
      .then(r=>r.json()).then(d=>{ if(d&&d.ok===false) throw new Error(d.error||'failed'); setLeads((d&&d.leads)||[]); setTotal((d&&d.total)||0); })
      .catch(()=>{ setLeads([]); setTotal(0); }).finally(()=>setLoading(false));
  }
  const th={textAlign:'left',padding:'8px 10px',borderBottom:'2px solid var(--border)',fontWeight:600,fontSize:12};
  const td={padding:'7px 10px',borderBottom:'1px solid var(--border)',verticalAlign:'top'};
  return (
    <div className="home-content">
      <div className="card">
        <div className="card-header"><div className="card-title">☁ Search Close Database <span style={{fontWeight:400,color:'var(--text-dim)',fontSize:12}}>· check if a lead already exists</span></div></div>
        <div className="card-body">
          <form onSubmit={run} style={{display:'flex',gap:8}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by channel name, email, or URL…" style={{flex:1,padding:'9px 12px'}} autoFocus/>
            <button type="submit" className="btn btn-primary" disabled={loading||!q.trim()}>{loading?'Searching…':'🔍 Search'}</button>
          </form>
          <div style={{marginTop:6,fontSize:12,color:'var(--text-dim)'}}>Searches your full Close database (~628k leads) — by lead name, contact email & channel fields.</div>
        </div>
      </div>
      {searched && <div className="card">
        <div className="card-header"><div className="card-title">{loading?'Searching…':`${total} match${total!==1?'es':''}${total>leads.length?` · showing ${leads.length}`:''}`}</div></div>
        <div className="card-body" style={{padding:0,overflowX:'auto'}}>
          {!loading && leads.length===0 && <div style={{padding:'28px 24px',textAlign:'center',color:'var(--text-dim)',fontSize:13,lineHeight:1.6}}>No leads in Close match “{q}”.<br/><span style={{fontSize:12}}>That likely means it's a <b>fresh lead</b> — not in your Close database yet.</span></div>}
          {leads.length>0 && <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr><th style={th}>Lead / Channel</th><th style={th}>Followers</th><th style={th}>Niche</th><th style={th}>Status</th><th style={th}>Last Contacted</th><th style={th}>Handled By</th><th style={th}>Assigned</th><th style={th}></th></tr></thead>
            <tbody>{leads.map(l=>{
              const neg=isNegCloseStatus(l.status);
              return (<tr key={l.id}>
                <td style={td}>{l.channelName||l.name}{l.url?<a href={l.url} target="_blank" rel="noreferrer" title={l.url} style={{marginLeft:6,fontSize:11,textDecoration:'none'}}>↗</a>:null}</td>
                <td style={td}>{l.followers||'—'}</td><td style={td}>{l.niche||'—'}</td>
                <td style={td}>{l.status?<span style={{padding:'2px 8px',borderRadius:999,fontSize:11,fontWeight:600,whiteSpace:'nowrap',background:neg?'#FFEBE6':'var(--accent-light)',color:neg?'#DE350B':'var(--accent)'}}>{neg?'⚠ ':''}{l.status}</span>:'—'}</td>
                <td style={td}>{l.lastContacted?<div><div style={{whiteSpace:'nowrap'}}>{fmtCloseDate(l.lastContacted)}{l.lastContactType?<span style={{color:'var(--text-dim)'}}> · {l.lastContactType}</span>:''}</div>{l.leadReplied?<div style={{fontSize:11,color:'var(--success)',whiteSpace:'nowrap'}}>↩ lead replied {fmtCloseDate(l.leadReplied)}</div>:null}</div>:<span style={{color:'var(--text-light)'}}>never</span>}</td>
                <td style={td}>{l.handledBy||'—'}</td>
                <td style={td}>{l.assignedTo||'—'}</td>
                <td style={td}>{l.closeUrl?<a href={l.closeUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{fontSize:11}}>Open ↗</a>:null}</td>
              </tr>);
            })}</tbody>
          </table>}
        </div>
      </div>}
    </div>
  );
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────
// The Sales Operations Manual (KB_ARTICLES) as a navigable, searchable site,
// plus an admin-managed Quick Links list (kb_links in Supabase).
// Admin: edit or add a knowledge-base article.
function ArticleEditModal({article,allArticles,onSave,onClose}){
  const isNew = !article || !article.id;
  const [title,setTitle]=useState(article?article.title:'');
  const [chapter,setChapter]=useState(article?article.chapter:'');
  const [body,setBody]=useState(article?article.body:'');
  const chapters=[...new Set((allArticles||[]).map(a=>a.chapter))].sort();
  function submit(e){
    e&&e.preventDefault();
    const t=title.trim(), c=chapter.trim();
    if(!t||!c) return;
    const id = isNew ? 'kb_'+Date.now().toString(36)+Math.floor(Math.random()*1000).toString(36) : article.id;
    onSave({ id, title:t, chapter:c, body });
  }
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:760,width:'92vw',maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
        <div className="modal-header">
          <div><h2>{isNew?'➕ New Article':'✏️ Edit Article'}</h2>{!isNew && <p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>{article.title}</p>}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14,overflow:'auto'}}>
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Email Templates" autoFocus required/>
          </div>
          <div className="form-group">
            <label className="form-label">Chapter *</label>
            <input value={chapter} onChange={e=>setChapter(e.target.value)} placeholder="e.g. 3 · Sales Process" list="kb-chapters-list" required/>
            <datalist id="kb-chapters-list">{chapters.map(c=><option key={c} value={c}/>)}</datalist>
            <div style={{fontSize:11,color:'var(--text-light)',marginTop:5,lineHeight:1.4}}>Use an existing chapter or create a new one. Suggested format: <code>N · Chapter Name</code> (the leading number becomes the tile monogram).</div>
          </div>
          <div className="form-group">
            <label className="form-label">Body (markdown)</label>
            <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={"## Section Title\nIntro paragraph. **Bold** and links like https://example.com auto-render.\n\n### Subsection\n- bullet point\n- another bullet\n\n☐ Checklist item\n☐ Another item\n\n> A highlighted note or callout."} style={{width:'100%',minHeight:300,fontFamily:'ui-monospace,Menlo,Consolas,monospace',fontSize:13,lineHeight:1.55,padding:'10px 12px',resize:'vertical'}}/>
            <div style={{fontSize:11,color:'var(--text-light)',marginTop:5,lineHeight:1.5}}>Markdown supported: <code>## Heading</code>, <code>### Subhead</code>, <code>- bullet</code>, <code>☐ checklist</code>, <code>**bold**</code>, <code>&gt; note</code>, links auto-detected.</div>
          </div>
          <div className="modal-footer">
            <div/>
            <div className="modal-footer-right">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!title.trim()||!chapter.trim()}>{isNew?'Add Article':'Save Changes'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
// Extract a short clean excerpt from an article's markdown body.
function getKbExcerpt(body, n){
  n=n||160;
  const lines=String(body||'').split('\n');
  for(const raw of lines){
    const l=raw.trim();
    if(!l) continue;
    if(l[0]==='#'||l[0]==='>'||l[0]==='-'||l[0]==='☐') continue;
    const plain=l.replace(/\*\*(.+?)\*\*/g,'$1');
    return plain.length>n? plain.slice(0,n).trim()+'…' : plain;
  }
  return '';
}
// Unified Knowledge Base UI — Tools launchpad + Manual articles (same design language).
function KbLaunchpad({tools,articles,view,onView,selected,onSelect,onBack,isAdmin,onAddArticle,onEditArticle,onDeleteArticle}) {
  // Accent options: Blue #2f6bf0/#7db0ff · Indigo #5b5bd6/#a6a6ff · Teal #0f9b8e/#67e8d5 · Violet #7c5cfc/#c4a6ff
  const accent='#5b5bd6', accentLight='#a6a6ff';
  const hexA=(hex,a)=>{ const n=parseInt(hex.slice(1),16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; };
  const accentRing=hexA(accent,.12);
  const CAT_COLORS={Research:'#2f6bf0',Data:'#0f9d58',CRM:'#1f6f6b',Outreach:'#7c3aed',Platform:'#5b5bd6',Finance:'#e0552f'};
  const CHAPTER_COLORS={
    '1 · Company Overview':'#5b5bd6',
    '2 · Services':'#0f9b8e',
    '3 · Sales Process':'#7c5cfc',
    '4 · Tools & Systems':'#2f6bf0',
    '5 · Commission':'#e0552f',
  };
  const [query,setQuery]=useState(''); const [cat,setCat]=useState('All');
  const isManual = view==='manual';
  const SG="'Space Grotesk',sans-serif";
  const scrollRef=useRef(null);
  // Reset filter + scroll when switching modes or opening/closing an article.
  useEffect(()=>{ setQuery(''); setCat('All'); if(scrollRef.current) scrollRef.current.scrollTop=0; },[view, selected && selected.id]);

  // ─── Article reader ─────────────────────────────────────────
  if(selected){
    const chapColor=CHAPTER_COLORS[selected.chapter]||accent;
    return (
      <div ref={scrollRef} style={{flex:1,minHeight:0,overflowY:'auto',fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:'#1c1a26',background:'#f4f4f8'}}>
        <div style={{position:'relative',overflow:'hidden',background:'#15131f',color:'#fff',padding:'28px 0 60px'}}>
          <div style={{position:'absolute',width:560,height:380,borderRadius:'50%',top:-200,right:-80,background:`radial-gradient(circle, ${chapColor} 0%, transparent 70%)`,filter:'blur(80px)',opacity:.45,pointerEvents:'none'}}/>
          <div style={{position:'relative',maxWidth:840,margin:'0 auto',padding:'0 40px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22}}>
              <span className="kbl-back" onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600,color:'rgba(255,255,255,.7)',cursor:'pointer',userSelect:'none'}}>← Back to manual</span>
              {isAdmin && <div style={{display:'flex',gap:8}}>
                <button onClick={()=>onEditArticle&&onEditArticle(selected)} style={{padding:'7px 13px',borderRadius:8,fontSize:13,fontWeight:600,background:accent,color:'#fff',border:'none',cursor:'pointer'}}>✏️ Edit</button>
                <button onClick={()=>onDeleteArticle&&onDeleteArticle(selected.id)} style={{padding:'7px 13px',borderRadius:8,fontSize:13,fontWeight:600,background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.85)',border:'1px solid rgba(255,255,255,.18)',cursor:'pointer'}}>🗑 Delete</button>
              </div>}
            </div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.12em',color:accentLight,marginBottom:10}}>{selected.chapter.replace(/^\d+ · /,'').toUpperCase()}</div>
            <h1 style={{fontFamily:SG,fontWeight:700,fontSize:36,lineHeight:1.1,letterSpacing:'-.02em',margin:0,maxWidth:680}}>{selected.title}</h1>
          </div>
        </div>
        <div style={{maxWidth:840,margin:'-28px auto 80px',padding:'0 40px',position:'relative'}}>
          <div className="kb-article" style={{background:'#fff',borderRadius:18,border:'1px solid #ebeaf0',padding:'44px 52px',boxShadow:'0 18px 36px -18px rgba(20,18,40,.18)','--accent':accent,'--border':'#ebeaf0','--bg':'#f7f7fd','--text':'#1f1d2b','--text-dim':'#6b6878'}}>
            {renderKbBody(selected.body)}
          </div>
        </div>
      </div>
    );
  }

  // ─── List view (tools or manual) ───────────────────────────
  let chips, items;
  if(isManual){
    chips=['All',...Array.from(new Set((articles||[]).map(a=>a.chapter)))];
    const q=query.trim().toLowerCase();
    items=(articles||[]).filter(a=>cat==='All'||a.chapter===cat).filter(a=>!q||(a.title+' '+a.body).toLowerCase().includes(q));
  } else {
    chips=['All',...Array.from(new Set((tools||[]).map(t=>t.category)))];
    const q=query.trim().toLowerCase();
    items=(tools||[]).filter(t=>cat==='All'||t.category===cat).filter(t=>!q||(t.name+' '+t.tagline+' '+t.desc).toLowerCase().includes(q));
  }
  const heroEyebrow=isManual?'SALES OPERATIONS MANUAL':'TOOLS & SYSTEMS — LAUNCHPAD';
  const heroHeadline=isManual?'Everything you need to know, in one place.':'Everything the sales team runs on, one click away.';
  const heroSub=isManual?'The full Sales Operations Manual — company, services, the 18-step sales process, tools, and commissions.':'Search, filter, and jump straight into any platform in the stack.';
  const searchPh=isManual?'Search the manual…':'Search tools…';
  return (
    <div ref={scrollRef} style={{flex:1,minHeight:0,overflowY:'auto',fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:'#1c1a26',background:'#f4f4f8'}}>
      <div style={{position:'relative',overflow:'hidden',background:'#15131f',color:'#fff',padding:'40px 0 48px'}}>
        <div style={{position:'absolute',width:560,height:380,borderRadius:'50%',top:-160,right:-80,background:`radial-gradient(circle, ${accent} 0%, transparent 70%)`,filter:'blur(80px)',opacity:.5,pointerEvents:'none'}}/>
        <div style={{position:'relative',maxWidth:1040,margin:'0 auto',padding:'0 40px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:34}}>
            <div style={{display:'flex',alignItems:'center',gap:11}}>
              <div style={{width:30,height:30,borderRadius:9,background:accent,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <span style={{fontFamily:SG,fontWeight:700,fontSize:17,color:'#fff'}}>Knowledge</span>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:'.04em',color:accentLight,background:accentRing,padding:'3px 9px',borderRadius:999}}>ENFINITY</span>
            </div>
            <div style={{display:'inline-flex',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.14)',borderRadius:10,padding:3,gap:2}}>
              <span onClick={()=>onView('tools')} style={{padding:'7px 14px',borderRadius:7,fontSize:13,fontWeight:600,background:!isManual?accent:'transparent',color:!isManual?'#fff':'rgba(255,255,255,.75)',cursor:'pointer',userSelect:'none',transition:'all .15s'}}>🚀 Tools</span>
              <span onClick={()=>onView('manual')} style={{padding:'7px 14px',borderRadius:7,fontSize:13,fontWeight:600,background:isManual?accent:'transparent',color:isManual?'#fff':'rgba(255,255,255,.75)',cursor:'pointer',userSelect:'none',transition:'all .15s'}}>📖 Manual</span>
            </div>
          </div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.12em',color:accentLight,marginBottom:12}}>{heroEyebrow}</div>
          <h1 style={{fontFamily:SG,fontWeight:700,fontSize:40,lineHeight:1.05,letterSpacing:'-.025em',margin:'0 0 14px',maxWidth:620}}>{heroHeadline}</h1>
          <p style={{fontSize:16,lineHeight:1.55,color:'rgba(255,255,255,.6)',margin:'0 0 26px',maxWidth:540}}>{heroSub}</p>
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{position:'relative',flex:'1 1 320px',maxWidth:440}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.2" strokeLinecap="round" style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
              <input className="kbl-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={searchPh} style={{width:'100%',padding:'13px 16px 13px 46px',fontFamily:'inherit',fontSize:15,color:'#fff',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.14)',borderRadius:13,outline:'none'}}/>
            </div>
            {isManual && isAdmin && <button onClick={()=>onAddArticle&&onAddArticle()} title="Add a new article" style={{display:'inline-flex',alignItems:'center',gap:7,padding:'13px 18px',borderRadius:13,fontSize:14,fontWeight:600,background:accent,color:'#fff',border:'none',cursor:'pointer',boxShadow:`0 8px 22px -10px ${accent}`,fontFamily:'inherit',whiteSpace:'nowrap'}}>➕ Add Article</button>}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1040,margin:'0 auto',padding:'28px 40px 80px'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:9,marginBottom:26}}>
          {chips.map(c=>{ const on=c===cat; const label = isManual && c!=='All' ? c.replace(/^\d+ · /,'') : c; return (
            <div key={c} className="kbl-chip" onClick={()=>setCat(c)} style={{padding:'8px 15px',borderRadius:999,fontSize:13,fontWeight:600,cursor:'pointer',color:on?'#fff':'#5b5868',background:on?accent:'#fff',border:`1px solid ${on?accent:'#e6e5ec'}`}}>{label}</div>
          );})}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
          {isManual
            ? items.map((a,i)=>{ const cc=CHAPTER_COLORS[a.chapter]||accent; const m=a.chapter.match(/^(\d+)/); const initial=m?m[1]:(a.chapter[0]||'?'); const chapShort=a.chapter.replace(/^\d+ · /,''); return (
                <div key={a.id} className="kbl-tile" onClick={()=>onSelect(a.id)} style={{display:'flex',flexDirection:'column',cursor:'pointer',background:'#fff',border:'1px solid #ebeaf0',borderRadius:18,padding:20,animationDelay:(i*0.04).toFixed(2)+'s',position:'relative'}}>
                  {isAdmin && <button onClick={e=>{e.stopPropagation(); onEditArticle&&onEditArticle(a);}} title="Edit article" style={{position:'absolute',top:12,right:12,width:28,height:28,borderRadius:8,border:'1px solid #ebeaf0',background:'#fff',color:'#6b6878',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,zIndex:1}} className="kbl-tile-edit">✏️</button>}
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:13}}>
                    <div style={{flex:'0 0 46px',width:46,height:46,borderRadius:13,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:SG,fontWeight:700,fontSize:18,color:'#fff',background:cc,boxShadow:`0 7px 16px -6px ${cc}`}}>{initial}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:SG,fontWeight:700,fontSize:16,color:'#1f1d2b',lineHeight:1.2}}>{a.title}</div>
                      <div style={{fontSize:12,fontWeight:600,color:cc,marginTop:2}}>{chapShort}</div>
                    </div>
                    <span style={{flex:'0 0 auto',width:30,height:30,borderRadius:9,background:hexA(cc,.12),display:'flex',alignItems:'center',justifyContent:'center',color:cc}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </span>
                  </div>
                  <p style={{fontSize:13.5,lineHeight:1.55,color:'#6b6878',margin:'0 0 14px',flex:1}}>{getKbExcerpt(a.body)}</p>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:13,borderTop:'1px solid #f0eff4'}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#9c99a8'}}>Read article →</span>
                    <span style={{fontSize:10.5,fontWeight:700,letterSpacing:'.05em',padding:'3px 9px',borderRadius:999,color:cc,background:hexA(cc,.12)}}>Chapter {initial}</span>
                  </div>
                </div>
              );})
            : items.map((t,i)=>{ const cc=CAT_COLORS[t.category]||accent; return (
                <a key={t.name} className="kbl-tile" href={t.primaryHref} target="_blank" rel="noopener noreferrer" aria-label={'Open '+t.name} style={{display:'flex',flexDirection:'column',textDecoration:'none',background:'#fff',border:'1px solid #ebeaf0',borderRadius:18,padding:20,animationDelay:(i*0.04).toFixed(2)+'s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:13}}>
                    <div style={{flex:'0 0 46px',width:46,height:46,borderRadius:13,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:SG,fontWeight:700,fontSize:18,color:'#fff',background:t.color,boxShadow:`0 7px 16px -6px ${t.color}`}}>{t.name[0].toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:SG,fontWeight:700,fontSize:16,color:'#1f1d2b',lineHeight:1.2}}>{t.name}</div>
                      <div style={{fontSize:12,fontWeight:600,color:accent,marginTop:2}}>{t.tagline}</div>
                    </div>
                    <span style={{flex:'0 0 auto',width:30,height:30,borderRadius:9,background:accentRing,display:'flex',alignItems:'center',justifyContent:'center',color:accent}}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                    </span>
                  </div>
                  <p style={{fontSize:13.5,lineHeight:1.55,color:'#6b6878',margin:'0 0 14px',flex:1}}>{t.desc}</p>
                  {t.note && <div style={{display:'flex',alignItems:'flex-start',gap:7,fontSize:12,lineHeight:1.45,color:'#8a5a00',background:'#fdf6e3',border:'1px solid #f5e6bd',borderRadius:9,padding:'8px 11px',marginBottom:12}}><span>⚠️</span><span>{t.note}</span></div>}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:13,borderTop:'1px solid #f0eff4'}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#9c99a8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.domain}</span>
                    <span style={{fontSize:10.5,fontWeight:700,letterSpacing:'.05em',padding:'3px 9px',borderRadius:999,color:cc,background:hexA(cc,.12)}}>{t.category}</span>
                  </div>
                </a>
              );})}
        </div>
        {items.length===0 && <div style={{textAlign:'center',padding:'60px 20px',color:'#8a8794'}}>
          <div style={{fontFamily:SG,fontWeight:700,fontSize:18,color:'#5b5868',marginBottom:6}}>{isManual?'No articles found':'No tools found'}</div>
          <div style={{fontSize:14}}>Try a different search or filter.</div>
        </div>}
      </div>
    </div>
  );
}
function kbInline(s){
  const nodes=[]; let k=0, last=0; const re=/(\*\*(.+?)\*\*)|(https?:\/\/[^\s)]+)/g; let m;
  while((m=re.exec(s))){
    if(m.index>last) nodes.push(s.slice(last,m.index));
    if(m[1]) nodes.push(<strong key={k++}>{m[2]}</strong>);
    else if(m[3]) nodes.push(<a key={k++} href={m[3]} target="_blank" rel="noreferrer" style={{color:'var(--accent)',wordBreak:'break-all'}}>{m[3]}</a>);
    last=re.lastIndex;
  }
  if(last<s.length) nodes.push(s.slice(last));
  return nodes;
}
function renderKbBody(text){
  const lines=String(text||'').split('\n'); const out=[]; let ul=null; let k=0;
  const flush=()=>{ if(ul){ out.push(<ul key={'ul'+k++} style={{margin:'4px 0 10px',paddingLeft:20}}>{ul}</ul>); ul=null; } };
  lines.forEach(raw=>{
    const line=raw.replace(/ /g,' ').trim();
    if(!line){ flush(); return; }
    if(line.startsWith('### ')){ flush(); out.push(<h4 key={k++} style={{margin:'14px 0 4px',fontSize:14,fontWeight:700}}>{kbInline(line.slice(4))}</h4>); return; }
    if(line.startsWith('## ')){ flush(); out.push(<h3 key={k++} style={{margin:'20px 0 6px',fontSize:16.5,fontWeight:700,borderBottom:'1px solid var(--border)',paddingBottom:4}}>{kbInline(line.slice(3))}</h3>); return; }
    if(line.startsWith('> ')){ flush(); out.push(<div key={k++} style={{borderLeft:'3px solid var(--accent)',padding:'7px 11px',margin:'8px 0',background:'var(--bg)',borderRadius:6,fontSize:13}}>{kbInline(line.slice(2))}</div>); return; }
    if(line.startsWith('☐ ')){ flush(); out.push(<div key={k++} style={{margin:'2px 0',fontSize:13.5}}>▢ {kbInline(line.slice(2))}</div>); return; }
    if(line.startsWith('- ')){ ul=ul||[]; ul.push(<li key={k++} style={{margin:'3px 0',lineHeight:1.55}}>{kbInline(line.slice(2))}</li>); return; }
    flush(); out.push(<p key={k++} style={{margin:'7px 0',lineHeight:1.6}}>{kbInline(line)}</p>);
  });
  flush(); return out;
}
function KnowledgeBaseView({articles,isAdmin,onSave,onDelete}){
  const tools=(typeof KB_TOOLS!=='undefined'?KB_TOOLS:[]);
  const [view,setView]=useState('tools');           // 'tools' | 'manual'
  const [selectedId,setSelectedId]=useState(null);
  const [editing,setEditing]=useState(null);        // null | 'new' | article object
  const selected = selectedId ? (articles||[]).find(a=>a.id===selectedId) : null;
  return <>
    <KbLaunchpad
      tools={tools} articles={articles||[]}
      view={view} onView={v=>{ setView(v); setSelectedId(null); }}
      selected={selected}
      onSelect={id=>setSelectedId(id)}
      onBack={()=>setSelectedId(null)}
      isAdmin={isAdmin}
      onAddArticle={()=>setEditing('new')}
      onEditArticle={a=>setEditing(a)}
      onDeleteArticle={id=>{ onDelete(id); setSelectedId(null); }}
    />
    {editing && <ArticleEditModal
      article={editing==='new'?null:editing}
      allArticles={articles||[]}
      onSave={a=>{ onSave(a); setEditing(null); if(editing==='new') setSelectedId(a.id); }}
      onClose={()=>setEditing(null)}
    />}
  </>;
}

function HomeView({leads,config,currentUser}) {
  // Non-admins only ever see THEIR OWN metrics: the rep filter is locked to them
  // and the picker is hidden. Admins keep the full all-reps view + picker.
  const lockedRep = (currentUser && currentUser.role!=='admin') ? currentUser.name : null;
  const [period,setPeriod]=useState('monthly');
  const [repFilter,setRepFilter]=useState(lockedRep||'');     // '' = all reps, else a single rep
  const [cStart,setCStart]=useState('');           // custom date range (overrides period)
  const [cEnd,setCEnd]=useState('');
  const custom=!!(cStart&&cEnd);
  const pdfRef=useRef(null);
  const campColorMap={};
  (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);

  const pDef=PERIODS.find(p=>p.id===period)||PERIODS[2];
  const cutoff=new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-(pDef.days-1));
  // A custom date range (both ends set) takes precedence over the period preset.
  function inPeriod(l){
    const d=(l.dateAssigned||'').slice(0,10);
    if(custom) return !!d && d>=cStart && d<=cEnd;
    return l.dateAssigned && new Date(l.dateAssigned)>=cutoff;
  }
  const rangeLabel = custom ? `${cStart} → ${cEnd}` : pDef.label;
  const repScope = (l)=> !repFilter || l.assignedTo===repFilter;

  // Per-rep KPI rows for the selected period (based on dateAssigned).
  const reps=(config.salesReps||[]).filter(r=>!repFilter||r===repFilter);
  const campDefs=(config.campaigns||[]).map(c=>({id:c.id,label:c.label}));
  const repRows=reps.map(r=>{
    const mine=leads.filter(l=>l.assignedTo===r && inPeriod(l));
    const follNums=mine.map(l=>parseFollowers(l.followers)).filter(n=>n>0);
    const byCampaign={}; campDefs.forEach(c=>byCampaign[c.id]=mine.filter(l=>l.campaigns.includes(c.id)).length);
    const byPlatform={}; PLATFORMS.forEach(p=>byPlatform[p]=mine.filter(l=>l.platform===p).length);
    // Per-campaign KPI split for this rep (Potential / Contacted / HT per campaign).
    const campaignStats={}; campDefs.forEach(c=>{
      const cm=mine.filter(l=>l.campaigns.includes(c.id));
      campaignStats[c.id]={
        total:cm.length,
        potential:cm.filter(l=>l.tags.includes('Potential')).length,
        contacted:cm.filter(l=>l.tags.includes('Contacted')).length,
        ht:cm.filter(l=>l.tags.includes('HT')).length,
      };
    });
    return {
      rep:r,
      total:mine.length,
      fresh:mine.filter(l=>leadOrigin(l)==='Fresh').length,
      recycled:mine.filter(l=>isRecycled(l)).length,
      potential:mine.filter(l=>l.tags.includes('Potential')).length,
      contacted:mine.filter(l=>l.tags.includes('Contacted')).length,
      ht:mine.filter(l=>l.tags.includes('HT')).length,
      nq:mine.filter(l=>l.tags.includes('Not Qualified')).length,
      withEmail:mine.filter(l=>(l.emails||[]).length>0).length,
      follKnown:follNums.length,
      avgFoll:follNums.length?Math.round(follNums.reduce((a,b)=>a+b,0)/follNums.length):0,
      byCampaign, byPlatform, campaignStats,
    };
  });
  const maxRep=Math.max(1,...repRows.map(r=>r.total));
  // Aggregate across reps for the table's "All Reps" footer row.
  const sumRep=k=>repRows.reduce((s,r)=>s+(r[k]||0),0);
  const repTot={total:sumRep('total'),fresh:sumRep('fresh'),recycled:sumRep('recycled'),potential:sumRep('potential'),contacted:sumRep('contacted'),ht:sumRep('ht'),nq:sumRep('nq'),withEmail:sumRep('withEmail')};
  const repTotFollKnown=sumRep('follKnown');
  repTot.avgFoll=repTotFollKnown?Math.round(repRows.reduce((s,r)=>s+(r.avgFoll||0)*(r.follKnown||0),0)/repTotFollKnown):0;

  const periodLeads=leads.filter(l=>repScope(l)&&inPeriod(l));
  const total=periodLeads.length;
  const freshTot=periodLeads.filter(l=>leadOrigin(l)==='Fresh').length;
  const recycledTot=periodLeads.filter(l=>isRecycled(l)).length;
  const potentialTot=periodLeads.filter(l=>l.tags.includes('Potential')).length;
  const contactedTot=periodLeads.filter(l=>l.tags.includes('Contacted')).length;
  const withEmailTot=periodLeads.filter(l=>(l.emails||[]).length>0).length;
  const htTot=periodLeads.filter(l=>l.tags.includes('HT')).length;
  const follAll=periodLeads.map(l=>parseFollowers(l.followers)).filter(n=>n>0);
  const avgFollTot=follAll.length?Math.round(follAll.reduce((a,b)=>a+b,0)/follAll.length):0;
  const kpiInfo={period:rangeLabel, rangeStart:custom?cStart:cutoff.toISOString().split('T')[0], rangeEnd:custom?cEnd:new Date().toISOString().split('T')[0], campaigns:campDefs, platforms:PLATFORMS};

  // Birthday reminders (next 14 days) from each user's profile birthday.
  const bdayNow=new Date();
  const bdays=(config.users||[]).map(u=>{ const d=daysUntilBirthday(getProfile(u.name).birthday,bdayNow); return d==null?null:{name:u.name,days:d}; })
    .filter(Boolean).filter(b=>b.days<=14).sort((a,b)=>a.days-b.days);
  const bdayToday=bdays.filter(b=>b.days===0), bdayUpcoming=bdays.filter(b=>b.days>0);
  const joinNames=arr=> arr.length<=1 ? (arr[0]||'') : (arr.length===2 ? `${arr[0]} & ${arr[1]}` : `${arr.slice(0,-1).join(', ')} & ${arr[arr.length-1]}`);

  return (
    <div className="home-content kb-hero-layout" ref={pdfRef}>
      <div className="print-header" style={{display:'none'}}>
        <h1 style={{margin:0}}>Enfinity Sales Dashboard</h1>
        <p>Rep KPI Report — {rangeLabel}{repFilter?` · ${repFilter}`:''} ({custom?cStart:cutoff.toISOString().split('T')[0]} → {custom?cEnd:'today'})</p>
      </div>

      {/* HERO ──────────────────────────────────────────────── */}
      <div className="home-hero no-print">
        <div className="home-hero-inner">
          <div className="home-hero-eyebrow">SALES OVERVIEW · {rangeLabel.toUpperCase()}</div>
          <h1 className="home-hero-title">{repFilter?`${repFilter}'s performance`:'Sales performance at a glance.'}</h1>
          <p className="home-hero-sub">Track every rep, every lead, every day — KPIs, fresh vs recycled, and per-rep breakdown.</p>
          <div className="home-hero-controls">
            <div className="period-toggle" style={{opacity:custom?0.4:1}} title={custom?'Using the custom date range below':''}>
              {PERIODS.map(p=>(
                <button key={p.id} className={`period-btn${period===p.id?' active':''}`} onClick={()=>{setPeriod(p.id);setCStart('');setCEnd('');}}>{p.label}</button>
              ))}
            </div>
            {lockedRep
              ? <span title="You see your own metrics" style={{padding:'7px 12px',fontSize:13,fontWeight:600,borderRadius:8,background:'rgba(255,255,255,.12)',color:'#fff'}}>👤 Your metrics</span>
              : <select value={repFilter} onChange={e=>setRepFilter(e.target.value)} title="Filter KPIs by sales rep"
                  style={{padding:'7px 12px',fontSize:13,fontFamily:'inherit'}}>
                  <option value="">👥 All reps</option>
                  {(config.salesReps||[]).map(r=><option key={r} value={r}>{r}</option>)}
                </select>}
            <div style={{display:'flex',alignItems:'center',gap:6}} title="Custom date range (overrides the period preset)">
              <input type="date" value={cStart} max={cEnd||undefined} onChange={e=>setCStart(e.target.value)}
                style={{padding:'6px 10px',fontSize:12,fontFamily:'inherit'}}/>
              <span className="home-controls-arrow" style={{fontSize:12}}>→</span>
              <input type="date" value={cEnd} min={cStart||undefined} onChange={e=>setCEnd(e.target.value)}
                style={{padding:'6px 10px',fontSize:12,fontFamily:'inherit'}}/>
              {(cStart||cEnd) && <button className="btn btn-ghost btn-sm" onClick={()=>{setCStart('');setCEnd('');}} title="Clear date range">✕</button>}
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:8}}>
              <button className="btn btn-outline btn-sm" onClick={()=>exportKpiCSV(repRows,kpiInfo,`enfinity_sales_kpis_${period}.csv`)}>⬇ CSV</button>
              <button className="btn btn-outline btn-sm" onClick={()=>exportPDF('Rep KPI Report')}>🖨 PDF</button>
            </div>
          </div>
        </div>
      </div>

      {/* BODY ──────────────────────────────────────────────── */}
      <div className="home-body">

      {bdays.length>0 && (
        <div className={`bday-banner no-print${bdayToday.length?' today':''}`}>
          <span className="bday-cake">🎂</span>
          <div>
            {bdayToday.length>0 && <span className="bday-today">{joinNames(bdayToday.map(b=>b.name))} {bdayToday.length>1?'have':'has'} a birthday today! 🎉</span>}
            {bdayUpcoming.length>0 && <span className="bday-up">{bdayToday.length>0?'Coming up: ':'Upcoming birthdays: '}{bdayUpcoming.map(b=>`${b.name} (${b.days===1?'tomorrow':'in '+b.days+' days'})`).join(' · ')}</span>}
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        <div className="stat-card accent"><div className="stat-label">Assigned ({rangeLabel})</div><div className="stat-value">{total}</div><div className="stat-sub">{repFilter?`${repFilter} only`:'across all reps'}</div></div>
        <div className="stat-card green"><div className="stat-label">Fresh Leads</div><div className="stat-value">{freshTot}</div><div className="stat-sub">never contacted</div></div>
        <div className="stat-card orange"><div className="stat-label">Recycled</div><div className="stat-value">{recycledTot}</div><div className="stat-sub">previously worked</div></div>
        <div className="stat-card"><div className="stat-label">Contacted</div><div className="stat-value">{contactedTot}</div><div className="stat-sub">{pct(contactedTot,total)}% contact rate</div></div>
        <div className="stat-card green"><div className="stat-label">Potential</div><div className="stat-value">{potentialTot}</div><div className="stat-sub">{pct(potentialTot,total)}% · {htTot} high ticket</div></div>
        <div className="stat-card"><div className="stat-label">With Email</div><div className="stat-value">{withEmailTot}</div><div className="stat-sub">{pct(withEmailTot,total)}% coverage</div></div>
        <div className="stat-card accent"><div className="stat-label">Avg Followers</div><div className="stat-value">{fmtFollowers(avgFollTot)}</div><div className="stat-sub">per assigned lead</div></div>
        {!repFilter && <div className="stat-card orange" title="Leads scraped/imported but not yet assigned to a rep — they don't count toward the period KPIs until assigned"><div className="stat-label">Unassigned</div><div className="stat-value">{leads.filter(l=>!l.assignedTo).length}</div><div className="stat-sub">in pipeline · not yet assigned</div></div>}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Leads per Sales Rep — Fresh vs Recycled</div>
          <div className="chart-legend">
            <span><i style={{background:'var(--accent)'}}/>Fresh</span>
            <span><i style={{background:'var(--warn)'}}/>Recycled</span>
          </div>
        </div>
        <div className="card-body">
          {repRows.length===0 && <div style={{color:'var(--text-dim)',padding:12}}>No sales reps configured.</div>}
          {repRows.map(r=>(
            <div className="grouped-bar-row" key={r.rep}>
              <div className="bar-label">{r.rep}</div>
              <div className="grouped-bar-track">
                <div className="gbar" style={{width:`${r.fresh/maxRep*100}%`,background:'var(--accent)'}} title={`Fresh: ${r.fresh}`}/>
                <div className="gbar" style={{width:`${r.recycled/maxRep*100}%`,background:'var(--warn)'}} title={`Recycled: ${r.recycled}`}/>
              </div>
              <div className="bar-count">{r.total}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Per-Rep KPI Breakdown ({rangeLabel}){repFilter?` · ${repFilter}`:''}</div></div>
        <div className="card-body" style={{padding:0,overflowX:'auto'}}>
          <table className="kpi-table">
            <thead><tr>
              <th>Sales Rep</th><th>Total</th><th>Fresh</th><th>Recycled</th>
              <th>Potential</th><th>Contacted</th><th>High Ticket</th>
              <th title="Contacted ÷ Total">Contact %</th><th title="Potential ÷ Total">Pot %</th>
              <th title="Leads with at least one email ÷ Total">Email %</th><th>Avg Followers</th>
              <th className="no-print">Report</th>
            </tr></thead>
            <tbody>
              {repRows.map(r=>(
                <tr key={r.rep}>
                  <td style={{fontWeight:600}}>{r.rep}</td>
                  <td>{r.total}</td>
                  <td style={{color:'var(--accent)',fontWeight:600}}>{r.fresh}</td>
                  <td style={{color:'var(--warn)',fontWeight:600}}>{r.recycled}</td>
                  <td>{r.potential}</td><td>{r.contacted}</td><td>{r.ht}</td>
                  <td>{pct(r.contacted,r.total)}%</td>
                  <td>{pct(r.potential,r.total)}%</td>
                  <td>{pct(r.withEmail,r.total)}%</td>
                  <td>{fmtFollowers(r.avgFoll||0)}</td>
                  <td className="no-print">
                    <button className="btn btn-ghost btn-xs" title="Download this rep's leads as CSV"
                      onClick={()=>exportCSV(leads.filter(l=>l.assignedTo===r.rep && inPeriod(l)),`${r.rep}_${period}_leads.csv`)}>⬇ CSV</button>
                  </td>
                </tr>
              ))}
              {repRows.length>0 && <tr style={{borderTop:'2px solid var(--border)',fontWeight:700}}>
                <td>All Reps</td>
                <td>{repTot.total}</td>
                <td style={{color:'var(--accent)'}}>{repTot.fresh}</td>
                <td style={{color:'var(--warn)'}}>{repTot.recycled}</td>
                <td>{repTot.potential}</td>
                <td>{repTot.contacted}</td>
                <td>{repTot.ht}</td>
                <td>{pct(repTot.contacted,repTot.total)}%</td>
                <td>{pct(repTot.potential,repTot.total)}%</td>
                <td>{pct(repTot.withEmail,repTot.total)}%</td>
                <td>{fmtFollowers(repTot.avgFoll||0)}</td>
                <td className="no-print"/>
              </tr>}
            </tbody>
          </table>
        </div>
      </div>

      {campDefs.length>0 && <div className="card">
        <div className="card-header"><div className="card-title">Per-Rep × Campaign KPIs ({pDef.label})</div></div>
        <div className="card-body" style={{padding:0,overflowX:'auto'}}>
          <table className="kpi-table">
            <thead><tr>
              <th>Sales Rep</th><th>Campaign</th><th>Total</th>
              <th>Potential</th><th title="Potential ÷ this campaign's total for the rep">Pot %</th>
              <th>Contacted</th><th title="Contacted ÷ this campaign's total for the rep">Contact %</th>
              <th>High Ticket</th>
            </tr></thead>
            <tbody>
              {repRows.map(r=>campDefs.map((c,ci)=>{
                const s=r.campaignStats[c.id]||{total:0,potential:0,contacted:0,ht:0};
                const color=campColorMap[c.id]||'var(--accent)';
                return (
                  <tr key={r.rep+'|'+c.id} style={ci===campDefs.length-1?{borderBottom:'1px solid var(--border)'}:undefined}>
                    {ci===0 && <td style={{fontWeight:600}} rowSpan={campDefs.length}>{r.rep}</td>}
                    <td style={{whiteSpace:'nowrap'}}><span style={{color,fontWeight:700}}>●</span> {c.label}</td>
                    <td>{s.total}</td>
                    <td style={{color:'var(--success,#00875A)',fontWeight:600}}>{s.potential}</td>
                    <td>{pct(s.potential,s.total)}%</td>
                    <td>{s.contacted}</td>
                    <td>{pct(s.contacted,s.total)}%</td>
                    <td>{s.ht}</td>
                  </tr>
                );
              }))}
              {repRows.length>0 && campDefs.map((c,ci)=>{
                const t=repRows.reduce((a,r)=>{const s=r.campaignStats[c.id]||{};a.total+=s.total||0;a.potential+=s.potential||0;a.contacted+=s.contacted||0;a.ht+=s.ht||0;return a;},{total:0,potential:0,contacted:0,ht:0});
                const color=campColorMap[c.id]||'var(--accent)';
                return (
                  <tr key={'all|'+c.id} style={{fontWeight:700,...(ci===0?{borderTop:'2px solid var(--border)'}:{})}}>
                    {ci===0 && <td rowSpan={campDefs.length}>All Reps</td>}
                    <td style={{whiteSpace:'nowrap'}}><span style={{color}}>●</span> {c.label}</td>
                    <td>{t.total}</td>
                    <td>{t.potential}</td>
                    <td>{pct(t.potential,t.total)}%</td>
                    <td>{t.contacted}</td>
                    <td>{pct(t.contacted,t.total)}%</td>
                    <td>{t.ht}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title">Campaign Distribution</div></div>
          <div className="card-body">
            {(config.campaigns||[]).map(c=>{const cnt=periodLeads.filter(l=>l.campaigns.includes(c.id)).length;return(
              <div className="bar-row" key={c.id}>
                <div className="bar-label">{c.label}</div>
                <div className="bar-track"><div className="bar-fill" style={{width:`${total?cnt/total*100:0}%`,background:c.color}}></div></div>
                <div className="bar-count">{cnt}</div>
              </div>
            );})}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Platform Split</div></div>
          <div className="card-body">
            {PLATFORMS.map(p=>{const cnt=periodLeads.filter(l=>l.platform===p).length;return(
              <div className="bar-row" key={p}>
                <div className="bar-label">{PLATFORM_ICON[p]} {p}</div>
                <div className="bar-track"><div className="bar-fill" style={{width:`${total?cnt/total*100:0}%`,background:'var(--purple)'}}></div></div>
                <div className="bar-count">{cnt}</div>
              </div>
            );})}
          </div>
        </div>
      </div>
      </div>{/* /.home-body */}
    </div>
  );
}

// ─── REP AVATAR COMPONENT ────────────────────────────────
// ── User profiles (photo + title/email/birthday) ───────────
// Stored per-browser in localStorage (like passwords — no backend to sync).
// profiles = { <name>: { photo, title, email, birthday } }.
// ── Supabase client (shared backend) ───────────────────────
// Publishable key is browser-safe (gated by RLS). null if the CDN/config is
// missing — everything then falls back to localStorage so the app still works.
var SB=(function(){
  try{
    if(typeof window!=='undefined' && window.supabase && typeof DEFAULT_CONFIG!=='undefined' && DEFAULT_CONFIG.supabaseUrl && DEFAULT_CONFIG.supabaseKey){
      return window.supabase.createClient(DEFAULT_CONFIG.supabaseUrl, DEFAULT_CONFIG.supabaseKey);
    }
  }catch(e){}
  return null;
})();

function loadProfiles(){ try{ return JSON.parse(localStorage.getItem('profiles')||'{}')||{}; }catch(e){ return {}; } }
// Profiles loaded from Supabase (shared across the team), filled on app start.
var PROFILE_CACHE={};
function loadProfilesFromSupabase(){
  if(!SB) return Promise.resolve();
  return SB.from('profiles').select('*').then(({data,error})=>{
    if(error||!data) return;
    const map={};
    data.forEach(r=>{ map[r.name]={ role:r.role, title:r.title||'', email:r.email||'', birthday:r.birthday||'', photo:r.photo_url||'', color:r.color||'', links:Array.isArray(r.links)?r.links:[] }; });
    PROFILE_CACHE=map;
  }).catch(()=>{});
}
// Merge: config.js shared defaults < this browser's localStorage < Supabase
// (the team-wide source of truth, once loaded).
function getProfile(name){
  const shared=(typeof DEFAULT_CONFIG!=='undefined' && DEFAULT_CONFIG.profiles && DEFAULT_CONFIG.profiles[name]) || {};
  return { ...shared, ...(loadProfiles()[name]||{}), ...(PROFILE_CACHE[name]||{}) };
}
function fmtDuration(secs){ secs=Math.max(0,Math.round(secs||0)); const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60); return h?(h+'h '+m+'m'):(m+'m'); }
function fmtBirthday(b){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(b||''); if(!m) return b||'';
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m[2]-1]} ${+m[3]}, ${m[1]}`;
}
// Days until a 'YYYY-MM-DD' birthday's next occurrence (0 = today). null if unset/bad.
function daysUntilBirthday(bday, now){
  if(!bday) return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(bday); if(!m) return null;
  const today=now||new Date();
  const t=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  let next=new Date(today.getFullYear(),+m[2]-1,+m[3]);
  if(next<t) next=new Date(today.getFullYear()+1,+m[2]-1,+m[3]);
  return Math.round((next-t)/86400000);
}
function saveProfileData(name,data){
  // 1) localStorage (offline cache), 2) in-memory cache, 3) Supabase (shared).
  const all=loadProfiles(); all[name]={...(all[name]||{}),...data};
  try{ localStorage.setItem('profiles',JSON.stringify(all)); }catch(e){}
  PROFILE_CACHE[name]={...(PROFILE_CACHE[name]||{}),...data};
  if(SB){
    const row={ name, updated_at:new Date().toISOString() };
    if('title' in data) row.title=data.title;
    if('email' in data) row.email=data.email;
    if('birthday' in data) row.birthday=data.birthday||null;
    if('photo' in data) row.photo_url=data.photo;
    if('color' in data) row.color=data.color;
    if('role' in data) row.role=data.role;
    if('links' in data) row.links=data.links;
    try{ SB.from('profiles').upsert(row,{onConflict:'name'}).then(({error})=>{ if(error) console.warn('[profiles] save failed',error.message); }); }catch(e){}
  }
}

// ── Leads persistence (Supabase) ───────────────────────────
// The whole lead object round-trips as JSONB. Upserts are safe (idempotent);
// deletes are explicit (only from delL) to avoid any accidental mass-delete.
function leadToRow(l){
  return { id:String(l.id), lead_key:leadKey(l), assigned_to:l.assignedTo||null, data:l, updated_at:new Date().toISOString() };
}
function loadLeadsFromSupabase(){
  if(!SB) return Promise.resolve(null);
  return SB.from('leads').select('id,data').then(({data,error})=>{
    if(error||!data) return null;
    return data.map(r=>r.data).filter(Boolean);
  }).catch(()=>null);
}
function upsertLeadsToSupabase(arr){
  if(!SB||!arr||!arr.length) return;
  try{ SB.from('leads').upsert(arr.map(leadToRow),{onConflict:'id'}).then(({error})=>{ if(error) console.warn('[leads] upsert failed',error.message); }); }catch(e){}
}
function deleteLeadFromSupabase(id){
  if(!SB||id==null) return;
  try{ SB.from('leads').delete().eq('id',String(id)).then(()=>{}); }catch(e){}
}
function deleteLeadsFromSupabase(ids){
  if(!SB||!ids||!ids.length) return;
  try{ SB.from('leads').delete().in('id',ids.map(String)).then(()=>{}); }catch(e){}
}
function clearAllLeadsFromSupabase(){
  if(!SB) return Promise.resolve();
  try{ return SB.from('leads').delete().neq('id','__never__').then(()=>{}); }catch(e){ return Promise.resolve(); }
}
// ── Leaves (Supabase + optional Google-Sheet mirror) ───────
function loadLeavesFromSupabase(){
  if(!SB) return Promise.resolve([]);
  return SB.from('leaves').select('*').order('created_at',{ascending:false}).then(({data,error})=>(error||!data)?[]:data).catch(()=>[]);
}
function loadSessionsFromSupabase(){
  if(!SB) return Promise.resolve([]);
  return SB.from('sessions').select('*').order('login_at',{ascending:false}).limit(1000).then(({data,error})=>(error||!data)?[]:data).catch(()=>[]);
}
function loadKbFromSupabase(){
  if(!SB) return Promise.resolve([]);
  return SB.from('kb_links').select('*').order('created_at',{ascending:true}).then(({data,error})=>(error||!data)?[]:data).catch(()=>[]);
}
// Knowledge-base ARTICLES — Supabase source of truth, seeded from config.KB_ARTICLES on first run.
function loadOrSeedKbArticles(){
  if(!SB) return Promise.resolve(typeof KB_ARTICLES!=='undefined'?KB_ARTICLES:[]);
  return SB.from('kb_articles').select('*').order('sort_order',{ascending:true}).then(({data,error})=>{
    if(error||!data) return typeof KB_ARTICLES!=='undefined'?KB_ARTICLES:[];
    if(data.length>0) return data;
    const seed=typeof KB_ARTICLES!=='undefined'?KB_ARTICLES:[];
    if(!seed.length) return [];
    const rows=seed.map((a,i)=>({id:a.id,chapter:a.chapter,title:a.title,body:a.body,sort_order:i,updated_at:new Date().toISOString()}));
    return SB.from('kb_articles').upsert(rows,{onConflict:'id'}).then(()=>seed).catch(()=>seed);
  }).catch(()=>typeof KB_ARTICLES!=='undefined'?KB_ARTICLES:[]);
}
function upsertKbArticleToSupabase(a){
  if(!SB) return Promise.resolve({ok:true});
  const row={id:a.id,chapter:a.chapter,title:a.title,body:a.body,sort_order:a.sort_order||0,updated_at:new Date().toISOString()};
  return SB.from('kb_articles').upsert(row,{onConflict:'id'}).then(({error})=>({ok:!error,error}));
}
function deleteKbArticleFromSupabase(id){
  if(!SB) return Promise.resolve({ok:true});
  return SB.from('kb_articles').delete().eq('id',String(id)).then(({error})=>({ok:!error,error}));
}

// ── Dashboard config (sales reps, status tags, tabs, campaigns…) ──────────
// Persisted so Customize changes by an admin stick across reloads AND apply to
// every teammate's browser — not just the admin's in-memory session.
// Merge a saved config over the code defaults: arrays/scalars (salesReps,
// statusTags, users, campaigns, webhooks) take the saved value; the nested
// toggle maps deep-merge so NEW tabs/columns/features added in code still appear.
function mergeConfig(base, over){
  if(!over || typeof over!=='object') return base;
  return {
    ...base, ...over,
    tabs:{...(base.tabs||{}), ...(over.tabs||{})},
    columns:{...(base.columns||{}), ...(over.columns||{})},
    features:{...(base.features||{}), ...(over.features||{})},
  };
}
function loadAppConfigFromSupabase(){
  if(!SB) return Promise.resolve(null);
  return SB.from('app_config').select('data').eq('id',1).maybeSingle()
    .then(({data,error})=>(error||!data)?null:(data.data||null)).catch(()=>null);
}
function saveAppConfigToSupabase(cfg){
  if(!SB) return Promise.resolve({ok:true});
  return SB.from('app_config').upsert({id:1,data:cfg,updated_at:new Date().toISOString()},{onConflict:'id'})
    .then(({error})=>({ok:!error,error}));
}

// ── Per-rep YouTube API keys (shared across all browsers) ─────────────────
// Stored in Supabase so a key set by the admin in Customize is visible to the
// rep on THEIR machine. Without this, keys lived only in the admin's in-memory
// React state and never reached anyone else.
function loadRepApiKeysFromSupabase(){
  if(!SB) return Promise.resolve({});
  return SB.from('rep_api_keys').select('rep_name,api_key').then(({data,error})=>{
    if(error||!data) return {};
    const map={}; data.forEach(r=>{ if(r.api_key) map[r.rep_name]=r.api_key; }); return map;
  }).catch(()=>({}));
}
function saveRepApiKeysToSupabase(keys){
  if(!SB) return Promise.resolve({ok:true});
  const rows=Object.keys(keys||{}).map(name=>({rep_name:name,api_key:String(keys[name]||''),updated_at:new Date().toISOString()}));
  if(!rows.length) return Promise.resolve({ok:true});
  return SB.from('rep_api_keys').upsert(rows,{onConflict:'rep_name'}).then(({error})=>({ok:!error,error}));
}

// ── Replies / interest feed (🔔) ──────────────────────────
// One per reply from SmartReach (prospect replied / category) or Close (inbound
// email). Scoped to a rep so each person sees only their own.
var REPLY_SENTIMENTS={
  'Interested':     {cls:'rs-int'},
  'Neutral':        {cls:'rs-neu'},
  'Not interested': {cls:'rs-not'},
  'Reply':          {cls:'rs-rep'},
};
function inferSentiment(cat){
  if(!cat) return 'Reply';
  const lc=String(cat).toLowerCase();
  if(/not\s*interest|unsubscrib|opt.?out|bad\s*fit|do\s*not|negative/.test(lc)) return 'Not interested';
  if(/interest|meeting|positive|warm|hot|qualified|book/.test(lc)) return 'Interested';
  return 'Neutral';
}
function replyKey(r){ return (r.source||'')+'|'+((r.email||r.name||'')+'').toLowerCase()+'|'+(r.when||''); }
function normalizeReply(x,i){
  x=x||{};
  const name=x.name||[x.first_name,x.last_name].filter(Boolean).join(' ').trim()||x.channelName||x.email||'(unknown)';
  return {
    id: x.id!=null?String(x.id):('r'+i+'_'+((x.email||name)+'').toLowerCase()),
    rep: x.rep||x.owner||x.assignedTo||'',
    source: x.source || (x.prospect_category!=null||x.owner_id!=null||x.owner_uuid!=null ? 'SmartReach' : 'Close'),
    name, email: x.email||'',
    sentiment: x.sentiment || inferSentiment(x.prospect_category||x.category),
    snippet: x.snippet||x.body||x.message||'',
    when: x.when||x.updated_at||x.last_contacted_at||x.date||'',
    campaign: x.campaign||x.list||'',
    leadId: x.leadId||x.lead_id||''   // Close lead id → deep link into Close
  };
}
function fmtReplyWhen(w){ if(!w) return ''; const d=new Date(w); return isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
function repliesSeenSet(name){ try{ return new Set(JSON.parse(localStorage.getItem('repliesSeen_'+name)||'[]')); }catch(e){ return new Set(); } }
function markRepliesSeen(name,ids){ try{ const s=repliesSeenSet(name); ids.forEach(id=>s.add(id)); localStorage.setItem('repliesSeen_'+name,JSON.stringify([...s])); }catch(e){} }

function RepAvatar({rep,config,size=36,online=false,bgOverride=null}) {
  const color=(config.repColors||{})[rep]||'#6366F1';
  const emoji=(config.repEmojis||{})[rep]||'';
  // A photo uploaded via Edit Profile (localStorage) wins over a config photo.
  const photo=getProfile(rep).photo || (config.repPhotos||{})[rep] || '';
  const fontSize=emoji?Math.round(size*.48):Math.round(size*.38);
  const dotSize=Math.max(6,Math.round(size*.28));
  const borderColor=bgOverride||'var(--bg)';
  return(
    <div className="rep-avatar" style={{width:size,height:size,background:photo?'transparent':color,color:'white',fontSize,flexShrink:0}}>
      {photo
        ? <img src={photo} alt={rep}/>
        : (emoji||rep[0].toUpperCase())}
      {online&&<div className="rep-online-dot" style={{width:dotSize,height:dotSize,bottom:-1,right:-1,border:`${Math.max(1,Math.round(dotSize*.22))}px solid ${borderColor}`}}/>}
    </div>
  );
}

// ─── REP DASHBOARD VIEW ───────────────────────────────────
// ─── MY CLOSE LEADS ───────────────────────────────────────
// Scoped view of the real Close org: leads Assigned To this rep, paginated.
// We never bulk-load the ~628k-lead org — only this rep's slice, on demand.
function MyCloseLeads({rep,config,onClose}){
  const [leads,setLeads]=useState([]);
  const [total,setTotal]=useState(0);
  const [skip,setSkip]=useState(0);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');
  const [loaded,setLoaded]=useState(false);
  const wh=(config.closeMineWebhook||'').trim();
  function load(nextSkip){
    if(!wh){ setErr('Close view isn’t configured (closeMineWebhook).'); setLoaded(true); return; }
    setLoading(true); setErr('');
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rep,skip:nextSkip||0})})
      .then(r=>r.json())
      .then(resp=>{ if(resp&&resp.ok===false) throw new Error(resp.error||'request failed');
        setTotal(resp.total||0); setSkip(nextSkip||0);
        setLeads(prev=> nextSkip ? prev.concat(resp.leads||[]) : (resp.leads||[])); })
      .catch(e=>setErr(String(e.message||e)))
      .finally(()=>{ setLoading(false); setLoaded(true); });
  }
  useEffect(()=>{ load(0); },[]);
  const hasMore=leads.length<total;
  const th={textAlign:'left',padding:'8px 10px',borderBottom:'2px solid var(--border)',fontWeight:600,position:'sticky',top:0,background:'var(--card)',fontSize:12};
  const td={padding:'7px 10px',borderBottom:'1px solid var(--border)',verticalAlign:'top'};
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:940,width:'94%',maxHeight:'86vh',display:'flex',flexDirection:'column'}}>
        <div className="modal-header">
          <div>
            <h2>{rep}'s Close Leads</h2>
            <p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>Leads in Close assigned to {rep}{total?` · ${total} total`:''}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <div style={{overflow:'auto',flex:1,margin:'4px 0'}}>
          {err && <div style={{padding:16,color:'#DE350B',fontSize:13}}>⚠ {err}</div>}
          {!err && loaded && !leads.length && !loading && (
            <div style={{padding:'32px 24px',textAlign:'center',color:'var(--text-dim)',fontSize:13,lineHeight:1.6}}>
              No Close leads assigned to {rep} yet.<br/>Leads {rep} imports to Close from the dashboard show up here.
            </div>
          )}
          {leads.length>0 && (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr><th style={th}>Channel</th><th style={th}>Followers</th><th style={th}>Niche</th><th style={th}>Status</th><th style={th}>Assigned</th><th style={th}></th></tr></thead>
              <tbody>
                {leads.map(l=>(
                  <tr key={l.id}>
                    <td style={td}>{l.channelName||l.name||'—'}{l.url?<a href={l.url} target="_blank" rel="noreferrer" title={l.url} style={{marginLeft:6,fontSize:11,textDecoration:'none'}}>↗</a>:null}</td>
                    <td style={td}>{l.followers||'—'}</td>
                    <td style={td}>{l.niche||'—'}</td>
                    <td style={td}>{l.status||'—'}</td>
                    <td style={td}>{l.assignedOn||'—'}</td>
                    <td style={td}>{l.closeUrl?<a href={l.closeUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{fontSize:11}}>Open ↗</a>:null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {loading && !leads.length && <div style={{padding:24,textAlign:'center',color:'var(--text-dim)'}}>Loading…</div>}
        </div>
        <div className="modal-footer">
          <span style={{fontSize:11,color:'var(--text-dim)'}}>{leads.length} of {total} loaded</span>
          <div className="modal-footer-right">
            {hasMore && <button className="btn btn-outline btn-sm" disabled={loading} onClick={()=>load(skip+50)}>{loading?'Loading…':'Load more'}</button>}
            <button className="btn btn-primary btn-sm" disabled={loading} onClick={()=>load(0)}>↻ Refresh</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADD LEAD (manual single-lead entry) ──────────────────
// A rep pastes channel info from YouTube/etc. and it's added under their name.
function AddLeadModal({rep,config,onAdd,onClose}) {
  const [name,setName]=useState('');
  const [url,setUrl]=useState('');
  const [platform,setPlatform]=useState((typeof PLATFORMS!=='undefined'&&PLATFORMS[0])||'YouTube');
  const [niche,setNiche]=useState('');
  const [followers,setFollowers]=useState('');
  const [emails,setEmails]=useState('');
  const [channelId,setChannelId]=useState('');
  const [looking,setLooking]=useState(false);
  const [lookMsg,setLookMsg]=useState('');
  const [onClose_,setOnClose_]=useState(false);   // is this channel already in Close?
  const ytWh=(config.ytLookupWebhook||'').trim();
  const checkWh=(config.closeCheckWebhook||'').trim();
  // Paste a YouTube URL -> auto-pull channel name + subs, and flag if it's already in Close.
  function lookup(override){
    const u=(typeof override==='string'?override:url).trim(); if(!u){ setLookMsg('Paste a YouTube channel URL first'); return; }
    if(!ytWh){ return; }
    setLooking(true); setLookMsg(''); setOnClose_(false);
    fetch(ytWh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:u})})
      .then(r=>r.json()).then(d=>{
        if(d&&d.ok&&(d.name||d.subs)){
          if(d.name) setName(d.name); if(d.subs) setFollowers(d.subs);
          if(d.url) setUrl(d.url); if(d.channelId) setChannelId(d.channelId);
          setPlatform('YouTube');
          setLookMsg(`✓ Pulled “${d.name||'channel'}”${d.subs?` · ${d.subs} subs`:''}`);
          // Non-blocking Close duplicate check
          if(checkWh){ fetch(checkWh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leads:[{key:0,channelId:d.channelId,url:d.url||u,emails:emails.split(/[,;\s]+/)}]})})
            .then(r=>r.json()).then(c=>{ if(c&&(c.existing||[]).length) setOnClose_(true); }).catch(()=>{}); }
        } else { setLookMsg("Couldn't read that channel — fill it in manually"); }
      })
      .catch(()=>setLookMsg("Lookup failed — fill it in manually"))
      .finally(()=>setLooking(false));
  }
  function submit(e){ e.preventDefault(); const n=name.trim(); if(!n) return;
    onAdd({
      id: Date.now()+Math.floor(Math.random()*1e6),
      channelName:n, url:url.trim(), channelId, platform, niche:niche.trim(), followers:followers.trim(),
      emails: emails.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean),
      tags:[], campaigns:[], assignedTo:rep, dateAssigned:new Date().toISOString().split('T')[0],
      lastContactDate:null, channels:[n], addedAt:new Date().toISOString(), source:'manual',
    });
    onClose();
  }
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:480}}>
        <div className="modal-header">
          <div><h2>➕ Add Lead</h2><p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>Manually add a lead under <b>{rep}</b></p></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group"><label className="form-label">Channel URL <span style={{fontWeight:400,color:'var(--text-light)'}}>— paste & auto‑fill</span></label>
            <div style={{display:'flex',gap:6}}>
              <input value={url} onChange={e=>setUrl(e.target.value)} onPaste={e=>{ try{ const v=((e.clipboardData||window.clipboardData).getData('text')||'').trim(); if(/youtu\.?be|youtube\.com|^@|^UC/i.test(v)){ setUrl(v); setTimeout(()=>lookup(v),0); } }catch(err){} }} placeholder="https://youtube.com/@… or /channel/UC…" style={{flex:1}}/>
              <button type="button" className="btn btn-outline btn-sm" disabled={looking||!url.trim()} onClick={lookup}>{looking?'…':'🔍 Fetch'}</button>
            </div>
            {lookMsg && <div style={{fontSize:12,marginTop:5,color:lookMsg[0]==='✓'?'var(--success,#00875A)':'var(--text-dim)'}}>{lookMsg}</div>}
            {onClose_ && <div style={{fontSize:12,marginTop:6,background:'#FFF4E5',color:'#B45309',padding:'6px 9px',borderRadius:6,lineHeight:1.45}}>⚠ This channel is already in your <b>Close database</b>. You can still add it (e.g. a recycle lead) — just flagging it.</div>}
          </div>
          <div className="form-group"><label className="form-label">Channel Name *</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Bites with Lily"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">Platform</label>
              <select value={platform} onChange={e=>setPlatform(e.target.value)} style={{width:'100%'}}>{(typeof PLATFORMS!=='undefined'?PLATFORMS:['YouTube']).map(p=><option key={p}>{p}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Followers / Subs</label>
              <input value={followers} onChange={e=>setFollowers(e.target.value)} placeholder="e.g. 120K"/></div>
          </div>
          <div className="form-group"><label className="form-label">Niche / Category</label>
            <input value={niche} onChange={e=>setNiche(e.target.value)} placeholder="e.g. Cooking"/></div>
          <div className="form-group"><label className="form-label">Email(s)</label>
            <input value={emails} onChange={e=>setEmails(e.target.value)} placeholder="comma or space separated"/></div>
          <div className="modal-footer"><div/><div className="modal-footer-right">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add Lead</button>
          </div></div>
        </form>
      </div>
    </div>
  );
}

function RepDashboard({rep,leads,config,onEdit,onDelete,onBulkDelete,onBulkAssign,onBack,onImportClose,onImportSmartReach,onAddLead}) {
  function importToClose(r,ls){
    if(onImportClose) onImportClose(r,ls);
  }
  function importToSmartReach(r,ls,campId,campLabel){
    if(onImportSmartReach) onImportSmartReach(r,ls,campId,campLabel);
  }
  // myLeads = everything assigned to the rep (drives the stat cards & counts).
  // activeLeads = the rep's work queue shown in the table; once a lead is tagged
  // Contacted it leaves this queue and appears under the global Contacted tab.
  const myLeads = leads.filter(l=>l.assignedTo===rep);
  const activeLeads = myLeads.filter(l=>!l.tags.includes('Contacted'));
  const campColorMap={};
  (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);
  const total=myLeads.length;
  const active=activeLeads.length;
  const potentialLeads=myLeads.filter(l=>l.tags.includes('Potential'));   // campaign-ready set
  const potential=potentialLeads.length;
  // Only FRESH Potential leads (not yet on Close) get pushed — Imported ones are
  // already in Close, so re-sending would duplicate them.
  const freshPotential=potentialLeads.filter(isFresh);
  const fresh=freshPotential.length;
  // SmartReach gets EVERY emailable lead under the rep (any status, fresh or
  // imported) — unlike Close, which only takes Fresh leads. SmartReach dedupes
  // prospects by email on its side, so re-sends don't duplicate.
  const smartReachLeads=myLeads.filter(l=>(l.emails||[]).length>0);  // all emailable leads for this rep
  const srCount=smartReachLeads.length;
  const contacted=myLeads.filter(l=>l.tags.includes('Contacted')).length;
  const ht=myLeads.filter(l=>l.tags.includes('HT')).length;
  const feats=config.features||{};

  // Daily quota tracker: for the selected day, how many open (still Potential,
  // not yet Contacted) leads the rep has per campaign. Because status is
  // single-select, a lead tagged Contacted loses its Potential tag and drops
  // out of these counts — so the day's potentials clear as she works them.
  const todayStr=ymdLocal(new Date());
  const [quotaDay,setQuotaDay]=useState(todayStr);
  const [showClose,setShowClose]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const dayLeads=myLeads.filter(l=>leadDayStr(l)===quotaDay);
  const campPotential=(campId)=>dayLeads.filter(l=>l.tags.includes('Potential')&&!l.tags.includes('Contacted')&&(l.campaigns||[]).includes(campId)).length;
  const dayContacted=dayLeads.filter(l=>l.tags.includes('Contacted')).length;
  const dayPotentialTotal=dayLeads.filter(l=>l.tags.includes('Potential')&&!l.tags.includes('Contacted')).length;

  const repColor=(config.repColors||{})[rep]||'#5b5bd6';
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      <div className="rep-view-header no-print" style={{'--rep-color':repColor}}>
        <RepAvatar rep={rep} config={config} size={46} online bgOverride={repColor}/>
        <div style={{minWidth:0}}>
          <div className="rep-view-title">{rep}'s Dashboard</div>
          <div className="rep-view-sub">
            {getProfile(rep).title ? <><b>{getProfile(rep).title}</b> · </> : null}
            {total} lead{total!==1?'s':''} · {active} active
          </div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
          <button className="btn btn-primary btn-sm" disabled={!fresh}
            onClick={()=>importToClose(rep,freshPotential)}
            title={fresh?`Send ${rep}'s ${fresh} Fresh Potential lead(s) to Close.io (already-imported leads are skipped)`:(potential?'All Potential leads are already imported to Close':'No Potential leads to send yet')}>
            ⬆ Send {fresh} to Close.io
          </button>
          <button className="btn btn-outline btn-sm" onClick={()=>setShowAdd(true)}
            title={`Manually add a lead under ${rep}`}>➕ Add Lead</button>
          <button className="btn btn-outline btn-sm" onClick={()=>setShowClose(true)}
            title={`View ${rep}'s leads in Close.io (assigned to them)`}>📁 Close Leads</button>
          <div className="export-group">
            {feats.exportCSV && <button className="btn btn-outline btn-sm" disabled={!fresh}
              onClick={()=>exportCloseCSV(freshPotential,`${rep}_close_import.csv`)}
              title="Download a Close.io-ready CSV of the Fresh Potential leads to import in Close (already-imported leads are skipped)">⬇ Close CSV</button>}
            {feats.exportCSV && <button className="btn btn-outline btn-sm" disabled={!srCount}
              onClick={()=>exportSmartReachCSV(smartReachLeads,`${rep}_smartreach.csv`)}
              title="Download a SmartReach CSV (channel name + email only) of all this rep's emailable leads">⬇ SmartReach CSV</button>}
            {feats.exportCSV && <button className="btn btn-outline btn-sm" onClick={()=>exportCSV(myLeads,`${rep}_leads.csv`)}>⬇ Export CSV</button>}
            {feats.exportPDF && <button className="btn btn-outline btn-sm" onClick={()=>exportPDF(rep)}>🖨 Export PDF</button>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        </div>
      </div>
      <div className="rep-stats-row" style={{display:'flex',gap:12,padding:'18px 32px',flexShrink:0,background:'var(--bg)',flexWrap:'wrap'}}>
        <div className="stat-card accent" style={{flex:1,minWidth:138}}><div className="stat-label">Total</div><div className="stat-value">{total}</div></div>
        <div className="stat-card green" style={{flex:1,minWidth:138}}><div className="stat-label">Potential</div><div className="stat-value">{potential}</div></div>
        <div className="stat-card" style={{flex:1,minWidth:138}} title="Fresh Potential leads not yet on Close — the import queue"><div className="stat-label">Fresh (to import)</div><div className="stat-value">{fresh}</div></div>
        <div className="stat-card" style={{flex:1,minWidth:138}}><div className="stat-label">Contacted</div><div className="stat-value">{contacted}</div></div>
        <div className="stat-card orange" style={{flex:1,minWidth:138}}><div className="stat-label">High Ticket</div><div className="stat-value">{ht}</div></div>
      </div>
      <div className="rep-quota-row no-print" style={{display:'flex',gap:12,padding:'0 32px 18px',flexShrink:0,background:'var(--bg)',alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',flexDirection:'column',gap:2,marginRight:6,padding:'10px 14px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',color:'var(--text)'}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:13,letterSpacing:'-.01em'}}>📅 Daily Quota</span>
          <span style={{fontSize:10,color:'var(--text-dim)'}}>open potentials per campaign</span>
        </div>
        <input type="date" value={quotaDay} max={todayStr} onChange={e=>setQuotaDay(e.target.value||todayStr)}
          style={{padding:'8px 12px',border:'1px solid var(--border)',borderRadius:10,fontSize:12,background:'var(--card)',color:'var(--text)',fontFamily:'inherit'}}/>
        <button className="btn btn-ghost btn-sm" onClick={()=>setQuotaDay(todayStr)} disabled={quotaDay===todayStr}>Today</button>
        {(config.campaigns||[]).map(c=>(
          <div key={c.id} className="stat-card" style={{flex:'0 0 auto',minWidth:128,borderLeft:`3px solid ${c.color}`,padding:'14px 16px'}}>
            <div className="stat-label">{c.label} Potentials</div>
            <div className="stat-value" style={{color:c.color}}>{campPotential(c.id)}</div>
          </div>
        ))}
        <div className="stat-card" style={{flex:'0 0 auto',minWidth:128,padding:'14px 16px'}}>
          <div className="stat-label">Open Total</div>
          <div className="stat-value">{dayPotentialTotal}</div>
        </div>
        <div className="stat-card" style={{flex:'0 0 auto',minWidth:128,padding:'14px 16px'}}>
          <div className="stat-label">Contacted {quotaDay===todayStr?'Today':'That Day'}</div>
          <div className="stat-value" style={{color:'var(--accent)'}}>{dayContacted}</div>
        </div>
      </div>
      <LeadsTable
        leads={activeLeads} onEdit={onEdit} onDelete={onDelete} onBulkDelete={onBulkDelete} onBulkAssign={onBulkAssign}
        showAssigned showCampaign showOrigin config={config} feats={feats} campColorMap={campColorMap}
        smartReachSend={{ campaigns:(config.smartReachCampaigns&&config.smartReachCampaigns[rep])||[], onSend:(leads,campId,campLabel)=>importToSmartReach(rep,leads,campId,campLabel) }}
        closeSend={{ onSend:(ls)=>importToClose(rep,ls) }}
        hideExport
        filename={`${rep}_leads`} printTitle={`${rep}'s Lead Report`}
      />
      {showClose && <MyCloseLeads rep={rep} config={config} onClose={()=>setShowClose(false)}/>}
      {showAdd && <AddLeadModal rep={rep} config={config} onAdd={onAddLead} onClose={()=>setShowAdd(false)}/>}
    </div>
  );
}

// ─── REP SELECT SCREEN ────────────────────────────────────
function RepSelectScreen({leads,config,activeRep,onSelect}) {
  return (
    <div className="rep-select-screen">
      <div className="rep-select-title">
        <h2>Select Your Profile</h2>
        <p>Choose your name to log in and manage your assigned leads</p>
      </div>
      <div className="rep-grid">
        {(config.salesReps||[]).map(r=>{
          const active=leads.filter(l=>l.assignedTo===r&&!l.tags.includes('Contacted')).length;
          const total=leads.filter(l=>l.assignedTo===r).length;
          const isOnline=activeRep===r;
          const color=(config.repColors||{})[r]||'#6366F1';
          return (
            <div key={r} className={`rep-card-btn${isOnline?' rep-card-online':''}`} onClick={()=>onSelect(r)}
              style={isOnline?{borderColor:color,boxShadow:`0 0 0 3px ${color}30`}:{}}>
              <RepAvatar rep={r} config={config} size={64} online={isOnline} bgOverride="var(--card)"/>
              <div className="rep-name">{r}</div>
              <div className="rep-leads">{active} active · {total} total</div>
              {isOnline&&<div style={{fontSize:10,fontWeight:700,color,marginTop:2}}>● Currently logged in</div>}
            </div>
          );
        })}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={()=>onSelect(activeRep)}>← Back</button>
    </div>
  );
}

// ─── CONTACTED VIEW ──────────────────────────────────────
function ContactedView({leads,onSave,onDelete,onBulkDelete,onBulkAssign,config,campColorMap}) {
  const contacted=leads.filter(l=>l.tags.includes('Contacted'));
  const today=new Date();
  function recycleInfo(l){
    if(!l.lastContactDate) return null;
    const diff=Math.floor((today-new Date(l.lastContactDate))/86400000);
    if(l.campaigns.includes('VVV')){const left=30-diff;return{threshold:30,diff,left,color:left<=7?'var(--danger)':left<=14?'var(--warn)':'var(--success)'};}
    if(l.campaigns.includes('MSN')){const left=90-diff;return{threshold:90,diff,left,color:left<=14?'var(--danger)':left<=30?'var(--warn)':'var(--success)'};}
    return null;
  }
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'auto'}}>
      <div style={{padding:'16px 24px',borderBottom:'1px solid var(--border)',background:'var(--card)',display:'flex',gap:12,flexShrink:0}}>
        <div className="stat-card accent" style={{flex:1}}><div className="stat-label">Total Contacted</div><div className="stat-value">{contacted.length}</div></div>
        <div className="stat-card green" style={{flex:1}}><div className="stat-label">VVV (30-day recycle)</div><div className="stat-value">{contacted.filter(l=>l.campaigns.includes('VVV')).length}</div></div>
        <div className="stat-card orange" style={{flex:1}}><div className="stat-label">MSN (90-day recycle)</div><div className="stat-value">{contacted.filter(l=>l.campaigns.includes('MSN')).length}</div></div>
        <div className="stat-card" style={{flex:1}}><div className="stat-label">Recycle Soon (&lt;14d)</div><div className="stat-value" style={{color:'var(--danger)'}}>{contacted.filter(l=>{const r=recycleInfo(l);return r&&r.left<=14&&r.left>0;}).length}</div></div>
      </div>
      <table className="leads-table">
        <thead><tr>
          <th>Channel</th><th>Campaign</th><th>Assigned To</th>
          <th>Last Contacted</th><th>Days Since Contact</th><th>Recycle In</th>
        </tr></thead>
        <tbody>
          {contacted.length===0&&<tr><td colSpan={6} style={{textAlign:'center',padding:32,color:'var(--text-dim)'}}>No contacted leads yet</td></tr>}
          {contacted.map(l=>{
            const r=recycleInfo(l);
            return(
              <tr key={l.id} className={l.campaigns.includes('MSN')&&l.campaigns.includes('VVV')?'row-both':l.campaigns.includes('MSN')?'row-msn':l.campaigns.includes('VVV')?'row-vvv':''}>
                <td><div style={{fontWeight:600,fontSize:13}}>{l.channelName}</div><div style={{fontSize:11,color:'var(--text-dim)'}}>{l.platform}</div></td>
                <td>{l.campaigns.map(c=><span key={c} className="tag-badge" style={{background:campColorMap[c]||'var(--accent)',color:'#fff',marginRight:4}}>{c}</span>)}</td>
                <td>{l.assignedTo||<span style={{color:'var(--text-dim)'}}>—</span>}</td>
                <td>{l.lastContactDate||<span style={{color:'var(--text-dim)'}}>—</span>}</td>
                <td>{r?<span style={{fontWeight:600,color:r.diff>0?'var(--text-dim)':'var(--text)'}}>{r.diff} day{r.diff!==1?'s':''}</span>:<span style={{color:'var(--text-dim)'}}>—</span>}</td>
                <td>{r?<span style={{fontWeight:700,color:r.color}}>{r.left<=0?'⚠ Ready to Recycle':`${r.left}d`}</span>:<span style={{color:'var(--text-dim)'}}>—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── GOOGLE SHEETS: fetch a worksheet BY TAB NAME ─────────
// Used by the Agency import: addresses a tab by name (not gid) via the gviz
// JSONP endpoint (the same CORS-free mechanism the main importer uses), so a
// sheet tab can be matched to an agency folder of the same name.
function gsExtractId(raw){ const m=String(raw||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/); return m?m[1]:null; }
function gsJsonp(id, selector){
  return new Promise((resolve,reject)=>{
    const cb='__gsx_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
    const s=document.createElement('script');
    s.src=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json;responseHandler:${cb}&${selector}`;
    const timer=setTimeout(()=>{cleanup();reject(new Error('Timeout'));},12000);
    function cleanup(){ try{delete window[cb];}catch(e){} s.remove(); clearTimeout(timer); }
    window[cb]=data=>{cleanup();resolve(data);};
    s.onerror=()=>{cleanup();reject(new Error('Network/script error'));};
    document.head.appendChild(s);
  });
}
function gsFetchTableByName(id, sheetName){
  return gsJsonp(id, 'headers=1&sheet='+encodeURIComponent(sheetName)).then(data=>{
    if(!data) throw new Error('No response');
    if(data.status==='error') throw new Error('No tab named "'+sheetName+'"');
    if(!data.table) throw new Error('No table');
    const headers=(data.table.cols||[]).map(c=>(c.label||c.id||'').trim());
    const rows=(data.table.rows||[]).map(r=>(r.c||[]).map(cell=>{ if(!cell||cell.v==null) return ''; if(cell.f!=null) return String(cell.f); return String(cell.v).trim(); }));
    return {headers, rows};
  });
}
// Column auto-map + row→lead builder, mirroring the main Sheets importer's
// conventions so agency tabs ingest identically (keep these two in sync).
function gsAutoMap(headers){
  const ALIASES={
    channelName:['channel name','channel','name','creator','creator name','handle'],
    url:['url','channel url','profile url','youtube url','youtube link'],
    platform:['platform','social','network'],
    niche:['niche','category','topic','industry','vertical'],
    followers:['followers','subscribers','subs','audience','reach','follower count'],
    emails:['email','emails','email address','contact email'],
    tags:['tags','tag','status','label','stage'],
    campaigns:['services','service','campaign','campaigns'],
    assignedTo:['assigned to','assigned','sales rep','lg scraper','scraper','rep','owner','agent'],
    dateAssigned:['date of dump','date assigned','dump date','date'],
    imported:['imported','is imported','import status'],
  };
  const r={};
  (headers||[]).forEach((h,i)=>{ const low=String(h).toLowerCase().trim(); for(const[field,aliases]of Object.entries(ALIASES)){ if(!r[field]&&aliases.some(a=>low.includes(a))) r[field]=String(i); } });
  return r;
}
function gsRowsToLeads(rows, mapping, idBase, defaultRep){
  const today=new Date().toISOString().split('T')[0];
  const get=(row,key)=>mapping[key]!==undefined?String(row[parseInt(mapping[key])]||'').trim():'';
  return (rows||[]).filter(r=>r.some(c=>String(c).trim())).map((row,i)=>{
    const emails=get(row,'emails').split(/[;,]/).map(e=>e.trim()).filter(Boolean);
    const tags=[...new Set(get(row,'tags').split(/[;,]/).map(canonTag).filter(Boolean))];
    const campaigns=get(row,'campaigns').split(/[;,]/).map(c=>c.trim()).filter(Boolean);
    const name=get(row,'channelName')||`Row ${i+1}`;
    const rep=get(row,'assignedTo')||defaultRep||null;
    const dateRaw=get(row,'dateAssigned');
    const impRaw=get(row,'imported').trim().toLowerCase();
    const imported=['yes','y','true','1'].includes(impRaw)?true:['no','n','false','0'].includes(impRaw)?false:undefined;
    let addedAt=new Date().toISOString();
    if(dateRaw){ const t=new Date(dateRaw).getTime(); if(!isNaN(t)) addedAt=new Date(t).toISOString(); }
    return{id:(idBase||Date.now())+i,channelName:name,url:get(row,'url'),platform:get(row,'platform')||'YouTube',niche:get(row,'niche'),followers:get(row,'followers'),emails,tags,campaigns,assignedTo:rep,dateAssigned:(dateRaw||(rep?today:null)),lastContactDate:null,channels:[name],imported,addedAt,agency:get(row,'agency')||null};
  });
}

// ─── GOOGLE SHEETS IMPORT ────────────────────────────────
function GoogleImportView({onImport,addToast}) {
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(false);
  const [preview,setPreview]=useState(null);
  const [mapping,setMapping]=useState({});

  const FIELDS=[
    {key:'channelName',label:'Channel Name',required:true},
    {key:'url',label:'Channel URL'},
    {key:'platform',label:'Platform'},
    {key:'niche',label:'Niche'},
    {key:'followers',label:'Followers'},
    {key:'emails',label:'Email(s)'},
    {key:'tags',label:'Tags / Status'},
    {key:'campaigns',label:'Campaign / Services'},
    {key:'assignedTo',label:'Assigned To / Scraper'},
    {key:'dateAssigned',label:'Date (of Dump)'},
    {key:'imported',label:'Imported (Yes/No)'},
  ];

  function extractSheetId(raw){const m=raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);return m?m[1]:null;}
  function extractGid(raw){const m=raw.match(/[?&#]gid=(\d+)/);return m?m[1]:'0';}

  async function fetchDirectCSV(id,gid){
    const csvUrl=`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    const res=await fetch(csvUrl,{mode:'cors'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.text();
  }

  async function fetchViaCorsProxy(id,gid){
    const csvUrl=encodeURIComponent(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
    const res=await fetch(`https://corsproxy.io/?${csvUrl}`);
    if(!res.ok) throw new Error('Proxy HTTP '+res.status);
    return await res.text();
  }

  async function fetchViaAllOrigins(id,gid){
    const csvUrl=encodeURIComponent(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
    const res=await fetch(`https://api.allorigins.win/raw?url=${csvUrl}`);
    if(!res.ok) throw new Error('AllOrigins HTTP '+res.status);
    return await res.text();
  }

  function fetchViaJsonp(id,gid){
    return new Promise((resolve,reject)=>{
      const cb='__gs_'+Date.now();
      const s=document.createElement('script');
      s.src=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json;responseHandler:${cb}&gid=${gid}`;
      const timer=setTimeout(()=>{cleanup();reject(new Error('Timeout'));},12000);
      function cleanup(){try{delete window[cb];}catch(e){}s.remove();clearTimeout(timer);}
      window[cb]=data=>{cleanup();resolve(data);};
      s.onerror=()=>{cleanup();reject(new Error('Script error'));};
      document.head.appendChild(s);
    });
  }

  async function fetchViaGviz(id,gid){
    const data=await fetchViaJsonp(id,gid);
    if(!data||!data.table) throw new Error('No table');
    const cols=data.table.cols.map(c=>(c.label||c.id||'').trim());
    const rows=(data.table.rows||[]).map(r=>(r.c||[]).map((cell,i)=>{
      if(!cell||cell.v==null) return '';
      if(cell.f) return cell.f;
      return String(cell.v).trim();
    }));
    const esc=v=>`"${String(v).replace(/"/g,'""')}"`;
    return [cols.map(esc).join(','),...rows.map(r=>r.map(esc).join(','))].join('\n');
  }

  function parseCSV(text){
    const lines=text.split('\n').filter(l=>l.trim());
    function parseLine(line){
      const out=[];let cur='',q=false;
      for(let i=0;i<line.length;i++){
        if(line[i]==='"'){q=!q;}
        else if(line[i]===','&&!q){out.push(cur.trim());cur='';}
        else cur+=line[i];
      }
      out.push(cur.trim());return out;
    }
    return{headers:parseLine(lines[0]),rows:lines.slice(1).map(parseLine)};
  }

  function autoMap(headers){
    const ALIASES={
      channelName:['channel name','channel','name','creator','creator name','handle'],
      url:['url','channel url','profile url','youtube url','youtube link'],
      platform:['platform','social','network'],
      niche:['niche','category','topic','industry','vertical'],
      followers:['followers','subscribers','subs','audience','reach','follower count'],
      emails:['email','emails','email address','contact email'],
      tags:['tags','tag','status','label','stage'],
      campaigns:['services','service','campaign','campaigns'],
      assignedTo:['assigned to','assigned','sales rep','lg scraper','scraper','rep','owner','agent'],
      dateAssigned:['date of dump','date assigned','dump date','date'],
      imported:['imported','is imported','import status'],
      agency:['agency','agency name','partner','partner agency'],
    };
    const r={};
    headers.forEach((h,i)=>{
      const low=h.toLowerCase().trim();
      for(const[field,aliases]of Object.entries(ALIASES)){
        if(!r[field]&&aliases.some(a=>low.includes(a))) r[field]=String(i);
      }
    });
    return r;
  }

  async function fetchSheet(){
    const id=extractSheetId(url.trim());
    if(!id){addToast('Paste a valid Google Sheets URL','error');return;}
    const gid=extractGid(url.trim());
    setLoading(true);
    let text=null;
    const errors=[];
    const strategies=[
      {name:'Direct CSV',  fn:()=>fetchDirectCSV(id,gid)},
      {name:'JSONP/gviz',  fn:()=>fetchViaGviz(id,gid)},
      {name:'AllOrigins',  fn:()=>fetchViaAllOrigins(id,gid)},
      {name:'CORS Proxy',  fn:()=>fetchViaCorsProxy(id,gid)},
    ];
    for(const s of strategies){
      try{text=await s.fn();break;}
      catch(e){errors.push(`${s.name}: ${e.message}`);}
    }
    if(!text){
      console.error('All fetch strategies failed:',errors);
      // Detect the most common failure (private sheet → 401/403/redirect to login) and
      // give a clear, actionable message instead of the generic "could not load".
      const allErr=errors.join(' · ');
      const isPrivate = /HTTP (401|403|429)|signin|Sign in|loginredirect|Empty body/i.test(allErr);
      const msg = isPrivate
        ? 'Sheet is private. In Google Sheets: File → Share → Anyone with the link → Viewer. Then try again.'
        : `Could not load sheet (${errors.length} attempts failed). First error: ${errors[0]||'unknown'}. Check that the URL is correct and the sheet is shared "Anyone with link can view".`;
      addToast(msg,'error');
      setLoading(false);return;
    }
    try{
      const{headers,rows}=parseCSV(text);
      if(!headers.length) throw new Error('Sheet appears empty');
      const m=autoMap(headers);
      setMapping(m);
      setPreview({headers,rows,previewRows:rows.slice(0,5)});
      addToast(`Fetched ${rows.length} rows — confirm column mapping below`,'success');
    }catch(e){
      addToast(`Parsed sheet but got an error: ${e.message}`,'error');
    }
    setLoading(false);
  }

  function doImport(){
    if(!preview)return;
    const today=new Date().toISOString().split('T')[0];
    const get=(row,key)=>mapping[key]!==undefined?(row[parseInt(mapping[key])]||'').trim():'';
    const imported=preview.rows
      .filter(r=>r.some(c=>c.trim()))
      .map((row,i)=>{
        const emails=get(row,'emails').split(/[;,]/).map(e=>e.trim()).filter(Boolean);
        const tags=[...new Set(get(row,'tags').split(/[;,]/).map(canonTag).filter(Boolean))];
        const campaigns=get(row,'campaigns').split(/[;,]/).map(c=>c.trim()).filter(Boolean);
        const name=get(row,'channelName')||`Row ${i+1}`;
        const rep=get(row,'assignedTo')||null;
        const dateRaw=get(row,'dateAssigned');
        const impRaw=get(row,'imported').trim().toLowerCase();
        const imported = ['yes','y','true','1'].includes(impRaw) ? true
                       : ['no','n','false','0'].includes(impRaw) ? false : undefined;
        // Stamp when this lead entered the dashboard. Prefer the sheet's own date
        // (so a historically-captured lead sorts before a fresh scrape); fall
        // back to the import time when the sheet has no usable date.
        let addedAt=new Date().toISOString();
        if(dateRaw){ const t=new Date(dateRaw).getTime(); if(!isNaN(t)) addedAt=new Date(t).toISOString(); }
        return{id:Date.now()+i,channelName:name,url:get(row,'url'),platform:get(row,'platform')||'YouTube',niche:get(row,'niche'),followers:get(row,'followers'),emails,tags,campaigns,assignedTo:rep,dateAssigned:(dateRaw||(rep?today:null)),lastContactDate:null,channels:[name],imported,addedAt,agency:get(row,'agency')||null};
      });
    onImport(imported);
    addToast(`✓ ${imported.length} leads imported`,'success');
    setPreview(null);setUrl('');
  }

  return(
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'auto',padding:'24px'}}>
      <div className="card" style={{maxWidth:780,marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Import from Google Sheets</div>
        <div style={{fontSize:12,color:'var(--text-dim)',marginBottom:16}}>
          Paste your Google Sheets URL. The sheet must be shared as <strong>"Anyone with the link can view"</strong> or published to the web (File → Share → Publish to web → CSV).
        </div>
        <div style={{display:'flex',gap:10}}>
          <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&fetchSheet()} placeholder="https://docs.google.com/spreadsheets/d/..." style={{flex:1}}/>
          <button className="btn btn-primary" onClick={fetchSheet} disabled={loading||!url.trim()}>
            {loading?'⏳ Fetching...':'⬇ Load Sheet'}
          </button>
        </div>
        <div style={{marginTop:12,fontSize:11,color:'var(--text-dim)'}}>
          <strong>How to share:</strong> Open your sheet → File → Share → Share with others → Change to "Anyone with the link" → Viewer → Done
        </div>
      </div>

      {preview&&(
        <>
          <div className="card" style={{maxWidth:780,marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Column Mapping <span style={{fontWeight:400,fontSize:11,color:'var(--text-dim)'}}>— auto-detected from your headers, adjust if needed</span></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {FIELDS.map(f=>(
                <div key={f.key} style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:120,fontSize:12,color:'var(--text-dim)',flexShrink:0}}>{f.label}{f.required&&<span style={{color:'var(--danger)'}}> *</span>}</div>
                  <select value={mapping[f.key]||''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value}))} style={{flex:1,fontSize:12}}>
                    <option value="">— skip —</option>
                    {preview.headers.map((h,i)=><option key={i} value={String(i)}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{maxWidth:780,marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Preview <span style={{fontWeight:400,fontSize:11,color:'var(--text-dim)'}}>— first 5 rows of {preview.rows.length} total</span></div>
            <div style={{overflowX:'auto'}}>
              <table className="leads-table" style={{fontSize:11}}>
                <thead><tr>{preview.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
                <tbody>{preview.previewRows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cell||<span style={{color:'var(--text-dim)'}}>—</span>}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>

          <div style={{maxWidth:780,display:'flex',gap:10,alignItems:'center'}}>
            <button className="btn btn-primary" onClick={doImport}>⬆ Import {preview.rows.length} Leads</button>
            <button className="btn btn-ghost" onClick={()=>{setPreview(null);setUrl('');}}>Cancel</button>
            <span style={{fontSize:11,color:'var(--text-dim)'}}>Existing leads will not be duplicated — imports are additive.</span>
          </div>
        </>
      )}

      {!preview&&(
        <div className="card" style={{maxWidth:780}}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:'var(--text-dim)'}}>Expected sheet columns (column names are flexible)</div>
          <table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
              <th style={{textAlign:'left',padding:'6px 8px',color:'var(--text-dim)',fontWeight:600}}>Field</th>
              <th style={{textAlign:'left',padding:'6px 8px',color:'var(--text-dim)',fontWeight:600}}>Recognized Column Names</th>
            </tr></thead>
            <tbody>
              {[
                ['Channel Name*','Channel Name, Name, Creator, Handle'],
                ['Channel URL','URL, Link, Channel URL, YouTube URL'],
                ['Platform','Platform, Social, Network'],
                ['Niche','Niche, Category, Topic, Industry, Vertical'],
                ['Followers','Followers, Subscribers, Subs, Audience'],
                ['Email(s)','Email, Emails, Contact Email (comma/semicolon for multiple)'],
                ['Tags','Tags, Status, Label, Stage'],
                ['Assigned To','Assigned To, Rep, Sales Rep, Owner'],
              ].map(([f,a])=>(
                <tr key={f} style={{borderBottom:'1px solid var(--border-light)'}}>
                  <td style={{padding:'7px 8px',fontWeight:500}}>{f}</td>
                  <td style={{padding:'7px 8px',color:'var(--text-dim)'}}>{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE SIDE PANEL ───────────────────────────────────
// Gleemo-style right drawer. Stats marked "~" are cosmetic placeholders
// (engagement / growth / audience) until real metrics are wired in.
function ProfilePanel({lead,config,campColorMap,onClose,onSave,onDelete,addToast}) {
  const [form,setForm]=useState({...lead,tags:[...(lead.tags||[])],campaigns:[...(lead.campaigns||[])]});
  useEffect(()=>{ setForm({...lead,tags:[...(lead.tags||[])],campaigns:[...(lead.campaigns||[])]}); },[lead.id]);
  function upd(k,v){ setForm(f=>({...f,[k]:v})); }
  function toggleTag(t){ setForm(f=>({...f,tags:f.tags.includes(t)?[]:[t]})); }
  function toggleCamp(c){ setForm(f=>({...f,campaigns:f.campaigns.includes(c)?f.campaigns.filter(x=>x!==c):[...f.campaigns,c]})); }
  function save(){ onSave(form); addToast('Profile saved','success'); onClose(); }

  const followersN=parseFollowers(lead.followers);
  const er=pseudoStat(lead.channelName,0.4,6.5).toFixed(1);
  const growth=pseudoStat(lead.url||lead.channelName,-2,8).toFixed(1);
  const bars=Array.from({length:18},(_,i)=>pseudoStat((lead.channelName||'')+i,8,100));
  const peakIdx=bars.indexOf(Math.max(...bars));

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}/>
      <div className="profile-panel">
        <div className="profile-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div className="thumb" style={{width:42,height:42,fontSize:16}}>{avatarLetter(lead.channelName)}</div>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontWeight:700,fontSize:15}}>{lead.channelName}</span>
                <span className="platform-badge">{PLATFORM_ICON[lead.platform]} {lead.platform}</span>
              </div>
              {lead.url && <a href={lead.url} target="_blank" rel="noopener noreferrer" className="profile-handle">{lead.url.replace(/https?:\/\/(www\.)?/,'')}</a>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>

        <div className="profile-panel-body">
          <div className="profile-stats">
            <div><div className="ps-val">{fmtFollowers(followersN)||'—'}</div><div className="ps-lab">Followers</div></div>
            <div><div className="ps-val">{er}%<span className="ps-approx">~</span></div><div className="ps-lab">Engagement</div></div>
            <div><div className="ps-val">{growth}%<span className="ps-approx">~</span></div><div className="ps-lab">Growth</div></div>
          </div>

          <div className="profile-section">
            <div className="profile-section-title">Basic Information</div>
            <div className="profile-kv"><span>Niche</span><b>{lead.niche||'—'}</b></div>
            <div className="profile-kv"><span>Email</span><b>{lead.emails && lead.emails[0] ? lead.emails[0] : '—'}</b></div>
            {lead.url && <div className="profile-kv"><span>Link</span><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.url.replace(/https?:\/\/(www\.)?/,'').slice(0,32)}</a></div>}
            <div className="profile-kv"><span>Origin</span>
              {leadOrigin(lead)==='Fresh'?<span className="origin-badge fresh">● Fresh</span>:<span className="origin-badge imported">↻ Imported</span>}
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-title">Engagement Distribution <span className="ps-approx">~ sample</span></div>
            <div className="eng-chart">
              {bars.map((h,i)=><div key={i} className="eng-bar" style={{height:`${h}%`,background:i===peakIdx?'var(--accent)':'var(--border)'}}/>)}
            </div>
            <div className="eng-axis"><span>Low</span><span>median</span><span>High</span></div>
          </div>

          <div className="profile-section">
            <div className="profile-section-title">Status Tags</div>
            <div className="tag-grid">
              {statusOptions(config).map(t=>{
                const on=form.tags.includes(t); const c=TAG_COLORS[t]||{bg:'#F0F2F5',color:'#68737D'};
                return <button key={t} type="button" className={`tag-btn${on?' on':''}`} style={on?{background:c.bg,color:c.color,borderColor:c.color}:{}} onClick={()=>toggleTag(t)}>{t==='HT'?'⚡ HT':t}</button>;
              })}
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-title">Campaign</div>
            <div className="tag-grid">
              {(config.campaigns||[]).map(c=>{
                const on=form.campaigns.includes(c.id);
                return <button key={c.id} type="button" className={`tag-btn${on?' on':''}`} style={on?{background:c.color,color:'#fff',borderColor:c.color}:{}} onClick={()=>toggleCamp(c.id)}>● {c.label}</button>;
              })}
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-section-title">Assign to Rep</div>
            <select value={form.assignedTo||''} onChange={e=>{upd('assignedTo',e.target.value||null);if(e.target.value&&!form.dateAssigned)upd('dateAssigned',new Date().toISOString().split('T')[0]);}} style={{width:'100%'}}>
              <option value="">— Unassigned —</option>
              {(config.salesReps||[]).map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="profile-panel-foot">
          {onDelete && <button className="btn btn-danger btn-sm" onClick={()=>{if(window.confirm(`Delete "${lead.channelName}"?`)){onDelete(lead.id);onClose();}}}>🗑 Delete</button>}
          <button className="btn btn-ghost" style={{marginLeft:'auto'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>★ Save</button>
        </div>
      </div>
    </>
  );
}

// ─── INFLUENCER DISCOVERY (was Scraper) ───────────────────
const DISCOVERY_PLACEHOLDERS={
  gender:['All','Female','Male'],
  age:['All','0-18','19-25','26-35','36-45','46+'],
  location:['All','America','Europe','Asia','Worldwide'],
  language:['All','English','Spanish','French','Other'],
  er:['Any','>0.5%','>1%','>3%','>5%'],
  growth:['Any','1m / >5%','1m / >20%'],
  lastPost:['Any','7 days','30 days','3 months','6 months'],
  mediaCount:['Any','1-100','100-500','500+'],
  accountType:['Any','Regular','Business','Creator'],
  verified:['Any','Verified','Not verified'],
  sponsorship:['Any','Has sponsored posts','No sponsored posts'],
  contact:['Any','Email','Email + YouTube'],
};
const INTEREST_OPTIONS=['Activewear','Art & Design','Beauty & Cosmetics','Business & Careers','Camera & Photography','Cars & Motorbikes','Finance','Fitness','Food & Drink','Gaming','Healthcare','Music','Travel'];

function DiscoveryView({leads,onSave,onDelete,onBulkDelete,onBulkAssign,onResults,addToast,config}) {
  const feats=config.features||{};
  const campColorMap={}; (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);
  const PLAT_TABS=['All',...PLATFORMS,'Amazon'];
  const [searching,setSearching]=useState(false);

  // Functional filters
  const [platTab,setPlatTab]=useState('All');
  const [keyword,setKeyword]=useState('');
  const [minF,setMinF]=useState('');
  const [maxF,setMaxF]=useState('');
  const [interest,setInterest]=useState('All');
  const [sortBy,setSortBy]=useState('relevance');
  // Cosmetic placeholder filters (UI only)
  const [ph,setPh]=useState({gender:'All',age:'All',location:'All',language:'All',er:'Any',growth:'Any',lastPost:'Any',mediaCount:'Any',accountType:'Any',verified:'Any',sponsorship:'Any',contact:'Any',audGender:'All',audAge:'All',audLocation:'All',audLanguage:'All'});
  function setP(k,v){ setPh(p=>({...p,[k]:v})); }
  const [profileLead,setProfileLead]=useState(null);

  function reset(){ setPlatTab('All');setKeyword('');setMinF('');setMaxF('');setInterest('All');setSortBy('relevance');
    setPh({gender:'All',age:'All',location:'All',language:'All',er:'Any',growth:'Any',lastPost:'Any',mediaCount:'Any',accountType:'Any',verified:'Any',sponsorship:'Any',contact:'Any',audGender:'All',audAge:'All',audLocation:'All',audLanguage:'All'});
    addToast('Filters reset','info');
  }

  // Builds the search payload sent to the Make webhook (see make-scenario/README.md).
  function buildPayload(){
    return {
      platform: platTab,
      keyword: keyword.trim(),
      interest: interest==='All'?'':interest,
      minFollowers: minF?parseFollowers(minF):null,
      maxFollowers: maxF?parseFollowers(maxF):null,
      gender: ph.gender, age: ph.age, location: ph.location, language: ph.language,
      engagementRate: ph.er, growthRate: ph.growth, lastPost: ph.lastPost, mediaCount: ph.mediaCount,
      accountType: ph.accountType, verified: ph.verified, sponsorship: ph.sponsorship, contact: ph.contact,
      audience: { gender: ph.audGender, age: ph.audAge, location: ph.audLocation, language: ph.audLanguage },
      sortBy, limit: 25,
    };
  }

  function findInfluencers(){
    const wh=(config.scrapeWebhook||'').trim();
    // No real webhook configured yet → just report local mock matches.
    if(!wh || wh.includes('your-') || wh.includes('webhook-id')){
      addToast(`${pool.length} influencer(s) match your filters (connect a scraper webhook to fetch live)`,'info');
      return;
    }
    setSearching(true);
    addToast('Searching influencers via scraper…','info');
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(buildPayload())})
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(data=>{
        const items=Array.isArray(data)?data:(data.results||data.items||data.data||[]);
        const mapped=items.map((it,i)=>mapDiscoveryResult(it,platTab==='All'?null:platTab,i));
        if(onResults) onResults(mapped);
        addToast(`✓ ${mapped.length} influencer(s) fetched from scraper`,'success');
      })
      .catch(e=>addToast(`Search failed: ${e.message}`,'error'))
      .finally(()=>setSearching(false));
  }

  // The discovery queue = leads not yet worked (no status tag), like the old scraper queue.
  let pool=leads.filter(l=>!hasStatusTag(l));
  if(platTab!=='All' && platTab!=='Amazon') pool=pool.filter(l=>l.platform===platTab);
  if(keyword.trim()){ const k=keyword.toLowerCase(); pool=pool.filter(l=>(l.channelName||'').toLowerCase().includes(k)||(l.niche||'').toLowerCase().includes(k)); }
  if(interest!=='All') pool=pool.filter(l=>(l.niche||'').toLowerCase().includes(interest.toLowerCase()));
  const minN=parseFollowers(minF), maxN=parseFollowers(maxF);
  if(minF) pool=pool.filter(l=>parseFollowers(l.followers)>=minN);
  if(maxF) pool=pool.filter(l=>parseFollowers(l.followers)<=maxN);
  if(sortBy==='followers') pool=[...pool].sort((a,b)=>parseFollowers(b.followers)-parseFollowers(a.followers));
  if(sortBy==='name') pool=[...pool].sort((a,b)=>(a.channelName||'').localeCompare(b.channelName||''));

  const credit=Math.min(pool.length,300);

  function Field({label,hint,children}){
    return <div className="disc-field"><label className="form-label">{label}{hint&&<span className="disc-hint" title={hint}>ⓘ</span>}</label>{children}</div>;
  }
  function PHSelect({k,opts}){ return <select value={ph[k]} onChange={e=>setP(k,e.target.value)}>{opts.map(o=><option key={o}>{o}</option>)}</select>; }

  return (
    <div className="discovery" style={{display:'flex',flexDirection:'column',flex:1,overflow:'auto'}}>
      <div className="disc-head">
        <div>
          <h2 style={{margin:0,fontSize:18}}>Influencer Discovery</h2>
          <p style={{fontSize:12,color:'var(--text-dim)',margin:'2px 0 0'}}>Discover & filter influencers across Instagram, YouTube, TikTok, and Amazon.</p>
        </div>
        <div className="disc-credit">Search Credit: <b>{credit}/300</b></div>
      </div>

      {/* Platform tabs */}
      <div className="disc-tabs">
        {PLAT_TABS.map(p=>(
          <button key={p} className={`disc-tab${platTab===p?' active':''}`} onClick={()=>setPlatTab(p)}>
            {p==='All'?'◎ All':`${PLATFORM_ICON[p]||'🛒'} ${p}`}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      <div className="disc-panel">
        <div className="disc-group-label">Influencer</div>
        <div className="disc-grid">
          <Field label="Gender"><PHSelect k="gender" opts={DISCOVERY_PLACEHOLDERS.gender}/></Field>
          <Field label="Age"><PHSelect k="age" opts={DISCOVERY_PLACEHOLDERS.age}/></Field>
          <Field label="Location"><PHSelect k="location" opts={DISCOVERY_PLACEHOLDERS.location}/></Field>
          <Field label="Language"><PHSelect k="language" opts={DISCOVERY_PLACEHOLDERS.language}/></Field>
          <Field label="Interest"><select value={interest} onChange={e=>setInterest(e.target.value)}><option>All</option>{INTEREST_OPTIONS.map(o=><option key={o}>{o}</option>)}</select></Field>
          <Field label="Followers">
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <input value={minF} onChange={e=>setMinF(e.target.value)} placeholder="min (1K)" style={{width:'100%'}}/>
              <span style={{color:'var(--text-light)'}}>–</span>
              <input value={maxF} onChange={e=>setMaxF(e.target.value)} placeholder="max (1M)" style={{width:'100%'}}/>
            </div>
          </Field>
        </div>

        <div className="disc-group-label">Engagement <span className="disc-soon">placeholder</span></div>
        <div className="disc-grid">
          <Field label="Engagement Rate"><PHSelect k="er" opts={DISCOVERY_PLACEHOLDERS.er}/></Field>
          <Field label="Growth Rate"><PHSelect k="growth" opts={DISCOVERY_PLACEHOLDERS.growth}/></Field>
          <Field label="Last Post"><PHSelect k="lastPost" opts={DISCOVERY_PLACEHOLDERS.lastPost}/></Field>
          <Field label="Media Count"><PHSelect k="mediaCount" opts={DISCOVERY_PLACEHOLDERS.mediaCount}/></Field>
        </div>

        <div className="disc-group-label">Account <span className="disc-soon">placeholder</span></div>
        <div className="disc-grid">
          <Field label="Account Type"><PHSelect k="accountType" opts={DISCOVERY_PLACEHOLDERS.accountType}/></Field>
          <Field label="Verified Status"><PHSelect k="verified" opts={DISCOVERY_PLACEHOLDERS.verified}/></Field>
          <Field label="Sponsorship"><PHSelect k="sponsorship" opts={DISCOVERY_PLACEHOLDERS.sponsorship}/></Field>
          <Field label="Contact Information"><PHSelect k="contact" opts={DISCOVERY_PLACEHOLDERS.contact}/></Field>
        </div>

        <div className="disc-group-label">Audience <span className="disc-soon">placeholder</span></div>
        <div className="disc-grid">
          <Field label="Gender"><select value={ph.audGender} onChange={e=>setP('audGender',e.target.value)}>{DISCOVERY_PLACEHOLDERS.gender.map(o=><option key={o}>{o}</option>)}</select></Field>
          <Field label="Age"><select value={ph.audAge} onChange={e=>setP('audAge',e.target.value)}>{DISCOVERY_PLACEHOLDERS.age.map(o=><option key={o}>{o}</option>)}</select></Field>
          <Field label="Location"><select value={ph.audLocation} onChange={e=>setP('audLocation',e.target.value)}>{DISCOVERY_PLACEHOLDERS.location.map(o=><option key={o}>{o}</option>)}</select></Field>
          <Field label="Language"><select value={ph.audLanguage} onChange={e=>setP('audLanguage',e.target.value)}>{DISCOVERY_PLACEHOLDERS.language.map(o=><option key={o}>{o}</option>)}</select></Field>
        </div>

        <div className="disc-footer-row">
          <div className="disc-keyword">
            <span style={{fontSize:12,color:'var(--text-dim)',fontWeight:600}}>Keyword</span>
            <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="Search name or niche..."/>
          </div>
          <div className="disc-field" style={{minWidth:150}}>
            <span style={{fontSize:12,color:'var(--text-dim)',fontWeight:600}}>Sort By</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="relevance">Relevance</option>
              <option value="followers">Followers (high→low)</option>
              <option value="name">Name (A→Z)</option>
            </select>
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'flex-end'}}>
            <button className="btn btn-ghost" onClick={reset} disabled={searching}>Reset Filters</button>
            <button className="btn btn-primary" onClick={findInfluencers} disabled={searching}>{searching?'⏳ Searching…':'🔎 Find Influencer'}</button>
          </div>
        </div>
      </div>

      <div className="disc-results-label">{pool.length} profile{pool.length!==1?'s':''}</div>
      <LeadsTable leads={pool} onEdit={onSave} onDelete={onDelete} onBulkDelete={onBulkDelete} onBulkAssign={onBulkAssign}
        showAssigned showCampaign showOrigin onRowOpen={setProfileLead} embedded
        config={config} feats={feats} campColorMap={campColorMap} filename="discovery" printTitle="Influencer Discovery"/>

      {profileLead && <ProfilePanel lead={profileLead} config={config} campColorMap={campColorMap}
        onClose={()=>setProfileLead(null)} onSave={onSave} onDelete={onDelete} addToast={addToast}/>}
    </div>
  );
}

// ─── SCRAPER VIEW (restored) ──────────────────────────────
// Simple scraper queue. "Run Scraper" POSTs to the Make/Apify webhook
// (config.scrapeWebhook) and ingests results; falls back to a notice if
// no webhook is configured. The richer DiscoveryView above is kept dormant.
const SCRAPER_LANGUAGES=['All','English','Spanish','Portuguese','French','German','Italian','Dutch','Russian','Polish','Turkish','Arabic','Hindi','Indonesian','Japanese','Korean','Chinese','Thai','Vietnamese','Filipino','Ukrainian','Romanian','Swedish','Other'];
// Dashboard language name → YouTube `relevanceLanguage` code ('' = no preference).
const LANG_CODES={ All:'', English:'en', Spanish:'es', Portuguese:'pt', French:'fr', German:'de', Italian:'it', Dutch:'nl', Russian:'ru', Polish:'pl', Turkish:'tr', Arabic:'ar', Hindi:'hi', Indonesian:'id', Japanese:'ja', Korean:'ko', Chinese:'zh', Thai:'th', Vietnamese:'vi', Filipino:'tl', Ukrainian:'uk', Romanian:'ro', Swedish:'sv', Other:'' };
// Pair each language with a representative `regionCode` (market) — relevanceLanguage
// alone is only a soft bias, so adding the region makes results stay in-language.
// Tunable: e.g. Spanish→MX (largest Spanish YT), Portuguese→BR, English→US.
const REGION_CODES={ All:'', English:'US', Spanish:'MX', Portuguese:'BR', French:'FR', German:'DE', Italian:'IT', Dutch:'NL', Russian:'RU', Polish:'PL', Turkish:'TR', Arabic:'SA', Hindi:'IN', Indonesian:'ID', Japanese:'JP', Korean:'KR', Chinese:'TW', Thai:'TH', Vietnamese:'VN', Filipino:'PH', Ukrainian:'UA', Romanian:'RO', Swedish:'SE', Other:'' };
// Follower BRACKETS (a range, not a minimum) — picking "1K – 10K" keeps only
// channels inside that band, so a selection stays on its tier.
const FOLLOWER_BRACKETS=[
  { v:'',     label:'Any followers', min:0,       max:Infinity },
  { v:'1K',   label:'1K – 10K',      min:1000,    max:10000 },
  { v:'10K',  label:'10K – 50K',     min:10000,   max:50000 },
  { v:'50K',  label:'50K – 100K',    min:50000,   max:100000 },
  { v:'100K', label:'100K – 500K',   min:100000,  max:500000 },
  { v:'500K', label:'500K – 1M',     min:500000,  max:1000000 },
  { v:'1M',   label:'1M+',           min:1000000, max:Infinity },
];

function ScraperView({leads,onSave,onDelete,onBulkDelete,onBulkAssign,onResults,addToast,config,currentUser}) {
  const [platform,setPlatform]=useState('All');
  const [minF,setMinF]=useState('10K');
  // Remember the chosen language across reloads so it "sticks".
  const [language,setLanguage]=useState(()=>{ try{ return localStorage.getItem('srLanguage')||'All'; }catch(e){ return 'All'; } });
  useEffect(()=>{ try{ localStorage.setItem('srLanguage',language); }catch(e){} },[language]);
  const [keyword,setKeyword]=useState('');
  const [loading,setLoading]=useState(false);
  const feats=config.features||{};
  const campColorMap={};
  (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);

  async function scrape(){
    const wh=(config.scrapeWebhook||'').trim();
    if(!wh || wh.includes('your-') || wh.includes('webhook-id')){
      addToast('No scraper webhook set — add it in ⚙ Customize → Scraper Webhook','info');
      return;
    }
    const kw=keyword.trim();
    const relevanceLanguage=LANG_CODES[language]||'';
    // Pagination memory: continue from where this keyword+language left off so
    // each run returns fresh channels (stored per browser).
    const pageKey='srPage2_'+kw.toLowerCase()+'|'+relevanceLanguage;
    let pageToken=''; try{ pageToken=localStorage.getItem(pageKey)||''; }catch(e){}
    // Pre-build the optional query fragment so Make just appends it (no fragile
    // conditional logic in the scenario). Empty when first page / all languages.
    const regionCode=REGION_CODES[language]||'';
    // Base query fragment (no publishedAfter / order=date — for type=channel
    // searches publishedAfter filters on the channel's CREATION date, which
    // restricted results to brand-new tiny channels; default relevance ordering
    // surfaces established channels). Language stays in-language via region.
    const baseExtra = relevanceLanguage
      ? ('&relevanceLanguage='+relevanceLanguage + (regionCode?'&regionCode='+regionCode:''))
      : '';
    // Use the rep's own YouTube API key so each rep has their own 10k/day quota.
    // Lookup order: localStorage → config (admin-managed, synced from Supabase)
    // → blank (Edge Function falls back to the shared key).
    let apiKey='';
    try{ apiKey=localStorage.getItem('ytKey_'+(currentUser&&currentUser.name||''))||''; }catch(e){}
    if(!apiKey) apiKey=(config.repApiKeys||{})[currentUser&&currentUser.name]||'';

    const br=FOLLOWER_BRACKETS.find(b=>b.v===minF)||FOLLOWER_BRACKETS[0];
    const isAnyBracket = !br.v;
    // Widen the bracket DOWN by one tier so channels just under the threshold
    // still count (e.g. "100K – 500K" also keeps 50K–100K). The upper bound is
    // unchanged. effMin = the previous tier's min.
    const brIdx=FOLLOWER_BRACKETS.indexOf(br);
    const effMin = (!isAnyBracket && brIdx>0) ? FOLLOWER_BRACKETS[brIdx-1].min : br.min;
    const rangeLabel = isAnyBracket ? '' : (fmtFollowers(effMin)+' – '+(br.max===Infinity?'∞':fmtFollowers(br.max)));
    // YouTube search can't filter by subscriber count, so we fetch channels and
    // bucket them client-side. One 50-channel page rarely holds enough matches
    // for a narrow bracket, so KEEP PAGING until we've collected TARGET in-bracket
    // channels or hit MAX_PAGES. "Any followers" needs only one page.
    const TARGET = 24;
    const MAX_PAGES = isAnyBracket ? 1 : 5;
    const buckets={kept:[],unknown:[],below:[],above:[]};
    let lastToken=pageToken, pagesFetched=0, totalItems=0, warned=false;

    setLoading(true);
    addToast('Running scraper…','info');
    try{
      for(let page=0; page<MAX_PAGES; page++){
        let extraQuery=baseExtra;
        if(lastToken) extraQuery+='&pageToken='+encodeURIComponent(lastToken);
        const payload={ type:'search', platform, keyword:kw, interest:'', language, relevanceLanguage, pageToken:lastToken, extraQuery, apiKey, minFollowers:parseFollowers(minF), maxFollowers:null, limit:50 };
        const r=await fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const text=await r.text();
        if(!r.ok){
          // Surface YouTube quota errors with the clean message from the Edge Function.
          let parsed=null; try{ parsed=JSON.parse(text); }catch(e){}
          if(parsed && parsed.quotaExceeded){ throw new Error(parsed.error||'YouTube API quota exceeded'); }
          if(parsed && parsed.error){ throw new Error(String(parsed.error).slice(0,300)); }
          throw new Error('HTTP '+r.status+(text&&text.trim()?' — '+text.replace(/\s+/g,' ').slice(0,140):''));
        }
        const nextToken=r.headers.get('X-Next-Page-Token')||'';
        const warning=r.headers.get('X-Scrape-Warning')||'';
        if(warning && !warned){ addToast('⚠ '+warning,'info'); warned=true; }
        if(!text || !text.trim()){
          if(page===0) addToast('Scraper returned an empty response — in n8n set Respond to Webhook → "Respond With: All Incoming Items" and connect it after Get dataset items','error');
          lastToken=nextToken; break;
        }
        let data;
        try{ data=JSON.parse(text); }
        catch(err){
          if(page===0){
            if(text.trim().toLowerCase()==='accepted') addToast('Make returned its default "Accepted" — add an Array Aggregator before the Webhook Response and have it return the JSON array (Content-Type: application/json)','error');
            else addToast('Scraper response was not valid JSON (got: '+text.slice(0,60)+'…)','error');
          }
          lastToken=nextToken; break;
        }
        const items=Array.isArray(data)?data:(data.results||data.items||data.data||[]);
        totalItems+=items.length;
        const mapped=items.map((it,i)=>mapDiscoveryResult(it,platform==='All'?null:platform,page*50+i));
        // Bucket each channel: in-bracket / unknown subs / below / above. Unknown
        // and out-of-band are dropped for a specific bracket; everything passes
        // for "Any followers".
        mapped.forEach(l=>{ const f=parseFollowers(l.followers); if(isAnyBracket){ buckets.kept.push(l); return; } if(!f){ buckets.unknown.push(l); return; } if(f<effMin){ buckets.below.push(l); } else if(f>=br.max){ buckets.above.push(l); } else { buckets.kept.push(l); } });
        lastToken=nextToken; pagesFetched++;
        if(buckets.kept.length>=TARGET) break;   // enough matches collected
        if(!nextToken) break;                     // no more pages from YouTube
      }
    }catch(e){
      setLoading(false);
      const cors=(e&&e.message||'').toLowerCase().includes('failed to fetch');
      addToast(cors
        ? 'Scrape blocked (CORS): the response is missing Access-Control-Allow-Origin. Make → add header key "Access-Control-Allow-Origin" = "*" in the Webhook Response module. n8n → set the Webhook node "Allowed Origins" to *.'
        : `Scrape failed: ${e.message}`,'error');
      return;
    }
    // Save the cursor so the next run continues deeper (fresh channels). Clear
    // when YouTube has no more pages so an identical search restarts from the top.
    try{ if(lastToken) localStorage.setItem(pageKey,lastToken); else localStorage.removeItem(pageKey); }catch(e){}

    const kept = buckets.kept;
    const skipped = buckets.unknown.length + buckets.below.length + buckets.above.length;
    const skipParts=[];
    if(buckets.unknown.length) skipParts.push(`${buckets.unknown.length} unknown subs`);
    if(buckets.below.length)   skipParts.push(`${buckets.below.length} below ${fmtFollowers(effMin)}`);
    if(buckets.above.length)   skipParts.push(`${buckets.above.length} above ${br.max===Infinity?br.label:fmtFollowers(br.max)}`);
    try{ console.log('[Enfinity scraper] pages:',pagesFetched,'items:',totalItems,'| kept:',kept.length,'| dropped:',skipParts,'| sample below:',buckets.below[0]?.channelName,buckets.below[0]?.followers,'| sample above:',buckets.above[0]?.channelName,buckets.above[0]?.followers); }catch(e){}

    // Flag channels already in the Close CRM. We KEEP them in the results (so
    // reps still see them) and tag them "Existing Leads" instead of dropping.
    const checkWh=(config.closeCheckWebhook||'').trim();
    const finish=(results,inClose)=>{
      if(onResults) onResults(results);
      const skipDetail = skipParts.length ? skipParts.join(', ') : `outside ${br.label}`;
      const closeNote = inClose ? ` · ${inClose} already in Close (tagged)` : '';
      const extra=(skipped?` · ${skipDetail}`:'')+closeNote;
      let emptyMsg;
      if(skipped && buckets.unknown.length===skipped) emptyMsg=`All ${skipped} channels came back with unknown subscriber counts (channels.list isn't enriching). Check your API key's Application Restrictions in Google Cloud Console — set them to "None" for server-side use.`;
      else if(skipped) emptyMsg=`No matches for ${br.label} across ${pagesFetched} page(s) (${skipDetail}). Try a wider bracket, a different keyword, or run again to page deeper.`;
      else emptyMsg='Scraper ran but returned 0 profiles';
      const okMsg = `✓ ${results.length} lead(s) scraped`+(rangeLabel?` (${rangeLabel})`:'')+extra;
      addToast(results.length ? okMsg : emptyMsg,'success');
    };
    if(checkWh && kept.length){
      try{
        const cr=await fetch(checkWh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leads:kept.map((l,i)=>({key:i,channelId:l.channelId,url:l.url,emails:l.emails}))})});
        const resp=await cr.json();
        const ex=new Set((resp&&resp.existing)||[]);
        // Tag the in-Close channels rather than dropping them.
        const tagged=kept.map((l,i)=> ex.has(i) ? {...l, tags:[...(l.tags||[]),'Existing Leads']} : l);
        finish(tagged, ex.size);
      }catch(e){ finish(kept,0); }
    } else { finish(kept,0); }
    setLoading(false);
  }

  const runBtn=(
    <button className="btn btn-primary btn-sm" onClick={scrape} disabled={loading} title="Run the scraper for the selected filters">
      {loading?'⏳ Scraping…':'▶ Run Scraper'}
    </button>
  );
  // YouTube API keys are managed centrally by the admin (Customize → Per-Rep
  // YouTube API Keys, persisted to Supabase). Reps never see a key prompt — the
  // key is loaded into config.repApiKeys on startup and used by scrape() silently.
  const scraperFilters=(
    <>
      <select value={platform} onChange={e=>setPlatform(e.target.value)} title="Platform">
        <option value="All">All Platforms</option>
        {PLATFORMS.map(p=><option key={p}>{p}</option>)}
      </select>
      <select value={minF} onChange={e=>setMinF(e.target.value)} title="Follower bracket">
        {FOLLOWER_BRACKETS.map(b=><option key={b.v||'any'} value={b.v}>{b.label}</option>)}
      </select>
      <select value={language} onChange={e=>setLanguage(e.target.value)} title="Language">
        {SCRAPER_LANGUAGES.map(l=><option key={l} value={l}>{l==='All'?'All Languages':l}</option>)}
      </select>
    </>
  );

  // A rep sees only the channels THEY scraped; admins see the whole queue.
  const myName=currentUser&&currentUser.name;
  const seeAll=isAdminUser(currentUser);
  const queue=leads.filter(l=>!hasStatusTag(l) && leadOrigin(l)!=='Imported' && (seeAll || l.scrapedBy===myName));
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
      <LeadsTable leads={queue} onEdit={onSave} onDelete={onDelete} onBulkDelete={onBulkDelete} onBulkAssign={onBulkAssign}
        showAssigned showCampaign showOrigin toolbarStart={runBtn} toolbarAfterSearch={scraperFilters}
        searchValue={keyword} onSearchChange={setKeyword} searchFilters={false} searchPlaceholder="Search query (sent to scraper)…"
        config={config} feats={feats} campColorMap={campColorMap} filename="scraper_queue" printTitle="Scraper Queue"/>
    </div>
  );
}

// ─── DUPLICATES VIEW ──────────────────────────────────────
// Surfaces channels that exist in more than one lead record — e.g. when two
// reps import the same channel from their own sheets. Each group lists every
// copy with its rep, so an admin can reassign or remove the extras.
function DuplicatesView({groups,config,onSave,onDelete,addToast}) {
  const reps=config.salesReps||[];
  const crossRep=groups.filter(g=>g.reps.length>=2).length;
  const totalRecords=groups.reduce((s,g)=>s+g.leads.length,0);

  if(groups.length===0){
    return (
      <div className="home-content">
        <div className="card"><div className="card-body" style={{textAlign:'center',padding:'48px 24px',color:'var(--text-dim)'}}>
          <div style={{fontSize:34,marginBottom:8}}>✓</div>
          <div style={{fontWeight:700,fontSize:16,color:'var(--text)'}}>No duplicate leads</div>
          <div style={{marginTop:4}}>No channel is currently held by more than one sales rep.</div>
        </div></div>
      </div>
    );
  }

  function reassign(l,rep){ if(onSave) onSave({...l,assignedTo:rep||null}); }
  function remove(l){ if(onDelete) onDelete(l.id); if(addToast) addToast(`Removed duplicate of "${l.channelName}"`,'success'); }

  return (
    <div className="home-content">
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:4}}>
        <div className="stat-card red"><div className="stat-label">Duplicate Channels</div><div className="stat-value">{groups.length}</div><div className="stat-sub">{totalRecords} lead records</div></div>
        <div className="stat-card orange"><div className="stat-label">Cross-Rep Conflicts</div><div className="stat-value">{crossRep}</div><div className="stat-sub">held by 2+ reps</div></div>
      </div>
      <div style={{padding:'10px 14px',borderRadius:10,background:'var(--warn-light,#FFF4E5)',color:'var(--warn,#B25E00)',fontSize:13,fontWeight:500}}>
        ⚠ These channels appear under more than one record. Reassign them to a single rep or remove the extras so two reps don't work the same lead.
      </div>

      {groups.map(g=>{
        const head=g.leads[0];
        const conflict=g.reps.length>=2;
        // Earliest-added record first, so the rep/import that got this channel
        // first is at the top. Leads with no known time sort last.
        const ordered=[...g.leads].sort((a,b)=>(leadAddedMs(a)||Infinity)-(leadAddedMs(b)||Infinity));
        const firstId=(ordered[0] && leadAddedMs(ordered[0])) ? ordered[0].id : null;
        return (
          <div className="card" key={g.key} style={{borderLeft:`3px solid ${conflict?'var(--danger,#DE350B)':'var(--warn,#FF8B00)'}`}}>
            <div className="card-header" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div className="card-title" style={{display:'flex',alignItems:'center',gap:8}}>
                {head.thumbnail
                  ? <img src={head.thumbnail} alt="" style={{width:26,height:26,borderRadius:'50%',objectFit:'cover'}}/>
                  : <div style={{width:26,height:26,borderRadius:'50%',background:'var(--accent-light)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700}}>{avatarLetter(head.channelName)}</div>}
                {head.channelName}
                <span style={{fontSize:12,fontWeight:500,color:'var(--text-dim)'}}>{PLATFORM_ICON[head.platform]||''} {head.platform} · {head.followers||'—'} followers</span>
              </div>
              <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                {conflict
                  ? <span style={{fontSize:11,fontWeight:700,color:'var(--danger,#DE350B)',background:'var(--danger-light,#FFEBE6)',padding:'3px 8px',borderRadius:20}}>⚠ {g.reps.length} reps</span>
                  : <span style={{fontSize:11,fontWeight:700,color:'var(--warn,#B25E00)',background:'var(--warn-light,#FFF4E5)',padding:'3px 8px',borderRadius:20}}>{g.leads.length} copies</span>}
              </div>
            </div>
            <div className="card-body" style={{padding:0,overflowX:'auto'}}>
              <table className="kpi-table">
                <thead><tr>
                  <th>Assigned To</th><th>Status</th><th>Campaign</th><th>Origin</th><th>Added</th><th>Date Assigned</th><th>Email(s)</th><th className="no-print">Action</th>
                </tr></thead>
                <tbody>
                  {ordered.map(l=>(
                    <tr key={l.id}>
                      <td>
                        <select value={l.assignedTo||''} onChange={e=>reassign(l,e.target.value)} style={{minWidth:120}}>
                          <option value="">Unassigned</option>
                          {reps.map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>{(l.tags||[]).length?l.tags.map(t=><TagBadge key={t} tag={t}/>):<span style={{color:'var(--text-dim)'}}>—</span>}</td>
                      <td>{(l.campaigns||[]).join(', ')||'—'}</td>
                      <td>{leadOrigin(l)}</td>
                      <td style={{whiteSpace:'nowrap',fontSize:12}}>
                        {l.id===firstId && <span title="Earliest record for this channel" style={{marginRight:6,fontSize:11,fontWeight:700,color:'var(--success,#006644)',background:'var(--success-light,#E3FCEF)',padding:'2px 6px',borderRadius:20}}>🥇 First</span>}
                        {fmtAddedAt(l)}
                      </td>
                      <td>{l.dateAssigned||'—'}</td>
                      <td style={{fontSize:12}}>{(l.emails||[]).join(', ')||'—'}</td>
                      <td className="no-print"><button className="btn btn-ghost btn-xs" title="Remove this duplicate record" onClick={()=>remove(l)}>🗑 Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── CAMPAIGN VIEW ────────────────────────────────────────
function CampaignView({campaign,campColor,leads,onSave,onBulkAssign,addToast,config}) {
  const filtered=leads.filter(l=>l.campaigns.includes(campaign.id));
  const [repFilter,setRepFilter]=useState('');
  const display=repFilter?filtered.filter(l=>l.assignedTo===repFilter):filtered;
  const feats=config.features||{};
  const campColorMap={};
  (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);

  function doExportCSV(){exportCSV(display,`${campaign.id}${repFilter?'_'+repFilter:''}_leads.csv`);addToast(`Exported ${display.length} leads as CSV`,'success');}
  function doExportPDF(){exportPDF();addToast('Printing PDF...','info');}

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      <div style={{background:'var(--card)',borderBottom:'1px solid var(--border)',padding:'10px 20px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
        <div style={{display:'flex',gap:6}}>
          <button className={`btn btn-sm ${!repFilter?'btn-primary':'btn-outline'}`} onClick={()=>setRepFilter('')}>All ({filtered.length})</button>
          {(config.salesReps||[]).map(r=>{const cnt=filtered.filter(l=>l.assignedTo===r).length;return(
            <button key={r} className={`btn btn-sm ${repFilter===r?'btn-primary':'btn-outline'}`} onClick={()=>setRepFilter(f=>f===r?'':r)}>
              {r} ({cnt})
            </button>
          );})}
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {feats.exportCSV && <button className="btn btn-outline btn-sm" onClick={doExportCSV}>⬇ CSV</button>}
          {feats.exportPDF && <button className="btn btn-outline btn-sm" onClick={doExportPDF}>🖨 PDF</button>}
        </div>
      </div>
      <LeadsTable leads={display} onEdit={l=>{}} onBulkAssign={onBulkAssign} showAssigned showCampaign={false} config={config} feats={feats} campColorMap={campColorMap} filename={`${campaign.id}_leads`} printTitle={`${campaign.label} Campaign Report`}/>
    </div>
  );
}

// ─── LEAD MGMT VIEW ───────────────────────────────────────
function LeadMgmtView({leads,onSave,onDelete,onBulkDelete,onBulkAssign,onClearAll,addToast,config}) {
  const [repView,setRepView]=useState('');
  const feats=config.features||{};
  const campColorMap={};
  (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);
  const all=(config.salesReps||[]);
  const unassigned=leads.filter(l=>!l.assignedTo);
  const display=repView==='unassigned'?unassigned:repView?leads.filter(l=>l.assignedTo===repView):leads;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      <div style={{background:'var(--card)',borderBottom:'1px solid var(--border)',padding:'12px 20px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0}} className="no-print">
        <button className={`btn btn-sm ${repView===''?'btn-primary':'btn-outline'}`} onClick={()=>setRepView('')}>All ({leads.length})</button>
        {all.map(r=>{const cnt=leads.filter(l=>l.assignedTo===r).length;return(
          <button key={r} className={`btn btn-sm ${repView===r?'btn-primary':'btn-outline'}`} onClick={()=>setRepView(v=>v===r?'':r)}>
            <div style={{width:16,height:16,borderRadius:'50%',background:'var(--accent)',color:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,marginRight:4}}>{r[0]}</div>
            {r} ({cnt})
          </button>
        );})}
        <button className={`btn btn-sm ${repView==='unassigned'?'btn-danger':'btn-outline'}`} onClick={()=>setRepView(v=>v==='unassigned'?'':' unassigned')} style={repView==='unassigned'?{}:{borderColor:'var(--warn)',color:'var(--warn)'}}>
          Unassigned ({unassigned.length})
        </button>
        {onClearAll && leads.length>0 && <button className="btn btn-sm" style={{marginLeft:'auto',background:'#DE350B',color:'#fff',borderColor:'#DE350B'}}
          onClick={()=>{ if(window.confirm(`Delete ALL ${leads.length} lead(s) from the dashboard and the shared database?\n\nThis cannot be undone.`)) onClearAll(); }}
          title="Permanently delete every lead">🗑 Clear ALL leads</button>}
      </div>
      <LeadsTable leads={display} onEdit={onSave} onDelete={onDelete} onBulkDelete={onBulkDelete} onBulkAssign={onBulkAssign} showAssigned showCampaign showOrigin config={config} feats={feats} campColorMap={campColorMap} filename="lead_management" printTitle="Lead Management Report"/>
    </div>
  );
}

// ─── HISTORY VIEW ─────────────────────────────────────────
function HistoryView({history,addToast,feats}) {
  return (
    <div className="history-list">
      {history.map(e=>(
        <div className="history-item" key={e.id}>
          <div className="history-icon-wrap">{e.icon}</div>
          <div className="history-text">{e.text}</div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
            <div className="history-time">{e.time}</div>
            {e.restorable && feats.historyRestore && <button className="btn btn-ghost btn-xs" onClick={()=>addToast('Action restored','success')}>↩ Restore</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SETTINGS DRAWER ──────────────────────────────────────
function SettingsDrawer({config,onConfig,onClose,addToast}) {
  const [local,setLocal]=useState(()=>JSON.parse(JSON.stringify(config)));
  const [newRep,setNewRep]=useState('');
  const [newTag,setNewTag]=useState('');
  const [newCamp,setNewCamp]=useState({label:'',color:'#1366D6'});
  function set(path,val){setLocal(prev=>{const n=JSON.parse(JSON.stringify(prev));const parts=path.split('.');let o=n;for(let i=0;i<parts.length-1;i++)o=o[parts[i]];o[parts[parts.length-1]]=val;return n;});}
  const [newRepRole,setNewRepRole]=useState('employee');
  function addRep(){
    const n=newRep.trim(); if(!n||local.salesReps.includes(n)) return;
    setLocal(l=>{
      const users=Array.isArray(l.users)?l.users:[];
      // Add to salesReps AND create a login user with the chosen role and a
      // default password 'Enfinity26' so the rep can log in immediately.
      // Admins can reset their password via the Reset Teammate's Password tool.
      const hasUser = users.some(u=>u.name===n);
      const nextUsers = hasUser ? users : [...users, { name:n, role:newRepRole, password:'Enfinity26' }];
      return { ...l, salesReps:[...l.salesReps, n], users: nextUsers };
    });
    setNewRep(''); setNewRepRole('employee');
  }
  function remRep(r){
    setLocal(l=>{
      const users=Array.isArray(l.users)?l.users:[];
      return { ...l, salesReps:l.salesReps.filter(x=>x!==r), users: users.filter(u=>u.name!==r) };
    });
  }
  function editRep(i,v){
    setLocal(l=>{
      const oldName=l.salesReps[i]; const a=[...l.salesReps]; a[i]=v;
      const users=Array.isArray(l.users)?l.users:[];
      // Rename the matching user too (if one exists) so login still works.
      const nextUsers = users.map(u=>u.name===oldName?{...u,name:v}:u);
      return { ...l, salesReps:a, users: nextUsers };
    });
  }
  function addTag(){const n=newTag.trim();if(!n||local.statusTags.includes(n))return;setLocal(l=>({...l,statusTags:[...l.statusTags,n]}));setNewTag('');}
  function remTag(t){setLocal(l=>({...l,statusTags:l.statusTags.filter(x=>x!==t)}));}
  function addCamp(){const lab=newCamp.label.trim().toUpperCase();if(!lab)return;setLocal(l=>({...l,campaigns:[...l.campaigns,{id:lab,label:lab,color:newCamp.color}]}));setNewCamp({label:'',color:'#1366D6'});}
  function remCamp(id){setLocal(l=>({...l,campaigns:l.campaigns.filter(c=>c.id!==id)}));}
  function updCampColor(id,col){setLocal(l=>({...l,campaigns:l.campaigns.map(c=>c.id===id?{...c,color:col}:c)}));}
  function apply(){onConfig(local);addToast('Settings saved','success');onClose();}
  function reset(){setLocal(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));}

  const TAB_META={home:{label:'Home',icon:'🏠'},scraper:{label:'Scraper',icon:'🔍'},history:{label:'History',icon:'📋'},'prev-scraped':{label:'Previously Scraped',icon:'💾'},'lead-mgmt':{label:'Lead Management',icon:'👥'},'google-import':{label:'Google Sheets Import',icon:'📊'},agency:{label:'Agency',icon:'🏢'},'close-data':{label:'Close Leads Data',icon:'☁️'},pending:{label:'Pending Qualification',icon:'⏳'},contacted:{label:'Contacted Leads',icon:'✉️'},recycle:{label:'For Recycle',icon:'♻️'},recent:{label:'Recently Assigned',icon:'🕐'},msn:{label:'MSN Tab',icon:'🔵'},vvv:{label:'VVV Tab',icon:'🟣'}};
  const COL_META={thumbnail:'Thumbnail',channelName:'Channel Name',url:'URL',platform:'Platform',niche:'Niche',followers:'Followers',emails:'Email(s)',tags:'Status Tags',campaign:'Campaign',assignedTo:'Assigned To',dateAssigned:'Date Assigned'};
  const FEAT_META={bulkAssign:{label:'Bulk Assign'},exportCSV:{label:'Export CSV'},exportPDF:{label:'Export PDF'},dailyRefresh:{label:'Daily Auto-Refresh'},colorHighlights:{label:'Campaign Color Rows'},webhookTrigger:{label:'n8n Webhook'},historyRestore:{label:'History Restore'},emailValidation:{label:'Email Validation (future)'}};

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}/>
      <div className="drawer">
        <div className="drawer-header">
          <h2>⚙️ Dashboard Customizer</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="drawer-section">
            <div className="drawer-section-title">Navigation Tabs <span style={{fontSize:9,opacity:.6}}>Show / Hide</span></div>
            {Object.entries(TAB_META).map(([id,m])=>(
              <div className="toggle-row" key={id}>
                <div className="toggle-label">{m.icon} {m.label}</div>
                <Toggle checked={!!local.tabs[id]} onChange={v=>set(`tabs.${id}`,v)}/>
              </div>
            ))}
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Table Columns</div>
            {Object.entries(COL_META).map(([id,label])=>(
              <div className="toggle-row" key={id}>
                <div className="toggle-label">{label}</div>
                <Toggle checked={!!local.columns[id]} onChange={v=>set(`columns.${id}`,v)}/>
              </div>
            ))}
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Features</div>
            {Object.entries(FEAT_META).map(([id,m])=>(
              <div className="toggle-row" key={id}>
                <div className="toggle-label">{m.label}</div>
                <Toggle checked={!!local.features[id]} onChange={v=>set(`features.${id}`,v)}/>
              </div>
            ))}
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Webhook URLs</div>
            <div className="edit-list">
              <div>
                <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>Scraper Webhook (n8n)</div>
                <input value={local.scrapeWebhook||''} onChange={e=>setLocal(l=>({...l,scrapeWebhook:e.target.value}))} placeholder="https://app.n8n.cloud/webhook/..." style={{width:'100%'}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>Close — Save Webhook (push leads → Close)</div>
                <input value={local.closeWebhook||''} onChange={e=>setLocal(l=>({...l,closeWebhook:e.target.value}))} placeholder="https://app.n8n.cloud/webhook/..." style={{width:'100%'}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>Close — Load Webhook (pull leads ← Close)</div>
                <input value={local.closeLoadWebhook||''} onChange={e=>setLocal(l=>({...l,closeLoadWebhook:e.target.value}))} placeholder="https://app.n8n.cloud/webhook/..." style={{width:'100%'}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>SmartReach Webhook (send prospects → SmartReach)</div>
                <input value={local.smartreachWebhook||''} onChange={e=>setLocal(l=>({...l,smartreachWebhook:e.target.value}))} placeholder="https://hook.eu1.make.com/..." style={{width:'100%'}}/>
              </div>
            </div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Campaigns</div>
            <div className="edit-list">
              {local.campaigns.map(c=>(
                <div className="edit-row" key={c.id}>
                  <input type="color" className="color-swatch" value={c.color} onChange={e=>updCampColor(c.id,e.target.value)}/>
                  <input value={c.label} readOnly style={{color:'var(--text-dim)',flex:1}}/>
                  <button className="btn btn-danger btn-xs" onClick={()=>remCamp(c.id)}>✕</button>
                </div>
              ))}
              <div className="edit-row">
                <input type="color" className="color-swatch" value={newCamp.color} onChange={e=>setNewCamp(n=>({...n,color:e.target.value}))}/>
                <input placeholder="Campaign name..." value={newCamp.label} onChange={e=>setNewCamp(n=>({...n,label:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&addCamp()} style={{flex:1}}/>
                <button className="btn btn-outline btn-xs" onClick={addCamp}>+ Add</button>
              </div>
            </div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Sales Reps</div>
            <div className="edit-list">
              {local.salesReps.map((r,i)=>{
                const user=(local.users||[]).find(u=>u.name===r);
                const role=user?user.role:'employee';
                return (
                  <div className="edit-row" key={i}>
                    <input value={r} onChange={e=>editRep(i,e.target.value)} style={{flex:1}}/>
                    <select value={role} onChange={e=>{ const v=e.target.value; setLocal(l=>({...l,users:(l.users||[]).map(u=>u.name===r?{...u,role:v}:u)})); }} style={{fontSize:11,padding:'5px 7px'}}>
                      <option value="employee">Sales</option>
                      <option value="leadgen">Leadgen</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="btn btn-danger btn-xs" onClick={()=>remRep(r)}>✕</button>
                  </div>
                );
              })}
              <div className="edit-row">
                <input placeholder="Add sales rep..." value={newRep} onChange={e=>setNewRep(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addRep()} style={{flex:1}}/>
                <select value={newRepRole} onChange={e=>setNewRepRole(e.target.value)} style={{fontSize:11,padding:'5px 7px'}} title="Role">
                  <option value="employee">Sales</option>
                  <option value="leadgen">Leadgen</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="btn btn-outline btn-xs" onClick={addRep}>+ Add</button>
              </div>
              <div style={{fontSize:10.5,color:'var(--text-light)',marginTop:8,lineHeight:1.5}}>New reps get the default password <b>Enfinity26</b> — they can change it after first login, or an admin can use “Reset Teammate's Password”.</div>
            </div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Rep Avatars <span style={{fontSize:9,opacity:.6}}>Photo · Color · Emoji</span></div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {local.salesReps.map(r=>{
                const color=(local.repColors||{})[r]||'#6366F1';
                const emoji=(local.repEmojis||{})[r]||'';
                const photo=(local.repPhotos||{})[r]||'';
                function setPhoto(val){setLocal(l=>({...l,repPhotos:{...(l.repPhotos||{}),[r]:val}}));}
                function handleFile(e){
                  const file=e.target.files[0];if(!file)return;
                  const reader=new FileReader();
                  reader.onload=ev=>setPhoto(ev.target.result);
                  reader.readAsDataURL(file);
                }
                return(
                  <div key={r} style={{background:'var(--bg)',borderRadius:'var(--radius)',padding:'10px 12px',display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{width:44,height:44,borderRadius:'50%',overflow:'hidden',flexShrink:0,background:color,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:18,border:'2px solid var(--border)'}}>
                      {photo?<img src={photo} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:(emoji||r[0].toUpperCase())}
                    </div>
                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                      <div style={{fontWeight:600,fontSize:13}}>{r}</div>
                      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                        <input type="color" className="color-swatch" value={color} title="Avatar color"
                          onChange={e=>setLocal(l=>({...l,repColors:{...(l.repColors||{}),[r]:e.target.value}}))}/>
                        <input value={emoji} onChange={e=>setLocal(l=>({...l,repEmojis:{...(l.repEmojis||{}),[r]:e.target.value}}))}
                          placeholder="emoji" style={{width:72,textAlign:'center',fontSize:15,padding:'4px 6px'}}/>
                        <label style={{cursor:'pointer',fontSize:11,padding:'5px 10px',borderRadius:'var(--radius)',border:'1px solid var(--border)',background:'var(--card)',color:'var(--text-dim)',whiteSpace:'nowrap'}}>
                          Upload photo
                          <input type="file" accept="image/*" style={{display:'none'}} onChange={handleFile}/>
                        </label>
                        {photo&&<button className="btn btn-danger btn-xs" onClick={()=>setPhoto('')}>Remove</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Per-Rep YouTube API Keys <span style={{fontSize:9,opacity:.6}}>Scraper quota</span></div>
            <div style={{fontSize:11,color:'var(--text-dim)',marginBottom:10,lineHeight:1.5}}>
              Each Google Cloud project gets its own <b>10,000 units/day</b> (~100 scraper searches). Give every rep their own key here so the team doesn't share one quota bucket. Blank = falls back to the shared default.
              <div style={{marginTop:6}}>
                <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>console.cloud.google.com</a> → new project → enable “YouTube Data API v3” → Credentials → Create API key → paste below.
              </div>
            </div>
            <div className="edit-list">
              {local.salesReps.map(r=>{
                const k=(local.repApiKeys||{})[r]||'';
                return (
                  <div className="edit-row" key={r}>
                    <div style={{width:88,fontSize:12,fontWeight:600,color:'var(--text)',flexShrink:0}}>{r}</div>
                    <input value={k} onChange={e=>setLocal(l=>({...l,repApiKeys:{...(l.repApiKeys||{}),[r]:e.target.value}}))} placeholder="AIza…   (paste rep's YouTube Data API key)" style={{flex:1,fontFamily:'monospace',fontSize:11.5}}/>
                    <span style={{fontSize:10,color:k?'var(--success)':'var(--text-light)',whiteSpace:'nowrap'}} title={k?'Personal key set':'Falls back to shared key'}>{k?'✓ personal':'shared'}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Status Tags</div>
            <div className="edit-list">
              {local.statusTags.map((t,i)=>(
                <div className="edit-row" key={i}>
                  <input value={t} readOnly style={{flex:1,color:'var(--text-dim)'}}/>
                  <button className="btn btn-danger btn-xs" onClick={()=>remTag(t)}>✕</button>
                </div>
              ))}
              <div className="edit-row">
                <input placeholder="Add tag..." value={newTag} onChange={e=>setNewTag(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTag()} style={{flex:1}}/>
                <button className="btn btn-outline btn-xs" onClick={addTag}>+ Add</button>
              </div>
            </div>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="btn btn-ghost btn-sm" onClick={reset}>↺ Reset</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" style={{marginLeft:'auto'}} onClick={apply}>✓ Apply Changes</button>
        </div>
      </div>
    </>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────
// Profile-picker login landing (design handoff). Pick your name → password
// overlay. Auth is unchanged: effectivePassword() check → onLogin(user).
// Shown when the app is opened via an emailed reset link (?reset=<token>).
function ResetPasswordScreen({token,onDone}) {
  const [pw,setPw]=useState(''); const [confirm,setConfirm]=useState('');
  const [status,setStatus]=useState('idle'); const [err,setErr]=useState('');
  function submit(e){
    e&&e.preventDefault();
    if(pw.length<4){ setErr('Password must be at least 4 characters.'); return; }
    if(pw!==confirm){ setErr('Passwords do not match.'); return; }
    if(!SB){ setErr('Reset isn’t available right now.'); return; }
    setStatus('loading'); setErr('');
    SB.rpc('reset_password_with_token',{p_token:token,p_new:pw})
      .then(({data,error})=>{ if(!error && data===true) setStatus('done'); else { setStatus('idle'); setErr('This reset link is invalid or has expired.'); } })
      .catch(()=>{ setStatus('idle'); setErr('Something went wrong — please try again.'); });
  }
  return (
    <div className="lg-root">
      <div className="lg-right" style={{flex:1}}>
        <div className="lg-right-inner" style={{maxWidth:400,margin:'auto'}}>
          <div className="lg-modal" style={{boxShadow:'0 18px 44px -18px rgba(20,18,40,.25)'}}>
            {status==='done' ? (
              <div className="lg-success">
                <div className="lg-check"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                <div className="lg-suc-t">Password updated</div>
                <div className="lg-suc-s">You can now sign in with your new password.</div>
                <button className="lg-signin" style={{marginTop:18}} onClick={onDone}>Go to sign in</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="lg-m-name">Set a new password</div>
                <div className="lg-m-as" style={{marginBottom:16}}>Choose a new password for your account.</div>
                <input type="password" className="lg-pw" placeholder="New password" value={pw} onChange={e=>{setPw(e.target.value);setErr('');}} disabled={status==='loading'} autoFocus/>
                <input type="password" className="lg-pw" style={{marginTop:10}} placeholder="Confirm new password" value={confirm} onChange={e=>{setConfirm(e.target.value);setErr('');}} disabled={status==='loading'}/>
                {err && <div className="lg-err">{err}</div>}
                <button type="submit" className="lg-signin" disabled={status==='loading'}>{status==='loading' ? <span className="lg-spin"/> : 'Update password'}</button>
                <button type="button" className="lg-backbtn" onClick={onDone}>← Back to sign in</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({config,onLogin}) {
  const users=config.users||[];
  const repColors=config.repColors||{};
  const colorFor=u=>repColors[u.name]||'#6366f1';
  const initial=u=>(u.name||'?')[0].toUpperCase();

  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const [pw,setPw]=useState('');
  const [err,setErr]=useState('');
  const [status,setStatus]=useState('idle');   // idle | loading | success
  const [note,setNote]=useState('');
  const [forgot,setForgot]=useState(false);     // forgot-password mode in the overlay
  const [fEmail,setFEmail]=useState('');
  const [fSending,setFSending]=useState(false);
  const [fMsg,setFMsg]=useState('');
  const pwRef=useRef(null);
  function sendReset(){
    const email=(fEmail||'').trim();
    if(!email){ setFMsg('Enter your email address.'); return; }
    setFSending(true); setFMsg('');
    const done=()=>{ setFSending(false); setFMsg('If that email is on file, a reset link is on its way — check your inbox.'); };
    if(SB){ SB.functions.invoke('request-password-reset',{body:{email}}).then(done).catch(done); }
    else { setFSending(false); setFMsg('Password reset isn’t available right now — ask an admin.'); }
  }

  const q=query.trim().toLowerCase();
  const match=u=>!q||(u.name||'').toLowerCase().includes(q);
  const admins=users.filter(u=>u.role==='admin'&&match(u));
  const members=users.filter(u=>u.role!=='admin'&&match(u));
  const noResults=admins.length===0&&members.length===0;

  function pick(u){ setSelected(u); setPw(''); setErr(''); setStatus('idle'); setForgot(false); setFMsg(''); setTimeout(()=>pwRef.current&&pwRef.current.focus(),60); }
  function back(){ setSelected(null); setPw(''); setErr(''); setStatus('idle'); setForgot(false); setFMsg(''); }
  function submit(e){
    e&&e.preventDefault();
    if(!selected||status!=='idle') return;
    setStatus('loading');
    const ok=(role)=>{ setStatus('success'); setTimeout(()=>onLogin({name:selected.name, role:role||selected.role}),850); };
    const bad=()=>{ setStatus('idle'); setErr('Incorrect password'); setPw(''); };
    // Fallback to the config/localStorage password (transition safety, e.g. if
    // Supabase is unreachable or a credential hasn't been migrated yet).
    const fallback=()=>{ if(pw===effectivePassword(selected)) ok(selected.role); else bad(); };
    if(SB){
      // Primary: server-side hashed verification (verify_login RPC).
      SB.rpc('verify_login',{p_name:selected.name,p_password:pw})
        .then(({data,error})=>{ if(!error && data && data.length) ok(data[0].role); else fallback(); })
        .catch(fallback);
    } else { fallback(); }
  }
  useEffect(()=>{
    if(!selected) return;
    const h=e=>{ if(e.key==='Escape'&&status==='idle') back(); };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[selected,status]);

  const Section=({label,list})=> !list.length ? null : (
    <>
      <div className="lg-section-head"><span className="lg-section-label">{label} · {list.length}</span><span className="lg-section-rule"/></div>
      <div className="lg-grid">
        {list.map(u=>(
          <div key={u.name} className="lg-card" tabIndex={0} role="button"
            onClick={()=>pick(u)} onKeyDown={e=>{if(e.key==='Enter')pick(u);}}>
            <div className="lg-avatar" style={{background:getProfile(u.name).photo?'transparent':colorFor(u),boxShadow:`0 6px 16px -6px ${colorFor(u)}`}}>
              {getProfile(u.name).photo ? <img src={getProfile(u.name).photo} alt={u.name}/> : initial(u)}
            </div>
            <div className="lg-card-name">{u.name}</div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="lg-root">
      <div className="lg-left">
        <div className="lg-glow lg-glow1"/><div className="lg-glow lg-glow2"/>
        <div className="lg-brand-top"><span className="lg-wordmark">Enfinity</span></div>
        <div className="lg-brand-mid">
          <span className="lg-pill"><span className="lg-pill-dot"/>Sales Dashboard</span>
          <h1 className="lg-hero">Welcome back.</h1>
          <p className="lg-subcopy">Pick your profile to jump straight back into your pipeline, deals, and daily numbers.</p>
        </div>
        <div className="lg-brand-foot">
          <span>© 2026 Enfinity, Inc.</span>
          <span className="lg-secured"><span className="lg-foot-dot"/>Secured workspace</span>
        </div>
      </div>

      <div className="lg-right">
        <div className="lg-right-inner">
          <h2 className="lg-r-head">Select your profile</h2>
          <p className="lg-r-sub">Tap your name to sign in to the dashboard.</p>
          <div className="lg-search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9c99a8" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search for your name…"/>
          </div>
          {noResults ? (
            <div className="lg-empty"><div className="lg-empty-t">No profile found</div><div className="lg-empty-s">Try a different name or ask an admin to add you.</div></div>
          ) : (
            <>
              <Section label="ADMINISTRATORS" list={admins}/>
              <Section label="TEAM MEMBERS" list={members}/>
            </>
          )}
          <div className="lg-foot-row">
            <span>Not on the list?</span>
            <button className="lg-sso" onClick={()=>setNote('SSO isn’t set up yet — pick your profile above to sign in.')}>Sign in with SSO →</button>
          </div>
          {note && <div className="lg-note">{note}</div>}
        </div>
      </div>

      {selected && (
        <div className="lg-ov" onClick={e=>{ if(e.target.classList.contains('lg-ov')&&status==='idle') back(); }}>
          <div className="lg-modal">
            {status==='success' ? (
              <div className="lg-success">
                <div className="lg-check"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                <div className="lg-suc-t">You're in, {selected.name}</div>
                <div className="lg-suc-s">Taking you to your dashboard…</div>
              </div>
            ) : forgot ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                <div className="lg-m-avatar" style={{background:colorFor(selected)}}>{initial(selected)}</div>
                <div className="lg-m-name">Forgot password?</div>
                <div className="lg-m-as" style={{marginBottom:18,lineHeight:1.55,maxWidth:300}}>Ask any admin to reset it for you — it's instant from <b>Settings → 🛠 Reset Teammate's Password</b>. They'll give you a new password you can change afterwards.</div>
                <button type="button" className="lg-signin" onClick={()=>{setForgot(false);setFMsg('');}}>Got it</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="lg-m-avatar" style={{background:getProfile(selected.name).photo?'transparent':colorFor(selected)}}>
                  {getProfile(selected.name).photo ? <img src={getProfile(selected.name).photo} alt={selected.name}/> : initial(selected)}
                </div>
                <div className="lg-m-as">Signing in as</div>
                <div className="lg-m-name">{selected.name}</div>
                <span className={`lg-badge ${selected.role==='admin'?'admin':(selected.role==='leadgen'?'leadgen':'sales')}`}>{selected.role==='admin'?'ADMIN':(selected.role==='leadgen'?'LEADGEN':'SALES')}</span>
                <input ref={pwRef} type="password" className="lg-pw" placeholder="Enter your password" value={pw}
                  onChange={e=>{setPw(e.target.value);setErr('');}} disabled={status==='loading'} autoFocus/>
                {err && <div className="lg-err">{err}</div>}
                <button type="submit" className="lg-signin" disabled={status==='loading'}>{status==='loading' ? <span className="lg-spin"/> : 'Sign in'}</button>
                <button type="button" className="lg-forgot-link" onClick={()=>{ setForgot(true); setFEmail(getProfile(selected.name).email||''); setFMsg(''); setErr(''); }}>Forgot password?</button>
                <button type="button" className="lg-backbtn" onClick={back}>← Back to profiles</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHANGE PASSWORD MODAL ────────────────────────────────
// Admin tool: reset a locked-out teammate's password. Authorized by the admin
// re-entering their OWN password (verified server-side in admin_set_password).
function AdminResetModal({admin,config,onClose,addToast}) {
  const users=config.users||[];
  const [target,setTarget]=useState('');
  const [newPw,setNewPw]=useState('');
  const [adminPw,setAdminPw]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  function gen(){ const s='abcdefghjkmnpqrstuvwxyz23456789'; let p=''; for(let i=0;i<10;i++) p+=s[Math.floor(Math.random()*s.length)]; setNewPw(p); setErr(''); }
  function submit(e){
    e&&e.preventDefault();
    if(!target){ setErr('Pick a teammate.'); return; }
    if(newPw.length<4){ setErr('New password must be at least 4 characters.'); return; }
    if(!adminPw){ setErr('Enter your admin password to confirm.'); return; }
    if(!SB){ setErr('Reset isn’t available right now.'); return; }
    setBusy(true); setErr('');
    SB.rpc('admin_set_password',{p_admin:admin.name,p_admin_pw:adminPw,p_target:target,p_new:newPw}).then(({data,error})=>{
      setBusy(false);
      if(!error && data===true){ addToast(`Password reset for ${target}`,'success'); onClose(); }
      else { setErr('Reset failed — check your admin password.'); }
    }).catch(()=>{ setBusy(false); setErr('Something went wrong — try again.'); });
  }
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:440}}>
        <div className="modal-header">
          <div><h2>Reset a teammate's password</h2><p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>For someone who's locked out — no email needed.</p></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group"><label className="form-label">Teammate</label>
            <select value={target} onChange={e=>{setTarget(e.target.value);setErr('');}}>
              <option value="">— select —</option>
              {users.filter(u=>u.name!==admin.name).map(u=><option key={u.name} value={u.name}>{u.name} ({u.role})</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">New password</label>
            <div style={{display:'flex',gap:6}}>
              <input value={newPw} onChange={e=>{setNewPw(e.target.value);setErr('');}} placeholder="new password" style={{flex:1}}/>
              <button type="button" className="btn btn-outline btn-sm" onClick={gen}>🎲 Generate</button>
            </div></div>
          <div className="form-group"><label className="form-label">Your admin password</label>
            <input type="password" value={adminPw} onChange={e=>{setAdminPw(e.target.value);setErr('');}} placeholder="confirm it's you"/></div>
          {err && <div className="login-err" style={{textAlign:'left'}}>{err}</div>}
          <div style={{fontSize:11,color:'var(--text-light)',lineHeight:1.5,background:'var(--bg)',padding:'8px 10px',borderRadius:'var(--radius)'}}>
            ⓘ Share the new password with {target||'them'} privately. They can change it themselves later via 🔑 Change Password.
          </div>
          <div className="modal-footer"><div/><div className="modal-footer-right">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy?'Resetting…':'Reset password'}</button>
          </div></div>
        </form>
      </div>
    </div>
  );
}

function ChangePasswordModal({user,onClose,addToast}) {
  const [cur,setCur]=useState('');
  const [next,setNext]=useState('');
  const [confirm,setConfirm]=useState('');
  const [err,setErr]=useState('');
  const hasOverride=(()=>{try{return localStorage.getItem(pwKey(user.name))!=null;}catch(e){return false;}})();

  function submit(e){
    e&&e.preventDefault();
    if(next.length<4){ setErr('New password must be at least 4 characters'); return; }
    if(next!==confirm){ setErr('New passwords do not match'); return; }
    // Local fallback (per-device) if Supabase is unavailable.
    const localSave=()=>{
      if(cur!==effectivePassword(user)){ setErr('Current password is incorrect'); return; }
      try{ localStorage.setItem(pwKey(user.name),next); }catch(e){ setErr('Could not save password'); return; }
      addToast('Password updated on this device','success'); onClose();
    };
    if(SB){
      SB.rpc('set_password',{p_name:user.name,p_old:cur,p_new:next}).then(({data,error})=>{
        if(!error && data===true){ addToast('Password updated','success'); onClose(); }
        else if(!error && data===false){ setErr('Current password is incorrect'); }
        else { localSave(); }
      }).catch(localSave);
      return;
    }
    localSave();
  }
  function resetToDefault(){
    try{ localStorage.removeItem(pwKey(user.name)); }catch(e){}
    addToast('Password reset to the default from config.js','info');
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:420}}>
        <div className="modal-header">
          <div>
            <h2>Change Password</h2>
            <p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>{user.name} · {user.role}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group"><label className="form-label">Current Password</label>
            <input type="password" value={cur} onChange={e=>{setCur(e.target.value);setErr('');}} autoFocus/></div>
          <div className="form-group"><label className="form-label">New Password</label>
            <input type="password" value={next} onChange={e=>{setNext(e.target.value);setErr('');}}/></div>
          <div className="form-group"><label className="form-label">Confirm New Password</label>
            <input type="password" value={confirm} onChange={e=>{setConfirm(e.target.value);setErr('');}}/></div>
          {err && <div className="login-err" style={{textAlign:'left'}}>{err}</div>}
          <div style={{fontSize:11,color:'var(--text-light)',lineHeight:1.5,background:'var(--bg)',padding:'8px 10px',borderRadius:'var(--radius)'}}>
            ⓘ Your new password is saved in <b>this browser only</b> — there's no server to sync it. On another device you'll still use the default until you change it there too.
          </div>
          <div className="modal-footer">
            <div>{hasOverride && <button type="button" className="btn btn-ghost btn-sm" onClick={resetToDefault}>↺ Reset to default</button>}</div>
            <div className="modal-footer-right">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Password</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── EDIT PROFILE MODAL ───────────────────────────────────
// Photo + title/email/birthday for a user. Photo is resized to a 240px square
// JPEG and stored (with the other fields) per-browser in localStorage.
function ProfileModal({user,config,onClose,addToast}) {
  const name=user.name;
  const ex=getProfile(name);
  const color=(config.repColors||{})[name]||'#6366F1';
  const [photo,setPhoto]=useState(ex.photo||'');
  const [title,setTitle]=useState(ex.title||'');
  const [email,setEmail]=useState(ex.email||'');
  const [birthday,setBirthday]=useState(ex.birthday||'');
  const [links,setLinks]=useState(Array.isArray(ex.links)?ex.links:[]);
  const fileRef=useRef(null);
  const LINK_PRESETS=['Instagram','TikTok','YouTube','LinkedIn','X / Twitter','Facebook','Website','Calendly'];
  function addLink(label){ setLinks(ls=>[...ls,{label:label||'',url:''}]); }
  function updLink(i,k,v){ setLinks(ls=>ls.map((l,j)=>j===i?{...l,[k]:v}:l)); }
  function delLink(i){ setLinks(ls=>ls.filter((_,j)=>j!==i)); }

  function onFile(e){
    const f=e.target.files&&e.target.files[0]; if(e.target) e.target.value='';
    if(!f) return;
    if(!/^image\//.test(f.type)){ addToast('Please choose an image file','error'); return; }
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        // center-crop to a square and downscale to 240px to keep localStorage small
        const S=240, c=document.createElement('canvas'); c.width=S; c.height=S;
        const ctx=c.getContext('2d');
        const m=Math.min(img.width,img.height), sx=(img.width-m)/2, sy=(img.height-m)/2;
        ctx.drawImage(img,sx,sy,m,m,0,0,S,S);
        try{ setPhoto(c.toDataURL('image/jpeg',0.82)); }catch(err){ addToast('Could not process that image','error'); }
      };
      img.onerror=()=>addToast('Could not load that image','error');
      img.src=reader.result;
    };
    reader.readAsDataURL(f);
  }
  function save(e){
    e&&e.preventDefault();
    const cleanLinks=links.map(l=>({label:(l.label||'').trim(),url:(l.url||'').trim()}))
      .filter(l=>l.url)
      .map(l=>({label:l.label||l.url.replace(/^https?:\/\//,'').split('/')[0], url:/^https?:\/\//i.test(l.url)?l.url:'https://'+l.url}));
    saveProfileData(name,{photo,title:title.trim(),email:email.trim(),birthday,links:cleanLinks});
    addToast('Profile saved','success');
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:440}}>
        <div className="modal-header">
          <div>
            <h2>Edit Profile</h2>
            <p style={{color:'var(--text-dim)',fontSize:13,marginTop:3}}>{name} · {user.role}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{fontSize:16,padding:'4px 8px'}}>✕</button>
        </div>
        <form onSubmit={save} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div className="rep-avatar" style={{width:72,height:72,background:photo?'transparent':color,color:'#fff',fontSize:28,flexShrink:0}}>
              {photo ? <img src={photo} alt={name}/> : name[0].toUpperCase()}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={onFile}/>
              <button type="button" className="btn btn-outline btn-sm" onClick={()=>fileRef.current&&fileRef.current.click()}>📷 {photo?'Change photo':'Upload photo'}</button>
              {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setPhoto('')}>Remove photo</button>}
            </div>
          </div>
          <div className="form-group"><label className="form-label">Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Senior Sales Rep" autoFocus/></div>
          <div className="form-group"><label className="form-label">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@enfinity.co"/></div>
          <div className="form-group"><label className="form-label">Birthday</label>
            <input type="date" value={birthday} onChange={e=>setBirthday(e.target.value)}/></div>
          <div className="form-group">
            <label className="form-label">Links &amp; Socials <span style={{fontWeight:400,color:'var(--text-light)'}}>— quick shortcuts</span></label>
            {links.map((l,i)=>(
              <div key={i} style={{display:'flex',gap:6,marginBottom:6}}>
                <input value={l.label} onChange={e=>updLink(i,'label',e.target.value)} placeholder="Label" style={{flex:'0 0 34%'}}/>
                <input value={l.url} onChange={e=>updLink(i,'url',e.target.value)} placeholder="https://…" style={{flex:1}}/>
                <button type="button" className="btn btn-ghost btn-sm" onClick={()=>delLink(i)} title="Remove link">✕</button>
              </div>
            ))}
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
              {LINK_PRESETS.map(p=><button type="button" key={p} className="btn btn-outline btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>addLink(p)}>+ {p}</button>)}
            </div>
          </div>
          <div style={{fontSize:11,color:'var(--text-light)',lineHeight:1.5,background:'var(--bg)',padding:'8px 10px',borderRadius:'var(--radius)'}}>
            ⓘ Saved to your <b>team profile</b> (shared across devices). Title, email, birthday &amp; links show on your profile card.
          </div>
          <div className="modal-footer">
            <div/>
            <div className="modal-footer-right">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Profile</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── GLOBAL SEARCH (command palette) ──────────────────────
function GlobalSearch({leads,config,isAdmin,onClose,onNavigate,onOpenRep,onOpenLead,onOpenSettings,onOpenChangePw,onToggleDark,onLogout}) {
  const [q,setQ]=useState('');
  const inputRef=useRef(null);
  useEffect(()=>{
    inputRef.current&&inputRef.current.focus();
    function key(e){ if(e.key==='Escape') onClose(); }
    document.addEventListener('keydown',key);
    return()=>document.removeEventListener('keydown',key);
  },[]);
  const ql=q.trim().toLowerCase();
  const match=s=>String(s||'').toLowerCase().includes(ql);

  // Pages
  const PAGE_DEFS=[
    {id:'home',label:'Home',icon:'⊟'},{id:'scraper',label:'Scraper',icon:'◎'},
    {id:'history',label:'History',icon:'◷'},{id:'prev-scraped',label:'Previously Scraped',icon:'◈'},
    {id:'lead-mgmt',label:'Lead Management',icon:'◉'},{id:'google-import',label:'Google Sheets Import',icon:'◫'},
    {id:'agency',label:'Agency Folders',icon:'▦'},
    {id:'close-data',label:'Close Leads Data',icon:'☁'},
    {id:'pending',label:'Pending Qualification',icon:'◔'},
    {id:'contacted',label:'Contacted Leads',icon:'✉'},{id:'recycle',label:'For Recycle',icon:'↻'},
    {id:'recent',label:'Recently Assigned',icon:'◑'},
  ].filter(p=>(config.tabs||{})[p.id]);
  (config.campaigns||[]).forEach(c=>PAGE_DEFS.push({id:c.id.toLowerCase(),label:`${c.label} Campaign`,icon:'●'}));
  const pages=PAGE_DEFS.filter(p=>!ql||match(p.label)).map(p=>({...p,kind:'Pages',run:()=>{onNavigate(p.id);onClose();}}));

  const reps=(config.salesReps||[]).filter(r=>!ql||match(r)).map(r=>({label:`${r}'s Dashboard`,icon:'👤',kind:'Sales Reps',run:()=>{onOpenRep(r);onClose();}}));

  const leadHits=(!ql?[]:leads.filter(l=>match(l.channelName)||match(l.niche)||match(l.platform)||(l.emails||[]).some(match)).slice(0,8))
    .map(l=>({label:l.channelName,lead:l,kind:'Leads',run:()=>{onOpenLead(l);onClose();}}));

  const ACTION_DEFS=[
    ...(isAdmin?[{label:'Open Customize / Settings',icon:'⚙',run:()=>{onOpenSettings();onClose();}}]:[]),
    {label:'Change Password',icon:'🔑',run:()=>{onOpenChangePw();onClose();}},
    {label:'Toggle Dark Mode',icon:'🌙',run:()=>{onToggleDark();onClose();}},
    {label:'Logout',icon:'⎋',run:()=>{onLogout();onClose();}},
  ];
  const actions=ACTION_DEFS.filter(a=>!ql||match(a.label)).map(a=>({...a,kind:'Actions'}));

  const groups=[['Leads',leadHits],['Pages',pages],['Sales Reps',reps],['Actions',actions]].filter(([,arr])=>arr.length);
  const flat=groups.flatMap(([,arr])=>arr);

  function onKeyDown(e){ if(e.key==='Enter'&&flat.length){ e.preventDefault(); flat[0].run(); } }

  return (
    <div className="cmdk-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="cmdk">
        <div className="cmdk-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search pages, leads, reps, settings…"/>
          <span className="cmdk-esc">ESC</span>
        </div>
        <div className="cmdk-results">
          {flat.length===0 && <div className="cmdk-empty">No matches{ql?` for “${q}”`:''}</div>}
          {groups.map(([name,arr])=>(
            <div key={name} className="cmdk-group">
              <div className="cmdk-group-label">{name}</div>
              {arr.map((it,i)=>{
                const active=flat[0]===it;
                if(it.lead){
                  const l=it.lead;
                  return (
                    <div key={i} className={`cmdk-item cmdk-lead${active?' cmdk-active':''}`} onClick={it.run}>
                      <div className="cmdk-lead-av">{avatarLetter(l.channelName)}</div>
                      <div className="cmdk-lead-main">
                        <div className="cmdk-lead-name">{l.channelName}
                          <span className="cmdk-lead-plat">{PLATFORM_ICON[l.platform]||''} {l.platform}</span>
                        </div>
                        <div className="cmdk-lead-meta">
                          {l.niche||'—'} · {l.followers||'—'} followers · {l.assignedTo?('@'+l.assignedTo):'Unassigned'}
                          {leadOrigin(l)==='Fresh'?' · Fresh':' · Imported'}
                        </div>
                        {(l.tags||[]).length>0 && <div className="cmdk-lead-tags">
                          {l.tags.slice(0,4).map(t=>{ const c=TAG_COLORS[t]||{bg:'#F0F2F5',color:'#68737D'}; return <span key={t} style={{background:c.bg,color:c.color}}>{t==='HT'?'⚡ HT':t}</span>; })}
                        </div>}
                      </div>
                      <span className="cmdk-kind">Open ↵</span>
                    </div>
                  );
                }
                return (
                  <div key={i} className={`cmdk-item${active?' cmdk-active':''}`} onClick={it.run}>
                    <span className="cmdk-icon">{it.icon}</span>
                    <span className="cmdk-label">{it.label}{it.sub&&<span className="cmdk-sub"> — {it.sub}</span>}</span>
                    <span className="cmdk-kind">{it.kind}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot"><b>Enter</b> to open first result · <b>Esc</b> to close</div>
      </div>
    </div>
  );
}

// ─── AGENCY VIEW ──────────────────────────────────────────
// Per-rep "agency folders": when a rep closes an agency, they create a folder
// named after it and drop the relevant leads in. Folders are owned by the
// logged-in user (admins see everyone's). Membership is stored by stable
// leadKey, and the whole set is persisted to localStorage, so folders survive
// reloads even though the in-memory leads do not.
function AgencyView({agencies,setAgencies,leads,config,currentUser,isAdmin,addToast,onImportSheet}) {
  const myName=currentUser?currentUser.name:'';
  const [newName,setNewName]=useState('');
  const [sheetUrl,setSheetUrl]=useState('');
  const [importing,setImporting]=useState(false);
  const visible=isAdmin?agencies:agencies.filter(a=>a.owner===myName);

  // Fetch + parse the sheet tab named exactly like a folder. Throws if the tab
  // is missing/empty so callers can report it.
  async function fetchFolderLeads(id, f, idBase){
    const {headers,rows}=await gsFetchTableByName(id, f.name);
    const data=(rows||[]).filter(r=>r.some(c=>String(c).trim()));
    if(!headers.length || !data.length) throw new Error('empty tab');
    const defaultRep=(config.salesReps||[]).includes(f.owner)?f.owner:null;
    const newLeads=gsRowsToLeads(data, gsAutoMap(headers), idBase||Date.now(), defaultRep);
    if(!newLeads.length) throw new Error('no leads');
    return newLeads;
  }

  // Bulk import: every visible folder pulls its matching tab. Tabs with no
  // matching folder are ignored; folders with no matching tab are reported.
  async function importFromSheets(){
    const id=gsExtractId(sheetUrl.trim());
    if(!id){ addToast('Paste a valid Google Sheets URL','error'); return; }
    if(!visible.length){ addToast('Create an agency folder first, then import','info'); return; }
    setImporting(true);
    let added=0, matched=0, idx=0; const misses=[];
    for(const f of visible){
      try{
        const newLeads=await fetchFolderLeads(id, f, Date.now()+(idx++)*100000);
        if(onImportSheet) onImportSheet(f.id, newLeads);
        added+=newLeads.length; matched++;
      }catch(e){ misses.push(f.name); }
    }
    setImporting(false);
    if(matched) addToast(`Imported ${added} lead(s) into ${matched} folder(s)${misses.length?` · no matching tab: ${misses.join(', ')}`:''}`,'success');
    else addToast(`No matching tabs found. Name a sheet tab exactly like a folder${misses.length?` (tried: ${misses.join(', ')})`:''}.`,'error');
  }

  // Import a single folder's tab (the per-folder button).
  async function importOneFolder(f){
    const id=gsExtractId(sheetUrl.trim());
    if(!id){ addToast('Paste a Google Sheets URL in the import box above first','error'); return; }
    setImporting(true);
    try{
      const newLeads=await fetchFolderLeads(id, f);
      if(onImportSheet) onImportSheet(f.id, newLeads);
      addToast(`Imported ${newLeads.length} lead(s) into "${f.name}"`,'success');
    }catch(e){ addToast(`No matching tab "${f.name}" found in that sheet`,'error'); }
    finally{ setImporting(false); }
  }

  function createFolder(){
    const n=newName.trim();
    if(!n){ addToast('Enter an agency name','error'); return; }
    if(agencies.some(a=>a.owner===myName && (a.name||'').toLowerCase()===n.toLowerCase())){ addToast('You already have a folder with that name','error'); return; }
    const id='ag_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
    setAgencies(a=>[...a,{id,name:n,owner:myName,leadKeys:[],createdAt:new Date().toISOString()}]);
    setNewName(''); addToast(`Agency folder "${n}" created`,'success');
  }
  function updateFolder(id,patch){ setAgencies(a=>a.map(f=>f.id===id?{...f,...patch}:f)); }
  function deleteFolder(id){ const f=agencies.find(x=>x.id===id); setAgencies(a=>a.filter(x=>x.id!==id)); if(f) addToast(`Deleted agency "${f.name}"`,'error'); }

  return (
    <div className="home-content">
      <div className="card">
        <div className="card-header"><div className="card-title">🏢 Agency Folders</div></div>
        <div className="card-body" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createFolder();}}
            placeholder="New agency name (e.g. Acme Media)"
            style={{padding:'7px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,background:'var(--bg)',color:'var(--text)',minWidth:240}}/>
          <button className="btn btn-primary btn-sm" onClick={createFolder}>＋ Add Agency Folder</button>
          <span style={{fontSize:12,color:'var(--text-dim)',marginLeft:'auto'}}>
            {isAdmin?'Admin view — showing every rep’s agencies':`Signed in as ${myName} — these folders are yours`}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">📥 Bulk Import from Google Sheets</div></div>
        <div className="card-body" style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <input value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!importing)importFromSheets();}}
              placeholder="Paste a public Google Sheets URL"
              style={{padding:'7px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,background:'var(--bg)',color:'var(--text)',flex:1,minWidth:260}}/>
            <button className="btn btn-primary btn-sm" disabled={importing} onClick={importFromSheets}>{importing?'Importing…':'⇪ Import by Tab Name'}</button>
          </div>
          <div style={{fontSize:12,color:'var(--text-dim)'}}>
            Name each tab in the sheet exactly like one of your agency folders below. Every tab whose name
            matches a folder is imported straight into that folder. (Tab names must match the folder name — spaces and capitalization included.)
            The sheet must be shared as “Anyone with the link can view.”
          </div>
        </div>
      </div>

      {visible.length===0 &&
        <div className="card"><div className="card-body" style={{textAlign:'center',color:'var(--text-dim)',padding:'40px 24px'}}>
          <div style={{fontSize:30,marginBottom:6}}>🏢</div>
          <div style={{fontWeight:700,color:'var(--text)'}}>No agency folders yet</div>
          <div style={{marginTop:4}}>Closed an agency? Add a folder above and drop its leads in.</div>
        </div></div>}
      {visible.map(f=>(
        <AgencyFolder key={f.id} folder={f} leads={leads} config={config} isAdmin={isAdmin}
          canEdit={isAdmin||f.owner===myName} onUpdate={updateFolder} onDelete={deleteFolder} addToast={addToast}
          onImportTab={()=>importOneFolder(f)} importing={importing} sheetReady={!!sheetUrl.trim()}/>
      ))}
    </div>
  );
}

function AgencyFolder({folder,leads,config,isAdmin,canEdit,onUpdate,onDelete,addToast,onImportTab,importing,sheetReady}) {
  const [open,setOpen]=useState(false);   // collapsed by default — click the header to open
  const [renaming,setRenaming]=useState(false);
  const [nameDraft,setNameDraft]=useState(folder.name);
  const [pick,setPick]=useState('');
  const campColorMap={}; (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);
  const keys=folder.leadKeys||[];
  const members=leads.filter(l=>leadKey(l) && keys.includes(leadKey(l)));
  // Candidate leads to add: the owner's own leads not already in the folder
  // (falls back to all leads for an admin whose name isn't a sales rep).
  const ownerLeads=leads.filter(l=>leadKey(l) && !keys.includes(leadKey(l)) && l.assignedTo===folder.owner);
  const candidates=(ownerLeads.length||!isAdmin)?ownerLeads:leads.filter(l=>leadKey(l) && !keys.includes(leadKey(l)));

  function addLead(){ if(!pick||keys.includes(pick)) return; onUpdate(folder.id,{leadKeys:[...keys,pick]}); setPick(''); addToast('Lead added to agency','success'); }
  function removeLead(l){ onUpdate(folder.id,{leadKeys:keys.filter(k=>k!==leadKey(l))}); }
  function saveName(){ const n=nameDraft.trim(); if(!n){ setNameDraft(folder.name); setRenaming(false); return; } onUpdate(folder.id,{name:n}); setRenaming(false); }

  return (
    <div className="card" style={{borderLeft:'3px solid var(--accent)'}}>
      <div className="card-header" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div className="card-title" style={{display:'flex',alignItems:'center',gap:8,cursor:renaming?'default':'pointer',userSelect:'none'}}
          onClick={()=>{ if(!renaming) setOpen(o=>!o); }}
          title={renaming?undefined:(open?'Click to collapse':'Click to open folder')}>
          <span style={{fontSize:11,color:'var(--text-dim)',width:10,display:'inline-block',transition:'transform .15s',transform:open?'rotate(90deg)':'none'}}>▶</span>
          <span>{open?'📂':'🗂'}</span>
          {renaming
            ? <input value={nameDraft} autoFocus onClick={e=>e.stopPropagation()} onChange={e=>setNameDraft(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')saveName();if(e.key==='Escape'){setNameDraft(folder.name);setRenaming(false);}}}
                style={{padding:'4px 8px',border:'1px solid var(--border)',borderRadius:6,fontSize:14,background:'var(--bg)',color:'var(--text)'}}/>
            : <span>{folder.name}</span>}
          <span style={{fontSize:11,fontWeight:500,color:'var(--text-dim)'}}>· {members.length} lead{members.length!==1?'s':''}</span>
          {isAdmin && <span style={{fontSize:10,fontWeight:700,color:'var(--accent)',background:'var(--accent-light)',padding:'2px 7px',borderRadius:20}}>@{folder.owner}</span>}
        </div>
        {canEdit && <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button className="btn btn-outline btn-xs" disabled={importing||!sheetReady}
            title={sheetReady?`Import the sheet tab named "${folder.name}" into this folder`:'Paste a Google Sheets URL in the import box above first'}
            onClick={onImportTab}>⇪ Import tab</button>
          {renaming
            ? <button className="btn btn-primary btn-xs" onClick={saveName}>Save</button>
            : <button className="btn btn-ghost btn-xs" onClick={()=>{setNameDraft(folder.name);setRenaming(true);}}>✎ Rename</button>}
          <button className="btn btn-ghost btn-xs" title="Delete this agency folder" onClick={()=>onDelete(folder.id)}>🗑 Delete</button>
        </div>}
      </div>
      {open && <div className="card-body" style={{padding:0,overflowX:'auto'}}>
        {canEdit && <div style={{display:'flex',gap:8,alignItems:'center',padding:'10px 14px',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
          <select value={pick} onChange={e=>setPick(e.target.value)}
            style={{padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontSize:12,background:'var(--bg)',color:'var(--text)',minWidth:220,maxWidth:360}}>
            <option value="">{candidates.length?'Select a lead to add…':'No leads available to add'}</option>
            {candidates.map(l=><option key={leadKey(l)} value={leadKey(l)}>{l.channelName}{l.assignedTo?` · @${l.assignedTo}`:''}{(l.campaigns||[]).length?` · ${l.campaigns.join('/')}`:''}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" disabled={!pick} onClick={addLead}>＋ Add Lead</button>
        </div>}
        <table className="kpi-table">
          <thead><tr>
            <th>Channel</th><th>Platform</th><th>Status</th><th>Campaign</th><th>Assigned</th><th>Email(s)</th>{canEdit&&<th className="no-print">Action</th>}
          </tr></thead>
          <tbody>
            {members.length===0 && <tr><td colSpan={canEdit?7:6} style={{textAlign:'center',padding:24,color:'var(--text-dim)'}}>No leads in this agency yet.</td></tr>}
            {members.map(l=>(
              <tr key={l.id}>
                <td style={{fontWeight:600}}>{l.channelName}</td>
                <td style={{whiteSpace:'nowrap'}}>{PLATFORM_ICON[l.platform]||''} {l.platform}</td>
                <td>{(l.tags||[]).length?l.tags.map(t=><TagBadge key={t} tag={t}/>):<span style={{color:'var(--text-dim)'}}>—</span>}</td>
                <td style={{whiteSpace:'nowrap'}}>{(l.campaigns||[]).map(c=><span key={c} style={{color:campColorMap[c]||'var(--accent)',fontWeight:700,marginRight:4}}>● {c}</span>)}{(l.campaigns||[]).length?'':'—'}</td>
                <td>{l.assignedTo||<span style={{color:'var(--text-dim)'}}>—</span>}</td>
                <td style={{fontSize:12}}>{(l.emails||[]).join(', ')||'—'}</td>
                {canEdit&&<td className="no-print"><button className="btn btn-ghost btn-xs" title="Remove from this agency" onClick={()=>removeLead(l)}>✕ Remove</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────
function App() {
  const [tab,setTab]=useState('home');
  const [leads,setLeads]=useState(SAMPLE_LEADS);
  const [leadsReady,setLeadsReady]=useState(false);   // Supabase leads loaded
  const supabaseHadLeadsRef=useRef(false);
  const leadsSyncRef=useRef({});                       // {id: JSON} last synced
  const [history,setHistory]=useState(SAMPLE_HISTORY);
  const [toasts,setToasts]=useState([]);
  const [config,setConfig]=useState(DEFAULT_CONFIG);
  const [showSettings,setShowSettings]=useState(false);
  const [activeRep,setActiveRep]=useState(()=>localStorage.getItem('activeRep')||null);
  const [showRepSelect,setShowRepSelect]=useState(false);
  const [darkMode,setDarkMode]=useState(()=>localStorage.getItem('darkMode')==='true');
  const [currentUser,setCurrentUser]=useState(()=>{ try{return JSON.parse(localStorage.getItem('currentUser')||'null');}catch(e){return null;} });
  // Agency folders (per-rep). Persisted to localStorage — membership is by
  // stable leadKey, so folders survive reloads even though leads are in-memory.
  const [agencies,setAgencies]=useState(()=>{ try{return JSON.parse(localStorage.getItem('agencies')||'[]');}catch(e){return [];} });
  const [showChangePw,setShowChangePw]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [showAdminReset,setShowAdminReset]=useState(false);
  const [profileTick,setProfileTick]=useState(0);  // bumped once Supabase profiles load
  const [replies,setReplies]=useState(()=>(typeof SAMPLE_REPLIES!=='undefined'?SAMPLE_REPLIES:[]).map(normalizeReply));
  const [showBell,setShowBell]=useState(false);
  const [repliesLoading,setRepliesLoading]=useState(false);
  const [bellScope,setBellScope]=useState('mine'); // admins can flip to 'all' to see everyone's
  const [navCollapsed,setNavCollapsed]=useState(()=>{ try{ return localStorage.getItem('navCollapsed')!=='0'; }catch(e){ return true; } });
  useEffect(()=>{ try{ localStorage.setItem('navCollapsed',navCollapsed?'1':'0'); }catch(e){} },[navCollapsed]);
  const [leaves,setLeaves]=useState([]);
  useEffect(()=>{ if(SB) loadLeavesFromSupabase().then(setLeaves); },[]);
  const [sessions,setSessions]=useState([]);
  const sessionIdRef=useRef(null);
  useEffect(()=>{ if(SB) loadSessionsFromSupabase().then(setSessions); },[]);
  const [kb,setKb]=useState([]);
  useEffect(()=>{ if(SB) loadKbFromSupabase().then(setKb); },[]);
  function addKb(link){
    if(!SB){ addToast('Backend unavailable','error'); return; }
    const row={ title:(link.title||'').trim(), description:(link.description||'').trim(), url:(link.url||'').trim(), category:(link.category||'General').trim()||'General' };
    if(!row.title||!row.url) return;
    if(!/^https?:\/\//i.test(row.url)) row.url='https://'+row.url;
    SB.from('kb_links').insert(row).select().then(({data,error})=>{ if(error){ addToast('Could not add link: '+error.message,'error'); return; } const saved=(data&&data[0])||row; setKb(k=>[...k,saved]); addToast('Knowledge base link added','success'); });
  }
  function deleteKb(item){
    if(!SB) return; if(!window.confirm(`Remove “${item.title}” from the knowledge base?`)) return;
    SB.from('kb_links').delete().eq('id',item.id).then(({error})=>{ if(error){ addToast('Delete failed','error'); return; } setKb(k=>k.filter(x=>x.id!==item.id)); addToast('Link removed','info'); });
  }
  // Knowledge-base ARTICLES (live in Supabase; admins can edit/add/delete).
  const [kbArticles,setKbArticles]=useState([]);
  useEffect(()=>{ loadOrSeedKbArticles().then(setKbArticles); },[]);
  function saveArticle(a){
    if(!isAdmin){ addToast('Only admins can edit articles','error'); return; }
    const isNew=!kbArticles.some(x=>x.id===a.id);
    const row={ ...a, sort_order: isNew?kbArticles.length:(kbArticles.find(x=>x.id===a.id)||{}).sort_order||0 };
    setKbArticles(arr=> isNew ? [...arr, row] : arr.map(x=>x.id===a.id?{...x,...row}:x));
    upsertKbArticleToSupabase(row).then(r=>{ if(!r.ok) addToast('Save failed','error'); else addToast(isNew?'Article added':'Article saved','success'); });
  }
  function deleteArticle(id){
    if(!isAdmin){ addToast('Only admins can delete articles','error'); return; }
    const a=kbArticles.find(x=>x.id===id); if(!a) return;
    if(!window.confirm(`Delete the article “${a.title}”? This cannot be undone.`)) return;
    setKbArticles(arr=>arr.filter(x=>x.id!==id));
    deleteKbArticleFromSupabase(id).then(r=>{ if(!r.ok) addToast('Delete failed','error'); else addToast('Article deleted','info'); });
  }
  // Auto attendance: a login session is created when a user signs in (resumed on
  // reload within 30 min), last_seen is heartbeat-updated while the tab is open,
  // and logout_at is set on sign-out / tab close. No manual buttons.
  useEffect(()=>{
    if(!SB || !currentUser) return;
    let cancelled=false; const KEY='sessionInfo';
    const nowIso=()=>new Date().toISOString();
    function startNew(){
      SB.from('sessions').insert({name:currentUser.name,login_at:nowIso(),last_seen:nowIso()}).select().then(({data})=>{
        if(cancelled) return; const s=data&&data[0]; if(!s) return;
        sessionIdRef.current=s.id;
        try{ localStorage.setItem(KEY,JSON.stringify({id:s.id,name:currentUser.name,login_at:s.login_at,lastBeat:Date.now()})); }catch(e){}
        setSessions(a=>[s,...a.filter(x=>x.id!==s.id)]);
        postLeaveSheet({kind:'session',id:s.id,name:currentUser.name,login_at:s.login_at,logout_at:'',duration:''});
      });
    }
    let info=null; try{ info=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
    if(info&&info.id&&info.name===currentUser.name&&(Date.now()-(info.lastBeat||0))<30*60*1000){ sessionIdRef.current=info.id; }
    else { startNew(); }
    const beat=setInterval(()=>{ const id=sessionIdRef.current; if(!id) return; const ls=nowIso();
      SB.from('sessions').update({last_seen:ls}).eq('id',id).then(()=>{});
      setSessions(a=>a.map(x=>x.id===id?{...x,last_seen:ls}:x));
      try{ const i=JSON.parse(localStorage.getItem(KEY)||'null')||{}; i.lastBeat=Date.now(); localStorage.setItem(KEY,JSON.stringify(i)); }catch(e){}
    },60000);
    function onUnload(){ const id=sessionIdRef.current; if(!id) return; try{ const i=JSON.parse(localStorage.getItem(KEY)||'null')||{}; const dur=i.login_at?fmtDuration((Date.now()-new Date(i.login_at).getTime())/1000):''; const wh=(config.leavesWebhook||'').trim(); if(wh&&navigator.sendBeacon) navigator.sendBeacon(wh,new Blob([JSON.stringify({kind:'session',id,name:currentUser.name,login_at:i.login_at||'',logout_at:nowIso(),duration:dur})],{type:'text/plain'})); }catch(e){} }
    window.addEventListener('beforeunload',onUnload);
    return ()=>{ cancelled=true; clearInterval(beat); window.removeEventListener('beforeunload',onUnload); };
  },[currentUser && currentUser.name]);
  function endSession(){
    try{
      const info=JSON.parse(localStorage.getItem('sessionInfo')||'null'); const id=sessionIdRef.current||(info&&info.id);
      if(id){ const ts=new Date().toISOString(); const dur=info&&info.login_at?fmtDuration((Date.now()-new Date(info.login_at).getTime())/1000):'';
        if(SB) SB.from('sessions').update({logout_at:ts,last_seen:ts}).eq('id',id).then(()=>{});
        setSessions(a=>a.map(x=>x.id===id?{...x,logout_at:ts,last_seen:ts}:x));
        postLeaveSheet({kind:'session',id,name:(info&&info.name)||(currentUser&&currentUser.name),login_at:(info&&info.login_at)||'',logout_at:ts,duration:dur});
      }
      localStorage.removeItem('sessionInfo'); sessionIdRef.current=null;
    }catch(e){}
  }
  const [showSearch,setShowSearch]=useState(false);
  const [searchLead,setSearchLead]=useState(null);
  const [closeSyncing,setCloseSyncing]=useState(false);
  const closeLoadedRef=useRef(false);
  const isAdmin=isAdminUser(currentUser);

  function login(u){ setCurrentUser(u); localStorage.setItem('currentUser',JSON.stringify(u)); addToast(`Welcome, ${u.name}`,'success'); }
  function logout(){ endSession(); setCurrentUser(null); localStorage.removeItem('currentUser'); setActiveRep(null); setTab('home'); }

  useEffect(()=>{
    function key(e){
      if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); setShowSearch(s=>!s); }
    }
    document.addEventListener('keydown',key);
    return()=>document.removeEventListener('keydown',key);
  },[]);

  useEffect(()=>{
    document.documentElement.setAttribute('data-dark', darkMode ? 'true' : '');
    if(!darkMode) document.documentElement.removeAttribute('data-dark');
    localStorage.setItem('darkMode',darkMode);
  },[darkMode]);

  useEffect(()=>{
    if(activeRep) localStorage.setItem('activeRep',activeRep);
    else localStorage.removeItem('activeRep');
  },[activeRep]);

  useEffect(()=>{ try{localStorage.setItem('agencies',JSON.stringify(agencies));}catch(e){} },[agencies]);

  function addToast(msg,type='info'){const id=Date.now();setToasts(t=>[...t,{id,msg,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);}
  function saveL(upd){
    const old=leads.find(l=>l.id===upd.id);
    // Employees may only edit leads that are unassigned or assigned to themselves.
    if(!isAdmin && old && old.assignedTo && old.assignedTo!==currentUser.name){
      addToast(`Only ${old.assignedTo} or an admin can edit this lead`,'error');
      return;
    }
    let updated={...upd};
    // Any lead with a rep must carry a dateAssigned, else it's invisible to the
    // date-based Home KPIs. Stamp today if a rep is set but the date is missing.
    if(updated.assignedTo && !updated.dateAssigned) updated.dateAssigned=new Date().toISOString().split('T')[0];
    if(old&&!old.tags.includes('Contacted')&&upd.tags.includes('Contacted')){
      updated.lastContactDate=new Date().toISOString().split('T')[0];
      addToast(`"${upd.channelName}" marked Contacted — date recorded`,'success');
    }
    setLeads(ls=>ls.map(l=>l.id===updated.id?updated:l));
    logH('✏️',`Lead "${updated.channelName}" updated`);
  }
  function delL(id){
    if(!isAdmin){ addToast('Only admins can delete leads','error'); return; }
    const l=leads.find(x=>x.id===id);setLeads(ls=>ls.filter(x=>x.id!==id));deleteLeadFromSupabase(id);logH('🗑',`Lead "${l?.channelName}" deleted`);addToast(`"${l?.channelName}" deleted`,'error');
  }
  function logH(icon,text){setHistory(h=>[{id:Date.now(),icon,text,time:new Date().toLocaleString('en-CA',{hour12:false}).replace(',',''),restorable:true},...h]);}
  function bulkAssign(ids,rep){setLeads(ls=>ls.map(l=>ids.includes(l.id)?{...l,assignedTo:rep,dateAssigned:new Date().toISOString().split('T')[0]}:l));addToast(`${ids.length} leads assigned to ${rep}`,'success');logH('✅',`Bulk: ${ids.length} leads → ${rep}`);}
  function bulkDelete(ids){ if(!ids||!ids.length) return; const set=new Set(ids); setLeads(ls=>ls.filter(l=>!set.has(l.id))); deleteLeadsFromSupabase(ids); logH('🗑',`Bulk: ${ids.length} lead(s) deleted`); addToast(`${ids.length} lead(s) deleted`,'error'); }
  // Auto-flag leads that already exist in the real Close DB. Runs in the
  // background after an import or manual add (the scraper already drops Close
  // dupes up-front). Matches are tagged "Existing Leads" so a rep SEES that the
  // lead is already in Close instead of unknowingly re-working it. Matches by
  // YouTube channel id / email via the close-check Edge Function.
  function checkAndTagFromClose(leadsToCheck, sourceLabel){
    const checkWh=(config.closeCheckWebhook||'').trim();
    const checkable=(leadsToCheck||[]).filter(l=>l && (l.channelId||l.url||(Array.isArray(l.emails)&&l.emails.length)));
    if(!checkWh || !checkable.length) return;
    const CAP=400;                                  // protect Close from huge bursts
    const batch=checkable.slice(0,CAP);
    addToast(`Checking ${batch.length}${checkable.length>CAP?' of '+checkable.length:''} ${sourceLabel} lead(s) against Close…`,'info');
    fetch(checkWh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leads:batch.map((l,i)=>({key:i,channelId:l.channelId,url:l.url,emails:l.emails}))})})
      .then(r=>r.json())
      .then(resp=>{
        if(!resp||resp.ok===false) return;
        const ex=new Set(resp.existing||[]);
        const matchedKeys=new Set(batch.filter((l,i)=>ex.has(i)).map(leadKey).filter(Boolean));
        if(!matchedKeys.size){ addToast(`✓ None of the ${sourceLabel} lead(s) are in Close — all fresh`,'success'); return; }
        setLeads(existing=>existing.map(l=> (matchedKeys.has(leadKey(l)) && !(l.tags||[]).includes('Existing Leads')) ? {...l,tags:[...(l.tags||[]),'Existing Leads']} : l));
        logH('☁',`Close dedup: ${matchedKeys.size} ${sourceLabel} lead(s) already in Close — tagged "Existing Leads"`);
        addToast(`⚠ ${matchedKeys.size} ${sourceLabel} lead(s) already in Close — tagged "Existing Leads"`,'info');
      })
      .catch(()=>{});
  }
  function addLead(lead){
    const k=leadKey(lead)+'|'+(lead.assignedTo||'');
    if(leads.some(l=>leadKey(l)+'|'+(l.assignedTo||'')===k)){ addToast(`"${lead.channelName}" is already in ${lead.assignedTo}'s list`,'info'); return; }
    setLeads(ls=>[lead,...ls]);
    logH('➕',`Lead added manually: ${lead.channelName} → ${lead.assignedTo}`);
    addToast(`✓ "${lead.channelName}" added to ${lead.assignedTo}`,'success');
    checkAndTagFromClose([lead],'manually-added');
  }
  function clearAllLeads(){ const n=leads.length; setLeads([]); leadsSyncRef.current={}; clearAllLeadsFromSupabase(); logH('🗑',`Cleared ALL leads (${n})`); addToast(`Cleared all ${n} lead(s)`,'error'); }
  // Fire-and-forget mirror to the leaves Google Sheet. Uses no-cors + text/plain
  // so it works with a Google Apps Script web app (which can't answer CORS
  // preflight); the body is still a JSON string the script parses. Works with
  // Make/Zapier too. Supabase is the source of truth, so we don't read the reply.
  function postLeaveSheet(payload){ const wh=(config.leavesWebhook||'').trim(); if(!wh) return; try{ fetch(wh,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}).catch(()=>{}); }catch(e){} }
  function fileLeave(form){
    if(!SB){ addToast('Backend unavailable — cannot file leave','error'); return; }
    const row={ name:currentUser.name, type:form.type, start_date:form.start||null, end_date:form.end||null, days:form.days||null, reason:form.reason||'', status:'Pending' };
    SB.from('leaves').insert(row).select().then(({data,error})=>{
      if(error){ addToast('Could not file leave: '+error.message,'error'); return; }
      const saved=(data&&data[0])||row;
      setLeaves(ls=>[saved,...ls]); addToast('Leave request filed','success'); logH('🌴',`Leave filed: ${row.type} ${row.start_date||''}→${row.end_date||''}`);
      postLeaveSheet({ event:'filed', ...saved });
    });
  }
  function deleteLeave(l){
    if(!SB) return;
    if(!window.confirm(`Delete ${l.name}'s ${l.type} leave request (${l.start_date||''}${l.end_date&&l.end_date!==l.start_date?'→'+l.end_date:''})?\n\nThis cannot be undone.`)) return;
    SB.from('leaves').delete().eq('id',l.id).then(({error})=>{
      if(error){ addToast('Delete failed: '+error.message,'error'); return; }
      setLeaves(ls=>ls.filter(x=>x.id!==l.id)); addToast('Leave request deleted','info'); logH('🌴',`Leave deleted (${l.name})`);
      // mirror to the sheet: mark that row Deleted (upsert by id keeps the record)
      postLeaveSheet({ event:'deleted', id:l.id, name:l.name, type:l.type, start_date:l.start_date, end_date:l.end_date, days:l.days, reason:l.reason, status:'Deleted', decided_by:currentUser.name, decided_at:new Date().toISOString() });
    });
  }
  function decideLeave(id,status){
    if(!SB) return;
    const patch={ status, decided_by:currentUser.name, decided_at:new Date().toISOString(), note:'' };
    SB.from('leaves').update(patch).eq('id',id).select().then(({data,error})=>{
      if(error){ addToast('Update failed: '+error.message,'error'); return; }
      const saved=(data&&data[0])||null;
      setLeaves(ls=>ls.map(l=>l.id===id?{...l,...patch}:l)); addToast(`Leave ${status.toLowerCase()}`,status==='Approved'?'success':'info');
      logH('🌴',`Leave ${status.toLowerCase()} by ${currentUser.name}`);
      postLeaveSheet({ event:'decision', ...(saved||{id,...patch}) });
    });
  }
  function applyConfig(cfg){
    setConfig(cfg);
    if(!cfg.tabs[tab])setTab('home');
    // Persist the whole config to Supabase so Customize changes (sales reps,
    // status tags, tabs, campaigns…) stick across reloads and reach every
    // teammate — not just this admin's session.
    try{ saveAppConfigToSupabase(cfg).then(r=>{ if(!r||r.ok===false) addToast('Saved locally, but the cloud sync failed — check connection','error'); }); }catch(e){}
    // Per-rep YouTube API keys also go to their dedicated table.
    try{ saveRepApiKeysToSupabase(cfg.repApiKeys||{}); }catch(e){}
  }
  function importLeads(newLeads){
    setLeads(existing=>{
      // Dedupe per (channel + rep): skip a lead only if the SAME rep already has
      // that channel. The same channel under a DIFFERENT rep is kept on purpose,
      // so the Duplicates tab can flag that two reps are working the same lead.
      const seen=new Set(existing.map(l=>leadKey(l)+'|'+(l.assignedTo||'')));
      const fresh=[];
      newLeads.forEach(l=>{
        const k=leadKey(l)+'|'+(l.assignedTo||'');
        if(leadKey(l) && seen.has(k)) return;     // same channel already under this rep
        seen.add(k);
        fresh.push({...l,source:'import'});
      });
      const skipped=newLeads.length-fresh.length;
      logH('📊',`Google Sheets import: ${fresh.length} lead(s) added${skipped>0?` · ${skipped} same-rep duplicate(s) skipped`:''}`);
      return[...existing,...fresh];
    });
    autoFileAgencies(newLeads);   // any rows with an "agency" column drop into that Agency folder
    setTab('lead-mgmt');
    checkAndTagFromClose(newLeads,'imported');   // flag any that already exist in Close
  }

  // Agency Sheets import: add the parsed leads to the global pool (deduped per
  // channel+rep, like a normal import) AND attach them to the agency folder by
  // leadKey — including leads that already existed, so the folder is complete.
  function importAgencyLeads(folderId,parsedLeads){
    const arr=Array.isArray(parsedLeads)?parsedLeads:[];
    setLeads(existing=>{
      const seen=new Set(existing.map(l=>leadKey(l)+'|'+(l.assignedTo||'')));
      const fresh=[];
      arr.forEach(l=>{ const k=leadKey(l)+'|'+(l.assignedTo||''); if(leadKey(l)&&seen.has(k)) return; seen.add(k); fresh.push({...l,source:'import'}); });
      return [...existing,...fresh];
    });
    const keys=[...new Set(arr.map(leadKey).filter(Boolean))];
    setAgencies(a=>a.map(f=>f.id===folderId?{...f,leadKeys:[...new Set([...(f.leadKeys||[]),...keys])]}:f));
    logH('🏢',`Agency import: ${arr.length} lead(s) added to a folder`);
    checkAndTagFromClose(arr,'agency-imported');   // flag any that already exist in Close
    return keys.length;
  }

  function addDiscovered(items){
    const arr=Array.isArray(items)?items:[];
    const myName=(currentUser&&currentUser.name)||'';
    setLeads(existing=>{
      // De-dupe by channel (ID > URL > name), both within the batch and vs existing leads.
      const seen=new Set(existing.map(leadKey).filter(Boolean));
      const fresh=[];
      arr.forEach(l=>{
        const k=leadKey(l);
        if(k && seen.has(k)) return;     // same channel already in the list
        if(k) seen.add(k);
        // Stamp who scraped it so the Scraper queue can be scoped per rep.
        fresh.push({...l, scrapedBy: l.scrapedBy||myName});
      });
      const dropped=arr.length-fresh.length;
      logH('🔎',`Discovery: ${fresh.length} unique channel(s) added${dropped>0?` · ${dropped} duplicate(s) skipped`:''}`);
      return[...fresh,...existing];   // newest results first (top of the list / page 1)
    });
  }

  // Normalize a lead object coming back from Close (via n8n) into the shape
  // the dashboard expects, so missing fields don't crash the UI.
  function normalizeLead(x,i){
    x=x||{};
    // Tolerant of both dashboard-shaped leads and RAW Close lead objects
    // (name, contacts[].emails[].email, status_label, our pipe-text description).
    const meta=parseCloseDescription(x.description);
    // Close custom fields come back keyed as `custom.<id>`; getCf reads ours.
    const cf=(config.closeFields)||{};
    const getCf=(k)=> cf[k] ? x['custom.'+cf[k]] : undefined;
    const closeId = x.closeLeadId || x.close_id || (typeof x.id==='string' && /^lead_/.test(x.id) ? x.id : null);
    let emails = Array.isArray(x.emails)?x.emails:(x.email?[x.email]:[]);
    if(!emails.length && Array.isArray(x.contacts))
      emails = x.contacts.flatMap(c=>(c&&c.emails||[]).map(e=>e&&e.email).filter(Boolean));
    let tags = Array.isArray(x.tags)?x.tags:[];
    if(!tags.length){ const st=getCf('status')||meta.status||x.status_label; if(st){ const t=canonTag(st); if(t) tags=[t]; } }
    let campaigns = Array.isArray(x.campaigns)?x.campaigns:[];
    if(!campaigns.length){ const c=getCf('campaign')||meta.campaign; if(c) campaigns = String(c).split(/[;,/]/).map(s=>s.trim()).filter(Boolean); }
    return {
      id: (typeof x.id==='number') ? x.id : (Date.now()+Math.floor(Math.random()*1e6)+i),
      closeLeadId: closeId,
      channelName: x.channelName || x.name || x.display_name || ('lead_'+(i+1)),
      url: x.url || meta.url || '', platform: x.platform || getCf('platform') || meta.platform || 'YouTube', niche: x.niche || getCf('niche') || meta.niche || '',
      followers: x.followers || getCf('followers') || meta.followers || '', emails,
      thumbnail: x.thumbnail || '', channelId: x.channelId || '',
      tags, campaigns,
      assignedTo: x.assignedTo || getCf('rep') || meta.rep || null, dateAssigned: x.dateAssigned || getCf('assigned') || meta.assigned || null,
      lastContactDate: x.lastContactDate || null, channels: Array.isArray(x.channels)?x.channels:[],
      links: Array.isArray(x.links)?x.links:[],
      addedAt: x.addedAt || null,
      agency: x.agency || null,
      source: x.source,
    };
  }

  // Auto-file leads that carry an `agency` name into the matching Agency-tab
  // folder (one per rep+agency), creating the folder if needed. Drives the
  // Google-Form workflow: rep bulk-imports an agency's roster → lands in Close
  // with the agency name → on load it appears under that agency's folder.
  function autoFileAgencies(ls){
    const groups={};
    (ls||[]).forEach(l=>{
      const ag=String(l.agency||'').trim(); if(!ag) return;
      const k=leadKey(l); if(!k) return;
      const owner=l.assignedTo||'';
      const id=owner+'|||'+ag.toLowerCase();
      (groups[id]=groups[id]||{name:ag,owner,keys:new Set()}).keys.add(k);
    });
    const list=Object.values(groups);
    if(!list.length) return;
    setAgencies(prev=>{
      let next=[...prev];
      list.forEach(g=>{
        let folder=next.find(f=>f.owner===g.owner && String(f.name||'').toLowerCase()===g.name.toLowerCase());
        if(!folder){
          folder={id:'ag_'+Date.now()+'_'+Math.floor(Math.random()*1e6),name:g.name,owner:g.owner,leadKeys:[],createdAt:new Date().toISOString(),source:'google-form'};
          next=[...next,folder];
        }
        const merged=[...new Set([...(folder.leadKeys||[]),...g.keys])];
        next=next.map(f=>f.id===folder.id?{...f,leadKeys:merged}:f);
      });
      return next;
    });
  }

  // Pull replies/interest from the SmartReach + Close feeds (when wired) and
  // merge into the 🔔 panel. No-op (with a hint) until the webhooks are set.
  // Pull the rep's replies (Close incoming emails + SmartReach) from the single
  // `replies` Edge Function. Employees get their own feed; admins get everyone's.
  function loadReplies(opts){
    opts=opts||{};
    const wh=(config.repliesWebhook||'').trim();
    if(!wh || wh.includes('your-')){ if(!opts.silent) addToast('Replies feed isn’t connected yet','info'); return; }
    setRepliesLoading(true);
    const who=(isAdmin && bellScope==='all') ? 'all' : ((currentUser&&currentUser.name)||''); // own account, unless an admin opts into 'all'
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rep:who})})
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        const arr=d?(Array.isArray(d)?d:(d.replies||d.data||[])):[];
        const seen={}, uniq=[];
        arr.map(normalizeReply).forEach(r=>{ const k=replyKey(r); if(!seen[k]){seen[k]=1;uniq.push(r);} });
        setReplies(uniq);
        if(!opts.silent) addToast(`Loaded ${uniq.length} repl${uniq.length===1?'y':'ies'}`,'success');
      })
      .catch(()=>{ if(!opts.silent) addToast('Couldn’t load replies','error'); })
      .finally(()=>setRepliesLoading(false));
  }
  // Auto-load on login + refresh every 2 min so reps are notified without clicking.
  useEffect(()=>{
    if(!currentUser || !(config.repliesWebhook||'').trim()) return;
    loadReplies({silent:true});
    const t=setInterval(()=>loadReplies({silent:true}), 120000);
    return ()=>clearInterval(t);
  },[currentUser && currentUser.name, bellScope]);

  function loadFromClose(opts){
    opts=opts||{};
    const wh=(config.closeLoadWebhook||'').trim();
    if(!wh || wh.includes('your-')){ if(!opts.silent) addToast('Set the Close Load Webhook in ⚙ Customize','info'); return; }
    setCloseSyncing(true);
    if(!opts.silent) addToast('Loading leads from Close…','info');
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
      .then(text=>{
        if(!text || !text.trim()){ if(!opts.silent) addToast('Close returned no leads','info'); return; }
        let data; try{ data=JSON.parse(text); }catch(e){ addToast('Close load: response was not JSON','error'); return; }
        const arr=Array.isArray(data)?data:(data.leads||data.results||data.data||[]);
        const loaded=arr.map(normalizeLead).map(l=>({...l,fromClose:true}));  // tag for the Close Leads Data tab
        setLeads(loaded);
        autoFileAgencies(loaded);
        const agencyCount=loaded.filter(l=>l.agency).length;
        if(agencyCount) logH('🏢',`Auto-filed ${agencyCount} agency lead(s) into Agency folders`);
        logH('☁️',`Loaded ${loaded.length} lead(s) from Close`);
        if(!opts.silent) addToast(`✓ Loaded ${loaded.length} lead(s) from Close`,'success');
      })
      .catch(e=>{ if(!opts.silent) addToast('Close load failed: '+e.message,'error'); })
      .finally(()=>setCloseSyncing(false));
  }

  function saveToClose(){
    const wh=(config.closeWebhook||'').trim();
    if(!wh || wh.includes('your-')){ addToast('Set the Close Save Webhook in ⚙ Customize','info'); return; }
    if(!leads.length){ addToast('No leads to save','info'); return; }
    setCloseSyncing(true);
    addToast(`Saving ${leads.length} lead(s) to Close…`,'info');
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close.create', rep:null, leads:leads.map(toCloseLeadItem)})})
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
      .then(text=>{
        // Optional: Close returns [{id, closeLeadId}] so we can update without duplicating next time.
        let data=null; try{ data=text&&text.trim()?JSON.parse(text):null; }catch(e){}
        const idMap=Array.isArray(data)?data:(data&&Array.isArray(data.saved)?data.saved:null);
        if(idMap){
          const byId={}; idMap.forEach(m=>{ if(m && m.id!=null) byId[m.id]=m.closeLeadId||m.close_id; });
          setLeads(ls=>ls.map(l=>byId[l.id]?{...l,closeLeadId:byId[l.id]}:l));
        }
        logH('☁️',`Saved ${leads.length} lead(s) to Close`);
        addToast(`✓ Saved ${leads.length} lead(s) to Close`,'success');
      })
      .catch(e=>addToast('Close save failed: '+e.message,'error'))
      .finally(()=>setCloseSyncing(false));
  }

  // Load shared LEADS from Supabase once on start (the team source of truth).
  useEffect(()=>{
    loadLeadsFromSupabase().then(loaded=>{
      if(loaded && loaded.length){
        supabaseHadLeadsRef.current=true;
        const snap={}; loaded.forEach(l=>snap[String(l.id)]=JSON.stringify(l));
        leadsSyncRef.current=snap;
        setLeads(loaded);
      }
      setLeadsReady(true);
    });
  },[]);

  // Persist lead changes to Supabase (debounced, upsert-only — deletes go through
  // delL). Diffs against the last-synced snapshot so only changed leads are sent.
  useEffect(()=>{
    if(!SB || !leadsReady) return;
    const h=setTimeout(()=>{
      const prev=leadsSyncRef.current, snap={}, changed=[];
      leads.forEach(l=>{ const k=String(l.id), j=JSON.stringify(l); snap[k]=j; if(prev[k]!==j) changed.push(l); });
      if(changed.length) upsertLeadsToSupabase(changed);
      leadsSyncRef.current=snap;
    }, 1000);
    return ()=>clearTimeout(h);
  },[leads,leadsReady]);

  // Auto-load from Close after login ONLY if Supabase had no leads yet (first-time
  // setup); otherwise Supabase is the source and we don't overwrite it.
  useEffect(()=>{
    if(currentUser && leadsReady && !supabaseHadLeadsRef.current && !closeLoadedRef.current){
      const wh=(config.closeLoadWebhook||'').trim();
      if(wh && !wh.includes('your-')){ closeLoadedRef.current=true; loadFromClose({silent:true}); }
    }
  },[currentUser,leadsReady]);

  // Load shared profiles from Supabase once on start, then re-render so avatars
  // / titles / birthdays reflect the team-wide data.
  useEffect(()=>{ loadProfilesFromSupabase().then(()=>setProfileTick(t=>t+1)); },[]);
  // Load the team's saved dashboard config (sales reps, status tags, tabs,
  // campaigns…) so an admin's Customize changes apply on every browser, not
  // just where they were made. Merged over the code defaults.
  useEffect(()=>{ loadAppConfigFromSupabase().then(saved=>{ if(saved) setConfig(c=>mergeConfig(c,saved)); }); },[]);
  // Per-rep YouTube API keys are shared via Supabase — merge them into config on
  // load so a rep on their own browser picks up the key the admin set for them.
  useEffect(()=>{ loadRepApiKeysFromSupabase().then(map=>{ if(map&&Object.keys(map).length) setConfig(c=>({...c,repApiKeys:{...(c.repApiKeys||{}),...map}})); }); },[]);

  function importToClose(rep,repLeads){
    const CLOSE_WEBHOOK=(config.closeWebhook||'').trim();
    if(!CLOSE_WEBHOOK || CLOSE_WEBHOOK.includes('your-')){ addToast('Set the Close Save Webhook in ⚙ Customize first','info'); return; }
    if(!repLeads || !repLeads.length){ addToast(`No leads to send for ${rep}`,'info'); return; }
    // Plain field shape for the Close push Edge Function (it builds the Close
    // body + custom fields server-side). Status is NOT sent — reps set it in
    // Close manually. The function returns each lead's Close id so we can store
    // closeLeadId → a future push UPDATES in place instead of duplicating.
    const payload={ rep, leads:repLeads.map(l=>({
      closeLeadId: l.closeLeadId||null,
      name: l.channelName||'',
      url: l.url||'',
      platform: l.platform||'',
      niche: l.niche||'',
      followers: l.followers||'',
      campaign: (l.campaigns||[]).join(', '),
      assignedTo: l.assignedTo||'',
      dateAssigned: l.dateAssigned||'',
      email: (l.emails||[])[0]||'',
    })) };
    const orderedIds=repLeads.map(l=>l.id);
    setCloseSyncing(true);
    addToast(`Sending ${repLeads.length} lead(s) to Close.io for ${rep}…`,'info');
    fetch(CLOSE_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(resp=>{
        const results=(resp&&resp.results)||[];
        const failed=results.filter(r=>r && r.ok===false).length;
        // Mark Imported + store each lead's Close id (matched by order) so a
        // re-push updates in place rather than creating a duplicate.
        setLeads(ls=>ls.map(l=>{ const idx=orderedIds.indexOf(l.id); if(idx<0) return l; const r=results[idx]; return {...l, importedToClose:true, closeLeadId:(r&&r.id)||l.closeLeadId||null}; }));
        addToast(failed?`Sent ${repLeads.length-failed}/${repLeads.length} to Close.io (${failed} failed) for ${rep}`:`✓ ${repLeads.length} lead(s) sent to Close.io for ${rep}`, failed?'info':'success');
        logH('⬆',`Close.io import: ${repLeads.length-failed} lead(s) for ${rep}`);
      })
      .catch(e=>{ addToast(`Close.io import failed for ${rep}: ${e.message}`,'error'); logH('⬆',`Close.io import failed for ${rep}`); })
      .finally(()=>setCloseSyncing(false));
  }

  // Send the rep's SELECTED leads (name + email) to a SmartReach CAMPAIGN she
  // picked. Make creates each prospect then assigns it to that campaign.
  function importToSmartReach(rep,repLeads,campaignId,campaignLabel){
    const wh=(config.smartreachWebhook||'').trim();
    if(!wh || wh.includes('your-')){ addToast('Set the SmartReach Webhook in ⚙ Customize first','info'); return; }
    const emailable=(repLeads||[]).filter(l=>(l.emails||[]).length>0);
    if(!emailable.length){ addToast(`No selected leads have an email to send for ${rep}`,'info'); return; }
    if(!campaignId){ addToast('Pick a SmartReach campaign first','info'); return; }
    const dest=campaignLabel||('campaign '+campaignId);
    // The smartreach-add Edge Function takes {rep, campaign_id (cmp_…), leads},
    // creates/updates the prospects, and assigns them to the campaign. It returns
    // {ok, created, assigned, errors}. SmartReach dedupes by email so re-sends
    // don't duplicate.
    const payload={ rep, campaign_id:String(campaignId), leads:emailable.map(l=>toSmartReachItem(l,campaignId)) };
    addToast(`Sending ${emailable.length} prospect(s) to SmartReach → ${dest}…`,'info');
    fetch(wh,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(resp=>{
        if(resp && resp.ok===false) throw new Error(resp.error||'SmartReach error');
        const n=(resp&&typeof resp.assigned==='number'&&resp.assigned)?resp.assigned:emailable.length;
        addToast(`✓ ${n} prospect(s) added to SmartReach → ${dest}`,'success'); logH('✉',`SmartReach: ${n} → ${dest} (${rep})`);
      })
      .catch(e=>{ addToast(`SmartReach send failed for ${rep}: ${e.message}`,'error'); logH('✉',`SmartReach send failed for ${rep}`); });
  }

  useEffect(()=>{
    function checkRecycle(){
      const now=new Date();
      setLeads(ls=>{
        const recycled=[];
        const updated=ls.map(l=>{
          if(!l.tags.includes('Contacted')||l.tags.includes('For Recycle')||!l.lastContactDate) return l;
          const diff=Math.floor((now-new Date(l.lastContactDate))/86400000);
          const isVVV=l.campaigns.includes('VVV');
          const isMSN=l.campaigns.includes('MSN');
          const threshold=isVVV?30:isMSN?90:Infinity;
          if(diff>=threshold){
            recycled.push(l.channelName);
            return{...l,tags:[...l.tags.filter(t=>t!=='Contacted'),'For Recycle']};
          }
          return l;
        });
        if(recycled.length>0){
          setHistory(h=>[{id:Date.now(),icon:'♻️',text:`Auto-recycled ${recycled.length} lead(s): ${recycled.join(', ')}`,time:now.toLocaleString('en-CA',{hour12:false}).replace(',',''),restorable:false},...h]);
        }
        return updated;
      });
    }
    checkRecycle();
    const t=setInterval(checkRecycle,3600000);
    return()=>clearInterval(t);
  },[]);

  const campColorMap={};
  (config.campaigns||[]).forEach(c=>campColorMap[c.id]=c.color);

  const vLeads = leads;

  // Duplicate detection: group leads by channel identity (channelId>url>name);
  // a group is a duplicate when the same channel exists in 2+ lead records.
  // These are surfaced in the Duplicates tab so two reps don't unknowingly work
  // the same lead. Cross-rep conflicts (2+ distinct reps) are sorted to the top.
  const dupGroups=(function(){
    const byKey={};
    vLeads.forEach(l=>{ const k=leadKey(l); if(!k) return; (byKey[k]=byKey[k]||[]).push(l); });
    return Object.keys(byKey).map(k=>{
      const ls=byKey[k];
      return {key:k, leads:ls, reps:[...new Set(ls.map(l=>l.assignedTo).filter(Boolean))]};
    }).filter(g=>g.leads.length>1)
      .sort((a,b)=>(b.reps.length-a.reps.length)||(b.leads.length-a.leads.length));
  })();

  const recentCutoff=new Date();recentCutoff.setDate(recentCutoff.getDate()-7);
  // A lead is "Pending Qualification" if it carries that status tag OR it's the
  // original workflow case (assigned to a rep but not yet sorted into a campaign).
  const isPendingLead = l => (l.tags||[]).includes('Pending Qualification') || (l.assignedTo && (l.campaigns||[]).length===0);
  const counts={
    potential:vLeads.filter(l=>l.tags.includes('Potential')).length,
    pending:vLeads.filter(isPendingLead).length,
    contacted:vLeads.filter(l=>l.tags.includes('Contacted')).length,
    recycle:vLeads.filter(l=>l.tags.includes('For Recycle')).length,
    recent:vLeads.filter(l=>l.assignedTo&&l.dateAssigned&&new Date(l.dateAssigned)>=recentCutoff).length,
    duplicates:dupGroups.length,
  };

  const NAV_MAIN=[
    {id:'home',icon:'⊟',label:'Home'},
    {id:'scraper',icon:'◎',label:'Scraper'},
    {id:'history',icon:'◷',label:'History'},
    {id:'prev-scraped',icon:'◈',label:'Previously Scraped'},
    {id:'lead-mgmt',icon:'◉',label:'Lead Management'},
    {id:'google-import',icon:'◫',label:'Google Sheets'},
    {id:'agency',icon:'▦',label:'Agency'},
    {id:'close-data',icon:'☁',label:'Search Close DB'},
    {id:'leaves',icon:'🌴',label:'Leaves'},
    {id:'knowledge',icon:'📚',label:'Knowledge Base'},
    {id:'attendance',icon:'⏱',label:'Attendance'},
  ];
  const NAV_FILTER=[
    {id:'pending',icon:'◔',label:'Pending Qualification',count:counts.pending,cls:'orange'},
    {id:'contacted',icon:'✉',label:'Contacted',count:counts.contacted,cls:'blue'},
    {id:'recycle',icon:'↻',label:'For Recycle',count:counts.recycle,cls:'orange'},
    {id:'recent',icon:'◑',label:'Recently Assigned',count:counts.recent,cls:''},
    {id:'duplicates',icon:'⧉',label:'Duplicates',count:counts.duplicates,cls:'red'},
  ];

  function renderMain(){
    if(showRepSelect) return <RepSelectScreen leads={vLeads} config={config} activeRep={activeRep} onSelect={r=>{if(r){setActiveRep(r);setTab('rep-home');}setShowRepSelect(false);}}/>;
    if(tab==='rep-home'&&activeRep) return <RepDashboard rep={activeRep} leads={vLeads} config={config} onEdit={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} onBack={()=>setTab('home')} onImportClose={importToClose} onImportSmartReach={importToSmartReach} onAddLead={addLead}/>;
    if(tab==='home') return <HomeView leads={vLeads} config={config} currentUser={currentUser}/>;
    if(tab==='leaves') return <LeavesView leaves={leaves} currentUser={currentUser} isAdmin={isAdmin} onFile={fileLeave} onDecide={decideLeave} onDelete={deleteLeave}/>;
    if(tab==='knowledge') return <KnowledgeBaseView articles={kbArticles} isAdmin={isAdmin} onSave={saveArticle} onDelete={deleteArticle}/>;
    if(tab==='attendance') return isAdmin ? <AttendanceView sessions={sessions} config={config}/> : <HomeView leads={vLeads} config={config} currentUser={currentUser}/>;
    if(tab==='scraper') return <ScraperView leads={vLeads} onSave={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} onResults={addDiscovered} addToast={addToast} config={config} currentUser={currentUser}/>;
    if(tab==='history') return <HistoryView history={history} addToast={addToast} feats={config.features||{}}/>;
    if(tab==='prev-scraped') return <LeadsTable leads={vLeads} onEdit={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} showAssigned showCampaign showOrigin config={config} feats={config.features||{}} campColorMap={campColorMap} filename="all_leads" printTitle="All Scraped Leads"/>;
    if(tab==='lead-mgmt') return <LeadMgmtView leads={vLeads} onSave={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} onClearAll={isAdmin?clearAllLeads:null} addToast={addToast} config={config}/>;
    if(tab==='pending') return <LeadsTable leads={vLeads.filter(isPendingLead)} onEdit={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} showAssigned showCampaign showOrigin config={config} feats={config.features||{}} campColorMap={campColorMap} filename="pending_qualification" printTitle="Pending Qualification"/>;
    if(tab==='contacted') return <ContactedView leads={vLeads} onSave={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} config={config} campColorMap={campColorMap}/>;
    if(tab==='recycle') return <LeadsTable leads={vLeads.filter(l=>l.tags.includes('For Recycle'))} onEdit={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} showAssigned showCampaign showOrigin config={config} feats={config.features||{}} campColorMap={campColorMap} filename="recycle_leads" printTitle="For Recycle Leads"/>;
    if(tab==='recent') return <LeadsTable leads={vLeads.filter(l=>l.assignedTo&&l.dateAssigned&&new Date(l.dateAssigned)>=recentCutoff)} onEdit={saveL} onDelete={delL} onBulkDelete={bulkDelete} onBulkAssign={bulkAssign} showAssigned showCampaign showOrigin config={config} feats={config.features||{}} campColorMap={campColorMap} filename="recent_leads" printTitle="Recently Assigned Leads"/>;
    if(tab==='duplicates') return <DuplicatesView groups={dupGroups} config={config} onSave={saveL} onDelete={delL} addToast={addToast}/>;
    if(tab==='google-import') return <GoogleImportView onImport={importLeads} addToast={addToast}/>;
    if(tab==='agency') return <AgencyView agencies={agencies} setAgencies={setAgencies} leads={vLeads} config={config} currentUser={currentUser} isAdmin={isAdmin} addToast={addToast} onImportSheet={importAgencyLeads}/>;
    if(tab==='close-data') return <CloseSearchView config={config}/>;
    const camp=(config.campaigns||[]).find(c=>c.id.toLowerCase()===tab);
    if(camp) return <CampaignView campaign={camp} campColor={camp.color} leads={vLeads} onSave={saveL} onBulkAssign={bulkAssign} addToast={addToast} config={config}/>;
    return null;
  }

  const PAGE_TITLE={home:'Home',scraper:'Scraper',history:'History','prev-scraped':'Previously Scraped Leads','lead-mgmt':'Lead Management','google-import':'Google Sheets Import',agency:'Agency Folders','close-data':'Close Leads Data',pending:'Pending Qualification',contacted:'Contacted Leads',recycle:'For Recycle',recent:'Recently Assigned',duplicates:'Duplicate Leads',...Object.fromEntries((config.campaigns||[]).map(c=>[c.id.toLowerCase(),`${c.label} Campaign`]))};

  // Gate the entire app behind login.
  const resetToken=(()=>{ try{ return new URLSearchParams(window.location.search).get('reset'); }catch(e){ return null; } })();
  if(resetToken) return <ResetPasswordScreen token={resetToken} onDone={()=>{ try{ window.history.replaceState({},'',window.location.pathname); }catch(e){}; window.location.reload(); }}/>;
  if(!currentUser) return <LoginScreen config={config} onLogin={login}/>;

  return (
    <div id="root" style={{display:'flex',flexDirection:'column',height:'100vh'}}>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-brand">
          <div>
            <div>Enfinity</div>
            <div className="tagline">Sales Dashboard</div>
          </div>
        </div>
        <div style={{flex:1}}/>
        <div className="topbar-right">
          <button className="topbar-icon-btn" onClick={()=>setShowSearch(true)} title="Search dashboard (Ctrl/⌘ + K)" aria-label="Search dashboard">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          {(()=>{
            const allMode = isAdmin && bellScope==='all';
            const myReplies = allMode ? replies : replies.filter(r=>(r.rep||'')===currentUser.name);
            const seen = repliesSeenSet(currentUser.name);
            const unread = myReplies.filter(r=>!seen.has(r.id)).length;
            return (
              <div className="bell-wrap">
                <button className="btn btn-outline btn-sm bell-btn" title="Replies & interest"
                  onClick={()=>{ if(!showBell) markRepliesSeen(currentUser.name, myReplies.map(r=>r.id)); setShowBell(s=>!s); }}>
                  🔔{unread>0 && <span className="bell-badge">{unread>9?'9+':unread}</span>}
                </button>
                {showBell && <>
                  <div className="bell-backdrop" onClick={()=>setShowBell(false)}/>
                  <div className="bell-dropdown">
                    <div className="bell-head">
                      <span>🔔 Replies &amp; Interest · {allMode?'all reps':currentUser.name}</span>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        {isAdmin && <button className="btn btn-ghost btn-xs" onClick={()=>setBellScope(s=>s==='all'?'mine':'all')} title="Switch between your messages and everyone's">{allMode?'👤 Mine':'👥 All reps'}</button>}
                        <button className="btn btn-ghost btn-xs" onClick={()=>loadReplies()} disabled={repliesLoading}>{repliesLoading?'…':'⟳ Check'}</button>
                      </div>
                    </div>
                    <div className="bell-list">
                      {myReplies.length===0
                        ? <div className="bell-empty"><div style={{fontSize:24,marginBottom:6}}>🔔</div>No replies yet.<div className="bell-empty-sub">You'll be notified here when a prospect replies or shows interest in your campaigns — across SmartReach &amp; Close.</div></div>
                        : myReplies.slice(0,40).map(r=>(
                          <div key={r.id} className={`bell-item${seen.has(r.id)?'':' unread'}`}>
                            <div className="bell-item-top">
                              <span className={`rs-chip ${(REPLY_SENTIMENTS[r.sentiment]||{}).cls||'rs-rep'}`}>{r.sentiment}</span>
                              <span className="bell-src">{r.source==='Close'?'☁ Close':'✉ SmartReach'}</span>
                              {allMode && r.rep && <span className="bell-rep">{r.rep}</span>}
                              <span className="bell-when">{fmtReplyWhen(r.when)}</span>
                            </div>
                            <div className="bell-name">{r.name}{r.email?` · ${r.email}`:''}</div>
                            {r.snippet && <div className="bell-snip">{r.snippet.slice(0,140)}</div>}
                            {r.campaign && <div className="bell-camp">▸ {r.campaign}</div>}
                            {r.source==='Close'
                              ? <a className="bell-open" href={r.leadId?`https://app.close.com/lead/${r.leadId}/`:'https://app.close.com/'} target="_blank" rel="noreferrer">Open in Close ↗</a>
                              : <a className="bell-open" href="https://app.smartreach.io/" target="_blank" rel="noreferrer">Open in SmartReach ↗</a>}
                          </div>
                        ))}
                    </div>
                  </div>
                </>}
              </div>
            );
          })()}
          <div className="profile-pill-wrap">
            <div className="topbar-user-pill" role="button" tabIndex={0} style={{cursor:'pointer'}}
              title="Open my dashboard"
              onClick={()=>{setShowRepSelect(false);setActiveRep(currentUser.name);setTab('rep-home');}}
              onKeyDown={e=>{if(e.key==='Enter'){setShowRepSelect(false);setActiveRep(currentUser.name);setTab('rep-home');}}}>
              <RepAvatar rep={currentUser.name} config={config} size={26} online bgOverride="var(--card)"/>
              <div className="topbar-rep-name">{currentUser.name}</div>
              {isAdmin && <span className="role-chip">ADMIN</span>}
              {currentUser.role==='leadgen' && <span className="role-chip leadgen">LEADGEN</span>}
            </div>
            {(()=>{ const pr=getProfile(currentUser.name); const d=daysUntilBirthday(pr.birthday); return (
              <div className="profile-hovercard">
                <div className="phc-head">
                  <RepAvatar rep={currentUser.name} config={config} size={44} bgOverride="var(--card)"/>
                  <div>
                    <div className="phc-name">{currentUser.name}</div>
                    <div className="phc-role">{currentUser.role==='admin'?'ADMIN':(currentUser.role==='leadgen'?'LEADGEN':'SALES')}{pr.title?` · ${pr.title}`:''}</div>
                  </div>
                </div>
                {pr.email && <div className="phc-row"><span>✉</span>{pr.email}</div>}
                {pr.birthday && <div className="phc-row"><span>🎂</span>{fmtBirthday(pr.birthday)}{d===0?' · today!':(d!=null&&d<=30?` · in ${d}d`:'')}</div>}
                {(pr.links||[]).length>0 && <div className="phc-links">{pr.links.map((l,i)=><a key={i} className="phc-link" href={l.url} target="_blank" rel="noreferrer" title={l.url}>🔗 {l.label||l.url}</a>)}</div>}
                <div className="phc-actions">
                  <div className="phc-action" onClick={()=>{setShowRepSelect(false);setActiveRep(currentUser.name);setTab('rep-home');}}><span>📊</span>My Dashboard</div>
                  <div className="phc-action" onClick={()=>setShowProfile(true)}><span>✎</span>Edit Profile</div>
                  <div className="phc-action" onClick={()=>setShowChangePw(true)}><span>🔑</span>Change Password</div>
                  <div className="phc-action danger" onClick={logout}><span>⎋</span>Logout</div>
                </div>
              </div>
            ); })()}
          </div>
          <button className={`btn btn-outline btn-sm dark-mode-btn`} onClick={()=>setDarkMode(d=>!d)} title="Toggle dark mode" style={{fontSize:16,padding:'6px 10px'}}>
            {darkMode ? '☀' : '🌙'}
          </button>
          {isAdmin && <button className="btn btn-outline btn-sm" onClick={()=>setShowSettings(true)}>⚙ Customize</button>}
          <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out">⎋ Logout</button>
        </div>
      </div>

      <div className="app-body">
        {/* SIDEBAR */}
        {navCollapsed && <div className="sidebar-spacer"/>}
        <nav className={`sidebar${navCollapsed?' collapsed':''}`}>
          <div className="sidebar-collapse-toggle" onClick={()=>setNavCollapsed(c=>!c)} title={navCollapsed?'Pin sidebar open':'Collapse to icons'}>
            <span className="sct-icon">{navCollapsed?'»':'«'}</span><span className="sct-label">Collapse</span>
          </div>
          <div className="sidebar-section-label">Main</div>
          {NAV_MAIN.filter(n=>n.id==='attendance'?isAdmin:((n.id==='leaves'||n.id==='knowledge')?config.tabs[n.id]!==false:config.tabs[n.id])).map(n=>(
            <div key={n.id} title={n.label} className={`nav-item ${tab===n.id&&!showRepSelect?'active':''}`} onClick={()=>{setShowRepSelect(false);setTab(n.id);}}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </div>
          ))}
          <div className="nav-divider"/>
          <div className="sidebar-section-label">Lead Filters</div>
          {NAV_FILTER.filter(n=>config.tabs[n.id]).map(n=>(
            <div key={n.id} title={n.label} className={`nav-item ${tab===n.id&&!showRepSelect?'active':''}`} onClick={()=>{setShowRepSelect(false);setTab(n.id);}}>
              <span className="nav-icon">{n.icon}</span>{n.label}
              <span className={`nav-badge ${n.cls}`}>{n.count}</span>
            </div>
          ))}
          {(config.campaigns||[]).length>0 && <>
            <div className="nav-divider"/>
            <div className="sidebar-section-label">Campaigns</div>
            {(config.campaigns||[]).map(c=>{
              const id=c.id.toLowerCase();
              const cnt=vLeads.filter(l=>l.campaigns.includes(c.id)).length;
              return(
                <div key={id} title={c.label} className={`nav-item ${tab===id&&!showRepSelect?'active':''}`} onClick={()=>{setShowRepSelect(false);setTab(id);}}>
                  <span className="nav-icon" style={{color:c.color}}>●</span>{c.label}
                  <span className="nav-badge">{cnt}</span>
                </div>
              );
            })}
          </>}
          {/* Admins navigate every rep here; a rep reaches their OWN dashboard via
              the topbar profile button (so there's a single profile control). */}
          {isAdmin && <>
          <div className="nav-divider"/>
          <div className="sidebar-section-label">Sales Reps</div>
          {(config.salesReps||[]).map(r=>{
            // Active (non-contacted) leads — the rep's remaining work queue.
            const cnt=vLeads.filter(l=>l.assignedTo===r && !l.tags.includes('Contacted')).length;
            return(
              <div key={r} title={r} className={`nav-item ${tab==='rep-home'&&activeRep===r?'active':''}`} onClick={()=>{setShowRepSelect(false);setActiveRep(r);setTab('rep-home');}}>
                <div style={{position:'relative',flexShrink:0}}>
                  <RepAvatar rep={r} config={config} size={20} online={activeRep===r} bgOverride="var(--sidebar)"/>
                </div>
                {r}
                <span className="nav-badge">{cnt}</span>
              </div>
            );
          })}
          </>}
          <div style={{flex:1}}/>
          <div className="sidebar-footer">
            {isAdmin && <div className="nav-item settings" title="Settings & Customize" onClick={()=>setShowSettings(true)}>
              <span className="nav-icon">⚙</span>Settings &amp; Customize
            </div>}
            <div className="nav-item settings" title="Change Password" onClick={()=>setShowChangePw(true)}>
              <span className="nav-icon">🔑</span>Change Password
            </div>
            {isAdmin && <div className="nav-item settings" title="Reset Teammate's Password" onClick={()=>setShowAdminReset(true)}>
              <span className="nav-icon">🛠</span>Reset Teammate's Password
            </div>}
            <div className="nav-item settings" title={`Logout (${currentUser.name})`} onClick={logout}>
              <span className="nav-icon">⎋</span>Logout ({currentUser.name})
            </div>
          </div>
        </nav>

        {/* MAIN */}
        <div className="main">
          {!showRepSelect && !activeRep && tab!=='knowledge' && (
            <div className="main-header">
              <div>
                <h2>{PAGE_TITLE[tab]||tab}</h2>
              </div>
              <div className="main-header-right">
                {tab==='scraper' && <button className="btn btn-ghost btn-sm" onClick={()=>addToast('Manual refresh triggered','info')}>🔄 Refresh All</button>}
              </div>
            </div>
          )}
          {renderMain()}
        </div>
      </div>

      <Toast toasts={toasts}/>
      {showSettings && <SettingsDrawer config={config} onConfig={applyConfig} onClose={()=>setShowSettings(false)} addToast={addToast}/>}
      {showChangePw && <ChangePasswordModal user={currentUser} onClose={()=>setShowChangePw(false)} addToast={addToast}/>}
      {showAdminReset && isAdmin && <AdminResetModal admin={currentUser} config={config} onClose={()=>setShowAdminReset(false)} addToast={addToast}/>}
      {showProfile && <ProfileModal user={currentUser} config={config} onClose={()=>setShowProfile(false)} addToast={addToast}/>}
      {showSearch && <GlobalSearch leads={leads} config={config} isAdmin={isAdmin}
        onClose={()=>setShowSearch(false)}
        onNavigate={id=>{setShowRepSelect(false);setTab(id);}}
        onOpenRep={r=>{setShowRepSelect(false);setActiveRep(r);setTab('rep-home');}}
        onOpenLead={l=>setSearchLead(l)}
        onOpenSettings={()=>setShowSettings(true)}
        onOpenChangePw={()=>setShowChangePw(true)}
        onToggleDark={()=>setDarkMode(d=>!d)}
        onLogout={logout}/>}
      {searchLead && <LeadModal lead={searchLead} config={config} onClose={()=>setSearchLead(null)} onSave={saveL} onDelete={delL}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
