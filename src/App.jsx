import React, { useState, useEffect, useRef } from "react";
import {
  Home, Radar, History as HistoryIcon, Layers, Users, Sheet, Settings as Cog,
  Youtube, Music2, Instagram, Play, Search, ExternalLink, Mail, Megaphone,
  HelpCircle, Moon, Sun, RotateCcw, X, Check, Plus, Trash2, Send, ChevronRight,
  Flame, Ban, Recycle, UserCheck, Pencil, CheckCircle2, AlertCircle, ShieldCheck,
  CheckSquare, Square, RefreshCw, UserPlus, Calendar, Upload, ArrowRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Theme tokens                                                       */
/* ------------------------------------------------------------------ */
const DARK = {
  bg: "#0B0E14", surface: "#121622", raised: "#1A2030", border: "#252C3C",
  borderStrong: "#323B4F", text: "#E7EBF4", dim: "#8B94A8", faint: "#5A6378",
  accent: "#FF5A5F", accentSoft: "#3a1f24", chartGrid: "#222A39", inputBg: "#0E1320",
};
const LIGHT = {
  bg: "#F4F6FB", surface: "#FFFFFF", raised: "#FFFFFF", border: "#E2E7F0",
  borderStrong: "#CBD3E1", text: "#10131C", dim: "#5A6477", faint: "#9AA3B5",
  accent: "#E23B41", accentSoft: "#fde7e8", chartGrid: "#EAEEF5", inputBg: "#F4F6FB",
};

const TAGS = [
  { id: "ht", label: "HT (Hot)", color: "#FF6B57" },
  { id: "potential", label: "Potential", color: "#2DD4BF" },
  { id: "contacted", label: "Contacted", color: "#F5B544" },
  { id: "existing", label: "Existing lead", color: "#5B9DFF" },
  { id: "recycle", label: "For Recycle", color: "#B07CFF" },
  { id: "duplicate", label: "Duplicate", color: "#FF7A90" },
  { id: "notqualified", label: "Not Qualified", color: "#7C879B" },
];
const tagOf = (id) => TAGS.find((t) => t.id === id);
/* tags that flow straight into Lead Management for sales assignment */
const PIPELINE_TAGS = ["ht", "potential"];

const CAMPAIGN_PALETTE = ["#5B9DFF", "#B07CFF", "#2DD4BF", "#F5B544", "#FF7A90", "#FF6B57", "#4ADE80", "#38BDF8"];
const campColor = (name, campaigns) => CAMPAIGN_PALETTE[Math.max(0, campaigns.indexOf(name)) % CAMPAIGN_PALETTE.length];

const PLATFORMS = [
  { id: "youtube", label: "YouTube", Icon: Youtube, color: "#FF5A5F" },
  { id: "tiktok", label: "TikTok", Icon: Music2, color: "#2DD4BF" },
  { id: "instagram", label: "Instagram", Icon: Instagram, color: "#B07CFF" },
];
const platOf = (id) => PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];

const NICHES = ["Fitness", "Personal Finance", "Tech Reviews", "Cooking", "Travel",
  "Gaming", "Beauty", "Real Estate", "SaaS", "Fashion", "Education", "Crypto"];
const NAME_BANK = ["Peak", "Bright", "Nova", "Vital", "Urban", "Golden", "Pixel",
  "Wild", "Daily", "Studio", "North", "Lumen", "Echo", "Forge", "Maple", "Ember",
  "Atlas", "Drift", "Cobalt", "Sage", "Vertex", "Harbor", "Crest", "Pulse"];
const NAME_TAIL = ["Labs", "Media", "HQ", "Hub", "Collective", "Co", "Tribe",
  "Channel", "Creators", "Crew", "Studio", "World", "Daily", "TV"];

let _id = 1000;
const uid = () => `ld_${++_id}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo));
const compact = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : "" + n;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function makeLead(platform, niche, source = "scraper", email) {
  const name = `${pick(NAME_BANK)} ${pick(NAME_TAIL)}`;
  const handle = name.toLowerCase().replace(/[^a-z]/g, "");
  const base = platOf(platform);
  const url =
    platform === "youtube" ? `https://youtube.com/@${handle}`
    : platform === "tiktok" ? `https://tiktok.com/@${handle}`
    : `https://instagram.com/${handle}`;
  return {
    id: uid(), platform, channel: name, handle, url, niche,
    followers: rnd(800, 2_400_000),
    subscribers: rnd(1_000, 1_900_000),
    views: rnd(2_000, 4_000_000),
    emails: [email || `partnerships@${handle}.com`],
    emailChecked: false,
    tag: "", campaigns: [], salesRep: "", assignedAt: null, source,
    color: base.color, scrapedAt: Date.now(),
  };
}

function seed() {
  const out = [];
  [["youtube", "Fitness"], ["youtube", "Tech Reviews"], ["tiktok", "Beauty"],
   ["instagram", "Travel"], ["youtube", "Personal Finance"], ["tiktok", "Gaming"],
   ["youtube", "Education"]].forEach(([p, n]) => out.push(makeLead(p, n)));
  // one creator, two channels, shared email (demonstrates 1 email / many channels)
  const shared = "hello@peakcreators.com";
  out[0].emails = [shared]; out[0].channel = "Peak Fitness";
  out.push(makeLead("tiktok", "Fitness", "scraper", shared));
  out[out.length - 1].channel = "Peak Shorts";
  // pre-stage the pipeline
  out[0].tag = "ht"; out[0].campaigns = ["MSN", "VVV"];
  out[1].tag = "potential"; out[1].campaigns = ["VVV"]; out[1].salesRep = "Pen"; out[1].assignedAt = Date.now() - 864e5;
  out[2].tag = "notqualified";
  out[3].tag = "recycle";
  out[4].tag = "potential"; out[4].campaigns = ["MSN"]; out[4].salesRep = "Chase"; out[4].assignedAt = Date.now() - 2 * 864e5;
  return out;
}

/* ---- Google Sheets / CSV import helpers -------------------------- */
function parseTable(text) {
  const t = (text || "").replace(/^\uFEFF/, "").trim();
  if (!t) return { headers: [], rows: [] };
  const delim = t.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
  const lines = []; let field = "", row = [], inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); lines.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  row.push(field); lines.push(row);
  const headers = lines[0].map((h) => h.trim());
  const rows = lines.slice(1).filter((r) => r.some((c) => c && c.trim()));
  return { headers, rows };
}
const toNum = (v) => {
  if (v == null) return 0;
  const s = String(v).trim().toUpperCase().replace(/,/g, "");
  const m = parseFloat(s); if (isNaN(m)) return 0;
  return s.endsWith("M") ? Math.round(m * 1e6) : s.endsWith("K") ? Math.round(m * 1e3) : Math.round(m);
};
const detectPlatform = (s) => {
  const x = (s || "").toLowerCase();
  return x.includes("tiktok") ? "tiktok" : (x.includes("insta") || /\big\b/.test(x)) ? "instagram" : "youtube";
};
const IMPORT_FIELDS = [
  { key: "channel", label: "Channel name", hints: ["channel", "name", "creator", "title", "account"] },
  { key: "url", label: "URL / Link", hints: ["url", "link", "profile", "handle"] },
  { key: "platform", label: "Platform", hints: ["platform", "network", "site"] },
  { key: "niche", label: "Niche", hints: ["niche", "category", "topic", "industry"] },
  { key: "email", label: "Email", hints: ["email", "mail", "contact"] },
  { key: "followers", label: "Followers", hints: ["follower"] },
  { key: "subscribers", label: "Subscribers", hints: ["subscriber", "subs"] },
  { key: "views", label: "Views", hints: ["view"] },
];
function autoMap(headers) {
  const m = {};
  IMPORT_FIELDS.forEach((f) => {
    const i = headers.findIndex((h) => f.hints.some((k) => h.toLowerCase().includes(k)));
    m[f.key] = i;
  });
  return m;
}
function rowToLead(cells, map) {
  const g = (k) => (map[k] >= 0 ? (cells[map[k]] || "").trim() : "");
  const channel = g("channel") || "Untitled channel";
  const url = g("url");
  const platform = detectPlatform(g("platform") || url || channel);
  const base = platOf(platform);
  const handle = (url.split("@")[1] || channel).toLowerCase().replace(/[^a-z0-9]/g, "") || "creator";
  const email = g("email");
  return {
    id: uid(), platform, channel, handle,
    url: url || `https://${platform === "youtube" ? "youtube.com/@" : platform === "tiktok" ? "tiktok.com/@" : "instagram.com/"}${handle}`,
    niche: g("niche") || "—",
    followers: toNum(g("followers")), subscribers: toNum(g("subscribers")), views: toNum(g("views")),
    emails: email ? [email] : [`partnerships@${handle}.com`],
    emailChecked: false, tag: "", campaigns: [], salesRep: "", assignedAt: null,
    source: "sheets", color: base.color, scrapedAt: Date.now(),
  };
}

/* persistence (browser localStorage) */
async function loadState() {
  try { const v = localStorage.getItem("scraper:state2"); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}
async function saveState(s) { try { localStorage.setItem("scraper:state2", JSON.stringify(s)); } catch (e) {} }

/* ================================================================== */
export default function App() {
  const [theme, setTheme] = useState("dark");
  const [view, setView] = useState("home");
  const [leads, setLeads] = useState(seed);
  const [campaigns, setCampaigns] = useState(["MSN", "VVV"]);
  const [reps, setReps] = useState(["Pen", "Rein", "Chase", "Mikka"]);
  const [log, setLog] = useState([{ id: uid(), time: now(), text: "Dashboard initialised", snapshot: null }]);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [modal, setModal] = useState(null);
  const [sel, setSel] = useState([]);        // selected lead ids (bulk)
  const [loaded, setLoaded] = useState(false);

  const T = theme === "dark" ? DARK : LIGHT;

  useEffect(() => {
    let on = true;
    loadState().then((s) => {
      if (on && s) {
        s.theme && setTheme(s.theme);
        s.leads && setLeads(s.leads);
        s.campaigns && setCampaigns(s.campaigns);
        s.reps && setReps(s.reps);
        s.log && setLog(s.log);
        s.lastRefresh && setLastRefresh(s.lastRefresh);
      }
      if (on) setLoaded(true);
    });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    if (loaded) saveState({ theme, leads, campaigns, reps, log: log.slice(0, 60), lastRefresh });
  }, [theme, leads, campaigns, reps, log, lastRefresh, loaded]);

  useEffect(() => { setSel([]); }, [view]);   // clear selection when switching tabs

  function record(text, snap = true) {
    setLog((l) => [{ id: uid(), time: now(), text, snapshot: snap ? JSON.stringify(leads) : null }, ...l].slice(0, 80));
  }
  function updateLead(id, patch, text) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (text) record(text);
  }
  function assignRep(id, rep, channel) {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, salesRep: rep, assignedAt: rep ? Date.now() : null } : l)));
    record(rep ? `Assigned ${channel} to ${rep}` : `Unassigned ${channel}`);
  }
  function bulkAssign(rep) {
    const ids = new Set(sel);
    setLeads((ls) => ls.map((l) => (ids.has(l.id) ? { ...l, salesRep: rep, assignedAt: Date.now() } : l)));
    record(`Bulk-assigned ${sel.length} lead(s) to ${rep}`);
    setSel([]);
  }
  function toggleCampaign(id, camp, channel) {
    setLeads((ls) => ls.map((l) => {
      if (l.id !== id) return l;
      const has = l.campaigns.includes(camp);
      return { ...l, campaigns: has ? l.campaigns.filter((c) => c !== camp) : [...l.campaigns, camp] };
    }));
    record(`Updated campaigns for ${channel}`);
  }
  function setEmails(id, emails, channel) { updateLead(id, { emails, emailChecked: false }, `Updated email(s) for ${channel}`); }
  function validateLead(id) { updateLead(id, { emailChecked: true }); }
  function validateAll() {
    setLeads((ls) => ls.map((l) => ({ ...l, emailChecked: true })));
    record("Validated all emails");
  }
  function dailyRefresh() {
    setLeads((ls) => ls.map((l) => ({ ...l, followers: Math.max(500, Math.round(l.followers * (0.97 + Math.random() * 0.08))) })));
    setLastRefresh(Date.now());
    record("Daily refresh — follower counts updated, tagged leads re-sorted");
  }
  function restore(entry) {
    if (!entry.snapshot) return;
    setLeads(JSON.parse(entry.snapshot));
    setLog((l) => [{ id: uid(), time: now(), text: `Restored state from ${entry.time}`, snapshot: null }, ...l]);
  }

  // auto daily refresh if stale
  useEffect(() => { if (loaded && Date.now() - lastRefresh > 864e5) dailyRefresh(); }, [loaded]); // eslint-disable-line

  const cssVars = {
    "--bg": T.bg, "--surface": T.surface, "--raised": T.raised, "--border": T.border,
    "--bs": T.borderStrong, "--text": T.text, "--dim": T.dim, "--faint": T.faint,
    "--accent": T.accent, "--accent-soft": T.accentSoft, "--input": T.inputBg,
  };

  const NAV = [
    { id: "home", label: "Home", Icon: Home },
    { id: "scraper", label: "Scraper", Icon: Radar },
    { id: "previous", label: "Previously Scraped Leads", Icon: Layers },
    { id: "potential", label: "Potential leads", Icon: Flame },
    { id: "nq", label: "NQ leads", Icon: Ban },
    { id: "recycle", label: "For recycle", Icon: Recycle },
    { id: "leadmgmt", label: "Lead Management", Icon: Users },
    { id: "assigned", label: "Recently assigned leads", Icon: UserCheck },
    { id: "sheets", label: "Leads from Google Sheets", Icon: Sheet },
    { id: "history", label: "History", Icon: HistoryIcon },
  ];

  const shared = { leads, setLeads, campaigns, reps, T, record, updateLead, assignRep,
    toggleCampaign, setEmails, validateLead, validateAll, sel, setSel, bulkAssign };

  return (
    <div className="app" style={cssVars}>
      <style>{STYLES}</style>

      <aside className="side">
        <div className="brand">
          <span className="brand-mark"><Play size={14} fill="#fff" stroke="none" /></span>
          <div><div className="brand-name">Niche Signal</div><div className="brand-sub">Channel &amp; lead scraper</div></div>
        </div>
        <nav className="nav">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} className={`nav-item ${view === id ? "on" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} /><span>{label}</span>{view === id && <ChevronRight size={15} className="nav-caret" />}
            </button>
          ))}
        </nav>
        <button className={`nav-item settings ${view === "settings" ? "on" : ""}`} onClick={() => setView("settings")}>
          <Cog size={17} /><span>Settings</span>
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{labelFor(view)}</div><h1 className="h1">{titleFor(view)}</h1></div>
          <div className="topbar-actions">
            <button className="btn ghost" onClick={() => setModal("email")}><Mail size={15} />Email</button>
            <button className="btn ghost" onClick={() => setModal("campaign")}><Megaphone size={15} />Campaign</button>
            <button className="btn ghost" onClick={() => setModal("faq")}><HelpCircle size={15} />FAQs</button>
            <button className="btn ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}{theme === "dark" ? "Light" : "Dark"} mode
            </button>
          </div>
        </header>

        <div className="content">
          {view === "home" && <HomeView {...shared} go={setView} />}
          {view === "scraper" && <ScraperView {...shared} lastRefresh={lastRefresh} dailyRefresh={dailyRefresh} />}
          {view === "previous" && <PreviousView {...shared} />}
          {view === "potential" && <TagPipeView {...shared} title="Potential leads" filter={(l) => PIPELINE_TAGS.includes(l.tag)} note="HT and Potential leads flow here and into Lead Management for sales assignment." assignable />}
          {view === "nq" && <TagPipeView {...shared} title="Not Qualified leads" filter={(l) => l.tag === "notqualified"} note="Leads tagged Not Qualified. Re-tag any that become relevant." />}
          {view === "recycle" && <TagPipeView {...shared} title="For Recycle" filter={(l) => l.tag === "recycle"} note="Leads parked for a future recycle pass." />}
          {view === "leadmgmt" && <LeadMgmtView {...shared} />}
          {view === "assigned" && <AssignedView {...shared} />}
          {view === "sheets" && <SheetsView leads={leads} setLeads={setLeads} record={record} />}
          {view === "history" && <HistoryView log={log} restore={restore} />}
          {view === "settings" && <SettingsView theme={theme} setTheme={setTheme} campaigns={campaigns} setCampaigns={setCampaigns} reps={reps} setReps={setReps} setLeads={setLeads} record={record} />}
        </div>
      </main>

      {modal && (
        <Modal onClose={() => setModal(null)}>
          {modal === "faq" && <Faq />}
          {modal === "email" && <EmailCompose leads={leads} onSend={(n) => { record(`Drafted outreach email to ${n} lead(s)`, false); setModal(null); }} />}
          {modal === "campaign" && <CampaignQuick campaigns={campaigns} leads={leads} onRun={(c, n) => { record(`Started campaign “${c}” with ${n} lead(s)`, false); setModal(null); setView("leadmgmt"); }} />}
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------- Home ----------------------------- */
function HomeView({ leads, campaigns, reps, T, go }) {
  const total = leads.length;
  const inCampaign = leads.filter((l) => l.campaigns.length).length;
  const assigned = leads.filter((l) => l.salesRep).length;
  const hot = leads.filter((l) => PIPELINE_TAGS.includes(l.tag)).length;
  const stageData = [
    { name: "Scraped", v: total }, { name: "Hot / Potential", v: hot },
    { name: "In campaign", v: inCampaign }, { name: "Assigned", v: assigned },
  ];
  const tagData = TAGS.map((t) => ({ name: t.label, value: leads.filter((l) => l.tag === t.id).length, color: t.color })).filter((d) => d.value);

  return (
    <div className="stack">
      <div className="grid4">
        <Stat label="Total scraped leads" value={total} hint="across all platforms" accent={T.accent} />
        <Stat label="Hot / Potential" value={hot} hint="ready to assign" accent="#FF6B57" />
        <Stat label="In a campaign" value={inCampaign} hint={`${campaigns.length} campaigns`} accent="#5B9DFF" />
        <Stat label="Assigned to sales" value={assigned} hint={`${reps.length} reps`} accent="#F5B544" />
      </div>
      <div className="grid2">
        <Card title="Assigned leads &amp; potential" sub="Where every lead sits in the pipeline">
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: T.dim, fontSize: 12 }} axisLine={{ stroke: T.border }} tickLine={false} />
                <YAxis tick={{ fill: T.dim, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: T.accentSoft }} contentStyle={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text }} />
                <Bar dataKey="v" radius={[6, 6, 0, 0]}>{stageData.map((_, i) => <Cell key={i} fill={[T.accent, "#FF6B57", "#5B9DFF", "#F5B544"][i]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Tag breakdown" sub="How leads are qualified">
          {tagData.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tagData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>
                    {tagData.map((d, i) => <Cell key={i} fill={d.color} stroke={T.surface} strokeWidth={2} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12, color: T.dim }} />
                  <Tooltip contentStyle={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty text="No leads tagged yet." />}
        </Card>
      </div>
      <Card title="Jump back in" sub="Common next steps">
        <div className="quick-row">
          <button className="quick" onClick={() => go("scraper")}><Radar size={16} />Scrape new channels</button>
          <button className="quick" onClick={() => go("potential")}><Flame size={16} />Review potential leads</button>
          <button className="quick" onClick={() => go("leadmgmt")}><Users size={16} />Assign leads to sales</button>
        </div>
      </Card>
    </div>
  );
}
function Stat({ label, value, hint, accent }) {
  return (<div className="stat"><div className="stat-bar" style={{ background: accent }} />
    <div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-hint">{hint}</div></div>);
}

/* ------------------------------ Scraper --------------------------- */
function ScraperView({ leads, setLeads, campaigns, record, updateLead, toggleCampaign, lastRefresh, dailyRefresh }) {
  const [platform, setPlatform] = useState("youtube");
  const [niche, setNiche] = useState("Fitness");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = leads.filter((l) => l.source === "scraper");

  function run() {
    setBusy(true);
    setTimeout(() => {
      const n = rnd(4, 8);
      const fresh = Array.from({ length: n }, () => makeLead(platform, niche));
      setLeads((ls) => [...fresh, ...ls]);
      record(`Scraped ${n} ${platOf(platform).label} channels in “${niche}”${keyword ? ` · “${keyword}”` : ""}`);
      setBusy(false);
    }, 1100);
  }

  return (
    <div className="stack">
      <div className="scrape-bar">
        <div className="seg">
          {PLATFORMS.map(({ id, label, Icon, color }) => (
            <button key={id} className={`seg-btn ${platform === id ? "on" : ""}`} style={platform === id ? { borderColor: color, color } : null} onClick={() => setPlatform(id)}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
        <Select value={niche} onChange={setNiche} options={NICHES} />
        <div className="field"><Search size={15} /><input placeholder="Keyword (optional)" value={keyword} onChange={(e) => setKeyword(e.target.value)} /></div>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? <span className="spin" /> : <Radar size={15} />}{busy ? "Scraping…" : "Run scrape"}</button>
      </div>

      <div className="refresh-row">
        <span><RefreshCw size={13} /> Auto-refreshes daily · last refresh {fmtDate(lastRefresh)} {new Date(lastRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <button className="btn tiny ghost" onClick={dailyRefresh}><RefreshCw size={13} />Refresh now</button>
      </div>

      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Thumbnail</th><th>Channel name</th><th>URL</th><th>Niche</th><th className="num">Followers</th><th>Tag / Qualify</th><th>Campaign(s)</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7}><Empty text="No channels scraped yet. Pick a platform and niche, then Run scrape." /></td></tr>}
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><Thumb lead={l} /></td>
                  <td className="strong"><a href={l.url} target="_blank" rel="noopener noreferrer" className="chan">{l.channel} <ExternalLink size={12} /></a></td>
                  <td><a href={l.url} target="_blank" rel="noopener noreferrer" className="url">@{l.handle}</a></td>
                  <td><span className="chip">{l.niche}</span></td>
                  <td className="num">{compact(l.followers)}</td>
                  <td><TagSelect value={l.tag} onChange={(t) => updateLead(l.id, { tag: t }, `Tagged ${l.channel} as ${tagOf(t)?.label}`)} /></td>
                  <td><CampaignMulti selected={l.campaigns} campaigns={campaigns} onToggle={(c) => toggleCampaign(l.id, c, l.channel)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="note">Tagging <b>HT</b> or <b>Potential</b> sends a lead to <b>Lead Management</b>. A lead can sit in several campaigns at once — each campaign has its own colour.</p>
    </div>
  );
}

/* -------------------- Previously scraped (database) --------------- */
function PreviousView({ leads, setEmails, validateLead, validateAll }) {
  const [q, setQ] = useState("");
  const rows = leads.filter((l) => !q || l.channel.toLowerCase().includes(q.toLowerCase()) || l.niche.toLowerCase().includes(q.toLowerCase()) || l.emails.join(" ").includes(q.toLowerCase()));
  const sharedCount = (l) => leads.filter((o) => o.id !== l.id && o.emails.some((e) => l.emails.includes(e))).length;

  return (
    <div className="stack">
      <div className="row-between">
        <div className="field wide"><Search size={15} /><input placeholder="Search channel, niche or email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn ghost" onClick={validateAll}><ShieldCheck size={15} />Validate all emails</button>
      </div>
      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Thumbnail</th><th>Channel name</th><th>Niche</th><th className="num">Followers</th><th>Email(s)</th><th className="num">Subscribers</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6}><Empty text="No leads match your search." /></td></tr>}
              {rows.map((l) => {
                const extra = sharedCount(l);
                return (
                  <tr key={l.id}>
                    <td><Thumb lead={l} /></td>
                    <td className="strong">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="chan">{l.channel}</a>
                      {extra > 0 && <span className="multi-badge" title="Same email used on other channels">+{extra} channel{extra > 1 ? "s" : ""}</span>}
                    </td>
                    <td><span className="chip">{l.niche}</span></td>
                    <td className="num">{compact(l.followers)}</td>
                    <td><EmailCell lead={l} onSave={(em) => setEmails(l.id, em, l.channel)} onValidate={() => validateLead(l.id)} /></td>
                    <td className="num">{compact(l.subscribers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="note">A creator usually has <b>one email across several channels</b>. Edit or add emails per lead, then validate. Channels sharing an email show a <span className="multi-badge inline">+ channels</span> badge.</p>
    </div>
  );
}

/* email cell with inline edit + multiple emails + validation status */
function EmailCell({ lead, onSave, onValidate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lead.emails);
  useEffect(() => { setDraft(lead.emails); }, [lead.emails]);

  if (editing) {
    return (
      <div className="email-edit">
        {draft.map((e, i) => (
          <div className="email-input-row" key={i}>
            <input value={e} onChange={(ev) => setDraft(draft.map((x, j) => j === i ? ev.target.value : x))} placeholder="name@domain.com" />
            {draft.length > 1 && <button className="icon-btn" onClick={() => setDraft(draft.filter((_, j) => j !== i))}><X size={13} /></button>}
          </div>
        ))}
        <div className="email-edit-actions">
          <button className="btn tiny ghost" onClick={() => setDraft([...draft, ""])}><Plus size={12} />Email</button>
          <button className="btn tiny primary" onClick={() => { onSave(draft.filter((x) => x.trim())); setEditing(false); }}><Check size={12} />Save</button>
          <button className="btn tiny ghost" onClick={() => { setDraft(lead.emails); setEditing(false); }}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="email-view">
      <div className="email-list">
        {lead.emails.map((e, i) => {
          const ok = EMAIL_RE.test(e);
          return (<span className="email-item" key={i}>
            {lead.emailChecked ? (ok ? <CheckCircle2 size={13} className="ok" /> : <AlertCircle size={13} className="bad" />) : <span className="dot-unchecked" />}
            <span className={lead.emailChecked && !ok ? "muted strike" : "muted"}>{e}</span>
          </span>);
        })}
      </div>
      <div className="email-actions">
        <button className="icon-btn" title="Edit emails" onClick={() => setEditing(true)}><Pencil size={13} /></button>
        <button className="icon-btn" title="Validate" onClick={onValidate}><ShieldCheck size={13} /></button>
      </div>
    </div>
  );
}

/* -------- Generic tag pipeline view (Potential / NQ / Recycle) ---- */
function TagPipeView({ leads, reps, campaigns, title, filter, note, assignable, updateLead, assignRep, toggleCampaign, sel, setSel, bulkAssign }) {
  const rows = leads.filter(filter);
  return (
    <div className="stack">
      <p className="note">{note}</p>
      {assignable && sel.length > 0 && <BulkBar count={sel.length} reps={reps} onAssign={bulkAssign} onClear={() => setSel([])} />}
      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              {assignable && <th className="cb"><SelAll rows={rows} sel={sel} setSel={setSel} /></th>}
              <th>Thumbnail</th><th>Channel name</th><th>Niche</th><th className="num">Followers</th>
              {assignable ? <><th>Campaign(s)</th><th>Assign to sales</th></> : <th>Re-tag</th>}
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={assignable ? 7 : 6}><Empty text="No leads here yet." /></td></tr>}
              {rows.map((l) => (
                <tr key={l.id} className={sel.includes(l.id) ? "sel" : ""}>
                  {assignable && <td className="cb"><CB on={sel.includes(l.id)} onClick={() => setSel((s) => s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id])} /></td>}
                  <td><Thumb lead={l} /></td>
                  <td className="strong"><a href={l.url} target="_blank" rel="noopener noreferrer" className="chan">{l.channel}</a></td>
                  <td><span className="chip">{l.niche}</span></td>
                  <td className="num">{compact(l.followers)}</td>
                  {assignable ? (
                    <>
                      <td><CampaignMulti selected={l.campaigns} campaigns={campaigns} onToggle={(c) => toggleCampaign(l.id, c, l.channel)} /></td>
                      <td><Select value={l.salesRep} placeholder="Assign rep" options={reps} small onChange={(r) => assignRep(l.id, r, l.channel)} /></td>
                    </>
                  ) : (
                    <td><TagSelect value={l.tag} onChange={(t) => updateLead(l.id, { tag: t }, `Re-tagged ${l.channel} as ${tagOf(t)?.label}`)} /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------- Lead Management ----------------------- */
function LeadMgmtView({ leads, campaigns, reps, assignRep, toggleCampaign, sel, setSel, bulkAssign }) {
  const [campFilter, setCampFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("recent");

  const inPipeline = leads.filter((l) => l.campaigns.length || PIPELINE_TAGS.includes(l.tag));
  let rows = inPipeline.filter((l) => {
    if (campFilter !== "all" && !l.campaigns.includes(campFilter)) return false;
    if (repFilter === "unassigned" && l.salesRep) return false;
    if (repFilter !== "all" && repFilter !== "unassigned" && l.salesRep !== repFilter) return false;
    if (statusFilter === "unassigned" && l.salesRep) return false;
    if (statusFilter === "assigned" && !l.salesRep) return false;
    return true;
  });
  rows = [...rows].sort((a, b) =>
    sort === "channel" ? a.channel.localeCompare(b.channel)
    : sort === "followers" ? b.followers - a.followers
    : (b.assignedAt || b.scrapedAt) - (a.assignedAt || a.scrapedAt));

  const repCount = (r) => leads.filter((l) => l.salesRep === r).length;
  const unassigned = inPipeline.filter((l) => !l.salesRep).length;

  return (
    <div className="stack">
      <div className="filter-bar">
        <div className="seg sm">
          <button className={`seg-btn ${campFilter === "all" ? "on" : ""}`} onClick={() => setCampFilter("all")}>All campaigns</button>
          {campaigns.map((c) => (
            <button key={c} className={`seg-btn ${campFilter === c ? "on" : ""}`} onClick={() => setCampFilter(c)}>
              <span className="cdot" style={{ background: campColor(c, campaigns) }} />{c}
            </button>
          ))}
        </div>
        <div className="select sm rep-select">
          <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
            <option value="all">All reps</option>
            <option value="unassigned">Unassigned ({unassigned})</option>
            {reps.map((r) => <option key={r} value={r}>{r} ({repCount(r)})</option>)}
          </select>
        </div>
        <div className="seg sm">
          {["all", "unassigned", "assigned"].map((f) => (
            <button key={f} className={`seg-btn ${statusFilter === f ? "on" : ""}`} onClick={() => setStatusFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <div className="select sm">
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Sort: Most recent</option>
            <option value="channel">Sort: Channel A–Z</option>
            <option value="followers">Sort: Followers</option>
          </select>
        </div>
      </div>

      {sel.length > 0 && <BulkBar count={sel.length} reps={reps} onAssign={bulkAssign} onClear={() => setSel([])} />}

      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th className="cb"><SelAll rows={rows} sel={sel} setSel={setSel} /></th>
              <th>Thumbnail</th><th>Channel name</th><th>Email</th><th>Campaign(s)</th>
              <th>Assign to sales</th><th>Date assigned</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8}><Empty text="No leads in the pipeline. Tag leads HT/Potential or add a campaign to send them here." /></td></tr>}
              {rows.map((l) => (
                <tr key={l.id} className={sel.includes(l.id) ? "sel" : ""}>
                  <td className="cb"><CB on={sel.includes(l.id)} onClick={() => setSel((s) => s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id])} /></td>
                  <td><Thumb lead={l} /></td>
                  <td className="strong"><a href={l.url} target="_blank" rel="noopener noreferrer" className="chan">{l.channel}</a></td>
                  <td className="muted">{l.emails[0]}{l.emails.length > 1 && <span className="multi-badge">+{l.emails.length - 1}</span>}</td>
                  <td><div className="camp-chips">{l.campaigns.length === 0 ? <span className="faint">—</span> : l.campaigns.map((c) => <span key={c} className="camp" style={{ background: campColor(c, campaigns) + "22", color: campColor(c, campaigns) }}>{c}</span>)}</div></td>
                  <td><Select value={l.salesRep} placeholder="Assign rep" options={reps} small onChange={(r) => assignRep(l.id, r, l.channel)} /></td>
                  <td className="muted">{l.salesRep ? <span className="date"><Calendar size={12} />{fmtDate(l.assignedAt)}</span> : "—"}</td>
                  <td>{l.salesRep ? <span className="pill ok"><Check size={12} />Assigned</span> : <span className="pill warn">Unassigned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="sub-h">Sales — leads by rep <span>(most recent first)</span></h2>
      <div className="grid4">
        {reps.map((r) => {
          const mine = leads.filter((l) => l.salesRep === r).sort((a, b) => (b.assignedAt || 0) - (a.assignedAt || 0));
          return (
            <div className="rep-card" key={r}>
              <div className="rep-head"><span className="rep-avatar">{r[0]}</span><div><div className="rep-name">{r}</div><div className="rep-count">{mine.length} lead{mine.length !== 1 ? "s" : ""}</div></div></div>
              <ul className="rep-list">
                {mine.length === 0 && <li className="rep-empty">No leads yet</li>}
                {mine.slice(0, 5).map((l) => <li key={l.id}><span className="rep-dot" style={{ background: l.color }} />{l.channel}<span className="rep-camp">{fmtDate(l.assignedAt)}</span></li>)}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------- Recently assigned ------------------------- */
function AssignedView({ leads, campaigns }) {
  const rows = leads.filter((l) => l.salesRep).sort((a, b) => (b.assignedAt || 0) - (a.assignedAt || 0));
  return (
    <div className="stack">
      <p className="note">Every lead that has been routed to a sales rep, newest first.</p>
      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Thumbnail</th><th>Channel name</th><th>Sales rep</th><th>Campaign(s)</th><th>Date assigned</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5}><Empty text="No leads assigned yet." /></td></tr>}
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><Thumb lead={l} /></td>
                  <td className="strong">{l.channel}</td>
                  <td><span className="rep-tag"><span className="rep-avatar sm">{l.salesRep[0]}</span>{l.salesRep}</span></td>
                  <td><div className="camp-chips">{l.campaigns.map((c) => <span key={c} className="camp" style={{ background: campColor(c, campaigns) + "22", color: campColor(c, campaigns) }}>{c}</span>)}</div></td>
                  <td className="muted"><span className="date"><Calendar size={12} />{fmtDate(l.assignedAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------- Google Sheets import -------------------- */
function SheetsView({ leads, setLeads, record }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState({ headers: [], rows: [] });
  const [map, setMap] = useState({});
  const fileRef = useRef(null);
  const imported = leads.filter((l) => l.source === "sheets");

  function ingest(text) {
    const p = parseTable(text);
    setParsed(p);
    setMap(autoMap(p.headers));
  }
  function onPaste(v) { setRaw(v); ingest(v); }
  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { setRaw(String(r.result)); ingest(String(r.result)); };
    r.readAsText(f);
  }
  function doImport() {
    const fresh = parsed.rows.map((cells) => rowToLead(cells, map));
    setLeads((ls) => [...fresh, ...ls]);
    record(`Imported ${fresh.length} leads from Google Sheets`);
    setRaw(""); setParsed({ headers: [], rows: [] }); setMap({});
  }

  const hasData = parsed.headers.length > 0 && parsed.rows.length > 0;
  const mappedCount = IMPORT_FIELDS.filter((f) => map[f.key] >= 0).length;

  return (
    <div className="stack">
      <Card title="Import your leads from Google Sheets" sub="Paste a copied range or upload a CSV exported from Sheets — your columns are matched automatically.">
        <ol className="steps">
          <li><b>In Google Sheets:</b> select your rows and copy (Ctrl/Cmd-C), or use <i>File → Download → CSV</i>.</li>
          <li><b>Here:</b> paste below (or upload the file), check the column matches, then import.</li>
        </ol>
        <textarea className="import-ta" placeholder="Paste your sheet here — include the header row.&#10;e.g.  Channel	URL	Email	Niche	Followers" value={raw} onChange={(e) => onPaste(e.target.value)} />
        <div className="import-actions">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}><Upload size={15} />Upload CSV / TSV</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }} onChange={onFile} />
          {hasData && <span className="note">{parsed.rows.length} rows · {parsed.headers.length} columns detected · {mappedCount}/{IMPORT_FIELDS.length} fields matched</span>}
        </div>
      </Card>

      {hasData && (
        <>
          <Card title="Match your columns" sub="We guessed these from your headers — change any that look wrong. Channel name is required.">
            <div className="map-grid">
              {IMPORT_FIELDS.map((f) => (
                <div className="map-row" key={f.key}>
                  <span className="map-field">{f.label}</span>
                  <ArrowRight size={14} className="map-arrow" />
                  <div className="select sm">
                    <select value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                      <option value={-1}>— not in sheet —</option>
                      {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Preview" sub={`First ${Math.min(5, parsed.rows.length)} of ${parsed.rows.length} leads`} flush>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Channel</th><th>Platform</th><th>Niche</th><th>Email</th><th className="num">Followers</th></tr></thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((cells, i) => {
                    const l = rowToLead(cells, map);
                    return <tr key={i}><td className="strong">{l.channel}</td><td>{platOf(l.platform).label}</td>
                      <td><span className="chip">{l.niche}</span></td><td className="muted">{l.emails[0]}</td>
                      <td className="num">{compact(l.followers)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="row-between">
            <span className="note">Leads import to the database, ready to tag and run through the pipeline.</span>
            <button className="btn primary" disabled={map.channel == null || map.channel < 0} onClick={doImport}>
              <Plus size={15} />Import {parsed.rows.length} leads
            </button>
          </div>
        </>
      )}

      <h2 className="sub-h">Imported leads <span>({imported.length})</span></h2>
      <Card flush>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Thumbnail</th><th>Channel name</th><th>Email</th><th>Niche</th><th className="num">Followers</th><th>Source</th></tr></thead>
            <tbody>
              {imported.length === 0 && <tr><td colSpan={6}><Empty text="No imported leads yet. Paste or upload your sheet above." /></td></tr>}
              {imported.map((l) => (
                <tr key={l.id}><td><Thumb lead={l} /></td><td className="strong">{l.channel}</td><td className="muted">{l.emails[0]}</td>
                  <td><span className="chip">{l.niche}</span></td><td className="num">{compact(l.followers)}</td>
                  <td><span className="pill sheet"><Sheet size={11} />Sheets</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ History --------------------------- */
function HistoryView({ log, restore }) {
  return (
    <div className="stack">
      <p className="note">Every change made across the dashboard is recorded here. Entries with a snapshot can be restored.</p>
      <Card flush>
        <ul className="timeline">
          {log.map((e) => (
            <li key={e.id}><span className="dot" /><div className="tl-body"><div className="tl-text">{e.text}</div><div className="tl-time">{e.time}</div></div>
              {e.snapshot && <button className="btn tiny ghost" onClick={() => restore(e)}><RotateCcw size={13} />Restore</button>}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------ Settings -------------------------- */
function SettingsView({ theme, setTheme, campaigns, setCampaigns, reps, setReps, setLeads, record }) {
  const [c, setC] = useState(""); const [r, setR] = useState("");
  return (
    <div className="stack settings-grid">
      <Card title="Appearance" sub="Switch between light and dark">
        <div className="seg"><button className={`seg-btn ${theme === "dark" ? "on" : ""}`} onClick={() => setTheme("dark")}><Moon size={14} />Dark</button>
          <button className={`seg-btn ${theme === "light" ? "on" : ""}`} onClick={() => setTheme("light")}><Sun size={14} />Light</button></div>
      </Card>
      <Card title="Campaigns" sub="Each campaign gets its own highlight colour">
        <div className="list-editor">
          <div className="chips">{campaigns.map((i) => <span className="chip rm" key={i}><span className="cdot" style={{ background: campColor(i, campaigns) }} />{i}<button onClick={() => setCampaigns(campaigns.filter((x) => x !== i))}><X size={12} /></button></span>)}</div>
          <div className="add-row"><div className="field"><input placeholder="New campaign name" value={c} onChange={(e) => setC(e.target.value)} onKeyDown={(e) => e.key === "Enter" && c.trim() && (setCampaigns([...campaigns, c.trim()]), record(`Created campaign ${c.trim()}`, false), setC(""))} /></div>
            <button className="btn ghost" onClick={() => c.trim() && (setCampaigns([...campaigns, c.trim()]), record(`Created campaign ${c.trim()}`, false), setC(""))}><Plus size={15} />Add</button></div>
        </div>
      </Card>
      <Card title="Sales reps" sub="Who leads can be assigned to">
        <div className="list-editor">
          <div className="chips">{reps.map((i) => <span className="chip rm" key={i}>{i}<button onClick={() => setReps(reps.filter((x) => x !== i))}><X size={12} /></button></span>)}</div>
          <div className="add-row"><div className="field"><input placeholder="New rep name" value={r} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => e.key === "Enter" && r.trim() && (setReps([...reps, r.trim()]), record(`Added sales rep ${r.trim()}`, false), setR(""))} /></div>
            <button className="btn ghost" onClick={() => r.trim() && (setReps([...reps, r.trim()]), record(`Added sales rep ${r.trim()}`, false), setR(""))}><Plus size={15} />Add</button></div>
        </div>
      </Card>
      <Card title="Data" sub="Reset the dashboard"><button className="btn danger" onClick={() => { setLeads([]); record("Cleared all leads"); }}><Trash2 size={15} />Clear all leads</button></Card>
    </div>
  );
}

/* ----------------------------- Modals ----------------------------- */
function Modal({ children, onClose }) {
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}>
    <button className="modal-x" onClick={onClose}><X size={18} /></button>{children}</div></div>);
}
function Faq() {
  const items = [
    ["What does the scraper do?", "It collects public channel data from YouTube, TikTok and Instagram — name, niche, followers, subscribers and a contact email — and refreshes daily, re-sorting tagged leads into their tabs."],
    ["How do leads reach sales?", "Tag a lead HT or Potential (or add a campaign). It then shows in Lead Management where you assign a sales rep — one at a time or in bulk with the checkboxes."],
    ["Can one lead be in two campaigns?", "Yes. Campaigns are multi-select per lead, and each campaign has its own colour so you can see overlaps at a glance."],
    ["One creator, many channels?", "Creators often share one email across channels. Edit emails per lead; channels sharing an email show a “+ channels” badge."],
    ["Can I undo a change?", "Open History and click Restore on any snapshot entry."],
  ];
  return (<div className="faq"><h2 className="modal-h">FAQs</h2>{items.map(([q, a], i) => <div className="faq-item" key={i}><div className="faq-q">{q}</div><div className="faq-a">{a}</div></div>)}</div>);
}
function EmailCompose({ leads, onSend }) {
  const withEmail = leads.filter((l) => l.emails.some((e) => EMAIL_RE.test(e)));
  const [subject, setSubject] = useState("Quick collab idea for your channel");
  return (<div className="compose"><h2 className="modal-h">New outreach email</h2>
    <div className="form-row"><label>To</label><div className="field"><input value={`${withEmail.length} leads with a valid email`} readOnly /></div></div>
    <div className="form-row"><label>Subject</label><div className="field"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div></div>
    <div className="form-row"><label>Message</label><textarea defaultValue={"Hi {{channel}},\n\nLove what you're doing in {{niche}}. We'd like to explore a partnership…"} /></div>
    <button className="btn primary" onClick={() => onSend(withEmail.length)}><Send size={15} />Draft to {withEmail.length} leads</button></div>);
}
function CampaignQuick({ campaigns, leads, onRun }) {
  const [c, setC] = useState(campaigns[0] || "");
  const count = leads.filter((l) => l.campaigns.includes(c)).length;
  return (<div className="compose"><h2 className="modal-h">Run a campaign</h2>
    <div className="form-row"><label>Campaign</label><Select value={c} onChange={setC} options={campaigns} /></div>
    <p className="note" style={{ margin: "4px 0 14px" }}>{count} lead(s) currently in “{c}”.</p>
    <button className="btn primary" onClick={() => onRun(c, count)}><Megaphone size={15} />Launch “{c}”</button></div>);
}

/* --------------------------- Small parts -------------------------- */
function Card({ title, sub, children, flush }) {
  return (<section className={`card ${flush ? "flush" : ""}`}>
    {title && <header className="card-head"><h3 dangerouslySetInnerHTML={{ __html: title }} />{sub && <p dangerouslySetInnerHTML={{ __html: sub }} />}</header>}
    <div className={flush ? "" : "card-body"}>{children}</div></section>);
}
function Thumb({ lead }) {
  const P = platOf(lead.platform);
  return (<a href={lead.url} target="_blank" rel="noopener noreferrer" className="thumb" style={{ background: `${lead.color}22`, borderColor: `${lead.color}55` }} title="Open channel">
    <P.Icon size={16} style={{ color: lead.color }} /><span className="thumb-init">{lead.channel.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span></a>);
}
function Empty({ text }) { return <div className="empty">{text}</div>; }
function CB({ on, onClick }) { return <button className="cbx" onClick={onClick}>{on ? <CheckSquare size={17} className="cbx-on" /> : <Square size={17} />}</button>; }
function SelAll({ rows, sel, setSel }) {
  const ids = rows.map((r) => r.id); const all = ids.length > 0 && ids.every((i) => sel.includes(i));
  return <CB on={all} onClick={() => setSel(all ? sel.filter((i) => !ids.includes(i)) : Array.from(new Set([...sel, ...ids])))} />;
}
function BulkBar({ count, reps, onAssign, onClear }) {
  const [r, setR] = useState("");
  return (<div className="bulk-bar"><span><UserPlus size={15} />{count} selected</span>
    <div className="select sm"><select value={r} onChange={(e) => setR(e.target.value)}><option value="">Assign to rep…</option>{reps.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
    <button className="btn primary tiny" disabled={!r} onClick={() => { onAssign(r); setR(""); }}><Check size={13} />Assign {count}</button>
    <button className="btn ghost tiny" onClick={onClear}>Clear</button></div>);
}
function Select({ value, onChange, options, placeholder = "Select", small }) {
  return (<div className={`select ${small ? "sm" : ""}`}><select value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{placeholder}</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>);
}
function TagSelect({ value, onChange }) {
  const t = tagOf(value);
  return (<div className="tag-select" style={t ? { borderColor: `${t.color}77` } : null}>
    {t && <span className="tag-dot" style={{ background: t.color }} />}
    <select value={value} onChange={(e) => onChange(e.target.value)} style={t ? { color: t.color } : null}>
      <option value="">Tag…</option>{TAGS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>);
}
function CampaignMulti({ selected, campaigns, onToggle }) {
  return (
    <details className="multi">
      <summary>
        {selected.length === 0 ? <span className="faint">Add campaign</span>
          : <span className="camp-chips">{selected.map((c) => <span key={c} className="camp" style={{ background: campColor(c, campaigns) + "22", color: campColor(c, campaigns) }}>{c}</span>)}</span>}
        <ChevronRight size={13} className="multi-caret" />
      </summary>
      <div className="multi-pop">
        {campaigns.map((c) => (
          <label key={c} className="multi-opt">
            <input type="checkbox" checked={selected.includes(c)} onChange={() => onToggle(c)} />
            <span className="cdot" style={{ background: campColor(c, campaigns) }} />{c}
          </label>
        ))}
      </div>
    </details>
  );
}

const labelFor = (v) => ({ home: "Overview", scraper: "Collect", previous: "Database", potential: "Pipeline", nq: "Triage", recycle: "Triage", leadmgmt: "Pipeline", assigned: "Sales", sheets: "Import", history: "Audit trail", settings: "Configure" }[v] || "");
const titleFor = (v) => ({ home: "Home", scraper: "Scraper", previous: "Previously scraped leads", potential: "Potential leads", nq: "NQ leads", recycle: "For recycle", leadmgmt: "Lead Management", assigned: "Recently assigned leads", sheets: "Leads from Google Sheets", history: "History", settings: "Settings" }[v] || "");

/* ------------------------------- CSS ------------------------------ */
const STYLES = `
* { box-sizing: border-box; }
.app { --r:14px; display:flex; min-height:100vh; background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
.side { width:252px; flex-shrink:0; background:var(--surface); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:18px 14px; position:sticky; top:0; height:100vh; overflow:auto; }
.brand { display:flex; gap:11px; align-items:center; padding:6px 8px 16px; }
.brand-mark { width:30px; height:30px; border-radius:9px; background:var(--accent); display:grid; place-items:center; box-shadow:0 4px 14px var(--accent-soft); }
.brand-name { font-weight:700; font-size:15px; letter-spacing:-.2px; }
.brand-sub { font-size:11px; color:var(--faint); }
.nav { display:flex; flex-direction:column; gap:2px; flex:1; }
.nav-item { display:flex; align-items:center; gap:11px; width:100%; padding:9px 11px; border-radius:10px; background:none; border:none; color:var(--dim); font-size:13px; cursor:pointer; text-align:left; position:relative; transition:.15s; }
.nav-item span { flex:1; }
.nav-item:hover { background:var(--raised); color:var(--text); }
.nav-item.on { background:var(--accent-soft); color:var(--accent); font-weight:600; }
.nav-item.on svg { color:var(--accent); }
.nav-caret { opacity:.7; }
.settings { margin-top:6px; }
.main { flex:1; min-width:0; display:flex; flex-direction:column; }
.topbar { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; padding:22px 28px 18px; border-bottom:1px solid var(--border); background:var(--surface); position:sticky; top:0; z-index:5; flex-wrap:wrap; }
.eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); font-weight:700; }
.h1 { font-size:24px; font-weight:700; letter-spacing:-.5px; margin:3px 0 0; }
.topbar-actions { display:flex; gap:8px; flex-wrap:wrap; }
.content { padding:24px 28px 60px; }
.stack { display:flex; flex-direction:column; gap:18px; max-width:1240px; }
.row-between { display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.btn { display:inline-flex; align-items:center; gap:7px; padding:9px 14px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; border:1px solid var(--border); background:var(--raised); color:var(--text); transition:.15s; white-space:nowrap; }
.btn:hover { border-color:var(--bs); }
.btn.ghost { background:transparent; color:var(--dim); }
.btn.ghost:hover { color:var(--text); background:var(--raised); }
.btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; box-shadow:0 6px 18px var(--accent-soft); }
.btn.primary:hover { filter:brightness(1.05); }
.btn.primary:disabled { opacity:.5; cursor:default; box-shadow:none; }
.btn.danger { color:#ff7a90; border-color:#ff7a9044; background:transparent; }
.btn.danger:hover { background:#ff7a9011; }
.btn.tiny { padding:6px 10px; font-size:12px; }
.card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); overflow:visible; }
.card.flush { overflow:hidden; }
.card-head { padding:16px 18px 0; }
.card-head h3 { font-size:14.5px; font-weight:700; margin:0; }
.card-head p { font-size:12.5px; color:var(--dim); margin:3px 0 0; }
.card-body { padding:16px 18px; }
.grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.stat { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:16px; position:relative; overflow:hidden; }
.stat-bar { position:absolute; left:0; top:0; bottom:0; width:3px; }
.stat-label { font-size:12px; color:var(--dim); }
.stat-value { font-size:30px; font-weight:750; letter-spacing:-1px; margin:6px 0 2px; }
.stat-hint { font-size:11.5px; color:var(--faint); }
.quick-row { display:flex; gap:10px; flex-wrap:wrap; }
.quick { display:inline-flex; align-items:center; gap:8px; padding:11px 15px; border-radius:11px; border:1px solid var(--border); background:var(--raised); color:var(--text); font-size:13px; font-weight:600; cursor:pointer; transition:.15s; }
.quick:hover { border-color:var(--accent); color:var(--accent); }
.quick svg { color:var(--accent); }
.scrape-bar, .filter-bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:12px; }
.refresh-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--faint); padding:0 4px; }
.refresh-row span { display:inline-flex; align-items:center; gap:6px; }
.seg { display:inline-flex; gap:4px; background:var(--input); border:1px solid var(--border); border-radius:11px; padding:3px; flex-wrap:wrap; }
.seg.sm .seg-btn { padding:6px 11px; font-size:12px; }
.seg-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 13px; border-radius:8px; border:1px solid transparent; background:none; color:var(--dim); font-size:12.5px; font-weight:600; cursor:pointer; transition:.12s; }
.seg-btn:hover { color:var(--text); }
.seg-btn.on { background:var(--surface); color:var(--text); border-color:var(--bs); box-shadow:0 2px 8px rgba(0,0,0,.18); }
.cdot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.field { display:flex; align-items:center; gap:8px; background:var(--input); border:1px solid var(--border); border-radius:10px; padding:0 11px; height:38px; color:var(--faint); }
.field.wide { flex:1; min-width:200px; }
.field input { background:none; border:none; outline:none; color:var(--text); font-size:13px; width:100%; height:100%; }
.field input::placeholder { color:var(--faint); }
.select select { appearance:none; background:var(--input); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:8px 30px 8px 12px; font-size:13px; cursor:pointer; outline:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B94A8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 9px center; }
.select.sm select { padding:6px 28px 6px 10px; font-size:12.5px; }
.rep-select select { min-width:140px; }
.tag-select { display:inline-flex; align-items:center; gap:6px; background:var(--input); border:1px solid var(--border); border-radius:10px; padding-left:9px; }
.tag-select select { appearance:none; background:transparent; border:none; padding:7px 26px 7px 2px; font-weight:600; font-size:12.5px; color:var(--text); outline:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B94A8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 8px center; }
.tag-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
/* campaign multi-select */
.multi { position:relative; }
.multi summary { list-style:none; display:flex; align-items:center; gap:6px; background:var(--input); border:1px solid var(--border); border-radius:10px; padding:6px 9px; font-size:12.5px; cursor:pointer; min-width:120px; }
.multi summary::-webkit-details-marker { display:none; }
.multi-caret { color:var(--faint); margin-left:auto; transition:.15s; }
.multi[open] .multi-caret { transform:rotate(90deg); }
.multi-pop { position:absolute; z-index:20; margin-top:5px; background:var(--surface); border:1px solid var(--bs); border-radius:11px; padding:6px; min-width:160px; box-shadow:0 12px 30px rgba(0,0,0,.35); }
.multi-opt { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; font-size:12.5px; cursor:pointer; }
.multi-opt:hover { background:var(--raised); }
.multi-opt input { accent-color:var(--accent); }
.camp-chips { display:flex; gap:4px; flex-wrap:wrap; }
.camp { display:inline-block; padding:2px 8px; border-radius:7px; font-size:11px; font-weight:700; }
.table-wrap { overflow-x:auto; }
.tbl { width:100%; border-collapse:collapse; font-size:13px; }
.tbl th { text-align:left; padding:12px 14px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); font-weight:700; border-bottom:1px solid var(--border); white-space:nowrap; }
.tbl td { padding:10px 14px; border-bottom:1px solid var(--border); vertical-align:middle; }
.tbl tbody tr:last-child td { border-bottom:none; }
.tbl tbody tr:hover { background:var(--raised); }
.tbl tbody tr.sel { background:var(--accent-soft); }
.tbl .num { text-align:right; font-variant-numeric:tabular-nums; }
.tbl th.num { text-align:right; }
.tbl .cb, .tbl th.cb { width:36px; padding-right:0; }
.strong { font-weight:600; }
.muted { color:var(--dim); }
.faint { color:var(--faint); }
.strike { text-decoration:line-through; opacity:.6; }
.chan { color:var(--text); text-decoration:none; display:inline-flex; align-items:center; gap:5px; }
.chan:hover { color:var(--accent); }
.chan svg { color:var(--faint); }
.url { color:#5B9DFF; text-decoration:none; font-size:12.5px; }
.url:hover { text-decoration:underline; }
.chip { display:inline-block; padding:3px 9px; border-radius:7px; background:var(--input); border:1px solid var(--border); font-size:11.5px; color:var(--dim); }
.thumb { display:inline-flex; align-items:center; gap:7px; padding:6px 9px; border-radius:9px; border:1px solid; text-decoration:none; }
.thumb-init { font-size:11px; font-weight:800; color:var(--text); letter-spacing:.04em; }
.multi-badge { margin-left:6px; font-size:10.5px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:1px 7px; border-radius:6px; }
.multi-badge.inline { margin:0; }
.pill { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:20px; font-size:11.5px; font-weight:700; }
.pill.ok { background:#2dd4bf1f; color:#2DD4BF; }
.pill.warn { background:#f5b5441f; color:#F5B544; }
.pill.sheet { background:#5b9dff1f; color:#5B9DFF; }
.date { display:inline-flex; align-items:center; gap:5px; }
.cbx { background:none; border:none; cursor:pointer; color:var(--faint); padding:2px; display:grid; place-items:center; }
.cbx-on { color:var(--accent); }
.bulk-bar { display:flex; align-items:center; gap:12px; background:var(--accent-soft); border:1px solid var(--accent); border-radius:12px; padding:9px 14px; font-size:13px; font-weight:600; color:var(--accent); flex-wrap:wrap; }
.bulk-bar > span { display:inline-flex; align-items:center; gap:7px; }
.bulk-bar .select select { background:var(--surface); }
/* email cell */
.email-view { display:flex; align-items:flex-start; gap:8px; }
.email-list { display:flex; flex-direction:column; gap:3px; }
.email-item { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; }
.email-item .ok { color:#2DD4BF; } .email-item .bad { color:#FF7A90; }
.dot-unchecked { width:9px; height:9px; border-radius:50%; border:1.5px solid var(--faint); display:inline-block; }
.email-actions { display:flex; gap:2px; margin-left:auto; }
.icon-btn { background:none; border:1px solid var(--border); border-radius:7px; width:26px; height:26px; display:grid; place-items:center; color:var(--dim); cursor:pointer; }
.icon-btn:hover { color:var(--accent); border-color:var(--accent); }
.email-edit { display:flex; flex-direction:column; gap:6px; min-width:230px; }
.email-input-row { display:flex; gap:6px; align-items:center; }
.email-input-row input { flex:1; background:var(--input); border:1px solid var(--border); border-radius:8px; padding:6px 9px; font-size:12.5px; color:var(--text); outline:none; }
.email-edit-actions { display:flex; gap:6px; }
.timeline { list-style:none; margin:0; padding:6px 0; }
.timeline li { display:flex; align-items:center; gap:14px; padding:11px 18px; border-bottom:1px solid var(--border); }
.timeline li:last-child { border-bottom:none; }
.dot { width:9px; height:9px; border-radius:50%; background:var(--accent); flex-shrink:0; box-shadow:0 0 0 4px var(--accent-soft); }
.tl-body { flex:1; } .tl-text { font-size:13.5px; } .tl-time { font-size:11.5px; color:var(--faint); margin-top:2px; }
.sub-h { font-size:15px; font-weight:700; margin:6px 0 -4px; }
.sub-h span { color:var(--faint); font-weight:500; font-size:13px; }
.rep-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:14px; }
.rep-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.rep-avatar { width:34px; height:34px; border-radius:9px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-weight:800; font-size:15px; }
.rep-avatar.sm { width:24px; height:24px; font-size:12px; border-radius:7px; }
.rep-tag { display:inline-flex; align-items:center; gap:7px; font-weight:600; }
.rep-name { font-weight:700; font-size:14px; } .rep-count { font-size:11.5px; color:var(--faint); }
.rep-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.rep-list li { display:flex; align-items:center; gap:8px; font-size:12.5px; }
.rep-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.rep-camp { margin-left:auto; font-size:10.5px; color:var(--faint); background:var(--input); padding:1px 7px; border-radius:6px; }
.rep-empty { color:var(--faint); font-size:12.5px; font-style:italic; }
.settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.list-editor { display:flex; flex-direction:column; gap:12px; }
.chips { display:flex; flex-wrap:wrap; gap:7px; }
.chip.rm { display:inline-flex; align-items:center; gap:6px; }
.chip.rm button { background:none; border:none; color:var(--faint); cursor:pointer; padding:0; display:grid; place-items:center; }
.chip.rm button:hover { color:var(--accent); }
.add-row { display:flex; gap:8px; } .add-row .field { flex:1; }
.note { font-size:12.5px; color:var(--dim); margin:2px 2px; }
.empty { padding:36px 16px; text-align:center; color:var(--faint); font-size:13px; }
.overlay { position:fixed; inset:0; background:rgba(4,6,11,.62); backdrop-filter:blur(3px); display:grid; place-items:center; z-index:50; padding:20px; }
.modal { background:var(--surface); border:1px solid var(--bs); border-radius:18px; width:min(540px,100%); max-height:88vh; overflow:auto; padding:26px; position:relative; box-shadow:0 30px 80px rgba(0,0,0,.5); }
.modal-x { position:absolute; top:16px; right:16px; background:var(--raised); border:1px solid var(--border); border-radius:9px; width:32px; height:32px; display:grid; place-items:center; cursor:pointer; color:var(--dim); }
.modal-x:hover { color:var(--text); }
.modal-h { font-size:19px; font-weight:700; margin:0 0 16px; }
.faq-item { padding:13px 0; border-bottom:1px solid var(--border); } .faq-item:last-child { border:none; }
.faq-q { font-weight:700; font-size:14px; } .faq-a { font-size:13px; color:var(--dim); margin-top:4px; line-height:1.55; }
.compose .form-row { margin-bottom:13px; }
.compose label { display:block; font-size:12px; color:var(--dim); margin-bottom:6px; font-weight:600; }
.compose textarea { width:100%; min-height:110px; resize:vertical; background:var(--input); border:1px solid var(--border); border-radius:10px; padding:11px; color:var(--text); font-size:13px; font-family:inherit; outline:none; line-height:1.5; }
.compose .select select, .compose .field { width:100%; }
.spin { width:14px; height:14px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:sp .7s linear infinite; }
@keyframes sp { to { transform:rotate(360deg); } }
.steps { margin:0 0 14px; padding-left:18px; font-size:13px; color:var(--dim); line-height:1.7; }
.steps b { color:var(--text); }
.import-ta { width:100%; min-height:120px; resize:vertical; background:var(--input); border:1px solid var(--border); border-radius:11px; padding:12px; color:var(--text); font-size:12.5px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; outline:none; line-height:1.55; }
.import-ta:focus { border-color:var(--accent); }
.import-actions { display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap; }
.map-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 24px; }
.map-row { display:flex; align-items:center; gap:10px; }
.map-field { font-size:13px; font-weight:600; min-width:104px; }
.map-arrow { color:var(--faint); flex-shrink:0; }
.map-row .select { flex:1; } .map-row .select select { width:100%; }
@media (max-width:1024px){ .grid4{grid-template-columns:repeat(2,1fr);} .grid2{grid-template-columns:1fr;} .settings-grid{grid-template-columns:1fr;} .map-grid{grid-template-columns:1fr;} }
@media (max-width:720px){ .side{display:none;} .grid4{grid-template-columns:1fr 1fr;} }
`;
