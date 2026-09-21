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
  check("no chains yields nothing", C.inferIntent({ filters: [], chains: [] }).length === 0);
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
    files[0].href === "/file_manager/preview?download=1&file=/H1/snapshot/raw_20260914162733_20260914162740_761484.pcap");
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
    C.captureFileHref("/H1/", "/snapshot/", "x.pcap") === "/file_manager/preview?download=1&file=/H1/snapshot/x.pcap");
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

  check("a version string is an available update", C.parseUpdateCheck("6.5.260715") === "6.5.260715");
  check("blank means no update", C.parseUpdateCheck("") === "");
  check("non-version replies mean no update", C.parseUpdateCheck("no update available") === "");
  check("surrounding whitespace tolerated", C.parseUpdateCheck("  6.5.1  ") === "6.5.1");
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
    eth: "eth1", netmask: "255.255.255.0", gateway: "192.168.1.1", garp_interval: "0", bypassfilter: "" } };
  const cfg = C.buildMgmtConfigSet(iface);
  check("configSet wrapper", cfg.includes('<configSet reboot="no">'));
  check("role attribute", cfg.includes('role="management"'));
  check("ip written", cfg.includes("<ip>192.168.1.151</ip>"));
  check("only the ifcfgs section", !cfg.includes("<args>") && !cfg.includes("<interfaces>"));
  check("every ifcfg field present", C.IFCFG_FIELDS.every((k) => cfg.includes("<" + k + ">")));
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
    "MGMT", "MGMT (USB)", "MEC (S1AP/NGAP · GTP)",
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
  check("only a T12S offers the switch",
    C.hasSpeedSwitch("T12S") && C.hasSpeedSwitch("GRISM-T12S") &&
    !C.hasSpeedSwitch("G8S") && !C.hasSpeedSwitch("HL1") && !C.hasSpeedSwitch(""));

  check("the groups match the QLM wiring",
    C.T12S_SPEED_GROUPS.map((g) => `${g.qlm}:${g.ports.join(",")}`).join(" ") ===
    "qlm5_6:P0,P1,P2,P3 qlm3:P4,P5,P6,P7 qlm2:P8,P9,P10,P11");

  // the device reports speeds as numbers, not strings
  const cfg = { interfaces: [
    { name: "qlm2", type: "XFI", ports: [{ name: "P8", speed: 10000 }, { name: "P9", speed: 10000 }] },
    { name: "qlm3", type: "SGMII", ports: [{ name: "P4", speed: 1000 }] },
    { name: "qlm5_6", type: "SGMII", ports: [{ name: "P0", speed: 1000 }] },
    { name: null, type: "LOOP", ports: [{ name: "P12", speed: 10000 }] },
  ] };
  const sp = C.t12sSpeeds(cfg);
  check("each group reads its current speed",
    sp.qlm2 === "10000" && sp.qlm3 === "1000" && sp.qlm5_6 === "1000");
  check("interfaces outside the groups are ignored", Object.keys(sp).length === 3);

  // A G8S reports no interface names at all; a group we cannot read must stay
  // out of the list rather than show up as a guess.
  check("an unreadable config yields no groups",
    Object.keys(C.t12sSpeeds(null)).length === 0 &&
    Object.keys(C.t12sSpeeds({ interfaces: [{ name: null, ports: [{ speed: 1000 }] }] })).length === 0);
  check("an unexpected speed is not offered as current",
    Object.keys(C.t12sSpeeds({ interfaces: [{ name: "qlm2", ports: [{ speed: 2500 }] }] })).length === 0);

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
  check("no vlan means no <vlanid>",
    !C.buildVportConfigSet({ adds: [{ name: "V9", ports: "P0" }] }).includes("<vlanid>"));

  const dev = ["P0", "P1", "P6", "P7"];
  const kinds = (o) => C.vportProblems({ ...o, devicePorts: dev }).map((x) => x.kind).join(" ");
  check("a good row has no problems", kinds({ adds: [{ name: "V9", ports: "P6,P7", vlanid: "103" }] }) === "");
  check("the vlan is optional", kinds({ adds: [{ name: "V9", ports: "P6" }] }) === "");
  check("a name has to look like V3",
    kinds({ adds: [{ name: "x9", ports: "P6" }] }) === "badName" &&
    kinds({ adds: [{ name: "", ports: "P6" }] }) === "noName");
  /* A name already in use would collide -- unless the port holding it is being
     removed in the same submit, which is one configSet and so one moment. */
  check("a name in use is a problem",
    kinds({ adds: [{ name: "V3", ports: "P6" }], existing: [{ name: "V3" }] }) === "duplicate");
  check("unless that port is being removed at the same time",
    kinds({ adds: [{ name: "V3", ports: "P6" }], existing: [{ name: "V3" }], deletes: ["V3"] }) === "");
  check("two new rows cannot share a name",
    kinds({ adds: [{ name: "V9", ports: "P6" }, { name: "V9", ports: "P7" }] }) === "duplicate");
  check("members are required and must exist on the device",
    kinds({ adds: [{ name: "V9", ports: "" }] }) === "noPorts" &&
    kinds({ adds: [{ name: "V9", ports: "P6,P99" }] }) === "unknownPort");
  check("a vlan id is 1..4094",
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "0" }] }) === "badVlan" &&
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "4095" }] }) === "badVlan" &&
    kinds({ adds: [{ name: "V9", ports: "P6", vlanid: "4094" }] }) === "");
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
  for (const [name, P] of [["T12S", L], ["G8S", G]]) {
    const top = Math.min(...P.cages.map((c) => c.y));
    const bottom = Math.max(...P.cages.map((c) => c.y + c.h));
    check(`${name} leaves room for the labels above and below`,
      top >= 12 && P.height - bottom >= 12);
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
  /* The label repeats what the row already says; the column is narrow and the
     whole line stays in the tooltip. */
  check("a labelled version keeps only the number",
    C.shortVersion("nginx version: nginx/1.22.1") === "1.22.1" &&
    C.shortVersion("NET-SNMP version:  5.5.2.1") === "5.5.2.1");
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
  const bonds = C.switchBonds(rows);
  check("a bond is one port covering four, in panel names",
    bonds.length === 1 && bonds[0].master === "V1" && bonds[0].speed === "100000" &&
    bonds[0].members.join() === "V0,V1,V2,V3");
  check("the traffic table can tell a member from the master",
    C.bondTag(bonds, "V2").master === "V1" && C.bondTag(bonds, "V4") === null);
  {
    const L = C.panelLayout("Q16");
    const M = C.bondPanelLayout(L, bonds);
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
