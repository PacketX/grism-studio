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
