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
   GRISM <find> name list, mirroring g_ftype[] in the firmware's
   tools/common/fc.c. `kind` drives which relations are offered and how the
   value is validated. exists = boolean presence check (no value).

   Six g_ftype entries are deliberately absent, because writing them into a
   <find> does nothing:
     service.google.youtube      match case is an empty stub; never matches.
     ip.addr.hash                these four are filled from binary hash tables
     dns.qry.name.hash           pushed over the GRISM data protocol, not from
     dns.qry.name_public_suffix.hash   a content string in the XML.
     http.request.url.hash
     5-tuple.live                synthesised by the firmware when a filter has
                                 tuple5_live_hashtable_size; not authorable.
   Check the firmware before adding anything here — a name g_ftype does not
   know is dropped with a log line, leaving a filter weaker than the UI shows. */
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
    /* No plain "gtp.imsi" here: an old field table in the firmware's
       doc/filter.md listed it, but it is not in g_ftype[] (checked across every
       branch), so the device logs "filter find type unsupport" and drops the
       find -- leaving a filter that quietly matches on fewer conditions than
       the UI showed. That table has since been removed in favour of fc.c.
       ip.addr.related.gtp.imsi below is the real, implemented field. */
    { v: "gtp.teid", label: "GTP TEID", kind: "str" },
    { v: "gtp.data.by.s1ap.CellIdentity", label: "S1AP Cell Identity", kind: "num" },
    { v: "gtp.data.by.s1ap.SubscriberProfileIDforRFP", label: "S1AP Subscriber Profile ID for RFP", kind: "num" },
    { v: "ip.addr.related.gtp.imsi", label: "IP related to GTP IMSI", kind: "str" },
    { v: "mec.mapping.ue.ipv4.connected", label: "UE IPv4 in MEC mapping", kind: "exists" },
  ]},
  { g: "Tunnels", items: [
    { v: "gre", label: "is GRE", kind: "exists" },
    { v: "vxlan", label: "is VXLAN", kind: "exists" },
    { v: "vxlan.vni", label: "VXLAN VNI", kind: "uint24" },
    { v: "erspan.spanid", label: "ERSPAN ID", kind: "num" },
    { v: "tunnel.outerlayer.ip.dsfield", label: "Outer layer DiffServ", kind: "uint8" },
    { v: "tunnel.innerlayer1.ip.dsfield", label: "Inner layer 1 DiffServ", kind: "uint8" },
    { v: "tunnel.innerlayer2.ip.dsfield", label: "Inner layer 2 DiffServ", kind: "uint8" },
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
    { v: "tls.handshake.ja4", label: "TLS JA4 (client hello)", kind: "ja4" },
    { v: "tls.handshake.ja4_a", label: "TLS JA4 a (prefix)", kind: "ja4part" },
    { v: "tls.handshake.ja4_b", label: "TLS JA4 b (cipher hash)", kind: "ja4part" },
    { v: "tls.handshake.ja4_c", label: "TLS JA4 c (extension hash)", kind: "ja4part" },
    { v: "tls.handshake.ja4s", label: "TLS JA4S (server hello)", kind: "ja4s" },
    { v: "tls.handshake.ja4s_a", label: "TLS JA4S a (prefix)", kind: "ja4part" },
    { v: "tls.handshake.ja4s_b", label: "TLS JA4S b (cipher)", kind: "ja4part" },
    { v: "tls.handshake.ja4s_c", label: "TLS JA4S c (extension hash)", kind: "ja4part" },
    { v: "quic.tag", label: "QUIC tag", kind: "quictag" },
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
    { v: "heartbeat.target.miss.nth", label: "Heartbeat miss (target index)", kind: "num" },
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
  // JA4  = a_b_c, a = proto + tls ver + sni + cipher/ext counts + alpn (10), b/c = 12 hex
  ja4: (s) => /^[tqd][a-z0-9]{2}[di]\d{4}[a-z0-9]{2}_[0-9a-f]{12}_[0-9a-f]{12}$/.test(s)
    ? null : "JA4, e.g. t13d1516h2_8daaf6152771_02713d6af862",
  // JA4S = a_b_c, a = proto + tls ver + ext count + alpn (7), b = 4 hex cipher, c = 12 hex
  ja4s: (s) => /^[tqd][a-z0-9]{2}\d{2}[a-z0-9]{2}_[0-9a-f]{4}_[0-9a-f]{12}$/.test(s)
    ? null : "JA4S, e.g. t130200_1301_234ea6891581",
  // a single a/b/c segment — the device compares one segment, so "_" can never match
  ja4part: (s) => /^[0-9a-z]+$/.test(s) ? null : "One JA4 part, no _",
  // the device only maps "CHLO" to a tag; anything else parses to 0 and can
  // never match, so reject it here rather than let it through silently
  quictag: (s) => /^CHLO$/i.test(s) ? null : "CHLO",
  str: (s) => s && s.length ? null : "Required",
  regex: (s) => s && s.length ? null : "Pattern required",
  exists: () => null,
};
export const validate = (k, v) => (VAL[k] ?? VAL.str)(v ?? "");
export const ph = (k) => ({ ip:"8.8.8.8", ipv6:"2001:db8::1", mac:"12:34:56:78:9a:bc", port:"443",
  vlan:"100", uint8:"6", uint16:"2048", uint24:"1", bit:"1", country:"TW", num:"500",
  grismport:"P0", fidref:"F1", tuple:"- 192.168.1.203 - - 443", regex:"\\x08facebook\\x03com",
  ja4:"t13d1516h2_8daaf6152771_02713d6af862", ja4s:"t130200_1301_234ea6891581",
  ja4part:"8daaf6152771", quictag:"CHLO" }[k] ?? "value");

/* ===================== filter (boolean tree) model ===================== */
/* A new condition starts on the same field as the one before it: conditions in
   a group are nearly always about the same thing, so repeating the previous
   choice saves picking it again. Falls back to ip.addr for the first one. */
export const mkFind = (field = "ip.addr") => {
  const f = FIELD_INDEX[field] ? field : "ip.addr";
  const rels = relationsFor(FIELD_INDEX[f]?.kind ?? "str");
  return { id: nid(), t: "find", field: f, rel: rels[0] ?? "==", val: "" };
};

/* The field the next condition added to this group should start on. */
export const lastFindField = (node) => {
  const kids = node?.children ?? [];
  for (let i = kids.length - 1; i >= 0; i--) {
    if (kids[i]?.t === "find" && kids[i].field) return kids[i].field;
  }
  return "ip.addr";
};
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
/* A new chain is the simplest thing that does something: everything arriving on
   the first port leaves on the second. No filter and no branch -- those are
   added deliberately, and starting with one meant deleting it whenever the
   chain was not about filtering. */
export const mkChain = (ingress = "P0", egress = "P1") => ({
  cid: nid(), ports: ingress, tree: mkOut(egress),
});

/* The first two ports the device offers, which is what a new chain starts from. */
export const firstTwoPorts = (ports) => {
  const list = (ports ?? []).filter(Boolean);
  return [list[0] ?? "P0", list[1] ?? list[0] ?? "P1"];
};
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
    // Load balancing needs somewhere to balance between: with a single destination
    // port the attribute is meaningless, so don't emit it even if the mode is still
    // set from when the node had several ports.
    const multi = String(n.ports || "").split(",").filter((p) => p.trim()).length > 1;
    const attr = (n.mode === "loadBalance" && multi) ? ` type="loadBalance" lbtype="${n.lb}"` : "";
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
  // A parser must not invent content. Loading a device config that has no
  // <chain> once produced a default P0→F1→P1 here, which serialised straight
  // back out on the next Export/Submit and silently added forwarding the device
  // never had. Both tabs render their own empty state, so return what the XML
  // actually said and let the UI offer the "+ New" button.
  return { doc: { filters, inputs, outputs, actions, chains }, warnings };
}

/* A device that was never configured has no run.xml at all — the web server
   answers 404 — and one whose configuration was cleared serves an empty body or
   a bare <run></run>. None of those is an error, and none of them should leave
   the previous document on screen: that is the starter template on a fresh page,
   which would then be what Export and Submit act on. All three mean the same
   thing, so say so once, here, and let the caller render an empty document.

   `empty` is also true for a well-formed <run> that simply holds nothing, so the
   UI can tell "the device has no configuration" apart from "loaded 12 filters". */
export function parseRunOrEmpty(text) {
  const blank = { filters: [], inputs: [], outputs: [], actions: [], chains: [] };
  if (!String(text ?? "").trim())
    return { doc: blank, warnings: [], empty: true };
  const parsed = parseRun(text);
  const d = parsed.doc;
  const empty = ["filters", "inputs", "outputs", "actions", "chains"]
    .every((k) => (d[k]?.length ?? 0) === 0);
  return { ...parsed, empty };
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

/* Two items are "the same" when they describe the same configuration — which is
   what they serialise to, not how they happen to look in memory. Comparing the
   objects directly would report edits that aren't there, because parsing fills in
   defaults (alt, fattrs, fidAlt…) and hands out fresh cid/node ids every time. */
const SECTION_SERIALIZERS = {
  filters: serializeFilter, inputs: serializeInput, outputs: serializeOutput,
  actions: serializeAction, chains: serializeChain,
};

function canonicalItem(item, section) {
  const ser = SECTION_SERIALIZERS[section];
  if (ser) { try { return ser(item); } catch { /* fall through to the raw shape */ } }
  return JSON.stringify(item);
}

export function diffDoc(baseDoc, curDoc) {
  const out = {};
  let total = 0;
  for (const [section, key] of Object.entries(SECTION_KEYS)) {
    const base = baseDoc?.[section] ?? [];
    const cur = curDoc?.[section] ?? [];
    const added = [], removed = [], changed = [];

    if (key === "cid") {
      // Chains have no stable identifier of their own, so match them on content:
      // a chain whose text is already in the baseline hasn't been touched.
      const pool = new Map();
      base.forEach((x) => { const c = canonicalItem(x, section); pool.set(c, (pool.get(c) ?? 0) + 1); });
      cur.forEach((x) => {
        const c = canonicalItem(x, section);
        if (pool.get(c) > 0) pool.set(c, pool.get(c) - 1);
        else added.push(x[key]);
      });
      pool.forEach((n, c) => { for (let i = 0; i < n; i++) removed.push(c); });
    } else {
      const baseById = new Map(base.map((x) => [x[key], x]));
      const curById = new Map(cur.map((x) => [x[key], x]));
      curById.forEach((item, id) => {
        if (!baseById.has(id)) added.push(id);
        else if (canonicalItem(baseById.get(id), section) !== canonicalItem(item, section)) changed.push(id);
      });
      baseById.forEach((_, id) => { if (!curById.has(id)) removed.push(id); });
    }

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

/* ===================== interface (port) settings =====================
   Ports come from get_config's `interfaces` list; their live link state comes from
   the statistics feed, keyed by port name. Only description and enable are
   editable — everything else is shown for context. */

/* Flatten get_config's interfaces into one list of ports, keeping the parent
   interface's type/name and, for virtual ports, their member ports and VLAN id. */
export function parseInterfacePorts(cfg) {
  const out = [];
  (cfg?.interfaces ?? []).forEach((iface) => {
    const type = iface.type || "";
    (iface.ports ?? []).forEach((p) => {
      if (!p.name) return;
      const row = {
        name: p.name,
        ifaceName: iface.name || "",
        type,
        description: p.description ?? "",
        enable: p.enable !== false,
        virtual: /^V/i.test(p.name),
      };
      if (row.virtual) {
        row.memberPorts = p.port ?? "";
        row.vlanid = p.vlanid ?? "";
      }
      out.push(row);
    });
  });
  return out.sort((a, b) => comparePortNames(a.name, b.name));
}

/* Merge the live figures from get_statistics_json into the port rows. */
export function mergePortStats(ports, statistics) {
  const byName = new Map((statistics ?? []).map((s) => [s.name, s]));
  return ports.map((p) => {
    const s = byName.get(p.name);
    return {
      ...p,
      ifidx: s?.ifidx ?? null,
      linkUp: s ? Number(s.linkStatus) === 1 : null,
      speed: s?.speed ?? null,
    };
  });
}

/* Build the configSet that applies description/enable for the changed ports.
   Mirrors the shape get_config_xml uses for port settings. */
export function buildPortConfigSet(ports) {
  const body = ports.map((p) =>
    `  <interfaces><ports><find name="${esc(p.name)}">` +
    `<description>${esc(p.description ?? "")}</description>` +
    `<enable>${p.enable ? "True" : "False"}</enable>` +
    `</find></ports></interfaces>`
  ).join("\n");
  return `<configSet reboot="no">\n${body}\n</configSet>`;
}

/* Which ports differ from the values the device reported. */
export function changedPorts(original, edited) {
  const base = new Map((original ?? []).map((p) => [p.name, p]));
  return (edited ?? []).filter((p) => {
    const o = base.get(p.name);
    if (!o) return false;
    return (o.description ?? "") !== (p.description ?? "") || !!o.enable !== !!p.enable;
  });
}

/* ===================== generic <args> settings =====================
   Time servers, name servers, deduplication and the fragmentation-correlation
   toggles all live under <args>, so one builder covers them. Booleans are written
   as True/False the way the device's own config dump does. */
const argVal = (v) => (typeof v === "boolean" ? (v ? "True" : "False") : esc(String(v ?? "")));

export function buildArgsConfigSet(args) {
  const body = Object.entries(args)
    .map(([k, v]) => `    <${k}>${argVal(v)}</${k}>`)
    .join("\n");
  return `<configSet reboot="no">\n  <args>\n${body}\n  </args>\n</configSet>`;
}

/* The in-tunnel decapsulation switches live under <filters><in-tunnels>. */
export function buildInTunnelsConfigSet(tunnels) {
  const body = Object.entries(tunnels)
    .map(([k, v]) => `      <${k}>${v ? "True" : "False"}</${k}>`)
    .join("\n");
  return `<configSet reboot="no">\n  <filters>\n    <in-tunnels>\n${body}\n    </in-tunnels>\n  </filters>\n</configSet>`;
}

/* Each service is enabled or disabled through its own <services><find name=…>. */
export function buildServicesConfigSet(services) {
  const body = (services ?? [])
    .map((s) => `  <services><find name="${esc(s.name)}"><enable>${s.enable ? "True" : "False"}</enable></find></services>`)
    .join("\n");
  return `<configSet reboot="no">\n${body}\n</configSet>`;
}

/* Internal daemons the operator has no reason to toggle from here — they're
   either managed by the platform or would cut off the very session being used. */
export const HIDDEN_SERVICES = new Set([
  "bsem_wd_feed", "telnetd", "ftpd", "packetx_trap_dispatcher", "statistics_backup",
]);

/* Services as the UI needs them, in the order the device reports. */
export function parseServices(cfg) {
  return (cfg?.services ?? []).map((s) => ({
    name: s.name ?? "",
    description: s.description ?? "",
    enable: s.enable === true,
  })).filter((s) => s.name && !HIDDEN_SERVICES.has(s.name));
}

/* Which services the user toggled. */
export function changedServices(original, edited) {
  const base = new Map((original ?? []).map((s) => [s.name, s]));
  return (edited ?? []).filter((s) => base.has(s.name) && !!base.get(s.name).enable !== !!s.enable);
}

/* The timezone endpoint returns [{ "Asia/Taipei": 0 }, …]; flatten to names. */
export function parseTimezones(payload) {
  return (payload?.timezone ?? [])
    .flatMap((entry) => Object.keys(entry ?? {}))
    .filter(Boolean);
}

/* The same payload marks the zone currently in use with a 1, e.g.
   { "Asia/Taipei": 1 }. Returns "" when nothing is flagged. */
export function currentTimezone(payload) {
  for (const entry of payload?.timezone ?? []) {
    for (const [name, active] of Object.entries(entry ?? {})) {
      if (Number(active) === 1) return name;
    }
  }
  return "";
}

/* ===================== XML syntax highlighting =====================
   Split XML into typed tokens so the raw-configuration view can colour it.
   Returns [{ type, text }] covering the input exactly, in order. */
export function tokenizeXml(text) {
  const out = [];
  const src = String(text ?? "");
  const re = /(<!--[\s\S]*?-->)|(<\/?)([A-Za-z_][\w.:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?>)/g;
  let last = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ type: "text", text: src.slice(last, m.index) });
    if (m[1]) { out.push({ type: "comment", text: m[1] }); last = re.lastIndex; continue; }
    out.push({ type: "punct", text: m[2] });
    out.push({ type: "tag", text: m[3] });
    // attributes: name="value" pairs, anything else passes through as punctuation
    const attrs = m[4] ?? "";
    const ar = /([A-Za-z_][\w.:-]*)(\s*=\s*)("[^"]*"|'[^']*')|(\s+)/g;
    let al = 0, am;
    while ((am = ar.exec(attrs)) !== null) {
      if (am.index > al) out.push({ type: "punct", text: attrs.slice(al, am.index) });
      if (am[4]) out.push({ type: "punct", text: am[4] });
      else {
        out.push({ type: "attr", text: am[1] });
        out.push({ type: "punct", text: am[2] });
        out.push({ type: "value", text: am[3] });
      }
      al = ar.lastIndex;
    }
    if (al < attrs.length) out.push({ type: "punct", text: attrs.slice(al) });
    out.push({ type: "punct", text: m[5] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ type: "text", text: src.slice(last) });
  return out.filter((t) => t.text !== "");
}

/* ===================== heartbeat =====================
   The device sends a canned frame out one port and expects it back on another;
   a target that stops returning frames is reported as down. Settings are written
   back in full — the whole <heartbeat> block replaces what's there — so targets
   can be added, edited or removed in one submit. */

/* The stock probe frame the device ships with — a new target starts from this so
   it works without the operator having to craft one by hand. */
export const DEFAULT_HEARTBEAT_PACKET =
  "000d48285134000d482851338137ffff0030000000004004eca2c613010" +
  "2c61301010000000000000000000000000000000000000000000000000000";

export const mkHeartbeatTarget = (id = 1) => ({
  id, enable: true, sendPort: "P0", receivePort: "P0", description: "",
  packetData: DEFAULT_HEARTBEAT_PACKET,
});

export function parseHeartbeat(cfg) {
  const hb = cfg?.heartbeat ?? {};
  return {
    enable: hb.enable === true,
    frequency: hb.frequency ?? 500,
    maxAllowTimeouts: hb.maxAllowTimeouts ?? 3,
    targets: (hb.target ?? []).map((t) => ({
      id: Number(t.id) || 0,
      enable: t.enable === true,
      sendPort: t.sendPort ?? "",
      receivePort: t.receivePort ?? "",
      packetData: t.packetData ?? "",
      description: t.description ?? "",
    })),
  };
}

export function buildHeartbeatConfigSet(hb) {
  const targets = (hb.targets ?? []).map((t) =>
    `    <target>` +
    `<enable>${t.enable ? "true" : "false"}</enable>` +
    `<sendPort>${esc(t.sendPort ?? "")}</sendPort>` +
    `<receivePort>${esc(t.receivePort ?? "")}</receivePort>` +
    `<packetData>${esc(t.packetData ?? "")}</packetData>` +
    `<description>${esc(t.description ?? "")}</description>` +
    `<id>${Number(t.id) || 0}</id>` +
    `</target>`
  ).join("\n");
  return `<configSet reboot="no">\n  <heartbeat>\n` +
    `    <enable>${hb.enable ? "true" : "false"}</enable>\n` +
    `    <frequency>${Number(hb.frequency) || 0}</frequency>\n` +
    `    <maxAllowTimeouts>${Number(hb.maxAllowTimeouts) || 0}</maxAllowTimeouts>\n` +
    (targets ? targets + "\n" : "") +
    `  </heartbeat>\n</configSet>`;
}

/* get_heartbeat_status returns [[n, up], …] where n is the position among the
   *enabled* targets, not the target's own id. Keep the raw rows in order. */
export function parseHeartbeatStatus(payload) {
  return (payload?.heartbeat_status ?? [])
    .filter((row) => Array.isArray(row) && row.length >= 2)
    .map((row) => ({ index: Number(row[0]), up: row[1] === true }));
}

/* Line the status rows up with the enabled targets so each one can be labelled. */
export function heartbeatStatusRows(targets, status) {
  const enabled = (targets ?? []).filter((t) => t.enable);
  return (status ?? []).map((s) => {
    const t = enabled[s.index];
    return { ...s, id: t?.id ?? null, description: t?.description ?? "",
      sendPort: t?.sendPort ?? "", receivePort: t?.receivePort ?? "" };
  });
}


export function heartbeatProblems(hb, problems = []) {
  // Targets are written back positionally and the device itself ships configs with
  // repeated ids, so ids are not required to be unique.
  (hb.targets ?? []).forEach((t, i) => {
    const where = `heartbeat #${i + 1}`;
    if (!t.sendPort || !t.receivePort) problems.push({ scope: where, msg: "send and receive ports are required" });
    if (!/^[0-9a-fA-F]*$/.test(t.packetData ?? "")) problems.push({ scope: where, msg: "packet data must be hexadecimal" });
    if ((t.packetData ?? "").length % 2 !== 0) problems.push({ scope: where, msg: "packet data needs an even number of hex digits" });
  });
  return problems;
}

/* ===================== extra service settings =====================
   A couple of services carry more than an on/off switch. */
export function parseServiceExtras(cfg) {
  const find = (n) => (cfg?.services ?? []).find((s) => s.name === n) ?? {};
  const b = find("backup"), x = find("xmlrpc");
  return {
    xmlrpc: { localhost_only: x.localhost_only === true },
    backup: {
      host: b.host ?? "", port: b.port ?? 21, user: b.user ?? "",
      pass: b.pass ?? "", dir: b.dir ?? "", crontab: b.crontab ?? "0 0 * * *",
    },
  };
}

export function buildServiceExtrasConfigSet(extras) {
  const b = extras.backup ?? {};
  return `<configSet reboot="no">\n` +
    `  <services><find name="xmlrpc"><localhost_only>${extras.xmlrpc?.localhost_only ? "True" : "False"}</localhost_only></find></services>\n` +
    `  <services><find name="backup">` +
    `<host>${esc(b.host ?? "")}</host>` +
    `<port>${Number(b.port) || 21}</port>` +
    `<user>${esc(b.user ?? "")}</user>` +
    `<pass>${esc(b.pass ?? "")}</pass>` +
    `<dir>${esc(b.dir ?? "")}</dir>` +
    `<crontab>${esc(b.crontab ?? "")}</crontab>` +
    `</find></services>\n</configSet>`;
}

/* The target list is a fixed set of slots that the device rewrites positionally,
   so adding one doesn't grow the list: the first disabled slot is taken over and
   its contents replaced. Only when every slot is in use does the list extend.

     1+ 2- 3-   add 9   ->   1+ 9+ 3-      (slot two reused)
     1+ 9+ 3-   remove  ->   1+ 9- 3-      (slot two switched off, id kept) */
export function insertHeartbeatTarget(targets, target) {
  const list = targets ?? [];
  const free = list.findIndex((t) => !t.enable);
  if (free < 0) return [...list, target];
  const next = list.slice();
  next[free] = target;
  return next;
}

/* ===================== logging (NetFlow / syslog / DPI) =====================
   The device exports flow records as NetFlow or syslog, and can additionally log
   DNS, HTTP and TLS metadata. Each exporter has a list of targets (collector
   address, port, which interfaces, optional filter). Blank values come back as a
   single space, so everything is trimmed on the way in. */

const s_ = (v) => String(v ?? "").trim();
const n_ = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const SYSLOG_SYSTEM_SUBTYPES = ["alert_dropped_packets", "alert_heartbeat_miss", "alert_power_failure", "common"];
export const SYSLOG_MATCHED_SUBTYPES = ["sip", "dip", "sport", "dport", "protocol", "find_id", "find_content"];

const parseTarget = (t) => ({
  enable: t?.enable === true,
  dip: s_(t?.dip), dport: n_(t?.dport, 514),
  interfaces: s_(t?.interfaces) || "all", filter: s_(t?.filter),
});

export const mkLogTarget = (dport = 514) => ({ enable: true, dip: "", dport, interfaces: "all", filter: "" });
export const mkNetflowTarget = () => ({ ...mkLogTarget(9995), version: 9 });
/* A fresh target is only useful if it actually carries something, so the fields
   and events people normally want are on from the start. */
export const SYSLOG_SYSTEM_DEFAULTS = SYSLOG_SYSTEM_SUBTYPES;   // report every system event by default

export const mkSyslogTarget = (type = "matched") => {
  const keys = type === "system" ? SYSLOG_SYSTEM_SUBTYPES : SYSLOG_MATCHED_SUBTYPES;
  const on = type === "system" ? SYSLOG_SYSTEM_DEFAULTS : SYSLOG_MATCHED_SUBTYPES;
  return { ...mkLogTarget(514), type, subtype: Object.fromEntries(keys.map((k) => [k, on.includes(k)])) };
};

export function parseLogging(cfg) {
  const log = cfg?.log ?? {}, nf = log.netflow ?? {}, sl = log.syslog ?? {};
  const dpi = (key) => {
    const d = cfg?.[key] ?? {}, s = d.syslog ?? {};
    return {
      enable: d.enable === true, port: s_(s.port) || "M0",
      targets: (s.target ?? []).map(parseTarget),
      ...(key === "dpidnslog" ? {
        active_timeout: n_(s.active_timeout, 30), inactive_timeout: n_(s.inactive_timeout, 10),
        response_only: s.response_only === true, noerror_only: s.noerror_only === true,
      } : {}),
      ...(key === "dpissllog" ? { ja3: s.ja3 === true, ja4: s.ja4 === true } : {}),
    };
  };
  return {
    enable: log.enable === true,
    type: s_(log.type) || "netflow",
    netflow: {
      port: s_(nf.port) || "M0",
      engine_type: n_(nf.engine_type), engine_id: n_(nf.engine_id),
      active_timeout: n_(nf.active_timeout, 7200), inactive_timeout: n_(nf.inactive_timeout, 60),
      tcp_fin_rst_timeout: n_(nf.tcp_fin_rst_timeout, 5),
      targets: (nf.target ?? []).map((t) => ({ ...parseTarget(t), version: n_(t?.version, 9) })),
    },
    syslog: {
      enable: sl.enable === true, port: s_(sl.port) || "M0",
      targets: (sl.target ?? []).map((t) => ({
        ...parseTarget(t), type: s_(t?.type) || "matched",
        subtype: Object.fromEntries(
          (s_(t?.type) === "system" ? SYSLOG_SYSTEM_SUBTYPES : SYSLOG_MATCHED_SUBTYPES)
            .map((k) => [k, t?.subtype?.[k] === true])),
      })),
    },
    dns: dpi("dpidnslog"), http: dpi("dpihttplog"), ssl: dpi("dpissllog"),
  };
}

const bool_ = (v) => (v ? "True" : "False");
const tagsFor = (t, pad) =>
  `${pad}<enable>${bool_(t.enable)}</enable>\n` +
  `${pad}<dip>${esc(t.dip ?? "")}</dip>\n` +
  `${pad}<dport>${n_(t.dport, 514)}</dport>\n` +
  `${pad}<interfaces>${esc(t.interfaces || "all")}</interfaces>\n` +
  `${pad}<filter>${esc(t.filter ?? "")}</filter>`;

export function buildLoggingConfigSet(log) {
  const nf = log.netflow, sl = log.syslog;
  const nfTargets = nf.targets.map((t) =>
    `      <target>\n${tagsFor(t, "        ")}\n        <version>${n_(t.version, 9)}</version>\n      </target>`).join("\n");
  const slTargets = sl.targets.map((t) => {
    const keys = t.type === "system" ? SYSLOG_SYSTEM_SUBTYPES : SYSLOG_MATCHED_SUBTYPES;
    const sub = keys.map((k) => `          <${k}>${bool_(t.subtype?.[k])}</${k}>`).join("\n");
    return `      <target>\n${tagsFor(t, "        ")}\n        <type>${esc(t.type)}</type>\n` +
      `        <subtype>\n${sub}\n        </subtype>\n      </target>`;
  }).join("\n");

  const dpiBlock = (tag, d, extra = "") => {
    const targets = d.targets.map((t) => `      <target>\n${tagsFor(t, "        ")}\n      </target>`).join("\n");
    return `  <${tag}>\n    <enable>${bool_(d.enable)}</enable>\n    <type>syslog</type>\n` +
      `    <syslog>\n      <port>${esc(d.port)}</port>\n${extra}` +
      (targets ? targets + "\n" : "") + `    </syslog>\n  </${tag}>`;
  };

  return `<configSet reboot="no">\n` +
    `  <log>\n    <enable>${bool_(log.enable)}</enable>\n    <type>${esc(log.type)}</type>\n` +
    `    <netflow>\n      <port>${esc(nf.port)}</port>\n` +
    `      <engine_type>${n_(nf.engine_type)}</engine_type>\n` +
    `      <engine_id>${n_(nf.engine_id)}</engine_id>\n` +
    `      <active_timeout>${n_(nf.active_timeout, 7200)}</active_timeout>\n` +
    `      <inactive_timeout>${n_(nf.inactive_timeout, 60)}</inactive_timeout>\n` +
    `      <tcp_fin_rst_timeout>${n_(nf.tcp_fin_rst_timeout, 5)}</tcp_fin_rst_timeout>\n` +
    (nfTargets ? nfTargets + "\n" : "") + `    </netflow>\n` +
    `    <syslog>\n      <enable>${bool_(sl.enable)}</enable>\n      <port>${esc(sl.port)}</port>\n` +
    (slTargets ? slTargets + "\n" : "") + `    </syslog>\n  </log>\n` +
    dpiBlock("dpidnslog", log.dns,
      `      <active_timeout>${n_(log.dns.active_timeout, 30)}</active_timeout>\n` +
      `      <inactive_timeout>${n_(log.dns.inactive_timeout, 10)}</inactive_timeout>\n` +
      `      <response_only>${bool_(log.dns.response_only)}</response_only>\n` +
      `      <noerror_only>${bool_(log.dns.noerror_only)}</noerror_only>\n`) + "\n" +
    dpiBlock("dpihttplog", log.http) + "\n" +
    dpiBlock("dpissllog", log.ssl,
      `      <ja3>${bool_(log.ssl.ja3)}</ja3>\n      <ja4>${bool_(log.ssl.ja4)}</ja4>\n`) +
    `\n</configSet>`;
}

export function loggingProblems(log, problems = []) {
  const check1 = (where, targets) => (targets ?? []).forEach((t, i) => {
    if (!t.enable) return;
    if (!t.dip) problems.push({ scope: `${where} #${i + 1}`, msg: "collector address is required" });
    else if (validate("ip", t.dip)) problems.push({ scope: `${where} #${i + 1}`, msg: "collector address is not a valid IP" });
    if (validate("port", String(t.dport))) problems.push({ scope: `${where} #${i + 1}`, msg: "invalid port" });
    if (t.interfaces !== undefined && String(t.interfaces).trim() === "")
      problems.push({ scope: `${where} #${i + 1}`, msg: "select at least one interface" });
  });
  check1("netflow", log.netflow?.targets);
  check1("syslog", log.syslog?.targets);
  check1("dns log", log.dns?.targets);
  check1("http log", log.http?.targets);
  check1("tls log", log.ssl?.targets);
  return problems;
}

/* ===================== log source / interface choices =====================
   Records leave through a management interface or a data port. LOOP ports only
   carry traffic back into the device, so they're never a sensible source, and
   they aren't something you'd scope logging to either. */
const isLoopIface = (iface) => (iface?.type || "").toUpperCase() === "LOOP";

/* Data ports traffic can arrive on. LOOP ports are excluded by default because
   they're never a sensible *source* for an exporter, but logging can still be
   scoped to them, so callers can ask for the full list. */
export function dataPortNames(cfg, { includeLoop = false } = {}) {
  const names = (cfg?.interfaces ?? [])
    .filter((i) => includeLoop || !isLoopIface(i))
    .flatMap((i) => i.ports ?? [])
    .map((p) => p.name)
    .filter(Boolean);
  return sortPortNames([...new Set(names)]);
}

/* Enabled management interfaces, e.g. M0 / M1. */
export function managementPortNames(cfg) {
  return (cfg?.ifcfgs ?? [])
    .filter((f) => /^management/i.test(f.role ?? "") && f.enable === true && f.name)
    .map((f) => f.name);
}

/* Ports a log exporter can send from. */
export const logSourcePorts = (cfg) => [...managementPortNames(cfg), ...dataPortNames(cfg)];

/* The interfaces field is either "all" or a comma list. Selecting every data port
   is the same as "all", so it collapses back to that. */
export function interfacesToList(value, allPorts) {
  const v = String(value ?? "").trim();
  if (v.toLowerCase() === "all") return [...allPorts];
  if (!v) return [];                                  // cleared, not "everything"
  return v.split(",").map((x) => x.trim()).filter(Boolean);
}

export function listToInterfaces(selected, allPorts) {
  const chosen = [...new Set(selected)].filter((p) => allPorts.includes(p));
  if (chosen.length === 0) return "";                       // nothing picked yet
  if (chosen.length === allPorts.length) return "all";      // everything is just "all"
  return sortPortNames(chosen).join(",");
}

/* ===================== flow engine =====================
   Flow tracking itself (v4/v6 on-off plus table sizes) lives under <args>, while
   the three timeouts that decide when a flow is considered finished are carried
   inside <netflow> in the device's XML. They belong together in the UI even
   though they're written back to two different places. */
export const FLOW_ARGS = ["flow", "flowv6", "flowCacheBaseSize", "flowv6TableSize"];
export const FLOW_TIMEOUTS = ["active_timeout", "inactive_timeout", "tcp_fin_rst_timeout"];

export function parseFlowArgs(cfg) {
  const a = cfg?.args ?? {};
  return {
    flow: a.flow === true,
    flowv6: a.flowv6 === true,
    flowCacheBaseSize: n_(a.flowCacheBaseSize, 0),
    flowv6TableSize: n_(a.flowv6TableSize, 0),
  };
}

export function flowProblems(flow, problems = []) {
  if (flow.flow && !(flow.flowCacheBaseSize > 0))
    problems.push({ scope: "flow", msg: "IPv4 flow table size must be greater than zero" });
  if (flow.flowv6 && !(flow.flowv6TableSize > 0))
    problems.push({ scope: "flow", msg: "IPv6 flow table size must be greater than zero" });
  return problems;
}

/* ===================== flow service catalogue =====================
   statisticsFlowService tells the device which protocol/port combinations to
   group together when it reports per-service traffic. The wire format packs each
   service into one semicolon-separated chunk: the protocol/port pairs first, then
   the display name last, e.g.

     TCP/443,UDP/443,HTTPS;UDP/53,TCP/53,DNS                              */
export function parseFlowServices(value) {
  return String(value ?? "").split(";").map((chunk) => chunk.trim()).filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split(",").map((p) => p.trim()).filter(Boolean);
      const ports = [], rest = [];
      parts.forEach((p) => {
        const m = p.match(/^([A-Za-z]+)\/(\d+)$/);
        if (m) ports.push({ proto: m[1].toUpperCase(), port: Number(m[2]) });
        else rest.push(p);
      });
      return { name: rest.join(" ") || "", ports };
    })
    .filter((s) => s.ports.length || s.name);
}

export function buildFlowServices(services) {
  return (services ?? [])
    .filter((s) => s.ports?.length && s.name)
    .map((s) => [...s.ports.map((p) => `${p.proto}/${p.port}`), s.name].join(","))
    .join(";");
}

export const mkFlowService = () => ({ name: "", ports: [{ proto: "TCP", port: 80 }] });

export function flowServiceProblems(services, problems = []) {
  (services ?? []).forEach((s, i) => {
    const where = `service #${i + 1}`;
    if (!s.name.trim()) problems.push({ scope: where, msg: "a service needs a name" });
    if (!s.ports?.length) problems.push({ scope: where, msg: "add at least one protocol and port" });
    (s.ports ?? []).forEach((p) => {
      if (validate("port", String(p.port))) problems.push({ scope: where, msg: `invalid port ${p.port}` });
    });
  });
  return problems;
}

/* ===================== login authentication (RADIUS / TACACS+) ===================== */
export function parseViews(cfg) {
  const v = cfg?.views ?? {};
  return {
    radiusLogin: v.radiusLogin === true, radiusHost: s_(v.radiusHost),
    radiusPort: n_(v.radiusPort, 1812), radiusSecret: s_(v.radiusSecret),
    tacacsLogin: v.tacacsLogin === true, tacacsHost: s_(v.tacacsHost),
    tacacsPort: n_(v.tacacsPort, 49), tacacsSecret: s_(v.tacacsSecret),
  };
}

export function buildViewsConfigSet(v) {
  const row = (k, val) => `    <${k}>${typeof val === "boolean" ? bool_(val) : esc(String(val))}</${k}>`;
  return `<configSet reboot="no">\n  <views>\n` +
    [["radiusLogin", v.radiusLogin], ["radiusHost", v.radiusHost], ["radiusPort", n_(v.radiusPort, 1812)],
     ["radiusSecret", v.radiusSecret], ["tacacsLogin", v.tacacsLogin], ["tacacsHost", v.tacacsHost],
     ["tacacsPort", n_(v.tacacsPort, 49)], ["tacacsSecret", v.tacacsSecret]]
      .map(([k, val]) => row(k, val)).join("\n") +
    `\n  </views>\n</configSet>`;
}

export function viewsProblems(v, problems = []) {
  const one = (on, host, port, label) => {
    if (!on) return;
    if (!host) problems.push({ scope: label, msg: "server address is required" });
    else if (validate("ip", host) && !/^[\w.-]+$/.test(host))
      problems.push({ scope: label, msg: "server address is not a valid host or IP" });
    if (validate("port", String(port))) problems.push({ scope: label, msg: "invalid port" });
  };
  one(v.radiusLogin, v.radiusHost, v.radiusPort, "RADIUS");
  one(v.tacacsLogin, v.tacacsHost, v.tacacsPort, "TACACS+");
  // only one external authentication server can be in charge at a time
  if (v.radiusLogin && v.tacacsLogin)
    problems.push({ scope: "login", msg: "enable either RADIUS or TACACS+, not both" });
  return problems;
}

/* ===================== firmware update =====================
   update_download_check returns "downloaded,total" in bytes. The download is only
   finished when both numbers agree and the total is non-zero — a total of 0 means
   the device hasn't started (or has lost) the transfer. */
export function parseDownloadProgress(text) {
  const [a, b] = String(text ?? "").trim().split(",");
  const done = n_(a, 0), total = n_(b, 0);
  return { done, total, ratio: total > 0 ? Math.min(1, done / total) : 0, complete: total > 0 && done >= total };
}

/* update_check answers with a version string when an update is available, and
   with something else (empty, "no", an error page) when there isn't. */
export function parseUpdateCheck(text) {
  const v = String(text ?? "").trim();
  return /^\d+(\.\d+)+$/.test(v) ? v : "";
}

/* Where the device answers after a factory reset. Every other setting is
   discarded, so whatever management address it is reachable on now is gone and
   the session dies with it — the UI has to say this before the reset, not after,
   and say where to continue. Kept here rather than inside the translations so
   the address appears once. */
export const FACTORY_MGMT_IP = "192.168.1.150";

/* ===================== internal accounts =====================
   The device stores password hashes, never the password: every account call
   sends a plain SHA-256 hex digest of it, unsalted. Web Crypto is async, so is
   this. Available in the browser and under Node, so it can be tested.

   Verified against the device's own account: sha256("packetx") is
   5ba7ad93c78984d6afe97b5e053865165019fd10e1faaec2e5831731ded3a30c. */
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* The device answers an unauthenticated request to the account endpoints with
   404, not 401. Reading that as "this firmware has no account management" was
   wrong — every device tested serves them once signed in — and it turned a
   lapsed session into a message telling the user the feature did not exist.
   Treat both as "sign in again"; anything else reports its status. */
export function accountsErrorKey(status) {
  return (status === 404 || status === 401) ? "set.acctSignIn" : null;
}

/* This account is the device's own and the server refuses to delete it; say so
   in the UI rather than offering a button that cannot work. */
export const UNDELETABLE_USER = "packetx";

/* GET /list_user answers {"user_list":[["packetx","admin"], ...]} — pairs, not
   objects. Anything malformed is dropped rather than rendered as "undefined". */
export function parseUserList(payload) {
  let data = payload;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { return []; } }
  const rows = data?.user_list;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => Array.isArray(r) && typeof r[0] === "string" && r[0].trim())
    .map((r) => ({ name: r[0].trim(), role: typeof r[1] === "string" ? r[1] : "" }));
}

/* Why a new account cannot be created, or null when it can. Checked here so the
   button can stay disabled instead of relying on the server to say no. */
export function newUserProblem(name, pass, confirm, existing = []) {
  const n = String(name ?? "").trim();
  if (!n) return "name required";
  if (!/^[A-Za-z0-9._-]+$/.test(n)) return "letters, digits, . _ - only";
  if (existing.some((u) => u.name.toLowerCase() === n.toLowerCase())) return "already exists";
  if (!pass) return "password required";
  if (pass !== confirm) return "passwords do not match";
  return null;
}

/* With RADIUS or TACACS+ login enabled the device authenticates against that
   server, and these local accounts only get a look in when it cannot be reached.
   Creating one and finding it rejected is a confusing way to learn that, so the
   UI says it up front. */
export function internalAccountsNoteKey({ radiusLogin, tacacsLogin } = {}) {
  // One message whichever is on. Naming the server, and having a separate
  // wording for "both", read as though internal and remote accounts worked side
  // by side. They do not: remote auth takes over entirely and these are only
  // reachable when it is not.
  return (radiusLogin || tacacsLogin) ? "set.acctFallbackOnly" : null;
}

/* Same, for changing the signed-in account's own password.

   `username` must be the account the device says is signed in. The cookie that
   carries it is HttpOnly, so document.cookie cannot see it — reading it there
   and falling back to a default meant every password change was aimed at that
   default account instead of the user's own. Without a name, refuse. */
export function changePasswordProblem(oldPass, next, confirm, username) {
  if (!String(username ?? "").trim()) return "signed-in account unknown";
  if (!oldPass) return "current password required";
  if (!next) return "new password required";
  if (next !== confirm) return "passwords do not match";
  if (next === oldPass) return "new password matches the old one";
  return null;
}



/* ===================== instant packet capture =====================
   A short-lived capture: one output writing to a storage volume, and one chain
   feeding it from the chosen ingress ports. It is submitted as a complete <run>
   to submit_instant, which the device applies alongside the running config and
   tears down once the output's seconds-to-live expire. */

export function buildInstantCapture({ ports, filter, stl, storage, dir }) {
  const inPorts = (Array.isArray(ports) ? ports : String(ports ?? "").split(","))
    .map((p) => String(p).trim()).filter(Boolean).join(",");
  const fid = String(filter ?? "").trim();
  return `<run>` +
    `<output id="777" stl="${n_(stl, 5)}">` +
      `<port>${esc(storage ?? "")}</port>` +
      `<dir>${esc(dir ?? "snapshot")}</dir>` +
    `</output>` +
    `<chain>` +
      `<in>${esc(inPorts)}</in>` +
      (fid ? `<fid>${esc(fid)}</fid>` : "") +
      `<out>O777</out>` +
    `</chain>` +
  `</run>`;
}

export function captureProblems(opts, problems = []) {
  const ports = Array.isArray(opts.ports) ? opts.ports : [];
  if (ports.length === 0) problems.push({ scope: "capture", msg: "choose at least one interface to capture from" });
  if (!opts.storage) problems.push({ scope: "capture", msg: "choose a storage volume" });
  if (!String(opts.dir ?? "").trim()) problems.push({ scope: "capture", msg: "a directory is required" });
  if (!(n_(opts.stl, 0) > 0)) problems.push({ scope: "capture", msg: "seconds to live must be greater than zero" });
  return problems;
}

/* Storage volumes offered for capture — only the ones that are switched on. */
export function parseStorages(payload) {
  const list = Array.isArray(payload) ? payload : (payload?.storages ?? payload?.storage ?? []);
  return (list ?? [])
    .filter((s) => s && s.name && s.enable !== false)
    .map((s) => ({
      name: s.name,
      usage: n_(s.usage ?? s.used, 0),
      available: n_(s.available ?? s.avail ?? s.free, 0),
      dir: s.dir ?? "",
    }));
}

/* get_storage_file_list rows are [kind, name, bytes, modified], where kind is 0
   for a directory and 1 for a file. Listing a volume without a directory answers
   a bare array; listing a directory answers { file_list: [...] }. Directories sort
   first so a listing reads top-down, then files newest first. */
export function parseStorageFiles(payload, { storage, dir } = {}) {
  const rows = Array.isArray(payload) ? payload : (payload?.file_list ?? []);
  return (rows ?? [])
    .filter((r) => Array.isArray(r) && r.length >= 2)
    .map((r) => {
      const name = String(r[1]);
      const isDir = Number(r[0]) === 0;
      return {
        name, isDir,
        bytes: n_(r[2], 0),
        modified: String(r[3] ?? ""),
        href: isDir ? "" : captureFileHref(storage, dir, name),
      };
    })
    .sort((a, b) => (a.isDir === b.isDir
      ? (a.isDir ? a.name.localeCompare(b.name)
                 : (b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name)))
      : (a.isDir ? -1 : 1)));
}

/* Directory names for a storage volume. */
export const parseStorageDirs = (payload) =>
  parseStorageFiles(payload).filter((r) => r.isDir).map((r) => r.name);

/* Path helpers for walking into and back out of directories. */
export const joinDir = (dir, name) => [dir, name].map((p) => String(p ?? "").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
export const parentDir = (dir) => String(dir ?? "").replace(/^\/+|\/+$/g, "").split("/").slice(0, -1).join("/");
export const dirCrumbs = (dir) => {
  const parts = String(dir ?? "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
};

/* The path an <input> filepath uses, e.g. H1/snapshot/capture.pcap */
export const storagePath = (storage, dir, name) =>
  [storage, dir, name].map((p) => String(p ?? "").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");

/* A .tmp file is still being written by the device — downloading it would give a
   truncated capture, so it isn't offered until the device renames it. */
export const isPartialCapture = (name) => /\.tmp$/i.test(String(name ?? "").trim());

export const captureFileHref = (storage, dir, name) =>
  `/file_manager/preview?download=1&file=/${[storage, dir, name].map((p) => String(p ?? "").replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;

/* ===================== traffic generator defaults =====================
   A newly created generator should produce sensible traffic straight away, so
   the fields that must be filled in get a working starting value. The MAC
   addresses come from the device itself — see parsePortMacs. */
export const TRAFFIC_GEN_DEFAULTS = {
  protocol: "UDP",
  packet_size: "512",
  payload_text: "packetx",
  src_ip: "10.0.1.99",
  dest_ip: "10.0.1.100",
  src_port: "5000",
  dest_port: "5001",
};

/* get_port_mac rows are [index, mac, portName]. */
export function parsePortMacs(payload) {
  const rows = payload?.port_mac ?? [];
  return rows
    .filter((r) => Array.isArray(r) && r.length >= 3)
    .map((r) => ({ index: n_(r[0], 0), mac: String(r[1] ?? ""), port: String(r[2] ?? "") }))
    .filter((r) => r.mac);
}

/* Seed a generator: the stock defaults plus the first two device MACs, so the
   frames it emits carry real addresses rather than placeholders. */
export function trafficGenDefaults(macPayload) {
  const macs = parsePortMacs(macPayload);
  return {
    ...TRAFFIC_GEN_DEFAULTS,
    ...(macs[0] ? { src_mac: macs[0].mac } : {}),
    ...(macs[1] ? { dest_mac: macs[1].mac } : {}),
  };
}

/* A custom output is only identifiable by its id unless we show what the author
   called it and where it actually sends traffic. */
export function outputLabel(o) {
  const name = String(o?.name || o?.alt || "").trim();
  const port = String(o?.port || "").trim();
  return name && port ? `${name} · ${port}` : (name || port);
}

/* Same idea for a filter: "F12" alone says nothing about what it matches. */
export const filterLabel = (f) => {
  const name = String(f?.name || f?.alt || "").trim();
  return name ? `F${f.id} — ${name}` : `F${f.id}`;
};

/* ===================== XML validation =====================
   formatXml only notices unbalanced tags. Before submitting the device's whole
   configuration it's worth catching everything a parser would reject — stray
   "&", mismatched names, junk before the root — and saying where. */
export function xmlError(text) {
  const src = String(text ?? "").trim();
  if (!src) return "the configuration is empty";
  if (!src.startsWith("<")) return "the configuration must start with an XML tag";
  let doc;
  try { doc = parseXml(src); }
  catch (e) { return String(e.message || e); }

  // Browsers and linkedom both report failures as a <parsererror> element rather
  // than by throwing, so the document has to be inspected for one.
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) {
    const msg = (err.textContent || "").replace(/\s+/g, " ").trim();
    return msg ? msg.slice(0, 200) : "the XML could not be parsed";
  }
  if (!doc.documentElement) return "the XML has no root element";

  // linkedom is lenient about closing tags, so keep the balance check as well.
  try { formatXml(src); }
  catch (e) { return String(e.message || e); }
  return "";
}

/* ===================== GRISM document validation =====================
   Well-formed XML can still be a nonsense pipeline — an output with no port, a
   chain referencing a filter that isn't defined. Parse the text and run the same
   checks the editors use, so the author hears about it before applying. */
export function grismXmlProblems(xmlText) {
  const out = [];
  // Check well-formedness first: some parsers silently close dangling tags, so
  // relying on parseRun to fail would give different answers in different hosts.
  const bad = xmlError(xmlText);
  if (bad) return [{ scope: "xml", msg: bad }];
  let doc, parseWarnings = [];
  // parseRun answers {doc, warnings}; reading .filters off the wrapper left
  // every list undefined, so these checks quietly passed anything well-formed.
  try {
    const parsed = parseRun(xmlText);
    doc = parsed.doc;
    parseWarnings = parsed.warnings ?? [];
  } catch (e) { return [{ scope: "run", msg: String(e.message || e) }]; }

  // parseRun already notices an unknown field name, a stray element inside a
  // filter, or an unexpected top-level tag. Those were being dropped, so a
  // typo like <filtr> or name="nosuch.field" read as a clean document.
  //
  // Reported under their own scope, not "run": these say the vocabulary is
  // unfamiliar, which is usually a typo but can also mean the firmware knows a
  // field this build's FIELDS list has not caught up with. Worth saying loudly,
  // not worth refusing to submit over -- that would strand a legitimate file
  // with no way out but sftp.
  parseWarnings.forEach((msg) => out.push({ scope: "vocab", msg }));

  // filterProblems walks a filter's tree, so it needs .root -- handing it the
  // filter itself found no .t, fell through to .children, and checked nothing.
  (doc.filters ?? []).forEach((f) =>
    filterProblems(f.root, []).forEach((p) => out.push({ ...p, scope: `F${f.id}` })));
  (doc.inputs ?? []).forEach((i) => inputProblems(i, out));
  (doc.outputs ?? []).forEach((o) => outputProblems(o, out));
  (doc.actions ?? []).forEach((a) => actionProblems(a, out));
  // chainProblems walks a chain's tree and pushes into its second argument;
  // passing the chain and then doc meant it walked an object with no .t, found
  // nothing, and would have pushed into doc had it found anything.
  (doc.chains ?? []).forEach((c, i) =>
    chainProblems(c.tree, []).forEach((p) => out.push({ ...p, scope: `chain ${c.id ?? i + 1}` })));
  return out;
}

/* ============================================================
   Extra running-config files (run1.xml … run15.xml)

   Besides run.xml a device can carry up to fifteen more xml files, usually
   filter blacklists dropped in over sftp. They are listed by
   /grism/task/get_running_filelist, read with /grism/task/get_running_file,
   written with /grism/task/submitxml and removed with /grism/task/del_running.
   ============================================================ */

/* The device accepts any run*.xml, but the UI offers only this range so the
   names stay predictable and a typo cannot invent a file nobody expects. */
export const EXTRA_RUN_FILE_MAX = 15;

export const extraRunFileNames = () =>
  Array.from({ length: EXTRA_RUN_FILE_MAX }, (_, i) => `run${i + 1}.xml`);

/* run.xml itself is edited on the Export pane and is deliberately not one of
   these; js files belong to the older console and are ignored here. */
export const isExtraRunFile = (name) => {
  const m = /^run(\d{1,2})\.xml$/.exec(String(name ?? "").trim());
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 1 && n <= EXTRA_RUN_FILE_MAX;
};

/* Names still free, in run1…run15 order, for the "add a file" picker. */
export const freeExtraRunFileNames = (existing) => {
  const taken = new Set((existing ?? []).map((n) => String(n).trim()));
  return extraRunFileNames().filter((n) => !taken.has(n));
};

/* Anything past this is offered as a download instead of being opened: these
   run to tens of megabytes and would wedge a textarea. */
export const EXTRA_RUN_FILE_EDIT_LIMIT = 1024 * 1024;

/* What the listing endpoint returns, reduced to the files this pane manages,
   as {name, size}. Newer devices send a files array carrying the sizes; older
   ones only send file_list, and a missing size shows as unknown rather than
   pretending the file is empty. */
export const extraRunFileIndex = (name) => {
  const m = /^run(\d{1,2})\.xml$/.exec(String(name ?? "").trim());
  return m ? Number(m[1]) : 0;
};

export const extraRunFilesFrom = (payload) => {
  const withSizes = Array.isArray(payload?.files) ? payload.files : null;
  const files = withSizes
    ? withSizes
        .filter((f) => isExtraRunFile(f?.name))
        .map((f) => ({ name: String(f.name).trim(), size: Number.isFinite(Number(f.size)) ? Number(f.size) : null }))
    : (Array.isArray(payload?.file_list) ? payload.file_list : [])
        .filter(isExtraRunFile).map((name) => ({ name, size: null }));
  // The device lists names alphabetically, which puts run10 between run1 and
  // run2. Order by the number so the pane reads run1…run15.
  return files.sort((a, b) => extraRunFileIndex(a.name) - extraRunFileIndex(b.name));
};

/* Too big to open, or size unknown so we must not guess. */
export const isExtraRunFileEditable = (size) =>
  typeof size === "number" && Number.isFinite(size) &&
  size >= 0 && size <= EXTRA_RUN_FILE_EDIT_LIMIT;

export const formatFileSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/* One line for a problem from grismXmlProblems. Vocabulary complaints carry no
   filter or field to name, so they read as the message alone. */
export const problemLine = (p) =>
  p.scope === "vocab" || p.scope === "run" || p.scope === "xml"
    ? String(p.msg)
    : `${[p.scope, p.label].filter(Boolean).join(" ")} — ${p.msg}`;

/* Why this text is not an XML document rooted at the expected element, or ""
   when it is. Well-formed is not the same as being the right document: pasting
   a run.xml into the device-settings box, or anything else entirely, parses
   perfectly well and would otherwise be sent to the device as-is. */
export const rootElementError = (xmlText, expected) => {
  const bad = xmlError(xmlText);
  if (bad) return bad;
  let root = "";
  try { root = parseXml(String(xmlText).trim()).documentElement?.nodeName ?? ""; }
  catch { return "the XML could not be parsed"; }
  return root === expected ? "" : `expected a <${expected}> document, found <${root}>`;
};

/* Why this text is not a usable GRISM config at all, or "" when it is.

   Distinct from the per-field checks: a bad address in a filter is worth
   showing but not worth refusing, since these files are fragments. A document
   with no <run> in it is not a config the device can take, so submitting it
   should be refused outright. */
export const grismStructureError = (xmlText) => {
  const bad = xmlError(xmlText);
  if (bad) return bad;
  const structural = grismXmlProblems(xmlText)
    .find((p) => p.scope === "run" || p.scope === "xml");
  return structural ? structural.msg : "";
};

export const extraRunFileHref = (name) =>
  `/grism/task/get_running_file?filename=${encodeURIComponent(name)}`;

/* Why a new file cannot be created, or "" when it can. */
export const newExtraRunFileProblem = (name, existing) => {
  const n = String(name ?? "").trim();
  if (!n) return "set.xfNamePick";
  if (!isExtraRunFile(n)) return "set.xfNameRange";
  if ((existing ?? []).some((e) => String(e).trim() === n)) return "set.xfNameTaken";
  return "";
};

/* ============================================================
   Validation against the device's own run.xsd

   The device serves its schema at /data/run.xsd (build.sh puts doc/run.xsd
   there), so the check is against the same firmware the config is going to --
   no second copy of the vocabulary to keep in step.

   Not a complete XSD implementation. It reads the parts that catch what goes
   wrong in practice: which elements may appear where, which attributes each
   element declares, and which values an enumerated type allows. Anything the
   schema does not pin down is left alone rather than guessed at.
   ============================================================ */

const XSD_NS = "http://www.w3.org/2001/XMLSchema";

/* Read run.xsd into {elements, complexTypes, simpleTypes} that validateAgainstXsd
   can walk. Returns null if the text is not a schema we can read, so callers can
   fall back rather than reject everything. */
export function parseXsd(xsdText) {
  let dom;
  try { dom = parseXml(String(xsdText ?? "")); } catch { return null; }
  if (!dom?.documentElement || dom.querySelector("parsererror")) return null;

  const local = (el) => String(el.tagName || "").replace(/^.*:/, "");
  const kids = (el, name) => [...el.children].filter((c) => local(c) === name);
  const deep = (el, name) => {
    const out = [];
    const walk = (n) => [...n.children].forEach((c) => { if (local(c) === name) out.push(c); walk(c); });
    walk(el);
    return out;
  };

  const root = dom.documentElement;
  if (local(root) !== "schema") return null;

  const simpleTypes = {};   // name -> {enums: Set|null}
  const complexTypes = {};  // name -> {children, attrs, anyChildren}
  const elements = {};      // name -> {typeName, inline, substitutes}
  const groups = {};        // name -> element (resolved lazily)

  const readSimple = (el) => {
    const enums = deep(el, "enumeration").map((e) => e.getAttribute("value"));
    return { enums: enums.length ? new Set(enums) : null };
  };

  /* Which element names may appear inside, which attributes are declared, and
     how to descend into each child. Walks the content model -- sequence, choice,
     group -- but stops at an element declaration rather than recursing into its
     own type, or a filter would appear to allow everything nested anywhere
     beneath it and nothing would ever be reported.

     minOccurs/maxOccurs and ordering are not enforced: a config that lists its
     criteria in an unexpected order still works on the device, and refusing it
     would be worse than letting it through. */
  const readComplex = (el) => {
    const children = new Set();
    const childDefs = {};
    const attrs = {};
    let anyChildren = false;
    const walkModel = (node) => {
      [...node.children].forEach((c) => {
        const t = local(c);
        if (t === "element") {
          const name = c.getAttribute("name") || c.getAttribute("ref");
          if (!name) return;
          children.add(name);
          if (c.getAttribute("name")) {
            const nested = kids(c, "complexType")[0];
            childDefs[name] = { typeName: c.getAttribute("type") || "", inline: nested ? readComplex(nested) : null };
          }
          return;   // do not descend: the child's own type is its business
        }
        if (t === "any") { anyChildren = true; return; }
        if (t === "group") {
          const ref = c.getAttribute("ref");
          if (ref) children.add("@group:" + ref); else walkModel(c);
          return;
        }
        if (t === "attribute") {
          const n = c.getAttribute("name");
          if (n) attrs[n] = { type: c.getAttribute("type") || "", required: c.getAttribute("use") === "required" };
          return;
        }
        // sequence, choice, all, simpleContent, extension, complexContent
        walkModel(c);
      });
    };
    walkModel(el);
    const ext = deep(el, "extension")[0];
    return {
      children, childDefs, attrs, anyChildren,
      textType: ext ? ext.getAttribute("base") || "" : "",
      hasSimpleContent: !!kids(el, "simpleContent").length,
    };
  };

  kids(root, "simpleType").forEach((el) => {
    const n = el.getAttribute("name"); if (n) simpleTypes[n] = readSimple(el);
  });
  kids(root, "complexType").forEach((el) => {
    const n = el.getAttribute("name"); if (n) complexTypes[n] = readComplex(el);
  });
  kids(root, "group").forEach((el) => {
    const n = el.getAttribute("name"); if (n) groups[n] = readComplex(el);
  });
  kids(root, "element").forEach((el) => {
    const n = el.getAttribute("name"); if (!n) return;
    const inlineComplex = kids(el, "complexType")[0];
    elements[n] = {
      typeName: el.getAttribute("type") || "",
      inline: inlineComplex ? readComplex(inlineComplex) : null,
      substitutes: el.getAttribute("substitutionGroup") || "",
    };
  });

  // <f substitutionGroup="find"/> is <find> under another name
  Object.entries(elements).forEach(([name, e]) => {
    if (e.substitutes && elements[e.substitutes] && !e.typeName && !e.inline) {
      elements[name] = { ...elements[e.substitutes], substitutes: e.substitutes };
    }
  });

  // fold group refs into the child sets that reference them
  const fold = (t, seen = new Set()) => {
    const out = new Set();
    t.children.forEach((n) => {
      if (!n.startsWith("@group:")) { out.add(n); return; }
      const g = n.slice(7);
      if (seen.has(g) || !groups[g]) return;
      seen.add(g);
      const inner = fold(groups[g], seen);
      inner.forEach((x) => out.add(x));
      Object.assign(t.childDefs, groups[g].childDefs);
    });
    t.children = out;
    return out;
  };
  // Collect every type once -- inline child types nest arbitrarily deep, and a
  // type can be reached by more than one path, so walk with a seen set.
  const allTypes = [];
  const collect = (t, seen) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    allTypes.push(t);
    Object.values(t.childDefs || {}).forEach((d) => collect(d.inline, seen));
  };
  const seen = new Set();
  Object.values(complexTypes).forEach((t) => collect(t, seen));
  Object.values(groups).forEach((t) => collect(t, seen));
  Object.values(elements).forEach((e) => collect(e.inline, seen));
  allTypes.forEach((t) => fold(t));

  if (!elements.run) return null;
  return { elements, complexTypes, simpleTypes };
}

/* Check a run.xml against a schema from parseXsd. Returns a list of
   {scope, msg} -- empty when the document satisfies what the schema pins down.

   Only reports what the schema is explicit about. An element whose type the
   schema does not name is walked no further rather than guessed at, so a gap in
   the schema never turns into a false complaint about a working config. */
export function validateAgainstXsd(xmlText, schema) {
  if (!schema) return [];
  const bad = xmlError(xmlText);
  if (bad) return [{ scope: "xml", msg: bad }];

  let dom;
  try { dom = parseXml(String(xmlText).trim()); } catch { return [{ scope: "xml", msg: "the XML could not be parsed" }]; }
  const root = dom.documentElement;
  if (!root) return [{ scope: "xml", msg: "the XML has no root element" }];
  const rootName = String(root.tagName).replace(/^.*:/, "");
  if (rootName !== "run") return [{ scope: "run", msg: `expected a <run> document, found <${rootName}>` }];

  const out = [];
  const MAX = 50;                       // a truncated list still tells the author what to fix
  const typeOf = (def) => {
    if (!def) return null;
    if (def.inline) return def.inline;
    if (def.typeName && schema.complexTypes[def.typeName]) return schema.complexTypes[def.typeName];
    return null;
  };
  const enumsFor = (typeName) => schema.simpleTypes[typeName]?.enums ?? null;

  const where = (path) => path.join(" > ");

  const visit = (el, def, path) => {
    if (out.length >= MAX) return;
    const type = typeOf(def);
    const name = String(el.tagName).replace(/^.*:/, "");

    if (type) {
      // attributes the schema does not declare
      for (const attr of [...el.attributes]) {
        const an = String(attr.name).replace(/^.*:/, "");
        if (an.startsWith("xmlns")) continue;
        const spec = type.attrs[an];
        if (!spec) {
          out.push({ scope: "xsd", msg: `<${name}> has no attribute "${an}"`, at: where(path) });
          continue;
        }
        const allowed = enumsFor(spec.type);
        if (allowed && attr.value !== "" && !allowed.has(attr.value)) {
          out.push({ scope: "xsd", msg: `<${name} ${an}="${attr.value}"> is not a value the schema allows`, at: where(path) });
        }
      }
      for (const [an, spec] of Object.entries(type.attrs)) {
        if (spec.required && !el.hasAttribute(an)) {
          out.push({ scope: "xsd", msg: `<${name}> is missing the required attribute "${an}"`, at: where(path) });
        }
      }
      // text content against an enumerated simpleContent base
      if (type.hasSimpleContent) {
        const allowed = enumsFor(type.textType);
        const text = (el.textContent || "").trim();
        if (allowed && text && !allowed.has(text)) {
          out.push({ scope: "xsd", msg: `<${name}> does not allow the content "${text.slice(0, 40)}"`, at: where(path) });
        }
      }
    }

    for (const child of [...el.children]) {
      if (out.length >= MAX) return;
      const cn = String(child.tagName).replace(/^.*:/, "");
      if (!type) { continue; }                 // schema says nothing about this branch
      if (type.anyChildren) continue;
      // <f> is declared with substitutionGroup="find", so it stands wherever
      // find does; without this the shorthand form reads as an illegal element
      const head = schema.elements[cn]?.substitutes || "";
      if (!type.children.has(cn) && !(head && type.children.has(head))) {
        out.push({ scope: "xsd", msg: `<${cn}> is not allowed inside <${name}>`, at: where(path) });
        continue;
      }
      // a nested declaration wins; otherwise it is a reference to a global element
      const cdef = type.childDefs[cn] ?? schema.elements[cn] ?? (head ? schema.elements[head] : null) ?? null;
      visit(child, cdef, [...path, cn]);
    }
  };

  visit(root, schema.elements.run, ["run"]);
  return out;
}

/* One line for a validateAgainstXsd finding, naming where it sits. */
export const xsdProblemLine = (p) => (p.at ? `${p.at}: ${p.msg}` : p.msg);

/* ============================================================
   Pickers for filter conditions
   ============================================================ */

/* Every two-letter region the platform can name, derived rather than written
   out: Intl already carries the ISO 3166-1 list, and a copy here would be one
   more thing to keep current. EXTRA_REGIONS covers the non-ISO codes the
   device's database also emits. */
let _countryOptions = new Map();
export function countryOptions(lang = "en") {
  if (_countryOptions.has(lang)) return _countryOptions.get(lang);
  const out = [];
  try {
    const names = new Intl.DisplayNames([lang], { type: "region", fallback: "none" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        let name;
        try { name = names.of(code); } catch { name = undefined; }
        if (name) out.push({ code, name });
      }
    }
  } catch { /* no Intl data: the field stays a plain text box */ }
  Object.entries(EXTRA_REGIONS).forEach(([code, name]) => {
    if (!out.some((o) => o.code === code)) out.push({ code, name });
  });
  // by code, not by name: the codes are what the config stores and what the
  // user is looking for, and sorting by name reorders the whole list the
  // moment the interface language changes.
  out.sort((x, y) => x.code.localeCompare(y.code));
  _countryOptions.set(lang, out);
  return out;
}

/* Management interface names from the device config, e.g. M0.

   grism.port.linkdown accepts these as well as the data ports: the firmware's
   port-name lookup falls back to 1000 + N for anything starting with M, so a
   management interface going down is something a filter can match on. */
export const mgmtPortNames = (cfg) =>
  (cfg?.ifcfgs ?? [])
    .filter((i) => String(i?.role ?? "").toLowerCase() === "management" && i?.name)
    .map((i) => String(i.name));

/* Which fields the firmware resolves through that same port-name lookup, and
   which of them a management interface makes sense for. */
export const PORT_PICKER_FIELDS = new Set(["grism.srcport", "grism.port.linkdown", "flowtable.inport"]);
export const MGMT_PORT_FIELDS = new Set(["grism.port.linkdown"]);

export const portOptionsForField = (field, dataPorts, mgmtPorts) => [
  ...(dataPorts ?? []),
  ...(MGMT_PORT_FIELDS.has(field) ? (mgmtPorts ?? []) : []),
];


/* ============================================================
   Saved configurations (etc/save-config)

   A snapshot of run.xml kept on the device, listed by
   /grism/task/get_save_xml_list, read with get_save_xml, written with
   save_xml and removed with del_xml.
   ============================================================ */

/* The name the device has always used:
     <type>.0_<slot>.0_<epoch ms>.0_<base64 description>.0_<size>.xml
   The separator cannot occur inside base64, whose alphabet has no "." or "_". */
const SAVE_XML_SEP = ".0_";
export const SAVE_XML_TYPE = "map";

/* Descriptions are stored beside the files now, because this encoding cannot
   carry most of them: btoa throws on anything outside latin-1, so a Chinese
   description was never expressible. The name still gets one when it happens
   to fit, so the older console keeps showing something; anything else leaves
   the slot empty and the sidecar carries it. */
const latin1Base64 = (text) => {
  const s = String(text ?? "");
  if (!s || /[^\x20-\xff]/.test(s)) return "";
  try { return btoa(s); } catch { return ""; }
};

export function buildSaveXmlName({ description = "", slot = 1, timestamp = 0, size = 0 } = {}) {
  return [SAVE_XML_TYPE, String(slot), String(timestamp), latin1Base64(description), String(size)]
    .join(SAVE_XML_SEP) + ".xml";
}

export function parseSaveXmlName(name) {
  const out = { type: "", slot: null, saved: null, description: "", size: null };
  const raw = String(name ?? "");
  const stem = /\.xml$/i.test(raw) ? raw.slice(0, -4) : raw;
  const parts = stem.split(SAVE_XML_SEP);
  if (parts.length < 2) return out;
  out.type = parts[0];
  const num = (s) => { const n = parseInt(s, 10); return Number.isNaN(n) ? null : n; };
  if (parts.length >= 5) out.size = num(parts[4]);
  if (parts.length >= 3) { out.slot = num(parts[1]); out.saved = num(parts[2]); }
  const encoded = parts.length >= 4 ? parts[3] : (parts.length === 2 ? parts[1] : "");
  if (encoded) { try { out.description = atob(encoded); } catch { out.description = ""; } }
  return out;
}

/* Normalise whatever the device sent. Newer firmware answers a files array
   with the description, size and modification time already resolved; older
   firmware only lists names, and then everything has to come from the name. */
export function savedConfigsFrom(payload) {
  const rows = Array.isArray(payload?.files) ? payload.files : null;
  const num = (v, fallback = null) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const list = rows
    ? rows.map((f) => ({
        name: String(f?.name ?? ""),
        description: String(f?.description ?? ""),
        size: num(f?.size),
        mtime: num(f?.mtime),
        slot: num(f?.slot, parseSaveXmlName(f?.name).slot),
        saved: num(f?.saved, parseSaveXmlName(f?.name).saved),
      }))
    : (Array.isArray(payload?.save_xml_list) ? payload.save_xml_list : []).map((name) => {
        const m = parseSaveXmlName(name);
        return { name: String(name), description: m.description, size: m.size, mtime: null, slot: m.slot, saved: m.saved };
      });
  return list.filter((f) => f.name)
    .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0) || a.name.localeCompare(b.name));
}

/* Lowest slot not already taken, so names stay tidy as saves come and go
   rather than climbing forever. */
export const nextSaveSlot = (files) => {
  const taken = new Set((files ?? []).map((f) => f.slot).filter((n) => Number.isFinite(n)));
  let n = 1;
  while (taken.has(n)) n += 1;
  return n;
};

/* Epoch seconds as something readable, in the viewer's own timezone. */
export const formatSavedTime = (epochSeconds, lang = "en") => {
  const n = Number(epochSeconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Date(n * 1000).toLocaleString(lang, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch { return ""; }
};
