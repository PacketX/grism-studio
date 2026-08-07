import React, { useState, useMemo, useCallback, useEffect } from "react";
import "./GrismStudio.css";

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
let _id = 0;
const nid = () => `n${++_id}`;
const esc = (s) => String(s).replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const splitList = (s) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

/* ===================== field catalogue =====================
   Complete GRISM <find> name list, transcribed from the official
   find.md. `kind` drives which relations are offered and how the
   value is validated. exists = boolean presence check (no value). */
const FIELDS = [
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
  { g: "Meta / flow / system", items: [
    { v: "regex", label: "Regular expression", kind: "regex" },
    { v: "country.iso_code", label: "Country ISO code", kind: "country" },
    { v: "packet.len", label: "Packet length", kind: "num" },
    { v: "grism.srcport", label: "Ingress port", kind: "grismport" },
    { v: "grism.port.linkdown", label: "Port link down", kind: "grismport" },
    { v: "session.packet.nth", label: "Nth packet in flow", kind: "num" },
    { v: "heartbeat.target.miss.nth", label: "Heartbeat miss (nth)", kind: "num" },
    { v: "heartbeat.target.miss.id", label: "Heartbeat miss (target id)", kind: "num" },
    { v: "flowtable.matched.fid", label: "Flow matched filter id", kind: "fidref" },
    { v: "flowtable.inport", label: "Flow ingress port", kind: "grismport" },
    { v: "dstmac.in.l2gre.mapping.table", label: "dstMAC in l2gre table", kind: "exists" },
    { v: "dstmac.in.vxlan.mapping.table", label: "dstMAC in vxlan table", kind: "exists" },
  ]},
];
const FIELD_INDEX = Object.fromEntries(FIELDS.flatMap((g) => g.items.map((i) => [i.v, i])));

const RELS = {
  exists: [], num: ["==","!=",">=","<="], uint8: ["==","!=",">=","<="],
  uint16: ["==","!=",">=","<="], uint24: ["==","!=",">=","<="], port: ["==","!=",">=","<="],
  vlan: ["==","!=",">=","<="], bit: ["==","!="],
  default: ["==","!="],
};
const relationsFor = (k) => RELS[k] ?? RELS.default;

const VAL = {
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
  country: (s) => /^[A-Za-z]{2}$/.test(s) ? null : "ISO code, e.g. TW",
  grismport: (s) => /^[A-Z]\d+$/.test(s) ? null : "Port, e.g. P0",
  fidref: (s) => /^F\d+$/.test(s) ? null : "Filter id, e.g. F1",
  tuple: (s) => s.trim().split(/\s+/).length === 5 ? null : "5 fields: sip dip proto sp dp (- = any)",
  str: (s) => s && s.length ? null : "Required",
  regex: (s) => s && s.length ? null : "Pattern required",
  exists: () => null,
};
const validate = (k, v) => (VAL[k] ?? VAL.str)(v ?? "");
const ph = (k) => ({ ip:"8.8.8.8", ipv6:"2001:db8::1", mac:"12:34:56:78:9a:bc", port:"443",
  vlan:"100", uint8:"6", uint16:"2048", uint24:"1", bit:"1", country:"TW", num:"500",
  grismport:"P0", fidref:"F1", tuple:"- 192.168.1.203 - - 443", regex:"\\x08facebook\\x03com" }[k] ?? "value");

/* ===================== filter (boolean tree) model ===================== */
const mkFind = () => ({ id: nid(), t: "find", field: "ip.addr", rel: "==", val: "" });
const mkGroup = (op) => ({ id: nid(), t: op, children: [mkFind()] });
const mkNot = () => ({ id: nid(), t: "not", children: [mkFind()] });

function tUpdate(node, id, fn) {
  if (node.id === id) return fn(node);
  if (!node.children) return node;
  let ch = false;
  const kids = node.children.map((c) => { const u = tUpdate(c, id, fn); if (u !== c) ch = true; return u; });
  return ch ? { ...node, children: kids } : node;
}
function tRemove(node, id) {
  if (!node.children) return node;
  return { ...node, children: node.children.filter((c) => c.id !== id).map((c) => tRemove(c, id)) };
}
function serializeCriterion(node, depth) {
  const pad = "  ".repeat(depth);
  if (node.t === "find") {
    const kind = FIELD_INDEX[node.field]?.kind ?? "str";
    const rel = kind === "exists" ? "" : node.rel;
    const content = kind === "exists" ? "" : ` content="${esc(node.val)}"`;
    return `${pad}<find name="${node.field}" relation="${rel}"${content} />`;
  }
  const inner = (node.children ?? []).map((c) => serializeCriterion(c, depth + 1)).join("\n");
  return `${pad}<${node.t}>\n${inner}\n${pad}</${node.t}>`;
}
function serializeFilter(f) {
  const attrs = [`id="${f.id}"`, f.name ? `name="${esc(f.name)}"` : null,
    f.alt ? `alt="${esc(f.alt)}"` : null,
    `sessionBase="${f.sessionBase}"`,
    f.blockifempty === "yes" ? `blockifempty="yes"` : null].filter(Boolean).join(" ");
  return `<filter ${attrs}>\n${serializeCriterion(f.root, 1)}\n</filter>`;
}
// An empty <or>/<and> is legal: by default it matches unconditionally
// (everything). blockifempty="yes" flips that to match nothing. So an
// empty group is NOT an error — only invalid find values are.
function hasAnyFind(node) {
  if (!node) return false;
  if (node.t === "find") return true;
  return (node.children ?? []).some(hasAnyFind);
}
const isEmptyFilter = (f) => !hasAnyFind(f.root);
function filterProblems(node, out) {
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
const UNSET = "__unset__";
const mkOut = (ports = "P1") => ({ id: nid(), t: "out", ports, mode: "duplicate", lb: "5thash" });
const mkDrop = () => ({ id: nid(), t: "out", ports: "0", mode: "duplicate", lb: "5thash" });
const mkUnset = () => ({ id: nid(), t: UNSET });
const mkBranch = (fids = "F1") => ({ id: nid(), t: "branch", fids, fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") });
const isUnset = (n) => n && n.t === UNSET;
const isDrop = (n) => n && n.t === "out" && n.ports === "0";

function cUpdate(node, id, fn) {
  if (!node) return node;
  if (node.id === id) return fn(node);
  let out = node;
  for (const k of ["child", "match", "notmatch"]) if (node[k]) {
    const u = cUpdate(node[k], id, fn); if (u !== node[k]) out = { ...out, [k]: u };
  }
  return out;
}
const setSide = (node, bid, side, val) => cUpdate(node, bid, (b) => ({ ...b, [side]: val }));

// A document holds an array of chains. Each chain is one ingress pipeline,
// identified by its <in> port. Templates may still return a single `chain`;
// normalizeDoc upgrades that to a `chains` array so the rest of the app only
// ever deals with the plural form.
const mkChain = (ports = "P0") => ({ cid: nid(), ports, tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } });
function normalizeDoc(d) {
  if (d.chains) return { ...d, chains: d.chains.map((c) => c.cid ? c : { ...c, cid: nid() }) };
  const { chain, ...rest } = d;
  return { ...rest, chains: [{ cid: nid(), ports: chain?.ports ?? "P0", tree: chain?.tree }] };
}

function vlanAttrs(o) {
  if (!o || !o.vlantype) return "";
  const idAttr = o.vlanid != null && o.vlanid !== "" ? ` vlanid="${esc(o.vlanid)}"` : "";
  return ` vlantype="${o.vlantype}"${idAttr}`;
}
function serializeChain(chain) {
  const inPorts = chain.ports || "P0";
  const emitOut = (n, pad) => {
    const attr = n.mode === "loadBalance" ? ` type="loadBalance" lbtype="${n.lb}"` : "";
    return `${pad}<out${attr}${vlanAttrs(n)}>${n.ports}</out>`;
  };
  function body(node, depth) {
    const pad = "  ".repeat(depth);
    if (!node || isUnset(node)) return null;
    if (node.t === "out") return emitOut(node, pad);
    const lines = [`${pad}<fid type="${node.fidOp}">${node.fids}</fid>`];
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
function chainProblems(tree, out) {
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch" && isUnset(n.match) && isUnset(n.notmatch))
      out.push({ id: n.id, fids: n.fids, msg: `${n.fids} routes neither side` });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return out;
}
function collectRefs(tree, definedIds) {
  const seen = new Map();
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch" && n.fids) n.fids.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const id = tok.replace(/^!/, "");
      if (!seen.has(id)) seen.set(id, { id, defined: definedIds.has(id) });
    });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/* ===================== templates ===================== */
const finds = (field, rel, items) => items.map((c) => ({ id: nid(), t: "find", field, rel, val: c }));
const TEMPLATES = [
  { id: "minimal", title: "Minimal forward", tag: "Basic",
    blurb: "The smallest useful chain: packets from P0 that match F1 go to P1.",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "loadbalance", title: "Load balance", tag: "Basic",
    blurb: "Matched traffic from P0 is spread across P1 and P2 by 5-tuple hash, keeping each session on one port.",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or",
        match: { id: nid(), t: "out", ports: "P1,P2", mode: "loadBalance", lb: "5thash" }, notmatch: mkUnset() } },
    }) },
  { id: "ip-blacklist", title: "Block IP blacklist", tag: "L3",
    blurb: "Divert packets whose IP is on a blacklist.",
    make: () => ({
      filters: [{ id: 1, name: "ip blacklist", sessionBase: "no",
        root: { id: nid(), t: "or", children: finds("ip.addr", "==", ["92.53.120.155","67.229.164.135"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "block-country", title: "Block by country", tag: "GeoIP",
    blurb: "Divert traffic from specific countries. Needs dbip.",
    make: () => ({
      filters: [{ id: 1, name: "blocked countries", sessionBase: "no",
        root: { id: nid(), t: "or", children: finds("country.iso_code", "==", ["CN","RU"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "block-sni", title: "Block TLS by SNI", tag: "TLS",
    blurb: "Match HTTPS by TLS server name and divert.",
    make: () => ({
      filters: [{ id: 1, name: "blocked SNI", sessionBase: "yes",
        root: { id: nid(), t: "or", children: finds("ssl.server_name", "==", ["facebook.com"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "rewrite-output", title: "Rewrite via output", tag: "Output",
    blurb: "Matched traffic goes to an output (O1) that rewrites source IP and adds a VLAN tag, then leaves on P1.",
    make: () => ({
      filters: [{ id: 1, name: "target", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip.dst", rel: "==", val: "10.0.0.0/24" }] } }],
      outputs: [{ id: 1, name: "rewrite", port: "P1", mods: [
        { id: nid(), k: "modify_srcip", val: "172.16.10.10" },
        { id: nid(), k: "Q", val: "100" } ] }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("O1"), notmatch: mkOut("P2") } },
    }) },
  { id: "pcap-replay", title: "Replay pcap to a port", tag: "Input",
    blurb: "An input replays a pcap file onto P0 once, then the chain forwards matched traffic out P1.",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip", rel: "==", val: "" }] } }],
      inputs: [{ id: 1, name: "replay", alt: "test pcap", type: "replayPcap", port: "P0",
        fields: { filepath: "H1/in/sample.pcap", time: "1", msinterval: "1" }, scanAttrs: {} }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "ingress-strip", title: "Strip VLAN at ingress", tag: "Action",
    blurb: "An action strips the VLAN tag from packets arriving on P0 before the chain filters them.",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      actions: [{ id: 1, name: "strip vlan", type: "input-packet-process", port: "P0",
        mods: [{ id: nid(), k: "stripping", val: "vlan" }], portA: "P1", portB: "P2" }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "inline-bidir", title: "Inline (bidirectional)", tag: "Multi-chain",
    blurb: "Two chains form an inline pair: P6→P7 forwards matched traffic, and P7→P6 carries the return path.",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chains: [
        { cid: nid(), ports: "P6", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P7"), notmatch: mkOut("P7") } },
        { cid: nid(), ports: "P7", tree: { id: nid(), t: "out", ports: "P6", mode: "duplicate", lb: "5thash" } },
      ],
    }) },
  { id: "vxlan-encap", title: "VXLAN encapsulation", tag: "Output",
    blurb: "Matched traffic is wrapped in VXLAN (to a remote VTEP with a VNI) via output O1, then sent out P7.",
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
    blurb: "Recursive filter: geo AND (443 or 53) AND NOT whitelist.",
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
const STRIP_TYPES = ["payload","payload2","vlan","mpls","gre","vxlan","gre-erspan","gtp","grism","mpls-in-udp","mpls-in-gre","udpencap"];
const TAG_TYPES = ["timestamp","gtp","gtp2","l2gre","vxlan","grism"];
const NVGRE_TYPES = ["eth","ip"];
const OUT_MODS = [
  { k: "modify_srcip", label: "Modify source IP", kind: "ip", ph: "10.1.1.1", grp: "rewrite" },
  { k: "modify_dstip", label: "Modify dest IP", kind: "ip", ph: "10.1.1.2", grp: "rewrite" },
  { k: "modify_srcport", label: "Modify source port", kind: "port", ph: "8080", grp: "rewrite" },
  { k: "modify_dstport", label: "Modify dest port", kind: "port", ph: "80", grp: "rewrite" },
  { k: "modify_srcmac", label: "Modify source MAC", kind: "mac", ph: "d8:fe:e3:a4:d3:78", grp: "rewrite" },
  { k: "modify_dstmac", label: "Modify dest MAC", kind: "mac", ph: "d8:fe:e3:a4:d3:78", grp: "rewrite" },
  { k: "Q", label: "VLAN tag (Q)", kind: "vlanop", ph: "10", grp: "rewrite", defOp: "add" },
  { k: "QinQ", label: "VLAN tag (QinQ)", kind: "vlanop", ph: "20", grp: "rewrite", defOp: "add" },
  { k: "gateway", label: "Gateway (ARP for MAC)", kind: "ip", ph: "192.168.1.1", grp: "rewrite" },
  { k: "stripping", label: "Strip header", kind: "enum", opts: STRIP_TYPES, grp: "rewrite" },
  { k: "tagging", label: "Add tag", kind: "enum", opts: TAG_TYPES, grp: "rewrite" },
  { k: "maxlen", label: "Max packet length", kind: "num", ph: "64", grp: "rewrite" },
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
const OUT_MOD_INDEX = Object.fromEntries(OUT_MODS.map((m) => [m.k, m]));
const VLAN_OPS = ["add","replace","remove"];
const mkOutputMod = (k) => {
  const meta = OUT_MOD_INDEX[k];
  return { id: nid(), k, val: meta?.opts?.[0] ?? "", op: meta?.kind === "vlanop" ? meta.defOp : undefined };
};
const mkOutput = (id) => ({ id, name: "", port: "P1", mods: [] });

function serializeOutput(o) {
  const attrs = [`id="${o.id}"`, o.name ? `name="${esc(o.name)}"` : null,
    o.alt ? `alt="${esc(o.alt)}"` : null].filter(Boolean).join(" ");
  const lines = [`<output ${attrs}>`, `  <port>${esc(o.port)}</port>`];
  (o.mods ?? []).forEach((m) => {
    const meta = OUT_MOD_INDEX[m.k];
    if (meta?.kind === "flag") lines.push(`  <${m.k}/>`);
    else if (meta?.kind === "vlanop") {
      const op = m.op || meta.defOp;
      if (op === "remove") lines.push(`  <${m.k} type="remove"></${m.k}>`);
      else lines.push(`  <${m.k} type="${op}">${esc(m.val)}</${m.k}>`);
    }
    else lines.push(`  <${m.k}>${esc(m.val)}</${m.k}>`);
  });
  lines.push(`</output>`);
  return lines.join("\n");
}
function outputProblems(o, out) {
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
const ACT_STRIP_TYPES = ["payload","payload2","vlan","mpls","gre","vxlan","gre-erspan","gtp","grism","mpls-in-udp","mpls-in-gre","udpencap"];
const ACT_TAG_TYPES = ["grism","timestamp"];
const ACT_MODS = [
  { k: "stripping", label: "Strip header", kind: "enum", opts: ACT_STRIP_TYPES },
  { k: "Q", label: "VLAN tag (Q)", kind: "vlan", ph: "10" },
  { k: "QinQ", label: "VLAN tag (QinQ)", kind: "vlan", ph: "20" },
  { k: "tagging", label: "Add tag", kind: "enum", opts: ACT_TAG_TYPES },
  { k: "maxlen", label: "Max packet length", kind: "num", ph: "64" },
  { k: "ip", label: "Interface IP", kind: "ip", ph: "192.168.1.1" },
  { k: "gateway", label: "Gateway", kind: "ip", ph: "192.168.1.1" },
  { k: "netmask", label: "Netmask", kind: "ip", ph: "255.255.255.0" },
  { k: "arp_reply_default_mac", label: "ARP reply (default MAC)", kind: "flag" },
  { k: "icmp_reply", label: "ICMP reply", kind: "flag" },
  { k: "icmp_reply_fragment_need", label: "ICMP frag-needed", kind: "mtu", ph: "" },
];
const ACT_MOD_INDEX = Object.fromEntries(ACT_MODS.map((m) => [m.k, m]));
const mkActionMod = (k) => ({ id: nid(), k, val: ACT_MOD_INDEX[k]?.opts?.[0] ?? "", mtu: k === "icmp_reply_fragment_need" ? "1440" : undefined });

const mkAction = (id) => ({ id, name: "", type: "input-packet-process", port: "P0", mods: [], portA: "P1", portB: "P2" });

function serializeAction(a) {
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
function actionProblems(a, out) {
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
const INPUT_PCAP_FIELDS = [
  { k: "filepath", label: "File path", kind: "str", ph: "H1/in/sample.pcap" },
  { k: "scandir", label: "Scan directory", kind: "str", ph: "H1/in", attrs: ["interval", "minbytes", "timeout"] },
  { k: "time", label: "Play count", kind: "num", ph: "1" },
  { k: "speed", label: "Speed", kind: "num", ph: "10000" },
  { k: "msinterval", label: "Interval (ms)", kind: "num", ph: "1" },
  { k: "sessionCompleteness", label: "Session completeness", kind: "t1f0", ph: "1" },
  { k: "sorting", label: "Sorting", kind: "t1f0", ph: "0" },
  { k: "reverseSessionResult", label: "Reverse session", kind: "t1f0", ph: "0" },
  { k: "playedFilesHandle", label: "After replay", kind: "enum", opts: ["", "delete", "move"] },
  { k: "playedFilesMoveTo", label: "Move played to", kind: "str", ph: "H1/in/played" },
];
const INPUT_GEN_FIELDS = [
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
const INPUT_FIELD_INDEX = Object.fromEntries([...INPUT_PCAP_FIELDS, ...INPUT_GEN_FIELDS].map((f) => [f.k, f]));
const inputFieldsFor = (type) => type === "traffic-gen" ? INPUT_GEN_FIELDS : INPUT_PCAP_FIELDS;
const mkInput = (id) => ({ id, name: "", alt: "", type: "replayPcap", port: "P0",
  fields: { time: "1" }, scanAttrs: {} });

function serializeInput(inp) {
  const attrs = [`id="${inp.id}"`, `type="${inp.type}"`,
    inp.name ? `name="${esc(inp.name)}"` : null,
    inp.alt ? `alt="${esc(inp.alt)}"` : null].filter(Boolean).join(" ");
  const lines = [`<input ${attrs}>`, `  <port>${esc(inp.port)}</port>`];
  inputFieldsFor(inp.type).forEach((f) => {
    const v = inp.fields?.[f.k];
    if (v == null || v === "") return;
    if (f.k === "scandir") {
      const a = inp.scanAttrs || {};
      const at = ["interval", "minbytes", "timeout"].filter((k) => a[k] != null && a[k] !== "")
        .map((k) => ` ${k}="${esc(a[k])}"`).join("");
      lines.push(`  <scandir${at}>${esc(v)}</scandir>`);
    } else {
      lines.push(`  <${f.k}>${esc(v)}</${f.k}>`);
    }
  });
  lines.push(`</input>`);
  return lines.join("\n");
}
function inputProblems(inp, out) {
  if (!/^[A-Z][0-9]+$/.test(inp.port || "")) out.push({ id: inp.id, msg: `port must look like P0`, label: "port" });
  if (inp.type === "replayPcap" && !(inp.fields?.filepath || inp.fields?.scandir))
    out.push({ id: inp.id + ":src", msg: "needs a file path or scan directory", label: "source" });
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
function serializeRun(doc) {
  const parts = [];
  doc.filters.forEach((f) => parts.push(serializeFilter(f).split("\n").map((l) => "  " + l).join("\n")));
  (doc.inputs ?? []).forEach((inp) => parts.push(serializeInput(inp).split("\n").map((l) => "  " + l).join("\n")));
  (doc.outputs ?? []).forEach((o) => parts.push(serializeOutput(o).split("\n").map((l) => "  " + l).join("\n")));
  (doc.actions ?? []).forEach((a) => parts.push(serializeAction(a).split("\n").map((l) => "  " + l).join("\n")));
  (doc.chains ?? []).forEach((c) => parts.push(serializeChain(c).split("\n").map((l) => "  " + l).join("\n")));
  return `<run>\n${parts.join("\n")}\n</run>`;
}

/* ===================== XML → model parser =====================
   The inverse of serializeRun: takes a <run> string and rebuilds the
   editable document. Mirrors each serializer exactly. Throws on malformed
   XML or an unexpected shape so the caller can surface a clear message
   rather than loading a half-parsed, misleading model. */
function parseRun(xmlText) {
  const dom = new DOMParser().parseFromString(xmlText, "application/xml");
  const perr = dom.querySelector("parsererror");
  if (perr) throw new Error("XML is not well-formed");
  const run = dom.querySelector("run");
  if (!run) throw new Error("no <run> element found");
  const elemChildren = (el) => [...el.children];
  const warnings = [];

  // --- filter criterion (recursive) ---
  function parseCriterion(el) {
    const tag = el.tagName;
    if (tag === "find") {
      const field = el.getAttribute("name") || "ip.addr";
      const rel = el.getAttribute("relation") || "==";
      const val = el.getAttribute("content") ?? "";
      if (!FIELD_INDEX[field]) warnings.push(`unknown find field "${field}"`);
      const kind = FIELD_INDEX[field]?.kind ?? "str";
      return { id: nid(), t: "find", field, rel: kind === "exists" ? "==" : rel, val };
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
    const blockifempty = el.getAttribute("blockifempty") === "yes" ? "yes" : "no";
    const first = elemChildren(el)[0];
    const root = first ? parseCriterion(first) : { id: nid(), t: "or", children: [] };
    return { id, name, alt, sessionBase, blockifempty, root };
  }

  // --- output ---
  function parseOutput(el) {
    const id = +(el.getAttribute("id") || 0);
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
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
        mods.push({ id: nid(), k, val: c.textContent.trim() });
      }
    });
    return { id, name, alt, port, mods };
  }

  // --- input ---
  function parseInput(el) {
    const id = +(el.getAttribute("id") || 0);
    const type = el.getAttribute("type") || "replayPcap";
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    const inp = { id, name, alt, type, port: "P0", fields: {}, scanAttrs: {} };
    elemChildren(el).forEach((c) => {
      const k = c.tagName;
      if (k === "port") { inp.port = c.textContent.trim(); return; }
      if (!INPUT_FIELD_INDEX[k]) { warnings.push(`unknown input element <${k}>`); return; }
      inp.fields[k] = c.textContent.trim();
      if (k === "scandir") {
        ["interval", "minbytes", "timeout"].forEach((a) => {
          const av = c.getAttribute(a); if (av != null) inp.scanAttrs[a] = av;
        });
      }
    });
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
  elemChildren(run).forEach((el) => {
    switch (el.tagName) {
      case "filter": filters.push(parseFilter(el)); break;
      case "input": inputs.push(parseInput(el)); break;
      case "output": outputs.push(parseOutput(el)); break;
      case "action": actions.push(parseAction(el)); break;
      case "chain": chains.push(parseChain(el)); break;
      default: warnings.push(`unexpected top-level <${el.tagName}>`);
    }
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
function formatXml(xml, indentUnit = "  ") {
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

/* ============================================================
   Component tree
   ============================================================ */
export default function GrismStudio() {
  const [doc, setDoc] = useState(() => normalizeDoc(TEMPLATES.find((t) => t.id === "geo-recursive").make())); // seed with recursive example
  const [tab, setTab] = useState("filters");
  const [theme, setTheme] = useState("light"); // "light" | "dark" — default light, not persisted
  const [activeFilter, setActiveFilter] = useState(1);
  const [activeOutput, setActiveOutput] = useState(1);
  const [activeAction, setActiveAction] = useState(1);
  const [activeInput, setActiveInput] = useState(1);
  const [activeChain, setActiveChain] = useState(null); // cid of selected chain

  const definedIds = useMemo(() => new Set(doc.filters.map((f) => "F" + f.id)), [doc.filters]);
  const outputIds = useMemo(() => new Set((doc.outputs ?? []).map((o) => "O" + o.id)), [doc.outputs]);
  const setFilterRoot = useCallback((fid, updater) => {
    setDoc((d) => ({ ...d, filters: d.filters.map((f) => f.id === fid ? { ...f, root: updater(f.root) } : f) }));
  }, []);
  // update the tree of one chain (by cid)
  const setChainTreeFor = useCallback((cid, updater) => {
    setDoc((d) => ({ ...d, chains: d.chains.map((c) => c.cid === cid ? { ...c, tree: updater(c.tree) } : c) }));
  }, []);

  const runXml = useMemo(() => serializeRun(doc), [doc]);

  // in-port conflict: two chains sharing the same first ingress port
  const inPortConflicts = useMemo(() => {
    const seen = new Map();
    (doc.chains ?? []).forEach((c) => {
      const first = (c.ports || "").split(",")[0].trim();
      if (!first) return;
      seen.set(first, (seen.get(first) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p));
  }, [doc.chains]);

  // aggregate problems across the doc
  const allProblems = useMemo(() => {
    const fp = doc.filters.flatMap((f) => filterProblems(f.root, []).map((p) => ({ ...p, scope: `F${f.id}` })));
    const op = (doc.outputs ?? []).flatMap((o) => outputProblems(o, []).map((p) => ({ ...p, scope: `O${o.id}` })));
    const ap = (doc.actions ?? []).flatMap((a) => actionProblems(a, []).map((p) => ({ ...p, scope: `A${a.id}` })));
    const ip = (doc.inputs ?? []).flatMap((inp) => inputProblems(inp, []).map((p) => ({ ...p, scope: `I${inp.id}` })));
    const cp = (doc.chains ?? []).flatMap((c, i) => chainProblems(c.tree, []).map((p) => ({ ...p, scope: `chain:${c.cid}` })));
    const conflictP = [...inPortConflicts].map((p) => ({ id: "conflict-" + p, scope: "chain", msg: `two chains both ingress on ${p}`, label: "in port" }));
    return [...fp, ...ip, ...op, ...ap, ...cp, ...conflictP];
  }, [doc, inPortConflicts]);

  // --- load the device's running config ---
  const [load, setLoad] = useState({ state: "idle", msg: "" }); // idle | loading | ok | error
  const loadRunning = useCallback(async () => {
    setLoad({ state: "loading", msg: "" });
    try {
      const res = await fetch("/grism/task/get_running_file?filename=run.xml", { credentials: "include" });
      if (!res.ok) throw new Error(`device responded ${res.status}`);
      const text = await res.text();
      const { doc: parsed, warnings } = parseRun(text);
      setDoc(normalizeDoc(parsed));
      setActiveFilter(parsed.filters[0]?.id ?? 1);
      setActiveOutput(parsed.outputs[0]?.id ?? 1);
      setActiveAction(parsed.actions[0]?.id ?? 1);
      setActiveChain(parsed.chains[0]?.cid ?? null);
      setLoad({ state: "ok", msg: warnings.length ? `loaded with ${warnings.length} warning${warnings.length>1?"s":""}` : "loaded running config", warnings });
      setTab("filters");
    } catch (e) {
      setLoad({ state: "error", msg: e.message || "load failed" });
    }
  }, []);

  // auto-load once on mount (falls back silently to the seed template on failure)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_running_file?filename=run.xml", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const text = await res.text();
        const { doc: parsed } = parseRun(text);
        if (cancelled) return;
        setDoc(normalizeDoc(parsed));
        setActiveFilter(parsed.filters[0]?.id ?? 1);
        setActiveChain(parsed.chains[0]?.cid ?? null);
        setLoad({ state: "ok", msg: "loaded running config" });
      } catch { /* keep the seed template; manual button remains available */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={"gs-root" + (theme === "light" ? " light" : "")}>

      <header className="topbar">
        <div className="brand">
          <span className="logo">◇</span>
          <span className="brand-name">GRISM</span>
          <span className="brand-sub">studio</span>
        </div>
        <nav className="tabs">
          {[["templates","Templates"],["filters","Filters"],["inputs","Inputs"],["outputs","Outputs"],["actions","Actions"],["chain","Chains"],["export","Export"]].map(([k, label]) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
              {label}
              {k === "filters" && <span className="tab-badge">{doc.filters.length}</span>}
              {k === "inputs" && (doc.inputs?.length ?? 0) > 0 && <span className="tab-badge">{doc.inputs.length}</span>}
              {k === "outputs" && (doc.outputs?.length ?? 0) > 0 && <span className="tab-badge">{doc.outputs.length}</span>}
              {k === "actions" && (doc.actions?.length ?? 0) > 0 && <span className="tab-badge">{doc.actions.length}</span>}
              {k === "chain" && (doc.chains?.length ?? 0) > 0 && <span className="tab-badge">{doc.chains.length}</span>}
            </button>
          ))}
        </nav>
        <button className={"load-btn " + load.state} onClick={loadRunning} disabled={load.state === "loading"}
          title="Fetch and load the config currently running on the device">
          {load.state === "loading" ? "loading…" : load.state === "error" ? "load failed — retry" : "load running config"}
        </button>
        <button className="theme-btn" onClick={() => setTheme((t) => t === "light" ? "dark" : "light")}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        <div className={"health " + (allProblems.length ? "bad" : "ok")}>
          <span className="dot" />{allProblems.length ? `${allProblems.length} issue${allProblems.length>1?"s":""}` : "valid"}
        </div>
      </header>
      {load.state === "error" && <div className="load-banner err">Couldn't load running config: {load.msg}. Check you're signed in to the device.</div>}
      {load.state === "ok" && load.msg.includes("warning") && <div className="load-banner warn">{load.msg} — some elements weren't recognised and may need review.</div>}

      <div className="body">
        {tab === "templates" && (
          <TemplatesTab onApply={(t) => { setDoc(normalizeDoc(t.make())); setActiveFilter(1); setTab("filters"); }} />
        )}
        {tab === "filters" && (
          <FiltersTab
            doc={doc} setDoc={setDoc}
            activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            setFilterRoot={setFilterRoot}
          />
        )}
        {tab === "inputs" && (
          <InputsTab doc={doc} setDoc={setDoc} activeInput={activeInput} setActiveInput={setActiveInput} />
        )}
        {tab === "outputs" && (
          <OutputsTab doc={doc} setDoc={setDoc} activeOutput={activeOutput} setActiveOutput={setActiveOutput} />
        )}
        {tab === "actions" && (
          <ActionsTab doc={doc} setDoc={setDoc} activeAction={activeAction} setActiveAction={setActiveAction} />
        )}
        {tab === "chain" && (
          <ChainTab doc={doc} definedIds={definedIds} outputIds={outputIds}
            setChainTreeFor={setChainTreeFor} setDoc={setDoc}
            activeChain={activeChain} setActiveChain={setActiveChain}
            inPortConflicts={inPortConflicts} />
        )}
        {tab === "export" && (
          <ExportTab runXml={runXml} problems={allProblems}
            onApplyXml={(xmlText) => {
              const { doc: parsed, warnings } = parseRun(xmlText); // throws on malformed → caught in ExportTab
              setDoc(normalizeDoc(parsed));
              setActiveFilter(parsed.filters[0]?.id ?? 1);
              setActiveInput(parsed.inputs[0]?.id ?? 1);
              setActiveOutput(parsed.outputs[0]?.id ?? 1);
              setActiveAction(parsed.actions[0]?.id ?? 1);
              setActiveChain(parsed.chains[0]?.cid ?? null);
              return warnings;
            }}
            onGoto={(scope) => {
            if (scope === "chain" || scope.startsWith("chain:")) {
              if (scope.startsWith("chain:")) setActiveChain(scope.slice(6));
              setTab("chain");
            }
            else if (scope[0] === "I") { setActiveInput(+scope.slice(1)); setTab("inputs"); }
            else if (scope[0] === "O") { setActiveOutput(+scope.slice(1)); setTab("outputs"); }
            else if (scope[0] === "A") { setActiveAction(+scope.slice(1)); setTab("actions"); }
            else { setActiveFilter(+scope.slice(1)); setTab("filters"); }
          }} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Templates tab
   ============================================================ */
function TemplatesTab({ onApply }) {
  return (
    <div className="tmpl-wrap">
      <p className="tmpl-lead">
        Start from a working pattern. Applying a template loads its filters and
        chain into the document — then refine them in the other tabs.
      </p>
      <div className="tmpl-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="tmpl-card" onClick={() => onApply(t)}>
            <span className="tmpl-tag">{t.tag}</span>
            <span className="tmpl-title">{t.title}</span>
            <span className="tmpl-blurb">{t.blurb}</span>
            <span className="tmpl-cta">Apply →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Filters tab — recursive boolean tree editor
   ============================================================ */
function FiltersTab({ doc, setDoc, activeFilter, setActiveFilter, setFilterRoot }) {
  const f = doc.filters.find((x) => x.id === activeFilter) || doc.filters[0];
  const problems = useMemo(() => f ? filterProblems(f.root, []) : [], [f]);

  const addFilter = () => {
    const nextId = Math.max(0, ...doc.filters.map((x) => x.id)) + 1;
    setDoc((d) => ({ ...d, filters: [...d.filters, { id: nextId, name: "", sessionBase: "no", root: mkGroup("or") }] }));
    setActiveFilter(nextId);
  };
  const delFilter = (id) => {
    setDoc((d) => ({ ...d, filters: d.filters.filter((x) => x.id !== id) }));
    setActiveFilter(doc.filters.find((x) => x.id !== id)?.id ?? null);
  };
  const patchMeta = (patch) => setDoc((d) => ({ ...d, filters: d.filters.map((x) => x.id === f.id ? { ...x, ...patch } : x) }));

  const mutate = (id, fn) => setFilterRoot(f.id, (root) => tUpdate(root, id, fn));
  const onChangeOp = (id, op) => mutate(id, (n) => {
    // switching a group to/from NOT changes its shape, not just its tag:
    // <not> wraps exactly one group, whereas <and>/<or> hold a flat child list.
    if (op === "not" && n.t !== "not") {
      // wrap current group's children under a single group inside the not
      const inner = { id: nid(), t: n.t === "and" ? "and" : "or", children: n.children ?? [mkFind()] };
      return { id: n.id, t: "not", children: [inner] };
    }
    if (n.t === "not" && op !== "not") {
      // unwrap: promote the inner group's children back up
      const inner = n.children?.[0];
      return { id: n.id, t: op, children: inner?.children ?? [mkFind()] };
    }
    return { ...n, t: op };
  });
  const onChangeFind = (id, patch) => mutate(id, (n) => ({ ...n, ...patch }));
  const onAddCond = (id) => mutate(id, (n) => ({ ...n, children: [...(n.children ?? []), mkFind()] }));
  const onAddGroup = (id) => mutate(id, (n) => ({ ...n, children: [...(n.children ?? []), mkGroup("or")] }));
  const onAddNot = (id) => mutate(id, (n) => ({ ...n, children: [...(n.children ?? []), mkNot()] }));
  const onRemove = (id) => setFilterRoot(f.id, (root) => tRemove(root, id));

  if (!f) return <div className="empty-pane"><button className="primary" onClick={addFilter}>+ New filter</button></div>;

  return (
    <div className="filters-layout">
      <aside className="filter-list">
        {doc.filters.map((x) => (
          <button key={x.id} className={"filter-item" + (x.id === f.id ? " on" : "")} onClick={() => setActiveFilter(x.id)}>
            <b>F{x.id}</b>
            <span>{x.name || <em>unnamed</em>}</span>
          </button>
        ))}
        <button className="filter-add" onClick={addFilter}>+ Add filter</button>
      </aside>

      <div className="filter-editor">
        <div className="filter-meta">
          <label className="ml"><span>id</span><input className="m-id" value={"F" + f.id} readOnly /></label>
          <label className="ml grow"><span>name</span>
            <input value={f.name} onChange={(e) => patchMeta({ name: e.target.value })} /></label>
          <label className="ml grow"><span>alt (shown on chain)</span>
            <input value={f.alt || ""} onChange={(e) => patchMeta({ alt: e.target.value })} placeholder="e.g. is https" /></label>
          <label className="ml"><span>sessionBase</span>
            <select value={f.sessionBase} onChange={(e) => patchMeta({ sessionBase: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <label className="ml"><span>blockifempty</span>
            <select value={f.blockifempty || "no"} onChange={(e) => patchMeta({ blockifempty: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <button className="del" onClick={() => delFilter(f.id)}>Delete</button>
        </div>

        <div className="tree-scroll">
          <CritNode node={f.root} depth={0} canRemove={false} isRoot={true}
            onChangeOp={onChangeOp} onChangeFind={onChangeFind}
            onAddCond={onAddCond} onAddGroup={onAddGroup} onAddNot={onAddNot} onRemove={onRemove} />
        </div>

        {isEmptyFilter(f) && (
          <div className="empty-note">
            <div className="empty-note-body">
              <b>This filter has no conditions.</b>{" "}
              {f.blockifempty === "yes"
                ? <>With <code>blockifempty="yes"</code>, it matches <b>nothing</b> — no packet passes.</>
                : <>By default an empty filter matches <b>everything</b> — every packet is treated as a match.</>}
            </div>
            <button className="empty-toggle"
              onClick={() => patchMeta({ blockifempty: f.blockifempty === "yes" ? "no" : "yes" })}>
              {f.blockifempty === "yes" ? "Switch to match-all" : "Switch to match-none"}
            </button>
          </div>
        )}

        <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />
          {problems.length ? `${problems.length} issue${problems.length>1?"s":""} in F${f.id}` : `F${f.id} valid`}
        </div>
      </div>
    </div>
  );
}

const RAILS = ["#5eead4", "#7dd3fc", "#c4b5fd", "#fda4af", "#fcd34d"];
function CritNode(props) {
  const { node, depth, isRoot } = props;
  if (node.t === "find") return <FindRow node={node} onChange={props.onChangeFind} onRemove={props.onRemove} canRemove={props.canRemove} />;
  const isNot = node.t === "not";
  const rail = RAILS[depth % RAILS.length];
  return (
    <div className="cnode" style={{ borderColor: rail }}>
      <div className="cnode-head">
        {isRoot ? (
          <div className="op-toggle">
            <button className={node.t === "and" ? "on" : ""} onClick={() => props.onChangeOp(node.id, "and")}>AND</button>
            <button className={node.t === "or" ? "on" : ""} onClick={() => props.onChangeOp(node.id, "or")}>OR</button>
            <button className={"not-btn" + (isNot ? " on" : "")} onClick={() => props.onChangeOp(node.id, "not")}>NOT</button>
          </div>
        ) : isNot ? <span className="op-badge not">NOT</span> : (
          <div className="op-toggle">
            <button className={node.t === "and" ? "on" : ""} onClick={() => props.onChangeOp(node.id, "and")}>AND</button>
            <button className={node.t === "or" ? "on" : ""} onClick={() => props.onChangeOp(node.id, "or")}>OR</button>
          </div>
        )}
        <span className="op-desc">{isNot ? "must NOT match the item below" : node.t === "and" ? "all must match" : "any must match"}</span>
        <div className="spacer" />
        {props.canRemove && <button className="icon-btn" onClick={() => props.onRemove(node.id)}>✕</button>}
      </div>
      <div className="cnode-body">
        {(node.children ?? []).map((c) => <CritNode key={c.id} {...props} node={c} depth={depth + 1} canRemove={true} isRoot={false} />)}
      </div>
      <div className="cnode-actions">
        {!isNot && <>
          <button className="add-btn" onClick={() => props.onAddCond(node.id)}>+ Condition</button>
          <button className="add-btn" onClick={() => props.onAddGroup(node.id)}>+ Group</button>
          <button className="add-btn subtle" onClick={() => props.onAddNot(node.id)}>+ NOT</button>
        </>}
        {isNot && (!node.children || !node.children.length) && <>
          <button className="add-btn" onClick={() => props.onAddCond(node.id)}>+ Condition</button>
          <button className="add-btn" onClick={() => props.onAddGroup(node.id)}>+ Group</button>
        </>}
      </div>
    </div>
  );
}
function FindRow({ node, onChange, onRemove, canRemove }) {
  const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
  const rels = relationsFor(kind); const isEx = kind === "exists";
  const err = isEx ? null : validate(kind, node.val);
  return (
    <div className="find-row">
      <select className="fld" value={node.field} onChange={(e) => {
        const nf = FIELD_INDEX[e.target.value]; const nr = relationsFor(nf.kind);
        onChange(node.id, { field: e.target.value, rel: nr.includes(node.rel) ? node.rel : (nr[0] ?? ""), val: nf.kind === "exists" ? "" : node.val });
      }}>
        {FIELDS.map((g) => <optgroup key={g.g} label={g.g}>{g.items.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}</optgroup>)}
      </select>
      {!isEx && <select className="rel" value={node.rel} onChange={(e) => onChange(node.id, { rel: e.target.value })}>
        {rels.map((r) => <option key={r} value={r}>{r}</option>)}</select>}
      {isEx ? <span className="exists-note">exists — no value</span>
        : <input className={"val" + (err ? " invalid" : "")} value={node.val} placeholder={ph(kind)}
            onChange={(e) => onChange(node.id, { val: e.target.value })} />}
      <div className="spacer" />
      <span className="fld-code">{node.field}</span>
      {canRemove && <button className="icon-btn" onClick={() => onRemove(node.id)}>✕</button>}
      {err && !isEx && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Outputs tab — <output> rewrite/tagging editor
   ============================================================ */
/* ============================================================
   Inputs tab — <input> pcap replay / traffic generator
   ============================================================ */
function InputsTab({ doc, setDoc, activeInput, setActiveInput }) {
  const inputs = doc.inputs ?? [];
  const inp = inputs.find((x) => x.id === activeInput) || inputs[0];
  const problems = useMemo(() => inp ? inputProblems(inp, []) : [], [inp]);

  const addInput = () => {
    const nextId = Math.max(0, ...inputs.map((x) => x.id)) + 1;
    setDoc((d) => ({ ...d, inputs: [...(d.inputs ?? []), mkInput(nextId)] }));
    setActiveInput(nextId);
  };
  const delInput = (id) => {
    setDoc((d) => ({ ...d, inputs: (d.inputs ?? []).filter((x) => x.id !== id) }));
    setActiveInput(inputs.find((x) => x.id !== id)?.id ?? null);
  };
  const patch = (p) => setDoc((d) => ({ ...d, inputs: d.inputs.map((x) => x.id === inp.id ? { ...x, ...p } : x) }));
  const setField = (k, v) => patch({ fields: { ...(inp.fields ?? {}), [k]: v } });
  const setScanAttr = (k, v) => patch({ scanAttrs: { ...(inp.scanAttrs ?? {}), [k]: v } });

  if (!inp) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>No inputs yet. An <code>&lt;input&gt;</code> replays pcap files or generates traffic onto a port.</p>
        <button className="primary" onClick={addInput}>+ New input</button>
      </div>
    </div>
  );

  const fields = inputFieldsFor(inp.type);
  const renderField = (f) => {
    const v = inp.fields?.[f.k] ?? "";
    const err = (f.kind === "enum" || f.kind === "str") ? null
      : v ? validate(f.kind === "t1f0" ? "bit" : f.kind === "int" ? "num" : f.kind, v) : null;
    return (
      <div className="mod-row" key={f.k}>
        <span className="mod-key">{f.label}</span>
        {f.kind === "enum"
          ? <select className="mod-val" value={v} onChange={(e) => setField(f.k, e.target.value)}>
              {f.opts.map((o) => <option key={o} value={o}>{o === "" ? "—" : o}</option>)}
            </select>
          : f.kind === "t1f0"
            ? <select className="mod-val" value={v || "0"} onChange={(e) => setField(f.k, e.target.value)}>
                <option value="0">0 (off)</option><option value="1">1 (on)</option>
              </select>
            : <input className={"mod-val" + (err ? " invalid" : "")} value={v} placeholder={f.ph || ""}
                onChange={(e) => setField(f.k, e.target.value)} />}
        <code className="mod-tag">&lt;{f.k}&gt;</code>
        {f.k === "scandir" && v && <span className="scan-attrs">
          {["interval", "minbytes", "timeout"].map((a) => (
            <input key={a} className="scan-attr" placeholder={a} value={inp.scanAttrs?.[a] ?? ""}
              onChange={(e) => setScanAttr(a, e.target.value)} />
          ))}
        </span>}
        {err && <div className="row-err">{err}</div>}
      </div>
    );
  };

  return (
    <div className="filters-layout">
      <aside className="filter-list">
        {inputs.map((x) => (
          <button key={x.id} className={"filter-item" + (x.id === inp.id ? " on" : "")} onClick={() => setActiveInput(x.id)}>
            <b>I{x.id}</b><span>{x.name || <em>{x.type === "traffic-gen" ? "traffic-gen" : x.port}</em>}</span>
          </button>
        ))}
        <button className="filter-add" onClick={addInput}>+ Add input</button>
      </aside>

      <div className="filter-editor">
        <div className="filter-meta">
          <label className="ml"><span>id</span><input className="m-id" value={"I" + inp.id} readOnly /></label>
          <label className="ml grow"><span>name</span>
            <input value={inp.name} onChange={(e) => patch({ name: e.target.value })} placeholder="optional" /></label>
          <label className="ml grow"><span>alt</span>
            <input value={inp.alt || ""} onChange={(e) => patch({ alt: e.target.value })} placeholder="optional" /></label>
          <label className="ml"><span>type</span>
            <select value={inp.type} onChange={(e) => patch({ type: e.target.value })}>
              <option value="replayPcap">replayPcap</option>
              <option value="traffic-gen">traffic-gen</option>
            </select></label>
          <button className="del" onClick={() => delInput(inp.id)}>Delete</button>
        </div>

        <div className="tree-scroll">
          <div className="mod-row">
            <span className="mod-key">Output port *</span>
            <input className={"mod-val" + (/^[A-Z][0-9]+$/.test(inp.port) ? "" : " invalid")} value={inp.port}
              onChange={(e) => patch({ port: e.target.value })} placeholder="P0" />
            <code className="mod-tag">&lt;port&gt;</code>
          </div>
          <p className="out-empty">
            {inp.type === "traffic-gen"
              ? "Synthesise packets onto the port. Fill only the fields you need — empty ones aren't emitted."
              : "Replay pcap files. A file path or a scan directory is required; other fields are optional."}
          </p>
          {fields.map(renderField)}
        </div>

        <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />
          {problems.length ? `${problems.length} issue${problems.length>1?"s":""} in I${inp.id}` : `I${inp.id} valid`}
        </div>
      </div>
    </div>
  );
}

function OutputsTab({ doc, setDoc, activeOutput, setActiveOutput }) {
  const outputs = doc.outputs ?? [];
  const o = outputs.find((x) => x.id === activeOutput) || outputs[0];
  const problems = useMemo(() => o ? outputProblems(o, []) : [], [o]);

  const addOutput = () => {
    const nextId = Math.max(0, ...outputs.map((x) => x.id)) + 1;
    setDoc((d) => ({ ...d, outputs: [...(d.outputs ?? []), mkOutput(nextId)] }));
    setActiveOutput(nextId);
  };
  const delOutput = (id) => {
    setDoc((d) => ({ ...d, outputs: (d.outputs ?? []).filter((x) => x.id !== id) }));
    setActiveOutput(outputs.find((x) => x.id !== id)?.id ?? null);
  };
  const patch = (patchObj) => setDoc((d) => ({ ...d, outputs: d.outputs.map((x) => x.id === o.id ? { ...x, ...patchObj } : x) }));
  const addMod = (k) => patch({ mods: [...(o.mods ?? []), mkOutputMod(k)] });
  const setMod = (mid, val) => patch({ mods: o.mods.map((m) => m.id === mid ? { ...m, val } : m) });
  const setModOp = (mid, op) => patch({ mods: o.mods.map((m) => m.id === mid ? { ...m, op } : m) });
  const delMod = (mid) => patch({ mods: o.mods.filter((m) => m.id !== mid) });

  if (!o) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>No outputs yet. An <code>&lt;output&gt;</code> lets a chain rewrite or tag packets — reference it from a chain <code>&lt;out&gt;</code> as <code>O1</code>.</p>
        <button className="primary" onClick={addOutput}>+ New output</button>
      </div>
    </div>
  );

  const usedKeys = new Set((o.mods ?? []).map((m) => m.k));

  return (
    <div className="filters-layout">
      <aside className="filter-list">
        {outputs.map((x) => (
          <button key={x.id} className={"filter-item" + (x.id === o.id ? " on" : "")} onClick={() => setActiveOutput(x.id)}>
            <b>O{x.id}</b><span>{x.name || <em>{x.port}</em>}</span>
          </button>
        ))}
        <button className="filter-add" onClick={addOutput}>+ Add output</button>
      </aside>

      <div className="filter-editor">
        <div className="filter-meta">
          <label className="ml"><span>id</span><input className="m-id" value={"O" + o.id} readOnly /></label>
          <label className="ml grow"><span>name</span>
            <input value={o.name} onChange={(e) => patch({ name: e.target.value })} placeholder="optional" /></label>
          <label className="ml grow"><span>alt (shown on chain)</span>
            <input value={o.alt || ""} onChange={(e) => patch({ alt: e.target.value })} placeholder="e.g. mirror to tap" /></label>
          <label className="ml"><span>port *</span>
            <input className={"m-port" + (/^[A-Z][0-9]+$/.test(o.port) ? "" : " invalid")} value={o.port}
              onChange={(e) => patch({ port: e.target.value })} placeholder="P1" /></label>
          <button className="del" onClick={() => delOutput(o.id)}>Delete</button>
        </div>

        <div className="tree-scroll">
          {(o.mods ?? []).length === 0 && (
            <p className="out-empty">This output just forwards to <code>{o.port}</code> unchanged. Add a modifier below to rewrite or tag packets.</p>
          )}
          {(o.mods ?? []).map((m) => <OutputModRow key={m.id} mod={m} onChange={setMod} onOp={setModOp} onRemove={delMod} />)}

          <div className="mod-palette">
            {[["rewrite","add modifier"],["vxlan","VXLAN encapsulation"],["nvgre","NVGRE encapsulation"]].map(([grp, label]) => (
              <div key={grp} className="mod-palette-group">
                <span className="mod-palette-label">{label}</span>
                <div className="mod-palette-grid">
                  {OUT_MODS.filter((meta) => meta.grp === grp).map((meta) => (
                    <button key={meta.k} className="mod-add"
                      onClick={() => addMod(meta.k)}
                      disabled={usedKeys.has(meta.k) && (meta.k === "stripping" || meta.k === "tagging" ? false : true)}
                      title={meta.k}>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />
          {problems.length ? `${problems.length} issue${problems.length>1?"s":""} in O${o.id}` : `O${o.id} valid`}
        </div>
      </div>
    </div>
  );
}

function OutputModRow({ mod, onChange, onOp, onRemove }) {
  const meta = OUT_MOD_INDEX[mod.k]; if (!meta) return null;
  const isVlanOp = meta.kind === "vlanop";
  const op = mod.op || meta.defOp;
  const err = (meta.kind === "enum" || meta.kind === "flag") ? null
    : isVlanOp ? (op === "remove" ? null : validate("vlan", mod.val))
    : validate(meta.kind, mod.val);
  return (
    <div className="mod-row">
      <span className="mod-key">{meta.label}</span>
      {meta.kind === "enum"
        ? <select className="mod-val" value={mod.val} onChange={(e) => onChange(mod.id, e.target.value)}>
            {meta.opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        : isVlanOp
          ? <>
              <select className="mod-op" value={op} onChange={(e) => onOp(mod.id, e.target.value)}>
                {VLAN_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {op !== "remove"
                ? <input className={"mod-val" + (err ? " invalid" : "")} value={mod.val} placeholder={meta.ph || ""}
                    onChange={(e) => onChange(mod.id, e.target.value)} />
                : <span className="exists-note">removes tag — no id</span>}
            </>
          : <input className={"mod-val" + (err ? " invalid" : "")} value={mod.val} placeholder={meta.ph || ""}
              onChange={(e) => onChange(mod.id, e.target.value)} />}
      <code className="mod-tag">&lt;{mod.k}{isVlanOp ? ` type=${op}` : ""}&gt;</code>
      <div className="spacer" />
      <button className="icon-btn" onClick={() => onRemove(mod.id)}>✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Actions tab — <action> input-packet-process / linkpairs
   ============================================================ */
function ActionsTab({ doc, setDoc, activeAction, setActiveAction }) {
  const actions = doc.actions ?? [];
  const a = actions.find((x) => x.id === activeAction) || actions[0];
  const problems = useMemo(() => a ? actionProblems(a, []) : [], [a]);

  const addAction = () => {
    const nextId = Math.max(0, ...actions.map((x) => x.id)) + 1;
    setDoc((d) => ({ ...d, actions: [...(d.actions ?? []), mkAction(nextId)] }));
    setActiveAction(nextId);
  };
  const delAction = (id) => {
    setDoc((d) => ({ ...d, actions: (d.actions ?? []).filter((x) => x.id !== id) }));
    setActiveAction(actions.find((x) => x.id !== id)?.id ?? null);
  };
  const patch = (patchObj) => setDoc((d) => ({ ...d, actions: d.actions.map((x) => x.id === a.id ? { ...x, ...patchObj } : x) }));
  const addMod = (k) => patch({ mods: [...(a.mods ?? []), mkActionMod(k)] });
  const setMod = (mid, val) => patch({ mods: a.mods.map((m) => m.id === mid ? { ...m, val } : m) });
  const delMod = (mid) => patch({ mods: a.mods.filter((m) => m.id !== mid) });

  if (!a) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>No actions yet. An <code>&lt;action&gt;</code> processes packets at ingress, or links two ports so one going down takes the other with it.</p>
        <button className="primary" onClick={addAction}>+ New action</button>
      </div>
    </div>
  );

  const isLink = a.type === "linkpairs";
  const usedKeys = new Set((a.mods ?? []).map((m) => m.k));

  return (
    <div className="filters-layout">
      <aside className="filter-list">
        {actions.map((x) => (
          <button key={x.id} className={"filter-item" + (x.id === a.id ? " on" : "")} onClick={() => setActiveAction(x.id)}>
            <b>A{x.id}</b><span>{x.name || <em>{x.type === "linkpairs" ? "linkpairs" : x.port}</em>}</span>
          </button>
        ))}
        <button className="filter-add" onClick={addAction}>+ Add action</button>
      </aside>

      <div className="filter-editor">
        <div className="filter-meta">
          <label className="ml"><span>id</span><input className="m-id" value={"A" + a.id} readOnly /></label>
          <label className="ml grow"><span>name</span>
            <input value={a.name} onChange={(e) => patch({ name: e.target.value })} placeholder="optional" /></label>
          <label className="ml"><span>type</span>
            <select value={a.type} onChange={(e) => patch({ type: e.target.value })}>
              <option value="input-packet-process">input-packet-process</option>
              <option value="linkpairs">linkpairs</option>
            </select></label>
          <button className="del" onClick={() => delAction(a.id)}>Delete</button>
        </div>

        <div className="tree-scroll">
          {isLink ? (
            <div className="link-form">
              <p className="out-empty">If one link goes down, the other is forced down too. Enter the two ports to bind.</p>
              <div className="mod-row">
                <span className="mod-key">Port A</span>
                <input className={"mod-val" + (/^[A-Z][0-9]+$/.test(a.portA) ? "" : " invalid")} value={a.portA}
                  onChange={(e) => patch({ portA: e.target.value })} placeholder="P1" />
                <code className="mod-tag">&lt;portA&gt;</code>
              </div>
              <div className="mod-row">
                <span className="mod-key">Port B</span>
                <input className={"mod-val" + (/^[A-Z][0-9]+$/.test(a.portB) ? "" : " invalid")} value={a.portB}
                  onChange={(e) => patch({ portB: e.target.value })} placeholder="P2" />
                <code className="mod-tag">&lt;portB&gt;</code>
              </div>
            </div>
          ) : (
            <>
              <div className="mod-row">
                <span className="mod-key">Input port *</span>
                <input className={"mod-val" + (/^[A-Z][0-9]+$/.test(a.port) ? "" : " invalid")} value={a.port}
                  onChange={(e) => patch({ port: e.target.value })} placeholder="P0" />
                <code className="mod-tag">&lt;port&gt;</code>
              </div>
              {(a.mods ?? []).length === 0 && (
                <p className="out-empty">Add a modifier below to strip, tag, re-VLAN, or answer ARP/ICMP for packets arriving on <code>{a.port}</code>.</p>
              )}
              {(a.mods ?? []).map((m) => <ActionModRow key={m.id} mod={m} onChange={setMod} onRemove={delMod} onMtu={(mid, mtu) => patch({ mods: a.mods.map((x) => x.id === mid ? { ...x, mtu } : x) })} />)}

              <div className="mod-palette">
                <span className="mod-palette-label">add modifier</span>
                <div className="mod-palette-grid">
                  {ACT_MODS.map((meta) => (
                    <button key={meta.k} className="mod-add" onClick={() => addMod(meta.k)}
                      disabled={usedKeys.has(meta.k) && !(meta.k === "stripping" || meta.k === "tagging" || meta.k === "Q" || meta.k === "QinQ")}
                      title={meta.k}>{meta.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />
          {problems.length ? `${problems.length} issue${problems.length>1?"s":""} in A${a.id}` : `A${a.id} valid`}
        </div>
      </div>
    </div>
  );
}

function ActionModRow({ mod, onChange, onRemove, onMtu }) {
  const meta = ACT_MOD_INDEX[mod.k]; if (!meta) return null;
  const isFlag = meta.kind === "flag";
  const isMtu = meta.kind === "mtu";
  const err = (meta.kind === "enum" || isFlag) ? null : (isMtu ? (/^\d+$/.test(mod.mtu || "") ? null : "MTU required") : validate(meta.kind, mod.val));
  return (
    <div className="mod-row">
      <span className="mod-key">{meta.label}</span>
      {meta.kind === "enum"
        ? <select className="mod-val" value={mod.val} onChange={(e) => onChange(mod.id, e.target.value)}>
            {meta.opts.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
        : isFlag
          ? <span className="exists-note">no value — emits &lt;{mod.k}/&gt;</span>
          : isMtu
            ? <input className={"mod-val" + (err ? " invalid" : "")} value={mod.mtu ?? ""} placeholder="mtu, e.g. 1440"
                onChange={(e) => onMtu(mod.id, e.target.value)} />
            : <input className={"mod-val" + (err ? " invalid" : "")} value={mod.val} placeholder={meta.ph || ""}
                onChange={(e) => onChange(mod.id, e.target.value)} />}
      <code className="mod-tag">&lt;{mod.k}{isMtu ? " mtu" : ""}&gt;</code>
      <div className="spacer" />
      <button className="icon-btn" onClick={() => onRemove(mod.id)}>✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Chain tab — decision tree canvas
   ============================================================ */
const NODE_W = 150, NODE_H = 52, H_GAP = 34, V_GAP = 60, PH_H = 40;
function layoutChain(root) {
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

function ChainTab({ doc, definedIds, outputIds, setChainTreeFor, setDoc, activeChain, setActiveChain, inPortConflicts }) {
  const [selId, setSelId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const chains = doc.chains ?? [];
  // resolve active chain (fall back to first)
  const chain = chains.find((c) => c.cid === activeChain) || chains[0];
  const cid = chain?.cid;

  const { placed, edges, totalW, totalH } = useMemo(() => chain ? layoutChain(chain) : { placed: [], edges: [], totalW: 0, totalH: 0 }, [chain]);
  const problems = useMemo(() => chain ? chainProblems(chain.tree, []) : [], [chain]);
  const problemIds = useMemo(() => new Set(problems.map((p) => p.id)), [problems]);
  const refs = useMemo(() => chain ? collectRefs(chain.tree, definedIds) : [], [chain, definedIds]);
  const knownNames = useMemo(() => Object.fromEntries(doc.filters.map((f) => ["F" + f.id, f.name])), [doc.filters]);
  // alt labels keyed by reference id, for the chain node captions
  const filterAlt = useMemo(() => Object.fromEntries(doc.filters.filter((f) => f.alt).map((f) => ["F" + f.id, f.alt])), [doc.filters]);
  const outputAlt = useMemo(() => Object.fromEntries((doc.outputs ?? []).filter((o) => o.alt).map((o) => ["O" + o.id, o.alt])), [doc.outputs]);
  // resolve the alt caption for a branch's fids ("F1" or "F1,!F3" → first defined alt) or an out's ports ("O1")
  const branchAlt = (fids) => {
    for (const tok of String(fids).split(",")) { const id = tok.trim().replace(/^!/, ""); if (filterAlt[id]) return filterAlt[id]; }
    return "";
  };
  const outAlt = (ports) => { for (const tok of String(ports).split(",")) { const t = tok.trim(); if (outputAlt[t]) return outputAlt[t]; } return ""; };
  const capAlt = (s) => s && s.length > 22 ? s.slice(0, 21) + "…" : s; // keep captions inside the node

  const sel = placed.find((n) => n.id === selId) || null;
  const mutate = (id, fn) => setChainTreeFor(cid, (tree) => cUpdate(tree, id, fn));
  const setPorts = (v) => setDoc((d) => ({ ...d, chains: d.chains.map((c) => c.cid === cid ? { ...c, ports: v } : c) }));
  const setInVlan = (patch) => setDoc((d) => ({ ...d, chains: d.chains.map((c) => c.cid === cid ? { ...c, inVlan: { ...(c.inVlan ?? {}), ...patch } } : c) }));

  const addChain = () => {
    const c = mkChain("P0");
    setDoc((d) => ({ ...d, chains: [...d.chains, c] }));
    setActiveChain(c.cid); setSelId(null);
  };
  const delChain = (targetCid) => {
    setDoc((d) => ({ ...d, chains: d.chains.filter((c) => c.cid !== targetCid) }));
    setActiveChain(chains.find((c) => c.cid !== targetCid)?.cid ?? null);
    setSelId(null);
  };

  // first out-port(s) a chain routes to, for the flow summary
  const chainDest = (c) => {
    const outs = [];
    (function walk(n) {
      if (!n || isUnset(n)) return;
      if (n.t === "out") { outs.push(n.ports === "0" ? "drop" : n.ports); return; }
      ["match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
    })(c.tree);
    return [...new Set(outs)].slice(0, 3).join(", ") || "—";
  };
  const chainInFirst = (c) => (c.ports || "").split(",")[0].trim();

  const ownerOf = (nid2) => {
    let found = null;
    (function walk(n) {
      if (!n || found) return;
      if (n.t === "branch") {
        if (n.match && n.match.id === nid2) found = { branchId: n.id, side: "match", branch: n };
        if (n.notmatch && n.notmatch.id === nid2) found = { branchId: n.id, side: "notmatch", branch: n };
      }
      ["match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
    })(chain.tree);
    return found;
  };
  const selOwner = sel && sel.t !== "in" ? ownerOf(sel.id) : null;

  const addTest = (id) => mutate(id, () => mkBranch("F" + (doc.filters[0]?.id ?? 1)));
  const removeTest = (id) => mutate(id, (n) => mkOut(n.match?.ports || "P1"));
  const requestRemove = (nid2) => {
    const o = ownerOf(nid2); if (!o) return;
    const other = o.side === "match" ? "notmatch" : "match";
    setConfirm({ branchId: o.branchId, side: o.side, fids: o.branch.fids, blockUnset: isUnset(o.branch[other]), otherSide: other });
  };
  const resolveRemove = (intent) => {
    if (!confirm) return;
    setChainTreeFor(cid, (tree) => setSide(tree, confirm.branchId, confirm.side, intent === "drop" ? mkDrop() : mkUnset()));
    setSelId(null); setConfirm(null);
  };
  const restoreSide = (nid2) => { const o = ownerOf(nid2); if (!o) return; setChainTreeFor(cid, (tree) => setSide(tree, o.branchId, o.side, mkOut("P1"))); };

  const PAD = 40, svgW = totalW + PAD * 2, svgH = totalH + PAD * 2;
  const center = (n) => ({ x: n._x + NODE_W / 2 + PAD, y: n._y + PAD });
  const byId = Object.fromEntries(placed.map((n) => [n.id, n]));

  if (!chain) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>No chains yet. A <code>&lt;chain&gt;</code> routes packets arriving on an ingress port through filter tests to outputs.</p>
        <button className="primary" onClick={addChain}>+ New chain</button>
      </div>
    </div>
  );

  return (
    <div className="chain-layout3">
      <aside className="chain-list">
        <div className="chain-list-head">chains</div>
        {chains.map((c) => {
          const inP = chainInFirst(c);
          const conflict = inPortConflicts.has(inP);
          return (
            <button key={c.cid} className={"chain-item" + (c.cid === cid ? " on" : "")} onClick={() => { setActiveChain(c.cid); setSelId(null); }}>
              <span className="chain-flow"><b>{inP || "?"}</b> <span className="arr">→</span> <span className="dest">{chainDest(c)}</span></span>
              {conflict && <span className="chain-conflict" title="another chain uses this ingress port">⚠</span>}
            </button>
          );
        })}
        <button className="filter-add" onClick={addChain}>+ Add chain</button>
        {chains.length > 1 && (
          <button className="chain-del" onClick={() => delChain(cid)}>Delete this chain</button>
        )}
      </aside>

      <section className="canvas-wrap" onClick={() => setSelId(null)}>
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="canvas">
          <defs>
            <marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3a5064" /></marker>
            <marker id="ard" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#3a4654" /></marker>
          </defs>
          {edges.map((e, i) => {
            const a = byId[e.from], b = byId[e.to]; if (!a || !b) return null;
            const tu = isUnset(b); const p1 = center(a), p2 = center(b);
            const y1 = p1.y + NODE_H / 2, y2 = p2.y - (tu ? PH_H : NODE_H) / 2, midY = (y1 + y2) / 2;
            const path = `M ${p1.x} ${y1} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${y2}`;
            const base = e.kind === "match" ? "match" : e.kind === "notmatch" ? "notmatch" : "flow";
            const label = e.kind === "match" ? "match" : e.kind === "notmatch" ? "notmatch" : null;
            return <g key={i}>
              <path d={path} className={"edge " + base + (tu ? " toUnset" : "")} markerEnd={tu ? "url(#ard)" : "url(#ar)"} />
              {label && <text x={(p1.x + p2.x) / 2} y={midY - 4} className={"edge-label " + base + (tu ? " dim" : "")} textAnchor="middle">{label}</text>}
            </g>;
          })}
          {placed.map((n) => {
            const c = center(n), isSel = n.id === selId;
            if (isUnset(n)) {
              const x = c.x - NODE_W / 2, y = c.y - PH_H / 2;
              return <g key={n.id} className={"gnode unset" + (isSel ? " sel" : "")} onClick={(ev) => { ev.stopPropagation(); setSelId(n.id); }}>
                <rect x={x} y={y} width={NODE_W} height={PH_H} rx="8" />
                <text x={c.x} y={c.y - 3} className="n-kind dim">UNSPECIFIED</text>
                <text x={c.x} y={c.y + 11} className="n-default">device default</text>
              </g>;
            }
            const x = c.x - NODE_W / 2, y = c.y - NODE_H / 2, drop = isDrop(n), bad = problemIds.has(n.id);
            return <g key={n.id} className={`gnode ${n.t}${drop ? " drop" : ""}${bad ? " bad" : ""}${isSel ? " sel" : ""}`} onClick={(ev) => { ev.stopPropagation(); setSelId(n.id); }}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="9" />
              {bad && <text x={x + NODE_W - 13} y={y + 16} className="n-warn">!</text>}
              {n.t === "in" && <><text x={c.x} y={c.y - 5} className="n-kind">INGRESS</text><text x={c.x} y={c.y + 12} className="n-main">{n.ports}</text></>}
              {n.t === "branch" && <><text x={c.x} y={c.y - 5} className={branchAlt(n.fids) ? "n-alt" : "n-kind"}>{capAlt(branchAlt(n.fids)) || "FILTER"}</text><text x={c.x} y={c.y + 12} className="n-main">{n.fids}</text></>}
              {n.t === "out" && <><text x={c.x} y={c.y - 5} className={!drop && outAlt(n.ports) ? "n-alt" : "n-kind"}>{drop ? "DISCARD" : capAlt(outAlt(n.ports)) || (n.mode === "loadBalance" ? "LOAD BALANCE" : "OUTPUT")}</text><text x={c.x} y={c.y + 12} className="n-main">{drop ? "drop (0)" : n.ports}</text></>}
            </g>;
          })}
        </svg>
      </section>

      <aside className="chain-rail">
        <div className="inspector">
          <div className="insp-head">{sel ? (isUnset(sel) ? "Unspecified" : sel.t === "in" ? "Ingress" : sel.t === "branch" ? "Filter test" : isDrop(sel) ? "Discard" : "Output") : "Inspector"}</div>
          {!sel && <p className="insp-empty">Select a node to edit.</p>}
          {sel && sel.t === "in" && <>
            {inPortConflicts.has(chainInFirst(chain)) && (
              <p className="conflict-note">Another chain also ingresses on <code>{chainInFirst(chain)}</code>. Each ingress port should feed one chain — the device may only apply one.</p>
            )}
            <label className="fld2"><span>Ingress ports</span>
              <input value={chain.ports} onChange={(e) => setPorts(e.target.value)} /><em>e.g. P0,P1</em></label>
            <label className="fld2"><span>VLAN operation</span>
              <select value={chain.inVlan?.vlantype ?? ""} onChange={(e) => setInVlan({ vlantype: e.target.value || undefined })}>
                <option value="">none</option><option value="tagging">tagging</option><option value="stripping">stripping</option>
              </select><em>optional — tag or strip VLAN at ingress</em></label>
            {chain.inVlan?.vlantype === "tagging" && <label className="fld2"><span>VLAN id</span>
              <input value={chain.inVlan?.vlanid ?? ""} onChange={(e) => setInVlan({ vlanid: e.target.value })} placeholder="100" /></label>}
          </>}
          {sel && isUnset(sel) && <><p className="insp-note">No branch here — device default applies. No <code>&lt;next&gt;</code> is written.</p>
            <button className="primary" onClick={() => restoreSide(sel.id)}>Route explicitly</button></>}
          {sel && sel.t === "branch" && <>
            <label className="fld2"><span>Filter(s)</span>
              <input value={sel.fids} onChange={(e) => mutate(sel.id, (n) => ({ ...n, fids: e.target.value }))} /><em>e.g. F1 or F1,!F3</em></label>
            <label className="fld2"><span>Combine</span>
              <select value={sel.fidOp} onChange={(e) => mutate(sel.id, (n) => ({ ...n, fidOp: e.target.value }))}><option value="or">or</option><option value="and">and</option></select></label>
            <div className="known"><span className="known-label">defined filters</span>
              {doc.filters.map((f) => <button key={f.id} className="chip" onClick={() => mutate(sel.id, (n) => ({ ...n, fids: "F" + f.id }))}><b>F{f.id}</b> {f.name || "unnamed"}</button>)}</div>
            <button className="danger" onClick={() => removeTest(sel.id)}>Remove test → output</button>
          </>}
          {sel && sel.t === "out" && <>
            {isDrop(sel) ? <p className="insp-note">Discarded (<code>&lt;out&gt;0&lt;/out&gt;</code>). Explicit, distinct from unspecified.</p> : <>
              <label className="fld2"><span>Output ports</span><input value={sel.ports} onChange={(e) => mutate(sel.id, (n) => ({ ...n, ports: e.target.value }))} /><em>P1,P2 · 0 drop · S switch · O1 = output def</em></label>
              {(doc.outputs?.length ?? 0) > 0 && <div className="known"><span className="known-label">defined outputs</span>
                {doc.outputs.map((o) => <button key={o.id} className="chip" onClick={() => mutate(sel.id, (n) => ({ ...n, ports: "O" + o.id }))}><b>O{o.id}</b> {o.name || o.port}</button>)}</div>}
              <label className="fld2"><span>Mode</span><select value={sel.mode} onChange={(e) => mutate(sel.id, (n) => ({ ...n, mode: e.target.value }))}><option value="duplicate">duplicate</option><option value="loadBalance">load balance</option></select></label>
              {sel.mode === "loadBalance" && <label className="fld2"><span>Balance by</span><select value={sel.lb} onChange={(e) => mutate(sel.id, (n) => ({ ...n, lb: e.target.value }))}>{["session","5thash","rr","sip","dip"].map((o) => <option key={o} value={o}>{o}</option>)}</select></label>}
              <label className="fld2"><span>VLAN operation</span>
                <select value={sel.vlantype ?? ""} onChange={(e) => mutate(sel.id, (n) => ({ ...n, vlantype: e.target.value || undefined }))}>
                  <option value="">none</option><option value="tagging">tagging</option><option value="stripping">stripping</option>
                </select><em>optional — tag or strip VLAN on egress</em></label>
              {sel.vlantype === "tagging" && <label className="fld2"><span>VLAN id</span>
                <input value={sel.vlanid ?? ""} onChange={(e) => mutate(sel.id, (n) => ({ ...n, vlanid: e.target.value }))} placeholder="100" /></label>}
              <button className="primary" onClick={() => addTest(sel.id)}>+ Add filter test</button>
            </>}
            {selOwner && <button className="danger" onClick={() => requestRemove(sel.id)}>Remove {selOwner.side} branch…</button>}
          </>}
        </div>

        <div className="refs">
          <div className="refs-head"><span>Filters referenced</span><span className="refs-count">{refs.length}</span></div>
          {refs.map((r) => <div key={r.id} className={"ref-row " + (r.defined ? "here" : "device")}>
            <span className="ref-dot" /><code className="ref-id">{r.id}</code>
            <span className="ref-name">{knownNames[r.id] || ""}</span>
            <span className="ref-where">{r.defined ? "defined here" : "on device"}</span>
          </div>)}
          {refs.some((r) => !r.defined) && <p className="refs-note">Undefined here → assumed to exist on the device. No empty filter is generated.</p>}
        </div>
      </aside>

      {confirm && <div className="modal-scrim" onClick={() => setConfirm(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">Remove the <b className={confirm.side}>{confirm.side}</b> branch of <code>{confirm.fids}</code>?</div>
          <p className="modal-body">Choose what happens to packets that would take this path.</p>
          {confirm.blockUnset ? <div className="rule-note">The <b className={confirm.otherSide}>{confirm.otherSide}</b> side is already unspecified. A <code>&lt;fid&gt;</code> must route at least one side, so this must go somewhere explicit.</div>
            : <button className="opt" onClick={() => resolveRemove("unset")}><span className="opt-name">Leave unspecified</span><span className="opt-desc">No <code>&lt;next&gt;</code> written; device default applies.</span></button>}
          <button className="opt drop" onClick={() => resolveRemove("drop")}><span className="opt-name">Discard explicitly</span><span className="opt-desc">Emits <code>&lt;out&gt;0&lt;/out&gt;</code>; intent visible.</span></button>
          <button className="opt-cancel" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      </div>}
    </div>
  );
}

/* ============================================================
   Export tab
   ============================================================ */
/* Syntax-highlighted read-only XML view. Tokenises the text into tags,
   attribute names/values, and content, wrapping each in a coloured span.
   Pure React nodes (no dangerouslySetInnerHTML) so it's injection-safe. */
function highlightXmlLine(line, keyBase) {
  const nodes = [];
  let i = 0, key = 0;
  const push = (cls, text) => { if (text) nodes.push(<span key={`${keyBase}-${key++}`} className={cls}>{text}</span>); };
  // match a tag: <...> possibly self-closing, else treat as text
  const tagRe = /<\/?[\w:-]+((?:\s+[\w:-]+(?:\s*=\s*"[^"]*")?)*)\s*\/?>/g;
  let m, last = 0;
  while ((m = tagRe.exec(line)) !== null) {
    if (m.index > last) push("xt-text", line.slice(last, m.index));
    const tag = m[0];
    // break the tag into: opening bracket + name, attributes, closing bracket
    const head = tag.match(/^<\/?[\w:-]+/)[0];
    const tailMatch = tag.match(/\/?>$/);
    const tail = tailMatch ? tailMatch[0] : "";
    const attrsPart = tag.slice(head.length, tag.length - tail.length);
    push("xt-punct", head[0] + (head[1] === "/" ? "/" : ""));
    push("xt-tag", head.replace(/^<\/?/, ""));
    // attributes: name="value" pairs
    const attrRe = /([\w:-]+)(\s*=\s*)("[^"]*")|(\s+)/g;
    let am;
    while ((am = attrRe.exec(attrsPart)) !== null) {
      if (am[4]) { push("xt-text", am[4]); continue; }
      push("xt-attr", am[1]);
      push("xt-punct", am[2]);
      push("xt-val", am[3]);
    }
    push("xt-punct", tail);
    last = m.index + tag.length;
  }
  if (last < line.length) push("xt-text", line.slice(last));
  return nodes;
}
function XmlView({ xml }) {
  const lines = xml.split("\n");
  return (
    <pre className="xml xml-hl"><code>{lines.map((ln, i) => (
      <span key={i} className="xt-line">{highlightXmlLine(ln, i)}{"\n"}</span>
    ))}</code></pre>
  );
}

function ExportTab({ runXml, problems, onGoto, onApplyXml }) {
  const [copied, setCopied] = useState(false);
  const [submit, setSubmit] = useState({ state: "idle", msg: "" }); // idle | sending | ok | error
  const [apply, setApply] = useState({ active: false, msg: "", warn: "" }); // device-side apply polling
  const [edit, setEdit] = useState(null); // null = read-only; string = editing draft
  const [applyErr, setApplyErr] = useState("");
  const [applyWarn, setApplyWarn] = useState([]);
  const copy = () => { if (problems.length) return; navigator.clipboard?.writeText(runXml); setCopied(true); setTimeout(() => setCopied(false), 1400); };

  const startEdit = () => { setEdit(runXml); setApplyErr(""); setApplyWarn([]); };
  const cancelEdit = () => { setEdit(null); setApplyErr(""); setApplyWarn([]); };
  const formatEdit = () => {
    try { setEdit(formatXml(edit)); setApplyErr(""); }
    catch (e) { setApplyErr(`can't format — ${e.message}`); }
  };
  const applyEdit = () => {
    try {
      const warnings = onApplyXml(edit);
      setEdit(null); setApplyErr("");
      setApplyWarn(warnings || []);
    } catch (e) {
      setApplyErr(e.message || "couldn't parse the XML");
    }
  };

  const submitToDevice = async () => {
    if (problems.length || submit.state === "sending" || apply.active || edit !== null) return;
    setSubmit({ state: "sending", msg: "" });
    try {
      // same-origin: the tool is served from the device, so a relative path
      // needs no host and shares the device's session cookie automatically.
      const body = new URLSearchParams();
      body.set("filename", "run.xml");
      body.set("data", runXml);
      const res = await fetch("/grism/task/submitxml", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`device responded ${res.status}`);
      setSubmit({ state: "idle", msg: "" });
      // the device now applies the config; lock the screen and poll for completion
      pollApplyStatus();
    } catch (e) {
      setSubmit({ state: "error", msg: e.message || "submit failed" });
    }
  };

  // Poll /grism/task/get_status once a second until loading is false.
  // Locks the screen with an overlay; unlocks on completion, timeout, or
  // repeated request failure so the UI can never get stuck.
  const pollApplyStatus = async () => {
    const POLL_MS = 1000, TIMEOUT_MS = 90000, MAX_FAILS = 5;
    setApply({ active: true, msg: "applying configuration…", warn: "" });
    const started = Date.now();
    let fails = 0;
    // small initial delay before the first status check
    await new Promise((r) => setTimeout(r, POLL_MS));
    while (true) {
      if (Date.now() - started > TIMEOUT_MS) {
        setApply({ active: false, msg: "", warn: "Apply timed out — the device is still working or unreachable. Check its status directly." });
        return;
      }
      try {
        const res = await fetch("/grism/task/get_status", { credentials: "include" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        fails = 0;
        if (!data.loading) { // done
          setApply({ active: false, msg: "", warn: "" });
          setSubmit({ state: "ok", msg: "applied" });
          setTimeout(() => setSubmit({ state: "idle", msg: "" }), 2500);
          return;
        }
        setApply({ active: true, msg: data.message || "applying configuration…", warn: "" });
      } catch {
        fails += 1;
        if (fails >= MAX_FAILS) {
          setApply({ active: false, msg: "", warn: "Lost contact with the device while applying. Check that you're signed in and the device is reachable." });
          return;
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };

  const submitLabel = problems.length ? "fix issues to submit"
    : apply.active ? "applying…"
    : submit.state === "sending" ? "submitting…"
    : submit.state === "ok" ? "applied ✓"
    : submit.state === "error" ? "retry submit"
    : "submit to device";

  const editing = edit !== null;

  return (
    <div className="export-layout">
      {apply.active && (
        <div className="apply-overlay">
          <div className="apply-card">
            <div className="apply-spinner" />
            <div className="apply-msg">{apply.msg}</div>
            <div className="apply-sub">Applying to the device — please wait.</div>
          </div>
        </div>
      )}
      <div className="export-main">
        <div className="xb-head">
          <span className="xb-title">Complete &lt;run&gt;{editing && <span className="xb-editing"> · editing</span>}</span>
          <div className="xb-actions">
            {!editing && <>
              <button className="copy-btn" onClick={startEdit}>edit</button>
              <button className="copy-btn" disabled={problems.length > 0} onClick={copy}>{copied ? "copied ✓" : problems.length ? "fix issues to copy" : "copy"}</button>
              <button className={"submit-btn" + (submit.state === "error" ? " err" : submit.state === "ok" ? " ok" : "")}
                disabled={problems.length > 0 || submit.state === "sending" || apply.active} onClick={submitToDevice}>{submitLabel}</button>
            </>}
            {editing && <>
              <button className="copy-btn" onClick={formatEdit}>format</button>
              <button className="copy-btn" onClick={cancelEdit}>cancel</button>
              <button className="submit-btn" onClick={applyEdit}>apply changes</button>
            </>}
          </div>
        </div>
        {editing
          ? <textarea className="xml-edit" value={edit} spellCheck={false}
              onChange={(e) => setEdit(e.target.value)} />
          : <XmlView xml={runXml} />}
      </div>
      <aside className="export-side">
        {!editing && <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />{problems.length ? `${problems.length} issue${problems.length>1?"s":""}` : "ready to export"}
        </div>}
        {editing && <div className="edit-help">
          <p>Edit the XML directly. <b>Format</b> tidies the indentation without changing anything. <b>Apply changes</b> parses it back into the editor — every tab updates to match. <b>Cancel</b> discards your edits.</p>
          {applyErr && <p className="submit-note err">Couldn't apply: {applyErr}. Fix the XML and try again.</p>}
        </div>}
        {!editing && applyWarn.length > 0 && <p className="submit-note warn">Applied with {applyWarn.length} warning{applyWarn.length>1?"s":""}: {applyWarn.slice(0,3).join("; ")}{applyWarn.length>3?"…":""}</p>}
        {!editing && apply.warn && <p className="submit-note warn">{apply.warn}</p>}
        {!editing && submit.state === "error" && <p className="submit-note err">Submit failed: {submit.msg}. Check that you're signed in to the device and try again.</p>}
        {!editing && submit.state === "ok" && <p className="submit-note ok">Configuration applied — the device is now running <code>run.xml</code>.</p>}
        {!editing && problems.length > 0 && <ul className="problem-list">
          {problems.map((p, i) => <li key={i} onClick={() => onGoto(p.scope)}><code>{p.scope}</code> {p.label ? <b>{p.label}</b> : null} — {p.msg}</li>)}
        </ul>}
        {!editing && problems.length === 0 && submit.state === "idle" && applyWarn.length === 0 && <p className="export-ok">All filters and the chain validate. Edit the XML, copy it, or submit straight to the device.</p>}
      </aside>
    </div>
  );
}

