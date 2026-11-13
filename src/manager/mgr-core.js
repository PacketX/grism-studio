/* ============================================================
   GRISM Manager — the pure logic of its pages (no React), tested by test.js.
   ============================================================ */

/* What a node's status means on the page. "unknown" is a node nobody has
   asked yet since the manager started; everything but online is a problem. */
export const NODE_STATUSES = ["online", "unknown", "offline", "auth", "cert", "error"];

export function statusTone(status) {
  if (status === "online") return "ok";
  if (status === "unknown" || !status) return "dim";
  return "bad";
}

export const nodeStatus = (n) => n?.state?.status || "unknown";
export const nodeAlerts = (n) => (n?.state?.alerts || []).length;

export function isProblem(n) {
  return nodeStatus(n) !== "online" || nodeAlerts(n) > 0;
}

/* The line a node runs, named the way the release notes name it: the 7.x
   line is the arm64 one, 6.x the MIPS64 one, whatever the capabilities say. */
export function lineName(n) {
  const fw = String(n?.firmware || "");
  if (fw.startsWith("7.")) return "ARM64";
  if (fw.startsWith("6.")) return "MIPS64";
  const l = String(n?.line || "").toLowerCase();
  if (l === "dpdk") return "ARM64";
  if (l) return "MIPS64";
  return "";
}

export function matchesQuery(n, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const hay = [n.name, n.address, n.model, n.firmware, lineName(n), nodeStatus(n), ...(n.tags || [])]
    .map((x) => String(x || "").toLowerCase());
  return s.split(/\s+/).every((w) => hay.some((h) => h.includes(w)));
}

export function filterNodes(nodes, q, show) {
  return (nodes || []).filter((n) => matchesQuery(n, q) && (show === "problems" ? isProblem(n)
    : show === "online" ? nodeStatus(n) === "online" : true));
}

const SORTERS = {
  name: (n) => String(n.name || "").toLowerCase(),
  status: (n) => [NODE_STATUSES.indexOf(nodeStatus(n)) === 0 ? 1 : 0, String(n.name || "").toLowerCase()],
  address: (n) => String(n.address || "").split(".").map((x) => x.padStart(3, "0")).join("."),
  model: (n) => String(n.model || "").toLowerCase(),
  firmware: (n) => String(n.firmware || ""),
  cpu: (n) => Number(n?.state?.system?.cpu_avg ?? -1),
  traffic: (n) => Number(n?.state?.in_mbps || 0) + Number(n?.state?.out_mbps || 0),
  alerts: (n) => nodeAlerts(n),
};

function cmp(a, b) {
  if (Array.isArray(a)) {
    for (let i = 0; i < a.length; i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/* Problems first when sorting by status (a node that is down is what one opens
   the page for); every other key ties on the name, so the order is stable. */
export function sortNodes(nodes, key = "name", dir = 1) {
  const f = SORTERS[key] || SORTERS.name;
  return [...(nodes || [])].sort((a, b) => cmp(f(a), f(b)) * dir || cmp(SORTERS.name(a), SORTERS.name(b)));
}

/* Traffic in Mb/s as the node reports it, in a unit a person reads. */
export function fmtMbps(v) {
  const x = Number(v) || 0;
  if (x <= 0) return "0";
  if (x < 1) return (x * 1000).toFixed(x * 1000 < 10 ? 1 : 0) + " kb/s";
  if (x < 1000) return x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0) + " Mb/s";
  return (x / 1000).toFixed(x < 10000 ? 2 : 1) + " Gb/s";
}

/* "12 s", "3 min", "2 h", "5 d" ago; a time in the future (a clock skew) is "now". */
export function fmtAgo(ts, now = Date.now() / 1000) {
  const t = Number(ts) || 0;
  if (!t) return "";
  const d = Math.max(0, now - t);
  if (d < 60) return Math.floor(d) + " s";
  if (d < 3600) return Math.floor(d / 60) + " min";
  if (d < 86400) return Math.floor(d / 3600) + " h";
  return Math.floor(d / 86400) + " d";
}

export function fmtTime(ts) {
  const t = Number(ts) || 0;
  if (!t) return "";
  const d = new Date(t * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* The add-a-node form, checked before anything is sent: keys of the problems
   (the page names them in its own language). */
export function nodeFormProblems(f) {
  const out = [];
  if (String(f.name || "").trim().length > 64) out.push("nameLong");     // blank: the manager names it after its model
  const a = String(f.address || "").trim();
  if (!a) out.push("address");
  else if (!/^[0-9A-Za-z.:[\]-]+$/.test(a)) out.push("addressBad");
  const port = Number(f.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) out.push("port");
  if (!String(f.username || "").trim()) out.push("username");
  if (!String(f.password || "")) out.push("password");
  const m = String(f.manager_address || "").trim();
  if (m && !/^[0-9A-Fa-f.:]+$/.test(m)) out.push("managerAddress");
  return out;
}

/* A password against the manager's policy, the same rules the server applies
   (security.policy_problems): keys of what is missing. */
export function passwordProblems(pw, username, policy) {
  const p = policy || {};
  const s = String(pw || "");
  const out = [];
  if (s.length < Number(p.min_length || 0)) out.push("length");
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((rx) => rx.test(s)).length;
  if (classes < Number(p.min_classes || 0)) out.push("classes");
  if (username && s.toLowerCase() === String(username).toLowerCase()) out.push("name");
  return out;
}

/* An API error's detail as text: FastAPI answers {"detail": "..."} or, for a
   node that could not be added, {"detail": {"code", "message"}}. */
export function errorText(body, status) {
  const d = body && typeof body === "object" ? body.detail : null;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && d.message) return d.message;
  if (Array.isArray(d) && d.length) return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
  return status ? "HTTP " + status : "error";
}

export const errorCode = (body) => (body && body.detail && typeof body.detail === "object" ? body.detail.code || "" : "");

export const PRIV_LEVELS = [1, 5, 10, 15];
export const roleOf = (priv) => ({ 1: "view", 5: "operator", 10: "config", 15: "admin" })[priv] || "view";

/* The fleet in numbers, from /api/v1/summary: how many answer, how many do not. */
export function summaryCounts(s) {
  const st = (s && s.status) || {};
  const total = Number(s?.nodes || 0);
  const online = Number(st.online || 0);
  return { total, online, problem: total - online - Number(st.unknown || 0), unknown: Number(st.unknown || 0),
           alerts: Number(s?.alerts || 0) };
}

/* ---------------- firmware ---------------- */

/* Release numbers compare as numbers, part by part: 7.6.261111.1 < 7.6.261111.10. */
export function versionCompare(a, b) {
  const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/* The images there are for one model, newest release first (then newest upload). */
export function imagesFor(images, model) {
  return (images || []).filter((i) => i.model === model)
    .sort((a, b) => versionCompare(b.version, a.version) || (b.uploaded || 0) - (a.uploaded || 0));
}

/* What a batch update would do: per selected node, the image its model gets
   (the one chosen for that model, else the newest), and whether the node runs it
   already. `choice` maps a model to an image id. */
export function firmwarePlan(nodes, selected, images, choice = {}) {
  const sel = new Set(selected || []);
  return (nodes || []).filter((n) => sel.has(n.id)).map((n) => {
    const list = imagesFor(images, n.model);
    const img = list.find((i) => i.id === choice[n.model]) || list[0] || null;
    const same = !!img && img.version === n.firmware && sameRevision(img.revision, n.revision);
    return { node: n, image: img, same };
  });
}

/* Two revisions, either possibly shortened, name one commit (the manager's same_revision). */
export function sameRevision(a, b) {
  const x = String(a || "").trim(), y = String(b || "").trim();
  if (!x || !y) return true;
  const n = Math.min(x.length, y.length, 40);
  return n >= 7 && x.slice(0, n) === y.slice(0, n);
}

/* The image per model a plan sends to /api/v1/firmware/jobs. */
export function planImages(plan) {
  const out = {};
  (plan || []).forEach((p) => { if (p.image) out[p.node.model] = p.image.id; });
  return Object.values(out);
}

export function jobTone(state) {
  return state === "done" || state === "skipped" ? "ok" : state === "failed" || state === "interrupted" ? "bad"
    : state === "running" ? "run" : "dim";
}

/* An item's upload, 0-100, or null when it is not uploading. */
export function uploadPercent(item) {
  if (!item || item.stage !== "upload" || !item.total) return null;
  return Math.max(0, Math.min(100, Math.round((100 * (item.sent || 0)) / item.total)));
}

export function fmtDurationS(s) {
  const x = Math.max(0, Math.round(Number(s) || 0));
  if (x < 60) return x + " s";
  return Math.floor(x / 60) + " min " + String(x % 60).padStart(2, "0") + " s";
}

/* ---------------- the daily backup ---------------- */

/* The schedule is kept as a minute of the UTC day; the page shows and takes it in
   the browser's own time. `offset` is minutes east of UTC (-Date#getTimezoneOffset()). */
export function utcMinuteToLocal(utcMinute, offset) {
  const m = (((Number(utcMinute) || 0) + (Number(offset) || 0)) % 1440 + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

export function localToUtcMinute(hhmm, offset) {
  const mt = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!mt || Number(mt[1]) > 23 || Number(mt[2]) > 59) return null;
  return (((Number(mt[1]) * 60 + Number(mt[2]) - (Number(offset) || 0)) % 1440) + 1440) % 1440;
}

/* ---------------- the host's settings ---------------- */

/* The settings as the page edits them: the time servers as one line, every
   number a string. */
export function hostSettingsToForm(s) {
  const x = s || {};
  return {
    ntp: (x.ntp || []).join(", "),
    syslog: (x.syslog || []).map((t) => ({ host: t.host || "", port: String(t.port || 514), proto: t.proto || "udp" })),
    access: (x.access || []).map((r) => ({ src: r.src || "", sport: r.sport || "", dport: r.dport || "" })),
  };
}

export function hostFormToSettings(f) {
  return {
    ntp: String(f.ntp || "").split(/[,\s]+/).map((v) => v.trim()).filter(Boolean),
    syslog: (f.syslog || []).filter((t) => String(t.host || "").trim())
      .map((t) => ({ host: String(t.host).trim(), port: Number(t.port) || 514, proto: t.proto === "tcp" ? "tcp" : "udp" })),
    access: (f.access || []).filter((r) => String(r.src || "").trim())
      .map((r) => ({ src: String(r.src).trim(), sport: String(r.sport || "").trim(), dport: String(r.dport || "").trim() })),
  };
}

function ipv4ToInt(ip) {
  const p = String(ip || "").trim().split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((a, x) => a * 256 + Number(x), 0);
}

/* Whether an access list lets `ip` reach `port` -- the manager's own check
   (hostcfg.admits), so the page warns before the save is refused. */
export function accessAdmits(access, ip, port) {
  if (!access || !access.length) return true;
  const a = ipv4ToInt(ip);
  if (a == null) return false;
  return access.some((r) => {
    const [net, bits = "32"] = String(r.src || "").trim().split("/");
    const n = ipv4ToInt(net), b = Number(bits);
    if (n == null || !(b >= 0 && b <= 32)) return false;
    const mask = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0;
    const inNet = ((a & mask) >>> 0) === ((n & mask) >>> 0);
    const ports = String(r.dport || "").split(/[,\s]+/).filter(Boolean);
    return inNet && (!ports.length || ports.includes(String(port)));
  });
}

/* ---------------- the sign-in server ---------------- */

const SOURCE_NAMES = { local: "local", tacacs: "TACACS+", radius: "RADIUS" };
export function sourceName(s) { return SOURCE_NAMES[s] || s || ""; }

export function authToForm(a) {
  const x = a || {};
  const servers = (x.servers || []).map((s) => ({ host: s.host || "", port: String(s.port || "") }));
  return {
    mode: x.mode || "local", servers: servers.length ? servers : [{ host: "", port: "" }], secret: "",
    timeout: String(x.timeout || 5), default_priv: Number(x.default_priv) || 1, fallback: x.fallback !== false,
    require_ma: x.require_ma !== false, local_hosts: (x.local_hosts || []).join(", "),
  };
}

export function formToAuth(f) {
  const out = {
    mode: f.mode,
    servers: (f.servers || []).filter((s) => String(s.host || "").trim())
      .map((s) => ({ host: String(s.host).trim(), port: Number(s.port) || (f.mode === "tacacs" ? 49 : 1812) })),
    timeout: Number(f.timeout) || 5, default_priv: Number(f.default_priv) || 1, fallback: !!f.fallback,
    require_ma: !!f.require_ma, local_hosts: String(f.local_hosts || "").split(/[,\s]+/).map((v) => v.trim()).filter(Boolean),
  };
  if (f.secret) out.secret = f.secret;      // none: the one the manager keeps
  return out;
}

/* ---------------- the host's management interfaces ---------------- */

/* One row per interface that is not a card's link: what it has now, and what
   the manager is to set (system = the installer's own file decides). */
export function mgmtToForm(interfaces, mgmt) {
  return (interfaces || []).filter((x) => !x.card).map((x) => {
    const m = (mgmt || {})[x.iface];
    const cur = (x.addresses || [])[0] || "";
    return {
      iface: x.iface, state: x.state, addresses: x.addresses || [], gateway_now: x.gateway || "",
      mode: m ? m.mode : "system",
      address: m && m.mode === "static" ? m.address : cur,
      gateway: m && m.mode === "static" ? m.gateway || "" : x.gateway || "",
      dns: m && m.mode === "static" ? (m.dns || []).join(", ") : "",
    };
  });
}

export function formToMgmt(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.mode === "dhcp") out[r.iface] = { mode: "dhcp" };
    else if (r.mode === "static") {
      out[r.iface] = { mode: "static", address: String(r.address || "").trim(), gateway: String(r.gateway || "").trim(),
        dns: String(r.dns || "").split(/[,\s]+/).map((v) => v.trim()).filter(Boolean) };
    }
  }
  return out;
}

export function mgmtChanged(rows, mgmt) {
  return JSON.stringify(formToMgmt(rows)) !== JSON.stringify(normMgmt(mgmt));
}

function normMgmt(mgmt) {
  const out = {};
  for (const [k, m] of Object.entries(mgmt || {})) {
    out[k] = m.mode === "dhcp" ? { mode: "dhcp" } : { mode: "static", address: m.address, gateway: m.gateway || "", dns: m.dns || [] };
  }
  return out;
}

/* ---------------- this host ---------------- */

export function fmtBps(v) {
  if (v == null) return "–";
  const units = [["Gbps", 1e9], ["Mbps", 1e6], ["kbps", 1e3]];
  for (const [u, d] of units) if (v >= d) return `${(v / d).toFixed(v >= d * 100 ? 0 : 1)} ${u}`;
  return `${Math.round(v)} bps`;
}

/* "8.0 GT/s x4 (of 32.0 GT/s x4)" from sysfs's link fields; the maximum only when it differs. */
export function pcieText(p) {
  if (!p) return "–";
  const sp = (x) => String(x || "").replace(" PCIe", "");
  const now = `${sp(p.speed)} x${p.width}`;
  const max = `${sp(p.max_speed)} x${p.max_width}`;
  return now === max || !p.max_speed ? now : `${now} (${max})`;
}

/* What a vendor leaves in an unset DMI serial field. */
export function placeholderSerial(s) {
  const v = String(s || "").trim();
  return !v || /^0123456789/.test(v) || /^(to be filled|default string|not specified|system serial number)/i.test(v) || /^0+$/.test(v);
}

/* ---------------- traffic charts ---------------- */

export const RANGES = ["1h", "6h", "24h", "7d", "30d"];
export const RANGE_SECONDS = { "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800, "30d": 2592000 };

/* Clean y-axis steps from 0 to at least `max`: 1, 2, 2.5, 5 x 10^n. */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let i = 0; i <= count + 1; i++) {
    const v = +(step * i).toPrecision(12);
    out.push(v);
    if (v >= max) break;
  }
  return out;
}

/* Time-axis ticks at round local times, about one per `px` pixels. */
export function timeTicks(from, to, width, px = 110) {
  const span = to - from;
  if (!(span > 0) || !(width > 0)) return [];
  const want = Math.max(2, Math.floor(width / px));
  const steps = [300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 345600, 604800];
  const step = steps.find((x) => span / x <= want) || 604800;
  const tz = -new Date(from * 1000).getTimezoneOffset() * 60;   // local midnight, local hours
  const out = [];
  for (let t = Math.ceil((from + tz) / step) * step - tz; t <= to; t += step) out.push(t);
  return out;
}

const pad2 = (n) => String(n).padStart(2, "0");
const DAYISH = 86400 * 1.05;     // a 24-hour view starts at a bucket boundary, so it spans a little more than a day
export function fmtTick(t, span) {
  const d = new Date(t * 1000);
  return span <= DAYISH ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtWhen(t, span) {
  const d = new Date(t * 1000);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return span <= DAYISH ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/* A line's path: one subpath per run of points no further apart than `gap` seconds. */
export function linePath(points, x, y, gap) {
  let d = "", prev = null;
  for (const [t, v] of points) {
    d += `${prev === null || t - prev > gap ? "M" : "L"}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
    prev = t;
  }
  return d;
}

/* The nearest of sorted `times` to `t`. */
export function nearestIndex(times, t) {
  if (!times.length) return -1;
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid; else hi = mid;
  }
  return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi;
}

export function fmtCount(v) {
  if (v == null) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + "G";
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v * 10) / 10);
}

/* The BMC's LAN: the form starts from what the manager set, else from what the BMC has now. */
export function bmcToForm(lan, set) {
  if (!lan) return null;
  const prefix = (mask) => (mask || "").split(".").reduce((n, o) => n + ((Number(o) >>> 0).toString(2).match(/1/g) || []).length, 0);
  if (set) return { lan, mode: set.mode, address: set.address || "", gateway: set.gateway || "" };
  const has = lan.ip && lan.ip !== "0.0.0.0";
  return { lan, mode: lan.source === "dhcp" ? "dhcp" : "static", address: has ? `${lan.ip}/${prefix(lan.mask)}` : "",
    gateway: lan.gateway && lan.gateway !== "0.0.0.0" ? lan.gateway : "" };
}

export function bmcFromForm(f) {
  return f.mode === "dhcp" ? { mode: "dhcp" } : { mode: "static", address: f.address.trim(), gateway: f.gateway.trim() };
}

/* Whether the form says something other than what is set (or, with nothing set, than what the BMC has). */
export function bmcChanged(f, set) {
  const want = JSON.stringify(bmcFromForm(f));
  return want !== JSON.stringify(bmcFromForm(bmcToForm(f.lan, set)));
}

/* A SHA-256 fingerprint as browsers show it: AB:CD:... */
export function fmtFingerprint(hex) {
  const h = String(hex || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return h ? h.match(/.{1,2}/g).join(":") : "–";
}
