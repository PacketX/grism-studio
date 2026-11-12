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
  return (nodes || []).filter((n) => matchesQuery(n, q) && (show !== "problems" || isProblem(n)));
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
  if (!String(f.name || "").trim()) out.push("name");
  else if (String(f.name).trim().length > 64) out.push("nameLong");
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
