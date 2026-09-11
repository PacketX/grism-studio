/* ============================================================
   GRISM Studio — core logic (pure, UI-free)

   Everything here is a pure function or a static catalogue: the GRISM XML
   document model, serialisers, parsers, validators, human-readable summaries
   and formatting helpers. No React, no DOM (except the XML parsers, which are
   passed text and use DOMParser where available).

   Keeping this separate means the regression suite can import and test the
   REAL implementation rather than a copy of it.
   ============================================================ */

/* XML parsing needs a DOMParser. Browsers provide one; under Node (the test
   suite) callers can inject one via setDomParser() so the same code is tested. */
let _DomParser = typeof DOMParser !== "undefined" ? DOMParser : null;
export function setDomParser(impl) { _DomParser = impl; }
function parseXml(text) {
  if (!_DomParser) throw new Error("no DOMParser available — call setDomParser()");
  return new _DomParser().parseFromString(text, "application/xml");
}

/* ============================================================
   GRISM XML Studio (integrated prototype)
   One app, one document model, three workspaces:
     • Templates — start from a known-good pattern
     • Filters   — define F1, F2… as recursive boolean trees
     • Chain     — wire ingress → filter tests → outputs
   Everything writes to a single `doc`; Export renders the whole
   <run>. Filter ids defined in Filters flow into Chain, so the
   chain knows which references are local vs device-side.
   ============================================================ */

/* ===================== shared ids / helpers ===================== */
export let _id = 0;
export const nid = () => `n${++_id}`;
export const esc = (s) => String(s).replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
export const splitList = (s) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
// Deep-clone a model object for duplication, regenerating any internal node
// "id" fields (the n… keys used for tree/mod identity) so the copy shares no
// references with the original. The top-level element id/cid is set separately.
export function cloneForDup(obj) {
  if (Array.isArray(obj)) return obj.map(cloneForDup);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === "id" && typeof val === "string" && /^n\d+$/.test(val)) out[key] = nid();
      else out[key] = cloneForDup(val);
    }
    return out;
  }
  return obj;
}

/* ===================== field catalogue =====================
   Complete GRISM <find> name list, transcribed from the official
   find.md. `kind` drives which relations are offered and how the
   value is validated. exists = boolean presence check (no value). */
export const FIELDS = [
  { g: "Ethernet / VLAN", items: [
    { v: "eth.addr", label: "MAC (src or dst)", kind: "mac" },
    { v: "eth.src", label: "Source MAC", kind: "mac" },
    { v: "eth.dst", label: "Destination MAC", kind: "mac" },
    { v: "eth.type", label: "EtherType", kind: "uint16" },
    { v: "vlan.id", label: "VLAN ID", kind: "vlan" },
    { v: "vlan.l2.id", label: "VLAN layer-2 ID", kind: "vlan" },
    { v: "vlan.priority", label: "VLAN priority", kind: "uint8" },
  ]},
  { g: "IPv4", items: [
    { v: "ip", label: "is IPv4", kind: "exists" },
    { v: "ip.addr", label: "IP (src or dst)", kind: "ip" },
    { v: "ip.src", label: "Source IP", kind: "ip" },
    { v: "ip.dst", label: "Destination IP", kind: "ip" },
    { v: "ip.proto", label: "IP protocol", kind: "uint8" },
    { v: "ip.fragment", label: "is IPv4 fragment", kind: "exists" },
    { v: "ip.flags.df", label: "don't-fragment flag", kind: "bit" },
    { v: "ip.flags.mf", label: "more-fragment flag", kind: "bit" },
    { v: "ip.dsfield", label: "DiffServ field", kind: "uint8" },
  ]},
  { g: "IPv6", items: [
    { v: "ipv6", label: "is IPv6", kind: "exists" },
    { v: "ipv6.addr", label: "IPv6 (src or dst)", kind: "ipv6" },
    { v: "ipv6.src", label: "Source IPv6", kind: "ipv6" },
    { v: "ipv6.dst", label: "Destination IPv6", kind: "ipv6" },
    { v: "ipv6.nxt", label: "Next header", kind: "uint8" },
  ]},
  { g: "TCP", items: [
    { v: "tcp", label: "is TCP", kind: "exists" },
    { v: "tcp.port", label: "TCP port (src or dst)", kind: "port" },
    { v: "tcp.srcport", label: "TCP source port", kind: "port" },
    { v: "tcp.dstport", label: "TCP dest port", kind: "port" },
    { v: "tcp.flags.syn", label: "TCP SYN", kind: "bit" },
    { v: "tcp.flags.ack", label: "TCP ACK", kind: "bit" },
    { v: "tcp.flags.fin", label: "TCP FIN", kind: "bit" },
    { v: "tcp.flags.reset", label: "TCP RST", kind: "bit" },
  ]},
  { g: "UDP / SCTP", items: [
    { v: "udp", label: "is UDP", kind: "exists" },
    { v: "udp.port", label: "UDP port (src or dst)", kind: "port" },
    { v: "udp.srcport", label: "UDP source port", kind: "port" },
    { v: "udp.dstport", label: "UDP dest port", kind: "port" },
    { v: "sctp", label: "is SCTP", kind: "exists" },
    { v: "sctp.port", label: "SCTP port (src or dst)", kind: "port" },
    { v: "sctp.srcport", label: "SCTP source port", kind: "port" },
    { v: "sctp.dstport", label: "SCTP dest port", kind: "port" },
    { v: "5-tuple", label: "5-tuple (sip dip proto sp dp)", kind: "tuple" },
  ]},
  { g: "GTP", items: [
    { v: "gtp.cp", label: "GTP control plane", kind: "exists" },
    { v: "gtp.data", label: "GTP data", kind: "exists" },
    { v: "gtp.imsi", label: "GTP IMSI", kind: "str" },
    { v: "gtp.teid", label: "GTP TEID", kind: "str" },
    { v: "gtp.data.by.s1ap.CellIdentity", label: "S1AP Cell Identity", kind: "num" },
    { v: "gtp.data.by.s1ap.SubscriberProfileIDforRFP", label: "S1AP Subscriber Profile ID for RFP", kind: "num" },
    { v: "ip.addr.related.gtp.imsi", label: "IP related to GTP IMSI", kind: "str" },
  ]},
  { g: "Tunnels", items: [
    { v: "gre", label: "is GRE", kind: "exists" },
    { v: "vxlan", label: "is VXLAN", kind: "exists" },
    { v: "vxlan.vni", label: "VXLAN VNI", kind: "uint24" },
    { v: "erspan.spanid", label: "ERSPAN ID", kind: "num" },
  ]},
  { g: "VoIP", items: [
    { v: "voip", label: "is SIP or RTP", kind: "exists" },
    { v: "voip.account", label: "VoIP account", kind: "str" },
    { v: "voip.from", label: "VoIP from", kind: "str" },
    { v: "voip.to", label: "VoIP to", kind: "str" },
  ]},
  { g: "DNS", items: [
    { v: "dns.a", label: "DNS type-A address", kind: "ip" },
    { v: "dns.flags.response", label: "DNS response flag", kind: "bit" },
    { v: "dns.count.add_rr", label: "DNS additional RR count", kind: "num" },
    { v: "dns.qry.type", label: "DNS query type", kind: "num" },
    { v: "dns.qry.name", label: "DNS query name", kind: "str" },
    { v: "dns.qry.name_public_suffix", label: "DNS query public suffix", kind: "str" },
    { v: "dns.qry.name.resp.ip.addr", label: "DNS name → response IP", kind: "str" },
  ]},
  { g: "HTTP", items: [
    { v: "http", label: "is HTTP", kind: "exists" },
    { v: "http.request", label: "is HTTP request", kind: "exists" },
    { v: "http.host", label: "HTTP host", kind: "str" },
    { v: "http.request.uri", label: "HTTP request URI", kind: "str" },
    { v: "http.request.method", label: "HTTP method", kind: "str" },
    { v: "http.request.url", label: "HTTP request URL", kind: "str" },
  ]},
  { g: "TLS / SSL", items: [
    { v: "ssl", label: "is SSL", kind: "exists" },
    { v: "ssl.server_name", label: "TLS server name (SNI)", kind: "str" },
    { v: "ssl.server_name_public_suffix", label: "TLS SNI public suffix", kind: "str" },
    { v: "ssl.handshake.type", label: "TLS handshake type", kind: "bit" },
    { v: "ssl.ja3_digest", label: "TLS JA3 digest", kind: "str" },
    { v: "ssl.ja3s_digest", label: "TLS JA3S digest", kind: "str" },
  ]},
  { g: "ARP / FTP", items: [
    { v: "arp", label: "is ARP", kind: "exists" },
    { v: "arp.request", label: "is ARP request", kind: "exists" },
    { v: "arp.reply", label: "is ARP reply", kind: "exists" },
    { v: "arp.request.target.ip", label: "ARP target IP", kind: "ip" },
    { v: "arp.request.sender.ip", label: "ARP sender IP", kind: "ip" },
    { v: "ftp", label: "is FTP", kind: "exists" },
  ]},
  { g: "ICMP", items: [
    { v: "icmp", label: "is ICMP", kind: "exists" },
    { v: "icmp.type", label: "ICMP type", kind: "num" },
    { v: "icmp.code", label: "ICMP code", kind: "num" },
  ]},
  { g: "Meta / flow / system", items: [
    { v: "regex", label: "Regular expression", kind: "regex" },
    { v: "country.iso_code", label: "Country ISO code", kind: "country" },
    { v: "packet.len", label: "Packet length", kind: "num" },
    { v: "grism.srcport", label: "Ingress port", kind: "grismport" },
    { v: "grism.port.linkdown", label: "Port link down", kind: "grismport" },
    { v: "session.packet.nth", label: "Nth packet in flow", kind: "num" },
    { v: "heartbeat.target.miss.id", label: "Heartbeat miss (target id)", kind: "num" },
    { v: "flowtable.matched.fid", label: "Flow matched filter id", kind: "fidref" },
    { v: "flowtable.inport", label: "Flow ingress port", kind: "grismport" },
    { v: "dstmac.in.l2gre.mapping.table", label: "dstMAC in l2gre table", kind: "exists" },
    { v: "dstmac.in.vxlan.mapping.table", label: "dstMAC in vxlan table", kind: "exists" },
    { v: "dstip.in.dns.response.ip.table", label: "dstIP in DNS response table", kind: "exists" },
  ]},
];
export const FIELD_INDEX = Object.fromEntries(FIELDS.flatMap((g) => g.items.map((i) => [i.v, i])));

export const RELS = {
  exists: ["==","!="], num: ["==","!=",">=","<="], uint8: ["==","!=",">=","<="],
  uint16: ["==","!=",">=","<="], uint24: ["==","!=",">=","<="], port: ["==","!=",">=","<="],
  vlan: ["==","!=",">=","<="], bit: ["==","!="],
  default: ["==","!="],
};
export const relationsFor = (k) => RELS[k] ?? RELS.default;

export const VAL = {
  mac: (s) => /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(s) ? null : "MAC expected",
  ip: (s) => /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)(\/([0-9]|[12]\d|3[0-2]))?$/.test(s) ? null : "IPv4 or CIDR",
  ipv6: (s) => /^[0-9A-Fa-f:]+(\/\d{1,3})?$/.test(s) && s.includes(":") ? null : "IPv6 address",
  port: (s) => /^\d+$/.test(s) && +s <= 65535 ? null : "Port 0–65535",
  vlan: (s) => /^\d+$/.test(s) && +s >= 1 && +s <= 4094 ? null : "VLAN 1–4094",
  uint8: (s) => /^\d+$/.test(s) && +s <= 255 ? null : "0–255",
  uint16: (s) => /^\d+$/.test(s) && +s <= 65535 ? null : "0–65535",
  uint24: (s) => /^\d+$/.test(s) && +s <= 16777215 ? null : "0–16777215",
  bit: (s) => s === "0" || s === "1" ? null : "0 or 1",
  num: (s) => /^\d+$/.test(s) ? null : "Number",
  int: (s) => /^-?\d+$/.test(s) ? null : "Integer",
  country: (s) => /^[A-Za-z]{2}$/.test(s) ? null : "ISO code, e.g. TW",
  grismport: (s) => /^[A-Z]\d+$/.test(s) ? null : "Port, e.g. P0",
  fidref: (s) => /^F\d+$/.test(s) ? null : "Filter id, e.g. F1",
  tuple: (s) => s.trim().split(/\s+/).length === 5 ? null : "5 fields: sip dip proto sp dp (- = any)",
  str: (s) => s && s.length ? null : "Required",
  regex: (s) => s && s.length ? null : "Pattern required",
  exists: () => null,
};
export const validate = (k, v) => (VAL[k] ?? VAL.str)(v ?? "");
export const ph = (k) => ({ ip:"8.8.8.8", ipv6:"2001:db8::1", mac:"12:34:56:78:9a:bc", port:"443",
  vlan:"100", uint8:"6", uint16:"2048", uint24:"1", bit:"1", country:"TW", num:"500",
  grismport:"P0", fidref:"F1", tuple:"- 192.168.1.203 - - 443", regex:"\\x08facebook\\x03com" }[k] ?? "value");

/* ===================== filter (boolean tree) model ===================== */
export const mkFind = () => ({ id: nid(), t: "find", field: "ip.addr", rel: "==", val: "" });
export const mkGroup = (op) => ({ id: nid(), t: op, children: [mkFind()] });
export const mkNot = () => ({ id: nid(), t: "not", children: [mkFind()] });

export function tUpdate(node, id, fn) {
  if (node.id === id) return fn(node);
  if (!node.children) return node;
  let ch = false;
  const kids = node.children.map((c) => { const u = tUpdate(c, id, fn); if (u !== c) ch = true; return u; });
  return ch ? { ...node, children: kids } : node;
}
export function tRemove(node, id) {
  if (!node.children) return node;
  return { ...node, children: node.children.filter((c) => c.id !== id).map((c) => tRemove(c, id)) };
}
export function serializeCriterion(node, depth) {
  const pad = "  ".repeat(depth);
  if (node.t === "find") {
    // every find emits relation + content; exists-type fields carry an empty
    // content ("") since they have no value.
    const kind = FIELD_INDEX[node.field]?.kind ?? "str";
    const rel = node.rel || "==";
    const val = kind === "exists" ? "" : node.val;
    return `${pad}<find name="${node.field}" relation="${rel}" content="${esc(val)}" />`;
  }
  const inner = (node.children ?? []).map((c) => serializeCriterion(c, depth + 1)).join("\n");
  return `${pad}<${node.t}>\n${inner}\n${pad}</${node.t}>`;
}
export function serializeFilter(f) {
  const fa = f.fattrs ?? {};
  const attrs = [`id="${f.id}"`, f.name ? `name="${esc(f.name)}"` : null,
    f.alt ? `alt="${esc(f.alt)}"` : null,
    `sessionBase="${f.sessionBase}"`,
    f.matchedlog === "yes" ? `matchedlog="yes"` : null,
    (fa.masking && fa.masking !== "no") ? `masking="${esc(fa.masking)}"` : null,
    fa.maxPackets ? `maxPackets="${esc(fa.maxPackets)}"` : null,
    fa.tuple5_live_hashtable_size ? `tuple5_live_hashtable_size="${esc(fa.tuple5_live_hashtable_size)}"` : null,
    fa.start ? `start="${esc(fa.start)}"` : null,
    fa.position ? `position="${esc(fa.position)}"` : null,
    fa.within ? `within="${esc(fa.within)}"` : null,
    fa.mpslog ? `mpslog="${esc(fa.mpslog)}"` : null,
    f.blockifempty === "yes" ? `blockifempty="yes"` : null].filter(Boolean).join(" ");
  return `<filter ${attrs}>\n${serializeCriterion(f.root, 1)}\n</filter>`;
}

/* ===================== human-readable summary (Overview page) ===================== */
// A short readable description of a filter's boolean tree, e.g.
// "TCP port == 443 OR UDP port == 443" or "country == CN,RU AND NOT (ip == …)".
export function describeCriterion(node, t) {
  const tr = t || ((k) => ({ "crit.and": "AND", "crit.or": "OR", "crit.not": "NOT", "crit.matchAll": "(matches all)", "crit.matchAny": "(matches any)" }[k] || k));
  if (!node) return "";
  if (node.t === "find") {
    const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
    const label = f?.label ?? node.field;
    if (kind === "exists") return label;
    return `${label} ${node.rel || "=="} ${node.val || "?"}`;
  }
  const AND = tr("crit.and"), OR = tr("crit.or");
  const kids = (node.children ?? []).map((c) => describeCriterion(c, t)).filter(Boolean);
  if (node.t === "not") return `${tr("crit.not")} (${kids.join(", ")})`;
  if (!kids.length) return node.t === "and" ? tr("crit.matchAll") : tr("crit.matchAny");
  const joiner = node.t === "and" ? ` ${AND} ` : ` ${OR} `;
  return kids.length > 1 ? kids.map((k) => (k.includes(` ${AND} `) || k.includes(` ${OR} `) ? `(${k})` : k)).join(joiner) : kids[0];
}
// Flatten a chain's decision tree into readable routing rules, e.g.
// [{ test: "F1", match: "P1", notmatch: "(next)" }, …] plus a terminal.
// Turn a chain's decision tree into a structure the Overview can lay out. Returns
// { root } where each test node is { id, test, op, match, notmatch } and each side
// is one of: { kind:"ports", ports, mode }, { kind:"drop" }, { kind:"default" },
// or { kind:"test", node } (the side continues into another filter test).
export let _cfid = 0;
export function summarizeChain(tree) {
  const build = (node) => {
    if (!node || node.t === "__unset__") return { kind: "default" };
    if (node.t === "out") return node.ports === "0" ? { kind: "drop" } : { kind: "ports", ports: node.ports, mode: node.mode };
    if (node.t === "branch") {
      return { kind: "test", node: {
        id: "t" + (++_cfid),
        test: node.fids || "?", op: node.fidOp || "or",
        match: build(node.match), notmatch: build(node.notmatch),
      } };
    }
    return { kind: "default" };
  };
  const top = build(tree);
  // a chain whose root is a plain output (pure forward) → no tests
  if (top.kind !== "test") return { root: null, terminal: top };
  return { root: top.node, terminal: null };
}
// Flat list kept for the text summary / port collection (order of tests).
export function summarizeChainTree(tree) {
  const rules = [];
  (function walk(node) {
    if (!node || node.t === "__unset__") return;
    if (node.t === "out") { rules.push({ terminal: node.ports === "0" ? "drop" : node.ports, terminalMode: node.mode }); return; }
    if (node.t === "branch") {
      const m = node.match, n = node.notmatch;
      const sideText = (s) => !s || s.t === "__unset__" ? "device default" : s.t === "out" ? (s.ports === "0" ? "drop" : s.ports) : "→ next test";
      const sideMode = (s) => s && s.t === "out" ? s.mode : null;
      rules.push({ test: node.fids || "?", op: node.fidOp || "or", match: sideText(m), matchMode: sideMode(m), notmatch: sideText(n), notmatchMode: sideMode(n) });
      if (m && m.t === "branch") walk(m);
      if (n && n.t === "branch") walk(n);
    }
  })(tree);
  return rules;
}
// Whole-document overview: counts, per-filter conditions, per-chain routing, ports used.
export function describeDoc(doc, t) {
  const filters = (doc.filters ?? []).map((f) => ({ id: "F" + f.id, name: f.name || f.alt || "", cond: describeCriterion(f.root, t) }));
  const filterNames = Object.fromEntries(filters.map((f) => [f.id, f.name]));
  const chains = (doc.chains ?? []).map((c) => ({ ingress: c.ports || "P0", rules: summarizeChainTree(c.tree), flow: summarizeChain(c.tree) }));
  const portSet = new Set();
  chains.forEach((c) => {
    (c.ingress || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => portSet.add(p));
    c.rules.forEach((r) => { [r.match, r.notmatch, r.terminal].filter(Boolean).forEach((v) => { if (/^[PVLO]?\d/.test(v)) v.split(",").map((s) => s.trim()).forEach((p) => portSet.add(p)); }); });
  });
  const ports = [...portSet].filter((p) => /^[A-Za-z]*\d+$/.test(p)).sort();
  return {
    counts: { filters: filters.length, chains: chains.length, ports: ports.length },
    ports, filters, filterNames, chains,
  };
}
// Resolve a fids expression (e.g. "F1", "F1,!F3") to a readable name string
// using the filter-name map, for chain-flow labels. Falls back to the raw id.
export function fidsLabel(fids, names) {
  const toks = String(fids || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!toks.length) return fids || "?";
  const parts = toks.map((tok) => {
    const neg = tok.startsWith("!"); const id = tok.replace(/^!/, "");
    const nm = names[id];
    return (neg ? "!" : "") + id + (nm ? ` ${nm}` : "");
  });
  return parts.join(", ");
}
// Just the filter name(s) for a fids expression (no ids), for the flow-diagram
// name line. Returns "" when none of the referenced filters have a name.
export function namesOnly(fids, names) {
  const toks = String(fids || "").split(",").map((s) => s.trim()).filter(Boolean);
  const nm = toks.map((tok) => { const neg = tok.startsWith("!"); const id = tok.replace(/^!/, ""); const n = names[id]; return n ? (neg ? "not " : "") + n : ""; }).filter(Boolean);
  return nm.join(", ");
}
// Used for running configs and pasted XML where there's no authored description.
// Returns an array of short observation strings.
export function inferIntent(doc, t) {
  const tr = t || ((k) => k);
  const out = [];
  const chains = doc.chains ?? [];
  const filters = doc.filters ?? [];
  if (!chains.length) return out;
  // map ingress -> set of destination ports (terminal + branch outs)
  const dests = (tree) => { const s = new Set(); (function w(n){ if(!n||n.t==="__unset__")return; if(n.t==="out"){ if(n.ports&&n.ports!=="0") n.ports.split(",").forEach((p)=>s.add(p.trim())); return; } if(n.t==="branch"){ w(n.match); w(n.notmatch); } })(tree); return s; };
  const ingressOf = (c) => (c.ports||"").split(",").map((s)=>s.trim()).filter(Boolean);
  // detect bidirectional pairs: chain A: X->…->Y and chain B: Y->…->X
  const pairs = [];
  for (let i = 0; i < chains.length; i++) for (let j = i + 1; j < chains.length; j++) {
    const ai = ingressOf(chains[i]), aj = ingressOf(chains[j]);
    const di = dests(chains[i].tree), dj = dests(chains[j].tree);
    if (ai.some((p) => dj.has(p)) && aj.some((p) => di.has(p))) pairs.push([ai[0], aj[0]]);
  }
  if (pairs.length) out.push(tr("intent.bidir").replace("{pairs}", pairs.map(([a, b]) => `${a}↔${b}`).join(", ")));
  // detect load balancing
  let lb = false;
  chains.forEach((c) => (function w(n){ if(!n)return; if(n.t==="out"&&n.mode==="loadBalance")lb=true; ["match","notmatch"].forEach((k)=>n&&n[k]&&w(n[k])); })(c.tree));
  if (lb) out.push(tr("intent.lb"));
  // detect drops
  let drops = false;
  chains.forEach((c) => (function w(n){ if(!n)return; if(n.t==="out"&&n.ports==="0")drops=true; ["match","notmatch"].forEach((k)=>n&&n[k]&&w(n[k])); })(c.tree));
  if (drops) out.push(tr("intent.drop"));
  // filter themes
  const allConds = filters.map((f) => serializeCriterion(f.root, 0)).join(" ").toLowerCase();
  if (allConds.includes("heartbeat")) out.push(tr("intent.heartbeat"));
  if (allConds.includes("443") || allConds.includes("ssl.server_name") || allConds.includes("http.host")) out.push(tr("intent.web"));
  if (allConds.includes("country")) out.push(tr("intent.geo"));
  if (allConds.includes("ip.addr") || allConds.includes("ip.src") || allConds.includes("ip.dst")) out.push(tr("intent.ip"));
  return out;
}

// An empty <or>/<and> is legal: by default it matches unconditionally
// (everything). blockifempty="yes" flips that to match nothing. So an
// empty group is NOT an error — only invalid find values are.
export function hasAnyFind(node) {
  if (!node) return false;
  if (node.t === "find") return true;
  return (node.children ?? []).some(hasAnyFind);
}
export const isEmptyFilter = (f) => !hasAnyFind(f.root);
export function filterProblems(node, out) {
  if (node.t === "find") {
    const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
    const msg = validate(kind, node.val);
    if (msg) out.push({ id: node.id, msg, label: f?.label ?? node.field });
  } else {
    (node.children ?? []).forEach((c) => filterProblems(c, out));
  }
  return out;
}

/* ===================== chain (decision tree) model ===================== */
export const UNSET = "__unset__";
export const mkOut = (ports = "P1") => ({ id: nid(), t: "out", ports, mode: "duplicate", lb: "5thash" });
export const mkDrop = () => ({ id: nid(), t: "out", ports: "0", mode: "duplicate", lb: "5thash" });
export const mkUnset = () => ({ id: nid(), t: UNSET });
export const mkBranch = (fids = "F1") => ({ id: nid(), t: "branch", fids, fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") });
export const isUnset = (n) => n && n.t === UNSET;
export const isDrop = (n) => n && n.t === "out" && n.ports === "0";

export function cUpdate(node, id, fn) {
  if (!node) return node;
  if (node.id === id) return fn(node);
  let out = node;
  for (const k of ["child", "match", "notmatch"]) if (node[k]) {
    const u = cUpdate(node[k], id, fn); if (u !== node[k]) out = { ...out, [k]: u };
  }
  return out;
}
export const setSide = (node, bid, side, val) => cUpdate(node, bid, (b) => ({ ...b, [side]: val }));

// A document holds an array of chains. Each chain is one ingress pipeline,
// identified by its <in> port. Templates may still return a single `chain`;
// normalizeDoc upgrades that to a `chains` array so the rest of the app only
// ever deals with the plural form.
export const mkChain = (ports = "P0") => ({ cid: nid(), ports, tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } });
export function normalizeDoc(d) {
  if (d.chains) return { ...d, chains: d.chains.map((c) => c.cid ? c : { ...c, cid: nid() }) };
  const { chain, ...rest } = d;
  return { ...rest, chains: [{ cid: nid(), ports: chain?.ports ?? "P0", tree: chain?.tree }] };
}

export function vlanAttrs(o) {
  if (!o || !o.vlantype) return "";
  const idAttr = o.vlanid != null && o.vlanid !== "" ? ` vlanid="${esc(o.vlanid)}"` : "";
  return ` vlantype="${o.vlantype}"${idAttr}`;
}
export function serializeChain(chain) {
  const inPorts = chain.ports || "P0";
  const emitOut = (n, pad) => {
    const attr = n.mode === "loadBalance" ? ` type="loadBalance" lbtype="${n.lb}"` : "";
    return `${pad}<out${attr}${vlanAttrs(n)}>${n.ports}</out>`;
  };
  function body(node, depth) {
    const pad = "  ".repeat(depth);
    if (!node || isUnset(node)) return null;
    if (node.t === "out") return emitOut(node, pad);
    const fidType = node.fidOp && node.fidOp !== "or" ? ` type="${node.fidOp}"` : "";
    const fidAlt = node.fidAlt ? ` alt="${esc(node.fidAlt)}"` : "";
    const lines = [`${pad}<fid${fidType}${fidAlt}>${node.fids}</fid>`];
    if (node.match && !isUnset(node.match)) {
      if (node.match.t === "out") lines.push(emitOut(node.match, pad));
      else { lines.push(`${pad}<next>`); const i = body(node.match, depth+1); if (i) lines.push(i); lines.push(`${pad}</next>`); }
    }
    if (node.notmatch && !isUnset(node.notmatch)) {
      lines.push(`${pad}<next type="notmatch">`); const i = body(node.notmatch, depth+1); if (i) lines.push(i); lines.push(`${pad}</next>`);
    }
    return lines.join("\n");
  }
  return `<chain>\n  <in${vlanAttrs(chain.inVlan)}>${inPorts}</in>\n${body(chain.tree, 1)}\n</chain>`;
}
export function chainProblems(tree, out) {
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch") {
      if (!String(n.fids || "").trim())
        out.push({ id: n.id, fids: n.fids, msg: `filter test has no filter selected` });
      else if (isUnset(n.match) && isUnset(n.notmatch))
        out.push({ id: n.id, fids: n.fids, msg: `${n.fids} routes neither side` });
    }
    // an explicit out node must send somewhere ("0" = drop is valid, blank is not)
    if (n.t === "out" && !String(n.ports ?? "").trim())
      out.push({ id: n.id, msg: `output has no port set` });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return out;
}
export function collectRefs(tree, definedIds) {
  const seen = new Map();
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch" && n.fids) n.fids.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const id = tok.replace(/^!/, "");
      if (!seen.has(id)) {
        const defined = definedIds.has(id);
        // undefined ids at/above the threshold live on the device; below it they're
        // genuinely missing from this configuration
        seen.set(id, { id, defined, onDevice: !defined && isDeviceFilterId(id) });
      }
    });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/* ===================== templates ===================== */
export const finds = (field, rel, items) => items.map((c) => ({ id: nid(), t: "find", field, rel, val: c }));
export const TEMPLATES = [
  { id: "starter", title: "Starter (heartbeat + HTTPS)", tag: "Starter",
    title_zh: "入門(heartbeat + HTTPS)", tag_zh: "入門",
    blurb: "Two-way forwarding with heartbeat-miss and HTTPS steering, plus return-path chains for P2/P3.",
    blurb_zh: "雙向轉發,含 heartbeat 中斷與 HTTPS 分流,並有 P2/P3 的回程鏈結。",
    detail: "A protective inline setup. P0 and P1 are the two sides of a link the device sits in the middle of. Normally traffic flows P0→P1 and P1→P0. Two conditions change that: F1 fires when the device stops seeing its heartbeat target (a link-health signal) — this is the bypass/failover trigger; F2 matches encrypted web traffic on port 443. When either matches, traffic is steered to P1/P0 as configured. Anything that matches neither falls through to P2 (from P0) or P3 (from P1) — typically a monitoring or tap port. P2 and P3 then return traffic back into P0/P1 so the link stays intact.",
    detail_zh: "一個保護性的 inline 設定。P0 和 P1 是裝置所夾在中間的鏈路兩側,正常情況下流量 P0→P1、P1→P0。兩個條件會改變路徑:F1 在裝置偵測不到 heartbeat 目標(鏈路健康訊號)時觸發 — 這是 bypass/failover 的觸發條件;F2 比對 port 443 上的加密網頁流量。任一符合時,流量會依設定導向 P1/P0。兩者都不符合的流量會落到 P2(來自 P0)或 P3(來自 P1)— 通常是監控或 tap 埠。P2 和 P3 再把流量送回 P0/P1,讓鏈路維持完整。",
    make: () => ({
      filters: [
        { id: 1, name: "heartbeat miss", sessionBase: "no",
          root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "heartbeat.target.miss.id", rel: "==", val: "1" }] } },
        { id: 2, name: "https(encrypted)", sessionBase: "no",
          root: { id: nid(), t: "or", children: [
            { id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" },
            { id: nid(), t: "find", field: "udp.port", rel: "==", val: "443" } ] } },
      ],
      chains: [
        { cid: nid(), ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"),
          notmatch: { id: nid(), t: "branch", fids: "F2", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } } },
        { cid: nid(), ports: "P1", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P0"),
          notmatch: { id: nid(), t: "branch", fids: "F2", fidOp: "or", match: mkOut("P0"), notmatch: mkOut("P3") } } },
        { cid: nid(), ports: "P2", tree: { id: nid(), t: "out", ports: "P0", mode: "duplicate", lb: "5thash" } },
        { cid: nid(), ports: "P3", tree: { id: nid(), t: "out", ports: "P1", mode: "duplicate", lb: "5thash" } },
      ],
    }) },
  { id: "minimal", title: "Minimal forward", tag: "Basic",
    title_zh: "最小轉發", tag_zh: "基本",
    blurb: "The smallest useful chain: packets from P0 that match F1 go to P1.",
    blurb_zh: "最精簡的實用鏈結:P0 進來、符合 F1 的封包送到 P1。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "loadbalance", title: "Load balance", tag: "Basic",
    title_zh: "負載平衡", tag_zh: "基本",
    blurb: "Matched traffic from P0 is spread across P1 and P2 by 5-tuple hash, keeping each session on one port.",
    blurb_zh: "P0 進來、符合的流量以 5-tuple hash 分散到 P1 和 P2,同一連線維持在同一埠。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or",
        match: { id: nid(), t: "out", ports: "P1,P2", mode: "loadBalance", lb: "5thash" }, notmatch: mkUnset() } },
    }) },
  { id: "ip-blacklist", title: "Block IP blacklist", tag: "L3",
    title_zh: "封鎖 IP 黑名單", tag_zh: "L3",
    blurb: "Divert packets whose IP is on a blacklist.",
    blurb_zh: "把 IP 在黑名單上的封包導向他處。",
    make: () => ({
      filters: [{ id: 1, name: "ip blacklist", sessionBase: "no",
        root: { id: nid(), t: "or", children: finds("ip.addr", "==", ["92.53.120.155","67.229.164.135"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "block-country", title: "Block by country", tag: "GeoIP",
    title_zh: "依國家封鎖", tag_zh: "GeoIP",
    blurb: "Divert traffic from specific countries. Needs dbip.",
    blurb_zh: "把來自特定國家的流量導向他處。需要 dbip。",
    make: () => ({
      filters: [{ id: 1, name: "blocked countries", sessionBase: "no",
        root: { id: nid(), t: "or", children: finds("country.iso_code", "==", ["CN","RU"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "block-sni", title: "Block TLS by SNI", tag: "TLS",
    title_zh: "依 SNI 封鎖 TLS", tag_zh: "TLS",
    blurb: "Match HTTPS by TLS server name and divert.",
    blurb_zh: "以 TLS server name 比對 HTTPS 並導向他處。",
    make: () => ({
      filters: [{ id: 1, name: "blocked SNI", sessionBase: "yes",
        root: { id: nid(), t: "or", children: finds("ssl.server_name", "==", ["facebook.com"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "rewrite-output", title: "Rewrite via output", tag: "Output",
    title_zh: "透過 output 改寫", tag_zh: "Output",
    blurb: "Matched traffic goes to an output (O1) that rewrites source IP and adds a VLAN tag, then leaves on P1.",
    blurb_zh: "符合的流量送到 output(O1),改寫來源 IP 並加上 VLAN tag,再從 P1 送出。",
    make: () => ({
      filters: [{ id: 1, name: "target", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip.dst", rel: "==", val: "10.0.0.0/24" }] } }],
      outputs: [{ id: 1, name: "rewrite", port: "P1", mods: [
        { id: nid(), k: "modify_srcip", val: "172.16.10.10" },
        { id: nid(), k: "Q", val: "100" } ] }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("O1"), notmatch: mkOut("P2") } },
    }) },
  { id: "pcap-replay", title: "Replay pcap to a port", tag: "Input",
    title_zh: "重播 pcap 到埠", tag_zh: "Input",
    blurb: "An input replays a pcap file onto P0 once, then the chain forwards matched traffic out P1.",
    blurb_zh: "一個 input 把 pcap 檔重播到 P0 一次,鏈結再把符合的流量從 P1 轉發出去。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip", rel: "==", val: "" }] } }],
      inputs: [{ id: 1, name: "replay", alt: "test pcap", type: "replayPcap", port: "P0",
        pcapMode: "files", filepaths: ["H1/in/sample.pcap"], fields: { time: "1", msinterval: "1" }, scanAttrs: {} }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "ingress-strip", title: "Strip VLAN at ingress", tag: "Action",
    title_zh: "入口移除 VLAN", tag_zh: "Action",
    blurb: "An action strips the VLAN tag from packets arriving on P0 before the chain filters them.",
    blurb_zh: "一個 action 在鏈結過濾前,先移除 P0 進來封包的 VLAN tag。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      actions: [{ id: 1, name: "strip vlan", type: "input-packet-process", port: "P0",
        mods: [{ id: nid(), k: "stripping", val: "vlan" }], portA: "P1", portB: "P2" }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "inline-bidir", title: "Inline (bidirectional)", tag: "Multi-chain",
    title_zh: "Inline(雙向)", tag_zh: "多鏈結",
    blurb: "Two chains form an inline pair: P6→P7 forwards matched traffic, and P7→P6 carries the return path.",
    blurb_zh: "兩條鏈結組成 inline 配對:P6→P7 轉發符合的流量,P7→P6 負責回程。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chains: [
        { cid: nid(), ports: "P6", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P7"), notmatch: mkOut("P7") } },
        { cid: nid(), ports: "P7", tree: { id: nid(), t: "out", ports: "P6", mode: "duplicate", lb: "5thash" } },
      ],
    }) },
  { id: "vxlan-encap", title: "VXLAN encapsulation", tag: "Output",
    title_zh: "VXLAN 封裝", tag_zh: "Output",
    blurb: "Matched traffic is wrapped in VXLAN (to a remote VTEP with a VNI) via output O1, then sent out P7.",
    blurb_zh: "符合的流量透過 output O1 封裝成 VXLAN(送到帶 VNI 的遠端 VTEP),再從 P7 送出。",
    make: () => ({
      filters: [{ id: 1, name: "to tunnel", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip.dst", rel: "==", val: "10.0.0.0/24" }] } }],
      outputs: [{ id: 1, name: "vxlan out", port: "P7", mods: [
        { id: nid(), k: "vxlan_sip", val: "192.168.1.10" },
        { id: nid(), k: "vxlan_dip", val: "192.168.1.201" },
        { id: nid(), k: "vxlan_vni", val: "100" } ] }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("O1"), notmatch: mkUnset() } },
    }) },
  { id: "geo-recursive", title: "Geo + protocol, whitelisted", tag: "Recursive",
    title_zh: "地理 + 協定,含白名單", tag_zh: "遞迴",
    blurb: "Recursive filter: geo AND (443 or 53) AND NOT whitelist.",
    blurb_zh: "遞迴篩選器:地理 且 (443 或 53) 且 非白名單。",
    make: () => ({
      filters: [{ id: 1, name: "suspicious geo traffic", sessionBase: "no",
        root: { id: nid(), t: "and", children: [
          { id: nid(), t: "or", children: finds("country.iso_code", "==", ["CN","RU"]) },
          { id: nid(), t: "or", children: [
            { id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" },
            { id: nid(), t: "find", field: "udp.port", rel: "==", val: "53" }] },
          { id: nid(), t: "not", children: [
            { id: nid(), t: "or", children: finds("ip.addr", "==", ["8.8.8.8","168.95.1.1"]) }] },
        ] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
];

/* ===================== output (rewrite / tagging) model ===================== */
/* <output id> is a top-level element, referenced from a chain <out> as O1, O2…
   Required <port>, then an unbounded choice of modifiers. This build covers the
   rewrite family (no encapsulation): modify src/dst ip/port/mac, VLAN Q/QinQ,
   stripping, tagging, maxlen. Each modifier is one row {k, val}. */
export const STRIP_TYPES = ["payload","payload2","vlan","mpls","gre","vxlan","gre-erspan","gtp","grism","mpls-in-udp","mpls-in-gre","udpencap"];
export const TAG_TYPES = ["timestamp","gtp","gtp2","l2gre","vxlan","grism"];
export const NVGRE_TYPES = ["eth","ip"];
export const DIR_CATEGORY = ["month","day","hour","minute"];
export const DIR_TYPE = ["pcap","payload"];
export const YN = ["no","yes"];
export const OUT_MODS = [
  { k: "modify_srcip", label: "Modify source IP", kind: "ip", ph: "10.1.1.1", grp: "rewrite",
    attrs: [{ name: "sessionDir", opts: YN, def: "no" }, { name: "nat", opts: YN, def: "no" }] },
  { k: "modify_dstip", label: "Modify destination IP", kind: "ip", ph: "10.1.1.2", grp: "rewrite",
    attrs: [{ name: "sessionDir", opts: YN, def: "no" }] },
  { k: "modify_srcport", label: "Modify source port", kind: "port", ph: "8080", grp: "rewrite" },
  { k: "modify_dstport", label: "Modify destination port", kind: "port", ph: "80", grp: "rewrite" },
  { k: "modify_srcmac", label: "Modify source MAC", kind: "mac", ph: "d8:fe:e3:a4:d3:78", grp: "rewrite" },
  { k: "modify_dstmac", label: "Modify destination MAC", kind: "mac", ph: "d8:fe:e3:a4:d3:78", grp: "rewrite" },
  { k: "modify_swapmac", label: "Swap source/destination MAC", kind: "flag", grp: "rewrite" },
  { k: "modify_src_default_mac", label: "Source MAC = device MAC", kind: "flag", grp: "rewrite" },
  { k: "modify_dstip2nat", label: "Dest IP from NAT table", kind: "flag", grp: "rewrite" },
  { k: "modify_tcp_syn_mss", label: "Rewrite TCP SYN MSS", kind: "int", ph: "1400", grp: "rewrite" },
  { k: "Q", label: "VLAN tag (Q)", kind: "vlanop", ph: "10", grp: "rewrite", defOp: "add" },
  { k: "QinQ", label: "VLAN tag (QinQ)", kind: "vlanop", ph: "20", grp: "rewrite", defOp: "add" },
  { k: "gateway", label: "Gateway (ARP for MAC)", kind: "ip", ph: "192.168.1.1", grp: "rewrite" },
  { k: "stripping", label: "Strip header/tag", kind: "enum", opts: STRIP_TYPES, grp: "rewrite" },
  { k: "tagging", label: "Add tag", kind: "enum", opts: TAG_TYPES, grp: "rewrite" },
  { k: "maxlen", label: "Max packet length", kind: "num", ph: "64", grp: "rewrite" },
  // ARP / ICMP replies
  { k: "arp_reply_target_mac", label: "ARP reply target MAC", kind: "mac", ph: "00:0c:bd:0b:fd:36", grp: "reply" },
  { k: "arp_reply_default_mac", label: "ARP reply with device MAC", kind: "flag", grp: "reply" },
  { k: "icmp_reply", label: "ICMP reply", kind: "flag", grp: "reply" },
  { k: "icmp_reply_fragment_need", label: "Reply ICMP fragmentation-needed", kind: "flag", grp: "reply",
    attrs: [{ name: "mtu", kind: "num", def: "1400", required: true }] },
  // DNS response / redirect
  { k: "dns_response_ipv4", label: "DNS response IPv4", kind: "ip", ph: "1.2.3.4", grp: "redirect",
    attrs: [{ name: "noswapmac", opts: YN, def: "no" }] },
  { k: "dns_response_ipv6", label: "DNS response IPv6", kind: "ipv6", ph: "2001:db8::1", grp: "redirect" },
  { k: "redirect2safeweb", label: "Redirect to a safe website", kind: "str", ph: "http://safe.example", grp: "redirect",
    attrs: [{ name: "noswapmac", opts: YN, def: "no" }, { name: "redirectPort", kind: "str", def: "" }] },
  // Mirror-to-file (dir) group
  { k: "dir", label: "Write to dir", kind: "str", ph: "/data/capture", grp: "mirror",
    attrs: [{ name: "timeout", kind: "num", def: "0" }, { name: "max_split_size", kind: "num", def: "104857600" },
            { name: "category", opts: DIR_CATEGORY, def: "" }, { name: "type", opts: DIR_TYPE, def: "pcap" }] },
  { k: "dip", label: "Mirror to destination IP", kind: "str", ph: "10.0.0.9", grp: "mirror" },
  { k: "sport", label: "Mirror source port", kind: "port", ph: "0", grp: "mirror" },
  { k: "dport", label: "Mirror dest port", kind: "port", ph: "0", grp: "mirror" },
  // VXLAN encapsulation
  { k: "vxlan_sip", label: "VXLAN source IP", kind: "ip", ph: "192.168.1.10", grp: "vxlan" },
  { k: "vxlan_dip", label: "VXLAN dest IP", kind: "ip", ph: "192.168.1.201", grp: "vxlan" },
  { k: "vxlan_sport", label: "VXLAN source port", kind: "port", ph: "4789", grp: "vxlan" },
  { k: "vxlan_dport", label: "VXLAN dest port", kind: "port", ph: "4789", grp: "vxlan" },
  { k: "vxlan_vni", label: "VXLAN VNI", kind: "uint24", ph: "100", grp: "vxlan" },
  // NVGRE encapsulation
  { k: "nvgre_sip", label: "NVGRE source IP", kind: "ip", ph: "192.168.1.10", grp: "nvgre" },
  { k: "nvgre_dip", label: "NVGRE dest IP", kind: "ip", ph: "192.168.1.201", grp: "nvgre" },
  { k: "nvgre_dmac", label: "NVGRE dest MAC", kind: "mac", ph: "00:0c:bd:0b:fd:36", grp: "nvgre" },
  { k: "nvgre_type", label: "NVGRE type", kind: "enum", opts: NVGRE_TYPES, grp: "nvgre" },
];
export const OUT_MOD_INDEX = Object.fromEntries(OUT_MODS.map((m) => [m.k, m]));
export const VLAN_OPS = ["add","replace","remove"];
export const mkOutputMod = (k) => {
  const meta = OUT_MOD_INDEX[k];
  const mod = { id: nid(), k, val: meta?.opts?.[0] ?? "", op: meta?.kind === "vlanop" ? meta.defOp : undefined };
  if (meta?.attrs) { mod.attrs = {}; meta.attrs.forEach((a) => { mod.attrs[a.name] = a.def ?? ""; }); }
  return mod;
};
export const mkOutput = (id) => ({ id, name: "", port: "P1", mods: [], oattrs: {} });

export function serializeOutput(o) {
  const oa = o.oattrs ?? {};
  const attrs = [`id="${o.id}"`, o.name ? `name="${esc(o.name)}"` : null,
    oa.type ? `type="${esc(oa.type)}"` : null,
    oa.mtu ? `mtu="${esc(oa.mtu)}"` : null,
    oa.stl ? `stl="${esc(oa.stl)}"` : null,
    oa.arp_srcip ? `arp_srcip="${esc(oa.arp_srcip)}"` : null,
    (oa.arp_dstip_mac && oa.arp_dstip_mac !== "no") ? `arp_dstip_mac="${esc(oa.arp_dstip_mac)}"` : null,
    oa["data-tag"] ? `data-tag="${esc(oa["data-tag"])}"` : null,
    oa["data-index"] ? `data-index="${esc(oa["data-index"])}"` : null,
    oa.minbps ? `minbps="${esc(oa.minbps)}"` : null,
    oa.maxbps ? `maxbps="${esc(oa.maxbps)}"` : null,
    o.alt ? `alt="${esc(o.alt)}"` : null].filter(Boolean).join(" ");
  const lines = [`<output ${attrs}>`, `  <port>${esc(o.port)}</port>`];
  (o.mods ?? []).forEach((m) => {
    const meta = OUT_MOD_INDEX[m.k];
    if (!meta) { lines.push(`  <${m.k}>${esc(m.val ?? "")}</${m.k}>`); return; }
    const attrStr = (meta.attrs ?? []).map((a) => {
      const v = m.attrs?.[a.name] ?? a.def ?? "";
      if (!a.required && (v === "" || v === a.def)) return null; // omit empties and defaults
      return `${a.name}="${esc(v)}"`;
    }).filter(Boolean).join(" ");
    const sp = attrStr ? " " + attrStr : "";
    if (meta.kind === "flag") lines.push(`  <${m.k}${sp}/>`);
    else if (meta.kind === "vlanop") {
      const op = m.op || meta.defOp;
      if (op === "remove") lines.push(`  <${m.k} type="remove"></${m.k}>`);
      else if (op === "add") lines.push(`  <${m.k}>${esc(m.val)}</${m.k}>`); // add is default → omit type
      else lines.push(`  <${m.k} type="${op}">${esc(m.val)}</${m.k}>`);
    }
    else lines.push(`  <${m.k}${sp}>${esc(m.val)}</${m.k}>`);
  });
  lines.push(`</output>`);
  return lines.join("\n");
}
export function outputProblems(o, out) {
  if (!/^[A-Z][0-9]+$/.test(o.port || "")) out.push({ id: o.id, msg: `port must look like P1`, label: "port" });
  (o.mods ?? []).forEach((m) => {
    const meta = OUT_MOD_INDEX[m.k]; if (!meta) return;
    if (meta.kind === "enum" || meta.kind === "flag") return;
    if (meta.kind === "vlanop") {
      const op = m.op || meta.defOp;
      if (op === "remove") return; // no value needed
      const msg = validate("vlan", m.val);
      if (msg) out.push({ id: m.id, msg, label: meta.label });
      return;
    }
    const msg = validate(meta.kind, m.val);
    if (msg) out.push({ id: m.id, msg, label: meta.label });
  });
  return out;
}

/* ===================== action model ===================== */
/* <action id type> is a top-level element with two forms this build covers:
   • input-packet-process: <port> + stripping/Q/QinQ/tagging/maxlen (acts on
     packets entering a port, like output modifiers but at ingress)
   • linkpairs: <portA>/<portB> — if one link goes down, the other is forced
     down, and vice versa.
   The schema packs these (plus a heartbeat group) into one xs:choice keyed by
   @type. The UI stays stricter than the schema: picking a type shows only that
   form's fields, so you can't mix linkpairs with stripping. */
export const ACT_STRIP_TYPES = ["payload","payload2","vlan","mpls","gre","vxlan","gre-erspan","gtp","grism","mpls-in-udp","mpls-in-gre","udpencap"];
export const ACT_TAG_TYPES = ["grism","timestamp"];
export const ACT_MODS = [
  { k: "stripping", label: "Strip header/tag", kind: "enum", opts: ACT_STRIP_TYPES },
  { k: "Q", label: "VLAN tag (Q)", kind: "vlan", ph: "10" },
  { k: "QinQ", label: "VLAN tag (QinQ)", kind: "vlan", ph: "20" },
  { k: "tagging", label: "Add tag", kind: "enum", opts: ACT_TAG_TYPES },
  { k: "maxlen", label: "Max packet length", kind: "num", ph: "64" },
  { k: "ip", label: "Interface IP", kind: "ip", ph: "192.168.1.1" },
  { k: "gateway", label: "Gateway", kind: "ip", ph: "192.168.1.1" },
  { k: "netmask", label: "Netmask", kind: "ip", ph: "255.255.255.0" },
  { k: "arp_reply_default_mac", label: "ARP reply (default MAC)", kind: "flag" },
  { k: "icmp_reply", label: "ICMP reply", kind: "flag" },
  { k: "icmp_reply_fragment_need", label: "Reply ICMP fragmentation-needed", kind: "mtu", ph: "" },
];
export const ACT_MOD_INDEX = Object.fromEntries(ACT_MODS.map((m) => [m.k, m]));
export const mkActionMod = (k) => ({ id: nid(), k, val: ACT_MOD_INDEX[k]?.opts?.[0] ?? "", mtu: k === "icmp_reply_fragment_need" ? "1440" : undefined });

export const mkAction = (id) => ({ id, name: "", type: "input-packet-process", port: "P0", mods: [], portA: "P1", portB: "P2" });

export function serializeAction(a) {
  const attrs = [`id="${a.id}"`, `type="${a.type}"`, a.name ? `name="${esc(a.name)}"` : null].filter(Boolean).join(" ");
  const lines = [`<action ${attrs}>`];
  if (a.type === "linkpairs") {
    lines.push(`  <portA>${esc(a.portA)}</portA>`);
    lines.push(`  <portB>${esc(a.portB)}</portB>`);
  } else { // input-packet-process
    lines.push(`  <port>${esc(a.port)}</port>`);
    (a.mods ?? []).forEach((m) => {
      const meta = ACT_MOD_INDEX[m.k];
      if (meta?.kind === "flag") lines.push(`  <${m.k}/>`);
      else if (meta?.kind === "mtu") lines.push(`  <${m.k} mtu="${esc(m.mtu ?? "")}"/>`);
      else lines.push(`  <${m.k}>${esc(m.val)}</${m.k}>`);
    });
  }
  lines.push(`</action>`);
  return lines.join("\n");
}
export function actionProblems(a, out) {
  if (a.type === "linkpairs") {
    if (!/^[A-Z][0-9]+$/.test(a.portA || "")) out.push({ id: a.id, msg: `portA must look like P1`, label: "portA" });
    if (!/^[A-Z][0-9]+$/.test(a.portB || "")) out.push({ id: a.id, msg: `portB must look like P2`, label: "portB" });
  } else {
    if (!/^[A-Z][0-9]+$/.test(a.port || "")) out.push({ id: a.id, msg: `port must look like P0`, label: "port" });
    (a.mods ?? []).forEach((m) => {
      const meta = ACT_MOD_INDEX[m.k]; if (!meta || meta.kind === "enum" || meta.kind === "flag") return;
      if (meta.kind === "mtu") {
        if (!/^\d+$/.test(m.mtu || "")) out.push({ id: m.id, msg: "MTU required", label: meta.label });
        return;
      }
      const msg = validate(meta.kind, m.val);
      if (msg) out.push({ id: m.id, msg, label: meta.label });
    });
  }
  return out;
}

/* ===================== input model =====================
   <input> has two documented forms keyed by @type:
   • replayPcap: play back pcap files from a path or a scanned directory
   • traffic-gen: synthesise packets (protocol, size, src/dest ip & port ranges)
   Both start with <port>, then an unbounded choice of setting elements. The UI
   shows only the fields relevant to the chosen type (like <action>). Fields are
   held in a flat map; only non-empty ones are emitted. */
export const INPUT_PCAP_FIELDS = [
  { k: "filepath", label: "File path", kind: "str", ph: "H1/in/sample.pcap" },
  { k: "scandir", label: "Scan directory", kind: "str", ph: "H1/in", attrs: ["interval", "minbytes", "timeout"] },
  { k: "time", label: "Play count", kind: "num", ph: "1" },
  { k: "speed", label: "Speed", kind: "num", ph: "10000" },
  { k: "msinterval", label: "Interval (ms)", kind: "num", ph: "1" },
  { k: "playedFilesHandle", label: "After replay", kind: "enum", opts: ["", "delete", "move"] },
  { k: "playedFilesMoveTo", label: "Move played to", kind: "str", ph: "H1/in/played" },
];
export const INPUT_GEN_FIELDS = [
  { k: "protocol", label: "Protocol", kind: "enum", opts: ["UDP", "TCP", "ICMP"] },
  { k: "packet_size", label: "Packet size", kind: "num", ph: "1024" },
  { k: "speed", label: "Speed", kind: "num", ph: "10000" },
  { k: "msinterval", label: "Interval (ms)", kind: "num", ph: "1" },
  { k: "payload_text", label: "Payload text", kind: "str", ph: "abcdefg" },
  { k: "packet_data", label: "Packet data (hex)", kind: "str", ph: "000cbd0b…" },
  { k: "src_mac", label: "Source MAC", kind: "mac", ph: "00:0d:48:28:28:56" },
  { k: "dest_mac", label: "Dest MAC", kind: "mac", ph: "00:0d:48:28:28:57" },
  { k: "src_ip", label: "Source IP", kind: "ip", ph: "10.1.0.99" },
  { k: "src_ip_min", label: "Source IP min", kind: "ip", ph: "10.1.0.0" },
  { k: "src_ip_max", label: "Source IP max", kind: "ip", ph: "10.1.0.99" },
  { k: "src_ip_inc", label: "Source IP inc", kind: "int", ph: "5" },
  { k: "src_ip_random", label: "Source IP random", kind: "t1f0", ph: "0" },
  { k: "dest_ip", label: "Dest IP", kind: "ip", ph: "11.1.1.99" },
  { k: "dest_ip_min", label: "Dest IP min", kind: "ip", ph: "11.1.1.0" },
  { k: "dest_ip_max", label: "Dest IP max", kind: "ip", ph: "11.1.2.99" },
  { k: "dest_ip_inc", label: "Dest IP inc", kind: "int", ph: "2" },
  { k: "dest_ip_random", label: "Dest IP random", kind: "t1f0", ph: "0" },
  { k: "src_port", label: "Source port", kind: "port", ph: "1234" },
  { k: "src_port_min", label: "Source port min", kind: "port", ph: "2" },
  { k: "src_port_max", label: "Source port max", kind: "port", ph: "9999" },
  { k: "src_port_inc", label: "Source port inc", kind: "int", ph: "1" },
  { k: "src_port_random", label: "Source port random", kind: "t1f0", ph: "0" },
  { k: "dest_port", label: "Dest port", kind: "port", ph: "2222" },
  { k: "dest_port_min", label: "Dest port min", kind: "port", ph: "0" },
  { k: "dest_port_max", label: "Dest port max", kind: "port", ph: "65535" },
  { k: "dest_port_inc", label: "Dest port inc", kind: "int", ph: "1" },
  { k: "dest_port_random", label: "Dest port random", kind: "t1f0", ph: "0" },
];
export const INPUT_FIELD_INDEX = Object.fromEntries([...INPUT_PCAP_FIELDS, ...INPUT_GEN_FIELDS].map((f) => [f.k, f]));
export const inputFieldsFor = (type) => type === "traffic-gen" ? INPUT_GEN_FIELDS : INPUT_PCAP_FIELDS;
export const mkInput = (id) => ({ id, name: "", alt: "", type: "replayPcap", port: "P0",
  pcapMode: "files", filepaths: [""], fields: { time: "1" }, scanAttrs: {} });

export function serializeInput(inp) {
  const attrs = [`id="${inp.id}"`, `type="${inp.type}"`,
    inp.name ? `name="${esc(inp.name)}"` : null,
    inp.alt ? `alt="${esc(inp.alt)}"` : null].filter(Boolean).join(" ");
  const lines = [`<input ${attrs}>`, `  <port>${esc(inp.port)}</port>`];
  if (inp.type === "replayPcap") {
    const mode = inp.pcapMode || "files";
    if (mode === "files") {
      (inp.filepaths || []).map((p) => p.trim()).filter(Boolean).forEach((p) => lines.push(`  <filepath>${esc(p)}</filepath>`));
    } else {
      const dir = (inp.fields?.scandir || "").trim();
      if (dir) {
        const a = inp.scanAttrs || {};
        const at = ["interval", "minbytes", "timeout"].filter((k) => a[k] != null && a[k] !== "").map((k) => ` ${k}="${esc(a[k])}"`).join("");
        lines.push(`  <scandir${at}>${esc(dir)}</scandir>`);
      }
    }
    // shared playback fields
    ["time", "speed", "msinterval"].forEach((k) => { const v = inp.fields?.[k]; if (v != null && v !== "") lines.push(`  <${k}>${esc(v)}</${k}>`); });
    // played-files handling is only meaningful in scandir mode
    if (mode === "scandir") {
      const h = inp.fields?.playedFilesHandle;
      if (h) lines.push(`  <playedFilesHandle>${esc(h)}</playedFilesHandle>`);
      if (h === "move") { const mv = inp.fields?.playedFilesMoveTo; if (mv) lines.push(`  <playedFilesMoveTo>${esc(mv)}</playedFilesMoveTo>`); }
    }
    lines.push(`</input>`);
    return lines.join("\n");
  }
  inputFieldsFor(inp.type).forEach((f) => {
    const v = inp.fields?.[f.k];
    if (v == null || v === "") return;
    lines.push(`  <${f.k}>${esc(v)}</${f.k}>`);
  });
  lines.push(`</input>`);
  return lines.join("\n");
}
export function inputProblems(inp, out) {
  if (!/^[A-Z][0-9]+$/.test(inp.port || "")) out.push({ id: inp.id, msg: `port must look like P0`, label: "port" });
  if (inp.type === "replayPcap") {
    const mode = inp.pcapMode || "files";
    if (mode === "files") {
      const paths = (inp.filepaths || []).map((p) => p.trim()).filter(Boolean);
      if (!paths.length) out.push({ id: inp.id + ":src", msg: "add at least one file path", label: "source" });
      if ((inp.filepaths || []).length > 100) out.push({ id: inp.id + ":src", msg: "at most 100 file paths", label: "source" });
    } else if (!(inp.fields?.scandir || "").trim()) {
      out.push({ id: inp.id + ":src", msg: "needs a scan directory", label: "source" });
    }
  }
  inputFieldsFor(inp.type).forEach((f) => {
    const v = inp.fields?.[f.k]; if (v == null || v === "") return;
    if (f.kind === "enum" || f.kind === "str") return;
    const vk = f.kind === "t1f0" ? "bit" : f.kind === "int" ? "num" : f.kind;
    const msg = validate(vk, v);
    if (msg) out.push({ id: inp.id + ":" + f.k, msg, label: f.label });
  });
  return out;
}

/* ===================== whole-document serialiser ===================== */
export function serializeRun(doc) {
  const parts = [];
  // re-emit an element's attached comment (if any) on its own line before it
  const withComment = (item, xml) => {
    const indented = xml.split("\n").map((l) => "  " + l).join("\n");
    if (item && item._comment != null) {
      const c = `  <!--${item._comment}-->`;
      return c + "\n" + indented;
    }
    return indented;
  };
  doc.filters.forEach((f) => parts.push(withComment(f, serializeFilter(f))));
  (doc.inputs ?? []).forEach((inp) => parts.push(withComment(inp, serializeInput(inp))));
  (doc.outputs ?? []).forEach((o) => parts.push(withComment(o, serializeOutput(o))));
  (doc.actions ?? []).forEach((a) => parts.push(withComment(a, serializeAction(a))));
  (doc.chains ?? []).forEach((c) => parts.push(withComment(c, serializeChain(c))));
  return `<run>\n${parts.join("\n")}\n</run>`;
}

/* ===================== XML → model parser =====================
   The inverse of serializeRun: takes a <run> string and rebuilds the
   editable document. Mirrors each serializer exactly. Throws on malformed
   XML or an unexpected shape so the caller can surface a clear message
   rather than loading a half-parsed, misleading model. */
export function parseRun(xmlText) {
  const dom = parseXml(xmlText);
  const perr = dom.querySelector("parsererror");
  if (perr) throw new Error("XML is not well-formed");
  const run = dom.querySelector("run");
  if (!run) throw new Error("no <run> element found");
  const elemChildren = (el) => [...el.children];
  const warnings = [];

  // --- filter criterion (recursive) ---
  function parseCriterion(el) {
    const tag = el.tagName;
    if (tag === "find" || tag === "f") {
      // <f n=… r=… c=…/> is shorthand for <find name=… relation=… content=…/>
      const field = el.getAttribute("name") ?? el.getAttribute("n") ?? "ip.addr";
      const rel = el.getAttribute("relation") ?? el.getAttribute("r") ?? "==";
      const val = el.getAttribute("content") ?? el.getAttribute("c") ?? "";
      if (!FIELD_INDEX[field]) warnings.push(`unknown find field "${field}"`);
      const kind = FIELD_INDEX[field]?.kind ?? "str";
      return { id: nid(), t: "find", field, rel: rel || "==", val: kind === "exists" ? "" : val };
    }
    if (tag === "or" || tag === "and" || tag === "not") {
      return { id: nid(), t: tag, children: elemChildren(el).map(parseCriterion) };
    }
    warnings.push(`unexpected element <${tag}> in filter`);
    return { id: nid(), t: "or", children: [] };
  }
  function parseFilter(el) {
    const id = +(el.getAttribute("id") || 0);
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    const sessionBase = el.getAttribute("sessionBase") || "no";
    const matchedlog = el.getAttribute("matchedlog") === "yes" ? "yes" : "no";
    const blockifempty = el.getAttribute("blockifempty") === "yes" ? "yes" : "no";
    const fattrs = {};
    ["masking","maxPackets","tuple5_live_hashtable_size","start","position","within","mpslog"].forEach((a) => {
      const v = el.getAttribute(a); if (v != null) fattrs[a] = v;
    });
    const first = elemChildren(el)[0];
    const root = first ? parseCriterion(first) : { id: nid(), t: "or", children: [] };
    // name and alt are both free-text labels; we surface one "name" field but
    // remember which attribute the label came from so we write it back the same way.
    const labelAttr = name ? "name" : alt ? "alt" : "name";
    return { id, name, alt, labelAttr, sessionBase, matchedlog, blockifempty, fattrs, root };
  }

  // --- output ---
  function parseOutput(el) {
    const id = +(el.getAttribute("id") || 0);
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    // output-level attributes
    const oattrs = {};
    ["type","mtu","stl","arp_srcip","arp_dstip_mac","data-tag","data-index","minbps","maxbps"].forEach((a) => {
      const v = el.getAttribute(a); if (v != null) oattrs[a] = v;
    });
    let port = "P1";
    const mods = [];
    elemChildren(el).forEach((c) => {
      const k = c.tagName;
      if (k === "port") { port = c.textContent.trim(); return; }
      const meta = OUT_MOD_INDEX[k];
      if (!meta) { warnings.push(`unknown output modifier <${k}>`); return; }
      if (meta.kind === "vlanop") {
        mods.push({ id: nid(), k, val: c.textContent.trim(), op: c.getAttribute("type") || meta.defOp });
      } else {
        const mod = { id: nid(), k, val: c.textContent.trim() };
        if (meta.attrs) { mod.attrs = {}; meta.attrs.forEach((a) => { const v = c.getAttribute(a.name); mod.attrs[a.name] = v != null ? v : (a.def ?? ""); }); }
        mods.push(mod);
      }
    });
    const labelAttr = name ? "name" : alt ? "alt" : "name";
    return { id, name, alt, labelAttr, port, mods, oattrs };
  }

  // --- input ---
  function parseInput(el) {
    const id = +(el.getAttribute("id") || 0);
    const type = el.getAttribute("type") || "replayPcap";
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    const inp = { id, name, alt, labelAttr: name ? "name" : alt ? "alt" : "name", type, port: "P0", pcapMode: "files", filepaths: [], fields: {}, scanAttrs: {} };
    elemChildren(el).forEach((c) => {
      const k = c.tagName;
      if (k === "port") { inp.port = c.textContent.trim(); return; }
      if (k === "filepath") { inp.filepaths.push(c.textContent.trim()); return; }
      if (k === "scandir") {
        inp.pcapMode = "scandir";
        inp.fields.scandir = c.textContent.trim();
        ["interval", "minbytes", "timeout"].forEach((a) => { const av = c.getAttribute(a); if (av != null) inp.scanAttrs[a] = av; });
        return;
      }
      if (!INPUT_FIELD_INDEX[k]) { warnings.push(`unknown input element <${k}>`); return; }
      inp.fields[k] = c.textContent.trim();
    });
    // decide the pcap mode: scandir present → scandir; else files
    if (inp.fields.scandir) inp.pcapMode = "scandir";
    else { inp.pcapMode = "files"; if (!inp.filepaths.length) inp.filepaths = [""]; }
    return inp;
  }

  // --- action ---
  function parseAction(el) {
    const id = +(el.getAttribute("id") || 0);
    const type = el.getAttribute("type") || "input-packet-process";
    const name = el.getAttribute("name") || "";
    const a = { id, name, type, port: "P0", mods: [], portA: "P1", portB: "P2" };
    if (type === "linkpairs") {
      elemChildren(el).forEach((c) => {
        if (c.tagName === "portA") a.portA = c.textContent.trim();
        if (c.tagName === "portB") a.portB = c.textContent.trim();
      });
    } else {
      elemChildren(el).forEach((c) => {
        const k = c.tagName;
        if (k === "port") { a.port = c.textContent.trim(); return; }
        const meta = ACT_MOD_INDEX[k];
        if (!meta) { warnings.push(`unknown action element <${k}>`); return; }
        if (meta.kind === "flag") a.mods.push({ id: nid(), k });
        else if (meta.kind === "mtu") a.mods.push({ id: nid(), k, mtu: c.getAttribute("mtu") || "" });
        else a.mods.push({ id: nid(), k, val: c.textContent.trim() });
      });
    }
    return a;
  }

  // --- chain (decision tree) ---
  // Reads <in>, then a sequence of <fid>/<out>/<next> back into the
  // branch/out/unset node shape. A <fid> with a following <out> or <next>
  // for match, and a <next type="notmatch"> for the other side.
  function parseVlan(el, obj) {
    const vt = el.getAttribute("vlantype");
    if (vt) { obj.vlantype = vt; const vid = el.getAttribute("vlanid"); if (vid != null) obj.vlanid = vid; }
    return obj;
  }
  function parseOutNode(el) {
    const n = { id: nid(), t: "out", ports: el.textContent.trim(),
      mode: el.getAttribute("type") === "loadBalance" ? "loadBalance" : "duplicate",
      lb: el.getAttribute("lbtype") || "5thash" };
    return parseVlan(el, n);
  }
  // parse the body (a list of sibling elements at one level) into a node
  function parseBody(els) {
    if (!els.length) return mkUnset();
    const fidEl = els.find((e) => e.tagName === "fid");
    if (!fidEl) {
      // no fid → a bare <out> terminal
      const outEl = els.find((e) => e.tagName === "out");
      return outEl ? parseOutNode(outEl) : mkUnset();
    }
    const node = { id: nid(), t: "branch", fids: fidEl.textContent.trim(), fidOp: fidEl.getAttribute("type") || "or",
      fidAlt: fidEl.getAttribute("alt") || "",
      match: mkUnset(), notmatch: mkUnset() };
    // walk siblings after the fid: first <out> or plain <next> = match; <next type="notmatch"> = notmatch
    const after = els.slice(els.indexOf(fidEl) + 1);
    after.forEach((e) => {
      if (e.tagName === "out") { node.match = parseOutNode(e); }
      else if (e.tagName === "next") {
        const isNot = e.getAttribute("type") === "notmatch";
        const inner = parseBody(elemChildren(e));
        if (isNot) node.notmatch = inner; else node.match = inner;
      }
    });
    return node;
  }
  function parseChain(el) {
    const inEl = elemChildren(el).find((c) => c.tagName === "in");
    const ports = inEl ? inEl.textContent.trim() : "P0";
    const chain = { cid: nid(), ports, tree: null };
    if (inEl) { const iv = {}; parseVlan(inEl, iv); if (iv.vlantype) chain.inVlan = iv; }
    const rest = elemChildren(el).filter((c) => c.tagName !== "in");
    chain.tree = parseBody(rest);
    return chain;
  }

  const filters = [], outputs = [], actions = [], chains = [], inputs = [];
  // Walk raw child nodes so we can capture comments that precede a top-level
  // element and attach them to that element as `_comment` (round-tripped on output).
  let pendingComment = [];
  [...run.childNodes].forEach((node) => {
    if (node.nodeType === 8) { // Comment node
      pendingComment.push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return; // ignore text/whitespace
    const el = node;
    const comment = pendingComment.length ? pendingComment.join("\n") : null;
    pendingComment = [];
    let parsed = null;
    switch (el.tagName) {
      case "filter": parsed = parseFilter(el); filters.push(parsed); break;
      case "input": parsed = parseInput(el); inputs.push(parsed); break;
      case "output": parsed = parseOutput(el); outputs.push(parsed); break;
      case "action": parsed = parseAction(el); actions.push(parsed); break;
      case "chain": parsed = parseChain(el); chains.push(parsed); break;
      default: warnings.push(`unexpected top-level <${el.tagName}>`);
    }
    if (parsed && comment != null) parsed._comment = comment;
  });
  if (!chains.length) chains.push(mkChain("P0"));
  if (!filters.length) filters.push({ id: 1, name: "", sessionBase: "no", blockifempty: "no", root: { id: nid(), t: "or", children: [mkFind()] } });
  return { doc: { filters, inputs, outputs, actions, chains }, warnings };
}

/* ===================== XML formatter (pure text re-indent) =====================
   Beautifies XML by recomputing indentation from tag open/close, WITHOUT
   parsing into the model — so every element is preserved, including ones the
   tool doesn't recognise. Requires well-formed tag nesting; throws otherwise
   so the caller can leave the user's text untouched and show a message. */
export function formatXml(xml, indentUnit = "  ") {
  // normalise: put each tag on its own line, collapse whitespace between tags
  const normalized = xml
    .replace(/\r\n?/g, "\n")
    .replace(/>\s*</g, ">\n<")   // break between adjacent tags
    .trim();
  const rawLines = normalized.split("\n").map((l) => l.trim()).filter((l) => l.length);

  let depth = 0;
  const out = [];
  for (const line of rawLines) {
    const isClose = /^<\//.test(line);
    const isSelfClose = /\/>\s*$/.test(line);
    const isDecl = /^<[?!]/.test(line);                 // <?xml ...?>, <!-- -->
    // a line that opens and closes on itself: <tag ...>text</tag>
    const isComplete = /^<([\w:-]+)(\s[^>]*)?>.*<\/\1>\s*$/.test(line);
    const opensBlock = /^<[\w:-]/.test(line) && !isClose && !isSelfClose && !isDecl && !isComplete;

    if (isClose) depth = Math.max(0, depth - 1);
    out.push(indentUnit.repeat(depth) + line);
    if (opensBlock) depth += 1;
  }
  if (depth !== 0) throw new Error("tags aren't balanced");
  return out.join("\n");
}

export function tmplText(tpl, field, lang) {
  if (lang === "zh-TW" && tpl[field + "_zh"]) return tpl[field + "_zh"];
  return tpl[field] || "";
}

/* ============================================================
   System status tab — device health from get_system_status
   ============================================================ */
// Parse the uname string into a friendly host + kernel summary.
export function parseUname(uname) {
  const parts = String(uname || "").split(/\s+/);
  // "Linux GRISM-HL1 5.15.72-... #1 SMP ... aarch64"
  return { host: parts[1] || "", kernel: parts[2] || "", arch: parts[parts.length - 1] || "" };
}
// Bytes (KB units from the API) → human string. mem_usage/disk are in KB.
export function fmtKB(kb) {
  const n = Number(kb) || 0;
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " GB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " MB";
  return n + " KB";
}
export function pct(used, total) { const t = Number(total) || 0; return t ? Math.min(100, Math.round((Number(used) / t) * 100)) : 0; }
// Format a duration in seconds as "1y 2d 3h 4m 5s", dropping leading zero units.
export function fmtUptime(sec) {
  let s = Math.max(0, Math.floor(Number(sec) || 0));
  const y = Math.floor(s / 31536000); s -= y * 31536000;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const parts = [];
  if (y) parts.push(y + "y");
  if (d || y) parts.push(d + "d");
  if (h || d || y) parts.push(h + "h");
  if (m || h || d || y) parts.push(m + "m");
  parts.push(s + "s");
  return parts.join(" ");
}
// Summarise the raw status JSON into display-ready pieces (pure → testable).
export function summarizeStatus(s) {
  if (!s) return null;
  const u = parseUname(s.uname);
  const cpu = Array.isArray(s.cpu_usage) ? s.cpu_usage.map((v) => Number(v) || 0) : [];
  const cpuOverall = cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : 0;
  // mem_usage is [total, free] in KB — used is the difference, not the second value.
  const mem = Array.isArray(s.mem_usage) ? s.mem_usage : [0, 0];
  const memTotal = Number(mem[0]) || 0, memFree = Number(mem[1]) || 0;
  const memUsed = Math.max(0, memTotal - memFree);
  const disks = (Array.isArray(s.disk_usage) ? s.disk_usage : []).map((d) => ({
    dev: d[0], mount: d[1], total: Number(d[2]) || 0, used: Number(d[3]) || 0, avail: Number(d[4]) || 0,
    pctText: String(d[5] || "").replace(/%+/g, "%"), pct: pct(d[3], d[2]),
  }));
  const procs = (Array.isArray(s.process) ? s.process : []).map((p) => ({
    name: p[0], pid: p[1], core: p[2], state: p[3], rss: p[4], cpu: Number(p[5]) || 0,
  })).sort((a, b) => b.cpu - a.cpu);
  const temps = s.Temperature && typeof s.Temperature === "object" ? Object.entries(s.Temperature) : [];
  const fans = Array.isArray(s.Fan) ? s.Fan : [];
  const psus = Array.isArray(s.Rpsu) ? s.Rpsu : [];
  return { u, datetime: s.datetime, uptime: s.uptime_s != null ? fmtUptime(s.uptime_s) : s.uptime, loadavg: s.loadavg,
    cpu, cpuOverall, memTotal, memUsed, memFree, memPct: pct(memUsed, memTotal), disks, procs, temps, fans, psus };
}


export const IFCFG_FIELDS = ["enable", "ip", "name", "eth", "netmask", "gateway", "garp_interval", "bypassfilter"];
// Pull the management ifcfgs sections out of a parsed config document. Returns an
// array of { role, fields{} } for each <ifcfgs><find role="management*">.
export function parseMgmtIfaces(xmlText) {
  try {
    const dom = parseXml(xmlText);
    if (dom.querySelector("parsererror")) return [];
    const finds = [...dom.querySelectorAll("ifcfgs > find")].filter((f) => /^management/.test(f.getAttribute("role") || ""));
    return finds.map((f) => {
      const fields = {};
      IFCFG_FIELDS.forEach((k) => { const el = f.querySelector(":scope > " + k); fields[k] = el ? el.textContent.trim() : ""; });
      return { role: f.getAttribute("role"), fields };
    });
  } catch { return []; }
}
// Build the minimal <configSet> holding just one management ifcfgs section.
export function buildMgmtConfigSet(iface) {
  const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const lines = IFCFG_FIELDS.map((k) => `            <${k}>${esc(iface.fields[k])}</${k}>`).join("\n");
  return `<configSet reboot="no">\n    <ifcfgs>\n        <find role="${esc(iface.role)}">\n${lines}\n        </find>\n    </ifcfgs>\n</configSet>`;
}


export function fmtNum(n) {
  const v = Number(n) || 0;
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "G";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return String(v);
}
// Link speed (Mbps from the API) as an integer with unit: 100000 → "100 Gbps".
export function fmtSpeed(mbps) {
  const v = Number(mbps) || 0;
  if (v >= 1000 && v % 1000 === 0) return (v / 1000) + " Gbps";
  if (v >= 1000) return Math.round(v / 1000) + " Gbps";
  return Math.round(v) + " Mbps";
}
// Bytes → human string.
export function fmtBytes(n) {
  let v = Number(n) || 0; const units = ["B", "KB", "MB", "GB", "TB", "PB"]; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(2)) + " " + units[i];
}


export function toks(fids) { return String(fids || "").split(",").map((s) => s.trim()).filter(Boolean).length; }

export const NODE_W = 150, NODE_H = 52, H_GAP = 34, V_GAP = 60, PH_H = 40;
export function layoutChain(root) {
  const placed = [], edges = [];
  const inNode = { id: "__in__", t: "in", ports: root.ports, child: root.tree };
  function width(node) {
    if (!node) return 0;
    if (node.t === "in") return width(node.child);
    if (node.t === "out" || node.t === UNSET) return NODE_W;
    const wm = width(node.match), wn = width(node.notmatch);
    const kids = (wm ? 1 : 0) + (wn ? 1 : 0);
    return kids === 0 ? NODE_W : Math.max(NODE_W, wm + wn + (kids > 1 ? H_GAP : 0));
  }
  function place(node, x, y, parent, kind) {
    if (!node) return;
    if (node.t === "in") {
      const w = width(node.child) || NODE_W, cx = x + w / 2;
      placed.push({ ...node, _x: cx - NODE_W / 2, _y: y });
      if (node.child) { edges.push({ from: node.id, to: node.child.id, kind: "flow" }); place(node.child, x, y + NODE_H + V_GAP, node, "flow"); }
      return;
    }
    if (node.t === "out" || node.t === UNSET) {
      placed.push({ ...node, _x: x + (width(node) - NODE_W) / 2, _y: y });
      if (parent) edges.push({ from: parent.id, to: node.id, kind }); return;
    }
    const wm = width(node.match), wn = width(node.notmatch);
    const total = Math.max(NODE_W, wm + wn + ((wm && wn) ? H_GAP : 0)), cx = x + total / 2;
    placed.push({ ...node, _x: cx - NODE_W / 2, _y: y });
    if (parent) edges.push({ from: parent.id, to: node.id, kind });
    let cur = x; const cy = y + NODE_H + V_GAP;
    if (node.match) { place(node.match, cur, cy, node, "match"); cur += wm + H_GAP; }
    if (node.notmatch) place(node.notmatch, cur, cy, node, "notmatch");
  }
  place(inNode, 0, 0, null, null);
  const totalW = width(inNode) || NODE_W;
  const maxY = Math.max(...placed.map((n) => n._y)) + NODE_H;
  return { placed, edges, totalW, totalH: maxY };
}

/* Collapsible multi-select: a header (click to expand) showing the picked
   count, a select/clear-all row, and the checkbox list. Used for filter and
   port pickers, which can get long. */
/* Collapsible optional section for the inspector — defaults collapsed. Shows a
   small "set" hint on the header when it contains a configured value, so a
   collapsed section with an active setting is still discoverable. */

/* ===================== undo/redo document snapshot =====================
   Snapshot the parts of the doc that the editors change. Every key is
   normalised to an array: if a template omits e.g. `outputs`, JSON.stringify
   would drop the key entirely, and restoring that snapshot with
   {...doc, ...parts} would leave a newly added output in place — undo would
   appear to do nothing. */
export const docSnapshot = (d) => JSON.stringify({
  filters: d.filters ?? [], inputs: d.inputs ?? [], outputs: d.outputs ?? [],
  actions: d.actions ?? [], chains: d.chains ?? [],
});

/* ===================== port ordering =====================
   Device port lists arrive in whatever order the config happens to hold them.
   Sort them predictably for the pickers: virtual ports (V*) first, then physical
   ports (P*), then anything else — each group by its numeric suffix ascending, so
   V0, V1, V2 … P0, P1, … P10 (not P1, P10, P2). */
export function comparePortNames(a, b) {
  const parse = (n) => {
    const m = String(n).match(/^([A-Za-z]*)(\d*)$/);
    return { prefix: (m?.[1] ?? String(n)).toUpperCase(), num: m?.[2] === "" ? null : Number(m[2]) };
  };
  const rank = (p) => (p === "V" ? 0 : p === "P" ? 1 : 2);
  const pa = parse(a), pb = parse(b);
  if (rank(pa.prefix) !== rank(pb.prefix)) return rank(pa.prefix) - rank(pb.prefix);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  if (pa.num === null || pb.num === null) return String(a).localeCompare(String(b));
  return pa.num - pb.num;
}
export const sortPortNames = (names) => [...names].sort(comparePortNames);

/* ===================== change tracking =====================
   Compare the working document against the one that was loaded, so the UI can
   point at exactly what the user changed rather than just saying "modified".
   Items are matched by id (cid for chains); anything added, removed or edited is
   reported per section. */
const SECTION_KEYS = { filters: "id", inputs: "id", outputs: "id", actions: "id", chains: "cid" };

export function diffDoc(baseDoc, curDoc) {
  const out = {};
  let total = 0;
  for (const [section, key] of Object.entries(SECTION_KEYS)) {
    const base = baseDoc?.[section] ?? [];
    const cur = curDoc?.[section] ?? [];
    const baseById = new Map(base.map((x) => [x[key], x]));
    const curById = new Map(cur.map((x) => [x[key], x]));
    const added = [], removed = [], changed = [];
    curById.forEach((item, id) => {
      if (!baseById.has(id)) added.push(id);
      else if (JSON.stringify(baseById.get(id)) !== JSON.stringify(item)) changed.push(id);
    });
    baseById.forEach((_, id) => { if (!curById.has(id)) removed.push(id); });
    const n = added.length + removed.length + changed.length;
    total += n;
    out[section] = { added, removed, changed, count: n,
      // ids still present in the document, for badging list rows
      touched: new Set([...added, ...changed]) };
  }
  out.total = total;
  return out;
}

/* True when a section has any change at all — handy for tab badges. */
export const sectionChanged = (diff, section) => (diff?.[section]?.count ?? 0) > 0;

/* ===================== traffic statistics shaping =====================
   The statistics endpoint returns parallel arrays (values, concurrent counts and
   byte counts share an index). These helpers zip them into rows the UI can render
   and sort, and translate protocol numbers into names. */

export const IP_PROTOCOLS = {
  1: "ICMP", 2: "IGMP", 6: "TCP", 17: "UDP", 41: "IPv6", 47: "GRE", 50: "ESP", 51: "AH",
  58: "ICMPv6", 89: "OSPF", 103: "PIM", 112: "VRRP", 132: "SCTP",
};
export const protocolName = (n) => IP_PROTOCOLS[n] ? `${IP_PROTOCOLS[n]} (${n})` : String(n);

/* Well-known ports worth naming in the port breakdown. */
export const PORT_SERVICES = {
  20: "FTP-data", 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 67: "DHCP",
  68: "DHCP", 80: "HTTP", 110: "POP3", 123: "NTP", 143: "IMAP", 161: "SNMP", 389: "LDAP",
  443: "HTTPS", 445: "SMB", 514: "Syslog", 547: "DHCPv6", 587: "SMTP", 993: "IMAPS",
  995: "POP3S", 1812: "RADIUS", 3306: "MySQL", 3389: "RDP", 5060: "SIP", 8080: "HTTP-alt",
};
export const portLabel = (p) => PORT_SERVICES[p] ? `${p} (${PORT_SERVICES[p]})` : String(p);

/* Zip parallel arrays into [{ key, concurrent, bytes }], busiest first. */
export function zipBreakdown(keys, concurrent, bytes) {
  const k = Array.isArray(keys) ? keys : [];
  return k.map((key, i) => ({
    key,
    concurrent: Number(concurrent?.[i]) || 0,
    bytes: Number(bytes?.[i]) || 0,
  })).sort((a, b) => b.concurrent - a.concurrent || b.bytes - a.bytes);
}

/* Shape one session family (v4 or v6) for display. */
export function summarizeSessions(s, { v6 = false } = {}) {
  if (!s) return null;
  const total = Number(s.total) || 0;
  const concurrent = Number(s.concurrent) || 0;
  return {
    total,
    concurrent,
    // share of all sessions seen that are still open
    usage: total ? concurrent / total : 0,
    netflowCount: Number(s.netflow_count) || 0,
    netflowEps: Number(s.netflow_eps) || 0,
    protocols: v6
      ? zipBreakdown(s.next_hdr, s.next_hdr_concurrent, s.next_hdr_concurrent_bytes)
      : zipBreakdown(s.protocols, s.protocols_concurrent, s.protocols_concurrent_bytes),
    tcp: zipBreakdown(s.tcp_ports, s.tcp_ports_concurrent, s.tcp_ports_concurrent_bytes),
    udp: zipBreakdown(s.udp_ports, s.udp_ports_concurrent, s.udp_ports_concurrent_bytes),
  };
}

/* Merge the filter counters into rows with a hit rate. */
export function summarizeFilterCounters(list) {
  return (Array.isArray(list) ? list : []).map((f) => {
    const tried = Number(f.try_count) || 0, matched = Number(f.matched_count) || 0;
    return {
      id: f.id, refs: Number(f.count) || 0, tried, matched,
      perSecond: Number(f.matched_per_second) || 0,
      rate: tried ? matched / tried : 0,
    };
  }).sort((a, b) => b.matched - a.matched || b.tried - a.tried);
}

/* Flatten flow_service into service rows with their busiest hosts.
   Each host entry is [ip, sessions, bytes]. */
export function summarizeFlowServices(fs) {
  const groups = [];
  for (const scope of ["public", "private"]) {
    (fs?.[scope] ?? []).forEach((svc) => {
      const hosts = (svc.host ?? []).map((h) => ({
        ip: h?.[0] ?? "", sessions: Number(h?.[1]) || 0, bytes: Number(h?.[2]) || 0,
      })).sort((a, b) => b.bytes - a.bytes);
      groups.push({
        scope, name: svc.name ?? "",
        hosts,
        sessions: hosts.reduce((n, h) => n + h.sessions, 0),
        bytes: hosts.reduce((n, h) => n + h.bytes, 0),
      });
    });
  }
  return groups.sort((a, b) => b.bytes - a.bytes);
}

/* Country counters, busiest first, with each row's share of the total bytes. */
export function summarizeCountries(list) {
  const rows = (Array.isArray(list) ? list : []).map((c) => ({
    iso: c.iso_code ?? "", packets: Number(c.packets) || 0, bytes: Number(c.bytes) || 0,
  })).sort((a, b) => b.bytes - a.bytes);
  const totalBytes = rows.reduce((n, r) => n + r.bytes, 0);
  const totalPackets = rows.reduce((n, r) => n + r.packets, 0);
  return { rows: rows.map((r) => ({ ...r, share: totalBytes ? r.bytes / totalBytes : 0 })), totalBytes, totalPackets };
}

/* Packet-type counters → rows, non-zero first so oddities stand out. */
export function summarizePacketTypes(pt) {
  return Object.entries(pt ?? {})
    .map(([key, v]) => ({ key, count: Number(v) || 0 }))
    .sort((a, b) => b.count - a.count);
}

/* ===================== device-side filter ids =====================
   Filters numbered below this threshold are expected to be defined in the
   configuration; anything at or above it is created dynamically on the device
   (by the syslog patch-filter service and friends), so a reference to one that
   isn't in the XML is normal rather than a mistake. */
export const DEVICE_FILTER_ID_MIN = 1000;

/* True when an undefined filter reference should be treated as living on the
   device rather than reported as missing. `id` may be "F1234" or 1234. */
export function isDeviceFilterId(id) {
  const n = typeof id === "number" ? id : Number(String(id).replace(/^!?F/i, ""));
  return Number.isFinite(n) && n >= DEVICE_FILTER_ID_MIN;
}

/* Percentage formatter that keeps small ratios readable: session usage is often a
   tiny fraction (44 of 2.4M), where "0%" would be useless. */
export function fmtPct(ratio) {
  const p = (Number(ratio) || 0) * 100;
  if (p === 0) return "0%";
  if (p >= 10) return p.toFixed(0) + "%";
  if (p >= 1) return p.toFixed(1) + "%";
  if (p >= 0.01) return p.toFixed(2) + "%";
  return p.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + "%";
}

/* ===================== country names =====================
   Intl.DisplayNames turns an ISO-3166 alpha-2 code into a localised country name,
   so we don't ship (and don't have to maintain) a translation table. A small set
   of codes the platform data doesn't cover is handled explicitly, and anything
   unresolved falls back to the raw code. */
const EXTRA_REGIONS = { EU: "European Union", AP: "Asia/Pacific", ZZ: "Unknown" };
const _regionNames = new Map();
export function countryName(iso, lang = "en") {
  const code = String(iso || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return String(iso ?? "");
  if (EXTRA_REGIONS[code]) return EXTRA_REGIONS[code];
  try {
    if (!_regionNames.has(lang)) {
      _regionNames.set(lang, new Intl.DisplayNames([lang], { type: "region" }));
    }
    return _regionNames.get(lang).of(code) || code;
  } catch { return code; }
}

/* Read a cookie value by name. Returns "" when absent or unreadable (HttpOnly). */
export function readCookie(name, cookieString) {
  const src = cookieString ?? (typeof document !== "undefined" ? document.cookie : "");
  for (const part of String(src).split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try { return decodeURIComponent(part.slice(eq + 1).trim()); }
      catch { return part.slice(eq + 1).trim(); }
    }
  }
  return "";
}

/* The device records the signed-in account in this (readable) cookie. */
export const USERNAME_COOKIE = "X-PacketX-Username";
export const signedInUser = (cookieString) => readCookie(USERNAME_COOKIE, cookieString);

/* Pull a username out of whatever get_current_user returns. The endpoint may hand
   back a bare string, or an object using any of a few plausible key names, so we
   accept the common shapes rather than depending on one exact contract. */
export function extractUsername(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") {
    const s = payload.trim();
    if (!s || s.startsWith("<")) return "";        // empty, or an HTML error page
    try {
      const j = JSON.parse(s);
      return extractUsername(j);
    } catch { return s; }                           // a bare username in the body
  }
  if (typeof payload !== "object") return "";
  const src = payload.args ?? payload.data ?? payload;
  for (const k of ["username", "user", "Username", "User", "name", "login"]) {
    const v = src?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
