/* ============================================================
   GRISM Studio — regression test suite

   Run:  node test.js

   These import and exercise the REAL implementation from grism-core.js and
   i18n.js, so the suite can never drift out of sync with the shipped code.
   (The previous suite re-implemented the logic, which let a bug slip through
   once the copy and the original diverged.)
   ============================================================ */

import * as C from "./grism-core.js";
import { DOMParser as XmlDomParser } from "linkedom";
C.setDomParser(XmlDomParser);   // browsers have DOMParser; Node needs one injected
import { I18N, makeT } from "./i18n.js";
import { readFileSync } from "node:fs";

let _pass = 0, _fail = 0;
const check = (name, cond) => { if (cond) { _pass++; } else { _fail++; console.log("  FAIL:", name); } };
const group = (name) => console.log("\n== " + name + " ==");

/* ---------- field catalogue ---------- */
group("field catalogue");
check("FIELD_INDEX built from FIELDS", Object.keys(C.FIELD_INDEX).length > 20);
check("icmp fields present", !!C.FIELD_INDEX["icmp"] && !!C.FIELD_INDEX["icmp.type"] && !!C.FIELD_INDEX["icmp.code"]);
check("icmp.type is numeric", C.FIELD_INDEX["icmp.type"].kind === "num");
check("S1AP CellIdentity present", !!C.FIELD_INDEX["gtp.data.by.s1ap.CellIdentity"]);
check("S1AP CellIdentity is integer", C.FIELD_INDEX["gtp.data.by.s1ap.CellIdentity"].kind === "num");
check("S1AP SubscriberProfileIDforRFP is integer", C.FIELD_INDEX["gtp.data.by.s1ap.SubscriberProfileIDforRFP"]?.kind === "num");
check("num kind has comparison relations", C.relationsFor("num").includes(">=") && C.relationsFor("num").includes("<="));
// gtp.imsi came from an old field table in the firmware's doc/filter.md and is
// not in g_ftype[]: the device logs "filter find type unsupport" and drops the
// find, so the filter silently matches on fewer conditions than the UI showed.
check("no bogus gtp.imsi field", !C.FIELD_INDEX["gtp.imsi"]);
check("the real IMSI field is still offered", !!C.FIELD_INDEX["ip.addr.related.gtp.imsi"]);
// fields that exist in g_ftype[] and are genuinely authorable from XML
for (const f of ["quic.tag", "tunnel.outerlayer.ip.dsfield", "tunnel.innerlayer1.ip.dsfield",
                 "tunnel.innerlayer2.ip.dsfield", "heartbeat.target.miss.nth",
                 "mec.mapping.ue.ipv4.connected"])
  check(`${f} offered`, !!C.FIELD_INDEX[f]);
check("tunnel dsfields are uint8 like ip.dsfield",
  ["tunnel.outerlayer.ip.dsfield", "tunnel.innerlayer1.ip.dsfield", "tunnel.innerlayer2.ip.dsfield"]
    .every((f) => C.FIELD_INDEX[f].kind === C.FIELD_INDEX["ip.dsfield"].kind));
// these are in g_ftype[] but doing nothing / not authorable - see the note on FIELDS
for (const f of ["service.google.youtube", "ip.addr.hash", "dns.qry.name.hash",
                 "dns.qry.name_public_suffix.hash", "http.request.url.hash", "5-tuple.live"])
  check(`${f} deliberately not offered`, !C.FIELD_INDEX[f]);
check("quic.tag accepts CHLO", C.validate("quictag", "CHLO") === null);
check("quic.tag rejects anything else", C.validate("quictag", "SHLO") !== null);
const JA4_FIELDS = ["tls.handshake.ja4", "tls.handshake.ja4_a", "tls.handshake.ja4_b", "tls.handshake.ja4_c",
                    "tls.handshake.ja4s", "tls.handshake.ja4s_a", "tls.handshake.ja4s_b", "tls.handshake.ja4s_c"];
check("all 8 JA4/JA4S fields present", JA4_FIELDS.every((f) => !!C.FIELD_INDEX[f]));
check("JA4 fields sit in the TLS / SSL group",
  JA4_FIELDS.every((f) => C.FIELDS.find((g) => g.g === "TLS / SSL").items.some((i) => i.v === f)));
// the device only implements R_EQ / R_NOTEQ for these, so no >= / <= must be offered
check("JA4 fields offer only == and !=",
  JA4_FIELDS.every((f) => JSON.stringify(C.relationsFor(C.FIELD_INDEX[f].kind)) === JSON.stringify(["==", "!="])));

/* ---------- validation ---------- */
group("value validation");
check("valid IPv4 accepted", C.validate("ip", "192.168.1.1") === null);
check("bad IPv4 rejected", C.validate("ip", "999.1.1.1") !== null);
check("CIDR accepted", C.validate("ip", "10.0.0.0/8") === null);
check("valid port accepted", C.validate("port", "443") === null);
check("out-of-range port rejected", C.validate("port", "70000") !== null);
check("valid MAC accepted", C.validate("mac", "12:34:56:78:9a:bc") === null);
check("integer accepted", C.validate("num", "12345") === null);
check("non-integer rejected", C.validate("num", "1.5") !== null);
check("VLAN range enforced", C.validate("vlan", "4095") !== null && C.validate("vlan", "100") === null);
check("valid JA4 accepted", C.validate("ja4", "t13d1516h2_8daaf6152771_02713d6af862") === null);
check("JA4 with wrong digest length rejected", C.validate("ja4", "t13d1516h2_8daaf615277_02713d6af862") !== null);
check("JA4S not accepted as JA4", C.validate("ja4", "t130200_1301_234ea6891581") !== null);
check("valid JA4S accepted", C.validate("ja4s", "t130200_1301_234ea6891581") === null);
check("JA4S with 12-hex cipher rejected", C.validate("ja4s", "t130200_8daaf6152771_234ea6891581") !== null);
check("JA4 part accepted", C.validate("ja4part", "8daaf6152771") === null && C.validate("ja4part", "t13d1516h2") === null);
check("JA4 part with _ rejected", C.validate("ja4part", "8daaf6152771_02713d6af862") !== null);
check("empty JA4 part rejected", C.validate("ja4part", "") !== null);

/* ---------- filter serialisation ---------- */
group("filter serialisation");
{
  const f = { id: 1, name: "https", sessionBase: "no",
    root: { id: "n1", t: "or", children: [
      { id: "n2", t: "find", field: "tcp.port", rel: "==", val: "443" },
      { id: "n3", t: "find", field: "udp.port", rel: "==", val: "443" }] } };
  const xml = C.serializeFilter(f);
  check("filter has id attr", xml.includes('id="1"'));
  check("filter has name attr", xml.includes('name="https"'));
  check("find emits name/relation/content", xml.includes('<find name="tcp.port" relation="==" content="443" />'));
  check("or wrapper emitted", xml.includes("<or>") && xml.includes("</or>"));
  const s1ap = C.serializeFilter({ id: 2, sessionBase: "no",
    root: { id: "r", t: "or", children: [{ id: "a", t: "find", field: "gtp.data.by.s1ap.CellIdentity", rel: ">=", val: "7" }] } });
  check("S1AP find serialises with integer content", s1ap.includes('name="gtp.data.by.s1ap.CellIdentity" relation=">=" content="7"'));
}

/* ---------- filter problems ---------- */
group("filter validation");
{
  const bad = { id: "r", t: "or", children: [{ id: "a", t: "find", field: "ip.addr", rel: "==", val: "not-an-ip" }] };
  check("invalid value reported", C.filterProblems(bad, []).length === 1);
  const good = { id: "r", t: "or", children: [{ id: "a", t: "find", field: "ip.addr", rel: "==", val: "8.8.8.8" }] };
  check("valid value clean", C.filterProblems(good, []).length === 0);
  check("empty filter detected", C.isEmptyFilter({ root: { id: "r", t: "or", children: [] } }) === true);
  check("non-empty filter not flagged", C.isEmptyFilter({ root: good }) === false);
}

/* ---------- tree edit helpers ---------- */
group("tree edit helpers");
{
  const tree = { id: "r", t: "or", children: [{ id: "a", t: "find", field: "ip", rel: "==", val: "" }] };
  const updated = C.tUpdate(tree, "a", (n) => ({ ...n, val: "1.1.1.1" }));
  check("tUpdate changes the target node", updated.children[0].val === "1.1.1.1");
  check("tUpdate is immutable", tree.children[0].val === "");
  const removed = C.tRemove(tree, "a");
  check("tRemove drops the node", removed.children.length === 0);
}

/* ---------- chain serialisation ---------- */
group("chain serialisation");
{
  const chain = { cid: "c1", ports: "P0", tree: { id: "b", t: "branch", fids: "F1", fidOp: "or",
    match: { id: "m", t: "out", ports: "P1", mode: "duplicate" },
    notmatch: { id: "n", t: "out", ports: "P2", mode: "duplicate" } } };
  const xml = C.serializeChain(chain);
  check("chain in port", xml.includes("<in>P0</in>"));
  check("default fid type omitted", xml.includes("<fid>F1</fid>"));
  check("match out emitted", xml.includes("<out>P1</out>"));
  check("notmatch wrapped in next", xml.includes('<next type="notmatch">'));
  const andChain = C.serializeChain({ ...chain, tree: { ...chain.tree, fidOp: "and" } });
  check("non-default fid type kept", andChain.includes('<fid type="and">F1</fid>'));
  const lb = C.serializeChain({ ...chain, tree: { ...chain.tree,
    match: { id: "m", t: "out", ports: "P1,P2", mode: "loadBalance", lb: "5thash" } } });
  check("loadBalance attrs emitted", lb.includes('type="loadBalance"') && lb.includes('lbtype="5thash"'));
  // a single destination port has nothing to balance between
  const lb1 = C.serializeChain({ ...chain, tree: { ...chain.tree,
    match: { id: "m", t: "out", ports: "P1", mode: "loadBalance", lb: "5thash" } } });
  check("single-port loadBalance not emitted", !lb1.includes('type="loadBalance"'));
  check("single-port out still serialised", lb1.includes("<out>P1</out>"));
}

/* ---------- chain problems / refs ---------- */
group("chain validation");
{
  const refs = C.collectRefs({ id: "b", t: "branch", fids: "F1,!F3", fidOp: "or",
    match: { id: "m", t: "out", ports: "P1" }, notmatch: C.mkUnset() }, new Set(["F1"]));
  check("refs collected", refs.length === 2);
  check("defined ref marked", refs.find((r) => r.id === "F1").defined === true);
  check("undefined ref marked", refs.find((r) => r.id === "F3").defined === false);
  // filter ids at/above the threshold are created on the device, so an undefined
  // reference to one is expected rather than a mistake
  check("ids below the threshold are local", C.isDeviceFilterId("F1") === false && C.isDeviceFilterId("F999") === false);
  check("ids at/above the threshold are device-side", C.isDeviceFilterId("F1000") && C.isDeviceFilterId("F10001"));
  check("bare numbers accepted", C.isDeviceFilterId(1000) && !C.isDeviceFilterId(999));
  check("negated refs accepted", C.isDeviceFilterId("!F1000") === true);
  const mixed = C.collectRefs({ t: "branch", fids: "F1,F5,F1000",
    match: { t: "out", ports: "P1" }, notmatch: C.mkUnset() }, new Set(["F1"]));
  check("defined ref is not device-side", mixed.find((r) => r.id === "F1").onDevice === false);
  check("low undefined ref is not device-side", mixed.find((r) => r.id === "F5").onDevice === false);
  check("high undefined ref is device-side", mixed.find((r) => r.id === "F1000").onDevice === true);
}

/* ---------- whole-document round trip ---------- */
group("run round trip");
{
  const doc = C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "starter").make());
  const xml = C.serializeRun(doc);
  check("run wraps everything", xml.startsWith("<run>") && xml.trim().endsWith("</run>"));
  check("starter has filters", xml.includes("<filter "));
  check("starter has chains", xml.includes("<chain>"));
  const { doc: back, warnings } = C.parseRun(xml);
  check("parses back without warnings", warnings.length === 0);
  check("filter count preserved", back.filters.length === doc.filters.length);
  check("chain count preserved", back.chains.length === doc.chains.length);
  const again = C.serializeRun(C.normalizeDoc(back));
  check("serialise → parse → serialise is stable", again === xml);
}
{
  // A device config with filters but no <chain> must come back with no chain.
  // parseRun used to invent P0→F1→P1 here, which serialised straight back out
  // and silently added forwarding the device never had.
  const noChain = `<run>
  <filter id="1" sessionBase="no"><and><find name="ip.src" relation="==" content="10.0.0.1" /></and></filter>
</run>`;
  const { doc: d, warnings: w } = C.parseRun(noChain);
  check("no <chain> in, no chain invented", d.chains.length === 0);
  check("chainless config parses without warnings", w.length === 0);
  check("chainless config does not grow a <chain> on re-serialise", !C.serializeRun(d).includes("<chain"));
  check("chainless round trip is byte-stable", C.serializeRun(C.parseRun(C.serializeRun(d)).doc) === C.serializeRun(d));
  // and an empty document stays empty rather than sprouting a starter filter
  const { doc: e } = C.parseRun("<run>\n</run>");
  check("empty run invents no filter", e.filters.length === 0);
  check("empty run invents no chain", e.chains.length === 0);
}

/* ---------- every template is valid and round trips ---------- */
group("empty device config");
// A device that was never configured 404s; one that was cleared serves an empty
// body. Neither must leave the starter template on screen as if it came from the
// device -- Export and Submit would then act on the template.
for (const [label, text] of [["404 (no body)", ""], ["empty body", "   \n\t "],
                             ["bare run", "<run></run>"], ["self-closing run", "<run/>"]]) {
  const r = C.parseRunOrEmpty(text);
  check(`${label} yields an empty document`,
    r.empty === true && r.doc.filters.length === 0 && r.doc.chains.length === 0 &&
    r.doc.inputs.length === 0 && r.doc.outputs.length === 0 && r.doc.actions.length === 0);
  check(`${label} is not an error`, Array.isArray(r.warnings));
}
check("parseRun still throws on empty input, so the guard has to be parseRunOrEmpty",
  (() => { try { C.parseRun(""); return false; } catch { return true; } })());
{
  const real = `<run><filter id="1" sessionBase="no"><and>` +
               `<find name="ip.src" relation="==" content="10.0.0.1" /></and></filter></run>`;
  const r = C.parseRunOrEmpty(real);
  check("a real config is not flagged empty", r.empty === false && r.doc.filters.length === 1);
}
check("an empty document serialises to an empty run",
  !C.serializeRun(C.parseRunOrEmpty("").doc).includes("<filter"));
check("and stays empty through a round trip",
  C.parseRunOrEmpty(C.serializeRun(C.parseRunOrEmpty("").doc)).empty === true);

group("templates");
for (const tpl of C.TEMPLATES) {
  const doc = C.normalizeDoc(tpl.make());
  const problems = [
    ...doc.filters.flatMap((f) => C.filterProblems(f.root, [])),
    ...doc.chains.flatMap((c) => C.chainProblems(c.tree, [])),
    ...(doc.outputs ?? []).flatMap((o) => C.outputProblems(o, [])),
    ...(doc.actions ?? []).flatMap((a) => C.actionProblems(a, [])),
    ...(doc.inputs ?? []).flatMap((i) => C.inputProblems(i, [])),
  ];
  check(`template "${tpl.id}" validates`, problems.length === 0);
  const { warnings } = C.parseRun(C.serializeRun(doc));
  check(`template "${tpl.id}" round trips`, warnings.length === 0);
}

/* ---------- outputs ---------- */
group("output serialisation");
{
  const o = { id: 1, name: "rewrite", port: "P1", oattrs: {},
    mods: [{ id: "m1", k: "sip", val: "10.0.0.1" }] };
  const xml = C.serializeOutput(o);
  check("output id/name", xml.includes('id="1"') && xml.includes('name="rewrite"'));
  check("output port", xml.includes("<port>P1</port>"));
  check("modifier emitted", xml.includes("10.0.0.1"));
  check("missing port reported", C.outputProblems({ id: 1, port: "", mods: [] }, []).length > 0);
}

/* ---------- actions ---------- */
group("action serialisation");
{
  const a = { id: 1, name: "strip", type: "input-packet-process", port: "P0", mods: [{ id: "m", k: "strip", val: "vlan" }] };
  const xml = C.serializeAction(a);
  check("action type attr", xml.includes('type="input-packet-process"'));
  check("action port", xml.includes("<port>P0</port>"));
  const lp = C.serializeAction({ id: 2, type: "linkpairs", portA: "P1", portB: "P2", mods: [] });
  check("linkpairs ports", lp.includes("<portA>P1</portA>") && lp.includes("<portB>P2</portB>"));
  check("bad port reported", C.actionProblems({ id: 1, type: "input-packet-process", port: "x", mods: [] }, []).length > 0);
}

/* ---------- inputs: replayPcap files vs scandir ---------- */
group("replayPcap input modes");
{
  const files = { id: 1, type: "replayPcap", port: "P0", pcapMode: "files",
    filepaths: ["a.pcap", "b.pcap", "c.pcap"], fields: { time: "1" }, scanAttrs: {} };
  const s1 = C.serializeInput(files);
  check("files: three filepath elements", (s1.match(/<filepath>/g) || []).length === 3);
  check("files: no scandir", !s1.includes("scandir"));
  check("files: no playedFiles", !s1.includes("playedFiles"));
  const scan = { id: 2, type: "replayPcap", port: "P0", pcapMode: "scandir", filepaths: [],
    fields: { scandir: "H1/in", playedFilesHandle: "move", playedFilesMoveTo: "H1/done" }, scanAttrs: {} };
  const s2 = C.serializeInput(scan);
  check("scandir: element emitted", s2.includes("<scandir>H1/in</scandir>"));
  check("scandir: handle emitted", s2.includes("<playedFilesHandle>move</playedFilesHandle>"));
  check("scandir: moveTo emitted for move", s2.includes("<playedFilesMoveTo>H1/done</playedFilesMoveTo>"));
  check("scandir: no filepath", !s2.includes("<filepath>"));
  const del = C.serializeInput({ ...scan, fields: { scandir: "H1/in", playedFilesHandle: "delete", playedFilesMoveTo: "x" } });
  check("moveTo omitted when handle is delete", !del.includes("playedFilesMoveTo"));
  check("removed legacy fields gone", !s1.includes("sessionCompleteness") && !s2.includes("sorting") && !s2.includes("reverseSession"));
  check("files: empty list reported", C.inputProblems({ id: 3, type: "replayPcap", port: "P0", pcapMode: "files", filepaths: [""], fields: {} }, []).length > 0);
  check("files: over 100 paths reported", C.inputProblems({ id: 4, type: "replayPcap", port: "P0", pcapMode: "files", filepaths: Array(101).fill("a.pcap"), fields: {} }, []).some((p) => /100/.test(p.msg)));
}

/* ---------- human-readable summaries ---------- */
group("doc summary (Overview)");
{
  const https = { t: "or", children: [
    { t: "find", field: "tcp.port", rel: "==", val: "443" },
    { t: "find", field: "udp.port", rel: "==", val: "443" }] };
  check("criterion joins with OR", C.describeCriterion(https).includes(" OR "));
  const zh = makeT("zh-TW");
  check("criterion translates connectors", C.describeCriterion(https, zh).includes(" 或 "));
  check("exists field needs no value", C.describeCriterion({ t: "or", children: [{ t: "find", field: "ip", rel: "==", val: "" }] }) === "is IPv4");
  const rec = { t: "and", children: [
    { t: "or", children: [{ t: "find", field: "country.iso_code", rel: "==", val: "CN" }] },
    { t: "not", children: [{ t: "find", field: "ip.addr", rel: "==", val: "8.8.8.8" }] }] };
  check("AND + NOT described", C.describeCriterion(rec).includes("AND") && C.describeCriterion(rec).includes("NOT"));
  check("fidsLabel adds names", C.fidsLabel("F1", { F1: "heartbeat miss" }) === "F1 heartbeat miss");
  check("fidsLabel keeps negation", C.fidsLabel("!F2", { F2: "https" }) === "!F2 https");
  check("namesOnly drops the id", C.namesOnly("F1", { F1: "heartbeat miss" }) === "heartbeat miss");
  check("namesOnly empty when unnamed", C.namesOnly("F9", {}) === "");
  check("toks counts fids", C.toks("F1,!F3") === 2);
}

/* ---------- chain flow tree (match-side continuation) ---------- */
group("summarizeChain tree");
{
  // F1 notmatch → F4; F4 MATCH → F2; F2 MATCH → F3 (continuation on the match side)
  const deep = { t: "branch", fids: "F1", match: { t: "out", ports: "V2" },
    notmatch: { t: "branch", fids: "F4",
      match: { t: "branch", fids: "F2",
        match: { t: "branch", fids: "F3", match: { t: "out", ports: "V3" }, notmatch: { t: "out", ports: "V2" } },
        notmatch: { t: "out", ports: "V3" } },
      notmatch: { t: "out", ports: "V2" } } };
  const fl = C.summarizeChain(deep);
  check("F1 match is a port", fl.root.match.kind === "ports" && fl.root.match.ports === "V2");
  check("F1 notmatch continues to F4", fl.root.notmatch.kind === "test" && fl.root.notmatch.node.test === "F4");
  check("F4 MATCH continues to F2", fl.root.notmatch.node.match.kind === "test" && fl.root.notmatch.node.match.node.test === "F2");
  check("F2 MATCH continues to F3", fl.root.notmatch.node.match.node.match.node.test === "F3");
  check("F2 notmatch is a port", fl.root.notmatch.node.match.node.notmatch.ports === "V3");
  const fwd = C.summarizeChain({ t: "out", ports: "P0" });
  check("pure forward has no root test", fwd.root === null && fwd.terminal.ports === "P0");
}

/* ---------- inferred intent ---------- */
group("inferIntent");
{
  const bidir = { filters: [{ id: 1, root: { t: "or", children: [{ t: "find", field: "heartbeat.target.miss.id", rel: "==", val: "1" }] } }],
    chains: [{ ports: "P0", tree: { t: "branch", fids: "F1", match: { t: "out", ports: "P1" }, notmatch: { t: "out", ports: "P2" } } },
             { ports: "P1", tree: { t: "branch", fids: "F1", match: { t: "out", ports: "P0" }, notmatch: { t: "out", ports: "P3" } } }] };
  // without a translator, inferIntent returns i18n KEYS; with one it returns prose
  const keys = C.inferIntent(bidir);
  check("bidirectional detected", keys.includes("intent.bidir"));
  check("heartbeat detected", keys.includes("intent.heartbeat"));
  const en = C.inferIntent(bidir, makeT("en"));
  check("bidirectional pair rendered", en.some((s) => s.includes("P0↔P1")));
  const lb = C.inferIntent({ filters: [], chains: [{ ports: "P0", tree: { t: "out", ports: "P1,P2", mode: "loadBalance" } }] });
  check("load balancing detected", lb.includes("intent.lb"));
  check("no chains and nothing else yields nothing", C.inferIntent({ filters: [], chains: [] }).length === 0);

  /* Inputs and actions are the parts of a configuration where the device does
     something of its own rather than forwarding what arrives, so the front
     page has to name them -- including on a document with no chains at all. */
  const replayDoc = { filters: [], chains: [], inputs: [
    { id: 1, type: "replayPcap", port: "L1", pcapMode: "files", filepaths: ["H1/in/sample.pcap", "H1/in/b.pcap"] },
    { id: 2, type: "replayPcap", port: "L2", pcapMode: "scandir", fields: { scandir: "H1/in" } },
  ] };
  const rp = C.inferIntent(replayDoc, makeT("en"));
  check("a replay-only document still describes itself", rp.length === 2);
  check("it names the ports, the count and the files",
    rp[0].includes("L1, L2") && rp[0].includes("2 replay") &&
    rp[0].includes("sample.pcap") && rp[0].includes("H1/in/"), rp[0]);
  check("and warns that a replay transmits rather than injects",
    /loops back/.test(rp[1]), rp[1]);
  check("a replay with no file yet says so",
    C.inferIntent({ chains: [], inputs: [{ id: 1, type: "replayPcap", port: "L1", filepaths: [""] }] },
      makeT("en"))[0].includes("no source set yet"));
  const gen = C.inferIntent({ chains: [], inputs: [
    { id: 1, type: "traffic-gen", port: "P3", fields: { protocol: "UDP" } }] }, makeT("en"));
  check("a generator is described with its protocol",
    gen.length === 1 && gen[0].includes("P3") && gen[0].includes("UDP"), gen[0]);

  const acts = C.inferIntent({ chains: [], actions: [
    { id: 1, type: "input-packet-process", port: "P0", mods: [{ k: "stripping", val: "vlan" }, { k: "maxlen", val: "64" }] },
    { id: 2, type: "linkpairs", portA: "P1", portB: "P2" },
  ] }, makeT("en"));
  check("an ingress action names what it does, not how many things it does",
    acts[0].includes("P0") && acts[0].includes("stripping vlan") && acts[0].includes("maxlen 64"), acts[0]);
  check("and says it happens before the chains", /before any chain/.test(acts[0]));
  check("a link pair is described as the pair it is",
    acts[1].includes("P1-P2"), acts[1]);
  check("an empty action does not pretend to do something",
    C.inferIntent({ chains: [], actions: [{ id: 1, type: "input-packet-process", port: "P0", mods: [] }] },
      makeT("en"))[0].includes("nothing set yet"));
}

/* ---------- XML formatting ---------- */
group("formatXml");
{
  const out = C.formatXml('<configSet reboot="no"><ifcfgs><find role="management"><enable>True</enable></find></ifcfgs></configSet>');
  check("nested indentation", out.includes("  <ifcfgs>") && out.includes('    <find role="management">') && out.includes("      <enable>True</enable>"));
  check("complete element stays on one line", out.includes("<enable>True</enable>"));
  let threw = false; try { C.formatXml("<a><b></a>"); } catch { threw = true; }
  check("unbalanced XML throws", threw);
}

/* ---------- system status ---------- */
group("factory reset");
check("factory management address is the documented one", C.FACTORY_MGMT_IP === "192.168.1.150");
check("it is a bare address, not a URL", /^\d+\.\d+\.\d+\.\d+$/.test(C.FACTORY_MGMT_IP));
// the address is composed into the UI, so it must not be duplicated in the
// translations - a second copy is one that can drift
for (const lang of ["en", "zh-TW"])
  check(`${lang} strings do not hardcode the address`,
    !Object.values(I18N[lang]).some((v) => typeof v === "string" && v.includes(C.FACTORY_MGMT_IP)));
// the reset takes the address with it, so the restore wording ("reload this
// page") would be wrong here; factory gets its own body
for (const lang of ["en", "zh-TW"])
  check(`${lang} has a factory-specific wait body`,
    !!I18N[lang]["set.factoryResetBody"] && I18N[lang]["set.factoryResetBody"] !== I18N[lang]["set.bkRestoringBody"]);
for (const lang of ["en", "zh-TW"])
  check(`${lang} has the factory address label`, !!I18N[lang]["set.factoryIp"]);

group("device request methods");
{
  // The device's Django routes are individually wrapped in csrf_exempt in
  // urls.py. update_download_update is not, so a POST to it is rejected by
  // CsrfViewMiddleware before the handler runs and the install never starts.
  // Its siblings (update_check, update_download, update_download_check) are all
  // plain GETs; this one has to be too.
  const jsx = readFileSync(new URL("./GrismStudio.jsx", import.meta.url), "utf8");
  const call = jsx.match(/fetch\("\/grism\/task\/update_download_update"[^)]*\)/);
  check("update_download_update is still called", !!call);
  check("update_download_update is not POSTed", !!call && !/method:\s*"POST"/.test(call[0]));
}

group("internal accounts");
// the device's own account, taken straight from its /list_user answer
check("sha256Hex matches the device's hash for packetx",
  (await C.sha256Hex("packetx")) === "5ba7ad93c78984d6afe97b5e053865165019fd10e1faaec2e5831731ded3a30c");
check("sha256Hex is lowercase hex of the right length",
  /^[0-9a-f]{64}$/.test(await C.sha256Hex("anything")));
check("sha256Hex of the empty string is the known digest",
  (await C.sha256Hex("")) === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

// GET /list_user answers with pairs: {"user_list":[["packetx","admin"], ...]}
{
  const real = '{"user_list":[["packetx","admin"],["guest","view"],["heartbeat","admin"]]}';
  const u = C.parseUserList(real);
  check("parses the device's real payload", u.length === 3 && u[0].name === "packetx" && u[0].role === "admin");
  check("accepts an already-parsed object", C.parseUserList(JSON.parse(real)).length === 3);
  check("drops malformed rows rather than rendering undefined",
    C.parseUserList('{"user_list":[["ok","admin"],[],["",""],null,["fine"]]}')
      .every((x) => typeof x.name === "string" && x.name && typeof x.role === "string"));
  check("survives junk", C.parseUserList("not json").length === 0 && C.parseUserList({}).length === 0);
}

// Changing your own password ends the session on the device, so the reply can be
// a success or an Unauthorized for the same outcome. Both mean it worked.
for (const lang of ["en", "zh-TW"])
  check(`${lang} says the password change signs you out`, !!I18N[lang]["set.acctChangedSignOut"]);

check("packetx is the account the device refuses to delete", C.UNDELETABLE_USER === "packetx");

{
  const have = [{ name: "packetx", role: "admin" }];
  check("a new account needs a name", !!C.newUserProblem("", "p", "p", have));
  check("a new account needs a password", !!C.newUserProblem("bob", "", "", have));
  check("passwords must match", !!C.newUserProblem("bob", "a", "b", have));
  check("duplicate names are refused, case-insensitively", !!C.newUserProblem("PacketX", "a", "a", have));
  check("odd characters are refused", !!C.newUserProblem("bob smith", "a", "a", have));
  check("a good account passes", C.newUserProblem("bob.smith-1_x", "a", "a", have) === null);
}
{
  const me = "guest";
  check("changing a password needs the current one", !!C.changePasswordProblem("", "new", "new", me));
  check("and a new one", !!C.changePasswordProblem("old", "", "", me));
  check("which must be confirmed", !!C.changePasswordProblem("old", "a", "b", me));
  check("and must actually differ", !!C.changePasswordProblem("same", "same", "same", me));
  check("a good change passes", C.changePasswordProblem("old", "new", "new", me) === null);
  // The X-PacketX-Username cookie is HttpOnly, so document.cookie never sees it.
  // Reading it there and defaulting to packetx aimed every password change at
  // that account instead of the user's own. Without a name, refuse outright.
  for (const bad of [undefined, null, "", "   "])
    check(`no account name (${JSON.stringify(bad)}) blocks the change`,
      !!C.changePasswordProblem("old", "new", "new", bad));
}
// with RADIUS or TACACS+ on, these accounts are only a fallback - the UI says so
check("no note when only internal auth is used", C.internalAccountsNoteKey({}) === null);
// One wording whichever is on: naming the server, and a separate "both" variant,
// read as though internal and remote accounts worked side by side.
for (const on of [{ radiusLogin: true }, { tacacsLogin: true }, { radiusLogin: true, tacacsLogin: true }])
  check(`remote auth ${JSON.stringify(on)} gets the single note`,
    C.internalAccountsNoteKey(on) === "set.acctFallbackOnly");
for (const lang of ["en", "zh-TW"]) {
  for (const k of ["set.acctFallbackOnly", "set.acctSignIn"]) check(`${lang} has ${k}`, !!I18N[lang][k]);
  for (const k of ["set.acctFallbackRadius", "set.acctFallbackTacacs", "set.acctFallbackBoth"])
    check(`${lang} no longer carries ${k}`, !I18N[lang][k]);
}
// The device answers an unauthenticated account request with 404, not 401. That
// was once read as "this firmware has no account management", which turned a
// lapsed session into a message saying the feature did not exist.
check("404 means sign in again, not unsupported", C.accountsErrorKey(404) === "set.acctSignIn");
check("401 likewise", C.accountsErrorKey(401) === "set.acctSignIn");
check("other statuses report themselves", C.accountsErrorKey(500) === null && C.accountsErrorKey(503) === null);
for (const lang of ["en", "zh-TW"])
  check(`${lang} no longer claims the feature is unsupported`, !I18N[lang]["set.acctUnsupported"]);

group("system status");
{
  const s = { uname: "Linux GRISM-HL1 5.15.72-mb5500-release-v1.1.2 #1 SMP PREEMPT Wed Aug 5 03:09:28 UTC 2026 aarch64",
    uptime_s: 77251, cpu_usage: [10.76, 8.0, 15.38, 15.38, 6.38, 10.2, 10.42, 12.0, 8.33],
    mem_usage: [16420288, 3300032],
    disk_usage: [["/dev/root", "/", 59340724, 1885284, 54408632, "4%%"]],
    process: [["grism-core", 896, 4, "S", "3.0g", "20.0"], ["grism-other", 830, 0, "S", "3.0g", "0.0"]],
    Rpsu: [{ Index: 1, Present: true, Powered: true }, { Index: 2, Present: false, Powered: false }],
    Fan: [{ Index: 1, Rear: false, Fault: false, Speed: 5000 }],
    Temperature: { "Overheat": "N/A", "CPU: SoC Remote": "61.88 C" } };
  const info = C.summarizeStatus(s);
  check("host parsed from uname", info.u.host === "GRISM-HL1");
  check("arch parsed from uname", info.u.arch === "aarch64");
  check("all cpu cores kept", info.cpu.length === 9);
  check("cpu average computed", Math.abs(info.cpuOverall - 10.76) < 0.5);
  check("memory used = total - free", info.memUsed === 16420288 - 3300032);
  check("memory free kept", info.memFree === 3300032);
  check("memory percentage from used", info.memPct === 80);
  check("memory humanised", C.fmtKB(info.memTotal) === "15.7 GB");
  check("process core exposed", info.procs[0].core === 4);
  check("disk %% cleaned to %", info.disks[0].pctText === "4%");
  check("processes sorted by cpu", info.procs[0].cpu === 20);
  check("PSUs parsed", info.psus.length === 2 && info.psus[0].Powered === true);
  check("fan parsed", info.fans[0].Speed === 5000 && info.fans[0].Fault === false);
  check("named temperatures", info.temps.length === 2);
  check("uptime from seconds", info.uptime === "21h 27m 31s");
  check("null status yields null", C.summarizeStatus(null) === null);
  check("uptime under a minute", C.fmtUptime(45) === "45s");
  check("uptime across days", C.fmtUptime(90061) === "1d 1h 1m 1s");
  check("uptime across years", C.fmtUptime(31626061).startsWith("1y"));
  check("uptime zero", C.fmtUptime(0) === "0s");
}

/* ---------- system / packet / service settings ---------- */
group("settings builders");
{
  const t = C.buildArgsConfigSet({ timeServer: "216.239.35.0", timeServer2: "" });
  check("args wrapper", t.includes('<configSet reboot="no">') && t.includes("<args>"));
  check("time servers written", t.includes("<timeServer>216.239.35.0</timeServer>"));
  check("empty value still written", t.includes("<timeServer2></timeServer2>"));
  check("booleans become True/False", C.buildArgsConfigSet({ deduplication: true }).includes("<deduplication>True</deduplication>"));
  check("false booleans too", C.buildArgsConfigSet({ deduplication: false }).includes("<deduplication>False</deduplication>"));
  check("values escaped", C.buildArgsConfigSet({ resolveNameServer: "a&b" }).includes("a&amp;b"));
  const fr = C.buildArgsConfigSet({ ipFragmentCorrelation: true, tcpSegmentDataReassemble: false, sctpDataChunkReconstruct: true });
  check("all three reassembly flags", fr.includes("<ipFragmentCorrelation>True") && fr.includes("<tcpSegmentDataReassemble>False") && fr.includes("<sctpDataChunkReconstruct>True"));

  const tun = C.buildInTunnelsConfigSet({ GTP: false, GRE: true, VXLAN: false });
  check("in-tunnels nested under filters", tun.includes("<filters>") && tun.includes("<in-tunnels>"));
  check("tunnel flags written", tun.includes("<GTP>False</GTP>") && tun.includes("<GRE>True</GRE>"));

  const cfg = { services: [{ name: "sshd", description: "SSHD Service", enable: true },
    { name: "lldpd", description: "LLDPD Service", enable: false }] };
  const svc = C.parseServices(cfg);
  check("services parsed", svc.length === 2 && svc[0].name === "sshd");
  // internal daemons are not offered as toggles
  const withHidden = C.parseServices({ services: [{ name: "grism" }, { name: "bsem_wd_feed" },
    { name: "telnetd" }, { name: "sshd" }, { name: "ftpd" },
    { name: "packetx_trap_dispatcher" }, { name: "statistics_backup" }] });
  check("internal services hidden", withHidden.map((x) => x.name).join() === "grism,sshd");
  check("service enable read", svc[0].enable === true && svc[1].enable === false);
  check("description read", svc[0].description === "SSHD Service");
  const toggled = svc.map((x) => x.name === "lldpd" ? { ...x, enable: true } : x);
  check("toggled service detected", C.changedServices(svc, toggled).map((x) => x.name).join() === "lldpd");
  check("no toggles means nothing to send", C.changedServices(svc, svc).length === 0);
  const sx = C.buildServicesConfigSet([{ name: "lldpd", enable: true }]);
  check("service targeted by name", sx.includes('<find name="lldpd">'));
  check("service enable written", sx.includes("<enable>True</enable>"));

  const zones = C.parseTimezones({ timezone: [{ None: 0 }, { "Africa/Abidjan": 0 }, { "Asia/Taipei": 0 }] });
  check("timezones flattened", zones.length === 3 && zones[2] === "Asia/Taipei");
  check("missing timezone payload tolerated", C.parseTimezones(undefined).length === 0);
  // the entry flagged with 1 is the zone in use
  const tzp = { timezone: [{ None: 0 }, { "Africa/Abidjan": 0 }, { "Asia/Taipei": 1 }] };
  check("active timezone detected", C.currentTimezone(tzp) === "Asia/Taipei");
  check("list still holds every zone", C.parseTimezones(tzp).length === 3);
  check("nothing flagged yields empty", C.currentTimezone({ timezone: [{ None: 0 }] }) === "");
  check("missing payload yields empty", C.currentTimezone(undefined) === "");
}

group("xml highlighting");
{
  const src = '<find name="P8"><enable>True</enable></find>';
  const toks = C.tokenizeXml(src);
  check("tokens reconstruct the input exactly", toks.map((t) => t.text).join("") === src);
  check("tag names identified", toks.some((t) => t.type === "tag" && t.text === "find"));
  check("attribute names identified", toks.some((t) => t.type === "attr" && t.text === "name"));
  check("attribute values identified", toks.some((t) => t.type === "value" && t.text === '"P8"'));
  check("element text identified", toks.some((t) => t.type === "text" && t.text === "True"));
  const c2 = C.tokenizeXml("<!-- note --><a/>");
  check("comments identified", c2.some((t) => t.type === "comment" && t.text === "<!-- note -->"));
  check("self-closing tags handled", c2.map((t) => t.text).join("") === "<!-- note --><a/>");
  check("empty input yields nothing", C.tokenizeXml("").length === 0);
  const big = C.tokenizeXml('<configSet reboot="no">\n  <args><a>1</a></args>\n</configSet>');
  check("whitespace preserved", big.map((t) => t.text).join("").includes("\n  "));
}

/* ---------- traffic generator defaults ---------- */
group("traffic generator defaults");
{
  const macs = { port_mac: [[0, "40:60:5a:02:df:66", "P0"], [1, "40:60:5a:02:df:67", "P1"],
    [2, "40:60:5a:02:df:68", "P2"]],
    management_port_mac: [[0, "40:60:5a:02:df:62", "M0"]] };
  const parsed = C.parsePortMacs(macs);
  check("port macs parsed", parsed.length === 3 && parsed[0].port === "P0");
  check("management macs are not included", !parsed.some((r) => r.port.startsWith("M")));
  const d = C.trafficGenDefaults(macs);
  check("packet size default", d.packet_size === "512");
  check("payload default", d.payload_text === "packetx");
  check("first two macs used", d.src_mac === "40:60:5a:02:df:66" && d.dest_mac === "40:60:5a:02:df:67");
  check("ip defaults", d.src_ip === "10.0.1.99" && d.dest_ip === "10.0.1.100");
  check("port defaults", d.src_port === "5000" && d.dest_port === "5001");
  check("macs omitted when unavailable", C.trafficGenDefaults(undefined).src_mac === undefined);
  check("defaults still usable without macs", C.trafficGenDefaults({}).packet_size === "512");
  check("every default names a real field",
    Object.keys(d).every((k) => C.INPUT_FIELD_INDEX[k] || k === "protocol"));
}

/* ---------- output and filter labels ---------- */
group("xml validation");
{
  check("well-formed xml passes", C.xmlError('<configSet reboot="no"><args><a>1</a></args></configSet>') === "");
  check("self-closing tags pass", C.xmlError("<a><b/></a>") === "");
  check("empty input is reported", /empty/.test(C.xmlError("")));
  check("whitespace-only input is reported", /empty/.test(C.xmlError("   \n  ")));
  check("text that isn't xml is reported", /start with/.test(C.xmlError("plain text")));
  check("mismatched tags are reported", C.xmlError("<a><b></a>") !== "");
  check("unclosed tags are reported", C.xmlError("<a><b/>") !== "");
  check("a valid document formats cleanly",
    C.formatXml("<a><b/></a>") === "<a>\n  <b/>\n</a>" && C.xmlError("<a><b/></a>") === "");
}

group("grism document validation");
{
  const good = '<run><output id="1"><port>P1</port></output><chain><in>P0</in><out>O1</out></chain></run>';
  check("a valid run has no problems", C.grismXmlProblems(good).length === 0);
  check("a non-run document is reported", C.grismXmlProblems("<notrun/>").some((p) => /run/.test(p.msg)));
  check("unparseable input is reported", C.grismXmlProblems("<a><b></a>").length > 0);
  check("problems carry a scope", C.grismXmlProblems("<notrun/>")[0].scope !== undefined);
  check("an empty run is accepted", C.grismXmlProblems("<run></run>").length === 0);
  check("malformed xml is reported before any document checks",
    C.grismXmlProblems("<run><chain>").length > 0);
}

group("labels");
{
  check("custom output shows name and port", C.outputLabel({ id: 1, name: "to IDS", port: "P4" }) === "to IDS · P4");
  check("unnamed output falls back to its port", C.outputLabel({ id: 1, port: "P4" }) === "P4");
  check("alt is used when there is no name", C.outputLabel({ id: 1, alt: "mirror", port: "P2" }) === "mirror · P2");
  check("a nameless portless output yields nothing", C.outputLabel({ id: 1 }) === "");
  check("storage outputs read the same way", C.outputLabel({ id: 777, name: "capture", port: "H1" }) === "capture · H1");
  check("named filter shows its name", C.filterLabel({ id: 12, name: "web" }) === "F12 — web");
  check("unnamed filter shows just the id", C.filterLabel({ id: 3 }) === "F3");
  check("filter alt is used as a name", C.filterLabel({ id: 4, alt: "dns" }) === "F4 — dns");
}

/* ---------- packet capture ---------- */
group("packet capture");
{
  const xml = C.buildInstantCapture({ ports: ["P1"], filter: "F1", stl: 5, storage: "H1", dir: "snapshot" });
  check("matches the instant-capture shape",
    xml === '<run><output id="777" stl="5"><port>H1</port><dir>snapshot</dir></output>' +
            '<chain><in>P1</in><fid>F1</fid><out>O777</out></chain></run>');
  check("several ingress ports are joined",
    C.buildInstantCapture({ ports: ["P1", "P2"], stl: 5, storage: "H1", dir: "snapshot" }).includes("<in>P1,P2</in>"));
  check("no filter means no fid element",
    !C.buildInstantCapture({ ports: ["P1"], filter: "", stl: 5, storage: "H1", dir: "snapshot" }).includes("<fid>"));
  check("seconds to live written as an attribute",
    C.buildInstantCapture({ ports: ["P1"], stl: 30, storage: "H1", dir: "d" }).includes('stl="30"'));
  check("storage and directory written",
    C.buildInstantCapture({ ports: ["P1"], stl: 5, storage: "H2", dir: "caps" }).includes("<port>H2</port>"));

  check("a complete request is clean",
    C.captureProblems({ ports: ["P1"], stl: 5, storage: "H1", dir: "snapshot" }).length === 0);
  check("no interfaces reported", C.captureProblems({ ports: [], stl: 5, storage: "H1", dir: "d" }).length > 0);
  check("no storage reported", C.captureProblems({ ports: ["P1"], stl: 5, storage: "", dir: "d" }).length > 0);
  check("zero seconds reported", C.captureProblems({ ports: ["P1"], stl: 0, storage: "H1", dir: "d" }).length > 0);

  const st = C.parseStorages({ storages: [{ name: "H1", enable: true, usage: 100, available: 900 },
    { name: "H2", enable: false }] });
  check("only enabled volumes offered", st.length === 1 && st[0].name === "H1");
  check("usage figures read", st[0].usage === 100 && st[0].available === 900);

  const files = C.parseStorageFiles({ file_list: [
    [1, "raw_20260914162733_20260914162740_761484.pcap", 2001, "2026-09-14 16:27:38"]] },
    { storage: "H1", dir: "snapshot" });
  check("file row parsed", files[0].name.endsWith(".pcap") && files[0].bytes === 2001);
  check("modified time kept", files[0].modified === "2026-09-14 16:27:38");
  check("download link built",
    files[0].href === "/grism/task/download_storage_file?name=H1&dir=snapshot&filename=raw_20260914162733_20260914162740_761484.pcap");
  check("newest file first", C.parseStorageFiles({ file_list: [
    [1, "a.pcap", 1, "2026-09-14 10:00:00"], [2, "b.pcap", 1, "2026-09-14 11:00:00"]] })[0].name === "b.pcap");
  check("empty listing tolerated", C.parseStorageFiles({}).length === 0);
  // a .tmp file is mid-write and must not be offered for download
  check("tmp files flagged as partial", C.isPartialCapture("raw_2026.pcap.tmp") === true);
  check("uppercase extension flagged", C.isPartialCapture("raw.PCAP.TMP") === true);
  check("finished captures are not flagged", C.isPartialCapture("raw_2026.pcap") === false);
  check("tmp inside the name is not flagged", C.isPartialCapture("tmp_capture.pcap") === false);
  check("blank names tolerated", C.isPartialCapture("") === false && C.isPartialCapture(undefined) === false);
  // listing a volume without a directory answers a bare array of directories
  const dirRows = [[0, "in", 40, "2026-09-13 16:31:34"], [0, "out", 40, "2026-09-13 16:31:34"],
    [0, "snapshot", 80, "2026-09-14 18:40:41"]];
  check("bare arrays are accepted", C.parseStorageFiles(dirRows).length === 3);
  // the first field is a kind flag: 0 for a directory, 1 for a file
  const mixed = C.parseStorageFiles({ file_list: [
    [1, "b.pcap", 10, "2026-09-14 10:00:00"], [0, "sub", 40, "2026-09-13 16:31:34"],
    [1, "a.pcap", 10, "2026-09-14 11:00:00"]] }, { storage: "H1", dir: "in" });
  check("directories are flagged", mixed.find((r) => r.name === "sub").isDir === true);
  check("files are not flagged", mixed.find((r) => r.name === "a.pcap").isDir === false);
  check("directories sort before files", mixed[0].name === "sub");
  check("files stay newest first", mixed[1].name === "a.pcap");
  check("directories have no download link", mixed[0].href === "");
  check("only directories are offered as dirs", C.parseStorageDirs({ file_list: [
    [1, "x.pcap", 1, "t"], [0, "sub", 1, "t"]] }).join() === "sub");
  // walking in and out of directories
  check("entering appends to the path", C.joinDir("in", "sub") === "in/sub");
  check("entering from the root", C.joinDir("", "in") === "in");
  check("going up drops the last segment", C.parentDir("in/sub") === "in");
  check("going up from the top reaches the root", C.parentDir("in") === "");
  check("crumbs walk the path", C.dirCrumbs("in/sub").map((c) => c.path).join() === "in,in/sub");
  check("the root has no crumbs", C.dirCrumbs("").length === 0);
  check("directory names extracted and sorted", C.parseStorageDirs(dirRows).join() === "in,out,snapshot");
  check("missing directory listing tolerated", C.parseStorageDirs(undefined).length === 0);
  check("storage paths joined", C.storagePath("H1", "in", "a.pcap") === "H1/in/a.pcap");
  check("storage paths tolerate stray slashes", C.storagePath("/H1/", "/in/", "a.pcap") === "H1/in/a.pcap");
  check("slashes are not doubled in the link",
    C.captureFileHref("/H1/", "/snapshot/", "x.pcap") === "/grism/task/download_storage_file?name=H1&dir=snapshot&filename=x.pcap");
}

/* ---------- firmware update ---------- */
group("firmware update");
{
  const p = C.parseDownloadProgress("37404672,81382331");
  check("byte counts parsed", p.done === 37404672 && p.total === 81382331);
  check("ratio computed", Math.abs(p.ratio - 37404672 / 81382331) < 1e-9);
  check("partial download is not complete", p.complete === false);
  check("matching counts mean complete", C.parseDownloadProgress("81382331,81382331").complete === true);
  check("a zero total is never complete", C.parseDownloadProgress("0,0").complete === false);
  check("ratio is safe when the total is zero", C.parseDownloadProgress("0,0").ratio === 0);
  check("ratio never exceeds one", C.parseDownloadProgress("200,100").ratio === 1);
  check("junk input is tolerated", C.parseDownloadProgress("").total === 0);

  /* Where releases come from is a setting now: two fields in <args>, with a
     fallback for a device whose config has never carried them. */
  check("the server comes out of the config",
    JSON.stringify(C.parseUpdateServer({ args: { updateServer: "192.168.1.5", updateServerPort: 1069 } })) ===
    '{"server":"192.168.1.5","port":"1069"}');
  check("a config without one falls back to the default",
    C.parseUpdateServer({}).server === "update.packetx.biz" &&
    C.parseUpdateServer({ args: { updateServer: "  " } }).port === "1069");
  check("a host or an IP is accepted",
    C.updateServerProblem({ server: "update.packetx.biz", port: "1069" }) === "" &&
    C.updateServerProblem({ server: "192.168.1.5", port: "1069" }) === "");
  check("an address that is neither is refused",
    C.updateServerProblem({ server: "", port: "1069" }) !== "" &&
    C.updateServerProblem({ server: "a b", port: "1069" }) !== "" &&
    C.updateServerProblem({ server: "http://x/", port: "1069" }) !== "");
  check("the port has to be a port",
    C.updateServerProblem({ server: "x.y", port: "" }) !== "" &&
    C.updateServerProblem({ server: "x.y", port: "0" }) !== "" &&
    C.updateServerProblem({ server: "x.y", port: "70000" }) !== "" &&
    C.updateServerProblem({ server: "x.y", port: "80" }) === "");

  check("a version string is an available update",
    C.parseUpdateCheck("6.5.260715").version === "6.5.260715");
  check("surrounding whitespace tolerated", C.parseUpdateCheck("  6.5.1  ").version === "6.5.1");
  check("a four-part version is an update too",
    C.parseUpdateCheck("6.5.260923.2").version === "6.5.260923.2");
  /* A check that was made and found nothing, and one that could not be made,
     are different answers: reading the second as the first is how a device
     that could not reach the release server reported itself as up to date. */
  check("the server was asked and had nothing newer",
    C.parseUpdateCheck("already the latest version").upToDate === true &&
    C.parseUpdateCheck("already the latest version").error === undefined);
  check("a failed check carries its reason",
    C.parseUpdateCheck("cannot reach the update server: timed out", false).error ===
      "cannot reach the update server: timed out" &&
    C.parseUpdateCheck("cannot reach the update server: timed out", false).upToDate === undefined);
  check("a release with no image for this model is a failure, not silence",
    C.parseUpdateCheck("release 6.5.260923 has no image for G8S", false).error ===
      "release 6.5.260923 has no image for G8S");
  check("an empty failure still reports something", typeof C.parseUpdateCheck("", false).error === "string");
}

/* ---------- flow service catalogue ---------- */
group("flow service catalogue");
{
  const src = "TCP/443,UDP/443,HTTPS;TCP/80,UDP/80,HTTP;UDP/53,TCP/53,DNS;TCP/22,SSH";
  const svc = C.parseFlowServices(src);
  check("every service parsed", svc.length === 4);
  check("name taken from the last field", svc[0].name === "HTTPS");
  check("protocol/port pairs parsed", svc[0].ports.map((p) => p.proto + "/" + p.port).join() === "TCP/443,UDP/443");
  check("single-port services work", svc[3].name === "SSH" && svc[3].ports.length === 1);
  check("round trip is exact", C.buildFlowServices(svc) === src);
  check("blank input yields nothing", C.parseFlowServices("").length === 0);
  check("incomplete services are dropped on write",
    C.buildFlowServices([{ name: "", ports: [{ proto: "TCP", port: 1 }] }, { name: "X", ports: [] }]) === "");
  check("unnamed service reported", C.flowServiceProblems([{ name: " ", ports: [{ proto: "TCP", port: 80 }] }]).length > 0);
  check("service without ports reported", C.flowServiceProblems([{ name: "X", ports: [] }]).length > 0);
  check("invalid port reported", C.flowServiceProblems([{ name: "X", ports: [{ proto: "TCP", port: 70000 }] }]).length > 0);
  check("a valid catalogue is clean", C.flowServiceProblems(svc).length === 0);
  // a freshly added service must be usable, not rejected on sight
  check("new service starts on a valid port", C.mkFlowService().ports[0].port === 80);
  check("new service only needs a name", C.flowServiceProblems([{ ...C.mkFlowService(), name: "X" }]).length === 0);
}

/* ---------- login authentication ---------- */
group("login authentication");
{
  const cfg = { views: { radiusLogin: false, radiusHost: " ", radiusPort: 1812, radiusSecret: " ",
    tacacsLogin: false, tacacsHost: " ", tacacsPort: 49, tacacsSecret: " " } };
  const v = C.parseViews(cfg);
  check("blank hosts trimmed", v.radiusHost === "" && v.tacacsHost === "");
  check("ports read", v.radiusPort === 1812 && v.tacacsPort === 49);
  check("switches read", v.radiusLogin === false && v.tacacsLogin === false);
  check("missing views default sensibly", C.parseViews({}).radiusPort === 1812 && C.parseViews({}).tacacsPort === 49);

  const xml = C.buildViewsConfigSet(v);
  check("views block emitted", xml.includes("<views>") && xml.includes("</views>"));
  check("all eight fields written",
    ["radiusLogin", "radiusHost", "radiusPort", "radiusSecret",
     "tacacsLogin", "tacacsHost", "tacacsPort", "tacacsSecret"].every((k) => xml.includes("<" + k + ">")));
  check("booleans written as True/False", xml.includes("<radiusLogin>False</radiusLogin>"));
  check("secrets escaped", C.buildViewsConfigSet({ ...v, radiusSecret: "a&b" }).includes("a&amp;b"));

  check("disabled servers are not validated", C.viewsProblems(v).length === 0);
  check("enabled server needs an address",
    C.viewsProblems({ ...v, radiusLogin: true }).some((p) => /address/.test(p.msg)));
  check("hostnames are accepted",
    C.viewsProblems({ ...v, radiusLogin: true, radiusHost: "radius.example.com" }).length === 0);
  check("IP addresses are accepted",
    C.viewsProblems({ ...v, tacacsLogin: true, tacacsHost: "10.0.0.1" }).length === 0);
  check("invalid port reported",
    C.viewsProblems({ ...v, radiusLogin: true, radiusHost: "10.0.0.1", radiusPort: 70000 }).length > 0);
  // the device authenticates against one external server at a time
  check("enabling both is reported", C.viewsProblems({ ...v, radiusLogin: true, radiusHost: "1.1.1.1",
    tacacsLogin: true, tacacsHost: "2.2.2.2" }).some((p) => /not both/.test(p.msg)));
  check("either one alone is fine", C.viewsProblems({ ...v, tacacsLogin: true, tacacsHost: "2.2.2.2" }).length === 0);
}

/* ---------- flow engine ---------- */
group("flow settings");
{
  const cfg = { args: { flow: true, flowv6: true, flowCacheBaseSize: 150000, flowv6TableSize: 500000 } };
  const f = C.parseFlowArgs(cfg);
  check("flow switches read", f.flow === true && f.flowv6 === true);
  check("table sizes read", f.flowCacheBaseSize === 150000 && f.flowv6TableSize === 500000);
  check("missing args default off", C.parseFlowArgs({}).flow === false);
  check("missing sizes default to zero", C.parseFlowArgs({}).flowCacheBaseSize === 0);

  const xml = C.buildArgsConfigSet(Object.fromEntries(C.FLOW_ARGS.map((k) => [k, f[k]])));
  check("flow args written as booleans", xml.includes("<flow>True</flow>") && xml.includes("<flowv6>True</flowv6>"));
  check("table sizes written", xml.includes("<flowCacheBaseSize>150000</flowCacheBaseSize>"));
  check("v6 table size written", xml.includes("<flowv6TableSize>500000</flowv6TableSize>"));
  check("only flow args are sent", !xml.includes("deduplication") && !xml.includes("timeServer"));

  check("a valid flow config is clean", C.flowProblems(f).length === 0);
  check("tracking with a zero table is reported", C.flowProblems({ flow: true, flowCacheBaseSize: 0 }).length > 0);
  check("v6 table checked independently",
    C.flowProblems({ flowv6: true, flowv6TableSize: 0 }).some((p) => /IPv6/.test(p.msg)));
  check("sizes are ignored when tracking is off", C.flowProblems({ flow: false, flowCacheBaseSize: 0 }).length === 0);
  // the timeouts still belong to <netflow> on the wire even though the UI groups
  // them with the flow settings
  check("timeouts stay inside the netflow block",
    C.FLOW_TIMEOUTS.every((k) => C.buildLoggingConfigSet(C.parseLogging({})).includes("<" + k + ">")));
}

/* ---------- logging (NetFlow / syslog / DPI) ---------- */
group("logging");
{
  const cfg = { log: { enable: true, type: "netflow",
    netflow: { port: "M0", engine_type: 0, engine_id: 0, active_timeout: 7200, inactive_timeout: 60,
      tcp_fin_rst_timeout: 5, target: [{ enable: false, version: 9, dip: " ", dport: 9995, interfaces: "all", filter: " " }] },
    syslog: { enable: false, port: "M0", target: [
      { type: "system", enable: false, dip: " ", dport: 514, interfaces: "all", filter: " ", subtype: { common: true } },
      { type: "matched", enable: true, dip: "10.0.0.1", dport: 514, interfaces: "all", filter: "", subtype: { sip: true, dip: true } }] } },
    dpidnslog: { enable: true, syslog: { port: "M0", active_timeout: 30, inactive_timeout: 10,
      response_only: false, noerror_only: false,
      target: [{ enable: true, dip: "192.168.1.12", dport: 514, interfaces: "P1,P14", filter: "F1001" }] } },
    dpihttplog: { enable: false, syslog: { port: "M0", target: [{ enable: false, dip: " ", dport: 514, interfaces: "all", filter: " " }] } },
    dpissllog: { enable: false, syslog: { port: "M0", ja3: false, ja4: true,
      target: [{ enable: false, dip: " ", dport: 514, interfaces: "all", filter: " " }] } } };
  const L = C.parseLogging(cfg);
  check("flow export globals read", L.enable === true && L.type === "netflow");
  check("blank values trimmed", L.netflow.targets[0].dip === "" && L.netflow.targets[0].filter === "");
  check("netflow timeouts read", L.netflow.active_timeout === 7200 && L.netflow.tcp_fin_rst_timeout === 5);
  check("netflow version read", L.netflow.targets[0].version === 9);
  check("syslog target types read", L.syslog.targets.map((t) => t.type).join() === "system,matched");
  check("system subtypes read", L.syslog.targets[0].subtype.common === true);
  check("matched subtypes read", L.syslog.targets[1].subtype.sip === true);
  check("subtype keys match the target type",
    Object.keys(L.syslog.targets[0].subtype).join() === C.SYSLOG_SYSTEM_SUBTYPES.join());
  check("dns settings read", L.dns.enable === true && L.dns.active_timeout === 30);
  check("dns target read", L.dns.targets[0].dip === "192.168.1.12" && L.dns.targets[0].interfaces === "P1,P14");
  check("tls fingerprints read", L.ssl.ja3 === false && L.ssl.ja4 === true);
  check("missing logging tolerated", C.parseLogging({}).netflow.targets.length === 0);

  const xml = C.buildLoggingConfigSet(L);
  check("every block emitted", ["<log>", "<netflow>", "<dpidnslog>", "<dpihttplog>", "<dpissllog>"].every((tg) => xml.includes(tg)));
  check("helper log is not emitted", !xml.includes("dpihelplog"));
  check("udp and inline-file are not emitted", !xml.includes("<udp>") && !xml.includes("inline-file"));
  check("netflow target written", xml.includes("<dport>9995</dport>") && xml.includes("<version>9</version>"));
  check("syslog target type written", xml.includes("<type>system</type>") && xml.includes("<type>matched</type>"));
  check("system subtypes written", xml.includes("<alert_power_failure>False</alert_power_failure>"));
  check("matched subtypes written", xml.includes("<find_content>False</find_content>"));
  check("dns extras written", xml.includes("<response_only>False</response_only>") && xml.includes("<noerror_only>False</noerror_only>"));
  check("tls fingerprints written", xml.includes("<ja3>False</ja3>") && xml.includes("<ja4>True</ja4>"));
  check("dns values preserved", xml.includes("<dip>192.168.1.12</dip>") && xml.includes("<filter>F1001</filter>"));

  check("a valid configuration is clean", C.loggingProblems(L).length === 0);
  check("enabled target without an address is reported", C.loggingProblems({
    netflow: { targets: [{ enable: true, dip: "", dport: 9995 }] } }).length > 0);
  check("bad collector address is reported", C.loggingProblems({
    netflow: { targets: [{ enable: true, dip: "999.1.1.1", dport: 9995 }] } }).length > 0);
  check("disabled targets are not validated", C.loggingProblems({
    netflow: { targets: [{ enable: false, dip: "", dport: 0 }] } }).length === 0);
  check("new targets carry sensible defaults",
    C.mkNetflowTarget().dport === 9995 && C.mkLogTarget().dport === 514);
  check("new syslog target gets its subtype keys",
    Object.keys(C.mkSyslogTarget("matched").subtype).join() === C.SYSLOG_MATCHED_SUBTYPES.join());
  // a new target should carry something useful straight away
  check("new matched target has every field on",
    C.SYSLOG_MATCHED_SUBTYPES.every((k) => C.mkSyslogTarget("matched").subtype[k] === true));
  check("new system target reports the usual events", (() => {
    const st = C.mkSyslogTarget("system").subtype;
    return st.common && st.alert_heartbeat_miss && st.alert_dropped_packets;
  })());
  check("new system target reports every event",
    C.SYSLOG_SYSTEM_SUBTYPES.every((k) => C.mkSyslogTarget("system").subtype[k] === true));
}

group("log source and scope");
{
  const cfg = { interfaces: [
      { type: "XFI", ports: [{ name: "P8" }, { name: "P9" }] },
      { type: "LOOP", ports: [{ name: "P12" }, { name: "P13" }] },
      { type: "VPORT", ports: [{ name: "V0" }] }],
    ifcfgs: [{ role: "management", name: "M0", enable: true },
      { role: "management1", name: "M1", enable: false },
      { role: "management2", name: "M2", enable: true },
      { role: "ft", name: "P1", enable: false }] };
  check("LOOP ports are not data ports", C.dataPortNames(cfg).join() === "V0,P8,P9");
  check("LOOP ports can be included for scoping",
    C.dataPortNames(cfg, { includeLoop: true }).join() === "V0,P8,P9,P12,P13");
  check("source ports never include LOOP", !C.logSourcePorts(cfg).includes("P12"));
  check("only enabled management interfaces offered", C.managementPortNames(cfg).join() === "M0,M2");
  check("source ports are management then data", C.logSourcePorts(cfg).join() === "M0,M2,V0,P8,P9");
  check("ft roles are not management", !C.managementPortNames(cfg).includes("P1"));

  const all = C.dataPortNames(cfg);
  check("'all' expands to every data port", C.interfacesToList("all", all).join() === "V0,P8,P9");
  // blank means nothing chosen; only the literal "all" expands to every port
  check("blank expands to nothing", C.interfacesToList("", all).length === 0);
  check("clear then reselect round trips",
    C.listToInterfaces(C.interfacesToList("", all), all) === "");
  check("a list is parsed", C.interfacesToList("P8,P9", all).join() === "P8,P9");
  check("selecting every port collapses to all", C.listToInterfaces(all, all) === "all");
  check("selecting none is not the same as all", C.listToInterfaces([], all) === "");
  check("an enabled target with no interfaces is reported", C.loggingProblems({
    netflow: { targets: [{ enable: true, dip: "1.1.1.1", dport: 514, interfaces: "" }] } })
    .some((p) => /interface/.test(p.msg)));
  check("a subset is written as a list", C.listToInterfaces(["P9", "P8"], all) === "P8,P9");
  check("unknown ports are dropped", C.listToInterfaces(["P8", "P99"], all) === "P8");
  check("round trip is stable", C.listToInterfaces(C.interfacesToList("P8", all), all) === "P8");
}

/* ---------- heartbeat ---------- */
group("heartbeat");
{
  const cfg = { heartbeat: { enable: true, frequency: 500, maxAllowTimeouts: 3, target: [
    { enable: true, sendPort: "P13", receivePort: "P13", packetData: "000d48", description: "test", id: 3 },
    { enable: false, sendPort: "P3", receivePort: "P3", packetData: "000d48", description: "", id: 2 }] } };
  const hb = C.parseHeartbeat(cfg);
  check("heartbeat globals read", hb.enable === true && hb.frequency === 500 && hb.maxAllowTimeouts === 3);
  check("targets parsed", hb.targets.length === 2);
  check("target fields read", hb.targets[0].sendPort === "P13" && hb.targets[0].id === 3);
  check("target enable read", hb.targets[0].enable === true && hb.targets[1].enable === false);
  check("missing heartbeat tolerated", C.parseHeartbeat({}).targets.length === 0);

  const xml = C.buildHeartbeatConfigSet(hb);
  check("heartbeat block written", xml.includes("<heartbeat>") && xml.includes("</heartbeat>"));
  check("globals written", xml.includes("<enable>true</enable>") && xml.includes("<frequency>500</frequency>"));
  check("every target written", (xml.match(/<target>/g) || []).length === 2);
  check("target id written", xml.includes("<id>3</id>"));
  check("removing a target drops it", (C.buildHeartbeatConfigSet({ ...hb, targets: hb.targets.slice(0, 1) })
    .match(/<target>/g) || []).length === 1);
  check("adding a target includes it", (C.buildHeartbeatConfigSet({ ...hb, targets: [...hb.targets, C.mkHeartbeatTarget(9)] })
    .match(/<target>/g) || []).length === 3);
  check("new target gets the next id", C.mkHeartbeatTarget(9).id === 9);
  check("descriptions escaped", C.buildHeartbeatConfigSet({ ...hb,
    targets: [{ ...hb.targets[0], description: "a&b" }] }).includes("a&amp;b"));

  // the first field is the position among ENABLED targets, not the target id
  const st = C.parseHeartbeatStatus({ heartbeat_status: [[0, true], [1, false]] });
  check("status rows keep their order", st.length === 2 && st[0].index === 0 && st[0].up === true);
  check("missing status payload tolerated", C.parseHeartbeatStatus(undefined).length === 0);
  const lined = C.heartbeatStatusRows([{ id: 3, enable: true, description: "a", sendPort: "P1", receivePort: "P1" },
    { id: 2, enable: false, description: "b" },
    { id: 7, enable: true, description: "c", sendPort: "P2", receivePort: "P2" }], st);
  check("position 0 is the first enabled target", lined[0].id === 3);
  check("disabled targets are skipped when counting", lined[1].id === 7);
  check("labels come from the target", lined[0].description === "a" && lined[0].sendPort === "P1");
  check("status beyond the target list is tolerated",
    C.heartbeatStatusRows([], [{ index: 5, up: true }])[0].id === null);

  /* the same rows seen from the ports, for the interface list */
  const marks = C.heartbeatPortMarks([
    { id: 1, up: true, sendPort: "P2", receivePort: "P2" },
    { id: 3, up: false, sendPort: "P8", receivePort: "P9" },
  ]);
  check("a loop target marks its one port in both directions",
    marks.P2.send[0] === 1 && marks.P2.recv[0] === 1);
  check("a loop target is only counted once", marks.P2.up === 1 && marks.P2.down === 0);
  check("a two-port target marks both ends",
    marks.P8.send[0] === 3 && marks.P8.recv.length === 0 && marks.P9.recv[0] === 3);
  check("a missed target marks both its ports", marks.P8.down === 1 && marks.P9.down === 1);
  check("ports with no probe get no mark", marks.P0 === undefined);
  check("no targets, no marks", Object.keys(C.heartbeatPortMarks([])).length === 0);
  check("unnumbered targets fall back to their position",
    C.heartbeatPortMarks([{ up: true, sendPort: "P1", receivePort: "P1" }]).P1.send[0] === 1);

  // The list is a fixed set of slots: adding reuses the first disabled slot rather
  // than growing the list, and removing just switches that slot off.
  const slots = (l) => l.map((t) => t.id + (t.enable ? "+" : "-")).join(" ");
  const start = [{ id: 1, enable: true }, { id: 2, enable: false }, { id: 3, enable: false }];
  const added = C.insertHeartbeatTarget(start, { id: 9, enable: true });
  check("add reuses the first disabled slot", slots(added) === "1+ 9+ 3-");
  check("add does not grow the list", added.length === start.length);
  const removed = added.map((t) => t.id === 9 ? { ...t, enable: false } : t);
  check("remove switches the slot off and keeps its id", slots(removed) === "1+ 9- 3-");
  check("with every slot in use the list extends",
    slots(C.insertHeartbeatTarget([{ id: 1, enable: true }], { id: 9, enable: true })) === "1+ 9+");
  check("first target on an empty list", slots(C.insertHeartbeatTarget([], { id: 9, enable: true })) === "9+");
  check("the original list is not mutated", slots(start) === "1+ 2- 3-");

  // a new target starts from the device's stock probe frame
  check("new target carries the default packet", C.mkHeartbeatTarget(2).packetData === C.DEFAULT_HEARTBEAT_PACKET);
  check("default packet is valid hex", /^[0-9a-f]+$/.test(C.DEFAULT_HEARTBEAT_PACKET));
  check("default packet has whole bytes", C.DEFAULT_HEARTBEAT_PACKET.length % 2 === 0);
  check("a fresh target validates", C.heartbeatProblems({ targets: [{ ...C.mkHeartbeatTarget(1), sendPort: "P1", receivePort: "P1" }] }).length === 0);

  check("missing ports reported", C.heartbeatProblems({ targets: [{ id: 1, sendPort: "", receivePort: "P1" }] }).length > 0);
  check("non-hex packet data reported", C.heartbeatProblems({ targets: [{ id: 1, sendPort: "P1", receivePort: "P1", packetData: "zz" }] }).length > 0);
  // the device's own configs repeat ids, so duplicates must not be flagged
  check("duplicate ids allowed", C.heartbeatProblems({ targets: [
    { id: 3, sendPort: "P1", receivePort: "P1", packetData: "" },
    { id: 3, sendPort: "P2", receivePort: "P2", packetData: "" }] }).length === 0);
  check("odd-length packet data reported", C.heartbeatProblems({ targets: [
    { id: 1, sendPort: "P1", receivePort: "P1", packetData: "abc" }] }).some((p) => /even/.test(p.msg)));
  check("a valid target is clean", C.heartbeatProblems({ targets: [{ id: 1, sendPort: "P1", receivePort: "P2", packetData: "00ff" }] }).length === 0);
}

group("service options");
{
  const cfg = { services: [
    { name: "xmlrpc", enable: true, localhost_only: true },
    { name: "backup", enable: false, host: "h", port: 21, user: "u", pass: "p", dir: "/d", crontab: "0 0 * * *" }] };
  const ex = C.parseServiceExtras(cfg);
  check("xmlrpc option read", ex.xmlrpc.localhost_only === true);
  check("backup fields read", ex.backup.host === "h" && ex.backup.crontab === "0 0 * * *");
  check("defaults when absent", C.parseServiceExtras({}).backup.port === 21);
  const xml = C.buildServiceExtrasConfigSet(ex);
  check("xmlrpc option written", xml.includes("<localhost_only>True</localhost_only>"));
  check("backup targeted by name", xml.includes('<find name="backup">'));
  check("backup fields written", xml.includes("<host>h</host>") && xml.includes("<crontab>0 0 * * *</crontab>"));
}

/* ---------- interface (port) settings ---------- */
group("interface settings");
{
  const cfg = { interfaces: [
    { name: "qlm2", type: "XFI", ports: [
      { name: "P8", description: "", enable: true }, { name: "P9", description: "uplink", enable: false }] },
    { type: "LOOP", ports: [{ name: "P12", description: "LOOP", enable: true }] },
    { type: "VPORT", ports: [{ name: "V0", description: "", port: "P6,P7", vlanid: 100 }] }] };
  const ports = C.parseInterfacePorts(cfg);
  check("all ports flattened", ports.length === 4);
  check("virtual ports sort first", ports[0].name === "V0");
  check("physical ports sort numerically", ports.map((p) => p.name).join(",") === "V0,P8,P9,P12");
  check("parent interface kept", ports.find((p) => p.name === "P8").ifaceName === "qlm2");
  check("interface type kept", ports.find((p) => p.name === "P12").type === "LOOP");
  check("description read", ports.find((p) => p.name === "P9").description === "uplink");
  check("enable read", ports.find((p) => p.name === "P9").enable === false);
  check("enable defaults to true", ports.find((p) => p.name === "V0").enable === true);
  const v0 = ports.find((p) => p.name === "V0");
  check("virtual flagged", v0.virtual === true);
  check("vport members and vlan read", v0.memberPorts === "P6,P7" && v0.vlanid === 100);
  check("physical ports have no vlan fields", ports.find((p) => p.name === "P8").memberPorts === undefined);

  const merged = C.mergePortStats(ports, [{ name: "P8", ifidx: 9, linkStatus: 1, speed: 10000 },
    { name: "P9", ifidx: 10, linkStatus: 0, speed: 10000 }]);
  check("live index merged", merged.find((p) => p.name === "P8").ifidx === 9);
  check("link up detected", merged.find((p) => p.name === "P8").linkUp === true);
  check("link down detected", merged.find((p) => p.name === "P9").linkUp === false);
  check("speed merged", merged.find((p) => p.name === "P8").speed === 10000);
  check("ports missing from stats stay null", merged.find((p) => p.name === "V0").linkUp === null);

  const edited = ports.map((p) => p.name === "P8" ? { ...p, description: "wan" } : p);
  check("description change detected", C.changedPorts(ports, edited).map((p) => p.name).join() === "P8");
  const toggled = ports.map((p) => p.name === "P12" ? { ...p, enable: false } : p);
  check("enable change detected", C.changedPorts(ports, toggled).map((p) => p.name).join() === "P12");
  check("no edits means nothing to submit", C.changedPorts(ports, ports).length === 0);

  const xml = C.buildPortConfigSet([{ name: "P8", description: "wan", enable: true },
    { name: "P9", description: "", enable: false }]);
  check("configSet wrapper", xml.startsWith('<configSet reboot="no">'));
  check("port targeted by name", xml.includes('<find name="P8">'));
  check("description written", xml.includes("<description>wan</description>"));
  check("enable written as True/False", xml.includes("<enable>True</enable>") && xml.includes("<enable>False</enable>"));
  check("only description and enable submitted", !xml.includes("<speed>") && !xml.includes("<hash>"));
  check("values are escaped", C.buildPortConfigSet([{ name: "P0", description: "a<b&c", enable: true }]).includes("a&lt;b&amp;c"));
}

/* ---------- device settings ---------- */
group("device settings");
{
  const iface = { role: "management", fields: { enable: "True", ip: "192.168.1.151", name: "M0",
    eth: "eth1", netmask: "255.255.255.0", gateway: "192.168.1.1", garp_interval: "7", bypassfilter: "yes" } };
  const cfg = C.buildMgmtConfigSet(iface);
  check("configSet wrapper", cfg.includes('<configSet reboot="no">'));
  check("role attribute", cfg.includes('role="management"'));
  check("ip written", cfg.includes("<ip>192.168.1.151</ip>"));
  check("only the ifcfgs section", !cfg.includes("<args>") && !cfg.includes("<interfaces>"));
  check("every field the page sets is present", C.IFCFG_WRITE_FIELDS.every((k) => cfg.includes("<" + k + ">")));
  /* The two the page never shows are left out entirely: writing them back --
     even with the value just read -- replaces whatever the device holds, and
     the device is where they are set from. */
  check("garp_interval not written", !cfg.includes("garp_interval"));
  check("bypassfilter not written", !cfg.includes("bypassfilter"));
  check("hidden fields are still read", C.IFCFG_FIELDS.includes("garp_interval") && C.IFCFG_FIELDS.includes("bypassfilter"));
  // whitespace-only is exactly how .13 holds bypassfilter, and trim() makes it ""
  const parsed = C.parseMgmtIfaces('<run><ifcfgs><find role="management"><ip>10.0.0.1</ip>'
    + '<garp_interval>0</garp_interval><bypassfilter>   </bypassfilter></find></ifcfgs></run>');
  check("a whitespace hidden value cannot be emptied by a save",
    parsed[0].fields.bypassfilter === "" && !C.buildMgmtConfigSet(parsed[0]).includes("bypassfilter"));
}

/* ---------- traffic formatting ---------- */
group("traffic formatting");
check("fmtNum small", C.fmtNum(0) === "0");
check("fmtNum thousands", C.fmtNum(1234) === "1.23K");
check("fmtNum millions", C.fmtNum(2576000) === "2.58M");
check("fmtNum billions", C.fmtNum(3.2e9) === "3.20G");
check("fmtBytes zero", C.fmtBytes(0) === "0 B");
check("fmtBytes KB", C.fmtBytes(1536) === "1.50 KB");
check("fmtBytes GB", C.fmtBytes(2 * 1024 * 1024 * 1024) === "2.00 GB");
check("fmtSpeed integer Gbps", C.fmtSpeed(100000) === "100 Gbps");
check("fmtSpeed Mbps", C.fmtSpeed(500) === "500 Mbps");
check("fmtSpeed has no decimals", !C.fmtSpeed(100000).includes("."));

/* ---------- document snapshot (undo/redo correctness) ---------- */
group("undo snapshot");
{
  // REGRESSION: a template with no `outputs` key. The snapshot must normalise
  // missing arrays, or restoring it leaves a newly added output in place.
  const tmplDoc = { filters: [{ id: 1 }], chains: [{ cid: 1 }] };
  const parts = JSON.parse(C.docSnapshot(tmplDoc));
  check("snapshot has all five keys", ["filters", "inputs", "outputs", "actions", "chains"].every((k) => k in parts));
  check("missing arrays normalised to []", parts.outputs.length === 0 && parts.inputs.length === 0 && parts.actions.length === 0);
  const added = { ...tmplDoc, outputs: [{ id: 1, port: "P1" }] };
  const restored = { ...added, ...parts };
  check("undo removes an added output", restored.outputs.length === 0);
  check("undo removes added inputs/actions", (() => {
    const a = { ...tmplDoc, inputs: [{ id: 1 }], actions: [{ id: 1 }] };
    const r = { ...a, ...JSON.parse(C.docSnapshot(tmplDoc)) };
    return r.inputs.length === 0 && r.actions.length === 0;
  })());
  check("undo preserves untouched filters", restored.filters.length === 1);
  check("identical docs snapshot identically", C.docSnapshot(tmplDoc) === C.docSnapshot({ ...tmplDoc }));
  check("changed docs snapshot differently", C.docSnapshot(tmplDoc) !== C.docSnapshot(added));
}

/* ---------- switch mapping ---------- */
group("switch mapping");
{
  const cfg = {
    grism_A_servers: [
      { name: "ga1", enable: false, ip: "192.168.1.140", user: "GRISM-T", interval: 5,
        mapping: [{ virtual_port: "P1", vport: "V1" }, { virtual_port: "P2", vport: "V2" }] },
      { name: "ga2", enable: false, ip: "192.168.1.145", user: "GRISM-T", interval: 5, mapping: [] },
    ],
    adsn_agent_servers: [
      { name: "agent1", enable: true, ip: "127.0.0.1", port: "12345", interval: 3,
        mapping: [{ name: "V0", port: 0 }, { name: "V1", port: 1 }] },
    ],
  };
  const a = C.parseAServers(cfg), d = C.parseAdsnAgents(cfg);
  check("both slots are read", a.map((s) => s.name).join() === "ga1,ga2");
  check("an A server keeps its credentials and poll interval",
    a[0].ip === "192.168.1.140" && a[0].user === "GRISM-T" && a[0].interval === "5" && a[0].enable === false);
  check("its mapping pairs switch port with VPort",
    a[0].mapping.map((m) => m.switchPort + "->" + m.vport).join() === "P1->V1,P2->V2");
  check("an ADSN agent pairs VPort with a port number",
    d[0].mapping.map((m) => m.vport + "->" + m.port).join() === "V0->0,V1->1" && d[0].port === "12345");
  check("a config with neither yields nothing",
    C.parseAServers({}).length === 0 && C.parseAdsnAgents(null).length === 0);
  check("only the Q16 and Q8 have an agent",
    C.hasAdsnAgent("Q16") && C.hasAdsnAgent("Q8") && !C.hasAdsnAgent("H2") && !C.hasAdsnAgent("HL1"));

  /* aph is which API the device calls, and that is what kind of switch is on
     the other end: /grism/task/ports/status is the P4 box, /interface/features
     is the SDN controller. */
  check("the flag names the protocol",
    C.aServerKind({ aph: true }) === "aph" && C.aServerKind({ aph: false }) === "a" &&
    C.aServerKind({}) === "a" && C.aServerKind(null) === "a");
  check("a config that carries the flag can be offered the choice",
    C.parseAServers({ grism_A_servers: [{ name: "ga1", aph: true }] })[0].hasAph === true);
  check("a config that never had it is not",
    C.parseAServers({ grism_A_servers: [{ name: "ga1" }] })[0].hasAph === false &&
    C.parseAServers({ grism_A_servers: [{ name: "ga1" }] })[0].aph === false);
  {
    const base = C.parseAServers({ grism_A_servers: [
      { name: "ga1", enable: true, ip: "1.2.3.4", user: "u", aph: true, interval: 5, mapping: [] },
      { name: "ga2", enable: false, ip: "", user: "", interval: 5, mapping: [] }] });
    const xml = C.buildAServersConfigSet([{ ...base[0], aph: false }, base[1]], base, {});
    check("changing the kind is a change worth sending", xml.includes("<aph>False</aph>"));
    check("a firmware that does not know the flag is not sent one",
      !C.buildAServersConfigSet([{ ...base[1], ip: "9.9.9.9" }], base, {}).includes("aph"));
  }

  /* The device takes mapping rows one at a time, as add or delete against what
     it already holds -- so a changed row is both. */
  const diff = C.mappingDiff(a[0].mapping, [{ switchPort: "P1", vport: "V1" }, { switchPort: "P9", vport: "V2" }],
    ["switchPort", "vport"]);
  check("an untouched row is neither added nor removed",
    diff.add.length === 1 && diff.remove.length === 1 &&
    diff.add[0].switchPort === "P9" && diff.remove[0].switchPort === "P2");

  const unchanged = C.buildAServersConfigSet(a, a, {});
  check("nothing to say produces no configSet", unchanged === "");
  const moved = [{ ...a[0], enable: true, mapping: [{ switchPort: "P1", vport: "V1" }] }, a[1]];
  const xml = C.buildAServersConfigSet(moved, a, {});
  check("only the server that changed is named",
    xml.includes('<find name="ga1">') && !xml.includes('name="ga2"'));
  check("the row that went is a delete",
    xml.includes('<mapping type="delete"><virtual_port>P2</virtual_port><vport>V2</vport></mapping>') &&
    !xml.includes('type="add"'));
  check("the switch is written as the firmware spells booleans", xml.includes("<enable>True</enable>"));
  /* The config holds a hash, so the field starts empty and an untouched
     password must not be sent -- least of all as an empty one. */
  check("no password, no passhash", !xml.includes("passhash"));
  check("a new password is sent as its hash",
    C.buildAServersConfigSet(moved, a, { ga1: "abc123" }).includes("<passhash>abc123</passhash>"));

  const adsnXml = C.buildAdsnAgentsConfigSet(
    [{ ...d[0], mapping: [...d[0].mapping, { vport: "V2", port: "2" }] }], d);
  check("an added agent row names the VPort and the port number",
    adsnXml.includes('<mapping type="add"><name>V2</name><port>2</port></mapping>'));
  check("the agent's own port is not confused with a mapping row",
    adsnXml.includes("<port>12345</port>"));

  const probs = (servers, opts) => C.switchServerProblems(servers, opts).map((x) => x.kind);
  check("an enabled server needs an address",
    probs([{ name: "ga1", enable: true, ip: "", mapping: [] }]).includes("noIp"));
  check("a disabled server may be half-filled",
    probs([{ name: "ga1", enable: false, ip: "", mapping: [] }]).length === 0);
  check("a half-filled pair is refused",
    probs([{ name: "ga1", ip: "1.2.3.4", mapping: [{ switchPort: "P1", vport: "" }] }]).includes("incomplete"));
  check("one VPort cannot come from two ports",
    probs([{ name: "ga1", ip: "1.2.3.4", mapping: [{ switchPort: "P1", vport: "V1" }, { switchPort: "P2", vport: "V1" }] }])
      .includes("duplicate"));
  /* The shipped config carries sample rows for VPorts no device has; pointing
     at one is a pair that can never match anything. */
  check("a VPort this device does not have is flagged",
    probs([{ name: "ga1", ip: "1.2.3.4", mapping: [{ switchPort: "P1", vport: "V1000_SAMPLE" }] }],
      { vports: ["V1"] }).includes("unknownVport"));
  /* ...but only as a warning: every device ships with a sample row pointing at
     a VPort it does not have, and refusing the card over it would mean nothing
     on this page could ever be applied. */
  check("an unknown VPort does not block the rest",
    C.switchServerProblems([{ name: "ga1", ip: "1.2.3.4", mapping: [{ switchPort: "P1", vport: "V1000_SAMPLE" }] }],
      { vports: ["V1"] }).every((x) => x.warn === true));
  check("a real mistake is not a warning",
    C.switchServerProblems([{ name: "ga1", ip: "1.2.3.4", mapping: [{ switchPort: "", vport: "V1" }] }],
      { vports: ["V1"] }).some((x) => !x.warn));
  check("with no VPort list nothing is flagged as unknown",
    !probs([{ name: "ga1", ip: "1.2.3.4", mapping: [{ switchPort: "P1", vport: "V9" }] }]).includes("unknownVport"));
  check("an agent port has to be a port",
    probs([{ name: "agent1", enable: true, ip: "1.2.3.4", port: "no", mapping: [] }], { kind: "adsn" })
      .includes("badPort"));
  check("an agent's switch port has to be a number",
    probs([{ name: "agent1", ip: "1.2.3.4", port: "1", mapping: [{ vport: "V0", port: "eth0" }] }], { kind: "adsn" })
      .includes("badSwitchPort"));
}

/* ---------- i18n ---------- */
group("i18n");
check("english lookup", makeT("en")("tab.filters") === "Filters");
check("chinese lookup", makeT("zh-TW")("tab.filters") === "篩選器");
check("missing key returns the key", makeT("en")("nope.nope") === "nope.nope");
// A key can exist in both dictionaries yet still hold the English text — that
// slips past a key-only comparison, so compare the values as well.
check("no Chinese entry is left in English", (() => {
  // "down" joins these as a link state shown verbatim; "up" already was, and
  // only escaped this check for being shorter than the four-letter threshold.
  const shared = new Set(["IPv4", "IPv6", "NetFlow", "syslog", "SNMP", "JA3", "JA4", "PID",
    "RSS", "MTU", "pps", "MIB", "GRISM Studio", "Heartbeat", "IPv4 flow", "IPv6 flow", "down", "bypass",
    "MGMT", "MGMT (USB)", "MGMT (M0)", "MEC (S1AP/NGAP · GTP)",
    // the switch server names and the two protocol names, written the same
    // way on both sides
    "ADSN agent", "VPort", "GRISM-APH", "GRISM-A",
    // 3GPP column names, written the same way in both languages
    "MME/AMF UE ID", "RAN UE ID", "PLMN ID", "CELL ID", "SPID",
    "UL GTP TEID", "UL GTP IPv4", "DL GTP TEID", "DL GTP IPv4", "UE IPv4"]);
  const same = Object.keys(I18N.en).filter((k) =>
    I18N["zh-TW"][k] === I18N.en[k] && !shared.has(I18N.en[k]) && /[A-Za-z]{4,}/.test(I18N.en[k]));
  if (same.length) console.log("    untranslated:", same.join(", "));
  return same.length === 0;
})());
check("both dictionaries cover the same keys", (() => {
  const en = Object.keys(I18N.en), zh = Object.keys(I18N["zh-TW"]);
  const missing = en.filter((k) => !zh.includes(k));
  if (missing.length) console.log("    untranslated:", missing.join(", "));
  return missing.length === 0;
})());

/* ---------- chain layout ---------- */
group("chain layout");
{
  const laid = C.layoutChain({ ports: "P0", tree: { id: "b", t: "branch", fids: "F1", fidOp: "or",
    match: { id: "m", t: "out", ports: "P1" }, notmatch: { id: "n", t: "out", ports: "P2" } } });
  check("ingress plus three nodes placed", laid.placed.length === 4);
  check("edges connect them", laid.edges.length === 4);
  check("canvas has positive size", laid.totalW > 0 && laid.totalH > 0);
  check("match edge labelled", laid.edges.some((e) => e.kind === "match"));
  check("notmatch edge labelled", laid.edges.some((e) => e.kind === "notmatch"));
}


/* ---------- traffic statistics shaping ---------- */
group("traffic statistics");
{
  const sessions = { total: 2400000, concurrent: 44, protocols: [2, 17, 6, 47],
    protocols_concurrent: [17, 22, 4, 1], protocols_concurrent_bytes: [1088, 767433, 78494, 852],
    tcp_ports: [443], tcp_ports_concurrent: [4], tcp_ports_concurrent_bytes: [78494],
    udp_ports: [53, 67, 68, 123, 443], udp_ports_concurrent: [12, 1, 1, 1, 2],
    udp_ports_concurrent_bytes: [3564, 72578, 65286, 230, 43414],
    netflow_count: 29760, netflow_eps: 2 };
  const v4 = C.summarizeSessions(sessions);
  check("session totals read", v4.total === 2400000 && v4.concurrent === 44);
  check("netflow read", v4.netflowCount === 29760 && v4.netflowEps === 2);
  check("usage is concurrent over total", Math.abs(v4.usage - 44 / 2400000) < 1e-12);
  check("zero total gives zero usage", C.summarizeSessions({ total: 0, concurrent: 0 }).usage === 0);
  check("tiny ratios stay readable", C.fmtPct(44 / 2400000) === "0.0018%");
  check("percentages scale up", C.fmtPct(0.5) === "50%" && C.fmtPct(0.05) === "5.0%");
  check("zero percent", C.fmtPct(0) === "0%");
  check("protocols sorted busiest first", v4.protocols[0].key === 17 && v4.protocols[0].concurrent === 22);
  check("protocol bytes aligned", v4.protocols[0].bytes === 767433);
  check("udp ports sorted", v4.udp[0].key === 53 && v4.udp[0].concurrent === 12);
  check("tcp ports read", v4.tcp.length === 1 && v4.tcp[0].key === 443);

  const v6src = { total: 500000, concurrent: 18, next_hdr: [58, 0, 17],
    next_hdr_concurrent: [12, 2, 4], next_hdr_concurrent_bytes: [1655100, 268, 3450345],
    tcp_ports: [], tcp_ports_concurrent: [], tcp_ports_concurrent_bytes: [],
    udp_ports: [547], udp_ports_concurrent: [1], udp_ports_concurrent_bytes: [133],
    netflow_count: 7277, netflow_eps: 0 };
  const v6 = C.summarizeSessions(v6src, { v6: true });
  check("v6 uses next_hdr", v6.protocols[0].key === 58 && v6.protocols[0].concurrent === 12);
  check("v6 empty tcp handled", v6.tcp.length === 0);
  check("null sessions yield null", C.summarizeSessions(null) === null);

  check("protocol names", C.protocolName(6) === "TCP (6)" && C.protocolName(58) === "ICMPv6 (58)");
  check("unknown protocol falls back", C.protocolName(250) === "250");
  check("port service names", C.portLabel(443) === "443 (HTTPS)" && C.portLabel(9999) === "9999");

  const fc = C.summarizeFilterCounters([
    { id: 1, count: 1, try_count: 880197, matched_count: 117940, matched_per_second: 0 },
    { id: 5, count: 2, try_count: 762257, matched_count: 261023, matched_per_second: 0 },
    { id: 4, count: 1, try_count: 0, matched_count: 0, matched_per_second: 0 }]);
  check("filters sorted by matches", fc[0].id === 5);
  check("hit rate computed", Math.abs(fc[1].rate - 117940 / 880197) < 1e-9);
  check("zero evaluations give zero rate", fc[2].rate === 0);

  const svc = C.summarizeFlowServices({ private: [], public: [{ name: "HTTPS (TCP/443,UDP/443)",
    host: [["151.101.193.140", 1, 23106], ["31.13.87.52", 4, 53564]] }] });
  check("service totals summed", svc[0].sessions === 5 && svc[0].bytes === 76670);
  check("hosts sorted by bytes", svc[0].hosts[0].ip === "31.13.87.52");
  check("scope recorded", svc[0].scope === "public");
  check("no services tolerated", C.summarizeFlowServices(undefined).length === 0);

  const ctry = C.summarizeCountries([{ iso_code: "TW", packets: 191323, bytes: 189896597 },
    { iso_code: "US", packets: 108920, bytes: 70444632 }, { iso_code: "AU", packets: 177, bytes: 57763 }]);
  check("countries sorted by bytes", ctry.rows[0].iso === "TW");
  check("totals summed", ctry.totalPackets === 300420);
  check("share computed", Math.abs(ctry.rows[0].share - 189896597 / ctry.totalBytes) < 1e-9);

  check("country codes resolve to names", C.countryName("TW", "en") === "Taiwan" && C.countryName("JP", "en") === "Japan");
  check("country names localise", C.countryName("US", "zh-TW") === "美國");
  check("unknown codes fall back to the code", C.countryName("XX", "en") === "XX");
  check("non-country values pass through", C.countryName("", "en") === "" && C.countryName("ABC", "en") === "ABC");
  check("regional codes handled", C.countryName("EU", "en") === "European Union");

  const pt = C.summarizePacketTypes({ ipfragment: 252, gtp: 0, gre: 109599, vxlan: 0 });
  check("packet types sorted", pt[0].key === "gre" && pt[0].count === 109599);
  check("zero types kept", pt.some((p) => p.key === "gtp" && p.count === 0));
}

/* ---------- change tracking ---------- */
group("change tracking");
{
  // Re-parsing the same XML hands out fresh cid/node ids; those are editor
  // handles, not configuration, and must not read as edits.
  const xml = '<run><filter id="1" name="a"><find><ip>1.1.1.1</ip></find></filter>' +
    '<output id="1"><port>P1</port></output><chain><in>P0</in><fid>F1</fid><out>O1</out></chain></run>';
  const p1 = C.parseRun(xml); const a = C.normalizeDoc(p1.doc ?? p1);
  const p2 = C.parseRun(C.serializeRun(a)); const b = C.normalizeDoc(p2.doc ?? p2);
  check("a no-op round trip reports no changes", C.diffDoc(a, b).total === 0);
  check("filters are not marked touched", C.diffDoc(a, b).filters.touched.size === 0);
  check("chains are not marked touched", C.diffDoc(a, b).chains.touched.size === 0);
  // every section, including the advanced ones, must survive a round trip clean
  const full = '<run><filter id="1" name="a"><find><ip>1.1.1.1</ip></find></filter>' +
    '<input type="replayPcap"><port>P3</port><filepath>H1/a.pcap</filepath></input>' +
    '<output id="1" name="o"><port>P1</port></output>' +
    '<action type="input-packet-process"><port>P2</port></action>' +
    '<chain><in>P0</in><fid>F1</fid><out>O1</out></chain></run>';
  const f1 = C.parseRun(full); const fa = C.normalizeDoc(f1.doc ?? f1);
  const f2 = C.parseRun(C.serializeRun(fa)); const fb = C.normalizeDoc(f2.doc ?? f2);
  const fd = C.diffDoc(fa, fb);
  check("inputs survive a round trip clean", fd.inputs.count === 0);
  check("outputs survive a round trip clean", fd.outputs.count === 0);
  check("actions survive a round trip clean", fd.actions.count === 0);
  check("a real output edit is still detected", (() => {
    const e = structuredClone(fb); e.outputs[0].port = "P9";
    return C.diffDoc(fa, e).outputs.count === 1;
  })());
  const renamed = structuredClone(b); renamed.filters[0].name = "changed";
  check("a real filter edit is still detected", C.diffDoc(a, renamed).filters.count === 1);
  const rechained = structuredClone(b); rechained.chains[0].ports = "P9";
  check("a real chain edit is still detected", C.diffDoc(a, rechained).chains.count > 0);
}

{
  const base = { filters: [{ id: 1, name: "a" }, { id: 2, name: "b" }],
                 chains: [{ cid: "c1", ports: "P0" }], inputs: [], outputs: [], actions: [] };
  const cur = { filters: [{ id: 1, name: "a" }, { id: 2, name: "EDITED" }, { id: 3, name: "new" }],
                chains: [{ cid: "c1", ports: "P0" }], inputs: [], outputs: [], actions: [] };
  const d = C.diffDoc(base, cur);
  check("added item detected", d.filters.added.length === 1 && d.filters.added[0] === 3);
  check("edited item detected", d.filters.changed.length === 1 && d.filters.changed[0] === 2);
  check("untouched item ignored", !d.filters.touched.has(1));
  check("touched holds added + edited", d.filters.touched.has(2) && d.filters.touched.has(3));
  check("unchanged section is clean", d.chains.count === 0);
  check("total counts every section", d.total === 2);
  const removed = C.diffDoc(base, { ...base, filters: [{ id: 1, name: "a" }] });
  check("removed item detected", removed.filters.removed.length === 1 && removed.filters.removed[0] === 2);
  check("identical docs report no change", C.diffDoc(base, base).total === 0);
  // chains carry no stable id, so they are matched on content: an edited chain
  // reads as one removed and one added, and its row is still badged
  const chEdit = C.diffDoc(base, { ...base, chains: [{ cid: "c1", ports: "P9" }] });
  check("an edited chain is detected", chEdit.chains.count > 0);
  check("the edited chain's row is badged", chEdit.chains.touched.has("c1"));
  check("a chain with a new cid but identical content is unchanged",
    C.diffDoc(base, { ...base, chains: base.chains.map((c) => ({ ...c, cid: "fresh" })) }).chains.count === 0);
  check("sectionChanged helper", C.sectionChanged(d, "filters") && !C.sectionChanged(d, "chains"));
  check("missing sections tolerated", C.diffDoc({}, {}).total === 0);
}

/* ---------- signed-in user ---------- */
group("current user endpoint");
check("bare username body", C.extractUsername("packetx") === "packetx");
check("json body", C.extractUsername('{"username":"packetx","priv":15}') === "packetx");
check("object payload", C.extractUsername({ username: "packetx" }) === "packetx");
check("capitalised key", C.extractUsername({ User: "admin" }) === "admin");
check("nested under args", C.extractUsername({ args: { username: "a1" } }) === "a1");
check("html error page ignored", C.extractUsername("<html>404</html>") === "");
check("empty and null ignored", C.extractUsername("") === "" && C.extractUsername(null) === "");
check("whitespace trimmed", C.extractUsername("  packetx  ") === "packetx");

group("session cookie");
check("username read from the cookie", C.signedInUser("a=1; X-PacketX-Username=packetx; b=2") === "packetx");
check("percent-encoding decoded", C.signedInUser("X-PacketX-Username=admin%40site") === "admin@site");
check("absent cookie yields empty", C.signedInUser("a=1; b=2") === "");
check("prefix names don't match", C.readCookie("X-PacketX-User", "X-PacketX-Username=zzz") === "");
check("surrounding spaces tolerated", C.signedInUser(" X-PacketX-Username = packetx ".replace(" = ", "=")) === "packetx");

/* ---------- port ordering ---------- */
group("port ordering");
check("virtual ports first, then physical, then the rest",
  C.sortPortNames(["P10", "P2", "V1", "P0", "V0", "H1", "P1", "V10", "V2"]).join(" ")
  === "V0 V1 V2 V10 P0 P1 P2 P10 H1");
check("numeric, not lexical", C.sortPortNames(["P10", "P9"]).join(" ") === "P9 P10");
check("already sorted stays put", C.sortPortNames(["V0", "P0"]).join(" ") === "V0 P0");
check("does not mutate its input", (() => { const a = ["P1", "V0"]; C.sortPortNames(a); return a[0] === "P1"; })());

/* ---------- module wiring (guards against the split-file class of bug) ---------- */
group("module wiring");
{
  // Every name grism-core exports and GrismStudio.jsx references must actually be
  // imported there. A missing import is a ReferenceError at render — a blank page.
  const fs = await import("node:fs");
  const jsx = fs.readFileSync(new URL("./GrismStudio.jsx", import.meta.url), "utf8");
  const exported = Object.keys(C);
  const importBlock = jsx.match(/import \{\n([\s\S]*?)\n\} from "\.\/grism-core\.js";/);
  check("JSX imports from grism-core", !!importBlock);
  const imported = new Set((importBlock ? importBlock[1] : "").split(",").map((x) => x.trim()).filter(Boolean));
  // names defined locally inside the JSX shadow the core ones
  const local = new Set();
  for (const m of jsx.matchAll(/^(?:export default )?(?:function|class) ([A-Za-z_$][\w$]*)/gm)) local.add(m[1]);
  for (const m of jsx.matchAll(/^(?:const|let) (.+)$/gm))
    for (const d of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*=/g)) local.add(d[1]);
  const missing = exported.filter((n) =>
    !imported.has(n) && !local.has(n) &&
    new RegExp("(?<![\\w.$])" + n.replace(/[$]/g, "\\$&") + "(?![\\w$])").test(jsx));
  if (missing.length) console.log("    not imported:", missing.join(", "));
  check("every core name used in the JSX is imported", missing.length === 0);
}

/* ---------- grismXmlProblems actually checks ---------- */
group("grismXmlProblems");
{
  // It read .filters off parseRun's {doc, warnings} wrapper and handed each
  // filter object to filterProblems, which wants the tree at .root. Both were
  // undefined, so every well-formed document passed and the editor's "XML is
  // valid" meant nothing.
  const bad = (xml) => C.grismXmlProblems(xml);
  check("catches a malformed address",
    bad('<run><filter id="2"><or><find name="ip.src" content="999.1.1.1"/></or></filter></run>').length === 1);
  check("catches a malformed ja4",
    bad('<run><filter id="3"><or><find name="tls.handshake.ja4" content="nope"/></or></filter></run>').length === 1);
  check("names which filter the problem is in",
    bad('<run><filter id="7"><or><find name="ip.src" content="999.1.1.1"/></or></filter></run>')[0].scope === "F7");
  check("passes a valid ja4",
    bad('<run><filter id="4"><or><find name="tls.handshake.ja4" content="t13d1516h2_8daaf6152771_b186095e22b6"/></or></filter></run>').length === 0);
  check("passes an empty blacklist shell",
    bad('<run><filter id="778" blockifempty="yes"><or></or></filter></run>').length === 0);
  check("still reports unbalanced tags", bad("<run><unclosed>").length === 1);

  // parseRun already spots these; grismXmlProblems was dropping its warnings,
  // so a typo read as a clean document and the editor said "XML is valid"
  // vocabulary complaints are reported but must not block: this build's FIELDS
  // list can lag a firmware that knows a newer field
  check("an unknown field does not block submitting",
    C.grismStructureError('<run><filter id="1"><or><find name="nosuch.field" content="x"/></or></filter></run>') === "");
  check("a misspelled element does not block either",
    C.grismStructureError('<run><filtr id="1"><or></or></filtr></run>') === "");
  check("reads without a filter or field to name",
    C.problemLine({ scope: "vocab", msg: 'unknown find field "x"' }) === 'unknown find field "x"');
  check("names the filter and field when it has them",
    C.problemLine({ scope: "F7", label: "Source IP", msg: "IPv4 or CIDR" }) === "F7 Source IP — IPv4 or CIDR");
  check("reports an unknown field name",
    bad('<run><filter id="1"><or><find name="nosuch.field" content="x"/></or></filter></run>')
      .some((p) => /unknown find field/.test(p.msg)));
  check("reports a misspelled element",
    bad('<run><filtr id="1"><or></or></filtr></run>').some((p) => /unexpected top-level/.test(p.msg)));
  check("reports a stray tag inside a filter",
    bad('<run><filter id="1"><or><bogus/></or></filter></run>')
      .some((p) => /unexpected element/.test(p.msg)));
  check("reports junk at the top level",
    bad("<run><nonsense/></run>").some((p) => /unexpected top-level/.test(p.msg)));
  // and none of that may fire on a real configuration
  check("a real blacklist shell stays clean",
    bad('<run><filter id="778" blockifempty="yes"><or></or></filter></run>').length === 0);
  check("an empty run is clean", bad("<run></run>").length === 0);
}

/* ---------- what may be submitted ---------- */
group("grism structure check");
{
  // A well-formed but non-GRISM document used to pass the editor's only gate
  // and could be sent to the device.
  check("refuses a document with no <run>",
    C.grismStructureError("<foo><bar/></foo>") === "no <run> element found");
  check("refuses unbalanced tags", !!C.grismStructureError("<run><unclosed>"));
  check("refuses an empty file", !!C.grismStructureError(""));
  check("refuses plain text", !!C.grismStructureError("hello world"));
  // a fragment with a questionable value is reported but still submittable
  check("allows a fragment with a bad field value",
    C.grismStructureError('<run><filter id="2"><or><find name="ip.src" content="999.1.1.1"/></or></filter></run>') === "" &&
    C.grismXmlProblems('<run><filter id="2"><or><find name="ip.src" content="999.1.1.1"/></or></filter></run>').length === 1);
  check("allows a valid fragment",
    C.grismStructureError('<run><filter id="1"><or></or></filter></run>') === "");
}

/* ---------- the right document in the right box ---------- */
group("root element check");
{
  check("accepts a configSet", C.rootElementError('<configSet reboot="no"><ifcfgs/></configSet>', "configSet") === "");
  // the device-settings box posts to submit_config, which wants a configSet
  check("refuses a run.xml pasted into the settings box",
    C.rootElementError('<run><filter id="1"><or></or></filter></run>', "configSet")
      === "expected a <configSet> document, found <run>");
  check("refuses an unrelated document", !!C.rootElementError("<foo/>", "configSet"));
  check("reports syntax first", C.rootElementError("<configSet><unclosed>", "configSet") === "tags aren't balanced");
  check("refuses an empty box", !!C.rootElementError("", "configSet"));
}

/* ---------- validation against the device's run.xsd ---------- */
group("run.xsd validation");
{
  const { readFileSync, existsSync } = await import("node:fs");
  const XSD = "/data/Grism/doc/run.xsd";
  const schema = existsSync(XSD) ? C.parseXsd(readFileSync(XSD, "utf8")) : null;
  check("reads the shipped schema", !!schema);
  if (schema) {
    check("knows what may sit inside run",
      ["filter", "input", "action", "output", "chain"].every((n) => schema.elements.run.inline.children.has(n)));
    check("carries the field vocabulary", schema.simpleTypes.fieldType?.enums?.size >= 116);
    check("the vocabulary includes the JA4 fields",
      ["tls.handshake.ja4", "tls.handshake.ja4s_c"].every((f) => schema.simpleTypes.fieldType.enums.has(f)));

    const v = (xml) => C.validateAgainstXsd(xml, schema);
    check("accepts a plain filter", v('<run><filter id="1"><or></or></filter></run>').length === 0);
    check("accepts a JA4 filter",
      v('<run><filter id="1"><or><find name="tls.handshake.ja4" content="t13d1516h2_8daaf6152771_b186095e22b6"/></or></filter></run>').length === 0);
    // <f> is declared substitutionGroup="find" and stands wherever find does
    check("accepts the shorthand form", v('<run><filter id="1"><or><f n="ip.src" c="1.1.1.1"/></or></filter></run>').length === 0);

    check("rejects a misspelled element", v('<run><filtr id="1"><or></or></filtr></run>').length === 1);
    check("rejects junk at the top level", v("<run><nonsense/></run>").length === 1);
    check("rejects a stray tag inside a filter",
      v('<run><filter id="1"><or><bogus/></or></filter></run>').length === 1);
    check("rejects an undeclared attribute",
      v('<run><filter id="1" bogusattr="x"><or></or></filter></run>').length === 1);
    check("rejects a field name the firmware does not have",
      v('<run><filter id="1"><or><find name="nosuch.field" content="x"/></or></filter></run>').length === 1);
    check("rejects a relation the schema does not allow",
      v('<run><filter id="1"><or><find name="ip.src" relation="~~" content="1.1.1.1"/></or></filter></run>').length === 1);
    check("says where the problem sits",
      /filter > or > find/.test(C.xsdProblemLine(
        v('<run><filter id="1"><or><find name="nosuch.field" content="x"/></or></filter></run>')[0])));
    check("rejects a document that is not a run", v("<foo/>").length === 1);
    // no schema to check against must not mean everything is wrong
    check("passes everything when there is no schema", C.validateAgainstXsd("<run><anything/></run>", null).length === 0);
    check("a schema it cannot read comes back null", C.parseXsd("<notaschema/>") === null && C.parseXsd("") === null);
  }
}

/* ---------- a new chain ---------- */
group("new chain");
{
  // it used to start as a branch on F1 with one side unspecified, which had to
  // be taken apart whenever the chain was not about filtering
  const c = C.mkChain("P3", "P7");
  check("is ingress to output, with no branch", c.tree.t === "out" && c.ports === "P3");
  check("sends to the port it was given", c.tree.ports === "P7");
  check("has no filter on it", c.tree.fids === undefined);
  check("takes the first two ports", C.firstTwoPorts(["P0", "P1", "P2"]).join() === "P0,P1");
  check("copes with one port", C.firstTwoPorts(["P5"]).join() === "P5,P5");
  check("copes with none", C.firstTwoPorts([]).join() === "P0,P1" && C.firstTwoPorts(null).join() === "P0,P1");
  check("ignores blanks", C.firstTwoPorts(["", "V1", "V2"]).join() === "V1,V2");
  check("a chain still validates", C.chainProblems(C.mkChain("P0", "P1").tree, []).length === 0);
  // grismXmlProblems handed chainProblems the chain instead of its tree, and
  // doc instead of the list to fill, so chain faults were never reported
  check("a branch with no filter chosen is reported",
    C.grismXmlProblems('<run><chain><in>P0</in><fid></fid><match><out>P1</out></match></chain></run>')
      .some((p) => /filter/.test(p.msg)));
}

/* ---------- filter condition pickers ---------- */
group("filter condition pickers");
{
  // a new condition starts on the field the previous one used
  check("inherits the previous field",
    C.lastFindField({ children: [{ t: "find", field: "ip.src" }, { t: "find", field: "country.iso_code" }] })
      === "country.iso_code");
  check("skips groups when looking back",
    C.lastFindField({ children: [{ t: "find", field: "tcp.port" }, { t: "or", children: [] }] }) === "tcp.port");
  check("falls back for the first condition",
    C.lastFindField({ children: [] }) === "ip.addr" && C.lastFindField(null) === "ip.addr");
  check("mkFind honours the field", C.mkFind("country.iso_code").field === "country.iso_code");
  check("mkFind refuses a field that does not exist", C.mkFind("nope.field").field === "ip.addr");
  check("mkFind picks a relation the field allows",
    C.relationsFor(C.FIELD_INDEX[C.mkFind("country.iso_code").field].kind).includes(C.mkFind("country.iso_code").rel));

  const cs = C.countryOptions("en");
  check("lists the world", cs.length > 200);
  check("carries code and name", cs.find((c) => c.code === "TW")?.name === "Taiwan");
  // sorted by code: the name order changes with the interface language
  check("ordered by code", cs.map((c) => c.code).join() === cs.map((c) => c.code).sort().join());
  check("includes the non-ISO regions the device emits",
    ["EU", "ZZ"].every((c) => cs.some((o) => o.code === c)));
  check("follows the interface language", C.countryOptions("zh-TW").find((c) => c.code === "TW")?.name !== "Taiwan");

  const cfg = { ifcfgs: [{ role: "management", name: "M0" }, { role: "data", name: "X" }, { role: "Management", name: "M1" }] };
  check("finds the management interfaces", C.mgmtPortNames(cfg).join() === "M0,M1");
  check("ignores anything else", !C.mgmtPortNames(cfg).includes("X"));
  check("survives a config without ifcfgs", C.mgmtPortNames({}).length === 0 && C.mgmtPortNames(null).length === 0);

  // the firmware resolves all three through the same port-name lookup, but a
  // management interface only makes sense for link-down
  check("ingress port lists the data ports only",
    C.portOptionsForField("grism.srcport", ["P0", "P1"], ["M0"]).join() === "P0,P1");
  check("link down also lists the management interfaces",
    C.portOptionsForField("grism.port.linkdown", ["P0", "P1"], ["M0"]).join() === "P0,P1,M0");
  check("flow ingress port is data only",
    C.portOptionsForField("flowtable.inport", ["P0"], ["M0"]).join() === "P0");
  check("knows which fields get a port picker",
    C.PORT_PICKER_FIELDS.has("grism.srcport") && C.PORT_PICKER_FIELDS.has("grism.port.linkdown") &&
    !C.PORT_PICKER_FIELDS.has("ip.src"));
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} prompts for a country`, !!I18N[lang]["flt.pickCountry"]);
  check(`${lang} prompts for a port`, !!I18N[lang]["flt.pickPort"]);
}

/* ---------- LAN bypass ---------- */
group("LAN bypass");
{
  // the model reads "G8S" in the config and "GRISM-G8S" on screen, so the match
  // has to be a substring
  check("recognises a G8S", C.bypassSupport("G8S")?.model === "G8S" &&
    C.bypassSupport("GRISM-G8S")?.model === "G8S");
  check("recognises a T12S", C.bypassSupport("T12S")?.model === "T12S" &&
    C.bypassSupport("GRISM-T12S")?.model === "T12S");
  check("says nothing for a model without the relays",
    C.bypassSupport("HL1") === null && C.bypassSupport("KOB3400") === null &&
    C.bypassSupport("") === null && C.bypassSupport(null) === null);
  // T12S must not match the G8S rule by accident
  check("the two do not overlap", C.bypassSupport("T12S").model === "T12S");

  check("G8S pairs are P0/P1 and P4/P5",
    C.bypassSupport("G8S").pairs.map((p) => p.ports.join("/")).join() === "P0/P1,P4/P5");
  check("T12S pairs are P8/P9 and P10/P11",
    C.bypassSupport("T12S").pairs.map((p) => p.ports.join("/")).join() === "P8/P9,P10/P11");

  check("endpoints are named after the model",
    C.bypassStatusUrl("g8s", 1) === "/grism/task/get_g8s_hwbypass1_status" &&
    C.bypassModeUrl("t12s", 2) === "/grism/task/set_t12s_hwbypass2_mode");

  check("reads the device's answer", C.parseBypassStatus("1") === true &&
    C.parseBypassStatus("0") === false && C.parseBypassStatus(" 1 ") === true);
  // a relay whose state could not be read must not be drawn as normal
  check("an unreadable relay is unknown, not normal",
    C.parseBypassStatus("") === null && C.parseBypassStatus("oops") === null &&
    C.parseBypassStatus(null) === null);

  /* G8 (SCB3240): one pair on the two right-hand ports, endpoints with no
     model in their name, and an i2c register that speaks 7 and 9. */
  const g8 = C.bypassSupport("G8");
  check("recognises a G8", g8?.model === "G8" && C.bypassSupport("GRISM-G8")?.model === "G8");
  check("G8 has one pair, P6/P7",
    g8.pairs.map((p) => p.ports.join("/")).join() === "P6/P7");
  // "G8S" contains "G8": the longer name has to win or a G8S gets one pair on
  // ports it does not have
  check("a G8S is not read as a G8", C.bypassSupport("G8S").model === "G8S" &&
    C.bypassSupport("GRISM-G8S").model === "G8S");
  check("G8 uses the unprefixed endpoints",
    C.bypassStatusUrl(g8.key, 1) === "/grism/task/get_hwbypass_status" &&
    C.bypassModeUrl(g8.key, 1) === "/grism/task/set_hwbypass_mode");
  check("G8 sends 7 for bypass and 9 for normal",
    C.bypassValue(g8, true) === "7" && C.bypassValue(g8, false) === "9");
  check("everything else still sends 1 and 0",
    C.bypassValue(C.bypassSupport("T12S"), true) === "1" &&
    C.bypassValue(C.bypassSupport("G8S"), false) === "0" &&
    C.bypassValue(undefined, true) === "1");
  check("G8 reads 7 and 9 back",
    C.parseBypassStatus("7", g8) === true && C.parseBypassStatus("9", g8) === false &&
    C.parseBypassStatus("1", g8) === null && C.parseBypassStatus("", g8) === null);
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} labels a bypass pair`, !!I18N[lang]["set.bypassPair"]);
  // the switch sits among staged fields, so the dialog has to say it is not one
  check(`${lang} says the switch is immediate`, !!I18N[lang]["set.bypassConfirmNow"]);
  check(`${lang} says what each direction does`,
    !!I18N[lang]["set.bypassConfirmOn"] && !!I18N[lang]["set.bypassConfirmOff"]);
}

/* ---------- saved configurations ---------- */
group("saved configurations");
{
  const NAME = "map.0_4.0_1752200689747.0_dGVzdDEy.0_1313.xml";
  const p = C.parseSaveXmlName(NAME);
  check("reads the slot, time, description and size",
    p.slot === 4 && p.saved === 1752200689747 && p.description === "test12" && p.size === 1313);
  check("round-trips a name",
    C.buildSaveXmlName({ description: p.description, slot: p.slot, timestamp: p.saved, size: p.size }) === NAME);
  check("survives a name in none of the known shapes",
    C.parseSaveXmlName("whatever.xml").slot === null && C.parseSaveXmlName("").description === "");
  check("decodes an empty description slot",
    C.parseSaveXmlName("map.0_1.0_100.0_.0_5.xml").description === "");

  // btoa cannot encode this, which is why descriptions moved beside the files
  const cjk = String.fromCharCode(0x6e2c, 0x8a66);
  const named = C.buildSaveXmlName({ description: cjk, slot: 2, timestamp: 5, size: 7 });
  check("leaves the name's description empty when it cannot be encoded",
    named === "map.0_2.0_5.0_.0_7.xml" && C.parseSaveXmlName(named).description === "");
  check("still encodes one the old console can read",
    C.parseSaveXmlName(C.buildSaveXmlName({ description: "abc", slot: 1, timestamp: 2, size: 3 })).description === "abc");

  const payload = { files: [
    { name: "map.0_1.0_100.0_.0_5.xml", description: "one", size: 5, mtime: 10, slot: 1, saved: 100 },
    { name: "map.0_2.0_300.0_.0_7.xml", description: "two", size: 7, mtime: 30, slot: 2, saved: 300 }] };
  check("newest first", C.savedConfigsFrom(payload).map((f) => f.slot).join() === "2,1");
  check("carries description, size and time",
    C.savedConfigsFrom(payload)[0].description === "two" && C.savedConfigsFrom(payload)[0].mtime === 30);
  // an older device answers names only, and everything has to come from them
  const legacy = C.savedConfigsFrom({ save_xml_list: ["map.0_3.0_200.0_Mw==.0_9.xml"] });
  check("falls back to the name on an older device",
    legacy.length === 1 && legacy[0].description === "3" && legacy[0].size === 9 && legacy[0].mtime === null);
  check("a junk payload lists nothing",
    C.savedConfigsFrom(null).length === 0 && C.savedConfigsFrom({}).length === 0);

  check("reuses the lowest free slot", C.nextSaveSlot([{ slot: 1 }, { slot: 3 }]) === 2);
  check("starts at one", C.nextSaveSlot([]) === 1 && C.nextSaveSlot(null) === 1);
  check("ignores rows with no slot", C.nextSaveSlot([{ slot: null }, { slot: 1 }]) === 2);

  check("formats a time", /\d/.test(C.formatSavedTime(1752200745, "en")));
  check("says nothing for a missing time",
    C.formatSavedTime(0) === "" && C.formatSavedTime(null) === "" && C.formatSavedTime("x") === "");
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} names the saved configurations`, !!I18N[lang]["sv.title"]);
  check(`${lang} warns that loading replaces the screen`, !!I18N[lang]["sv.loadBody"]);
}

/* ---------- extra running-config files (run1.xml…run15.xml) ---------- */
group("extra running-config files");
{
  check("offers exactly run1…run15", C.extraRunFileNames().length === 15 &&
    C.extraRunFileNames()[0] === "run1.xml" && C.extraRunFileNames()[14] === "run15.xml");
  check("accepts the whole range", C.extraRunFileNames().every((n) => C.isExtraRunFile(n)));
  check("rejects run16.xml", !C.isExtraRunFile("run16.xml"));
  check("rejects run0.xml", !C.isExtraRunFile("run0.xml"));
  // run.xml is edited on the export pane itself, so it must not appear in this list
  check("rejects run.xml", !C.isExtraRunFile("run.xml"));
  // the user asked for js files to be left out entirely
  check("rejects common.js", !C.isExtraRunFile("common.js") && !C.isExtraRunFile("mec.js"));
  check("rejects a traversing name", !C.isExtraRunFile("../run1.xml"));

  check("free names skip the taken ones",
    C.freeExtraRunFileNames(["run1.xml", "run3.xml"]).slice(0, 3).join() === "run2.xml,run4.xml,run5.xml");
  check("free names run out when all fifteen exist",
    C.freeExtraRunFileNames(C.extraRunFileNames()).length === 0);

  // the device sends both shapes; sizes come from the newer one
  const payload = { file_list: ["run.xml", "run1.xml", "run2.xml", "common.js"],
    files: [{ name: "run.xml", size: 3307 }, { name: "run1.xml", size: 2230654 },
            { name: "run2.xml", size: 94 }, { name: "common.js", size: 4890 }] };
  const listed = C.extraRunFilesFrom(payload);
  check("keeps only the extra xml files", listed.length === 2 && listed[0].name === "run1.xml");
  // the device lists alphabetically, which puts run10 between run1 and run2
  check("orders by number, not alphabetically",
    C.extraRunFilesFrom({ files: [{ name: "run10.xml", size: 1 }, { name: "run2.xml", size: 1 },
                                  { name: "run1.xml", size: 1 }, { name: "run15.xml", size: 1 }] })
      .map((f) => f.name).join() === "run1.xml,run2.xml,run10.xml,run15.xml");
  check("orders an older device's listing too",
    C.extraRunFilesFrom({ file_list: ["run10.xml", "run2.xml"] })
      .map((f) => f.name).join() === "run2.xml,run10.xml");
  check("carries the sizes through", listed[0].size === 2230654 && listed[1].size === 94);
  const legacy = C.extraRunFilesFrom({ file_list: ["run1.xml", "run.xml"] });
  check("an older device without sizes still lists", legacy.length === 1 && legacy[0].size === null);
  check("a junk payload lists nothing", C.extraRunFilesFrom(null).length === 0 &&
    C.extraRunFilesFrom({}).length === 0);

  check("a small file is editable", C.isExtraRunFileEditable(94));
  check("the limit itself is editable", C.isExtraRunFileEditable(C.EXTRA_RUN_FILE_EDIT_LIMIT));
  check("one byte over is not", !C.isExtraRunFileEditable(C.EXTRA_RUN_FILE_EDIT_LIMIT + 1));
  // Number(null) is 0, which would read as "small enough" -- unknown must not guess
  check("an unknown size is not editable", !C.isExtraRunFileEditable(null) &&
    !C.isExtraRunFileEditable(undefined));

  check("names the new file problems", C.newExtraRunFileProblem("", []) === "set.xfNamePick" &&
    C.newExtraRunFileProblem("run16.xml", []) === "set.xfNameRange" &&
    C.newExtraRunFileProblem("run2.xml", ["run2.xml"]) === "set.xfNameTaken");
  check("a free name in range is accepted", C.newExtraRunFileProblem("run2.xml", ["run1.xml"]) === "");

  check("the href escapes the name",
    C.extraRunFileHref("run1.xml") === "/grism/task/get_running_file?filename=run1.xml");

  check("sizes read in sensible units", C.formatFileSize(94) === "94 B" &&
    C.formatFileSize(4890).endsWith("KB") && C.formatFileSize(7320705).endsWith("MB"));
  check("a bad size formats to nothing", C.formatFileSize("x") === "" && C.formatFileSize(-1) === "");
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} names the run1-run15 limit`, /run1\.xml/.test(I18N[lang]["set.xfNameRange"] || ""));
  check(`${lang} has the other-files heading`, !!I18N[lang]["xf.title"]);
  check(`${lang} explains why a big file cannot be edited`, !!I18N[lang]["xf.tooBig"]);
}

/* ---------- T12S port speed ---------- */
group("port speed");
{
  check("the models with a switch, and only those",
    C.hasSpeedSwitch("T12S") && C.hasSpeedSwitch("GRISM-T12S") &&
    C.hasSpeedSwitch("T20") && C.hasSpeedSwitch("F2T12") && C.hasSpeedSwitch("T12") &&
    !C.hasSpeedSwitch("F4T4") && !C.hasSpeedSwitch("G8S") && !C.hasSpeedSwitch("HL1") &&
    !C.hasSpeedSwitch(""));

  const groupsOf = (m) => C.speedSwitch(m).groups.map((g) => `${g.name}:${g.ports.join(",")}`).join(" ");
  check("the T12S groups match the QLM wiring",
    groupsOf("T12S") === "qlm5_6:P0,P1,P2,P3 qlm3:P4,P5,P6,P7 qlm2:P8,P9,P10,P11");
  /* The IM8724 builds: four PIM halves on a T20, the second PIM only on the
     other two, and the ports each half carries differ between them. */
  check("T20 switches four halves",
    groupsOf("T20") === "pim0_sfp_left:P0,P1,P2,P3 pim0_sfp_right:P4,P5,P6,P7 " +
    "pim1_sfp_left:P8,P9,P10,P11 pim1_sfp_right:P12,P13,P14,P15");
  check("F2T12 switches two, starting at P2",
    groupsOf("F2T12") === "pim1_sfp_left:P2,P3,P4,P5 pim1_sfp_right:P6,P7,P8,P9");
  check("T12 switches two, starting at P0",
    groupsOf("T12") === "pim1_sfp_left:P0,P1,P2,P3 pim1_sfp_right:P4,P5,P6,P7");
  // "F2T12" and "T12S" both contain "T12"
  check("the longer model name wins",
    C.speedSwitch("F2T12").model === "F2T12" && C.speedSwitch("T12S").model === "T12S" &&
    C.speedSwitch("T12").model === "T12");
  check("the IM builds share one endpoint, the T12S has its own",
    ["T20", "F2T12", "T12"].every((m) => C.speedSwitch(m).url === "/grism/task/set_im_speed") &&
    C.speedSwitch("T12S").url === "/grism/task/set_t12s_speed");

  // the device reports speeds as numbers, not strings
  const cfg = { interfaces: [
    { name: "qlm2", type: "XFI", ports: [{ name: "P8", speed: 10000 }, { name: "P9", speed: 10000 }] },
    { name: "qlm3", type: "SGMII", ports: [{ name: "P4", speed: 1000 }] },
    { name: "qlm5_6", type: "SGMII", ports: [{ name: "P0", speed: 1000 }] },
    { name: null, type: "LOOP", ports: [{ name: "P12", speed: 10000 }] },
  ] };
  const sp = C.groupSpeeds(cfg, C.speedSwitch("T12S"));
  check("each group reads its current speed",
    sp.qlm2 === "10000" && sp.qlm3 === "1000" && sp.qlm5_6 === "1000");
  check("interfaces outside the groups are ignored", Object.keys(sp).length === 3);

  // A G8S reports no interface names at all; a group we cannot read must stay
  // out of the list rather than show up as a guess.
  check("an unreadable config yields no groups",
    Object.keys(C.groupSpeeds(null, C.speedSwitch("T12S"))).length === 0 &&
    Object.keys(C.groupSpeeds({ interfaces: [{ name: null, ports: [{ speed: 1000 }] }] }, C.speedSwitch("T12S"))).length === 0);
  check("an unexpected speed is not offered as current",
    Object.keys(C.groupSpeeds({ interfaces: [{ name: "qlm2", ports: [{ speed: 2500 }] }] }, C.speedSwitch("T12S"))).length === 0);

  /* .160 reports its two halves as XFI/10000 under the group names, the same
     shape the T12S uses. */
  const imCfg = { interfaces: [
    { name: "pim1_sfp_right", type: "XFI", ports: [{ name: "P6", speed: 10000 }, { name: "P7", speed: 10000 }] },
    { name: "pim1_sfp_left", type: "XFI", ports: [{ name: "P2", speed: 10000 }] },
    { name: null, type: "XLAUI", ports: [{ name: "P0", speed: 40000 }] },
  ] };
  const imSp = C.groupSpeeds(imCfg, C.speedSwitch("F2T12"));
  check("an F2T12 reads both halves",
    imSp.pim1_sfp_left === "10000" && imSp.pim1_sfp_right === "10000" &&
    Object.keys(imSp).length === 2);
  check("an F4T4 has nothing to read", C.speedSwitch("F4T4") === null);

  check("speeds are labelled in the units the front panel uses",
    C.formatPortSpeed("1000") === "1G" && C.formatPortSpeed("10000") === "10G" &&
    C.formatPortSpeed("") === "");
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} warns that the speed switch reboots`,
    /restart|重(新)?開機/.test(I18N[lang]["set.speedConfirmBody"] || ""));
  check(`${lang} labels every speed-switch phase`,
    ["updating", "rebooting", "done"].every((p) => !!I18N[lang]["set.spPhase." + p]));
  check(`${lang} labels the staged speed apply`,
    !!I18N[lang]["set.speedApply"] && !!I18N[lang]["set.speedChanged"]);
  // the card stages all three groups and submits once, so the note must not
  // promise a reboot per switch
  check(`${lang} says the groups are applied together`,
    /apply once|once|一次/.test(I18N[lang]["set.speedNote"] || ""));
}

/* ---------- SD-WAN tunnel correlation ---------- */
group("SD-WAN tunnels");
{
  check("a port list is comma separated and trimmed",
    JSON.stringify(C.parsePortList(" P0 , P4 ,, ")) === '["P0","P4"]' &&
    C.parsePortList(null).length === 0 && C.parsePortList("   ").length === 0);

  check("formatting drops duplicates", C.formatPortList(["P0", "P4", "P0"]) === "P0,P4");

  check("toggling adds and removes",
    C.togglePortInList("P0", "P4") === "P0,P4" && C.togglePortInList("P0,P4", "P0") === "P4");

  const ports = ["P0", "P1", "P2", "P3"];
  const kinds = (v) => C.sdwanProblems(v, ports).map((x) => x.tunnel + ":" + x.kind).join(" ");

  check("correlation with ports is fine",
    kinds({ grel2Correlation: true, grel2CorrelationPort: "P0,P2" }) === "");

  // the firmware resolves these by name and silently drops what it cannot find,
  // so an empty list is a setting that looks on and does nothing
  check("correlation on with no port is a problem",
    kinds({ grel2Correlation: true, grel2CorrelationPort: "" }) === "l2gre:noPorts");
  check("correlation off with no port is not",
    kinds({ grel2Correlation: false, grel2CorrelationPort: "" }) === "");
  check("a port this device does not have is a problem",
    kinds({ vxlanCorrelation: true, vxlanCorrelationPort: "P0,P99" }) === "vxlan:unknownPort");
  check("each tunnel is reported on its own",
    kinds({ grel2Correlation: true, grel2CorrelationPort: "",
            vxlanCorrelation: true, vxlanCorrelationPort: "" }) === "l2gre:noPorts vxlan:noPorts");

  check("the key lifetime has to be whole seconds",
    kinds({ encapsulationEncryptKeyTimeout: "12x" }) === "encrypt:timeout" &&
    kinds({ encapsulationEncryptKeyTimeout: "600" }) === "" &&
    kinds({ encapsulationEncryptKeyTimeout: "" }) === "" &&
    kinds({ encapsulationEncryptKeyTimeout: 0 }) === "");

  // what the card submits, in the two places the device keeps it
  check("the args configSet carries all six keys", (() => {
    const xml = C.buildArgsConfigSet(Object.fromEntries(C.SDWAN_ARG_KEYS.map((k) => [k, ""])));
    return C.SDWAN_ARG_KEYS.every((k) => xml.includes("<" + k + ">"));
  })());
  check("booleans are written the way the device writes them",
    C.buildArgsConfigSet({ grel2Correlation: true, vxlanCorrelation: false })
      .includes("<grel2Correlation>True</grel2Correlation>"));
  check("decapsulation goes under filters/in-tunnels", (() => {
    const xml = C.buildInTunnelsConfigSet({ GRE: true, VXLAN: false });
    return xml.includes("<in-tunnels>") && xml.includes("<GRE>True</GRE>") && xml.includes("<VXLAN>False</VXLAN>");
  })());
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} says a zero key lifetime never expires`,
    !!I18N[lang]["set.sdwanKeyForever"] && /0/.test(I18N[lang]["set.sdwanKeyForever"]));
  check(`${lang} labels the open template in the header`,
    !!I18N[lang]["btn.fromTemplate"] && !!I18N[lang]["btn.fromTemplateTip"]);
  check(`${lang} names the SD-WAN card`, !!I18N[lang]["set.sdwan"] && !!I18N[lang]["set.sdwanNote"]);
  check(`${lang} explains both blocking problems`,
    !!I18N[lang]["set.sdwanNoPorts"] && !!I18N[lang]["set.sdwanKeyTimeoutBad"]);
}

/* ---------- SD-WAN templates ---------- */
group("SD-WAN templates");
{
  for (const id of ["sdwan-l2gre", "sdwan-vxlan"]) {
    const tpl = C.TEMPLATES.find((t) => t.id === id);
    check(`${id} is in the gallery with both languages`,
      !!tpl && !!tpl.title && !!tpl.title_zh && !!tpl.blurb && !!tpl.blurb_zh);
    const doc = C.normalizeDoc(tpl.make());
    check(`${id} builds one filter, two outputs and two chains`,
      doc.filters.length === 1 && doc.outputs.length === 2 && doc.chains.length === 2);
    // the firmware takes f1 or F1; this editor only resolves F1, so the template
    // must not ship the lowercase form
    check(`${id} references its filter as F1`, doc.chains[0].tree.fids === "F1");
    // every top-level element is named, so the chain flow and the health panel
    // can say what they refer to instead of showing bare ids
    check(`${id} names its filter, both outputs and the action`,
      !!doc.filters[0].name && doc.outputs.every((o) => !!o.name) && doc.actions.every((a) => !!a.name));
    check(`${id} names survive a round trip through the serialiser`, (() => {
      const xml = (C.serializeRun ?? C.buildRunXml)(doc);
      const back = C.normalizeDoc(C.parseRun(xml).doc);
      return back.filters[0].name === doc.filters[0].name &&
        back.outputs.map((o) => o.name).join("|") === doc.outputs.map((o) => o.name).join("|") &&
        back.actions[0].name === doc.actions[0].name;
    })());
    check(`${id} answers ARP and ICMP for the tunnel address`,
      JSON.stringify(doc).includes("arp_reply_default_mac") && JSON.stringify(doc).includes("icmp_reply"));
  }

  const l2 = C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "sdwan-l2gre").make());
  const vx = C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "sdwan-vxlan").make());
  const mods = (d) => d.outputs.flatMap((o) => (o.mods ?? []).map((m) => m.k + "=" + m.val)).join(" ");
  check("L2GRE strips gre out and tags l2gre back", mods(l2) === "stripping=gre tagging=l2gre");
  check("VXLAN strips vxlan out and tags vxlan back", mods(vx) === "stripping=vxlan tagging=vxlan");
  check("each matches on its own tunnel",
    l2.filters[0].root.children[0].field === "gre" && vx.filters[0].root.children[0].field === "vxlan");

  // a find name not in the catalogue is dropped by the device, leaving a filter
  // that matches on less than it looks like it does
  const known = new Set(C.FIELDS.flatMap((g) => g.items).map((f) => f.v));
  check("both find names are in the field catalogue", known.has("gre") && known.has("vxlan"));

  const { readFileSync: rf, existsSync: ex } = await import("node:fs");
  const XSD = "/data/Grism/doc/run.xsd";
  const schema = ex(XSD) ? C.parseXsd(rf(XSD, "utf8")) : null;
  for (const [name, xml] of Object.entries(C.SDWAN_TEMPLATE_XML)) {
    if (schema) check(`${name} template XML validates against run.xsd`,
      C.validateAgainstXsd(xml, schema).length === 0);
    check(`${name} template XML has no grism-level problems`,
      C.grismXmlProblems(xml).length === 0);
  }
}

/* ---------- pcap replay template / optional ids ---------- */
group("replay template");
{
  const { readFileSync: rf, existsSync: ex } = await import("node:fs");
  const XSD = "/data/Grism/doc/run.xsd";
  const schema = ex(XSD) ? C.parseXsd(rf(XSD, "utf8")) : null;
  if (schema) check("the replay XML validates", C.validateAgainstXsd(C.PCAP_REPLAY_XML, schema).length === 0);
  check("the replay XML has no grism-level problems", C.grismXmlProblems(C.PCAP_REPLAY_XML).length === 0);

  const d = C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "pcap-replay").make());
  check("it is one replay input and nothing else",
    d.inputs.length === 1 && d.filters.length === 0 && d.chains.length === 0);
  const i = d.inputs[0];
  check("named, on P0, playing the sample once a millisecond apart",
    i.name === "replay sample" && i.type === "replayPcap" && i.port === "P0" &&
    i.filepaths[0] === "H1/in/sample.pcap" && i.fields.time === "1" && i.fields.msinterval === "1");
  check("no alt", !i.alt);
  for (const lang of Object.keys(I18N)) void lang;
  const tpl = C.TEMPLATES.find((t) => t.id === "pcap-replay");
  // the file is not part of the template, and a replay of a file that is not
  // there does nothing at all -- so the card has to say so
  check("both blurbs say the pcap has to be uploaded",
    /upload/i.test(tpl.blurb) && /上傳/.test(tpl.blurb_zh));

  /* <action id> and <input id> are both optional in run.xsd, and nothing refers
     to either by id -- this editor has no <aid>, and the firmware has no way to
     name an input. Imported ids are kept as selection keys and dropped on the
     way out. Filters and outputs are different: their ids are use="required"
     and chains reference them as F1 / O2. */
  const acted = C.normalizeDoc(C.parseRun(
    `<run><action id="7" type="input-packet-process" name="keep"><port>P3</port></action></run>`).doc);
  const out = (C.serializeRun ?? C.buildRunXml)(acted);
  check("an imported action id is dropped on the way out",
    !/<action[^>]*\bid=/.test(out) && /name="keep"/.test(out) && /type="input-packet-process"/.test(out));
  if (schema) check("an action without an id still validates",
    C.validateAgainstXsd(out, schema).length === 0);

  const inped = C.normalizeDoc(C.parseRun(
    `<run><input id="5" type="replayPcap" name="keep" alt="a"><port>P0</port><filepath>x.pcap</filepath></input></run>`).doc);
  const iout = (C.serializeRun ?? C.buildRunXml)(inped);
  check("an imported input id is dropped too, keeping name and alt",
    !/<input[^>]*\bid=/.test(iout) && /name="keep"/.test(iout) && /alt="a"/.test(iout));
  if (schema) check("an input without an id still validates",
    C.validateAgainstXsd(iout, schema).length === 0);

  // the ids that are required must survive
  const keep = C.normalizeDoc(C.parseRun(
    `<run><filter id="3"><or><find name="gre" relation="==" content=""/></or></filter>
     <output id="4"><port>P1</port></output>
     <chain><in>P0</in><fid>F3</fid><out>O4</out></chain></run>`).doc);
  const kout = (C.serializeRun ?? C.buildRunXml)(keep);
  check("filter and output ids are still written",
    /<filter id="3"/.test(kout) && /<output id="4"/.test(kout) &&
    /<fid>F3<\/fid>/.test(kout) && /<out>O4<\/out>/.test(kout));
}

/* ---------- every template, end to end ---------- */
group("template gallery");
{
  const { readFileSync: rf, existsSync: ex } = await import("node:fs");
  const XSD = "/data/Grism/doc/run.xsd";
  const schema = ex(XSD) ? C.parseXsd(rf(XSD, "utf8")) : null;
  let broke = [], invalid = [], weak = [];
  for (const t of C.TEMPLATES) {
    const d = C.normalizeDoc(t.make());
    let xml = null;
    // a template that is only an action, or only an input, still has to
    // serialise -- normalizeDoc fills the collections make() left out
    try { xml = (C.serializeRun ?? C.buildRunXml)(d); } catch { broke.push(t.id); continue; }
    if (schema && C.validateAgainstXsd(xml, schema).length) invalid.push(t.id);
    for (const f of d.filters) if (!f.name || /^(match|target)$/i.test(f.name)) weak.push(t.id + ":F" + f.id);
    for (const o of d.outputs) if (!o.name) weak.push(t.id + ":O" + o.id);
    for (const i of d.inputs) if (!i.name) weak.push(t.id + ":I" + i.id);
  }
  check("every template serialises", broke.length === 0, broke.join(" "));
  check("every template validates against run.xsd", invalid.length === 0, invalid.join(" "));
  // "match" says nothing about what it matches
  check("no filter, output or input is left unnamed or vaguely named", weak.length === 0, weak.join(" "));

  const strip = C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "ingress-strip").make());
  check("the VLAN template is the action and a plain forward, with no filter",
    strip.filters.length === 0 && strip.actions.length === 1 && strip.chains.length === 1 &&
    strip.chains[0].tree.t === "out");
}

/* ---------- overview: where a chain's output lands ---------- */
group("chain output labels");
{
  const d = C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "sdwan-l2gre").make());
  const info = C.describeDoc(d, (k) => k);
  // a chain sends to "O2", which on its own says nothing about the port
  check("each output resolves to its port and name",
    info.outputInfo.O2?.port === "P0" && info.outputInfo.O2?.name === "strip L2GRE to P0" &&
    info.outputInfo.O3?.port === "P1" && info.outputInfo.O3?.name === "tag L2GRE to P1");

  const plain = C.describeDoc(C.normalizeDoc(C.TEMPLATES.find((t) => t.id === "minimal").make()), (k) => k);
  check("a document with no outputs resolves nothing", Object.keys(plain.outputInfo).length === 0);

  const unnamed = C.describeDoc(C.normalizeDoc(C.parseRun(
    `<run><output id="9"><port>P4</port></output><chain><in>P0</in><out>O9</out></chain></run>`).doc), (k) => k);
  check("an unnamed output still resolves its port",
    unnamed.outputInfo.O9?.port === "P4" && unnamed.outputInfo.O9?.name === "");

  // the same resolver backs the simulator's outcome node
  const idx = C.outputIndex(d);
  check("destLabel reads port and name", C.destLabel("O2", idx) === "P0 · strip L2GRE to P0");
  check("destLabel trims the token", C.destLabel(" O3 ", idx) === "P1 · tag L2GRE to P1");
  check("a plain port has nothing to resolve",
    C.destLabel("P1", idx) === "" && C.destLabel("", idx) === "" && C.destLabel("O9", idx) === "");
  const noName = C.outputIndex(C.normalizeDoc(C.parseRun(
    `<run><output id="9"><port>P4</port></output></run>`).doc));
  check("an unnamed output resolves to the port alone", C.destLabel("O9", noName) === "P4");
}

/* ---------- L2GRE correlation table ---------- */
group("L2GRE correlation");
{
  const sample = JSON.parse(`{"ts":1789728588322,"gre_l2_correlation_table":[[8957,"26:50:31:a5:04:21","00:18:23:ee:03:2d","02:01:00:00:00:00","192.168.1.162","192.168.1.6",0],[22310,"be:fb:5e:e7:29:e0","00:18:23:ee:02:b5","02:01:00:00:00:00","192.168.1.163","192.168.1.6",12]],"gre_l2_correlation_table_count":2,"gre_l2_correlation_table_non_displayed_count":3}`);
  const p = C.parseL2greCorrelation(sample);
  check("reads the device's own count and the truncation count", p.count === 2 && p.hidden === 3);
  // the row is a fixed array; the first element is an internal slot number
  check("maps the row positions to their fields", (() => {
    const r = p.rows[0];
    return r.innerMac === "26:50:31:a5:04:21" && r.outerSrcMac === "00:18:23:ee:03:2d" &&
      r.outerDstMac === "02:01:00:00:00:00" && r.outerSrcIp === "192.168.1.162" &&
      r.outerDstIp === "192.168.1.6" && r.ageSec === 0;
  })());
  check("keeps the age of each entry", p.rows[1].ageSec === 12);

  // a device that is not decapsulating L2GRE has no table, and the page hides
  check("an empty table reads as zero",
    C.parseL2greCorrelation({ gre_l2_correlation_table: [], gre_l2_correlation_table_count: 0 }).count === 0);
  check("anything unexpected reads as zero rather than throwing",
    C.parseL2greCorrelation(null).rows.length === 0 &&
    C.parseL2greCorrelation({}).rows.length === 0 &&
    C.parseL2greCorrelation({ gre_l2_correlation_table: "nope" }).rows.length === 0 &&
    C.parseL2greCorrelation({ gre_l2_correlation_table: [[1, "aa"], null, 7] }).rows.length === 0);
  check("a count the device did not send falls back to the rows it did",
    C.parseL2greCorrelation({ gre_l2_correlation_table: sample.gre_l2_correlation_table }).count === 2);
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} names the L2GRE page and its three columns`,
    !!I18N[lang]["tab.trafficL2gre"] && !!I18N[lang]["l2g.outerDst"] &&
    !!I18N[lang]["l2g.outerSrc"] && !!I18N[lang]["l2g.inner"]);
}

/* ---------- suggested names ---------- */
group("name suggestions");
{
  const of = (id) => C.normalizeDoc(C.TEMPLATES.find((t) => t.id === id).make());
  const l2 = of("sdwan-l2gre");
  check("a filter is named for its first condition",
    C.suggestName("filter", l2.filters[0]) === "gre" &&
    C.suggestName("filter", of("loadbalance").filters[0]) === "tcp.port 443");
  // a filter with more than one condition says how many more
  check("extra conditions are counted, not listed",
    /\+5$/.test(C.suggestName("filter", of("geo-recursive").filters[0])));

  check("an output is named for what it does to the traffic",
    C.suggestName("output", l2.outputs[0]) === "strip gre to P0" &&
    C.suggestName("output", l2.outputs[1]) === "tag l2gre to P1");
  // vxlan_sip / vxlan_dip / vxlan_vni are one encapsulation, not three settings
  check("an encapsulation family collapses to its name",
    C.suggestName("output", of("vxlan-encap").outputs[0]) === "vxlan to P7");
  check("an output with no modifiers is named for its port",
    C.suggestName("output", { port: "P3", mods: [] }) === "to P3");

  check("an action is named for its first modifier and port",
    C.suggestName("action", of("ingress-strip").actions[0]) === "strip vlan on P0");
  check("a link-pair action names both ports",
    C.suggestName("action", { type: "linkpairs", portA: "P1", portB: "P2" }) === "link P1-P2");

  check("a replay input is named for its file",
    C.suggestName("input", of("pcap-replay").inputs[0]) === "replay sample.pcap");

  check("nothing to go on yields nothing, never a bad name",
    ["filter", "output", "action", "input"].every((k) => C.suggestName(k, {}) === "") &&
    C.suggestName("filter", null) === "" && C.suggestName("nope", {}) === "");

  // the suggestion is a label, not a paragraph
  const long = C.suggestName("filter", { root: { t: "find", field: "http.request.uri.path.and.then.some.more", rel: "==", val: "/a/very/long/path/that/keeps/going" } });
  check("a long suggestion is truncated", long.length <= 40 && long.endsWith("…"));
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} labels the take-suggestion button`,
    !!I18N[lang]["common.use"] && !!I18N[lang]["common.useSuggested"]);
}

/* ---------- chain layout ---------- */
group("chain layout");
{
  let uid = 0;
  const out = (p) => ({ id: "o" + (++uid), t: "out", ports: p, mode: "duplicate", lb: "5thash" });
  const spine = (n) => n === 0 ? out("P9")
    : { id: "b" + (++uid), t: "branch", fids: "F" + n, fidOp: "or", match: out("P" + n), notmatch: spine(n - 1) };
  const fork = (n) => n === 0 ? out("P9")
    : { id: "f" + (++uid), t: "branch", fids: "F" + n, fidOp: "or", match: fork(n - 1), notmatch: fork(n - 1) };

  /* A chain where one side ends and the other carries on is a spine, and used
     to cost a column per test -- ten tests ran to 2000px. */
  const w = (tree) => Math.round(C.layoutChain({ ports: "P0", tree }).totalW);
  check("a spine stops widening once both sides are in use",
    w(spine(4)) === w(spine(8)) && w(spine(8)) === w(spine(12)));
  check("a spine stays three columns wide", w(spine(12)) < 600);
  /* The asides alternate, so the spine runs down the middle rather than
     hugging one edge with everything trailing off the other way. */
  check("the spine sits in the middle", (() => {
    const L = C.layoutChain({ ports: "P0", tree: spine(8) });
    const xs = [...new Set(L.placed.filter((n) => n.t === "branch").map((n) => n._x))];
    if (xs.length !== 1) return false;
    const left = xs[0], right = L.totalW - (xs[0] + C.NODE_W);
    return Math.abs(left - right) < C.NODE_W;     // roughly even either side
  })());
  check("asides land on both sides of the spine", (() => {
    const L = C.layoutChain({ ports: "P0", tree: spine(6) });
    const sx = L.placed.find((n) => n.t === "branch")._x;
    const outs = L.placed.filter((n) => n.t === "out" || n.t === "unset");
    return outs.some((n) => n._x < sx) && outs.some((n) => n._x > sx);
  })());
  check("depth still costs height", (() => {
    const a = C.layoutChain({ ports: "P0", tree: spine(2) }).totalH;
    const b = C.layoutChain({ ports: "P0", tree: spine(8) }).totalH;
    return b > a;
  })());

  // a genuine fork has two paths to draw and still spreads
  check("a real fork still spreads out", w(fork(3)) > w(fork(2)) && w(fork(2)) > w(fork(1)));

  // whatever the shape, nothing may be placed outside the reported width, and
  // no two nodes may occupy the same space -- a filter drawn over an output
  for (const [name, tree] of [["spine", spine(7)], ["fork", fork(3)],
      ["spine then fork", { id: "sf", t: "branch", fids: "F1", fidOp: "or", match: out("P1"),
        notmatch: { id: "sf2", t: "branch", fids: "F2", fidOp: "or", match: out("P2"), notmatch: fork(2) } }],
      ["fork then spine", { id: "fs", t: "branch", fids: "F1", fidOp: "or", match: spine(3), notmatch: spine(4) }],
      ["one sided", { id: "os", t: "branch", fids: "F1", fidOp: "or", match: out("P1"), notmatch: null }],
      ["mixed", { id: "m", t: "branch", fids: "F1", fidOp: "or", match: spine(4), notmatch: fork(2) }]]) {
    const L = C.layoutChain({ ports: "P0", tree });
    check(`${name}: every node sits inside the reported width`,
      L.placed.every((n) => n._x >= 0 && n._x + C.NODE_W <= L.totalW + 1), name);
    check(`${name}: every node sits inside the reported height`,
      L.placed.every((n) => n._y >= 0 && n._y < L.totalH));
    // an edge that names a node the layout never placed would draw to nowhere
    const ids = new Set(L.placed.map((n) => n.id));
    check(`${name}: every edge joins two placed nodes`,
      L.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
    check(`${name}: no node is placed twice`, ids.size === L.placed.length);
    /* The aside of a spine sits beside the node that carries on, and that node
       drifts right when it is itself a fork -- which is how a filter came to be
       drawn on top of an output. */
    const clash = [];
    for (let i = 0; i < L.placed.length; i++) for (let j = i + 1; j < L.placed.length; j++) {
      const a = L.placed[i], b = L.placed[j];
      if (a._x < b._x + C.NODE_W && b._x < a._x + C.NODE_W &&
          a._y < b._y + C.NODE_H && b._y < a._y + C.NODE_H)
        clash.push(`${a.t}:${a.id}@${a._x},${a._y} over ${b.t}:${b.id}@${b._x},${b._y}`);
    }
    check(`${name}: no two nodes overlap`, clash.length === 0, clash[0] ?? "");
  }
}

/* ---------- truncated summaries ---------- */
group("truncated summaries");
{
  /* A list cut at three used to read as the whole list: the chain rail stopped
     at three outputs, and the picker's badge counted the three it had room for
     rather than everything chosen. Both have to say how many there really are. */
  const src = (await import("node:fs")).readFileSync(new URL("./GrismStudio.jsx", import.meta.url), "utf8");
  // the rail lists three and puts the rest behind a "+N" that expands
  check("the chain rail can expand its remainder",
    /all\.slice\(0, 3\)/.test(src) && /dest-more/.test(src) && /setDestOpen\(c\.cid\)/.test(src));
  check("the picker badge counts every chosen row",
    /chosenAll\.length > 2 && <span className="acc-count">\{chosenAll\.length\}/.test(src));
  // the header fills its width and CSS clips it, rather than stopping at three
  check("the header is not truncated in JS", !/chosenAll\.slice\(/.test(src));
}

/* ---------- virtual ports ---------- */
group("virtual ports");
{
  const cfg = { interfaces: [{ type: "VPORT", ports: [
    { name: "V3", port: "P6,P7", vlanid: 103 },
    { name: "V4", port: "P6,P7", vlanid: 104 },
    { name: "V5", port: "P0", vlanid: 0 }] }] };
  const vs = C.parseVports(cfg);
  check("reads name, members and vlan off the device config",
    vs.length === 3 && vs[0].name === "V3" && vs[0].ports === "P6,P7" && vs[0].vlanid === "103");
  // the device writes 0 for "no VLAN", which is not a VLAN id
  check("vlan 0 reads as no vlan", vs[2].vlanid === "");
  check("a device with no virtual ports reads as none",
    C.parseVports({}).length === 0 && C.parseVports(null).length === 0);

  const xml = C.buildVportConfigSet({
    adds: [{ name: "V3", ports: "P6,P7", vlanid: "103" }, { name: "V4", ports: " P6 , P7 ", vlanid: "104" }],
    deletes: ["V0", "V1"] });
  check("the configSet does not reboot on its own", xml.includes('<configSet reboot="no">'));
  check("adds and deletes go in one <find type=\"VPORT\">",
    (xml.match(/<find type="VPORT">/g) ?? []).length === 1 &&
    (xml.match(/type="add"/g) ?? []).length === 2 && (xml.match(/type="delete"/g) ?? []).length === 2);
  check("a row carries name, ports and vlan",
    xml.includes("<ports type=\"add\"><name>V3</name><port>P6,P7</port><vlanid>103</vlanid></ports>"));
  check("member ports are trimmed", xml.includes("<port>P6,P7</port>") && !xml.includes(" , "));
  check("a delete names the port it removes", xml.includes('<ports type="delete" name="V0" />'));
  check("every row carries its vlan tag",
    (C.buildVportConfigSet({ adds: [{ name: "V9", ports: "P0", vlanid: "9" }] }).match(/<vlanid>9<\/vlanid>/g) ?? []).length === 1);

  const dev = ["P0", "P1", "P6", "P7"];
  const kinds = (o) => C.vportProblems({ ...o, devicePorts: dev }).map((x) => x.kind).join(" ");
  check("a good row has no problems", kinds({ adds: [{ name: "V9", ports: "P6,P7", vlanid: "103" }] }) === "");
  /* The VLAN id is what the group is addressed by, so a row without one is
     not a virtual port yet -- it is required rather than optional. */
  check("the vlan is required", kinds({ adds: [{ name: "V9", ports: "P6" }] }) === "noVlan" &&
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "" }] }) === "noVlan" &&
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: " " }] }) === "noVlan");
  check("and missing is reported as missing, not as malformed",
    kinds({ adds: [{ name: "V9", ports: "P6" }] }) !== "badVlan");
  check("a name has to look like V3",
    kinds({ adds: [{ name: "x9", ports: "P6", vlanid: "9" }] }) === "badName" &&
    kinds({ adds: [{ name: "", ports: "P6", vlanid: "9" }] }) === "noName");
  /* A name already in use would collide -- unless the port holding it is being
     removed in the same submit, which is one configSet and so one moment. */
  check("a name in use is a problem",
    kinds({ adds: [{ name: "V3", ports: "P6", vlanid: "9" }], existing: [{ name: "V3" }] }) === "duplicate");
  check("unless that port is being removed at the same time",
    kinds({ adds: [{ name: "V3", ports: "P6", vlanid: "9" }], existing: [{ name: "V3" }], deletes: ["V3"] }) === "");
  check("two new rows cannot share a name",
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "9" }, { name: "V9", ports: "P7", vlanid: "10" }] }) === "duplicate");
  check("members are required and must exist on the device",
    kinds({ adds: [{ name: "V9", ports: "", vlanid: "9" }] }) === "noPorts" &&
    kinds({ adds: [{ name: "V9", ports: "P6,P99", vlanid: "9" }] }) === "unknownPort");
  check("a vlan id is 1..4094",
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "0" }] }) === "badVlan" &&
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "4095" }] }) === "badVlan" &&
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "4094" }] }) === "");
  /* The row the + button offers next: stepping from a row without a vlan
     leaves the field empty, which the page then refuses to apply. */
  check("a stepped row carries the next vlan",
    C.nextVport({ name: "V3", ports: "P6,P7", vlanid: "103" }).vlanid === "104");
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} warns that virtual ports restart the device`,
    /restart|重(新)?開機/.test(I18N[lang]["set.vportConfirmBody"] || ""));
  // the restart screen has to say what it is waiting for, not borrow the
  // speed switch's wording
  check(`${lang} has its own restart phases for virtual ports`,
    ["updating", "rebooting", "done"].every((x) => !!I18N[lang]["set.vpPhase." + x]) &&
    I18N[lang]["set.vpPhase.done"] !== I18N[lang]["set.spPhase.done"]);
}

/* ---------- the next virtual port ---------- */
group("next virtual port");
{
  // adding a group of them is the common case, and they run consecutively
  check("follows on from the row above",
    JSON.stringify(C.nextVport({ name: "V4", ports: "P6,P7", vlanid: "104" }))
      === JSON.stringify({ name: "V5", ports: "P6,P7", vlanid: "105" }));
  check("keeps the members as they are",
    C.nextVport({ name: "V1", ports: "P0,P1,P2" }).ports === "P0,P1,P2");
  check("no vlan to step means no vlan", C.nextVport({ name: "V9", ports: "P0" }).vlanid === "");
  // 4094 is the last usable id, so there is nothing to step to
  check("a vlan at the top does not roll over",
    C.nextVport({ name: "V9", ports: "P0", vlanid: "4094" }).vlanid === "");
  check("a name that is not V<n> leaves the name to the user",
    C.nextVport({ name: "mgmt", ports: "P0", vlanid: "5" }).name === "");
  check("nothing to follow yields an empty row",
    JSON.stringify(C.nextVport(null)) === JSON.stringify({ name: "", ports: "", vlanid: "" }));
}

/* ---------- T12S front panel ---------- */
group("front panel");
{
  const L = C.panelLayout("T12S");
  check("twelve cages, one per physical port", L.cages.length === 12 &&
    new Set(L.cages.map((c) => c.name)).size === 12);
  check("every port from P0 to P11 is drawn",
    Array.from({ length: 12 }, (_, i) => "P" + i).every((n) => L.cages.some((c) => c.name === n)));

  /* The silkscreen reads odd above even: P1 over P0, P3 over P2. Getting this
     backwards would label a lit port as its neighbour. */
  const y = (n) => L.cages.find((c) => c.name === n).y;
  const x = (n) => L.cages.find((c) => c.name === n).x;
  check("the odd port of each pair is the upper cage",
    [[1, 0], [3, 2], [5, 4], [7, 6]].every(([odd, even]) => y("P" + odd) < y("P" + even)));
  check("each pair shares a column",
    [[1, 0], [3, 2], [5, 4], [7, 6]].every(([odd, even]) => x("P" + odd) === x("P" + even)));
  check("the pairs run left to right",
    x("P0") < x("P2") && x("P2") < x("P4") && x("P4") < x("P6"));
  check("P8 to P11 sit right of the blocks and in order",
    x("P8") > x("P7") && x("P8") < x("P9") && x("P9") < x("P10") && x("P10") < x("P11"));
  check("P8 to P11 share a row", new Set(["P8", "P9", "P10", "P11"].map(y)).size === 1);

  // the management port is left of P0 and must not sit on top of anything
  check("the management port is left of P0", L.mgmt.x + L.mgmt.w <= x("P0"));
  const boxes = [...L.cages, { name: "MGMT", ...L.mgmt }];
  const clash = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
      clash.push(a.name + "/" + b.name);
  }
  check("nothing overlaps anything", clash.length === 0, clash.join(" "));
  check("everything is inside the reported canvas",
    boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= L.width && b.y + b.h <= L.height));

  check("the management port is level with the lower row, beside P0",
    Math.abs(L.mgmt.y - y("P0")) < 12 && Math.abs(L.mgmt.y - y("P1")) > 20);
  // the blocks are the speed groups this page switches together
  check("a pair sits closer than two blocks do",
    (x("P2") - x("P0")) < (x("P4") - x("P2")));

  // what each cage shows
  const st = C.panelStates([
    { name: "P1", linkStatus: 1, inMbps: 3.2, outMbps: 0, speed: 1000 },
    { name: "P0", linkStatus: 0, inMbps: 0, outMbps: 0 },
    { name: "P2", linkStatus: "1", inMbps: "0.5", outMbps: null },
  ]);
  check("a live port reads its link and its rates",
    st.P1.link === true && st.P1.rx === 3.2 && st.P1.tx === 0);
  check("a dark port reads as down", st.P0.link === false);
  // the device sends numbers, but a string or a null must not light an arrow
  check("strings and nulls are handled",
    st.P2.link === true && st.P2.rx === 0.5 && st.P2.tx === 0);
  /* A port missing from the statistics is drawn dark rather than skipped --
     the panel is the shape of the box, not of the reply. */
  check("a port the device did not report is drawn, dark",
    st.P9 && st.P9.present === false && st.P9.link === false);
  check("nothing at all is still twelve ports",
    Object.keys(C.panelStates(null)).length === 12 &&
    Object.keys(C.panelStates([])).length === 12);

  /* The device formats Mbps to two decimals, so a link carrying a couple of
     packets a second reports 0.00 -- which used to read as idle. */
  const slow = C.panelPortState({ linkStatus: 1, inMbps: "0.00", inPps: 2, outMbps: 0, outPps: 0 });
  check("a slow link still shows activity", slow.rx === 2 && slow.tx === 0);
  check("counters on a down link move nothing", (() => {
    const d = C.panelPortState({ linkStatus: 0, inMbps: 5, outMbps: 5, inPps: 900 });
    return d.link === false && d.rx === 0 && d.tx === 0;
  })());

  check("the panel is drawn for the models that have one",
    C.hasFrontPanel("T12S") && C.hasFrontPanel("GRISM-T12S") && C.hasFrontPanel("G8S") &&
    !C.hasFrontPanel("HL1") && !C.hasFrontPanel(""));
  check("each model gets its own chassis",
    C.panelModel("T12S") === "T12S" && C.panelModel("G8S") === "G8S" && C.panelModel("HL1") === null);

  /* The G8S: eight copper jacks in four pairs, management on the right rather
     than the left, and the two bypass lamps the box carries. */
  const G = C.panelLayout("G8S");
  const gy = (n) => G.cages.find((c) => c.name === n).y;
  const gx = (n) => G.cages.find((c) => c.name === n).x;
  check("eight ports, P0 to P7", G.cages.length === 8 &&
    Array.from({ length: 8 }, (_, i) => "P" + i).every((n) => G.cages.some((c) => c.name === n)));
  check("odd above even, and each pair in one column",
    [[1, 0], [3, 2], [5, 4], [7, 6]].every(([o, e]) => gy("P" + o) < gy("P" + e) && gx("P" + o) === gx("P" + e)));
  check("the pairs run left to right", gx("P0") < gx("P2") && gx("P2") < gx("P4") && gx("P4") < gx("P6"));
  check("its management port is on the right, unlike the T12S",
    G.mgmt.x > gx("P7") && L.mgmt.x < L.cages.find((c) => c.name === "P0").x);
  check("copper jacks, not cages", G.kind === "rj45" && G.cages.every((c) => c.kind === "rj45") &&
    L.kind === "sfp" && L.cages.every((c) => c.kind === "sfp"));
  check("a lamp per bypass pair", (G.lamps ?? []).length === 2 &&
    G.lamps.map((x) => x.pair).join(",") === "1,2");
  check("both chassis carry a lamp per bypass pair",
    (L.lamps ?? []).length === 2 && L.lamps.map((x) => x.pair).join(",") === "1,2");
  check("the lamps sit left of the management port on both",
    L.lamps.every((l) => l.x < L.mgmt.x) && G.lamps.every((l) => l.x < G.mgmt.x));
  /* The panel sits above the table now, so it has to stay under about 2cm --
     75.6px at 96dpi, and the drawing renders at its own height. */
  check("both chassis fit in two centimetres", L.height <= 75 && G.height <= 75);
  /* The labels sit above the top row and below the bottom one, so the canvas
     has to leave room for them or they are cut off by its own edge. */
  /* The IM8724, in its four builds: two PIM slots, then the XOR module's four
     cages on the right, and the management jack on the strip in the middle
     where the USB socket is. */
  for (const [m, names] of [
    ["T20", "P0 P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P12 P13 P14 P15 P16 P17 P18 P19"],
    ["F2T12", "P0 P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P12 P13"],
    ["T12", "P0 P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11"],
    ["F4T4", "P0 P1 P2 P3 P4 P5 P6 P7"],
  ]) {
    const P = C.panelLayout(m);
    const at = (n) => P.cages.find((c) => c.name === n);
    check(`${m} draws every port once`,
      P.cages.map((c) => c.name).sort((a, b) => +a.slice(1) - +b.slice(1)).join(" ") === names);
    check(`${m} numbers top row even, bottom row odd`,
      P.cages.filter((c) => c.y === Math.min(...P.cages.map((x) => x.y)))
        .every((c) => +c.name.slice(1) % 2 === 0));
    check(`${m} puts the management jack between the slots and the XOR cages`,
      P.mgmt.x > at("P0").x && P.mgmt.x < at(names.split(" ").at(-1)).x);
    check(`${m} fits in two centimetres`, P.height <= 75);
  }
  /* The 40G builds put two wide cages where the others have eight */
  check("F2T12 and F4T4 draw their 40G cages wider than an SFP+",
    C.panelLayout("F4T4").cages.find((c) => c.name === "P0").w >
    C.panelLayout("T20").cages.find((c) => c.name === "P0").w);
  check("a T12S is not drawn as a T12",
    C.panelModel("T12S") === "T12S" && C.panelModel("T12") === "T12" &&
    C.panelModel("F2T12") === "F2T12");
  // the speed groups are the halves of a 2x4 block, so they have to be its ports
  for (const m of ["T20", "F2T12", "T12"]) {
    const drawn = new Set(C.panelLayout(m).cages.map((c) => c.name));
    check(`${m} switches speed on ports it draws`,
      C.speedSwitch(m).groups.every((g) => g.ports.every((p) => drawn.has(p))));
  }

  /* The G8 (SCB3240): the same eight jacks, but in one row in two blocks of
     four, numbered left to right, with one bypass pair on the right-hand two. */
  const G8 = C.panelLayout("G8");
  const g8x = (n) => G8.cages.find((c) => c.name === n).x;
  check("G8 draws eight jacks, P0 to P7", G8.cages.length === 8 &&
    Array.from({ length: 8 }, (_, i) => "P" + i).every((n) => G8.cages.some((c) => c.name === n)));
  check("G8 is one row, numbered left to right",
    new Set(G8.cages.map((c) => c.y)).size === 1 &&
    Array.from({ length: 7 }, (_, i) => i).every((i) => g8x("P" + i) < g8x("P" + (i + 1))));
  check("G8 leaves a gap between the two blocks of four",
    g8x("P4") - g8x("P3") > g8x("P2") - g8x("P1"));
  check("G8 management sits right of the ports", G8.mgmt.x > g8x("P7"));
  check("G8 jacks are copper", G8.kind === "rj45" && G8.cages.every((c) => c.kind === "rj45"));
  check("G8 carries one bypass lamp, for its one pair",
    (G8.lamps ?? []).length === 1 && G8.lamps[0].pair === 1);
  // "G8S" contains "G8": the G8S has to keep its own, taller drawing
  check("a G8S is not drawn as a G8", C.panelModel("G8S") === "G8S" &&
    C.panelModel("GRISM-G8S") === "G8S" && C.panelModel("G8") === "G8");
  for (const [name, P] of [["T12S", L], ["G8S", G], ["G8", G8]]) {
    const top = Math.min(...P.cages.map((c) => c.y));
    const bottom = Math.max(...P.cages.map((c) => c.y + c.h));
    check(`${name} leaves room for the labels above and below`,
      top >= 12 && P.height - bottom >= 12);
    check(`${name} fits in two centimetres`, P.height <= 75);
  }
  /* One set of lamp colours for both themes. They only read that way against
     something dark, so the sockets are dark in either theme -- if a later
     change lightens them, the lamps stop meaning anything. */
  {
    const { readFileSync: rf } = await import("node:fs");
    const css = rf(new URL("./GrismStudio.css", import.meta.url), "utf8");
    const varsOf = (block) => Object.fromEntries([...block.matchAll(/--fp-([a-z-]+)\s*:\s*(#[0-9a-f]{6})/gi)]
      .map((m) => [m[1], m[2]]));
    const dark = varsOf(css.slice(css.indexOf("--fp-chassis"), css.indexOf(".gs-root.light")));
    const light = varsOf(css.slice(css.indexOf(".gs-root.light")));
    check("both themes define all three lamps",
      ["up", "rx", "tx"].every((k) => !!dark[k] && !!light[k]));
    const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
      .map((s) => s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const weak = [];
    for (const [name, v] of [["dark", dark], ["light", light]])
      for (const k of ["up", "rx", "tx"]) {
        /* The lamps sit on the cage; the chassis is what surrounds it. Both
           have to hold, or a lit lamp is only a hue away from a dark one. */
        if (cr(v[k], v.cage) < 3) weak.push(`${name} ${k} vs cage ${cr(v[k], v.cage).toFixed(2)}`);
        if (cr(v[k], v.off) < 2.5) weak.push(`${name} ${k} vs unlit ${cr(v[k], v.off).toFixed(2)}`);
      }
    check("a lit lamp reads against its socket and against being unlit in both themes",
      weak.length === 0, weak.join(", "));
  }

  // on the box the management port sits beside the data ports, not across the chassis
  check("the G8S management port is next to P6, not at the far end", (() => {
    const p6 = G.cages.find((c) => c.name === "P6");
    return G.mgmt.x > p6.x && G.mgmt.x - (p6.x + p6.w) < 40;
  })());
  check("the lamps match the bypass pairs the device reports",
    L.lamps.map((l) => l.pair).join() === C.BYPASS_MODELS.T12S.pairs.map((p) => p.n).join() &&
    G.lamps.map((l) => l.pair).join() === C.BYPASS_MODELS.G8S.pairs.map((p) => p.n).join());
  const gclash = [];
  const gboxes = [...G.cages, { name: "MGMT", ...G.mgmt }];
  for (let i = 0; i < gboxes.length; i++) for (let j = i + 1; j < gboxes.length; j++) {
    const a = gboxes[i], b = gboxes[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) gclash.push(a.name + "/" + b.name);
  }
  check("nothing overlaps on the G8S either", gclash.length === 0, gclash.join(" "));
  check("everything is inside the G8S canvas",
    gboxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= G.width && b.y + b.h <= G.height));
  /* The Q16: sixteen SFP cages in two blocks, odd above even, exactly as the
     numbers are printed on the box. The cages are the device's V0-V15 -- the
     physical front ports are aggregated behind P0-P7, so drawing them by P
     name would light the wrong slot. */
  {
    const Q = C.q16PanelLayout();
    check("the Q16 has sixteen cages", Q.cages.length === 16);
    check("named for the ports the device reports",
      Q.cages.map((c) => c.name).sort((a, b) => +a.slice(1) - +b.slice(1)).join() ===
      Array.from({ length: 16 }, (_, i) => "V" + i).join());
    const topY = Math.min(...Q.cages.map((c) => c.y));
    check("odd numbers on top, even below", Q.cages.every((c) =>
      (+c.name.slice(1) % 2 === 1) === (c.y === topY)));
    // two blocks of eight: the gap between them is wider than between cages
    const xs = [...new Set(Q.cages.map((c) => c.x))].sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    check("two blocks of eight", gaps.filter((g) => g > Math.min(...gaps)).length === 1);
    const qboxes = [...Q.cages, { name: "MGMT", ...Q.mgmt }];
    const qclash = [];
    for (let i = 0; i < qboxes.length; i++) for (let j = i + 1; j < qboxes.length; j++) {
      const a = qboxes[i], b = qboxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) qclash.push(a.name + "/" + b.name);
    }
    check("nothing overlaps on the Q16", qclash.length === 0, qclash.join(" "));
    check("everything is inside its canvas",
      qboxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= Q.width && b.y + b.h <= Q.height));
    check("the management jack is to the right of every cage",
      Q.mgmt.x > Math.max(...Q.cages.map((c) => c.x + c.w)));
    // this chassis has no bypass relays, and the panel must not invent lamps
    check("no bypass lamps are drawn", (Q.lamps ?? []).length === 0);
    check("the model is recognised", C.panelModel("Q16") === "Q16" && C.hasFrontPanel("Q16"));
  }
  /* The T4G12 (ET2500) numbers its jacks down each column -- P0 above P1 --
     which is the opposite of every other chassis here. Getting this backwards
     would light the wrong jack on a box whose ports are its whole purpose. */
  {
    const T = C.t4g12PanelLayout();
    const topY = Math.min(...T.cages.map((c) => c.y));
    check("the T4G12 has sixteen ports", T.cages.length === 16);
    check("even numbers on top, odd below -- unlike the others",
      T.cages.every((c) => (+c.name.slice(1) % 2 === 0) === (c.y === topY)));
    check("P0 sits above P1", (() => {
      const p0 = T.cages.find((c) => c.name === "P0"), p1 = T.cages.find((c) => c.name === "P1");
      return p0.x === p1.x && p0.y < p1.y;
    })());
    // twelve copper, four fibre, as the box carries them
    check("twelve copper jacks and four SFP",
      T.cages.filter((c) => c.kind === "rj45").length === 12 &&
      T.cages.filter((c) => c.kind === "sfp").map((c) => c.name).join() === "P12,P13,P14,P15");
    check("the SFP cages are to the right of the copper",
      Math.min(...T.cages.filter((c) => c.kind === "sfp").map((c) => c.x)) >
      Math.max(...T.cages.filter((c) => c.kind === "rj45").map((c) => c.x)));
    /* Its management interface is a USB adapter, not a jack on the chassis --
       the panel says so rather than drawing a port that is not there. */
    check("the management interface is marked as USB", T.mgmt.kind === "usb");
    check("and sits outside the ports", T.mgmt.x > Math.max(...T.cages.map((c) => c.x + c.w)));
    const tboxes = [...T.cages, { name: "USB", ...T.mgmt }];
    const tclash = [];
    for (let i = 0; i < tboxes.length; i++) for (let j = i + 1; j < tboxes.length; j++) {
      const a = tboxes[i], b = tboxes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) tclash.push(a.name + "/" + b.name);
    }
    check("nothing overlaps on the T4G12", tclash.length === 0, tclash.join(" "));
    check("everything is inside its canvas",
      tboxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= T.width && b.y + b.h <= T.height));
    check("the model is recognised", C.panelModel("T4G12") === "T4G12" && C.hasFrontPanel("T4G12"));
  }
  check("states are keyed to the model asked for",
    Object.keys(C.panelStates([], "G8S")).length === 8 &&
    Object.keys(C.panelStates([], "T12S")).length === 12 &&
    Object.keys(C.panelStates([], "Q16")).length === 16 &&
    Object.keys(C.panelStates([], "T4G12")).length === 16);
}

/* ---------- simulate page: port buttons sized by how many there are -------- */
group("simulate panel density");
{
  check("a small device gets the roomy size, a dense one the small size",
    C.panelDensity(8) === "lg" && C.panelDensity(14) === "md" &&
    C.panelDensity(24) === "sm" && C.panelDensity(48) === "xs");
  // the two devices this ships to must not land in the same bucket, or the
  // buttons do not visibly answer to how many ports there are
  check("the G8S panel is roomier than the T12S one",
    C.panelDensity(12) === "lg" && C.panelDensity(16) === "md");
  check("nothing silly for an empty or missing count",
    C.panelDensity(0) === "lg" && C.panelDensity(undefined) === "lg");
  {
    const { readFileSync: rf } = await import("node:fs");
    const css = rf(new URL("./GrismStudio.css", import.meta.url), "utf8");
    const widthOf = (sel) => {
      const i = css.indexOf(sel);
      if (i < 0) return null;
      const m = /--dp-w\s*:\s*(\d+)px/.exec(css.slice(i, css.indexOf("}", i)));
      return m ? +m[1] : null;
    };
    const w = { base: widthOf(".dev-panel{"), lg: widthOf("[data-dense=lg]"), md: widthOf("[data-dense=md]"),
      sm: widthOf("[data-dense=sm]"), xs: widthOf("[data-dense=xs]") };
    check("every density the code can return is styled",
      ["lg", "md", "sm", "xs"].every((k) => w[k] > 0), JSON.stringify(w));
    // more ports must never mean a bigger button, or the row wraps
    check("the sizes go down as the port count goes up",
      w.lg > w.md && w.md > w.sm && w.sm > w.xs, JSON.stringify(w));
    // a button still has to be clickable at the densest setting
    check("even the densest button stays a usable target", w.xs >= 36);
    /* And a ceiling at the other end: with few ports there is width to make
       them enormous, which reads as a mistake rather than as generosity. */
    check("no port button grows past the ceiling", w.lg <= 76, `lg is ${w.lg}px`);
    check("the port button reads its width from the density variable",
      /\.dev-port\{[^}]*min-width:var\(--dp-w\)/.test(css.replace(/\s*\n\s*/g, "")));
  }
  /* The stream: packets keep arriving until stopped, and each one is routed by
     the filter switches as they stand when it enters. Both of those live in a
     rAF loop, so guard the two properties that make them true. */
  {
    const { readFileSync: rf } = await import("node:fs");
    const jsx = rf(new URL("./GrismStudio.jsx", import.meta.url), "utf8");
    const spawn = /SPAWN_MS\s*=\s*(\d+)/.exec(jsx);
    const minDur = /MIN_DUR\s*=\s*(\d+)/.exec(jsx);
    check("arrivals are spaced by their own interval", !!spawn && +spawn[1] > 0);
    // a gap longer than the shortest trip would leave the device empty between packets
    check("the stream never runs dry", spawn && minDur && +spawn[1] < +minDur[1],
      spawn && minDur ? `${spawn[1]} vs ${minDur[1]}` : "missing");
    // each launch reads the route from the ref, not from the render it started in
    check("a packet's route is resolved as it launches",
      /const plan = planRef\.current/.test(jsx));
    /* Enough ports and the port block wraps to a second row. The LOOP group
       must not wrap with it -- it is a column beside the block, not another
       item in it. */
    const css2 = rf(new URL("./GrismStudio.css", import.meta.url), "utf8");
    check("the port block and the LOOP group never wrap against each other",
      /\.dev-port-area\{[^}]*flex-wrap:nowrap/.test(css2));
    check("the port block still wraps internally",
      /\.dev-port-cols\{[^}]*flex-wrap:wrap/.test(css2));
    check("the LOOP group keeps its own width", /\.dev-loop-group\{[^}]*flex:0 0 auto/.test(css2));
    // changing a switch mid-stream must divert the next packet, not stop the stream
    const eff = jsx.slice(jsx.indexOf("planRef.current = animPlan"), jsx.indexOf("}, [animPlan]);"));
    check("a filter change does not stop the stream",
      /if \(!animPlan\)/.test(eff) && !/^\s*setPlayState\("idle"\);/m.test(eff.split("if (!animPlan)")[0]));
  }
}

/* ---------- audit fixes: no English left in the JSX ----------------------- */
group("everything on screen is translatable");
{
  const { readFileSync: rf } = await import("node:fs");
  const jsx = rf(new URL("./GrismStudio.jsx", import.meta.url), "utf8").split("\n");
  /* The default language is Chinese, so a literal in the JSX is a pane that
     renders in English against a translated surround -- which is how the chain
     editor, both of its modals and the whole simulate results panel ended up
     untranslated. Text between tags, and the four attributes a user can read.
     Known exceptions: a MIB filename and a path example. */
  /* Config vocabulary is shown as itself -- these are the values that go into
     the XML, and translating them would be wrong. Everything else is prose. */
  const ALLOW = [/PACKETX-MIB\.txt/, /H1\/in\/played/, /^run\.xml$/, /^studio$/,
    /^(replayPcap|traffic-gen|tagging|stripping|tcpreset|delete|backup|move)$/, /^pk\./,
    // a dotted lowercase identifier is a filter field name, not prose
    /^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/,
    // and a camelCase word with no spaces is a config key shown as itself
    /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/];
  // text after a tag counts too: the simulate legend hid four English words
  // behind a self-closing span and went unnoticed for exactly that reason
  const text = />\s*([A-Za-z][A-Za-z][A-Za-z ,'\-’.?:]{4,})\s*</g;
  const attr = /(emptyNote|title|placeholder|aria-label)="([A-Z][^"]{6,})"/g;
  const found = [];
  jsx.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || line.includes("console.")) return;
    for (const m of line.matchAll(text)) if (!ALLOW.some((r) => r.test(m[1]))) found.push(`${i + 1}: ${m[1]}`);
    for (const m of line.matchAll(attr)) if (!ALLOW.some((r) => r.test(m[2]))) found.push(`${i + 1}: ${m[1]}="${m[2]}"`);
  });
  check("no hard-coded English is rendered", found.length === 0, found.slice(0, 6).join(" | "));
}

/* ---------- the MEC mapping table, a page at a time ------------------------ */
group("S1AP item paging");
{
  const payload = {
    ts: 1789881232508,
    s1ap_items: [{ mmeid: 7, enbid: 1234, "erab5-req-ipv4": "10.0.0.1", "erab5-req-teid": "0000a1b2",
      "erab5-res-ipv4": "10.0.0.2", "erab5-res-teid": "0000c3d4", spid: 1, plmnid: "46692",
      cellid: "88", "ue-ipv4": "100.64.0.9", idle: 42 }],
    s1ap_items_count: [51234, 1000000],
    s1ap_items_matched: 51234,
    s1ap_items_page: [100, 1],
    s1ap_items_truncated: 0,
    s1ap_items_teid_count: [12, 1000000],
    s1ap_items_sip_count: [3, 1000000],
  };
  const p = C.parseS1apItems(payload);
  check("a row keeps every field an operator needs", (() => {
    const r = p.rows[0];
    return r.mmeid === 7 && r.enbid === 1234 && r.reqIp === "10.0.0.1" && r.reqTeid === "0000a1b2"
      && r.resIp === "10.0.0.2" && r.resTeid === "0000c3d4" && r.plmnid === "46692"
      && r.cellid === "88" && r.ueIp === "100.64.0.9" && r.idle === 42;
  })());
  check("the counts come through", p.matched === 51234 && p.offset === 100 && p.used === 51234 && p.capacity === 1000000);
  check("truncation is a flag, not a guess", p.truncated === false &&
    C.parseS1apItems({ ...payload, s1ap_items_truncated: 1 }).truncated === true);
  /* A device whose firmware predates paging answers without the new fields;
     then what came back is all there was. */
  check("an older firmware still reads", (() => {
    const old = C.parseS1apItems({ ts: 1, s1ap_items: [payload.s1ap_items[0]], s1ap_items_count: [1, 1000000] });
    return old.matched === 1 && old.offset === 0 && old.returned === 1 && old.truncated === false;
  })());
  check("nothing throws on an empty or broken payload",
    C.parseS1apItems({}).rows.length === 0 && C.parseS1apItems(null).matched === 0);

  // page arithmetic
  check("pages are counted from the matched rows",
    C.s1apPageCount(51234, 50) === 1025 && C.s1apPageCount(100, 50) === 2 && C.s1apPageCount(101, 50) === 3);
  check("an empty table is still page 1 of 1", C.s1apPageCount(0, 50) === 1);
  check("the window is what the device gets asked for",
    JSON.stringify(C.s1apWindow(1, 50)) === '{"offset":0,"limit":50}' &&
    JSON.stringify(C.s1apWindow(7, 50)) === '{"offset":300,"limit":50}');
  /* The table changes under the reader -- entries are cleared, the sweep runs.
     Page 40 of a table that now has 12 pages is page 12, not a blank screen. */
  check("a page past the end comes back to the last one", C.s1apClampPage(40, 600, 50) === 12);
  check("and never below the first", C.s1apClampPage(0, 600, 50) === 1 && C.s1apClampPage(-3, 600, 50) === 1);

  // the pager control
  check("the pager shows the ends and the neighbourhood",
    JSON.stringify(C.s1apPageList(1, 1)) === "[1]" &&
    JSON.stringify(C.s1apPageList(50, 1025)) === '[1,"gap",48,49,50,51,52,"gap",1025]');
  /* A gap standing in for a single number is worse than the number: it costs
     the same room and takes a click to reach what it hid. */
  check("a one-number gap is filled in instead",
    JSON.stringify(C.s1apPageList(1, 5)) === "[1,2,3,4,5]" &&
    JSON.stringify(C.s1apPageList(2, 6)) === "[1,2,3,4,5,6]");
  check("but a real gap stays a gap", C.s1apPageList(1, 40).includes("gap"));
  // a typed page: anything that is not one must not move the reader
  check("typing a page number jumps to it", C.s1apParsePage("7", 600, 50) === 7);
  check("typing past the end lands on the last page", C.s1apParsePage("999", 600, 50) === 12);
  check("typing nonsense does nothing",
    C.s1apParsePage("", 600, 50) === null && C.s1apParsePage("abc", 600, 50) === null &&
    C.s1apParsePage("-2", 600, 50) === null && C.s1apParsePage("3.5", 600, 50) === null);
  check("the sizes offered include the default", C.S1AP_PAGE_SIZES.includes(C.S1AP_PAGE_DEFAULT));

  /* The query the device is asked. "all" matters: without it the firmware
     drops every row that has no UE address yet (statistics.c). */
  /* Empty is the default: rows that have a UE address. "all" is the firmware's
     word for including the rows that do not have one yet, and it only goes on
     the wire when it is asked for. */
  check("by default it asks for the rows that have a UE address",
    C.s1apQuery({ page: 3, size: 50 }) === "ue-ipv4=&offset=100&limit=50");
  check("including the addressless rows is an explicit all",
    C.s1apQuery({ page: 1, size: 50, all: true }).startsWith("ue-ipv4=all&"));
  check("a typed filter wins over both",
    C.s1apQuery({ page: 1, size: 25, ue: "100.64.0.9", all: true }).startsWith("ue-ipv4=100.64.0.9&"));
  check("a subnet goes through as written",
    decodeURIComponent(C.s1apQuery({ ue: "172.16.0.0/16" })).includes("ue-ipv4=172.16.0.0/16"));
  // the firmware's pair: great-than=1 keeps rows idle longer than max-idle
  check("idle at most sends great-than=0",
    C.s1apQuery({ idleSecs: "600", idleOp: "le" }).includes("max-idle=600&great-than=0"));
  check("idle longer than sends great-than=1",
    C.s1apQuery({ idleSecs: "600", idleOp: "gt" }).includes("max-idle=600&great-than=1"));
  check("an empty or zero idle is no filter at all",
    !C.s1apQuery({ idleSecs: "" }).includes("max-idle") && !C.s1apQuery({ idleSecs: "0" }).includes("max-idle"));

  /* An address the firmware cannot parse drops every row, which reads as an
     empty table rather than as a typo -- so it is caught here. */
  check("a plain address and a subnet are accepted",
    C.s1apUeFilterProblem("100.64.0.9") === null && C.s1apUeFilterProblem("100.64.0.0/16") === null &&
    C.s1apUeFilterProblem("100.64.0.0/255.255.0.0") === null);
  check("blank and all are accepted",
    C.s1apUeFilterProblem("") === null && C.s1apUeFilterProblem("all") === null);
  check("nonsense is caught",
    !!C.s1apUeFilterProblem("banana") && !!C.s1apUeFilterProblem("100.64.0") &&
    !!C.s1apUeFilterProblem("300.1.1.1") && !!C.s1apUeFilterProblem("10.0.0.0/33"));
  check("idle seconds must be a whole number",
    C.s1apIdleProblem("600") === null && C.s1apIdleProblem("") === null && !!C.s1apIdleProblem("5m"));

  // a row range is a count, not a tile figure: 51,234 rather than 51.23K
  check("counts are grouped, not compacted",
    C.fmtCount(51234) === "51,234" && C.fmtCount(0) === "0" && C.fmtCount(1000000) === "1,000,000");
  check("idle time reads at a glance",
    C.fmtIdle(0) === "0s" && C.fmtIdle(45) === "45s" && C.fmtIdle(200) === "3m 20s" &&
    C.fmtIdle(7500) === "2h 05m" && C.fmtIdle(200000) === "2d 07h");
}

/* ---------- version strings as daemons print them --------------------------- */
group("service version strings");
{
  /* The boilerplate goes, the program stays: the row is named for the service
     (pyhttpd), not for the program answering (nginx), so a bare number would
     leave the reader guessing which of the two it belongs to. */
  check("a labelled version keeps the program and the number",
    C.shortVersion("nginx version: nginx/1.22.1") === "nginx 1.22.1" &&
    C.shortVersion("NET-SNMP version:  5.5.2.1") === "NET-SNMP 5.5.2.1");
  // OpenSSH names two products on one line; taking it apart would lose one
  check("a line naming two products is left alone",
    C.shortVersion("OpenSSH_10.2p1, OpenSSL 1.1.1t  7 Feb 2023") === "OpenSSH_10.2p1, OpenSSL 1.1.1t  7 Feb 2023");
  check("a bare number is already short", C.shortVersion("1.0.0") === "1.0.0");
  check("busybox keeps its banner", C.shortVersion("BusyBox v1.20.2 (2014-09-11) multi-call binary.")
    === "BusyBox v1.20.2 (2014-09-11) multi-call binary.");
  check("nothing in, nothing out", C.shortVersion("") === "" && C.shortVersion(null) === "");
}

/* ---------- port hardware addresses ---------------------------------------- */
group("port MAC lookup");
{
  const payload = { ts: 1, port_mac: [[0, "40:60:5a:02:df:66", "P0"], [1, "40:60:5a:02:df:67", "P1"]],
    management_port_mac: [[0, "40:60:5a:02:df:65", "M0"]] };
  const m = C.portMacMap(payload);
  // the settings page shows one table, so both lists fold into one map
  check("data and management ports are in the same map",
    m.P0 === "40:60:5a:02:df:66" && m.P1 === "40:60:5a:02:df:67" && m.M0 === "40:60:5a:02:df:65");
  check("a device that reports neither gives an empty map",
    Object.keys(C.portMacMap({})).length === 0 && Object.keys(C.portMacMap(null)).length === 0);
  // a short or blank row is dropped rather than becoming an empty cell
  check("malformed rows are ignored", (() => {
    const bad = C.portMacMap({ port_mac: [[0, "aa:bb"], [1, "", "P1"], [2, "cc:dd:ee:ff:00:11", "P2"], "nope"] });
    return Object.keys(bad).join() === "P2";
  })());
}

/* ---------- switch interface (cpss) ---------------------------------------- */
group("switch interface");
{
  const payload = { interfaces: [
    { name: "0/0", enable: true, link: false, speed: "1000", speed_support: ["1000", "10000", "25000"],
      fec: "None", fec_support: ["None", "FC", "RS", "RS-544"], gbic_part_number: "", gbic_serial: "",
      gbic_rx_power: "-inf dBm", gbic_tx_power: "-inf dBm" },
    { name: "0/1", enable: false, link: true, speed: "100000", speed_support: ["1000", "10000", "25000", "40000", "100000"],
      fec: "RS", fec_support: ["None", "RS"], gbic_part_number: "PN1", gbic_serial: "SN1",
      gbic_rx_power: "-2.1 dBm", gbic_tx_power: "-1.8 dBm" },
  ] };
  const rows = C.parseSwitchInterfaces(payload);
  check("both ports come through", rows.length === 2);
  check("what the operator can change is kept apart from what they cannot", (() => {
    const r = rows[1];
    return r.enable === false && r.link === true && r.speed === "100000" &&
      r.speedSupport.includes("100000") && r.fec === "RS" && r.gbicPn === "PN1" && r.rx === "-2.1 dBm";
  })());
  check("a broken payload gives no rows",
    C.parseSwitchInterfaces({}).length === 0 && C.parseSwitchInterfaces(null).length === 0);
  /* The back end shuts the three siblings down when a master bonds its lanes
     (views.py's hundred_g_mapping, which acts on 40G exactly as on 100G), so
     the page has to say so beforehand. */
  const victims = C.bondVictims(rows);
  check("a 100G port names the ports it takes with it",
    JSON.stringify(victims) === JSON.stringify({ "0/1": { speed: "100000", ports: ["0/0", "0/2", "0/3"] } }));
  check("40G takes them too -- four lanes either way",
    JSON.stringify(C.bondVictims(rows.map((r) => r.name === "0/1" ? { ...r, speed: "40000" } : r)))
      === JSON.stringify({ "0/1": { speed: "40000", ports: ["0/0", "0/2", "0/3"] } }));
  check("and says nothing when none is bonded",
    Object.keys(C.bondVictims(rows.map((r) => ({ ...r, speed: "25000" })))).length === 0);
  check("25G does not bond", C.BOND_SPEEDS.join() === "40000,100000");
  check("only the four masters can do it",
    Object.keys(C.LANE_GROUPS).join() === "0/1,0/5,0/9,0/13");
  // the switch says 0/N, the front of the box says VN
  check("switch names map to panel names",
    C.switchPanelName("0/13") === "V13" && C.switchPanelName("H1") === "H1");
  /* The traffic page reads the bonding off the counters it already has rather
     than asking the switch: the engine reports the master at its bonded speed
     and the three whose lanes it took at 0. */
  const stats = [
    { name: "V0", speed: 0 }, { name: "V1", speed: 100000 }, { name: "V2", speed: 0 },
    { name: "V3", speed: 0 }, { name: "V4", speed: 1000 }, { name: "V5", speed: 25000 },
    { name: "V13", speed: 40000 }, { name: "V12", speed: 0 },
    { name: "V14", speed: 0 }, { name: "V15", speed: 0 },
  ];
  const bonds = C.statsBonds(stats, "Q16");
  check("a bond is one port covering four, in panel names",
    bonds.length === 2 && bonds[0].master === "V1" && bonds[0].speed === "100000" &&
    bonds[0].members.join() === "V0,V1,V2,V3");
  check("40G bonds the same way", bonds[1].master === "V13" && bonds[1].speed === "40000" &&
    bonds[1].members.join() === "V12,V13,V14,V15");
  check("an ordinary speed on a master is no bond",
    C.statsBonds(stats.map((r) => r.name === "V1" ? { ...r, speed: 25000 } : r), "Q16").length === 1);
  check("a chassis whose cages do not bond never claims one",
    C.statsBonds(stats, "T12S").length === 0 && C.statsBonds(stats, "").length === 0);
  check("no statistics, no claim", C.statsBonds([], "Q16").length === 0);
  check("the traffic table can tell a member from the master",
    C.bondTag(bonds, "V2").master === "V1" && C.bondTag(bonds, "V4") === null);
  {
    const L = C.panelLayout("Q16");
    const M = C.bondPanelLayout(L, [bonds[0]]);
    check("the panel draws the bond as one cage, not four",
      M.cages.length === L.cages.length - 3);
    const wide = M.cages.find((c) => c.name === "V1");
    const four = ["V0", "V1", "V2", "V3"].map((n) => L.cages.find((c) => c.name === n));
    check("and it covers exactly the four it swallowed",
      wide.bond === "100000" &&
      wide.x === Math.min(...four.map((c) => c.x)) &&
      wide.y === Math.min(...four.map((c) => c.y)) &&
      wide.x + wide.w === Math.max(...four.map((c) => c.x + c.w)) &&
      wide.y + wide.h === Math.max(...four.map((c) => c.y + c.h)));
    check("no bonds leaves the drawing alone", C.bondPanelLayout(L, []) === L);
  }
  // an empty cage reads "-inf dBm", which is not a measurement
  check("no light reads as a dash, a real level reads as itself",
    C.dbmText("-inf dBm") === "" && C.dbmText("-2.1 dBm") === "-2.1 dBm" && C.dbmText(null) === "");
  // the switch service, as systemctl describes it
  check("a running service is running and not broken", (() => {
    const s = C.cpssService({ active: "active", sub: "running", enabled: "enabled", pid: "9302" });
    return s.running && !s.broken && s.known && s.pid === "9302";
  })());
  check("a dead one says so", (() => {
    const s = C.cpssService({ active: "failed", sub: "failed", pid: "0" });
    return !s.running && s.broken && s.known && s.pid === "";
  })());
  check("activating is not yet running",
    C.cpssService({ active: "active", sub: "auto-restart" }).broken === true);
  check("a probe that failed is unknown, not down", (() => {
    const s = C.cpssService(null);
    return !s.known && !s.running && !s.broken;
  })());
  // the device reads its own output back, so send the same shape
  const body = C.switchInterfacePayload(rows);
  check("apply sends name, enable, speed and fec",
    JSON.stringify(body.interfaces[0]) === JSON.stringify({ name: "0/0", enable: true, speed: "1000", fec: "None" }));
  check("and nothing the device would not accept",
    Object.keys(body.interfaces[0]).join() === "name,enable,speed,fec");
  check("only the edited rows count as changed", (() => {
    const cur = rows.map((r) => r.name === "0/0" ? { ...r, speed: "10000" } : r);
    const ch = C.switchIfaceChanged(rows, cur);
    return ch.length === 1 && ch[0].name === "0/0";
  })());
  check("a link coming up on its own is not a change",
    C.switchIfaceChanged(rows, rows.map((r) => ({ ...r, link: !r.link }))).length === 0);
  // the mode is a symlink to one of two files
  check("each mode names its file",
    C.switchModeFile("normal") === "normal.config" && C.switchModeFile("custom") === "custom.config");
  check("an unknown mode falls back to the normal file", C.switchModeFile("") === "normal.config");
  check("the restart is announced with the time it takes", C.SWITCH_RESTART_SECONDS === 20);
}

/* ---------- MEC and deduplication ports ----------------------------------- */
group("SNMP examples");
{
  /* Checked against .189 and .151 with a GETNEXT walk: the tree is
     .1.3.6.1.4.1.49584 > 2 model > 1 grism, the flow table is a column then a
     row index, and that index starts at 0. */
  check("the enterprise root is packetx's", C.MIB_ROOT === ".1.3.6.1.4.1.49584");
  check("the flow table entry is where the counters hang",
    C.MIB_FLOW_ENTRY === ".1.3.6.1.4.1.49584.2.1.2.1.1");
  const by = Object.fromEntries(C.SNMP_EXAMPLES.map((e) => [e.key, e]));
  check("the columns are the ones the sub-agent registers",
    by["snmp.exName"].oid.endsWith(".3") && by["snmp.exLink"].oid.endsWith(".4") &&
    by["snmp.exInBytes"].oid.endsWith(".11") && by["snmp.exInMbps"].oid.endsWith(".12") &&
    by["snmp.exOutBytes"].oid.endsWith(".30") && by["snmp.exOutMbps"].oid.endsWith(".31"));
  check("the scalars end in .0, as scalars do",
    by["snmp.exPorts"].oid.endsWith(".2.1.1.0") &&
    by["snmp.exSessions"].oid.endsWith(".2.1.3.2.0") &&
    by["snmp.exSessionsV6"].oid.endsWith(".2.1.4.2.0"));
  /* A column needs a row; a scalar does not, and appending an index to one
     would simply return nothing. */
  check("only the per-interface rows ask for an index",
    C.SNMP_EXAMPLES.filter((e) => e.row).length === 5 && !by["snmp.exPorts"].row &&
    !by["snmp.exSessions"].row);
  check("the name column is walked, the rest are got",
    by["snmp.exName"].walk === true && !by["snmp.exInBytes"].walk);
  check("the command carries the device and the community", (() => {
    const cmd = C.snmpCommand(by["snmp.exInBytes"], "192.168.1.189", "packetxsnmp");
    return cmd === "snmpget -v2c -c packetxsnmp 192.168.1.189 " +
      ".1.3.6.1.4.1.49584.2.1.2.1.1.11.<index>";
  })());
  check("walking one says walk",
    C.snmpCommand(by["snmp.exName"], "d", "c").startsWith("snmpwalk -v2c -c c d "));
  check("with nothing known it still reads as a command",
    C.snmpCommand(by["snmp.exPorts"], "", "") === "snmpget -v2c -c public <device> .1.3.6.1.4.1.49584.2.1.1.0");
}

group("firmware version, with a build number");
{
  /* get_version answers "<version>-<revision>", and the version is
     <line>.<YYMMDD>.<build>. The build number was added because more than one
     image can be cut in a day; images from before it have three parts. */
  const v = C.parseFirmwareVersion("7.6.260922.3-cc28e8d4ba467b39c1fd2b72c13cd77f97a59ff6");
  check("the version and the commit come apart",
    v.version === "7.6.260922.3" && v.revision.startsWith("cc28e8d4"));
  check("and the version comes apart into its own parts",
    v.line === "7.6" && v.date === "260922" && v.build === "3");
  check("an image from before the build number simply has none", (() => {
    const o = C.parseFirmwareVersion("6.5.260921-b7433a3d");
    return o.version === "6.5.260921" && o.build === "" && o.date === "260921";
  })());
  check("a version with no commit after it still reads",
    C.parseFirmwareVersion("7.6.260922.1").version === "7.6.260922.1" &&
    C.parseFirmwareVersion("7.6.260922.1").revision === "");
  check("nothing in, nothing claimed",
    C.parseFirmwareVersion("").version === "" && C.parseFirmwareVersion(null).build === "");
  /* The line is still the first two parts, so telling the product lines apart
     is unaffected by the extra one. */
  check("the build number does not confuse the product line",
    C.firmwareRestartsOnly("7.6.260922.3") === true &&
    C.firmwareRestartsOnly("6.5.260921.2") === false);
}

group("how a firmware update ends, per product line");
{
  /* The version file is rewritten while the services are still coming back,
     so the page holds for a fixed spell instead of letting go the moment the
     number changes. */
  check("the hold is ten seconds", C.FIRMWARE_RESTART_HOLD_SECONDS === 10);
  check("what is left of it counts down whole seconds",
    C.firmwareHoldLeft(10_000, 0) === 10 && C.firmwareHoldLeft(10_000, 4_200) === 6 &&
    C.firmwareHoldLeft(10_000, 9_100) === 1);
  check("and never goes negative or claims time on a device that reboots",
    C.firmwareHoldLeft(10_000, 10_000) === 0 && C.firmwareHoldLeft(10_000, 99_999) === 0 &&
    C.firmwareHoldLeft(0, 5_000) === 0 && C.firmwareHoldLeft(undefined, 5_000) === 0);
  /* MIPS (6.5.x) restarts the device; arm64 (7.6.x) restarts only the services
     the image replaced, so the page must describe -- and detect -- a different
     thing. The version line is what every device reports that says which. */
  check("6.5 reboots", C.firmwareRestartsOnly("6.5.260921") === false);
  check("7.6 does not", C.firmwareRestartsOnly("7.6.260922") === true);
  check("a version with the revision appended still reads",
    C.firmwareRestartsOnly("7.6.260922-cc28e8d4") === true);
  check("anything unreadable falls back to the older behaviour",
    C.firmwareRestartsOnly("") === false && C.firmwareRestartsOnly(null) === false &&
    C.firmwareRestartsOnly("unknown") === false);
}

group("service state, beside what the configuration asks for");
{
  const status = C.parseServiceStatus({ service_status: {
    grism: { state: "running", pids: [1467] },
    sshd: { state: "running", pids: [1470] },
    snmpd: { state: "stopped", pids: [] },
    lldpd: { state: "unknown" },
  } });
  check("the device's answer is read as given",
    status.grism.state === "running" && status.snmpd.state === "stopped" && status.grism.pids[0] === 1467);
  check("a service that is on and up is simply running", (() => {
    const r = C.serviceRowState({ name: "sshd", enable: true }, status);
    return r.state === "running" && r.pids.join() === "1470" && r.mismatch === false;
  })());
  /* The two things worth pointing at: enabled and dead, or switched off and
     still there until the next boot. */
  check("enabled but not running is a mismatch",
    C.serviceRowState({ name: "snmpd", enable: true }, status).mismatch === true);
  check("disabled but still running is a mismatch too",
    C.serviceRowState({ name: "grism", enable: false }, status).mismatch === true);
  check("disabled and stopped is not",
    C.serviceRowState({ name: "snmpd", enable: false }, status).mismatch === false);
  /* Some services have no process of their own -- xmlrpc runs inside grism,
     backup is a cron job -- and "stopped" would be a claim, not a reading. */
  check("unknown stays unknown and never reads as a mismatch", (() => {
    const a = C.serviceRowState({ name: "lldpd", enable: true }, status);
    const b = C.serviceRowState({ name: "xmlrpc", enable: true }, status);
    return a.state === "unknown" && !a.mismatch && b.state === "unknown" && !b.mismatch;
  })());
  check("nothing read yet is unknown, not stopped",
    C.serviceRowState({ name: "sshd", enable: true }, {}).state === "unknown");
  check("a broken payload yields no claims",
    Object.keys(C.parseServiceStatus(null)).length === 0 &&
    Object.keys(C.parseServiceStatus({})).length === 0);
  // the packet application is the device; there is no state with it off
  check("grism has no toggle", C.ALWAYS_ON_SERVICES.has("grism") && !C.ALWAYS_ON_SERVICES.has("sshd"));
  /* xmlrpc is the interface grism itself listens on, not a service beside it,
     so a row for it would be a second row for grism. */
  /* Fixed in the firmware, not configurable: src/main.c:1240 and
     dpdk/init.c:466 both set xargs->port = 9125. */
  check("the xmlrpc port is the one the firmware binds", C.XMLRPC_PORT === 9125);
  check("xmlrpc is not listed as a service of its own", (() => {
    const rows = C.parseServices({ services: [
      { name: "grism", enable: true }, { name: "xmlrpc", enable: true }, { name: "sshd", enable: true }] });
    return rows.map((r) => r.name).join() === "grism,sshd";
  })());
  check("each update target names its file and what identifies it", (() => {
    const by = Object.fromEntries(C.COMPONENT_TARGETS.map((t) => [t.id, t]));
    return C.COMPONENT_TARGETS.map((t) => t.id).join() === "grism-studio,pywww,sshd,mmdb" &&
      by["grism-studio"].file === "grism-studio.tgz" && by["grism-studio"].marker === "index.html" &&
      by["pywww"].file === "pywww.tgz" && by["pywww"].marker === "pywww/manage.py" &&
      by["sshd"].marker === "usr/sbin/sshd";
  })());
  /* The country database is one file, not an archive, so the picker has to
     offer .mmdb -- a file chooser filtered to .tgz cannot see it at all. */
  check("the file chooser offers what each target actually takes", (() => {
    const by = Object.fromEntries(C.COMPONENT_TARGETS.map((t) => [t.id, t]));
    return by["mmdb"].accept === ".mmdb" && by["sshd"].accept === ".tgz" &&
      by["mmdb"].marker === undefined;
  })());
  /* Which database is installed, read off its name -- the mtime on the file is
     when it was copied here, not when it was cut. */
  check("the month comes off the database name",
    C.countryDbDate("dbip-country-2025-10.mmdb") === "2025-10");
  check("a day in the name is kept",
    C.countryDbDate("dbip-country-lite-2025-10-01.mmdb") === "2025-10-01");
  check("a name with no date is left to speak for itself",
    C.countryDbDate("dbip-country.mmdb") === "" && C.countryDbDate() === "");
  /* The ports come from the sockets the process holds, so a service that
     listens on nothing simply has none -- not a guess from its name. */
  const withPorts = C.parseServiceStatus({ service_status: {
    sshd: { state: "running", pids: [1], ports: ["TCP 22"] },
    snmpd: { state: "running", pids: [2], ports: ["UDP 161", "TCP 199"] },
    lldpd: { state: "running", pids: [3] },
  } });
  check("the ports come through in order", withPorts.snmpd.ports.join() === "UDP 161,TCP 199");
  check("a row carries them", C.serviceRowState({ name: "sshd", enable: true }, withPorts).ports[0] === "TCP 22");
  check("a service that listens on nothing has none",
    C.serviceRowState({ name: "lldpd", enable: true }, withPorts).ports.length === 0);
}

group("NOT holds a group, so it can be added to");
{
  const n = C.mkNot();
  check("a new NOT wraps a group, not a bare condition",
    n.t === "not" && n.children.length === 1 && n.children[0].t === "or");
  check("and that group starts with one condition",
    n.children[0].children.length === 1 && n.children[0].children[0].t === "find");
  /* run.xsd's notType takes exactly one sub-expression, and or/and are among
     them -- so the nesting is what the firmware already accepts. */
  const doc = { filters: [{ id: 1, name: "x", sessionBase: "no", root: { t: "or", children: [n] } }],
    outputs: [], inputs: [], actions: [], chains: [] };
  const xml = C.serializeRun(doc);
  check("it serialises as <not><or><find/></or></not>",
    /<not>\s*<or>\s*<find[^>]*\/>\s*<\/or>\s*<\/not>/.test(xml), xml.split("\n").slice(1, 9).join(" "));
  check("and comes back the same way", (() => {
    const back = C.parseRun(xml).doc.filters[0].root;
    const not = back.children[0];
    return not.t === "not" && not.children[0].t === "or" && not.children[0].children[0].t === "find";
  })());
}

group("heartbeat conditions name the hop they watch");
{
  /* The firmware turns both heartbeat fields into an index into the configured
     targets (fc.c:3523). A number on screen says nothing about what is being
     watched, so the configuration is what turns it back into a hop. */
  const targets = [
    { id: 4, enable: true, sendPort: "P0", receivePort: "P1", description: "east link" },
    { id: 7, enable: false, sendPort: "P2", receivePort: "P3", description: "" },
  ];
  const en = makeT("en");
  const idFind = (val) => ({ t: "or", children: [{ t: "find", field: "heartbeat.target.miss.id", rel: "==", val }] });
  check("an id resolves to its ports and description",
    /P0 → P1/.test(C.describeCriterion(idFind("4"), en, targets)) &&
    /east link/.test(C.describeCriterion(idFind("4"), en, targets)),
    C.describeCriterion(idFind("4"), en, targets));
  check("a disabled target says so",
    /disabled/.test(C.describeCriterion(idFind("7"), en, targets)), C.describeCriterion(idFind("7"), en, targets));
  /* seek_idx returns 0 for an id it cannot find, so the filter quietly watches
     the first target rather than nothing at all -- worth saying. */
  check("an id that is not configured is called out",
    /no such target/.test(C.describeCriterion(idFind("99"), en, targets)), C.describeCriterion(idFind("99"), en, targets));
  check("nth counts from zero over the configured targets", (() => {
    const nth = (val) => ({ t: "or", children: [{ t: "find", field: "heartbeat.target.miss.nth", rel: "==", val }] });
    return /P0 → P1/.test(C.describeCriterion(nth("0"), en, targets)) &&
      /P2 → P3/.test(C.describeCriterion(nth("1"), en, targets)) &&
      /no such target/.test(C.describeCriterion(nth("2"), en, targets));
  })());
  check("with no configuration loaded it stays a plain number",
    C.describeCriterion(idFind("4"), en) === "Heartbeat miss (target id) == 4" &&
    C.describeCriterion(idFind("4"), en, []) === "Heartbeat miss (target id) == 4");
  check("other fields are untouched by any of this",
    C.describeCriterion({ t: "or", children: [{ t: "find", field: "tcp.port", rel: "==", val: "4" }] }, en, targets)
      === "TCP port (src or dst) == 443".replace("443", "4"));
  check("the hop reaches the chain hover", (() => {
    const filters = [{ id: 1, name: "hb", root: idFind("4") }];
    return /P0 → P1/.test(C.branchConditions("F1", filters, en, targets)[0].cond);
  })());
  check("and the overview's filter list", (() => {
    const doc = { filters: [{ id: 1, name: "hb", root: idFind("4") }], chains: [], outputs: [] };
    return /P0 → P1/.test(C.describeDoc(doc, en, targets).filters[0].cond);
  })());
  check("a list that does not carry the enable flag claims nothing about it",
    !/disabled/.test(C.describeCriterion(idFind("4"), en,
      [{ id: 4, sendPort: "P0", receivePort: "P1" }])));
  check("a target with no ports set does not invent an arrow",
    !/→/.test(C.describeCriterion(idFind("8"), en,
      [{ id: 8, enable: true, sendPort: "", receivePort: "", description: "half set" }])));
}

group("what a chain node is doing");
{
  const filters = [
    { id: 1, name: "web", root: { t: "or", children: [
      { t: "find", field: "tcp.port", rel: "==", val: "443" }] } },
    { id: 3, name: "", root: { t: "and", children: [] } },
  ];
  const rows = C.branchConditions("F1,!F3,F9", filters, makeT("en"));
  check("every reference is resolved, in order", rows.map((r) => r.id).join() === "F1,F3,F9");
  check("a filter reads as its name and its conditions",
    rows[0].name === "web" && /443/.test(rows[0].cond), rows[0].cond);
  check("a negated reference says so", rows[1].neg === true && rows[0].neg === false);
  /* An empty <or> matches everything -- legal, and worth saying rather than
     showing an empty line. */
  check("an empty filter says it matches everything",
    rows[1].empty && /matches everything/.test(rows[1].cond), rows[1].cond);
  check("a reference to nothing is reported, not skipped",
    rows[2].missing && /no filter/.test(rows[2].cond), rows[2].cond);
  check("nothing to resolve yields nothing", C.branchConditions("", filters).length === 0 &&
    C.branchConditions(null, filters).length === 0);

  /* An output is worth hovering only when it is one: a plain port is already
     printed on the node. */
  const outputs = [
    { id: 1, name: "mirror", port: "P5", mods: [
      { k: "Q", val: "100", op: "add" },
      { k: "stripping", val: "vxlan" },
      { k: "modify_srcip", val: "10.1.1.1", attrs: { nat: "yes", sessionDir: "no" } }],
      oattrs: { stl: "60" } },
    { id: 2, name: "plain", port: "P6", mods: [], oattrs: {} },
  ];
  const outs = C.outDestinations("O1,P3", outputs, makeT("en"));
  check("only defined outputs are described", outs.length === 1 && outs[0].id === "O1");
  check("the port it sends to comes along", outs[0].port === "P5" && outs[0].name === "mirror");
  check("every action is named, with its operation and value",
    outs[0].actions.some((a) => /VLAN tag \(Q\) add 100/.test(a)) &&
    outs[0].actions.some((a) => /Strip header\/tag vxlan/.test(a)), outs[0].actions.join(" | "));
  check("an attribute that is set is kept, one that is not is dropped",
    outs[0].actions.some((a) => /Modify source IP 10\.1\.1\.1 nat/.test(a)) &&
    !outs[0].actions.some((a) => /sessionDir/.test(a)), outs[0].actions.join(" | "));
  check("the output's own attributes are listed too",
    outs[0].actions.some((a) => a === "stl 60"));
  check("an output that does nothing says so",
    /forwards unchanged/.test(C.outDestinations("O2", outputs, makeT("en"))[0].actions[0]));
  check("a node that names only ports has nothing to add",
    C.outDestinations("P1,P2", outputs).length === 0);
}

group("traffic that is moving");
{
  /* The rates are rounded to two decimals, so a port carrying a few packets a
     second reads 0.00 Mbps -- the packet counters are what says otherwise. */
  const first = C.portMovement(new Map(), [
    { name: "P0", inPackets: 10, outPackets: 0 },
    { name: "P1", inPackets: 0, outPackets: 0 }]);
  check("the first sample claims nothing: there is nothing to compare with",
    Object.keys(first.moved).length === 0 && first.next.size === 2);
  const second = C.portMovement(first.next, [
    { name: "P0", inPackets: 11, outPackets: 0 },
    { name: "P1", inPackets: 0, outPackets: 0 }]);
  check("a counter that grew is traffic, on that port and that direction",
    JSON.stringify(second.moved) === JSON.stringify({ P0: { in: true, out: false } }));
  const bothWays = C.portMovement(second.next, [
    { name: "P0", inPackets: 12, outPackets: 5 },
    { name: "P1", inPackets: 3, outPackets: 0 }]);
  check("both directions are reported apart",
    bothWays.moved.P0.in && bothWays.moved.P0.out && bothWays.moved.P1.in && !bothWays.moved.P1.out);
  const still = C.portMovement(bothWays.next, [
    { name: "P0", inPackets: 12, outPackets: 5 },
    { name: "P1", inPackets: 3, outPackets: 0 }]);
  check("a port that carried nothing says nothing", Object.keys(still.moved).length === 0);
  /* Counters going backwards is the device having been cleared, not traffic;
     flashing the whole table at that moment would be a lie. */
  const cleared = C.portMovement(still.next, [
    { name: "P0", inPackets: 0, outPackets: 0 },
    { name: "P1", inPackets: 0, outPackets: 0 }]);
  check("clearing the counters is not traffic", Object.keys(cleared.moved).length === 0);
  check("and the next sample starts from the cleared values",
    C.portMovement(cleared.next, [{ name: "P0", inPackets: 1, outPackets: 0 }]).moved.P0.in === true);
  check("a port that appears mid-run is not treated as having moved",
    Object.keys(C.portMovement(new Map([["P0", { in: 0, out: 0 }]]),
      [{ name: "P9", inPackets: 400, outPackets: 400 }]).moved).length === 0);
  check("rows without a name are ignored, and rubbish counts as zero",
    Object.keys(C.portMovement(new Map(), [{ inPackets: 5 }, { name: "", inPackets: 5 }]).moved).length === 0 &&
    C.portMovement(new Map([["P0", { in: 0, out: 0 }]]), [{ name: "P0", inPackets: "x" }]).moved.P0 === undefined);
}

group("F3T1G4 front panel");
{
  /* ERS5511: three SFP28 and one SFP+ in a row, four copper jacks in two
     stacked columns with the odd number on top, and a management block that
     is eight sockets on a switch hub uplinked to M0. P8-P11 are LOOP ports
     inside the box and have no cage on the front. */
  const L = C.panelLayout("F3T1G4");
  check("the model is recognised", C.hasFrontPanel("F3T1G4") && C.panelModel("f3t1g4") === "F3T1G4");
  check("eight cages, and no LOOP ports among them",
    L.cages.length === 8 && !L.cages.some((c) => ["P8", "P9", "P10", "P11"].includes(c.name)),
    L.cages.map((c) => c.name).join(","));
  check("the first four are fibre, the last four copper",
    ["P0", "P1", "P2", "P3"].every((n) => L.cages.find((c) => c.name === n).kind === "sfp") &&
    ["P4", "P5", "P6", "P7"].every((n) => L.cages.find((c) => c.name === n).kind === "rj45"));
  const at = (n) => L.cages.find((c) => c.name === n);
  check("the fibre row is one row, left to right",
    [at("P0"), at("P1"), at("P2"), at("P3")].every((c, i, a) => c.y === a[0].y) &&
    at("P0").x < at("P1").x && at("P1").x < at("P2").x && at("P2").x < at("P3").x);
  check("the copper is stacked odd above even",
    at("P5").y < at("P4").y && at("P7").y < at("P6").y &&
    at("P5").x === at("P4").x && at("P7").x === at("P6").x && at("P4").x < at("P6").x);
  check("the fibre sits left of the copper", at("P3").x < at("P4").x);
  check("the management block is eight sockets in two rows of four",
    L.mgmt.jacks.length === 8 &&
    new Set(L.mgmt.jacks.map((j) => j.y)).size === 2 &&
    new Set(L.mgmt.jacks.map((j) => j.x)).size === 4);
  check("and it is right of everything else",
    L.mgmt.x > Math.max(...L.cages.map((c) => c.x + c.w)) && L.width > L.mgmt.x + L.mgmt.w);
  check("every cage fits inside the chassis",
    L.cages.every((c) => c.x > 0 && c.x + c.w <= L.width && c.y > 0 && c.y + c.h <= L.height));
  // the statistics keyed by cage name, as the panel reads them
  const st = C.panelStates([{ name: "P5", linkStatus: 1, inPackets: 5 }], "F3T1G4");
  check("a link on a stacked port lands on that port",
    st.P5.link === true && st.P4.link === false);
}

group("MEC settings");
{
  /* The firmware's cron is compared field by field with a single atoi
     (main.c:1478), so anything richer than * or one number is silently wrong,
     and the month field is tm_mon -- 0 is January. */
  check("the default the devices ship with is valid", C.cronProblem("0 2 * * 1") === null);
  check("all stars is valid", C.cronProblem("* * * * *") === null);
  check("a missing field is caught", C.cronProblem("0 2 * *")?.kind === "fields");
  check("a step expression is caught, because atoi reads it as 0",
    C.cronProblem("*/5 * * * *")?.kind === "syntax");
  check("a range is caught", C.cronProblem("0 1-5 * * *")?.kind === "syntax");
  check("an hour past 23 is caught", C.cronProblem("0 24 * * *")?.kind === "range");
  // tm_mon: December is 11, and 12 is not a month at all
  check("month counts from zero", C.cronProblem("0 2 * 11 *") === null && C.cronProblem("0 2 * 12 *")?.kind === "range");
  check("weekday counts from zero", C.cronProblem("0 2 * * 6") === null && C.cronProblem("0 2 * * 7")?.kind === "range");
  // an absent cron is a decision, not a mistake: the sweep just never runs
  check("an empty cron is not an error", C.mecProblems({ s1apItemsClearIdleCron: "" }).length === 0);
  check("a bad cron stops the submit", C.mecProblems({ s1apItemsClearIdleCron: "0 2 *" }).length === 1);
  /* The message has to reach the control it belongs to: the problem carries
     the offending cron field in `field`, so the card looks it up by `scope`
     instead -- spreading one over the other made the message disappear. */
  check("a cron problem says which control it belongs to",
    C.mecProblems({ s1apItemsClearIdleCron: "0 99 * * *" })[0].scope === "cron");
  check("and still says which cron field was wrong",
    C.mecProblems({ s1apItemsClearIdleCron: "0 99 * * *" })[0].field === "hour");
  check("the idle-seconds problem is scoped to its own box",
    C.mecProblems({ s1apItemsClearIdleMax: "nope" })[0].scope === "max");
  check("the idle seconds must be a number",
    C.mecProblems({ s1apItemsClearIdleMax: "604800" }).length === 0 &&
    C.mecProblems({ s1apItemsClearIdleMax: "a week" }).length === 1);
  check("every key the card writes is named", C.MEC_ARG_KEYS.join() ===
    "s1cCorrelation,flowExtensionGtpTunnelhdr,s1apItemsClearIdleCron,s1apItemsClearIdleMax");
}

group("deduplication ports");
{
  const known = ["P0", "P1", "P2"];
  // names are resolved by the device (main.c:906); one it does not have is dropped without a word
  check("a port the device does not have is reported",
    C.dedupProblems({ deduplicationPorts: "P1,P9" }, known).map((x) => x.port).join() === "P9");
  check("an empty list is fine -- it means every port",
    C.dedupProblems({ deduplicationPorts: "" }, known).length === 0);
  check("nothing is claimed before the port list is known",
    C.dedupProblems({ deduplicationPorts: "P9" }, []).length === 0);
  check("the list round-trips through the same helpers as the tunnel lists",
    C.formatPortList(C.parsePortList(" P0 , P1 ,, P0 ")) === "P0,P1");
}

/* ---------- audit fixes: the simulate page reads in both themes ----------- */
group("simulate page colours");
{
  const { readFileSync: rf } = await import("node:fs");
  const css = rf(new URL("./GrismStudio.css", import.meta.url), "utf8");
  const varsIn = (block) => Object.fromEntries([...block.matchAll(/--(sim-out|sim-loop|sim-from|bg)\s*:\s*(#[0-9a-f]{3,6})/gi)]
    .map((m) => [m[1], m[2]]));
  const darkRoot = css.slice(css.indexOf(".gs-root{"), css.indexOf(".gs-root.light{"));
  const darkSim = varsIn(css.slice(css.indexOf(":root, .gs-root{"), css.indexOf(".gs-root.light{ --sim-out")));
  const lightSim = varsIn(css.slice(css.indexOf(".gs-root.light{ --sim-out")));
  const lightRoot = varsIn(css.slice(css.indexOf(".gs-root.light{"), css.indexOf(".gs-root.light{ --sim-out")));
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
    .map((s2) => s2 <= 0.03928 ? s2 / 12.92 : ((s2 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  check("both themes name every simulate colour",
    ["sim-out", "sim-loop", "sim-from"].every((k) => !!darkSim[k] && !!lightSim[k]),
    JSON.stringify({ darkSim, lightSim }));
  /* These carry meaning -- which port the packet came from, which is a LOOP,
     where the trace ends -- so they have to be readable, not merely present.
     Written inline they were dark-only and landed near 1.2:1 in light. */
  const weak = [];
  for (const [theme, sim, bg] of [["dark", darkSim, darkRoot.match(/--bg:(#[0-9a-f]{6})/i)[1]],
    ["light", lightSim, lightRoot.bg]])
    for (const k of ["sim-out", "sim-loop", "sim-from"])
      if (cr(sim[k], bg) < 4.5) weak.push(`${theme} ${k} ${cr(sim[k], bg).toFixed(2)}`);
  check("every simulate colour clears 4.5:1 against its own background", weak.length === 0, weak.join(", "));
  // the inline literals are what made it dark-only; they must not creep back
  check("the simulate rules use the variables, not literals",
    !/\.sim-node\.out \.sim-node-v\{color:#/.test(css) && !/\.dev-port\.loop\{border-color:#/.test(css));
  // an animation that never ends has to answer the reduced-motion switch
  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {"));
  check("the looping simulate animations respect reduced motion",
    ["dev-port.next", "dev-port.from", "dev-cable.active"].every((sel) => rm.includes(sel)));
}

/* ---------- audit fixes: the document model ------------------------------- */
group("ids survive a round trip");
{
  const p = (x) => C.parseRun(x).doc;
  const d = p(`<run><input id="1" type="replayPcap" name="A"/><input id="2" type="replayPcap" name="B"/>`
    + `<action id="1" name="a1"/><action id="2" name="a2"/></run>`);
  const back = p(C.serializeRun(d));
  /* <input> and <action> carry no id on the wire by design, so the parser has
     to hand out its own -- without them both rows share id 0 and an edit or a
     delete hits whichever the lookup finds first. */
  check("inputs come back with distinct ids", new Set(back.inputs.map((i) => i.id)).size === 2);
  check("actions come back with distinct ids", new Set(back.actions.map((a) => a.id)).size === 2);
  check("and in the order they were written",
    back.inputs.map((i) => i.name).join() === "A,B" && back.actions.map((a) => a.name).join() === "a1,a2");
  // an id the XML did give is identity the user may be looking at: keep it
  check("ids the config states are kept", p('<run><filter id="7"/><filter id="9"/></run>')
    .filters.map((f) => f.id).join() === "7,9");
  check("a duplicate id is only honoured once",
    new Set(p('<run><filter id="3"/><filter id="3"/><filter/></run>').filters.map((f) => f.id)).size === 3);
}

group("VLAN tag operations");
{
  const p = (x) => C.parseRun(x).doc;
  const qOf = (doc) => C.serializeRun(doc).replace(/\s*\n\s*/g, " ").match(/<Q[^<]*<\/Q>/)[0];
  /* An absent type attribute leaves the firmware's vlan.type at 0, and
     common.h defines 0 as REPLACE -- so "add" without the attribute shipped
     the opposite of what the card showed. */
  check("add writes its type out",
    qOf(p('<run><output id="1"><port>P1</port><Q type="add">100</Q></output></run>')) === '<Q type="add">100</Q>');
  check("replace writes its type out",
    qOf(p('<run><output id="1"><port>P1</port><Q type="replace">100</Q></output></run>')) === '<Q type="replace">100</Q>');
  check("a tag with no type reads back as replace, the way the firmware reads it",
    p('<run><output id="1"><port>P1</port><Q>100</Q></output></run>').outputs[0].mods[0].op === "replace");
  // the firmware matches "replace" and "add" and nothing else
  check("only the two the firmware implements are offered", C.VLAN_OPS.join() === "add,replace");
  /* Two different defaults, deliberately: a new modifier starts on "add",
     which is what the user reaches for, and now serialises that explicitly --
     while a tag that arrives with no attribute at all still reads back as
     replace, because that is what the firmware does with it. */
  check("a new VLAN modifier starts on add", C.mkOutputMod("Q").op === "add" && C.mkOutputMod("QinQ").op === "add");
  check("and writes that out", (() => {
    const doc = p('<run><output id="1"><port>P1</port></output></run>');
    doc.outputs[0].mods = [C.mkOutputMod("Q")];
    doc.outputs[0].mods[0].val = "100";
    return /<Q type="add">100<\/Q>/.test(C.serializeRun(doc));
  })());
  check("a config carrying the old remove is flagged rather than silently doing nothing", (() => {
    const doc = p('<run><output id="1"><port>P1</port><Q type="remove"></Q></output></run>');
    const probs = []; C.outputProblems(doc.outputs[0], probs);
    return probs.some((x) => /remove/.test(x.msg));
  })());
}

group("replay inputs and empty chains");
{
  const p = (x) => C.parseRun(x).doc;
  /* The form offers played-files handling for a scanned directory only, but a
     config written elsewhere may carry it on a file list -- the firmware acts
     on it either way (input_flush), so parsing and serialising must not throw
     the setting away. Switching the mode in the form is what clears it. */
  const files = p('<run><input type="replayPcap" name="A"><port>P0</port><filepath>/a.pcap</filepath>'
    + '<playedFilesHandle>delete</playedFilesHandle></input></run>');
  check("an imported file-list input keeps its played-files setting",
    /playedFilesHandle>delete</.test(C.serializeRun(files)));
  const moved = p('<run><input type="replayPcap" name="A"><port>P0</port><filepath>/a.pcap</filepath>'
    + '<playedFilesHandle>move</playedFilesHandle><playedFilesMoveTo>/done</playedFilesMoveTo></input></run>');
  check("and so does where they move to", /playedFilesMoveTo>\/done</.test(C.serializeRun(moved)));
  /* body() returns null for an unset tree; interpolating it wrote the literal
     text "null" into the config, which is well-formed so nothing objected. */
  const bare = C.serializeRun(p('<run><chain><in>P0</in></chain></run>'));
  check("a body-less chain does not serialise the word null", !/null/.test(bare), bare);
  check("and it is reported rather than silently submitted",
    C.chainProblems(null, []).length === 1);
}

/* ---------- settings page: the header travels with the scroll -------------- */
group("settings sticky header");
{
  const { readFileSync: rf } = await import("node:fs");
  const css = rf(new URL("./GrismStudio.css", import.meta.url), "utf8");
  const jsx = rf(new URL("./GrismStudio.jsx", import.meta.url), "utf8");
  const block = css.slice(css.indexOf(".set-page .set-sticky"), css.indexOf(".cj-chip"));
  check("the header block sticks to the top of the settings scroll area",
    /position: sticky/.test(block) && /background: var\(--bg\)/.test(block));
  /* The header must not move when it goes from resting to stuck: the block
     owns the page's top padding and the page itself has none, so its resting
     position and its stuck position are the same place. */
  check("the block rests where it sticks",
    /top: 0;/.test(block) && /padding-top: 24px/.test(block) &&
    /\.set-page \{ padding-top: 0; \}/.test(css));
  // two sticky elements one inside the other leave the chips floating
  check("the index does not stick separately inside the block",
    /\.set-page \.set-sticky \.card-jump \{ position: static/.test(css));
  // the header, the section switcher and the re-read button ride together
  const sticky = jsx.slice(jsx.indexOf('<div className="set-sticky">'), jsx.indexOf("<CardJump rootRef={pageRef}"));
  check("the block holds the page header and the re-read button",
    /className="sys-head"/.test(sticky) && /sys-refresh/.test(sticky) && /set-seg/.test(sticky));
  // a jumped-to card has to clear the whole block, not just the chips
  check("the published offset measures the whole block",
    /closest\("\.set-sticky"\)/.test(jsx));
  check("the card index still clears it", /scroll-margin-top: calc\(var\(--cj-h/.test(css));
}

for (const lang of Object.keys(I18N)) {
  check(`${lang} names the panel and its legend`,
    !!I18N[lang]["panel.title"] && !!I18N[lang]["panel.mgmt"] &&
    ["keyUp", "keyDown", "keyRx", "keyTx"].every((k) => !!I18N[lang]["panel." + k]));
  // dark lamps mean two different things and the page has to say which
  check(`${lang} distinguishes "nothing read" from "all down"`,
    !!I18N[lang]["panel.noData"] && !!I18N[lang]["panel.stale"] && !!I18N[lang]["panel.unknown"]);
  check(`${lang} says what a bypass lamp means`,
    !!I18N[lang]["panel.keyBypass"] && !!I18N[lang]["panel.bypassOn"] && !!I18N[lang]["panel.bypassOff"]);
}

/* ---------- hook order ---------- */
group("hook order");
{
  /* A hook after an early return changes the hook count between renders: the
     component mounts with fewer while logged out and more once logged in, and
     React throws #310 -- which surfaces as "tab render failed" on a page the
     user was already looking at. Unit tests cannot see it, so it is checked
     statically here. */
  const { readFileSync: rf } = await import("node:fs");
  const src = rf(new URL("./GrismStudio.jsx", import.meta.url), "utf8").split("\n");
  let comp = null, earlyReturn = null;
  const offenders = [];
  src.forEach((line, i) => {
    const m = line.match(/^function ([A-Z]\w*)\(/);
    if (m) { comp = m[1]; earlyReturn = null; return; }
    if (!comp) return;
    if (/^\}/.test(line)) { comp = null; return; }
    if (earlyReturn === null && /^\s{2}if \(.*\) return /.test(line)) earlyReturn = i + 1;
    if (earlyReturn !== null && /(React\.)?use(State|Effect|Memo|Callback|Ref|LayoutEffect)\(/.test(line)
        && !line.trim().startsWith("//"))
      offenders.push(`${comp}:${i + 1} (early return at ${earlyReturn})`);
  });
  check("no component calls a hook after an early return", offenders.length === 0, offenders.join(" "));
}

/* ---------- live capture: pcap parsing ---------- */
group("pcap live view");
{
  const hexpkt = (s) => new Uint8Array(s.replace(/\s+/g, "").match(/../g).map((x) => parseInt(x, 16)));
  // a pcap file built byte by byte, in either byte order -- the same two the
  // firmware produces (master/MIPS writes LE files, dpdk/arm64 writes BE)
  const pcapBytes = (le, packets, { nanos = false } = {}) => {
    const total = 24 + packets.reduce((s, p) => s + 16 + p.data.length, 0);
    const b = new Uint8Array(total);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, nanos ? 0xa1b23c4d : 0xa1b2c3d4, le);
    dv.setUint16(4, 2, le); dv.setUint16(6, 4, le);
    dv.setUint32(16, 65535, le); dv.setUint32(20, 1, le);
    let o = 24;
    for (const p of packets) {
      dv.setUint32(o, p.sec ?? 1758600000, le);
      dv.setUint32(o + 4, p.frac ?? 123456, le);
      dv.setUint32(o + 8, p.data.length, le);
      dv.setUint32(o + 12, p.orig ?? p.data.length, le);
      b.set(p.data, o + 16);
      o += 16 + p.data.length;
    }
    return b;
  };

  const ethHdr = "aabbccddeeff 112233445566";
  const tcpSyn = hexpkt(`${ethHdr} 0800
    4500 0028 0001 4000 4006 0000 c0a80101 c0a80102
    c000 01bb 00000064 00000000 50 02 1c84 0000 0000`);
  const dnsQuery = hexpkt(`${ethHdr} 0800
    4500 0039 0002 0000 4011 0000 c0a80105 08080808
    d000 0035 0025 0000
    1234 0100 0001 0000 0000 0000 07 6578616d706c65 03 636f6d 00 0001 0001`);
  const arpReq = hexpkt(`${ethHdr} 0806
    0001 0800 0604 0001 112233445566 c0a80105 000000000000 c0a80101`);

  // LE file (what a master/MIPS device writes)
  const rd = C.createPcapReader();
  const pk = rd.feed(pcapBytes(true, [{ data: tcpSyn }, { data: dnsQuery }, { data: arpReq }]));
  check("LE file detected", rd.headerSeen && rd.le === true && !rd.error);
  check("three records parsed", pk.length === 3);
  check("timestamp in ms", pk.length === 3 && Math.abs(pk[0].tsMs - 1758600000123.456) < 0.01);

  // BE file (what a dpdk/arm64 device writes)
  const rdBe = C.createPcapReader();
  const pkBe = rdBe.feed(pcapBytes(false, [{ data: tcpSyn }]));
  check("BE file detected", rdBe.le === false && pkBe.length === 1 && pkBe[0].caplen === tcpSyn.length);

  // a tail delivers arbitrary slices: byte-by-byte must yield the same packets
  {
    const r2 = C.createPcapReader();
    const file = pcapBytes(true, [{ data: tcpSyn }, { data: arpReq }]);
    let got = [];
    for (let i = 0; i < file.length; i += 7) got = got.concat(r2.feed(file.subarray(i, Math.min(i + 7, file.length))));
    check("7-byte slices reassemble", got.length === 2 && got[1].data.length === arpReq.length);
  }
  // a record cut mid-way stays buffered until the rest of it arrives
  {
    const r3 = C.createPcapReader();
    const file = pcapBytes(true, [{ data: tcpSyn }, { data: arpReq }]);
    const a = r3.feed(file.subarray(0, file.length - 3));
    const b = r3.feed(file.subarray(file.length - 3));
    check("partial tail held back", a.length === 1 && b.length === 1);
  }
  // an insane length is corruption, not something to walk past
  {
    const r4 = C.createPcapReader();
    const file = pcapBytes(true, [{ data: tcpSyn }]);
    new DataView(file.buffer).setUint32(24 + 8, 0x7fffffff, true);
    check("corrupt caplen stops the reader", r4.feed(file).length === 0 && r4.error === "corrupt record");
  }
  // nanosecond magic scales the fraction differently
  {
    const r5 = C.createPcapReader();
    const p5 = r5.feed(pcapBytes(true, [{ data: tcpSyn, frac: 500000000 }], { nanos: true }));
    check("nanosecond magic", r5.nanos && p5.length === 1 && Math.abs(p5[0].tsMs % 1000 - 500) < 0.01);
  }

  // ---- decoding ----
  const dTcp = C.decodePacket(tcpSyn);
  check("TCP decode: addresses", dTcp.src === "192.168.1.1" && dTcp.dst === "192.168.1.2");
  check("TCP decode: SYN in info", dTcp.proto === "TCP" && dTcp.info.includes("SYN") && dTcp.info.includes("49152 → 443"));
  check("TCP decode: layers", dTcp.layers.map((l) => l.name).join(",") === "Ethernet,IPv4,TCP");

  const dDns = C.decodePacket(dnsQuery);
  check("DNS query decode", dDns.proto === "DNS" && dDns.info.includes("example.com") && dDns.info.startsWith("query A"));

  // DNS response with a compression pointer back into the question
  const dnsResp = hexpkt(`${ethHdr} 0800
    4500 0049 0003 0000 4011 0000 08080808 c0a80105
    0035 d000 0035 0000
    1234 8180 0001 0001 0000 0000 07 6578616d706c65 03 636f6d 00 0001 0001
    c00c 0001 0001 0000003c 0004 5db8d822`);
  const dResp = C.decodePacket(dnsResp);
  check("DNS response: pointer decompressed", dResp.info.includes("93.184.216.34"));
  check("DNS response: answer names the query", (dResp.layers.find((l) => l.name === "DNS")?.fields ?? []).some(([k, v]) => k === "Answer" && String(v).includes("example.com")));

  // a pointer that points at itself must cost a bounded number of jumps
  const dnsLoop = hexpkt(`${ethHdr} 0800
    4500 0027 0004 0000 4011 0000 08080808 c0a80105
    0035 d000 0013 0000
    1234 8180 0001 0000 0000 0000 c00c`);
  const t0 = Date.now();
  C.decodePacket(dnsLoop);
  check("DNS pointer loop bounded", Date.now() - t0 < 200);

  const dArp = C.decodePacket(arpReq);
  check("ARP decode", dArp.proto === "ARP" && dArp.info === "Who has 192.168.1.1? Tell 192.168.1.5");

  const icmpEcho = hexpkt(`${ethHdr} 0800
    4500 001c 0005 0000 4001 0000 c0a80105 c0a80101
    08 00 0000 0001 0002`);
  const dIcmp = C.decodePacket(icmpEcho);
  check("ICMP decode", dIcmp.proto === "ICMP" && dIcmp.info === "Echo request id=1 seq=2");

  const v6Tcp = hexpkt(`${ethHdr} 86dd
    60000000 0014 06 40
    20010db8000000000000000000000001
    20010db8000000000000000000000002
    c000 01bb 00000064 00000000 50 10 1c84 0000 0000`);
  const dV6 = C.decodePacket(v6Tcp);
  check("IPv6 decode: :: compression", dV6.src === "2001:db8::1" && dV6.dst === "2001:db8::2");
  check("IPv6 decode: TCP inside", dV6.proto === "TCP" && dV6.info.includes("ACK"));

  const vlanUdp = hexpkt(`${ethHdr} 8100 0064 0800
    4500 001c 0006 0000 4011 0000 c0a80105 c0a80101
    d000 0050 0008 0000`);
  const dVlan = C.decodePacket(vlanUdp);
  check("VLAN decode", dVlan.layers.some((l) => l.name === "802.1Q VLAN" && l.fields[0][1] === 100) && dVlan.proto === "UDP");

  // truncated capture: decode stops at the bytes it has, no throw
  // 20 bytes is Ethernet plus six bytes of IP header: the source IP field is
  // not in the capture yet, so the addresses stay at the MAC layer
  const dTrunc = C.decodePacket(tcpSyn.subarray(0, 20));
  check("truncated packet decodes partially", dTrunc.layers.length >= 1 && dTrunc.src === "11:22:33:44:55:66");
  // 38 bytes reaches through the IP header: addresses resolve, no L4 yet
  const dTrunc2 = C.decodePacket(tcpSyn.subarray(0, 38));
  check("truncation after IP header keeps addresses", dTrunc2.src === "192.168.1.1" && dTrunc2.layers.some((l) => l.name === "IPv4"));
  check("tiny packet is DATA", C.decodePacket(new Uint8Array(4)).proto === "DATA");

  // 802.3 frames off a real switch port on .188: the length field is <= 1500,
  // so what follows is LLC, not a payload of some ethertype "0x0026"
  const stp = hexpkt("0180c2000000 d4c19e91c3ec 0026 424203 00000000008000d4c19e91c3e00000");
  const dStp = C.decodePacket(stp);
  check("802.3 length recognised", dStp.layers[0].name === "IEEE 802.3" && dStp.layers[0].fields[2][0] === "Length");
  check("LLC DSAP 0x42 is STP", dStp.proto === "STP" && dStp.info === "Spanning Tree BPDU");
  const snap = hexpkt("0012cf000001 14448fc0542f 0010 aaaa03 0012cf 0002 00000030000000010000");
  const dSnap = C.decodePacket(snap);
  check("LLC SNAP decoded", dSnap.proto === "SNAP" && dSnap.info === "OUI 00:12:cf, PID 0x0002");
  check("SNAP layers", dSnap.layers.map((l) => l.name).join(",") === "IEEE 802.3,LLC,SNAP");

  // GRISM heartbeats ride the IPX ethertype; a real HL1 capture is full of them
  const hbFrame = hexpkt(`${ethHdr} 8137 ffff 0012 0000`);
  check("heartbeat ethertype named", C.decodePacket(hbFrame).proto === "IPX");

  // the packet-list filter: substrings with not/and/or over the top
  {
    const row = "tcp 192.168.1.1 8.8.8.8 49152 \u2192 443 [syn] len=0".toLowerCase();
    const arp = "arp 192.168.1.1 192.168.1.82 who has 192.168.1.82?".toLowerCase();
    const hit = (q, hay = row) => { const r = C.parseFilterExpr(q); return r.ok && r.test(hay); };
    check("an empty filter keeps everything", C.parseFilterExpr("  ").empty === true && C.parseFilterExpr("").test("anything"));
    check("a bare word is a substring", hit("tcp") && !hit("udp"));
    check("matching is case-insensitive", hit("TCP") && hit("SYN"));
    check("and", hit("tcp and 443") && !hit("tcp and 8080"));
    check("or", hit("udp or tcp") && !hit("udp or icmp"));
    check("not", !hit("not tcp") && hit("not udp"));
    check("! is not", !hit("!tcp") && hit("!udp"));
    check("juxtaposition means and", hit("tcp 443") && !hit("tcp 8080"));
    check("parentheses group", !hit("(udp or arp) and 443") && hit("(udp or tcp) and 443"));
    check("not binds tighter than and", hit("tcp and not 8080") && !hit("tcp and not 443"));
    check("and binds tighter than or", hit("udp and 9999 or 443") && !hit("udp and 443 or 9999"));
    check("a quoted phrase keeps its spaces", hit('"[syn] len"') && !hit('"len [syn]"'));
    check("an operator word can be quoted", hit('"and"', "x and y") && !hit('"and"', row));
    check("works across rows", hit("arp and not tcp", arp) && !hit("arp and not tcp"));
    // an expression that cannot be parsed must say which way it is broken
    check("unbalanced ( reported", C.parseFilterExpr("(tcp").error === "unbalanced");
    check("unbalanced ) reported", C.parseFilterExpr("tcp)").error === "unbalanced");
    check("a stray ) reported", C.parseFilterExpr(")").error === "unbalanced");
    check("a dangling operator reported", C.parseFilterExpr("tcp and").error === "operand"
      && C.parseFilterExpr("or tcp").error === "operand" && C.parseFilterExpr("not").error === "operand");
    // an empty phrase would match every row, which is never what was meant
    check("an empty phrase is rejected", C.parseFilterExpr('""').error === "operand");
    check("a broken filter is not a matcher", C.parseFilterExpr("(tcp").ok === false);
  }

  /* Offering the LOOP detour, not just describing it: the chains the capture is
     on send to a LOOP port, and a new chain from there reaches the output. */
  {
    const xml = `<run>
      <output id="2"><port>P2</port><modify_tcp_syn_mss>1200</modify_tcp_syn_mss></output>
      <output id="3"><port>P3</port><Q op="add">100</Q></output>
      <output id="4"><port>P4</port><dir>/data/x</dir></output>
      <chain><in>P4</in><out>O2</out></chain>
      <chain><in>P5</in><out>O3</out></chain>
      <chain><in>P6</in><out>O2</out></chain>
      <chain><in>P7</in><out>O4</out></chain>
    </run>`;
    const doc = C.parseRun(xml).doc;
    const loops = ["L0", "L1", "L2"];
    const fix = C.buildLoopFix(doc, ["P4"], loops);
    check("a plan is made", fix.ok && fix.pairs.length === 1 && fix.pairs[0].output === "O2");
    check("a free LOOP port is chosen", fix.pairs[0].loop === "L0");
    const out = C.serializeRun(fix.doc);
    const p0 = fix.pairs[0];
    check("the capture's chain sends to the LOOP port, tagged",
      new RegExp(`<in>P4</in>[\\s\\S]*?<out vlantype="tagging" vlanid="${p0.vlan}">L0</out>`).test(out));
    check("the chain back strips the tag on the way in",
      /<in vlantype="stripping">L0<\/in>/.test(out));
    check("it matches that tag and reaches the output",
      new RegExp(`<in vlantype="stripping">L0</in>[\\s\\S]*?<fid>${p0.filter}</fid>[\\s\\S]*?<out>O2</out>`).test(out));
    /* The chain carries the tagging itself, so nothing else has to be added:
       no detour output to send through and no action to strip with. */
    check("no extra output is created", (fix.doc.outputs ?? []).length === (doc.outputs ?? []).length);
    check("no action is created", (fix.doc.actions ?? []).length === (doc.actions ?? []).length);
    check("chains the capture is not on are untouched", /<in>P6<\/in>[\s\S]*?<out>O2<\/out>/.test(out));
    check("the plan says which ingress reaches it", p0.via.join() === "P4");
    /* One LOOP port carries every output -- a device has few of them -- and
       one chain brings them all back. */
    const two = C.buildLoopFix(doc, ["P4", "P5"], ["L0"]);
    check("one LOOP port is enough for several outputs", two.ok && two.pairs.length === 2
      && two.pairs.every((p) => p.loop === "L0"));
    check("each output gets a tag of its own", two.pairs[0].vlan !== two.pairs[1].vlan);
    check("one chain brings them all back",
      two.doc.chains.length === doc.chains.length + 1
      && (C.serializeRun(two.doc).match(/vlantype="stripping"/g) || []).length === 1);
    check("that chain tests every tag", two.pairs.every((p) =>
      new RegExp(`<fid>${p.filter}</fid>`).test(C.serializeRun(two.doc))));
    check("a tag already in the configuration is not reused", (() => {
      const withVlan = C.parseRun(xml.replace('<Q op="add">100</Q>', '<Q op="add">3001</Q>')).doc;
      const r = C.buildLoopFix(withVlan, ["P4"], ["L0"]);
      return r.ok && r.pairs.every((p) => p.vlan !== 3001);
    })());
    // a LOOP port already in use either way cannot carry a detour
    check("a LOOP port used as an ingress is not free", C.buildLoopFix(doc, ["P4"], ["P5"]).ok === false);
    check("a LOOP port already sent to is not free", C.buildLoopFix(doc, ["P4"], ["P2"]).ok === false);
    check("a mirror-only output needs no detour", C.buildLoopFix(doc, ["P7"], loops).ok === false
      && C.buildLoopFix(doc, ["P7"], loops).need === 0);
    // the rewritten document has to parse back, since that is how it is loaded
    check("the result round-trips", (() => {
      const back = C.parseRun(C.serializeRun(fix.doc)).doc;
      return back.chains.length === doc.chains.length + 1;
    })());
    check("the original document is not modified", C.serializeRun(doc).includes("<in>P4</in>")
      && /<in>P4<\/in>[\s\S]*?<out>O2<\/out>/.test(C.serializeRun(doc)));
  }

  /* The Export tab shows what this document changed, line by line. */
  {
    const a = "a\nb\nc\nd\ne";
    check("identical texts have no changes", C.diffStat(C.diffLines(a, a)).added === 0
      && C.diffStat(C.diffLines(a, a)).removed === 0);
    check("every line is kept when nothing changed", C.diffLines(a, a).every((r) => r.kind === "same"));
    const rows = C.diffLines(a, "a\nb\nX\nd\ne");
    check("a replaced line is one del and one add", C.diffStat(rows).added === 1 && C.diffStat(rows).removed === 1);
    check("line numbers point into both sides", (() => {
      const del = rows.find((r) => r.kind === "del"), add = rows.find((r) => r.kind === "add");
      return del.a === 3 && del.b === null && add.b === 3 && add.a === null;
    })());
    check("an inserted line is an add alone", C.diffStat(C.diffLines(a, "a\nb\nc\nNEW\nd\ne")).added === 1
      && C.diffStat(C.diffLines(a, "a\nb\nc\nNEW\nd\ne")).removed === 0);
    check("a deleted line is a del alone", C.diffStat(C.diffLines(a, "a\nb\nd\ne")).removed === 1
      && C.diffStat(C.diffLines(a, "a\nb\nd\ne")).added === 0);
    check("text against nothing is all additions", C.diffStat(C.diffLines("", a)).added === 5);
    check("CRLF does not read as a change", C.diffStat(C.diffLines("a\r\nb", "a\nb")).added === 0);
    // the whole run.xml is hundreds of lines; untouched stretches collapse
    const long = Array.from({ length: 60 }, (_, i) => "line" + i).join("\n");
    const edited = long.split("\n").map((l, i) => (i === 30 ? "CHANGED" : l)).join("\n");
    const collapsed = C.collapseDiff(C.diffLines(long, edited), 3);
    check("untouched stretches collapse", collapsed.length < 20 && collapsed.some((r) => r.kind === "gap"));
    check("the gap says how many it hides", collapsed.filter((r) => r.kind === "gap")
      .every((r) => Number.isFinite(r.count) && r.count > 0));
    check("changes survive collapsing", C.diffStat(collapsed).added === 1 && C.diffStat(collapsed).removed === 1);
    check("context is kept around a change", (() => {
      const i = collapsed.findIndex((r) => r.kind === "del");
      return collapsed[i - 1]?.kind === "same" && collapsed.slice(i).some((r) => r.kind === "same");
    })());
    // a run.xml shaped diff: one attribute edited deep in the file
    const xmlA = '<run>\n  <filter id="1">\n    <or>\n      <find name="ip.addr" content="1.1.1.1"/>\n    </or>\n  </filter>\n</run>';
    const xmlB = xmlA.replace("1.1.1.1", "8.8.8.8");
    const xr = C.diffLines(xmlA, xmlB);
    check("an edited attribute shows both lines", C.diffStat(xr).added === 1 && C.diffStat(xr).removed === 1
      && xr.find((r) => r.kind === "add").text.includes("8.8.8.8"));
  }

  /* What the device was running before each submit is kept beside the user's
     own saved configurations, and neither list may show the other's files. */
  {
    const mk = (type, slot, ts, size = 10) => C.buildSaveXmlName({ type, slot, timestamp: ts, size });
    const payload = { files: [
      { name: mk(C.SAVE_XML_TYPE, 1, 1000), description: "mine" },
      { name: mk(C.AUTO_SAVE_TYPE, 1, 2000) },
      { name: mk(C.AUTO_SAVE_TYPE, 2, 3000) },
      { name: mk(C.AUTO_SAVE_TYPE, 3, 4000) },
    ] };
    const all = C.savedConfigsFrom(payload);
    check("the type is carried through", all.every((f) => f.type) && new Set(all.map((f) => f.type)).size === 2);
    check("a save the user made is not a snapshot", C.userSaves(all).length === 1
      && C.userSaves(all)[0].description === "mine");
    check("the snapshots are their own list", C.autoSaves(all).length === 3);
    check("newest first", C.autoSaves(all)[0].saved === 4000);
    check("pruning keeps the newest", C.autoSavesToPrune(all, 2).length === 1
      && C.autoSavesToPrune(all, 2)[0].includes("2000"));
    check("nothing to prune under the limit", C.autoSavesToPrune(all, 10).length === 0);
    check("pruning never touches the user's saves",
      C.autoSavesToPrune(all, 0).length === 3 && !C.autoSavesToPrune(all, 0).some((n) => n.startsWith(C.SAVE_XML_TYPE)));
    check("slots are allocated within the snapshots", C.nextSaveSlot(C.autoSaves(all)) === 4);
    // the older firmware answers names only; the split still has to work
    const namesOnly = C.savedConfigsFrom({ save_xml_list: payload.files.map((f) => f.name) });
    check("names-only listings split too", C.autoSaves(namesOnly).length === 3 && C.userSaves(namesOnly).length === 1);
    check("the default type is still the user's", C.buildSaveXmlName({ slot: 1 }).startsWith(C.SAVE_XML_TYPE));
    check("the two types differ", C.AUTO_SAVE_TYPE !== C.SAVE_XML_TYPE);
    check("ten versions are kept", C.AUTO_SAVE_KEEP === 10);
  }

  /* A capture is another output on the same packet, so an output that rewrites
     it can reach the file first. .157 routes P4 to O2, which rewrites the TCP
     SYN MSS -- capturing on P4 is worth a word of warning. */
  {
    const out = (id, port, mods) => ({ id, port, mods });
    const chain = (ports, outTok) => ({ ports, tree: { t: "out", ports: outTok } });
    const doc = {
      outputs: [
        out(2, "P2", [{ k: "modify_tcp_syn_mss", val: "1200" }]),
        out(5, "P5", [{ k: "dir", val: "/data/x" }]),          // mirror only: copies, does not rewrite
        out(9, "P9", []),                                       // a plain port by another name
      ],
      chains: [chain("P4", "O2"), chain("P6", "O5"), chain("P7", "O9"), chain("P8", "P1")],
    };
    check("an output that rewrites is reported", C.captureRewriteRisk(doc, ["P4"]).length === 1
      && C.captureRewriteRisk(doc, ["P4"])[0].id === "O2");
    check("it says which port reaches it and where it goes", (() => {
      const r = C.captureRewriteRisk(doc, ["P4"])[0];
      return r.port === "P2" && r.via.join() === "P4";
    })());
    check("a mirror output does not rewrite", C.captureRewriteRisk(doc, ["P6"]).length === 0);
    check("an output with no modifiers is not a risk", C.captureRewriteRisk(doc, ["P7"]).length === 0);
    check("a plain port destination is not a risk", C.captureRewriteRisk(doc, ["P8"]).length === 0);
    check("ports with nothing on them are quiet", C.captureRewriteRisk(doc, ["P3"]).length === 0
      && C.captureRewriteRisk(doc, []).length === 0 && C.captureRewriteRisk(null, ["P4"]).length === 0);
    // several ingress ports reaching the same output are reported once
    const shared = { outputs: doc.outputs, chains: [chain("P4,P6", "O2"), chain("P7", "O2")] };
    const r2 = C.captureRewriteRisk(shared, ["P4", "P6", "P7"]);
    check("one entry per output, listing every ingress", r2.length === 1 && r2[0].via.join() === "P4,P6,P7");
    // deep in a branch tree, not just a bare terminal
    const deep = { outputs: doc.outputs, chains: [{ ports: "P4", tree: { t: "branch", fids: "F1",
      match: { t: "out", ports: "P1" }, notmatch: { t: "branch", fids: "F2",
        match: { t: "out", ports: "O2" }, notmatch: { t: "out", ports: "P2" } } } }] };
    check("an output further down a branch is found", C.captureRewriteRisk(deep, ["P4"]).length === 1);
  }

  // A mapping card is filled in in sequence, so the row it adds continues it
  {
    check("a trailing number steps on", C.nextMappingValue("P1") === "P2"
      && C.nextMappingValue("V15") === "V16" && C.nextMappingValue("7") === "8");
    check("zero padding is kept", C.nextMappingValue("V09") === "V10" && C.nextMappingValue("P007") === "P008");
    check("a prefix with its own digits survives", C.nextMappingValue("0/15") === "0/16");
    check("nothing to step from gives nothing", C.nextMappingValue("") === ""
      && C.nextMappingValue("Px") === "" && C.nextMappingValue(undefined) === "");
    const rows = [{ vport: "V1", switchPort: "P1" }, { vport: "V2", switchPort: "P2" }];
    check("the added row continues both columns",
      JSON.stringify(C.nextMappingRow(rows, ["vport", "switchPort"])) === JSON.stringify({ vport: "V3", switchPort: "P3" }));
    check("the first row is blank", JSON.stringify(C.nextMappingRow([], ["vport", "port"]))
      === JSON.stringify({ vport: "", port: "" }));
    // a column that was left empty stays empty rather than becoming "1"
    check("an empty column is not invented",
      JSON.stringify(C.nextMappingRow([{ vport: "V4", port: "" }], ["vport", "port"]))
      === JSON.stringify({ vport: "V5", port: "" }));
  }

  // Filters the device builds for itself (live blacklists over syslog/xmlrpc)
  // are in no configuration document. .157's chains reference F10001, F20001,
  // F100001 and F100002, and the hover called every one of them missing.
  {
    const tr = (k) => (k === "ch.tipOnDevice" ? "on the device — {n} entries" : k);
    const dev = C.deviceFilterList({ filter_counter: [
      { id: 10001, count: 36221, try_count: 65 }, { id: 100001, count: 10688, try_count: 65 }] });
    check("device filter list read from the counters", dev.length === 2 && dev[0].id === 10001 && dev[0].refs === 36221);
    const known = C.branchConditions("F10001", [], tr, [], dev)[0];
    check("a filter the device reports is not missing", known.missing === false && known.device === true);
    check("its size comes through", known.deviceRefs === 36221 && known.cond.includes("36221"));
    // signed out there are no counters, so the id range answers instead
    const guess = C.branchConditions("F10001", [], tr, [])[0];
    check("the id range stands in without the counters", guess.missing === false && guess.device === true
      && guess.cond === "ch.tipOnDeviceMaybe");
    // below the device threshold and in no document: genuinely missing
    const gone = C.branchConditions("F999", [], tr, [], dev)[0];
    check("a low id in no document is still missing", gone.missing === true && gone.device === false
      && gone.cond === "ch.tipMissing");
    // a locally defined filter is unaffected by any of this
    const local = C.branchConditions("F7", [{ id: 7, name: "x", blockifempty: "no",
      root: { t: "or", children: [{ t: "find", field: "ip.addr", rel: "==", val: "1.1.1.1" }] } }], tr, [], dev)[0];
    check("a defined filter still shows its conditions", local.missing === false && local.device === false
      && /1\.1\.1\.1/.test(local.cond));
    check("negation survives", C.branchConditions("!F10001", [], tr, [], dev)[0].neg === true);
  }

  // An empty filter's meaning depends on blockifempty, and the hover said one
  // of the two regardless. .157 runs <filter id="3" blockifempty="yes"><or/>.
  {
    const tr = (k) => k;
    const empty = { id: 3, blockifempty: "no", root: { t: "or", children: [] } };
    const blocking = { id: 3, blockifempty: "yes", root: { t: "or", children: [] } };
    const has = { id: 4, blockifempty: "yes",
      root: { t: "or", children: [{ t: "find", field: "ip.addr", rel: "==", val: "1.1.1.1" }] } };
    /* The overview lists conditions without going through a chain, and said
       "(match any)" for an empty filter -- true of the group, and the opposite
       of the truth about a filter with blockifempty="yes". */
    check("the listed condition follows blockifempty", C.filterCondText(empty, tr) === "ch.tipEmpty"
      && C.filterCondText(blocking, tr) === "ch.tipEmptyBlock");
    check("a filter with conditions still describes them", /1\.1\.1\.1/.test(C.filterCondText(has, tr)));
    const od = C.describeDoc({ filters: [blocking], chains: [] }, tr);
    check("describeDoc uses it", od.filters[0].cond === "ch.tipEmptyBlock");
    check("an empty filter matches everything", C.branchConditions("F3", [empty], tr)[0].cond === "ch.tipEmpty");
    check("blockifempty flips that", C.branchConditions("F3", [blocking], tr)[0].cond === "ch.tipEmptyBlock");
    check("blockIfEmpty is reported", C.branchConditions("F3", [blocking], tr)[0].blockIfEmpty === true
      && C.branchConditions("F3", [empty], tr)[0].blockIfEmpty === false);
    // blockifempty says nothing about a filter that does have conditions
    check("a filter with conditions is unaffected", !/ch\.tipEmpty/.test(C.branchConditions("F4", [has], tr)[0].cond));
  }

  // How several filters combine is worth saying; how one filter combines is
  // not. The device writes <fid type="and"> on single-filter branches as well,
  // which the overview rendered as "F5 (all)".
  {
    const label = (test, op) => (C.toks(test) > 1 ? (op === "and" ? "flow.all" : "flow.any") : "");
    check("one filter carries no combining label", label("F5", "and") === "" && label("F5", "or") === "");
    check("several filters say which way", label("F1,F2", "and") === "flow.all" && label("F1,F2", "or") === "flow.any");
    check("a negated single filter is still one", label("!F3", "and") === "");
    /* A branch and the criterion group inside it describe the same idea, so
       they say it with the same words. */
    for (const lang of Object.keys(I18N)) {
      const L = I18N[lang];
      check(`branch and group wording agree (${lang})`,
        L["crit.matchAll"].includes(L["flow.all"]) && L["crit.matchAny"].includes(L["flow.any"]));
    }
  }

  // field-aware filter terms: the syntax anyone coming from Wireshark tries
  {
    const dTcp2 = C.decodePacket(tcpSyn);          // 192.168.1.1 -> .2, 49152 -> 443, SYN, ttl 64
    const ctx = { text: `${dTcp2.src} ${dTcp2.dst} ${dTcp2.proto} ${dTcp2.info}`.toLowerCase(), f: dTcp2.f };
    const hit = (q, c = ctx) => { const r = C.parseFilterExpr(q); return r.ok && r.test(c); };
    check("f bag carries the ports", dTcp2.f.tcpSrc === 49152 && dTcp2.f.tcpDst === 443 && dTcp2.f.proto === "TCP");
    check("tcp.port matches either end", hit("tcp.port == 443") && hit("tcp.port == 49152") && !hit("tcp.port == 80"));
    check("srcport is one end only", hit("tcp.srcport == 49152") && !hit("tcp.srcport == 443"));
    check("numeric comparisons", hit("tcp.dstport < 1024") && hit("tcp.srcport >= 1024") && !hit("tcp.dstport > 1024"));
    check("bare = reads as ==", hit("tcp.port = 443"));
    check("CIDR prefix", hit("ip.addr == 192.168.1.0/24") && !hit("ip.addr == 10.0.0.0/8") && hit("ip.src == 192.168.0.0/16"));
    check("!= means neither end", !hit("ip.addr != 192.168.1.1") && !hit("tcp.port != 443") && hit("tcp.port != 80"));
    check("ip.addr != excludes a host on either side", !hit("ip.addr != 192.168.1.2"));
    check("proto compares as text, case-insensitively", hit("proto == tcp") && hit("proto == TCP") && !hit("proto == udp"));
    check("flags via contains", hit("tcp.flags contains syn") && !hit("tcp.flags contains ack"));
    check("ttl and length", hit("ip.ttl == 64") && hit("len > 50") && !hit("len > 100"));
    check("fields mix with substrings and operators", hit("tcp.port == 443 and not 10.0.0.") && hit("(tcp.port == 80 or tcp.port == 443) and proto == tcp"));
    check("a field term on a packet without that layer misses", !hit("udp.port == 53") && !hit("vlan == 100"));
    const dV = C.decodePacket(vlanUdp);
    check("vlan id filters", (() => { const c = { text: "x", f: dV.f }; return hit("vlan == 100", c) && !hit("vlan == 200", c) && hit("udp.dstport == 80", c); })());
    check("an unknown field is an error, not a silent miss", C.parseFilterExpr("bogus.field == 1").error === "field");
    check("a dangling comparison is an operand error", C.parseFilterExpr("tcp.port ==").error === "operand");
    check("a dotted substring still works", hit("192.168.1.1"));
    check("text-only callers still work", C.parseFilterExpr("tcp").test("some tcp row"));
  }

  // the rename a finished capture goes through, observed on the HL1
  {
    const tmp = "raw_20260923105028_406556.pcap.tmp";
    const done = "raw_20260923105028_20260923105037_406556.pcap";
    check("finished name resolved from the listing", C.finishedCaptureName(tmp, [tmp, done, "other.pcap"]) === done);
    // an empty capture is unlinked, not renamed: no match is the right answer
    check("no match when the file is gone", C.finishedCaptureName(tmp, ["unrelated.pcap"]) === "");
    // a capture in the same second is told apart by its microseconds
    check("a sibling capture is not mistaken for it",
      C.finishedCaptureName(tmp, ["raw_20260923105028_20260923105037_999999.pcap"]) === "");
    // a plain .tmp strip, should the firmware ever do only that
    check("plain rename also resolves", C.finishedCaptureName(tmp, ["raw_20260923105028_406556.pcap"]) === "raw_20260923105028_406556.pcap");
    check("only a .tmp has a finished name", C.finishedCaptureName("done.pcap", ["done.pcap"]) === "");
  }

  // the microsecond fraction is what distinguishes packets a millisecond apart
  check("fmtPacketTime keeps microseconds", /^\d\d:\d\d:\d\d\.123456$/.test(C.fmtPacketTime(1758600000123.456)));
  check("fmtPacketTime pads", /\.000001$/.test(C.fmtPacketTime(1758600000000.001)));
  // a fraction that rounds up to 1000000 would print a seventh digit. (Only
  // reachable at small timestamps: at epoch-millisecond magnitude a double
  // still resolves microseconds, so a real capture never gets here.)
  check("fmtPacketTime never overflows the fraction", /\.999999$/.test(C.fmtPacketTime(999.9999)));

  const dump = C.hexDump(hexpkt("41424344 45464748 494a"));
  check("hexDump line format", dump.length === 1 && dump[0].includes("41 42 43 44") && dump[0].endsWith("ABCDEFGHIJ"));
  check("hexDump caps output", C.hexDump(new Uint8Array(5000), 4096).at(-1).includes("more bytes"));
}

/* ---------- lint (catches what the suite cannot) ---------- */
group("lint");
{
  // A reference to a name that doesn't exist throws at render and blanks the whole
  // page — invisible to unit tests, so the linter checks for it here.
  const { execFileSync } = await import("node:child_process");
  let out = "", failed = false;
  try {
    execFileSync("npx", ["eslint", "GrismStudio.jsx", "grism-core.js", "i18n.js", "test.js"],
      { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { failed = true; out = String(e.stdout || "") + String(e.stderr || ""); }
  if (failed) console.log(out.split("\n").filter((l) => l.trim()).slice(0, 12).join("\n"));
  check("no undefined references or duplicate keys", !failed);
}

/* ---------- results ---------- */
console.log("\n" + "=".repeat(40));
console.log(`  ${_pass} passed, ${_fail} failed`);
console.log("=".repeat(40));
process.exit(_fail ? 1 : 0);
