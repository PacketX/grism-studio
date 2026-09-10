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

/* ---------- every template is valid and round trips ---------- */
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

  const pt = C.summarizePacketTypes({ ipfragment: 252, gtp: 0, gre: 109599, vxlan: 0 });
  check("packet types sorted", pt[0].key === "gre" && pt[0].count === 109599);
  check("zero types kept", pt.some((p) => p.key === "gtp" && p.count === 0));
}

/* ---------- change tracking ---------- */
group("change tracking");
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
  check("chains match on cid", C.diffDoc(base, { ...base, chains: [{ cid: "c1", ports: "P9" }] }).chains.changed[0] === "c1");
  check("sectionChanged helper", C.sectionChanged(d, "filters") && !C.sectionChanged(d, "chains"));
  check("missing sections tolerated", C.diffDoc({}, {}).total === 0);
}

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

/* ---------- results ---------- */
console.log("\n" + "=".repeat(40));
console.log(`  ${_pass} passed, ${_fail} failed`);
console.log("=".repeat(40));
process.exit(_fail ? 1 : 0);
