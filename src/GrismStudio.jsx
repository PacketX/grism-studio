import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import "./GrismStudio.css";
import { STUDIO_VERSION, makeT } from "./i18n.js";
import {
  ACT_MODS, ACT_MOD_INDEX, FIELDS, FIELD_INDEX, INPUT_FIELD_INDEX, NODE_W, NODE_H, PH_H,
  OUT_MODS, OUT_MOD_INDEX, TEMPLATES, VLAN_OPS, actionProblems, buildMgmtConfigSet,
  cUpdate, chainProblems, docSnapshot, cloneForDup, collectRefs, describeDoc, filterProblems,
  fmtBytes, fmtKB, fmtNum, fmtSpeed, formatXml, inferIntent,
  inputFieldsFor, inputProblems, isDrop, isEmptyFilter, isUnset, layoutChain,
  mkAction, mkActionMod, mkChain, mkDrop, mkFind, mkGroup,
  mkInput, mkNot, mkOut, mkOutput, mkOutputMod, mkUnset,
  namesOnly, nid, normalizeDoc, outputProblems, parseMgmtIfaces, parseRun,
  pct, ph, relationsFor, serializeRun, setSide, summarizeStatus,
  tRemove, tUpdate, tmplText, toks, validate,
} from "./grism-core.js";

/* Persisted UI preferences (language, theme, traffic refresh interval). Stored in
   localStorage under one key; every read is guarded so a blocked/absent storage
   (private mode, embedded webview) just falls back to the defaults. */
const PREFS_KEY = "grism-studio-prefs";
function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
/* Non-fatal failures (optional device info, port descriptions) shouldn't break the
   page, but they shouldn't vanish silently either — log them so problems are
   diagnosable from the console. */
function warnFetch(what, err) {
  console.warn(`[GRISM Studio] ${what} unavailable:`, err?.message ?? err);
}
function writePref(key, value) {
  try {
    const p = readPrefs(); p[key] = value;
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch { /* storage unavailable — preferences just won't persist */ }
}


/* ============================================================
   Component tree
   ============================================================ */
export default function GrismStudio() {
  const [doc, setDocRaw] = useState(() => normalizeDoc(TEMPLATES.find((t) => t.id === "starter").make())); // seed with the starter example

  const [tab, setTab] = useState("overview");

  // --- two-level navigation: workspaces contain tabs ---
  // Overview is a standalone page. Config holds the editing/build tabs. System
  // holds device status pages. Future feature pages become new workspaces.
  const WORKSPACES = [
    { id: "overview", tabs: ["overview"] },
    { id: "pipeline", tabs: ["filters", "inputs", "outputs", "actions", "chain", "simulate", "export"] },
    { id: "traffic", tabs: ["trafficPorts"] },
    { id: "system", tabs: ["status", "settings"] },
  ];
  const tabWorkspace = (tb) => (WORKSPACES.find((w) => w.tabs.includes(tb)) ?? WORKSPACES[0]).id;
  const workspace = tabWorkspace(tab);
  useEffect(() => { if (workspace !== "pipeline") setHealthOpen(false); }, [workspace]);
  const gotoWorkspace = (wid) => { const w = WORKSPACES.find((x) => x.id === wid); if (w) setTab(w.tabs[0]); };

  // --- per-section undo/redo history (filters / inputs / outputs / actions / chains) ---
  // Each section keeps its own past/future stacks of JSON snapshots. We snapshot a
  // section whenever it changes (unless the change is itself an undo/redo). Undo/redo
  // act on the whole document (not per-tab). A tick state forces button re-render.
  const hist = useRef({ past: [], future: [], _pp: undefined, _pn: undefined });
  const [histLens, setHistLens] = useState({ u: 0, r: 0 });   // mirror past/future lengths in state
  const syncHistLens = () => setHistLens({ u: hist.current.past.length, r: hist.current.future.length });
  // ref to the latest doc so history recording is synchronous and effect-free.
  // (Effects fire twice under React StrictMode, which desynced the old approach.)
  const docRef = useRef(doc);
  docRef.current = doc;

  // Recording setDoc: computes the next doc, pushes the *previous* snapshot onto the
  // undo stack right here (synchronously, no effect), then commits. Every editor tab
  // calls this, so each edit is captured exactly once regardless of StrictMode.
  const setDoc = useCallback((updater) => {
    // Compute the next doc HERE (synchronously, from the latest committed doc) so we
    // can record history and update the button state immediately. Doing this inside
    // setDocRaw's updater doesn't work: React runs updaters later (and twice under
    // StrictMode), so any flag set in there isn't visible to this function yet.
    const prev = docRef.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    const prevSnap = docSnapshot(prev), nextSnap = docSnapshot(next);
    if (nextSnap !== prevSnap) {
      const h = hist.current;
      h.past.push(prevSnap);
      if (h.past.length > 200) h.past.shift();
      h.future = [];
      syncHistLens();
    }
    docRef.current = next;      // keep the ref current for back-to-back edits
    setDocRaw(next);            // commit the already-computed value (no updater fn)
  }, []);

  // clamp active selections to items that still exist after an undo/redo swap, so
  // the editor doesn't point at a row that was just removed.
  const clampActive = (parts) => {
    if (parts.filters) setActiveFilter((cur) => parts.filters.some((x) => x.id === cur) ? cur : (parts.filters[0]?.id ?? null));
    if (parts.inputs) setActiveInput((cur) => parts.inputs.some((x) => x.id === cur) ? cur : (parts.inputs[0]?.id ?? null));
    if (parts.outputs) setActiveOutput((cur) => parts.outputs.some((x) => x.id === cur) ? cur : (parts.outputs[0]?.id ?? null));
    if (parts.actions) setActiveAction((cur) => parts.actions.some((x) => x.id === cur) ? cur : (parts.actions[0]?.id ?? null));
    if (parts.chains) setActiveChain((cur) => parts.chains.some((x) => x.cid === cur) ? cur : (parts.chains[0]?.cid ?? null));
  };
  const doUndo = useCallback(() => {
    const h = hist.current; if (!h.past.length) return;
    const prevSnap = h.past.pop();
    h.future.push(docSnapshot(docRef.current));   // current becomes redoable
    const parts = JSON.parse(prevSnap);
    const next = { ...docRef.current, ...parts };
    docRef.current = next;
    setDocRaw(next);                               // raw setter → not re-recorded
    clampActive(parts);
    syncHistLens();
  }, []);
  const doRedo = useCallback(() => {
    const h = hist.current; if (!h.future.length) return;
    const nextSnap = h.future.pop();
    h.past.push(docSnapshot(docRef.current));      // current becomes undoable again
    const parts = JSON.parse(nextSnap);
    const next = { ...docRef.current, ...parts };
    docRef.current = next;
    setDocRaw(next);
    clampActive(parts);
    syncHistLens();
  }, []);
  // undo/redo buttons show on any pipeline editor tab.
  const PIPELINE_EDIT_TABS = ["filters", "inputs", "outputs", "actions", "chain"];
  const histKey = PIPELINE_EDIT_TABS.includes(tab) ? "doc" : null;
  // clear undo/redo history — after loading a template or running config, so the
  // load itself can't be undone back into the previous document.
  const resetHistory = useCallback(() => {
    hist.current = { past: [], future: [], _pp: undefined, _pn: undefined };
    syncHistLens();
  }, []);
  // pending "replace the whole document" action, awaiting user confirmation.
  const [pendingLoad, setPendingLoad] = useState(null); // { run: () => void, kind: "template" | "running" }
  const [healthOpen, setHealthOpen] = useState(false);   // topbar issue/warning popover
  const [showAdv, setShowAdv] = useState(false);         // reveal empty advanced sections
  // jump to the tab (and item) a problem belongs to. Shared by the Export list and
  // the topbar health popover.
  const gotoScope = useCallback((scope) => {
    if (scope === "chain" || scope.startsWith("chain:")) {
      if (scope.startsWith("chain:")) setActiveChain(scope.slice(6));
      setTab("chain");
    }
    else if (scope[0] === "I") { setActiveInput(+scope.slice(1)); setTab("inputs"); }
    else if (scope[0] === "O") { setActiveOutput(+scope.slice(1)); setTab("outputs"); }
    else if (scope[0] === "A") { setActiveAction(+scope.slice(1)); setTab("actions"); }
    else { setActiveFilter(+scope.slice(1)); setTab("filters"); }
  }, []);
  const canUndo = histLens.u > 0;
  const canRedo = histLens.r > 0;
  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo — on any editor tab, and
  // not while typing in a field.
  useEffect(() => {
    if (!histKey) return;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [histKey, doUndo, doRedo]);
  // "light" | "dark" and "en" | "zh-TW" — persisted across sessions.
  const [theme, setTheme] = useState(() => readPrefs().theme ?? "light");
  const [lang, setLang] = useState(() => readPrefs().lang ?? "zh-TW");
  useEffect(() => { writePref("theme", theme); }, [theme]);
  useEffect(() => { writePref("lang", lang); }, [lang]);
  const t = useMemo(() => makeT(lang), [lang]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [login, setLogin] = useState({ open: false, user: "", pass: "", busy: false, err: "", ok: false, who: null });
  const DEFAULT_PORTS = ["P0","P1","P2","P3","P4","P5","P6","P7"];
  const [devicePorts, setDevicePorts] = useState(null); // null = use defaults; array = from device
  const [hbTargets, setHbTargets] = useState([]); // heartbeat targets from get_config: {id, sendPort, receivePort}
  const [deviceStorages, setDeviceStorages] = useState([]); // enabled storage names from get_config (output port options)
  const [loopPorts, setLoopPorts] = useState([]); // ports on a LOOP-type interface (out returns in on the same port)
  const [deviceFilterIds, setDeviceFilterIds] = useState(null); // filter ids that exist on the device (from get_filter_counter); null = unknown/not logged in
  const [activeFilter, setActiveFilter] = useState(1);
  const [activeOutput, setActiveOutput] = useState(1);
  const [activeAction, setActiveAction] = useState(1);
  const [activeInput, setActiveInput] = useState(1);
  // Simulate-tab state lifted here so it persists across tab switches (the tab
  // component unmounts when you navigate away).
  const simState = useState({});                 // filter match/not-match switches
  const simInPort = useState("");                // chosen ingress port
  const simInlines = useState([]);               // inline devices (session only)
  const simInlineDraft = useState({ open: false, name: "IPS", portA: "", portB: "" });
  const simFlipped = useState(false);            // device panel row flip
  const [activeChain, setActiveChain] = useState(null); // cid of selected chain

  const definedIds = useMemo(() => new Set(doc.filters.map((f) => "F" + f.id)), [doc.filters]);
  const outputIds = useMemo(() => new Set((doc.outputs ?? []).map((o) => "O" + o.id)), [doc.outputs]);
  const setFilterRoot = useCallback((fid, updater) => {
    // resolve the new root ONCE (updaters may add nodes with random nid()s).
    const filters = docRef.current.filters.map((f) => f.id === fid ? { ...f, root: updater(f.root) } : f);
    setDoc((d) => ({ ...d, filters }));
  }, [setDoc]);
  // update the tree of one chain (by cid)
  const setChainTreeFor = useCallback((cid, updater) => {
    // Resolve the new tree ONCE from the latest doc (updaters may create nodes with
    // random nid()s; running inside setDoc's updater would double-invoke under
    // StrictMode and break history dedup).
    const chains = docRef.current.chains.map((c) => c.cid === cid ? { ...c, tree: updater(c.tree) } : c);
    setDoc((d) => ({ ...d, chains }));
  }, [setDoc]);

  const runXml = useMemo(() => serializeRun(doc), [doc]);

  // "dirty" tracking: baseline is the XML as last loaded from / applied to the
  // device. When the current runXml differs, there are unapplied changes.
  const [baseline, setBaseline] = useState(null); // null until first load/apply
  const [docSource, setDocSource] = useState("template"); // "template" | "running" | "new" — drives which top-bar button is highlighted
  const [templateName, setTemplateName] = useState(() => TEMPLATES.find((t) => t.id === "starter")?.title ?? "Starter"); // title of the template the doc came from (for the Templates button label)
  const dirty = baseline !== null && runXml !== baseline;

  // in-port conflict: two chains sharing the same first ingress port
  // aggregate problems across the doc
  const allProblems = useMemo(() => {
    const fp = doc.filters.flatMap((f) => filterProblems(f.root, []).map((p) => ({ ...p, scope: `F${f.id}` })));
    const op = (doc.outputs ?? []).flatMap((o) => outputProblems(o, []).map((p) => ({ ...p, scope: `O${o.id}` })));
    const ap = (doc.actions ?? []).flatMap((a) => actionProblems(a, []).map((p) => ({ ...p, scope: `A${a.id}` })));
    const ip = (doc.inputs ?? []).flatMap((inp) => inputProblems(inp, []).map((p) => ({ ...p, scope: `I${inp.id}` })));
    const cp = (doc.chains ?? []).flatMap((c, i) => {
      const probs = chainProblems(c.tree, []);
      if (!String(c.ports ?? "").trim()) probs.push({ id: "in-" + c.cid, msg: "ingress has no port set" });
      return probs.map((p) => ({ ...p, scope: `chain:${c.cid}` }));
    });
    return [...fp, ...ip, ...op, ...ap, ...cp];
  }, [doc]);

  // non-blocking warnings — surfaced to the user but they don't prevent submit/copy
  const allWarnings = useMemo(() => {
    const w = [];
    // chain references to filter (F) / output (O) ids that aren't defined in this config
    (doc.chains ?? []).forEach((c) => {
      const missingF = new Set(), missingO = new Set();
      (function walk(n) {
        if (!n) return;
        if (n.t === "branch" && n.fids) {
          n.fids.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
            const id = tok.replace(/^!/, "");
            if (!/^F\d+$/.test(id) || definedIds.has(id)) return;
            // defined here? no. On the device (from get_filter_counter)? then it's fine.
            const num = +id.slice(1);
            if (deviceFilterIds && deviceFilterIds.has(num)) return;
            missingF.add(id);
          });
        }
        if (n.t === "out" && n.ports) {
          n.ports.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
            if (/^O\d+$/.test(tok) && !outputIds.has(tok)) missingO.add(tok);
          });
        }
        ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
      })(c.tree);
      missingF.forEach((id) => w.push({ id: `missingF-${c.cid}-${id}`, scope: `chain:${c.cid}`, label: id, msg: `filter ${id} isn't defined in this config` }));
      missingO.forEach((id) => w.push({ id: `missingO-${c.cid}-${id}`, scope: `chain:${c.cid}`, label: id, msg: `output ${id} isn't defined in this config` }));
    });
    return w;
  }, [doc.chains, definedIds, outputIds, deviceFilterIds]);

  // --- load the device's running config ---
  const [load, setLoad] = useState({ state: "idle", msg: "" }); // idle | loading | ok | error
  const doLoadRunning = useCallback(async () => {
    setLoad({ state: "loading", msg: "" });
    try {
      const res = await fetch("/grism/task/get_running_file?filename=run.xml", { credentials: "include" });
      if (!res.ok) throw new Error(`device responded ${res.status}`);
      const text = await res.text();
      const { doc: parsed, warnings } = parseRun(text);
      const normalized = normalizeDoc(parsed);
      docRef.current = normalized; setDocRaw(normalized);
      resetHistory();                          // the load itself is not undoable
      setDocSource("running");
      setBaseline(serializeRun(normalized)); // this is now in sync with the device
      setActiveFilter(parsed.filters[0]?.id ?? 1);
      setActiveOutput(parsed.outputs[0]?.id ?? 1);
      setActiveAction(parsed.actions[0]?.id ?? 1);
      setActiveChain(parsed.chains[0]?.cid ?? null);
      setLoad({ state: "ok", msg: warnings.length ? `loaded with ${warnings.length} warning${warnings.length>1?"s":""}` : "loaded running config", warnings });
    } catch (e) {
      setLoad({ state: "error", msg: e.message || "load failed" });
    }
  }, [resetHistory]);
  // whether the current document has unsaved edits worth confirming before we
  // replace it: either the user made undoable changes, or it differs from the
  // device baseline. When clean, loads apply directly without a confirm dialog.
  const docModified = () => hist.current.past.length > 0 || (baseline !== null && runXml !== baseline);
  // request a whole-document replace: confirm first only if there are edits to lose.
  const requestLoad = useCallback((req) => {
    if (!docModified()) req.run();
    else setPendingLoad(req);
  }, [baseline, runXml]);
  const loadRunning = useCallback(() => {
    requestLoad({ kind: "running", run: doLoadRunning });
  }, [doLoadRunning, requestLoad]);

  // fetch the device's interface/port list; flatten every interface's ports to
  // their names. Falls back to the default list on any failure.
  const loadDevicePorts = useCallback(async () => {
    try {
      const res = await fetch("/grism/task/get_config", { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const cfg = await res.json();
      const ifaces = cfg.interfaces ?? [];
      // list VPORT-type interfaces' ports first, then everything else (preserving
      // each group's own order), so the panel shows VPORTs before other types.
      const isVport = (i) => (i.type || "").toUpperCase() === "VPORT";
      const ordered = [...ifaces.filter(isVport), ...ifaces.filter((i) => !isVport(i))];
      const names = ordered.flatMap((i) => i.ports ?? []).map((p) => p.name).filter(Boolean);
      setDevicePorts(names.length ? [...new Set(names)] : null);
      // ports belonging to a LOOP-type interface: traffic sent out returns on the
      // same port. Tracked separately so the panel can list & animate them.
      const loops = ifaces.filter((i) => (i.type || "").toUpperCase() === "LOOP")
        .flatMap((i) => i.ports ?? []).map((p) => p.name).filter(Boolean);
      setLoopPorts([...new Set(loops)]);
      const targets = (cfg.heartbeat?.target ?? [])
        .map((t) => ({ id: t.id, sendPort: t.sendPort, receivePort: t.receivePort }))
        .filter((t) => t.id != null);
      setHbTargets(targets);
      const storages = (cfg.storages ?? []).filter((s) => s.enable).map((s) => s.name).filter(Boolean);
      setDeviceStorages([...new Set(storages)]);
    } catch { setDevicePorts(null); setHbTargets([]); setDeviceStorages([]); setLoopPorts([]); } // keep defaults
  }, []);

  // set the sync baseline from the device's running config WITHOUT replacing the
  // current edits — so the "unapplied changes" indicator reflects the real device
  // state after login, but the user's work is left intact.
  const loadBaseline = useCallback(async () => {
    try {
      const res = await fetch("/grism/task/get_running_file?filename=run.xml", { credentials: "include" });
      if (!res.ok) return;
      const text = await res.text();
      const { doc: parsed } = parseRun(text);
      setBaseline(serializeRun(normalizeDoc(parsed)));
    } catch { /* no baseline change on failure */ }
  }, []);

  // fetch the set of filter ids that actually exist on the device. Used to
  // suppress "filter Fn isn't defined" warnings when a chain references a filter
  // that lives on the device even though it isn't defined in this XML.
  const loadFilterCounter = useCallback(async () => {
    try {
      const res = await fetch("/grism/task/get_filter_counter", { credentials: "include" });
      if (!res.ok) { setDeviceFilterIds(null); return; }
      const data = await res.json();
      const ids = (data.filter_counter ?? []).map((f) => f.id).filter((n) => n != null);
      setDeviceFilterIds(new Set(ids));
    } catch { setDeviceFilterIds(null); }
  }, []);

  // --- device login ---
  const doLogin = useCallback(async (username, password) => {
    setLogin((l) => ({ ...l, busy: true, err: "" }));
    try {
      // hash the password with the browser's built-in SHA-256
      const bytes = new TextEncoder().encode(password);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const res = await fetch("/direct_login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Username: username, Password: password, PasswordHash: hash }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`login failed (${res.status})`);
      setLogin((l) => ({ ...l, busy: false, ok: true, pass: "", open: false, who: username }));
      setTimeout(() => setLogin((l) => ({ ...l, ok: false })), 2500);
      loadBaseline();      // now authenticated — set the sync baseline (doesn't touch the current edits)
      loadDevicePorts();   // and the interface/port list for pickers
      loadFilterCounter(); // and the device's filter ids (to suppress false "undefined" warnings)
      loadRunning();       // prompt to confirm before replacing edits on manual login
    } catch (e) {
      setLogin((l) => ({ ...l, busy: false, err: e.message || "login failed" }));
    }
  }, [loadBaseline, loadDevicePorts, loadFilterCounter, loadRunning]);

  // On mount, detect an existing device session (the session cookie survives a
  // page refresh even though React state resets). We probe an authed endpoint;
  // if it succeeds we're still logged in, so restore the signed-in UI and run the
  // usual post-login loads. The username cookie is HttpOnly (not readable from JS),
  // so on a restored session we show a generic "signed in" marker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_config", { credentials: "include" });
        if (!res.ok || cancelled) return;                 // not authenticated → stay logged out
        setLogin((l) => ({ ...l, who: "signed in" }));
        loadBaseline();
        loadDevicePorts();
        loadFilterCounter();
        doLoadRunning();                                     // auto-load the running config on session restore
      } catch { /* offline or not authed — stay logged out */ }
    })();
    return () => { cancelled = true; };
  }, [loadBaseline, loadDevicePorts, loadFilterCounter, doLoadRunning]);

  const doLogout = useCallback(async () => {
    try {
      await fetch("/logout", { method: "POST", credentials: "include" });
    } catch { /* clear local session regardless of network result */ }
    setDevicePorts(null); // fall back to default port list
    setHbTargets([]);
    setDeviceStorages([]);
    setLoopPorts([]);
    setDeviceFilterIds(null);
    setLogin((l) => ({ ...l, who: null, ok: false, pass: "", err: "" }));
  }, []);

  return (
    <div className={"gs-root" + (theme === "light" ? " light" : "")}>

      <header className="topbar">
        <button className="brand" onClick={() => setTab("overview")}>
          <span className="logo">◇</span>
          <span className="brand-name">GRISM</span>
          <span className="brand-sub">studio</span>
        </button>
        <nav className="ws-switch">
          {WORKSPACES.filter((w) => w.id !== "overview").map((w) => (
            <button key={w.id} className={"ws-btn" + (workspace === w.id ? " on" : "")} onClick={() => gotoWorkspace(w.id)}>
              {t("ws." + w.id)}
            </button>
          ))}
        </nav>
        {workspace === "pipeline" && (
        <nav className="tabs">
          {(() => {
            // Advanced sections (inputs / outputs / actions) stay out of the way until
            // they hold something. The toggle sits exactly where the advanced group
            // lives, so expanding/collapsing happens in place rather than at the end.
            const counts = { inputs: doc.inputs?.length ?? 0, outputs: doc.outputs?.length ?? 0, actions: doc.actions?.length ?? 0 };
            const advKeys = ["inputs", "outputs", "actions"];
            const used = advKeys.filter((k) => counts[k] > 0 || tab === k);   // always-visible ones
            const expanded = showAdv || used.length === advKeys.length;        // nothing left to reveal
            const shown = expanded ? advKeys : used;
            const hiddenCount = advKeys.length - shown.length;

            const tabBtn = (k) => (
              <button key={k} className={"tab" + (tab === k ? " on" : "") + (advKeys.includes(k) ? " adv" : "")} onClick={() => setTab(k)}>
                {t("tab." + k)}
                {k === "filters" && <span className="tab-badge">{doc.filters.length}</span>}
                {counts[k] > 0 && <span className="tab-badge">{counts[k]}</span>}
                {k === "chain" && (doc.chains?.length ?? 0) > 0 && <span className="tab-badge">{doc.chains.length}</span>}
              </button>
            );

            return (<>
              {tabBtn("filters")}

              {/* Advanced group, boxed so it reads as one optional area rather than
                  more top-level tabs. The caret opens/closes it in place; the label
                  sits above it as the group's heading. */}
              {(shown.length > 0 || hiddenCount > 0) && (
                <span className="tab-group">
                  {(() => {
                    // label + caret are one control: clicking either toggles the group
                    const canExpand = hiddenCount > 0;
                    const canCollapse = showAdv && used.length < advKeys.length;
                    const toggles = canExpand || canCollapse;
                    if (!toggles) return <span className="tab-group-label">{t("nav.advanced")}</span>;
                    const tip = canExpand ? t("nav.showAdvancedTip") : t("nav.hideAdvancedTip");
                    return (
                      <button className="tab-group-toggle" onClick={() => setShowAdv(canExpand)}
                        title={tip} aria-label={tip} aria-expanded={!canExpand}>
                        <span className="tab-group-label">{t("nav.advanced")}</span>
                        <span className="tab-group-caret" aria-hidden="true">{canExpand ? "›" : "‹"}</span>
                      </button>
                    );
                  })()}
                  {shown.map(tabBtn)}
                </span>
              )}

              {tabBtn("chain")}
              {tabBtn("simulate")}
              {tabBtn("export")}
            </>);
          })()}
        </nav>
        )}
        {workspace === "system" && (
        <nav className="tabs">
          {["status", "settings"].map((k) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
              {t("tab." + k)}
            </button>
          ))}
        </nav>
        )}
        <div className="tabs-spacer" />
        {histKey && (
          <div className="topbar-undo" title={t("undo.tip")}>
            <button className="undo-btn" onClick={doUndo} disabled={!canUndo} title={t("undo.undo")} aria-label={t("undo.undo")}>↶</button>
            <button className="undo-btn" onClick={doRedo} disabled={!canRedo} title={t("undo.redo")} aria-label={t("undo.redo")}>↷</button>
          </div>
        )}
        {workspace === "pipeline" && <>
          <button className={"tmpl-btn" + (docSource === "template" ? " src-active" : "")} onClick={() => setShowTemplates(true)}
            title={docSource === "template" ? `${t("btn.template_current")}: ${templateName}` : t("tmpl.tip")}>
            {docSource === "template" ? `${t("btn.template_current")} · ${templateName}` : t("btn.templates")}
          </button>
          {baseline !== null && (
            <div className={"sync-state " + (dirty ? "dirty" : "synced")}
              title={dirty ? t("sync.dirtyTip") : t("sync.syncedTip")}>
              <span className="sync-dot" />{dirty ? t("sync.dirty") : t("sync.synced")}
            </div>
          )}
          {login.who && (
            <button className={"load-btn " + load.state + (docSource === "running" ? " src-active" : "")} onClick={loadRunning} disabled={load.state === "loading"}
              title={t("btn.loadRunningTip")}>
              {load.state === "loading" ? t("btn.loading") : load.state === "error" ? t("btn.loadFailed") : t("btn.loadRunning")}
            </button>
          )}
        </>}
        {login.who
          ? <div className="user-box">
              <span className="user-name" title={t("user.signedIn")}>{login.who}</span>
              <button className="load-btn" onClick={doLogout} title={t("btn.logoutTip")}>{t("btn.logout")}</button>
            </div>
          : <button className={"load-btn" + (login.ok ? " ok" : "")} onClick={() => setLogin((l) => ({ ...l, open: true, err: "" }))}
              title={t("btn.loginTip")}>{t("btn.login")}</button>}
        <button className="lang-btn" onClick={() => setLang((l) => l === "en" ? "zh-TW" : "en")}
          title={t("lang.toggle")}>{t("lang.name")}</button>
        <button className="theme-btn" onClick={() => setTheme((tm) => tm === "light" ? "dark" : "light")}
          title={theme === "light" ? t("theme.toDark") : t("theme.toLight")}>
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        {workspace === "pipeline" && (
        <div className="health-wrap">
          <button className={"health " + (allProblems.length ? "bad" : allWarnings.length ? "warn" : "ok")}
            onClick={() => setHealthOpen((v) => !v)} title={t("health.tip")} aria-expanded={healthOpen}>
            <span className="dot" />{allProblems.length ? `${allProblems.length} ${allProblems.length>1?t("health.issues"):t("health.issue")}` : allWarnings.length ? `${allWarnings.length} ${allWarnings.length>1?t("health.warnings"):t("health.warning")}` : t("health.valid")}
          </button>
          {healthOpen && (
            <>
              <div className="health-scrim" onClick={() => setHealthOpen(false)} />
              <div className="health-pop">
                <div className="health-pop-head">
                  <span>{allProblems.length || allWarnings.length ? t("health.detailsTitle") : t("health.noneTitle")}</span>
                  <button className="health-pop-close" onClick={() => setHealthOpen(false)} aria-label={t("health.close")}>✕</button>
                </div>
                {allProblems.length === 0 && allWarnings.length === 0 && <p className="health-pop-none">{t("health.noneBody")}</p>}
                {allProblems.length > 0 && (
                  <ul className="problem-list">
                    {allProblems.map((p, i) => (
                      <li key={"p" + i} onClick={() => { gotoScope(p.scope); setHealthOpen(false); }}>
                        <code>{p.scope}</code> {p.label ? <b>{p.label}</b> : null} — {p.msg}
                      </li>
                    ))}
                  </ul>
                )}
                {allWarnings.length > 0 && (
                  <ul className="problem-list warn-list">
                    {allWarnings.map((p, i) => (
                      <li key={"w" + i} onClick={() => { gotoScope(p.scope); setHealthOpen(false); }}>
                        <code>{p.scope}</code> {p.label ? <b>{p.label}</b> : null} — {p.msg}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
        )}
      </header>
      {load.state === "error" && <div className="load-banner err">{t("banner.loadFailed")}: {load.msg}. {t("banner.checkSignedIn")}</div>}
      {load.state === "ok" && load.msg.includes("warning") && <div className="load-banner warn">{load.msg} — {t("banner.someUnrecognised")}</div>}

      {login.open && (
        <div className="tmpl-scrim" onClick={() => setLogin((l) => ({ ...l, open: false }))}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tmpl-modal-head">
              <span className="tmpl-modal-title">{t("login.title")}</span>
              <button className="tmpl-close" onClick={() => setLogin((l) => ({ ...l, open: false }))} aria-label={t("common.cancel")}>✕</button>
            </div>
            <div className="login-body">
              <label className="login-field"><span>{t("login.username")}</span>
                <input value={login.user} autoFocus
                  onChange={(e) => setLogin((l) => ({ ...l, user: e.target.value }))} /></label>
              <label className="login-field"><span>{t("login.password")}</span>
                <input type="password" value={login.pass}
                  onChange={(e) => setLogin((l) => ({ ...l, pass: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && !login.busy) doLogin(login.user, login.pass); }} /></label>
              {login.err && <p className="login-err">{login.err}</p>}
              <button className="primary login-submit" disabled={login.busy || !login.user}
                onClick={() => doLogin(login.user, login.pass)}>
                {login.busy ? t("login.signingIn") : t("login.signIn")}</button>
            </div>
          </div>
        </div>
      )}

      {showTemplates && (
        <div className="tmpl-scrim" onClick={() => setShowTemplates(false)}>
          <div className="tmpl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tmpl-modal-head">
              <span className="tmpl-modal-title">{t("tmpl.modalTitle")}</span>
              <button className="tmpl-close" onClick={() => setShowTemplates(false)} aria-label={t("common.cancel")}>✕</button>
            </div>
            <TemplatesTab lang={lang} t={t} onApply={(tpl) => requestLoad({ kind: "template", run: () => { const nd = normalizeDoc(tpl.make()); docRef.current = nd; setDocRaw(nd); setBaseline(null); setDocSource("template"); setTemplateName(tpl.title); setLoad({ state: "idle", msg: "" }); resetHistory(); setActiveFilter(1); setShowTemplates(false); } })} />
          </div>
        </div>
      )}
      {pendingLoad && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setPendingLoad(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t("confirm.discardTitle")}</div>
            <p className="modal-body">
              {pendingLoad.kind === "running" ? t("confirm.discardBodyRunning") : t("confirm.discardBodyTemplate")}
            </p>
            <button className="opt drop" onClick={() => { const run = pendingLoad.run; setPendingLoad(null); run(); }}>
              <span className="opt-name">{t("confirm.discardLoad")}</span>
              <span className="opt-desc">{pendingLoad.kind === "running" ? t("confirm.replaceRunning") : t("confirm.replaceTemplate")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setPendingLoad(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      <div className="body">
        {(tab === "inputs" || tab === "outputs" || tab === "actions") && (
          <div className="adv-note">
            <span className="adv-note-badge">{t("adv.badge")}</span>
            {tab === "inputs" && <span>{t("adv.inputs")}</span>}
            {tab === "outputs" && <span>{t("adv.outputs")}</span>}
            {tab === "actions" && <span>{t("adv.actions")}</span>}
          </div>
        )}
        {tab === "overview" && (
          <OverviewTab doc={doc} docSource={docSource} templateName={templateName} lang={lang} t={t} loggedIn={!!login.who}
            onGoto={(dest) => setTab(dest)} />
        )}
        {tab === "status" && (
          <SystemStatusTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "settings" && (
          <SettingsTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "trafficPorts" && (
          <TrafficTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "filters" && (
          <FiltersTab
            doc={doc} setDoc={setDoc}
            activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            setFilterRoot={setFilterRoot} hbTargets={hbTargets} t={t}
          />
        )}
        {tab === "inputs" && (
          <InputsTab doc={doc} setDoc={setDoc} activeInput={activeInput} setActiveInput={setActiveInput} portOptions={devicePorts ?? DEFAULT_PORTS} t={t} />
        )}
        {tab === "outputs" && (
          <OutputsTab doc={doc} setDoc={setDoc} activeOutput={activeOutput} setActiveOutput={setActiveOutput} portOptions={[...(devicePorts ?? DEFAULT_PORTS), ...deviceStorages]} t={t} />
        )}
        {tab === "actions" && (
          <ActionsTab doc={doc} setDoc={setDoc} activeAction={activeAction} setActiveAction={setActiveAction} portOptions={devicePorts ?? DEFAULT_PORTS} t={t} />
        )}
        {tab === "chain" && (
          <ChainTab doc={doc} definedIds={definedIds} outputIds={outputIds}
            setChainTreeFor={setChainTreeFor} setDoc={setDoc}
            activeChain={activeChain} setActiveChain={setActiveChain}
            t={t}
            portOptions={devicePorts ?? DEFAULT_PORTS} portsFromDevice={devicePorts !== null} />
        )}
        {tab === "simulate" && (
          <SimulateTab doc={doc} definedIds={definedIds} portOptions={devicePorts ?? DEFAULT_PORTS} loopPorts={loopPorts} t={t}
            simState={simState} simInPort={simInPort} simInlines={simInlines} simInlineDraft={simInlineDraft} simFlipped={simFlipped} />
        )}
        {tab === "export" && (
          <ExportTab runXml={runXml} problems={allProblems} warnings={allWarnings} docSource={docSource} loggedIn={!!login.who} t={t}
            onApplied={() => setBaseline(runXml)}
            onApplyXml={(xmlText) => {
              const { doc: parsed, warnings } = parseRun(xmlText); // throws on malformed → caught in ExportTab
              const nd = normalizeDoc(parsed);
              docRef.current = nd; setDocRaw(nd);
              resetHistory();
              setDocSource("new");
              setLoad({ state: "idle", msg: "" });
              setActiveFilter(parsed.filters[0]?.id ?? 1);
              setActiveInput(parsed.inputs[0]?.id ?? 1);
              setActiveOutput(parsed.outputs[0]?.id ?? 1);
              setActiveAction(parsed.actions[0]?.id ?? 1);
              setActiveChain(parsed.chains[0]?.cid ?? null);
              return warnings;
            }}
            onGoto={gotoScope} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Overview tab — auto-generated explanation of the current doc
   ============================================================ */
function OverviewTab({ doc, docSource, templateName, onGoto, lang, t, loggedIn }) {
  const tr = t || ((k) => k);
  const info = useMemo(() => describeDoc(doc, tr), [doc, lang]);
  const [filtersOpen, setFiltersOpen] = React.useState(false); // Overview: show all filters vs first few

  const sourceLabel = docSource === "running" ? tr("ov.src.running")
    : docSource === "template" ? tr("ov.src.template").replace("{name}", templateName) : tr("ov.src.manual");

  // one-line plain summary
  const summary = (() => {
    const { filters, chains, ports } = info.counts;
    const parts = [];
    parts.push(`${filters} ${filters !== 1 ? tr("ov.unit.filters") : tr("ov.unit.filter")}`);
    parts.push(`${chains} ${chains !== 1 ? tr("ov.unit.chains") : tr("ov.unit.chain")}`);
    if (ports) parts.push(`${ports} ${ports !== 1 ? tr("ov.unit.ports") : tr("ov.unit.port")} (${info.ports.join(", ")})`);
    return parts.join(" · ");
  })();

  // detailed explanation: an authored description for known templates, or a
  // best-effort inferred read for running configs / pasted XML.
  const template = docSource === "template" ? TEMPLATES.find((x) => x.title === templateName) : null;
  const authored = template ? (tmplText(template, "detail", lang) || tmplText(template, "blurb", lang)) : null;
  const inferred = useMemo(() => (docSource === "template" ? [] : inferIntent(doc, tr)), [doc, docSource, lang]);

  return (
    <div className="ov-wrap">
      {/* what the product does, before we get into the loaded document */}
      <section className="ov-intro">
        <h2 className="ov-intro-title">{tr("ov.welcomeTitle")}</h2>
        <p className="ov-intro-body">{tr("ov.welcomeBody")}</p>
        <div className="ov-caps">
          {[["ov.capFilters", "ov.capFiltersBody", "filters"],
            ["ov.capSimulate", "ov.capSimulateBody", "simulate"],
            ["ov.capTraffic", "ov.capTrafficBody", null],
            ["ov.capSystem", "ov.capSystemBody", null]].map(([tk, bk, dest]) => (
            <div className={"ov-cap" + (dest ? " linked" : "")} key={tk}
              onClick={dest ? () => onGoto(dest) : undefined}>
              <span className="ov-cap-title">{tr(tk)}</span>
              <span className="ov-cap-body">{tr(bk)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="ov-head">
        <div>
          <h3 className="ov-section-label">{tr("ov.currentTitle")}</h3>
          <h2 className="ov-title">{tr("ov.title")}</h2>
          <p className="ov-sub">{tr("ov.loadedFrom")} {sourceLabel}. <span className="ov-summary">{summary}</span></p>
        </div>
      </div>

      {authored && (
        <div className="ov-explain">
          <p>{authored}</p>
        </div>
      )}
      {!authored && inferred.length > 0 && (
        <div className="ov-explain inferred">
          <div className="ov-explain-head">{tr("ov.looksLike")} <span className="ov-explain-tag">{tr("ov.inferred")}</span></div>
          <ul>{inferred.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <p className="ov-explain-note">{tr("ov.inferNote")}</p>
        </div>
      )}

      {info.filters.length > 0 && (
        <section className="ov-section">
          <h3 className="ov-h3">{tr("ov.filters")} <span className="ov-count">{info.filters.length}</span></h3>
          <div className="ov-filters">
            {(filtersOpen ? info.filters : info.filters.slice(0, 4)).map((f) => (
              <div className="ov-filter" key={f.id}>
                <code className="ov-fid">{f.id}</code>
                <div className="ov-fbody">
                  {f.name && <span className="ov-fname">{f.name}</span>}
                  <span className="ov-fcond">{f.cond || tr("ov.noCondition")}</span>
                </div>
              </div>
            ))}
          </div>
          {info.filters.length > 4 && (
            <button className="ov-collapse" onClick={() => setFiltersOpen((v) => !v)}>
              {filtersOpen ? `▴ ${tr("ov.showLess")}` : `▾ ${tr("ov.showAll")} (${info.filters.length - 4} ${tr("ov.more")})`}
            </button>
          )}
          <button className="ov-jump" onClick={() => onGoto("filters")}>{tr("ov.editFilters")}</button>
        </section>
      )}

      {info.chains.length > 0 && (
        <section className="ov-section">
          <h3 className="ov-h3">{tr("ov.chains")} <span className="ov-count">{info.chains.length}</span></h3>
          <div className="ov-chains">
            {info.chains.map((c, i) => <ChainFlow key={i} chain={c} filterNames={info.filterNames} t={tr} />)}
          </div>
          <button className="ov-jump" onClick={() => onGoto("chain")}>{tr("ov.editChains")}</button>
        </section>
      )}

      <footer className="ov-footer">
        <p>{tr("ov.copyright")}</p>
        <p>{tr("ov.website")}: <a href="http://www.packetx.biz/" target="_blank" rel="noreferrer">http://packetx.biz/</a></p>
        <p className="ov-build">GRISM Studio build {STUDIO_VERSION}</p>
      </footer>
    </div>
  );
}
// Pick a template field in the requested language, falling back to the base field.
// e.g. tmplText(tpl, "detail", "zh-TW") → tpl.detail_zh || tpl.detail.
function SystemStatusTab({ loggedIn, t }) {
  const tr = t || ((k) => k);
  const [status, setStatus] = React.useState(null);
  const [state, setState] = React.useState("idle"); // idle | loading | ok | error
  const [errMsg, setErrMsg] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [auto, setAuto] = React.useState(false);
  // device identity (model / version / serial / machine id) — fetched once per login
  const [dev, setDev] = React.useState({ model: "", serial: "", version: "", machineId: "" });
  React.useEffect(() => {
    if (!loggedIn) { setDev({ model: "", serial: "", version: "", machineId: "" }); return; }
    let alive = true;
    (async () => {
      const out = { model: "", serial: "", version: "", machineId: "" };
      try {
        const r = await fetch("/grism/task/get_config", { credentials: "include" });
        if (r.ok) {
          const text = await r.text();
          let model = "";
          try { const cfg = JSON.parse(text); model = (cfg.args && cfg.args.model) || cfg.model || ""; }
          catch { const m = text.match(/<model>([^<]*)<\/model>/i); if (m) model = m[1]; }
          out.model = String(model || "").trim();
        }
      } catch (e) { warnFetch("device model", e); }
      try {
        const r = await fetch("/grism/get_sn", { credentials: "include" });
        if (r.ok) out.serial = (await r.text()).trim();
      } catch (e) { warnFetch("device serial number", e); }
      try {
        const r = await fetch("/grism/task/get_version", { credentials: "include" });
        if (r.ok) out.version = (await r.text()).trim().split("-")[0];
      } catch (e) { warnFetch("device version", e); }
      try {
        const r = await fetch("/grism/get_machine_id", { credentials: "include" });
        if (r.ok) out.machineId = (await r.text()).trim();
      } catch (e) { warnFetch("machine id", e); }
      if (alive) setDev(out);
    })();
    return () => { alive = false; };
  }, [loggedIn]);

  const load = React.useCallback(async () => {
    setState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const res = await fetch("/grism/task/get_system_status", { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      setStatus(json); setState("ok"); setUpdatedAt(new Date()); setErrMsg("");
    } catch (e) { setState("error"); setErrMsg(String(e.message || e)); }
  }, []);

  // initial load when logged in
  React.useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);
  // auto-refresh every 5s while enabled
  React.useEffect(() => {
    if (!auto || !loggedIn) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [auto, loggedIn, load]);

  const info = useMemo(() => summarizeStatus(status), [status]);

  if (!loggedIn) return (
    <div className="sys-wrap"><div className="sys-need-login">{tr("sys.needLogin")}</div></div>
  );

  return (
    <div className="sys-wrap">
      <div className="sys-head">
        <h2 className="sys-title">{tr("sys.title")}</h2>
        <div className="sys-controls">
          {updatedAt && <span className="sys-updated">{tr("sys.lastUpdated")} {updatedAt.toLocaleTimeString()}</span>}
          <label className="sys-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {tr("sys.auto")}</label>
          <button className="sys-refresh" onClick={load} disabled={state === "loading"}>{state === "loading" ? tr("sys.refreshing") : tr("sys.refresh")}</button>
        </div>
      </div>

      {state === "error" && <div className="sys-err">{tr("sys.loadFailed")}: {errMsg}</div>}

      {(dev.model || dev.version || dev.serial || dev.machineId) && (
        <div className="sys-summary sys-identity">
          {dev.model && <div className="sys-kv"><span className="sys-k">{tr("sys.model")}</span><span className="sys-v">GRISM-{dev.model}</span></div>}
          {dev.version && <div className="sys-kv"><span className="sys-k">{tr("sys.version")}</span><span className="sys-v mono">{dev.version}</span></div>}
          {dev.serial && <div className="sys-kv"><span className="sys-k">{tr("sys.serial")}</span><span className="sys-v mono">{dev.serial}</span></div>}
          {dev.machineId && <div className="sys-kv"><span className="sys-k">{tr("sys.machineId")}</span><span className="sys-v mono sys-mid">{dev.machineId}</span></div>}
        </div>
      )}

      {info && <>
        <div className="sys-summary">
          <div className="sys-kv"><span className="sys-k">{tr("sys.host")}</span><span className="sys-v">{info.u.host} <em>{info.u.kernel} · {info.u.arch}</em></span></div>
          <div className="sys-kv"><span className="sys-k">{tr("sys.uptime")}</span><span className="sys-v">{info.uptime}</span></div>
          <div className="sys-kv"><span className="sys-k">{tr("sys.datetime")}</span><span className="sys-v">{info.datetime}</span></div>
          <div className="sys-kv"><span className="sys-k">{tr("sys.loadavg")}</span><span className="sys-v mono">{info.loadavg}</span></div>
        </div>

        <div className="sys-grid">
          {/* CPU */}
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("sys.cpu")} <span className="sys-card-metric">{info.cpuOverall.toFixed(1)}%</span></h3>
            <div className="sys-bar big"><div className="sys-bar-fill" style={{ width: info.cpuOverall + "%" }} /></div>
            <div className="sys-cores">
              {info.cpu.map((c, i) => (
                <div className="sys-core" key={i}>
                  <span className="sys-core-label">{tr("sys.core")} {i}</span>
                  <div className="sys-bar"><div className="sys-bar-fill" style={{ width: c + "%" }} /></div>
                  <span className="sys-core-val">{c.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* Memory */}
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("sys.memory")} <span className="sys-card-metric">{info.memPct}%</span></h3>
            <div className="sys-bar big"><div className="sys-bar-fill" style={{ width: info.memPct + "%" }} /></div>
            <p className="sys-note">{tr("sys.used")} {fmtKB(info.memUsed)} {tr("sys.of")} {fmtKB(info.memTotal)}</p>
          </section>

          {/* Disk */}
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("sys.disk")}</h3>
            <div className="sys-disks">
              {info.disks.map((d, i) => (
                <div className="sys-disk" key={i}>
                  <div className="sys-disk-head"><code>{d.mount}</code><span className="sys-disk-dev">{d.dev}</span><span className="sys-disk-pct">{d.pctText}</span></div>
                  <div className="sys-bar"><div className="sys-bar-fill" style={{ width: d.pct + "%" }} /></div>
                  <p className="sys-note">{fmtKB(d.avail)} {tr("sys.availShort")} / {fmtKB(d.total)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Temperature */}
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("sys.temp")}</h3>
            {info.temps.length === 0
              ? <p className="sys-note dim">{tr("sys.noData")}</p>
              : <div className="sys-temp-list">
                  {info.temps.map(([k, v]) => {
                    const num = parseFloat(String(v));
                    const hot = !isNaN(num) && num >= 70;
                    return <div className="sys-temp-row" key={k}><span className="sys-temp-k">{k}</span><span className={"sys-temp-v" + (hot ? " tf-bad" : "")}>{String(v)}</span></div>;
                  })}
                </div>}
          </section>

          {/* Fans + Power */}
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("sys.fan")} · {tr("sys.power")}</h3>
            {info.fans.length === 0 && info.psus.length === 0
              ? <p className="sys-note dim">{tr("sys.noData")}</p>
              : <>
                  {info.fans.map((f, i) => {
                    const fault = f.Fault === true;
                    return (
                      <div className="sys-hw-row" key={"f" + i}>
                        <span className="sys-hw-name">{tr("sys.fan")} {f.Index ?? i + 1}{f.Rear != null && <em> · {f.Rear ? tr("sys.rear") : tr("sys.front")}</em>}</span>
                        {f.Speed != null && <span className="sys-hw-val mono">{f.Speed} {tr("sys.fanRpm")}</span>}
                        <span className={"sys-hw-badge " + (fault ? "bad" : "ok")}>{fault ? tr("sys.fault") : tr("sys.ok")}</span>
                      </div>
                    );
                  })}
                  {info.psus.map((p, i) => {
                    const present = p.Present === true, powered = p.Powered === true;
                    const state = !present ? "absent" : powered ? "ok" : "off";
                    return (
                      <div className="sys-hw-row" key={"p" + i}>
                        <span className="sys-hw-name">{tr("sys.power")} {p.Index ?? i + 1}</span>
                        <span className={"sys-hw-badge " + (state === "ok" ? "ok" : state === "absent" ? "dim" : "bad")}>
                          {state === "ok" ? tr("sys.powered") : state === "absent" ? tr("sys.absent") : tr("sys.psuOff")}</span>
                      </div>
                    );
                  })}
                </>}
          </section>
        </div>

        {/* Processes */}
        <section className="sys-card wide">
          <h3 className="sys-card-title">{tr("sys.processes")} <span className="sys-card-metric">{info.procs.length}</span></h3>
          <table className="sys-proc-table">
            <thead><tr>
              <th>{tr("sys.proc.name")}</th><th>{tr("sys.proc.pid")}</th><th>{tr("sys.proc.core")}</th><th>{tr("sys.proc.cpu")}</th><th>{tr("sys.proc.rss")}</th><th>{tr("sys.proc.state")}</th>
            </tr></thead>
            <tbody>
              {info.procs.map((p, i) => (
                <tr key={i}>
                  <td className="sys-proc-name">{p.name}</td>
                  <td className="mono">{p.pid}</td>
                  <td className="mono">{p.core}</td>
                  <td><div className="sys-proc-cpu"><div className="sys-bar mini"><div className="sys-bar-fill" style={{ width: Math.min(100, p.cpu) + "%" }} /></div><span>{p.cpu.toFixed(1)}</span></div></td>
                  <td className="mono">{p.rss}</td>
                  <td><span className={"sys-state s-" + p.state}>{p.state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>}
    </div>
  );
}

/* ============================================================
   Settings tab — device config (management IP + raw XML)
   ============================================================ */
function SettingsTab({ loggedIn, t }) {
  const tr = t || ((k) => k);
  const [raw, setRaw] = React.useState("");
  const [ifaces, setIfaces] = React.useState([]);
  const [state, setState] = React.useState("idle");     // idle | loading | ok | error
  const [errMsg, setErrMsg] = React.useState("");
  const [submit, setSubmit] = React.useState({ state: "idle", msg: "" }); // idle|sending|ok|error
  const [confirm, setConfirm] = React.useState(null);   // { kind:"ip", iface } | { kind:"xml" }
  const [section, setSection] = React.useState("mgmt");  // mgmt | raw

  const load = React.useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/grism/task/get_config_xml", { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      let pretty = text; try { pretty = formatXml(text); } catch { /* keep raw if unbalanced */ }
      setRaw(pretty); setIfaces(parseMgmtIfaces(text)); setState("ok"); setErrMsg("");
    } catch (e) { setState("error"); setErrMsg(String(e.message || e)); }
  }, []);
  React.useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);

  const submitConfig = async (xmlText) => {
    setSubmit({ state: "sending", msg: "" });
    try {
      const body = new URLSearchParams(); body.set("data", xmlText);
      const res = await fetch("/grism/task/submit_config", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setSubmit({ state: "ok", msg: "" });
      setTimeout(() => setSubmit({ state: "idle", msg: "" }), 2500);
    } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
  };

  const setIfaceField = (idx, k, v) => setIfaces((arr) => arr.map((it, i) => i === idx ? { ...it, fields: { ...it.fields, [k]: v } } : it));

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("set.needLogin")}</div></div>;

  return (
    <div className="sys-wrap">
      <div className="sys-head">
        <h2 className="sys-title">{tr("set.title")}</h2>
        <div className="sys-controls">
          <div className="set-seg">
            <button className={section === "mgmt" ? "on" : ""} onClick={() => setSection("mgmt")}>{tr("set.mgmtIP")}</button>
            <button className={section === "raw" ? "on" : ""} onClick={() => setSection("raw")}>{tr("set.rawXml")}</button>
          </div>
          <button className="sys-refresh" onClick={load} disabled={state === "loading"}>{state === "loading" ? tr("set.loading") : tr("set.load")}</button>
        </div>
      </div>

      {state === "error" && <div className="sys-err">{tr("set.loadFailed")}: {errMsg}</div>}
      {submit.state === "error" && <div className="sys-err">{tr("set.submitFailed")}: {submit.msg}</div>}
      {submit.state === "ok" && <div className="set-ok-banner">{tr("set.applied")}</div>}

      {section === "mgmt" && (
        <div className="set-ifaces">
          {ifaces.map((it, idx) => (
            <section className="set-card" key={it.role}>
              <div className="set-card-head">
                <h3>{it.fields.name || it.role} <span className="set-role">{tr("set.role")}: {it.role}</span></h3>
                <label className="set-enable"><input type="checkbox" checked={it.fields.enable === "True"}
                  onChange={(e) => setIfaceField(idx, "enable", e.target.checked ? "True" : "False")} /> {tr("set.enabled")}</label>
              </div>
              <div className="set-grid">
                {[["ip","set.ip",false],["netmask","set.netmask",false],["gateway","set.gateway",false],["name","set.name",true],["eth","set.eth",true]].map(([k, lbl, ro]) => (
                  <label className="set-field" key={k}><span>{tr(lbl)}</span>
                    {ro
                      ? <input className="ro" value={it.fields[k]} readOnly tabIndex={-1} />
                      : <input value={it.fields[k]} onChange={(e) => setIfaceField(idx, k, e.target.value)} />}
                  </label>
                ))}
              </div>
              <div className="set-actions">
                <span className="set-note">{tr("set.mgmtNote")}</span>
                <button className="sys-refresh" disabled={submit.state === "sending"}
                  onClick={() => setConfirm({ kind: "ip", iface: it })}>
                  {submit.state === "sending" ? tr("set.submitting") : tr("set.applyIP")}</button>
              </div>
            </section>
          ))}
        </div>
      )}

      {section === "raw" && (
        <div className="set-raw">
          <p className="set-note">{tr("set.rawNote")}</p>
          <textarea className="set-raw-xml" value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} />
          <div className="set-actions">
            <button className="copy-btn" disabled={!raw.trim()}
              onClick={() => { try { setRaw(formatXml(raw)); } catch { /* leave as-is if unbalanced */ } }}>
              {tr("ex.format")}</button>
            <button className="sys-refresh" disabled={submit.state === "sending" || !raw.trim()}
              onClick={() => setConfirm({ kind: "xml" })}>
              {submit.state === "sending" ? tr("set.submitting") : tr("set.applyXml")}</button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setConfirm(null)}>
          <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{confirm.kind === "ip" ? tr("set.confirmTitle") : tr("set.confirmXmlTitle")}</div>
            <p className="modal-body">{confirm.kind === "ip" ? tr("set.confirmBody") : tr("set.confirmXmlBody")}</p>
            <button className="opt drop" onClick={() => {
              const xml = confirm.kind === "ip" ? buildMgmtConfigSet(confirm.iface) : raw;
              setConfirm(null); submitConfig(xml);
            }}>
              <span className="opt-name">{tr("set.confirmApply")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setConfirm(null)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Traffic tab — per-interface statistics from get_statistics_json
   ============================================================ */
// Compact large integers: 1234567 → "1.23M". Pure → testable.
function TrafficTab({ loggedIn, t }) {
  const tr = t || ((k) => k);
  const [rows, setRows] = React.useState([]);
  const [sessions, setSessions] = React.useState(null); // { v4:{total,concurrent}, v6:{total,concurrent} }
  const [descs, setDescs] = React.useState({});         // { portName: description }
  const [state, setState] = React.useState("idle");   // idle | loading | ok | error
  const [errMsg, setErrMsg] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [refreshSec, setRefreshSec] = React.useState(() => readPrefs().refreshSec ?? 5);
  React.useEffect(() => { writePref("refreshSec", refreshSec); }, [refreshSec]);
  const [expanded, setExpanded] = React.useState(null); // idx of the open detail row
  const [showPhys, setShowPhys] = React.useState(false); // when V-ports exist, also show physical

  const load = React.useCallback(async () => {
    setState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const res = await fetch("/grism/task/get_statistics_json", { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      setRows(Array.isArray(json.statistics) ? json.statistics : []);
      setSessions({
        v4: { total: json.sessions?.total ?? 0, concurrent: json.sessions?.concurrent ?? 0 },
        v6: { total: json.sessionsv6?.total ?? 0, concurrent: json.sessionsv6?.concurrent ?? 0 },
      });
      setState("ok"); setUpdatedAt(new Date()); setErrMsg("");
    } catch (e) { setState("error"); setErrMsg(String(e.message || e)); }
  }, []);

  // port descriptions come from get_config (interfaces > ports), keyed by name.
  const loadDescs = React.useCallback(async () => {
    try {
      const res = await fetch("/grism/task/get_config", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      const map = {};
      (json.interfaces || []).forEach((grp) => (grp.ports || []).forEach((p) => { if (p.name) map[p.name] = p.description || ""; }));
      setDescs(map);
    } catch (e) { warnFetch("port descriptions", e); }
  }, []);

  React.useEffect(() => { if (loggedIn) { load(); loadDescs(); } }, [loggedIn, load, loadDescs]);
  // always live: refresh on the chosen interval
  React.useEffect(() => {
    if (!loggedIn) return;
    const ms = Math.max(1, Number(refreshSec) || 5) * 1000;
    const id = setInterval(load, ms);
    return () => clearInterval(id);
  }, [refreshSec, loggedIn, load]);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;

  // detail field groups for the expanded ingress view
  const DETAIL_SIMPLE = ["inMulticastPackets", "inBroadcastPackets", "inDups", "inDropBytes"];
  const DETAIL_LEN = ["inLen64Packets", "inLen65-127Packets", "inLen128-255Packets", "inLen256-511Packets", "inLen512-1023Packets", "inLen1024-1518Packets", "inLen1519-MaxPackets"];
  const DETAIL_ERR = ["inFcsAlignErrorPackets", "inRuntErrorPackets", "inRuntCrcErrorPackets", "inOversizeErrorPackets", "inOversizeCrcErrorPackets"];
  const COLSPAN = 15;

  // split V-ports (virtual, name starts with "V") from the rest. When any exist,
  // show them on their own and let the user reveal the physical ports too.
  // Split virtual (V*) from physical ports once per data refresh rather than on
  // every render — the table re-renders on each poll and can hold many rows.
  const { vRows, physRows, hasV, shownRows } = React.useMemo(() => {
    const isV = (r) => /^V/i.test(r.name || "");
    const v = rows.filter(isV), p = rows.filter((r) => !isV(r));
    return { vRows: v, physRows: p, hasV: v.length > 0,
      shownRows: v.length === 0 ? rows : (showPhys ? [...v, ...p] : v) };
  }, [rows, showPhys]);

  return (
    <div className="sys-wrap">
      <div className="sys-head">
        <h2 className="sys-title">{tr("tf.title")}</h2>
        <div className="sys-controls">
          {updatedAt && <span className="sys-updated">{tr("tf.updated")} {updatedAt.toLocaleTimeString()}</span>}
          <label className="tf-interval">{tr("tf.every")}
            <input type="number" min="1" value={refreshSec} onChange={(e) => setRefreshSec(e.target.value)} />
            {tr("tf.seconds")}</label>
          <button className="sys-refresh" onClick={load} disabled={state === "loading"}>{state === "loading" ? tr("tf.refreshing") : tr("tf.refresh")}</button>
        </div>
      </div>

      {state === "error" && <div className="sys-err">{tr("tf.loadFailed")}: {errMsg}</div>}

      {sessions && (
        <div className="tf-flow-line">
          <span className="tf-flow-seg"><b>{tr("tf.flowV4")}</b> {tr("tf.total")} <span className="mono">{fmtNum(sessions.v4.total)}</span> · {tr("tf.concurrent")} <span className="mono">{fmtNum(sessions.v4.concurrent)}</span></span>
          <span className="tf-flow-div">|</span>
          <span className="tf-flow-seg"><b>{tr("tf.flowV6")}</b> {tr("tf.total")} <span className="mono">{fmtNum(sessions.v6.total)}</span> · {tr("tf.concurrent")} <span className="mono">{fmtNum(sessions.v6.concurrent)}</span></span>
        </div>
      )}

      {hasV && (
        <div className="tf-portfilter">
          <span className="tf-portfilter-label">{tr("tf.vports")} ({vRows.length})</span>
          <label className="tf-portfilter-toggle"><input type="checkbox" checked={showPhys} onChange={(e) => setShowPhys(e.target.checked)} /> {tr("tf.showPhys")} ({physRows.length})</label>
        </div>
      )}

      {shownRows.length > 0 && (
        <div className="tf-table-wrap">
          <table className="tf-table">
            <thead><tr>
              <th className="tf-expander" />
              <th>{tr("tf.iface")}</th><th>{tr("tf.desc")}</th><th>{tr("tf.link")}</th><th>{tr("tf.speed")}</th>
              <th className="tf-num">{tr("tf.inRate")}</th><th className="tf-num">{tr("tf.outRate")}</th>
              <th className="tf-num">{tr("tf.inPkts")}</th><th className="tf-num">{tr("tf.outPkts")}</th>
              <th className="tf-num">{tr("tf.inBytes")}</th><th className="tf-num">{tr("tf.outBytes")}</th>
              <th className="tf-num">{tr("tf.inDrops")}</th><th className="tf-num">{tr("tf.outDrops")}</th>
              <th className="tf-num">{tr("tf.errors")}</th>
            </tr></thead>
            <tbody>
              {shownRows.map((r) => {
                const up = r.linkStatus === 1;
                const errs = (Number(r.inErrors) || 0);
                const inDrops = (Number(r.inDrops) || 0), outDrops = (Number(r.outDrops) || 0);
                const open = expanded === r.idx;
                return (
                  <React.Fragment key={r.idx}>
                    <tr className={"tf-row" + (open ? " open" : "")} onClick={() => setExpanded(open ? null : r.idx)}>
                      <td className="tf-expander"><span className="tf-caret" aria-hidden="true">{open ? "▾" : "▸"}</span></td>
                      <td className="tf-name">{r.name}</td>
                      <td className="tf-desc">{descs[r.name] || "—"}</td>
                      <td><span className={"tf-link " + (up ? "up" : "down")}>{up ? tr("tf.up") : tr("tf.down")}</span></td>
                      <td className="mono">{r.speed ? fmtSpeed(r.speed) : "—"}</td>
                      <td className="tf-num"><b>{(Number(r.inMbps) || 0).toFixed(2)}</b> <span className="tf-unit">Mbps</span></td>
                      <td className="tf-num"><b>{(Number(r.outMbps) || 0).toFixed(2)}</b> <span className="tf-unit">Mbps</span></td>
                      <td className="tf-num mono">{fmtNum(r.inPackets)}</td>
                      <td className="tf-num mono">{fmtNum(r.outPackets)}</td>
                      <td className="tf-num mono">{fmtBytes(r.inBytes)}</td>
                      <td className="tf-num mono">{fmtBytes(r.outBytes)}</td>
                      <td className={"tf-num mono" + (inDrops ? " tf-bad" : "")}>{fmtNum(inDrops)}</td>
                      {/* out drops are normal on many setups — keep them in the default text colour */}
                      <td className="tf-num mono">{fmtNum(outDrops)}</td>
                      <td className={"tf-num mono" + (errs ? " tf-bad" : "")}>{fmtNum(errs)}</td>
                    </tr>
                    {open && (
                      <tr className="tf-detail-row">
                        <td colSpan={COLSPAN}>
                          <div className="tf-detail">
                            <div className="tf-detail-title">{tr("tf.detailTitle")} · <code>{r.name}</code></div>
                            <div className="tf-detail-sub">{tr("tf.rateGroup")}</div>
                            <div className="tf-detail-grid">
                              <div className="tf-dcell"><span className="tf-dk">{tr("tf.d.inPps")}</span><span className="tf-dv mono">{fmtNum(r.inPps)} {tr("tf.pps")}</span></div>
                              <div className="tf-dcell"><span className="tf-dk">{tr("tf.d.outPps")}</span><span className="tf-dv mono">{fmtNum(r.outPps)} {tr("tf.pps")}</span></div>
                            </div>
                            <div className="tf-detail-sub">{tr("tf.detailTitle")}</div>
                            <div className="tf-detail-grid">
                              {DETAIL_SIMPLE.map((k) => (
                                <div className="tf-dcell" key={k}><span className="tf-dk">{tr("tf.d." + k)}</span><span className="tf-dv mono">{/Bytes$/.test(k) ? fmtBytes(r[k]) : fmtNum(r[k])}</span></div>
                              ))}
                            </div>
                            <div className="tf-detail-sub">{tr("tf.d.lenGroup")}</div>
                            <div className="tf-detail-grid">
                              {DETAIL_LEN.map((k) => (
                                <div className="tf-dcell" key={k}><span className="tf-dk">{tr("tf.d." + k)}</span><span className="tf-dv mono">{fmtNum(r[k])}</span></div>
                              ))}
                            </div>
                            <div className="tf-detail-sub">{tr("tf.d.errGroup")}</div>
                            <div className="tf-detail-grid">
                              {DETAIL_ERR.map((k) => {
                                const v = Number(r[k]) || 0;
                                return <div className="tf-dcell" key={k}><span className="tf-dk">{tr("tf.d." + k)}</span><span className={"tf-dv mono" + (v ? " tf-bad" : "")}>{fmtNum(v)}</span></div>;
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ChainFlow = React.memo(function ChainFlow({ chain, filterNames = {}, t }) {
  const tr = t || ((k) => ({ "flow.in": "traffic in", "flow.match": "match", "flow.nomatch": "no match", "flow.forward": "forward", "flow.loadBalance": "load balance", "flow.duplicate": "duplicate", "flow.all": "all", "flow.any": "any" }[k] || k));
  const flow = chain.flow || { root: null, terminal: null };
  const root = flow.root;
  const terminal = flow.terminal;

  const ingressW = 62, testW = 200, outW = 78, colGap = 76, rowH = 76;
  const inX = 30;
  const colX = (depth) => inX + ingressW + colGap + depth * (testW + colGap);

  // assign each test node a row (traversal order) and a depth (how many tests deep
  // it sits). Depth drives the x column, so match/notmatch fan out to the RIGHT and
  // never tangle in a single column.
  const nodes = [];               // { node, depth, row }
  let rowCounter = 0;
  (function place(n, depth) {
    const row = rowCounter++;
    nodes.push({ node: n, depth, row });
    ["match", "notmatch"].forEach((side) => { const s = n[side]; if (s.kind === "test") place(s.node, depth + 1); });
  })(root || { match: { kind: "default" }, notmatch: { kind: "default" }, _empty: true }, 0);
  const realNodes = root ? nodes : [];
  const maxDepth = realNodes.reduce((m, x) => Math.max(m, x.depth), 0);
  const rowY = (row) => 44 + row * rowH;
  const nodeById = {};
  realNodes.forEach((x) => { nodeById[x.node.id] = x; });

  // collect distinct destination ports (+drop) across every side, first-seen order.
  const destOrder = [];
  const addPorts = (side) => { if (side.kind === "ports") side.ports.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => { if (!destOrder.includes(p)) destOrder.push(p); }); if (side.kind === "drop" && !destOrder.includes("drop")) destOrder.push("drop"); };
  realNodes.forEach((x) => { addPorts(x.node.match); addPorts(x.node.notmatch); });
  if (!root && terminal) addPorts(terminal);

  const outX = colX(maxDepth + 1);
  const rowCount = Math.max(realNodes.length, 1);
  const destCount = Math.max(destOrder.length, 1);
  const destY = {};
  destOrder.forEach((d, i) => { destY[d] = rowY(i * (rowCount / destCount)) + (destCount < rowCount ? rowH / 2 : 0); });
  const height = Math.max(rowY(rowCount - 1) + 50, rowY(destCount - 1) + 50, 110);
  const width = outX + outW + 40;

  const rootMidY = root ? rowY(nodeById[root.id].row) : 44;

  // an arrow from (x1,y1) to (x2,y2) with a label of the given kind at the target.
  const arrow = (x1, y1, x2, y2, kind, key, labelText) => {
    const mx = (x1 + x2) / 2;
    return (
      <g key={key}>
        <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} className={"ovf-edge " + kind}
          markerEnd={`url(#ovfAr${kind === "match" ? "M" : kind === "notmatch" ? "N" : ""})`} />
        {labelText && <text x={x2 - 8} y={y2 - 6} textAnchor="end" className={"ovf-lbl " + kind}>{labelText}</text>}
      </g>
    );
  };

  // draw one side (match or notmatch) of a test node.
  const drawSide = (nx, side, kind) => {
    const from = nx.node;
    const x1 = colX(nx.depth) + testW, y1 = rowY(nx.row) + (kind === "match" ? -8 : 8);
    const label = kind === "match" ? tr("flow.match") : tr("flow.nomatch");
    const s = from[kind === "match" ? "match" : "notmatch"];
    if (s.kind === "default") return null;                       // unspecified → draw nothing
    if (s.kind === "test") {
      // continuation to another test in the next column to the right.
      const child = nodeById[s.node.id];
      return arrow(x1, y1, colX(child.depth), rowY(child.row), kind, kind + from.id, label);
    }
    if (s.kind === "drop") return arrow(x1, y1, outX, destY["drop"], kind, kind + from.id, label);
    if (s.kind === "ports") {
      const ports = s.ports.split(",").map((p) => p.trim()).filter(Boolean);
      const multi = ports.length > 1;
      const typeLabel = multi ? (s.mode === "loadBalance" ? tr("flow.loadBalance") : tr("flow.duplicate")) : null;
      return (
        <g key={kind + from.id}>
          {ports.map((p, k) => arrow(x1, y1, outX, destY[p], kind, kind + from.id + k, k === 0 ? label : null))}
          {typeLabel && <text x={(x1 + outX) / 2} y={y1 - 6} textAnchor="middle" className="ovf-type">{typeLabel}</text>}
        </g>
      );
    }
    return null;
  };

  return (
    <div className="ov-chain">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="ov-flow"
          role="img" aria-label={`${tr("ov.chains")} ${chain.ingress}`}>
        {/* ingress */}
        <rect x={inX} y={rootMidY - 16} width={ingressW} height="32" rx="7" className="ovf-in" />
        <text x={inX + ingressW / 2} y={rootMidY + 5} className="ovf-in-lbl">{chain.ingress}</text>

        {/* pure forward chain (no tests): ingress → output(s) */}
        {!root && terminal && (() => {
          const ports = terminal.kind === "ports" ? terminal.ports.split(",").map((p) => p.trim()).filter(Boolean) : terminal.kind === "drop" ? ["drop"] : [];
          const multi = ports.length > 1;
          const typeLabel = multi ? (terminal.mode === "loadBalance" ? tr("flow.loadBalance") : tr("flow.duplicate")) : null;
          const mx = (inX + ingressW + outX) / 2;
          return <g>{ports.map((p, k) => <path key={k} d={`M ${inX + ingressW} ${rootMidY} C ${mx} ${rootMidY}, ${mx} ${destY[p]}, ${outX} ${destY[p]}`} className="ovf-edge flow" markerEnd="url(#ovfAr)" />)}<text x={mx} y={rootMidY - 8} className="ovf-lbl flow" textAnchor="middle">{typeLabel || tr("flow.forward")}</text></g>;
        })()}

        {/* ingress → root test */}
        {root && arrow(inX + ingressW, rootMidY, colX(0), rowY(nodeById[root.id].row), "flow", "in", tr("flow.in"))}

        {/* output port nodes (each drawn once) */}
        {destOrder.map((d) => (
          <g key={"d" + d}>
            <rect x={outX} y={destY[d] - 15} width={outW} height="30" rx="7" className={d === "drop" ? "ovf-out drop" : "ovf-out"} />
            <text x={outX + outW / 2} y={destY[d] + 5} className={"ovf-out-lbl" + (d === "drop" ? " drop" : "")}>{d}</text>
          </g>
        ))}

        {/* test nodes + their two sides */}
        {realNodes.map((nx) => {
          const x = colX(nx.depth), y = rowY(nx.row);
          const nameOnly = namesOnly(nx.node.test, filterNames);
          const shortName = nameOnly.length > 26 ? nameOnly.slice(0, 25) + "…" : nameOnly;
          return (
            <g key={nx.node.id}>
              {drawSide(nx, "match", "match")}
              {drawSide(nx, "notmatch", "notmatch")}
              <rect x={x} y={y - 18} width={testW} height="36" rx="7" className="ovf-test" />
              <text x={x + testW / 2} y={shortName ? y - 2 : y + 4} className="ovf-test-id">{nx.node.test}{nx.node.op === "and" ? ` (${tr("flow.all")})` : toks(nx.node.test) > 1 ? ` (${tr("flow.any")})` : ""}</text>
              {shortName && <text x={x + testW / 2} y={y + 12} className="ovf-test-name">{shortName}</text>}
            </g>
          );
        })}
        <defs>
          <marker id="ovfAr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" className="ovf-ar flow" /></marker>
          <marker id="ovfArM" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" className="ovf-ar match" /></marker>
          <marker id="ovfArN" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" className="ovf-ar notmatch" /></marker>
        </defs>
      </svg>
    </div>
  );
});
// count comma-separated fid tokens (for "any"/"all" hint)
/* ============================================================
   Templates tab
   ============================================================ */
function TemplatesTab({ onApply, lang, t }) {
  const tr = t || ((k) => k);
  return (
    <div className="tmpl-wrap">
      <p className="tmpl-lead">
        {tr("tmpl.lead")}
      </p>
      <div className="tmpl-grid">
        {TEMPLATES.map((tpl) => (
          <button key={tpl.id} className="tmpl-card" onClick={() => onApply(tpl)}>
            <span className="tmpl-tag">{tmplText(tpl, "tag", lang)}</span>
            <span className="tmpl-title">{tmplText(tpl, "title", lang)}</span>
            <span className="tmpl-blurb">{tmplText(tpl, "blurb", lang)}</span>
            <span className="tmpl-cta">{tr("tmpl.apply")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Filters tab — recursive boolean tree editor
   ============================================================ */
/* Editable ID field for top-level elements. Shows the letter prefix (F/I/O/A),
   lets the user edit the numeric id, and blocks invalid or duplicate values —
   an id must be a positive integer unique within its own collection. Commits
   only a valid, non-duplicate change; otherwise shows the typed value as invalid
   until corrected. */
function IdField({ prefix, id, siblingIds, onCommit }) {
  const [draft, setDraft] = useState(String(id));
  useEffect(() => { setDraft(String(id)); }, [id]);
  const others = siblingIds.filter((x) => x !== id);
  const n = parseInt(draft, 10);
  const valid = /^\d+$/.test(draft) && n >= 1;
  const dup = valid && others.includes(n);
  const err = !valid ? "positive integer" : dup ? "id already in use" : null;
  const commit = () => {
    if (valid && !dup && n !== id) onCommit(n);
    else if (err || n === id) setDraft(String(id)); // revert invalid/duplicate/unchanged on blur
  };
  return (
    <label className="ml"><span>id</span>
      <div className="id-edit">
        <span className="id-prefix">{prefix}</span>
        <input className={"m-id editable" + (err ? " invalid" : "")} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      </div>
      {err && <span className="id-err">{err}</span>}
    </label>
  );
}

/* Left-hand list with drag-to-reorder and a per-item duplicate button. Reorder
   changes the underlying array order (and therefore XML output order). */
function SortableList({ items, activeKey, getKey, renderLabel, onSelect, onReorder, onDuplicate, addLabel, dupLabel, onAdd }) {
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const move = (fromKey, toKey) => {
    if (fromKey === toKey) return;
    const from = items.findIndex((it) => getKey(it) === fromKey);
    const to = items.findIndex((it) => getKey(it) === toKey);
    if (from < 0 || to < 0) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };
  const active = items.find((it) => getKey(it) === activeKey);
  return (
    <aside className="filter-list">
      {items.map((it) => {
        const k = getKey(it);
        return (
          <div key={k}
            className={"filter-item sortable" + (k === activeKey ? " on" : "") + (k === overKey && dragKey !== k ? " drop-target" : "") + (k === dragKey ? " dragging" : "")}
            draggable
            onDragStart={(e) => { setDragKey(k); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); if (overKey !== k) setOverKey(k); }}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            onDrop={(e) => { e.preventDefault(); if (dragKey != null) move(dragKey, k); setDragKey(null); setOverKey(null); }}
            onClick={() => onSelect(it)}>
            <span className="drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
            {renderLabel(it)}
          </div>
        );
      })}
      <button className="filter-add" onClick={onAdd}>{addLabel}</button>
      {active && <button className="filter-dup" onClick={() => onDuplicate(active)}>{dupLabel}</button>}
    </aside>
  );
}

function FiltersTab({ doc, setDoc, activeFilter, setActiveFilter, setFilterRoot, hbTargets, t }) {
  const tr = t || ((k) => k);
  const f = doc.filters.find((x) => x.id === activeFilter) || doc.filters[0];
  const problems = useMemo(() => f ? filterProblems(f.root, []) : [], [f]);

  const addFilter = () => {
    const nextId = Math.max(0, ...doc.filters.map((x) => x.id)) + 1;
    const newFilter = { id: nextId, name: "", sessionBase: "no", matchedlog: "no", root: mkGroup("or") };
    setDoc((d) => ({ ...d, filters: [...d.filters, newFilter] }));
    setActiveFilter(nextId);
  };
  const delFilter = (id) => {
    setDoc((d) => ({ ...d, filters: d.filters.filter((x) => x.id !== id) }));
    setActiveFilter(doc.filters.find((x) => x.id !== id)?.id ?? null);
  };
  const patchMeta = (patch) => setDoc((d) => ({ ...d, filters: d.filters.map((x) => x.id === f.id ? { ...x, ...patch } : x) }));
  const patchFattr = (name, v) => patchMeta({ fattrs: { ...(f.fattrs ?? {}), [name]: v } });

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

  if (!f) return <div className="empty-pane"><button className="primary" onClick={addFilter}>{tr("common.newFilter")}</button></div>;

  return (
    <div className="filters-layout">
      <SortableList
        items={doc.filters} activeKey={f.id} getKey={(x) => x.id}
        renderLabel={(x) => <><b>F{x.id}</b><span>{x.name || <em>{tr("flt.unnamed")}</em>}</span></>}
        onSelect={(x) => setActiveFilter(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, filters: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...doc.filters.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, filters: [...d.filters, copy] })); setActiveFilter(nextId); }}
        addLabel={tr("common.addFilter")} dupLabel={tr("flt.dupFilter")} onAdd={addFilter} />

      <div className="filter-editor">
        <div className="filter-meta">
          <IdField prefix="F" id={f.id} siblingIds={doc.filters.map((x) => x.id)}
            onCommit={(newId) => { setDoc((d) => ({ ...d, filters: d.filters.map((x) => x.id === f.id ? { ...x, id: newId } : x) })); setActiveFilter(newId); }} />
          <label className="ml grow"><span>{tr("common.name")}</span>
            <input value={f[f.labelAttr ?? "name"] ?? f.name ?? ""}
              onChange={(e) => { const k = f.labelAttr ?? "name"; patchMeta(k === "alt" ? { alt: e.target.value } : { name: e.target.value }); }}
              placeholder={tr("flt.namePh")} /></label>
          <label className="ml"><span>sessionBase</span>
            <select value={f.sessionBase} onChange={(e) => patchMeta({ sessionBase: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <label className="ml"><span>blockifempty</span>
            <select value={f.blockifempty || "no"} onChange={(e) => patchMeta({ blockifempty: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <label className="ml"><span>matchedlog</span>
            <select value={f.matchedlog || "no"} onChange={(e) => patchMeta({ matchedlog: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <button className="del" onClick={() => delFilter(f.id)}>{tr("common.delete")}</button>
        </div>


        <div className="oattr-bar">
          <CollapseSection label="Advanced attributes" active={Object.values(f.fattrs ?? {}).some((v) => v && v !== "no")}>
            <div className="oattr-grid">
              {[{ name: "maxPackets", kind: "num" }].map((a) => (
                <label key={a.name} className="oattr-field">
                  <span>{a.name}</span>
                  <input value={(f.fattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                    onChange={(e) => patchFattr(a.name, e.target.value)} />
                </label>
              ))}
            </div>
            <div className="oattr-subhead">regular expression</div>
            <div className="oattr-grid">
              {[
                { name: "masking", opts: ["no","yes"] },
                { name: "start", opts: ["","l2","l3","l4","l7","http_body"] },
                { name: "position", kind: "num" },
                { name: "within", kind: "num" },
              ].map((a) => (
                <label key={a.name} className="oattr-field">
                  <span>{a.name}</span>
                  {a.opts
                    ? <select value={(f.fattrs ?? {})[a.name] ?? ""} onChange={(e) => patchFattr(a.name, e.target.value)}>
                        {a.opts.map((op) => <option key={op} value={op}>{op || "—"}</option>)}
                      </select>
                    : <input value={(f.fattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                        onChange={(e) => patchFattr(a.name, e.target.value)} />}
                </label>
              ))}
            </div>
            <div className="oattr-grid">
              {[
                { name: "tuple5_live_hashtable_size", kind: "num" },
                { name: "mpslog", kind: "num" },
              ].map((a) => (
                <label key={a.name} className="oattr-field">
                  <span>{a.name}</span>
                  <input value={(f.fattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                    onChange={(e) => patchFattr(a.name, e.target.value)} />
                </label>
              ))}
            </div>
          </CollapseSection>
        </div>

        <div className="tree-scroll">
          <CritNode node={f.root} depth={0} canRemove={false} isRoot={true} hbTargets={hbTargets} t={tr}
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
          {problems.length ? `F${f.id} ${problems.length} ${problems.length>1?tr("flt.issuesIn"):tr("flt.issueIn")}` : `F${f.id} ${tr("flt.validIn")}`}
        </div>
      </div>
    </div>
  );
}

const RAILS = ["#5eead4", "#7dd3fc", "#c4b5fd", "#fda4af", "#fcd34d"];
function CritNode(props) {
  const { node, depth, isRoot } = props;
  if (node.t === "find") return <FindRow node={node} onChange={props.onChangeFind} onRemove={props.onRemove} canRemove={props.canRemove} hbTargets={props.hbTargets} t={props.t} />;
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
        <span className="op-desc">{isNot ? props.t("flt.opNotMatch") : node.t === "and" ? props.t("flt.opAllMatch") : props.t("flt.opAnyMatch")}</span>
        <div className="spacer" />
        {props.canRemove && <button className="icon-btn" onClick={() => props.onRemove(node.id)} aria-label={props.t("common.delete")}>✕</button>}
      </div>
      <div className="cnode-body">
        {(node.children ?? []).map((c) => <CritNode key={c.id} {...props} node={c} depth={depth + 1} canRemove={true} isRoot={false} />)}
      </div>
      <div className="cnode-actions">
        {!isNot && <>
          <button className="add-btn" onClick={() => props.onAddCond(node.id)}>{props.t("flt.addCondition")}</button>
          <button className="add-btn" onClick={() => props.onAddGroup(node.id)}>{props.t("flt.addGroup")}</button>
          <button className="add-btn subtle" onClick={() => props.onAddNot(node.id)}>{props.t("flt.addNot")}</button>
        </>}
        {isNot && (!node.children || !node.children.length) && <>
          <button className="add-btn" onClick={() => props.onAddCond(node.id)}>{props.t("flt.addCondition")}</button>
          <button className="add-btn" onClick={() => props.onAddGroup(node.id)}>{props.t("flt.addGroup")}</button>
        </>}
      </div>
    </div>
  );
}
function FindRow({ node, onChange, onRemove, canRemove, hbTargets, t }) {
  const tr = t || ((k) => k);
  const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
  const rels = relationsFor(kind); const isEx = kind === "exists";
  const err = isEx ? null : validate(kind, node.val);
  const isHbId = node.field === "heartbeat.target.miss.id";
  const targets = hbTargets ?? [];
  // when the current value isn't among fetched targets, still show it so it's not lost
  const hbHasVal = !node.val || targets.some((t) => String(t.id) === String(node.val));
  return (
    <div className="find-row">
      <select className="fld" value={node.field} onChange={(e) => {
        const nf = FIELD_INDEX[e.target.value]; const nr = relationsFor(nf.kind);
        onChange(node.id, { field: e.target.value, rel: nr.includes(node.rel) ? node.rel : (nr[0] ?? ""), val: nf.kind === "exists" ? "" : node.val });
      }}>
        {FIELDS.map((g) => <optgroup key={g.g} label={g.g}>{g.items.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}</optgroup>)}
      </select>
      {rels.length > 0 && <select className="rel" value={node.rel} onChange={(e) => onChange(node.id, { rel: e.target.value })}>
        {rels.map((r) => <option key={r} value={r}>{r}</option>)}</select>}
      {isEx ? <span className="exists-note">{node.rel === "!=" ? tr("flt.notExistsNote") : tr("flt.existsNote")}</span>
        : isHbId
          ? (targets.length > 0 || node.val
              ? <select className={"val" + (err ? " invalid" : "")} value={node.val}
                  onChange={(e) => onChange(node.id, { val: e.target.value })}>
                  {!node.val && <option value="">— select target —</option>}
                  {!hbHasVal && node.val && <option value={node.val}>id {node.val} (not in config)</option>}
                  {targets.map((t) => <option key={t.id} value={t.id}>id {t.id} · {t.sendPort}→{t.receivePort}</option>)}
                </select>
              : <input className={"val" + (err ? " invalid" : "")} value={node.val} placeholder={tr("flt.signInList")}
                  onChange={(e) => onChange(node.id, { val: e.target.value })} />)
          : <input className={"val" + (err ? " invalid" : "")} value={node.val} placeholder={ph(kind)}
              onChange={(e) => onChange(node.id, { val: e.target.value })} />}
      <div className="spacer" />
      <span className="fld-code">{node.field}</span>
      {canRemove && <button className="icon-btn" onClick={() => onRemove(node.id)} aria-label={tr("common.delete")}>✕</button>}
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
/* Single-port dropdown built from the device's port list. If the current value
   isn't in the list (e.g. loaded from an older config), it's shown anyway so it
   never silently disappears. */
function PortSelect({ value, options, onChange, invalid }) {
  const opts = options.includes(value) || !value ? options : [value, ...options];
  return (
    <select className={"m-port" + (invalid ? " invalid" : "")} value={value} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">— select —</option>}
      {opts.map((p) => <option key={p} value={p}>{p}{!options.includes(p) ? " (custom)" : ""}</option>)}
    </select>
  );
}

function InputsTab({ doc, setDoc, activeInput, setActiveInput, portOptions, t }) {
  const tr = t || ((k) => k);
  const inputs = doc.inputs ?? [];
  const inp = inputs.find((x) => x.id === activeInput) || inputs[0];
  const problems = useMemo(() => inp ? inputProblems(inp, []) : [], [inp]);

  const addInput = () => {
    const nextId = Math.max(0, ...inputs.map((x) => x.id)) + 1;
    const newInput = mkInput(nextId);
    setDoc((d) => ({ ...d, inputs: [...(d.inputs ?? []), newInput] }));
    setActiveInput(nextId);
  };
  const delInput = (id) => {
    setDoc((d) => ({ ...d, inputs: (d.inputs ?? []).filter((x) => x.id !== id) }));
    setActiveInput(inputs.find((x) => x.id !== id)?.id ?? null);
  };
  const patch = (p) => setDoc((d) => ({ ...d, inputs: d.inputs.map((x) => x.id === inp.id ? { ...x, ...p } : x) }));
  const setField = (k, v) => patch({ fields: { ...(inp.fields ?? {}), [k]: v } });
  const setScanAttr = (k, v) => patch({ scanAttrs: { ...(inp.scanAttrs ?? {}), [k]: v } });
  const setFilepath = (i, v) => { const arr = [...(inp.filepaths ?? [])]; arr[i] = v; patch({ filepaths: arr }); };
  const addFilepath = () => { const arr = [...(inp.filepaths ?? [])]; if (arr.length >= 100) return; arr.push(""); patch({ filepaths: arr }); };
  const removeFilepath = (i) => { const arr = (inp.filepaths ?? []).filter((_, k) => k !== i); patch({ filepaths: arr.length ? arr : [""] }); };

  if (!inp) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>{tr("in.emptyMsg")}</p>
        <button className="primary" onClick={addInput}>{tr("in.newInput")}</button>
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
      <SortableList
        items={inputs} activeKey={inp.id} getKey={(x) => x.id}
        renderLabel={(x) => <><b>I{x.id}</b><span>{x.name || <em>{x.type === "traffic-gen" ? "traffic-gen" : x.port}</em>}</span></>}
        onSelect={(x) => setActiveInput(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, inputs: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...inputs.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, inputs: [...d.inputs, copy] })); setActiveInput(nextId); }}
        addLabel={tr("common.addInput")} dupLabel={tr("common.dupInput")} onAdd={addInput} />

      <div className="filter-editor">
        <div className="filter-meta">
          <IdField prefix="I" id={inp.id} siblingIds={doc.inputs.map((x) => x.id)}
            onCommit={(newId) => { setDoc((d) => ({ ...d, inputs: d.inputs.map((x) => x.id === inp.id ? { ...x, id: newId } : x) })); setActiveInput(newId); }} />
          <label className="ml grow"><span>{tr("common.name")}</span>
            <input value={inp[inp.labelAttr ?? "name"] ?? inp.name ?? ""}
              onChange={(e) => { const k = inp.labelAttr ?? "name"; patch(k === "alt" ? { alt: e.target.value } : { name: e.target.value }); }}
              placeholder={tr("common.optional")} /></label>
          <label className="ml"><span>{tr("common.type")}</span>
            <select value={inp.type} onChange={(e) => patch({ type: e.target.value })}>
              <option value="replayPcap">replayPcap</option>
              <option value="traffic-gen">traffic-gen</option>
            </select></label>
          <button className="del" onClick={() => delInput(inp.id)}>{tr("common.delete")}</button>
        </div>

        <div className="tree-scroll">
          <div className="mod-row">
            <span className="mod-key">{tr("in.outputPort")}</span>
            <PortSelect value={inp.port} options={portOptions} onChange={(v) => patch({ port: v })}
              invalid={!/^[A-Z][0-9]+$/.test(inp.port)} />
            <code className="mod-tag">&lt;port&gt;</code>
          </div>
          <p className="out-empty">
            {inp.type === "traffic-gen" ? tr("in.helpGen") : tr("in.helpPcap")}
          </p>
          {inp.type === "traffic-gen" && fields.map(renderField)}

          {inp.type === "replayPcap" && <>
            <div className="mod-row">
              <span className="mod-key">{tr("in.source")}</span>
              <select className="mod-val" value={inp.pcapMode || "files"} onChange={(e) => patch({ pcapMode: e.target.value })}>
                <option value="files">{tr("in.fileList")}</option>
                <option value="scandir">{tr("in.scanDir")}</option>
              </select>
            </div>

            {(inp.pcapMode || "files") === "files" && <div className="filepath-list">
              {(inp.filepaths ?? [""]).map((fp, i) => (
                <div className="mod-row" key={i}>
                  <span className="mod-key">{i === 0 ? tr("in.filePaths") : ""}</span>
                  <input className="mod-val" value={fp} placeholder="H1/in/sample.pcap" onChange={(e) => setFilepath(i, e.target.value)} />
                  <button className="fp-del" title={tr("in.remove")} aria-label={tr("in.remove")} onClick={() => removeFilepath(i)}>✕</button>
                </div>
              ))}
              <div className="mod-row">
                <span className="mod-key" />
                <button className="fp-add" disabled={(inp.filepaths ?? []).length >= 100} onClick={addFilepath}>
                  + {tr("in.filePath")} {(inp.filepaths ?? []).length >= 100 ? tr("in.maxFiles") : `(${(inp.filepaths ?? []).length}/100)`}
                </button>
              </div>
            </div>}

            {(inp.pcapMode || "files") === "scandir" && <>
              <div className="mod-row">
                <span className="mod-key">{tr("in.scanDirLabel")}</span>
                <input className="mod-val" value={inp.fields?.scandir ?? ""} placeholder="H1/in" onChange={(e) => setField("scandir", e.target.value)} />
                <code className="mod-tag">&lt;scandir&gt;</code>
                {(inp.fields?.scandir) && <span className="scan-attrs">
                  {["interval", "minbytes", "timeout"].map((a) => (
                    <input key={a} className="scan-attr" placeholder={a} value={inp.scanAttrs?.[a] ?? ""} onChange={(e) => setScanAttr(a, e.target.value)} />
                  ))}
                </span>}
              </div>
              <div className="mod-row">
                <span className="mod-key">{tr("in.afterReplay")}</span>
                <select className="mod-val" value={inp.fields?.playedFilesHandle ?? ""} onChange={(e) => setField("playedFilesHandle", e.target.value)}>
                  <option value="">—</option><option value="delete">delete</option><option value="move">move</option>
                </select>
                <code className="mod-tag">&lt;playedFilesHandle&gt;</code>
              </div>
              {inp.fields?.playedFilesHandle === "move" && <div className="mod-row">
                <span className="mod-key">{tr("in.moveTo")}</span>
                <input className="mod-val" value={inp.fields?.playedFilesMoveTo ?? ""} placeholder="H1/in/played" onChange={(e) => setField("playedFilesMoveTo", e.target.value)} />
                <code className="mod-tag">&lt;playedFilesMoveTo&gt;</code>
              </div>}
            </>}

            {/* shared playback fields */}
            {["time", "speed", "msinterval"].map((k) => renderField(INPUT_FIELD_INDEX[k]))}
          </>}
        </div>

        <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />
          {problems.length ? `I${inp.id} ${problems.length} ${problems.length>1?tr("common.issuesIn"):tr("common.issueIn")}` : `I${inp.id} ${tr("common.valid")}`}
        </div>
      </div>
    </div>
  );
}

function OutputsTab({ doc, setDoc, activeOutput, setActiveOutput, portOptions, t }) {
  const tr = t || ((k) => k);
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
  // Which modifiers are offered for a given output type.
  //   httprequesthijack → only redirect2safeweb
  //   tcpreset          → none
  //   udpencap          → only dip/sport/dport
  //   (no type)         → everything EXCEPT redirect2safeweb/dip/sport/dport
  const TYPE_ONLY = { httprequesthijack: ["redirect2safeweb"], tcpreset: [], udpencap: ["dip","sport","dport"] };
  const TYPE_SCOPED_KEYS = ["redirect2safeweb","dip","sport","dport"]; // only shown under a specific type
  const modAllowed = (k, type) => {
    if (type && TYPE_ONLY[type] !== undefined) return TYPE_ONLY[type].includes(k);
    return !TYPE_SCOPED_KEYS.includes(k); // no type: all except the scoped ones
  };
  const patch = (patchObj) => setDoc((d) => ({ ...d, outputs: d.outputs.map((x) => x.id === o.id ? { ...x, ...patchObj } : x) }));
  const patchAttr = (name, v) => {
    if (name === "type") {
      // prune any modifiers not allowed under the new type
      const keptMods = (o.mods ?? []).filter((m) => modAllowed(m.k, v));
      patch({ oattrs: { ...(o.oattrs ?? {}), type: v }, mods: keptMods });
    } else {
      patch({ oattrs: { ...(o.oattrs ?? {}), [name]: v } });
    }
  };
  const addMod = (k) => patch({ mods: [...(o.mods ?? []), mkOutputMod(k)] });
  const setMod = (mid, val) => patch({ mods: o.mods.map((m) => m.id === mid ? { ...m, val } : m) });
  const setModOp = (mid, op) => patch({ mods: o.mods.map((m) => m.id === mid ? { ...m, op } : m) });
  const setModAttr = (mid, name, v) => patch({ mods: o.mods.map((m) => m.id === mid ? { ...m, attrs: { ...(m.attrs ?? {}), [name]: v } } : m) });
  const delMod = (mid) => patch({ mods: o.mods.filter((m) => m.id !== mid) });

  if (!o) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>{tr("out.emptyMsg")}</p>
        <button className="primary" onClick={addOutput}>{tr("out.newOutput")}</button>
      </div>
    </div>
  );

  const usedKeys = new Set((o.mods ?? []).map((m) => m.k));

  return (
    <div className="filters-layout">
      <SortableList
        items={outputs} activeKey={o.id} getKey={(x) => x.id}
        renderLabel={(x) => <><b>O{x.id}</b><span>{x.name || <em>{x.port}</em>}</span></>}
        onSelect={(x) => setActiveOutput(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, outputs: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...outputs.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, outputs: [...d.outputs, copy] })); setActiveOutput(nextId); }}
        addLabel={tr("common.addOutput")} dupLabel={tr("common.dupOutput")} onAdd={addOutput} />

      <div className="filter-editor">
        <div className="filter-meta">
          <IdField prefix="O" id={o.id} siblingIds={doc.outputs.map((x) => x.id)}
            onCommit={(newId) => { setDoc((d) => ({ ...d, outputs: d.outputs.map((x) => x.id === o.id ? { ...x, id: newId } : x) })); setActiveOutput(newId); }} />
          <label className="ml grow"><span>{tr("common.name")}</span>
            <input value={o[o.labelAttr ?? "name"] ?? o.name ?? ""}
              onChange={(e) => { const k = o.labelAttr ?? "name"; patch(k === "alt" ? { alt: e.target.value } : { name: e.target.value }); }}
              placeholder={tr("common.optional")} /></label>
          <label className="ml"><span>{tr("out.port")}</span>
            <PortSelect value={o.port} options={portOptions} onChange={(v) => patch({ port: v })}
              invalid={!/^[A-Z][0-9]+$/.test(o.port)} /></label>
          <button className="del" onClick={() => delOutput(o.id)}>{tr("common.delete")}</button>
        </div>

        <div className="oattr-bar">
          <CollapseSection label="Output attributes (advanced)" active={Object.values(o.oattrs ?? {}).some((v) => v && v !== "no")}>
            <div className="oattr-grid">
              {[
                { name: "type", opts: ["","httprequesthijack","tcpreset","udpencap"] },
                { name: "mtu", kind: "num" }, { name: "stl", kind: "num" },
                { name: "arp_srcip", kind: "ip" }, { name: "arp_dstip_mac", opts: ["no","yes"] },
                { name: "minbps", kind: "num" }, { name: "maxbps", kind: "num" },
              ].map((a) => (
                <label key={a.name} className="oattr-field">
                  <span>{a.name}</span>
                  {a.opts
                    ? <select value={(o.oattrs ?? {})[a.name] ?? "" } onChange={(e) => patchAttr(a.name, e.target.value)}>
                        {a.opts.map((op) => <option key={op} value={op}>{op || "—"}</option>)}
                      </select>
                    : <input value={(o.oattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                        onChange={(e) => patchAttr(a.name, e.target.value)} />}
                </label>
              ))}
            </div>
          </CollapseSection>
        </div>

        <div className="tree-scroll">
          {(o.mods ?? []).length === 0 && (
            <p className="out-empty">{tr("out.forwardNote")}</p>
          )}
          {(o.mods ?? []).map((m) => <OutputModRow key={m.id} mod={m} onChange={setMod} onOp={setModOp} onAttr={setModAttr} onRemove={delMod} />)}

          <div className="mod-palette">
            {[["rewrite",tr("out.pAdd")],["reply",tr("out.pReply")],["redirect",tr("out.pRedirect")],["mirror",tr("out.pMirror")],["vxlan",tr("out.pVxlan")],["nvgre",tr("out.pNvgre")]].map(([grp, label]) => {
              const curType = (o.oattrs ?? {}).type || "";
              const items = OUT_MODS.filter((meta) => meta.grp === grp && modAllowed(meta.k, curType));
              if (items.length === 0) return null; // hide groups with nothing to offer under this type
              return (
              <div key={grp} className="mod-palette-group">
                <span className="mod-palette-label">{label}</span>
                <div className="mod-palette-grid">
                  {items.map((meta) => (
                    <button key={meta.k} className="mod-add"
                      onClick={() => addMod(meta.k)}
                      disabled={usedKeys.has(meta.k) && (meta.k === "stripping" || meta.k === "tagging" ? false : true)}
                      title={meta.k}>
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              );
            })}
            {((o.oattrs ?? {}).type === "tcpreset") && <p className="out-empty">Type <code>tcpreset</code> takes no modifiers.</p>}
          </div>
        </div>

        <div className={"pane-validity " + (problems.length ? "bad" : "ok")}>
          <span className="dot" />
          {problems.length ? `O${o.id} ${problems.length} ${problems.length>1?tr("common.issuesIn"):tr("common.issueIn")}` : `O${o.id} ${tr("common.valid")}`}
        </div>
      </div>
    </div>
  );
}

function OutputModRow({ mod, onChange, onOp, onAttr, onRemove }) {
  const meta = OUT_MOD_INDEX[mod.k]; if (!meta) return null;
  const isVlanOp = meta.kind === "vlanop";
  const isFlag = meta.kind === "flag";
  const op = mod.op || meta.defOp;
  const err = (meta.kind === "enum" || isFlag) ? null
    : isVlanOp ? (op === "remove" ? null : validate("vlan", mod.val))
    : validate(meta.kind, mod.val);
  return (
    <div className="mod-row">
      <span className="mod-key">{meta.label}</span>
      {isFlag ? <span className="exists-note">no value</span>
        : meta.kind === "enum"
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
      {(meta.attrs ?? []).map((a) => (
        <label key={a.name} className="mod-attr">
          <span>{a.name}</span>
          {a.opts
            ? <select value={mod.attrs?.[a.name] ?? a.def ?? ""} onChange={(e) => onAttr(mod.id, a.name, e.target.value)}>
                {a.def === "" && <option value="">—</option>}
                {a.opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            : <input value={mod.attrs?.[a.name] ?? ""} placeholder={String(a.def ?? "")}
                onChange={(e) => onAttr(mod.id, a.name, e.target.value)} />}
        </label>
      ))}
      <code className="mod-tag">&lt;{mod.k}{isVlanOp ? ` type=${op}` : ""}&gt;</code>
      <div className="spacer" />
      <button className="icon-btn" onClick={() => onRemove(mod.id)} aria-label="Remove modifier">✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Actions tab — <action> input-packet-process / linkpairs
   ============================================================ */
function ActionsTab({ doc, setDoc, activeAction, setActiveAction, portOptions, t }) {
  const tr = t || ((k) => k);
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
        <p>{tr("act.emptyMsg")}</p>
        <button className="primary" onClick={addAction}>{tr("act.newAction")}</button>
      </div>
    </div>
  );

  const isLink = a.type === "linkpairs";
  const usedKeys = new Set((a.mods ?? []).map((m) => m.k));

  return (
    <div className="filters-layout">
      <SortableList
        items={actions} activeKey={a.id} getKey={(x) => x.id}
        renderLabel={(x) => <><b>A{x.id}</b><span>{x.name || <em>{x.type === "linkpairs" ? "linkpairs" : x.port}</em>}</span></>}
        onSelect={(x) => setActiveAction(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, actions: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...actions.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, actions: [...d.actions, copy] })); setActiveAction(nextId); }}
        addLabel={tr("common.addAction")} dupLabel={tr("common.dupAction")} onAdd={addAction} />

      <div className="filter-editor">
        <div className="filter-meta">
          <IdField prefix="A" id={a.id} siblingIds={doc.actions.map((x) => x.id)}
            onCommit={(newId) => { setDoc((d) => ({ ...d, actions: d.actions.map((x) => x.id === a.id ? { ...x, id: newId } : x) })); setActiveAction(newId); }} />
          <label className="ml grow"><span>{tr("common.name")}</span>
            <input value={a.name} onChange={(e) => patch({ name: e.target.value })} placeholder={tr("common.optional")} /></label>
          <label className="ml"><span>{tr("common.type")}</span>
            <select value={a.type} onChange={(e) => patch({ type: e.target.value })}>
              <option value="input-packet-process">input-packet-process</option>
              <option value="linkpairs">linkpairs</option>
            </select></label>
          <button className="del" onClick={() => delAction(a.id)}>{tr("common.delete")}</button>
        </div>

        <div className="tree-scroll">
          {isLink ? (
            <div className="link-form">
              <p className="out-empty">{tr("act.linkNote")}</p>
              <div className="mod-row">
                <span className="mod-key">{tr("act.portA")}</span>
                <PortSelect value={a.portA} options={portOptions} onChange={(v) => patch({ portA: v })}
                  invalid={!/^[A-Z][0-9]+$/.test(a.portA)} />
                <code className="mod-tag">&lt;portA&gt;</code>
              </div>
              <div className="mod-row">
                <span className="mod-key">{tr("act.portB")}</span>
                <PortSelect value={a.portB} options={portOptions} onChange={(v) => patch({ portB: v })}
                  invalid={!/^[A-Z][0-9]+$/.test(a.portB)} />
                <code className="mod-tag">&lt;portB&gt;</code>
              </div>
            </div>
          ) : (
            <>
              <div className="mod-row">
                <span className="mod-key">{tr("act.inputPort")}</span>
                <PortSelect value={a.port} options={portOptions} onChange={(v) => patch({ port: v })}
                  invalid={!/^[A-Z][0-9]+$/.test(a.port)} />
                <code className="mod-tag">&lt;port&gt;</code>
              </div>
              {(a.mods ?? []).length === 0 && (
                <p className="out-empty">{tr("act.modNote")}</p>
              )}
              {(a.mods ?? []).map((m) => <ActionModRow key={m.id} mod={m} onChange={setMod} onRemove={delMod} onMtu={(mid, mtu) => patch({ mods: a.mods.map((x) => x.id === mid ? { ...x, mtu } : x) })} />)}

              <div className="mod-palette">
                <span className="mod-palette-label">{tr("act.addModifier")}</span>
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
          {problems.length ? `A${a.id} ${problems.length} ${problems.length>1?tr("common.issuesIn"):tr("common.issueIn")}` : `A${a.id} ${tr("common.valid")}`}
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
      <button className="icon-btn" onClick={() => onRemove(mod.id)} aria-label="Remove modifier">✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Chain tab — decision tree canvas
   ============================================================ */
function CollapseSection({ label, active, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="coll">
      <button className={"coll-head" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        {active && !open && <span className="coll-dot" title="A value is set" />}
      </button>
      {open && <div className="coll-body">{children}</div>}
    </div>
  );
}

function CheckAccordion({ label, items, onToggle, onAll, onSetOne, emptyNote }) {
  const [open, setOpen] = useState(false);
  const picked = items.filter((it) => it.on).length;
  const [multi, setMulti] = useState(picked > 1); // default single, unless already multiple
  // if the current value becomes multiple (e.g. selecting a different node that
  // already has several), reflect that by switching the picker to multi mode.
  useEffect(() => { if (picked > 1) setMulti(true); }, [picked]);
  const allOn = items.length > 0 && picked === items.length;
  const switchToSingle = () => {
    // keep only the first selected when leaving multi mode
    const first = items.find((it) => it.on);
    if (picked > 1 && onSetOne) onSetOne(first ? first.id : null);
    setMulti(false);
  };
  return (
    <div className="known acc">
      <button className={"acc-head" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
        <span className="known-label">{label}</span>
        {picked > 0 && <span className="acc-count">{picked}</span>}
      </button>
      {open && <div className="acc-body">
        <div className="acc-toolbar">
          <label className="acc-multi">
            <input type="checkbox" checked={multi} onChange={(e) => e.target.checked ? setMulti(true) : switchToSingle()} />
            multi-select
          </label>
          {multi && items.length > 0 && <button className="acc-all" onClick={() => onAll(!allOn)}>
            {allOn ? "Clear all" : "Select all"}
          </button>}
        </div>
        <div className="fid-checks">
          {items.map((it) => (
            <label key={it.id} className={"fid-check" + (it.on ? " on" : "")}>
              <input type={multi ? "checkbox" : "radio"} checked={it.on}
                onChange={() => multi ? onToggle(it.id) : onSetOne(it.id)} />
              <b>{it.b}</b>{it.sub && <span>{it.sub}</span>}
            </label>
          ))}
        </div>
        {items.length === 0 && emptyNote && <p className="fid-empty">{emptyNote}</p>}
      </div>}
    </div>
  );
}

function ChainTab({ doc, definedIds, outputIds, setChainTreeFor, setDoc, activeChain, setActiveChain, portOptions, portsFromDevice, t }) {
  const tr = t || ((k) => k);
  const [selId, setSelId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [chipConfirm, setChipConfirm] = useState(null); // { field: "fids"|"ports", from, to, nodeId }
  const chains = doc.chains ?? [];
  // resolve active chain (fall back to first)
  const chain = chains.find((c) => c.cid === activeChain) || chains[0];
  const cid = chain?.cid;

  const { placed, edges, totalW, totalH } = useMemo(() => chain ? layoutChain(chain) : { placed: [], edges: [], totalW: 0, totalH: 0 }, [chain]);
  const problems = useMemo(() => {
    if (!chain) return [];
    const probs = chainProblems(chain.tree, []);
    if (!String(chain.ports ?? "").trim()) probs.push({ id: "__in__", msg: "ingress has no port set" });
    return probs;
  }, [chain]);
  const problemIds = useMemo(() => new Set(problems.map((p) => p.id)), [problems]);
  const refs = useMemo(() => chain ? collectRefs(chain.tree, definedIds) : [], [chain, definedIds]);
  const knownNames = useMemo(() => Object.fromEntries(doc.filters.map((f) => ["F" + f.id, f.name])), [doc.filters]);
  // alt labels keyed by reference id, for the chain node captions
  const filterAlt = useMemo(() => Object.fromEntries(doc.filters.map((f) => { const lbl = f.name || f.alt || ""; return lbl ? ["F" + f.id, lbl] : null; }).filter(Boolean)), [doc.filters]);
  const outputAlt = useMemo(() => Object.fromEntries((doc.outputs ?? []).map((o) => { const lbl = o.name || o.alt || ""; return lbl ? ["O" + o.id, lbl] : null; }).filter(Boolean)), [doc.outputs]);
  // build a caption from all referenced filters, joined by the node's and/or:
  //   "F1,!F3" (op=and) → "is https AND NOT blocked geo"
  //   a filter with no alt shows its id (e.g. "is https AND F2")
  const branchAlt = (fids, fidOp) => {
    const toks = String(fids || "").split(",").map((t) => t.trim()).filter(Boolean);
    if (!toks.length) return "";
    const joiner = (fidOp === "and" ? " AND " : " OR ");
    const parts = toks.map((tok) => {
      const neg = tok.startsWith("!");
      const id = tok.replace(/^!/, "");
      const label = filterAlt[id] || id;              // alt, else the id itself
      return (neg ? "NOT " : "") + label;
    });
    // only worth showing as a caption if at least one filter actually has an alt
    return parts.some((_, i) => filterAlt[toks[i].replace(/^!/, "")]) ? parts.join(joiner) : "";
  };
  const outAlt = (ports) => { for (const tok of String(ports).split(",")) { const t = tok.trim(); if (outputAlt[t]) return outputAlt[t]; } return ""; };
  const capAlt = (s) => s && s.length > 30 ? s.slice(0, 29) + "…" : s; // visible cap; full text in a hover tooltip

  const sel = placed.find((n) => n.id === selId) || null;
  const mutate = (id, fn) => setChainTreeFor(cid, (tree) => cUpdate(tree, id, fn));
  // Apply a chip (defined filter/output) to the selected node. If the field
  // already has a value that differs from the chip, confirm before overwriting.
  const applyChip = (nodeId, field, to, current) => {
    const cur = (current ?? "").trim();
    if (cur && cur !== to) { setChipConfirm({ nodeId, field, from: cur, to }); return; }
    mutate(nodeId, (n) => ({ ...n, [field]: to }));
  };
  const resolveChip = () => {
    if (!chipConfirm) return;
    const { nodeId, field, to } = chipConfirm;
    mutate(nodeId, (n) => ({ ...n, [field]: to }));
    setChipConfirm(null);
  };
  // fids is a comma list like "F1,!F3". These helpers let the checkbox list
  // reflect and edit it without disturbing negation or the text field.
  const fidsTokens = (fids) => String(fids || "").split(",").map((s) => s.trim()).filter(Boolean);
  const fidsHas = (fids, fid) => fidsTokens(fids).some((t) => t.replace(/^!/, "") === fid);
  const toggleFid = (nodeId, fids, fid) => {
    const toks = fidsTokens(fids);
    const idx = toks.findIndex((t) => t.replace(/^!/, "") === fid);
    const next = idx >= 0 ? toks.filter((_, i) => i !== idx) : [...toks, fid];
    mutate(nodeId, (n) => ({ ...n, fids: next.join(",") }));
  };
  // generic comma-list toggle for port fields (ingress ports, output ports)
  const listTokens = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const listHas = (v, item) => listTokens(v).includes(item);
  const toggleInPort = (item) => {
    const toks = listTokens(chain.ports);
    const next = toks.includes(item) ? toks.filter((t) => t !== item) : [...toks, item];
    setPorts(next.join(","));
  };
  const toggleOutPort = (nodeId, ports, item) => {
    const toks = listTokens(ports);
    const next = toks.includes(item) ? toks.filter((t) => t !== item) : [...toks, item];
    mutate(nodeId, (n) => ({ ...n, ports: next.join(",") }));
  };
  // bulk select/clear, preserving any tokens not in `all` (e.g. hand-typed !F3,
  // special port values like 0/S) — we only add/remove the offered options.
  const setAllFids = (nodeId, fids, all, on) => {
    const keep = fidsTokens(fids).filter((t) => !all.includes(t.replace(/^!/, "")));
    mutate(nodeId, (n) => ({ ...n, fids: (on ? [...keep, ...all] : keep).join(",") }));
  };
  const setAllInPorts = (all, on) => {
    const keep = listTokens(chain.ports).filter((t) => !all.includes(t));
    setPorts((on ? [...keep, ...all] : keep).join(","));
  };
  const setAllOutPorts = (nodeId, ports, all, on) => {
    const keep = listTokens(ports).filter((t) => !all.includes(t));
    mutate(nodeId, (n) => ({ ...n, ports: (on ? [...keep, ...all] : keep).join(",") }));
  };
  // single-select: replace the offered options with just `one` (preserve tokens
  // outside the offered set, e.g. hand-typed !F3 or special port values).
  const setOneFid = (nodeId, fids, all, one) => {
    const keep = fidsTokens(fids).filter((t) => !all.includes(t.replace(/^!/, "")));
    mutate(nodeId, (n) => ({ ...n, fids: [...keep, ...(one ? [one] : [])].join(",") }));
  };
  const setOneInPort = (all, one) => {
    const keep = listTokens(chain.ports).filter((t) => !all.includes(t));
    setPorts([...keep, ...(one ? [one] : [])].join(","));
  };
  const setOneOutPort = (nodeId, ports, all, one) => {
    const keep = listTokens(ports).filter((t) => !all.includes(t));
    mutate(nodeId, (n) => ({ ...n, ports: [...keep, ...(one ? [one] : [])].join(",") }));
  };
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
  const [chainDragCid, setChainDragCid] = useState(null);
  const [chainOverCid, setChainOverCid] = useState(null);
  const moveChain = (fromCid, toCid) => {
    if (fromCid === toCid) return;
    setDoc((d) => {
      const arr = d.chains.slice();
      const from = arr.findIndex((c) => c.cid === fromCid);
      const to = arr.findIndex((c) => c.cid === toCid);
      if (from < 0 || to < 0) return d;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...d, chains: arr };
    });
  };
  const dupChain = (c) => {
    const copy = { ...cloneForDup(c), cid: nid() };
    setDoc((d) => ({ ...d, chains: [...d.chains, copy] }));
    setActiveChain(copy.cid); setSelId(null);
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

  // Insert a new (empty) filter test directly above the clicked node: the new
  // branch becomes the parent, the original node goes on `keepSide` (match or
  // notmatch), and the other side gets a fresh empty output. Both the new fids
  // and the new output start blank for the user to fill in. The new branch is
  // then selected so its filter can be set right away.
  const insertFilterAbove = (id, keepSide) => {
    const otherSide = keepSide === "match" ? "notmatch" : "match";
    const newId = nid();
    const wrap = (node) => ({ id: newId, t: "branch", fids: "", fidOp: "or",
      [keepSide]: node, [otherSide]: mkOut("") });
    setChainTreeFor(cid, (tree) => tree.id === id ? wrap(tree) : cUpdate(tree, id, wrap));
    setSelId(newId);
  };
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
          return (
            <div key={c.cid}
              className={"chain-item sortable" + (c.cid === cid ? " on" : "") + (c.cid === chainOverCid && chainDragCid !== c.cid ? " drop-target" : "") + (c.cid === chainDragCid ? " dragging" : "")}
              draggable
              onDragStart={(e) => { setChainDragCid(c.cid); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); if (chainOverCid !== c.cid) setChainOverCid(c.cid); }}
              onDragEnd={() => { setChainDragCid(null); setChainOverCid(null); }}
              onDrop={(e) => { e.preventDefault(); if (chainDragCid != null) moveChain(chainDragCid, c.cid); setChainDragCid(null); setChainOverCid(null); }}
              onClick={() => { setActiveChain(c.cid); setSelId(null); }}>
              <span className="drag-handle" title={tr("ch.dragReorder")} aria-hidden="true">⠿</span>
              <span className="chain-flow"><b>{inP || "?"}</b> <span className="arr">→</span> <span className="dest">{chainDest(c)}</span></span>
            </div>
          );
        })}
        <button className="filter-add" onClick={addChain}>{tr("ch.addChain")}</button>
        {chain && <button className="filter-dup" onClick={() => dupChain(chain)}>{tr("ch.dupChain")}</button>}
        {chains.length > 1 && (
          <button className="chain-del" onClick={() => delChain(cid)}>{tr("ch.deleteChain")}</button>
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
              {n.t === "branch" && (() => { const full = branchAlt(n.fids, n.fidOp); return <><text x={c.x} y={c.y - 5} className={full ? "n-alt" : "n-kind"}>{full && <title>{full}</title>}{capAlt(full) || "FILTER"}</text><text x={c.x} y={c.y + 12} className="n-main">{n.fids}</text></>; })()}
              {n.t === "out" && <><text x={c.x} y={c.y - 5} className={!drop && outAlt(n.ports) ? "n-alt" : "n-kind"}>{drop ? "DISCARD" : capAlt(outAlt(n.ports)) || (n.mode === "loadBalance" ? "LOAD BALANCE" : "OUTPUT")}</text><text x={c.x} y={c.y + 12} className="n-main">{drop ? "drop (0)" : n.ports}</text></>}
            </g>;
          })}
        </svg>
      </section>

      <aside className="chain-rail">
        <div className="inspector">
          <div className="insp-head">{sel ? (isUnset(sel) ? tr("ch.unspecified") : sel.t === "in" ? tr("ch.ingress") : sel.t === "branch" ? tr("ch.filter") : isDrop(sel) ? tr("ch.discard") : tr("ch.output")) : tr("ch.inspector")}</div>
          {!sel && <p className="insp-empty">{tr("ch.selectNode")}</p>}
          {sel && sel.t === "in" && <>
            <label className="fld2"><span>{tr("ch.ingressPorts")}</span>
              <input value={chain.ports} onChange={(e) => setPorts(e.target.value)} /><em>e.g. P0,P1</em></label>
            <CheckAccordion
              label={portsFromDevice ? tr("ch.devicePorts") : tr("ch.portsDefault")}
              items={portOptions.map((p) => ({ id: p, b: p, on: listHas(chain.ports, p) }))}
              onToggle={(p) => toggleInPort(p)}
              onAll={(on) => setAllInPorts(portOptions, on)}
              onSetOne={(p) => setOneInPort(portOptions, p)}
              emptyNote={!portsFromDevice ? "Default list — sign in to load the device's actual ports." : null} />
            <CollapseSection label={tr("ch.advancedOp")} active={!!chain.inVlan?.vlantype}>
              <label className="fld2"><span>{tr("ch.vlanOp")}</span>
                <select value={chain.inVlan?.vlantype ?? ""} onChange={(e) => setInVlan({ vlantype: e.target.value || undefined })}>
                  <option value="">none</option><option value="tagging">tagging</option><option value="stripping">stripping</option>
                </select><em>optional — tag or strip VLAN at ingress</em></label>
              {chain.inVlan?.vlantype === "tagging" && <label className="fld2"><span>{tr("ch.vlanId")}</span>
                <input value={chain.inVlan?.vlanid ?? ""} onChange={(e) => setInVlan({ vlanid: e.target.value })} placeholder="100" /></label>}
            </CollapseSection>
          </>}
          {sel && isUnset(sel) && <><p className="insp-note">{tr("ch.unsetNote")}</p>
            <button className="primary" onClick={() => restoreSide(sel.id)}>{tr("ch.routeExplicitly")}</button></>}
          {sel && sel.t === "branch" && <>
            <label className="fld2"><span>{tr("ch.filters")}</span>
              <input value={sel.fids} onChange={(e) => mutate(sel.id, (n) => ({ ...n, fids: e.target.value }))} /><em>e.g. F1 or F1,!F3</em></label>
            <label className="fld2"><span>{tr("ch.combine")}</span>
              <select value={sel.fidOp} onChange={(e) => mutate(sel.id, (n) => ({ ...n, fidOp: e.target.value }))}><option value="or">or</option><option value="and">and</option></select></label>
            <CheckAccordion
              label={tr("ch.definedFilters")}
              items={doc.filters.map((f) => ({ id: "F" + f.id, b: "F" + f.id, sub: f.name || tr("flt.unnamed"), on: fidsHas(sel.fids, "F" + f.id) }))}
              onToggle={(fid) => toggleFid(sel.id, sel.fids, fid)}
              onAll={(on) => setAllFids(sel.id, sel.fids, doc.filters.map((f) => "F" + f.id), on)}
              onSetOne={(fid) => setOneFid(sel.id, sel.fids, doc.filters.map((f) => "F" + f.id), fid)}
              emptyNote={tr("ch.noFiltersDefined")} />
            <div className="add-filter-group">
              <span className="add-filter-label">{tr("ch.insertKeepTest")}</span>
              <div className="add-filter-btns">
                <button className="primary" onClick={() => insertFilterAbove(sel.id, "match")}>{tr("ch.filterToMatch")}</button>
                <button className="primary" onClick={() => insertFilterAbove(sel.id, "notmatch")}>{tr("ch.filterToNotmatch")}</button>
              </div>
            </div>
            <button className="danger" onClick={() => removeTest(sel.id)}>{tr("ch.removeTest")}</button>
          </>}
          {sel && sel.t === "out" && <>
            {isDrop(sel) ? <p className="insp-note">Discarded (<code>&lt;out&gt;0&lt;/out&gt;</code>). Explicit, distinct from unspecified.</p> : <>
              <label className="fld2"><span>{tr("ch.outputPorts")}</span><input value={sel.ports} onChange={(e) => mutate(sel.id, (n) => ({ ...n, ports: e.target.value }))} /><em>P1,P2 · 0 drop · S switch · O1 = output def</em></label>
              <CheckAccordion
                label={portsFromDevice ? tr("ch.devicePorts") : tr("ch.portsDefault")}
                items={portOptions.map((p) => ({ id: p, b: p, on: listHas(sel.ports, p) }))}
                onToggle={(p) => toggleOutPort(sel.id, sel.ports, p)}
                onAll={(on) => setAllOutPorts(sel.id, sel.ports, portOptions, on)}
                onSetOne={(p) => setOneOutPort(sel.id, sel.ports, portOptions, p)}
                emptyNote={!portsFromDevice ? "Default list — sign in to load the device's actual ports." : null} />
              {(doc.outputs?.length ?? 0) > 0 && <CheckAccordion
                label={tr("ch.definedOutputs")}
                items={doc.outputs.map((o) => ({ id: "O" + o.id, b: "O" + o.id, sub: o.name || o.port, on: listHas(sel.ports, "O" + o.id) }))}
                onToggle={(oid) => toggleOutPort(sel.id, sel.ports, oid)}
                onAll={(on) => setAllOutPorts(sel.id, sel.ports, doc.outputs.map((o) => "O" + o.id), on)}
                onSetOne={(oid) => setOneOutPort(sel.id, sel.ports, doc.outputs.map((o) => "O" + o.id), oid)} />}
              <label className="fld2"><span>{tr("ch.mode")}</span><select value={sel.mode} onChange={(e) => mutate(sel.id, (n) => ({ ...n, mode: e.target.value }))}><option value="duplicate">duplicate</option><option value="loadBalance">load balance</option></select></label>
              {sel.mode === "loadBalance" && <label className="fld2"><span>{tr("ch.balanceBy")}</span><select value={sel.lb} onChange={(e) => mutate(sel.id, (n) => ({ ...n, lb: e.target.value }))}>{["session","5thash","rr","sip","dip"].map((o) => <option key={o} value={o}>{o}</option>)}</select></label>}
              <CollapseSection label={tr("ch.advancedOp")} active={!!sel.vlantype}>
                <label className="fld2"><span>{tr("ch.vlanOp")}</span>
                  <select value={sel.vlantype ?? ""} onChange={(e) => mutate(sel.id, (n) => ({ ...n, vlantype: e.target.value || undefined }))}>
                    <option value="">none</option><option value="tagging">tagging</option><option value="stripping">stripping</option>
                  </select><em>optional — tag or strip VLAN on egress</em></label>
                {sel.vlantype === "tagging" && <label className="fld2"><span>{tr("ch.vlanId")}</span>
                  <input value={sel.vlanid ?? ""} onChange={(e) => mutate(sel.id, (n) => ({ ...n, vlanid: e.target.value }))} placeholder="100" /></label>}
              </CollapseSection>
              <div className="add-filter-group">
                <span className="add-filter-label">{tr("ch.insertKeepOutput")}</span>
                <div className="add-filter-btns">
                  <button className="primary" onClick={() => insertFilterAbove(sel.id, "match")}>{tr("ch.filterToMatch")}</button>
                  <button className="primary" onClick={() => insertFilterAbove(sel.id, "notmatch")}>{tr("ch.filterToNotmatch")}</button>
                </div>
              </div>
            </>}
            {selOwner && <button className="danger" onClick={() => requestRemove(sel.id)}>{tr("ch.removeBranch").replace("{side}", selOwner.side)}</button>}
          </>}
        </div>

        <div className="refs">
          <div className="refs-head"><span>{tr("ch.filtersReferenced")}</span><span className="refs-count">{refs.length}</span></div>
          {refs.map((r) => <div key={r.id} className={"ref-row " + (r.defined ? "here" : "device")}>
            <span className="ref-dot" /><code className="ref-id">{r.id}</code>
            <span className="ref-name">{knownNames[r.id] || ""}</span>
            <span className="ref-where">{r.defined ? tr("ch.definedHere") : tr("ch.onDevice")}</span>
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

      {chipConfirm && <div className="modal-scrim" onClick={() => setChipConfirm(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">Replace {chipConfirm.field === "fids" ? "filter" : "output"} reference?</div>
          <p className="modal-body">
            This node is currently set to <code>{chipConfirm.from}</code>. Applying this will change it to <code>{chipConfirm.to}</code>, replacing what's there.
          </p>
          <button className="opt" onClick={resolveChip}><span className="opt-name">Replace with {chipConfirm.to}</span><span className="opt-desc">Overwrites the current value.</span></button>
          <button className="opt-cancel" onClick={() => setChipConfirm(null)}>Cancel</button>
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

/* ============================================================
   Simulate tab — trace a packet from an ingress port through the
   matching chain(s), with each filter's match/not-match set by hand.
   ============================================================ */
// collect every filter id referenced anywhere in a chain tree (F-tokens, incl. negated)
function chainFilterRefs(tree, into) {
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch" && n.fids) n.fids.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const id = tok.replace(/^!/, ""); if (/^F\d+$/.test(id)) into.add(id);
    });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return into;
}
// evaluate a branch's fids against the manual filter states
function evalFids(fids, fidOp, states) {
  const toks = String(fids || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!toks.length) return false;
  const results = toks.map((tok) => {
    const neg = tok.startsWith("!");
    const id = tok.replace(/^!/, "");
    const on = !!states[id]; // default false (not-match)
    return neg ? !on : on;
  });
  return fidOp === "and" ? results.every(Boolean) : results.some(Boolean);
}
// walk a chain tree with the given filter states, producing an ordered path + outcome
function simulateChain(chain, states, filterAlt) {
  const steps = [];
  let node = chain.tree;
  let outcome = { kind: "default", text: "device default (no explicit route)" };
  let guard = 0;
  while (node && guard++ < 200) {
    if (isUnset(node)) { outcome = { kind: "default", text: "unspecified — device default" }; break; }
    if (node.t === "out") {
      if (isDrop(node)) outcome = { kind: "drop", text: "dropped (out 0)" };
      else outcome = { kind: "out", text: node.ports, mode: node.mode, lb: node.lb };
      break;
    }
    if (node.t === "branch") {
      const matched = evalFids(node.fids, node.fidOp, states);
      const alt = node.fids.split(",").map((t) => { const id = t.trim().replace(/^!/, ""); const neg = t.trim().startsWith("!"); return (neg ? "!" : "") + (filterAlt[id] || id); }).join(node.fidOp === "and" ? " AND " : " OR ");
      steps.push({ id: node.id, fids: node.fids, alt, matched });
      const nextNode = matched ? node.match : node.notmatch;
      if (!nextNode || isUnset(nextNode)) { outcome = { kind: "default", text: `${matched ? "match" : "not-match"} side unspecified — device default` }; break; }
      node = nextNode;
      continue;
    }
    break;
  }
  return { steps, outcome };
}

/* A stylised front panel of the GRISM device: a row of ports, with those used
   as chain ingress / output highlighted. Clicking a port selects it as the
   simulation ingress. Below, user-added inline devices (e.g. an external IPS)
   are drawn bridging two ports. */
function DevicePanel({ portOptions, inPortSet, outPortSet, selected, onPick, inlines, onRemoveInline, inlineDraft, setInlineDraft, onAddInline, animPlan, flipState, loopPorts = [], t }) {
  const tr = t || ((k) => k);
  const portRole = (p) => { const i = inPortSet.has(p), o = outPortSet.has(p); return i && o ? "both" : i ? "in" : o ? "out" : "idle"; };
  const inlinePorts = new Set(inlines.flatMap((x) => [x.portA, x.portB]));
  const [flipped, setFlipped] = flipState; // lifted so row orientation persists across tab switches
  const loopSet = new Set(loopPorts);

  // number extracted from a port name (P0 -> 0); ports without a number get their own column
  const portNum = (p) => { const m = /(\d+)/.exec(p); return m ? +m[1] : null; };
  // Build columns two ports at a time. Ports are grouped by prefix (P, V, …) so
  // different families don't mix; each group is sorted low→high and chunked into
  // pairs — 1st+2nd share a column, 3rd+4th the next, and so on, regardless of
  // odd/even. Within a column the smaller sits on the bottom, larger on top.
  // Prefix groups keep first-appearance order so an upstream ordering (VPORT
  // first) is preserved; numberless ports fall to the end.
  const buildColumns = (ports) => {
    const groups = new Map(); // prefix -> [names]
    const groupOrder = [];
    const extras = [];
    ports.forEach((p) => {
      const n = portNum(p);
      if (n == null) { extras.push(p); return; }
      const prefix = p.slice(0, p.length - String(n).length); // "P", "V", etc.
      if (!groups.has(prefix)) { groups.set(prefix, []); groupOrder.push(prefix); }
      groups.get(prefix).push(p);
    });
    const cols = [];
    groupOrder.forEach((prefix) => {
      const sorted = groups.get(prefix).slice().sort((a, b) => portNum(a) - portNum(b));
      for (let i = 0; i < sorted.length; i += 2) {
        const lo = sorted[i], hi = sorted[i + 1] ?? null; // lo is smaller (bottom), hi larger (top)
        cols.push({ key: prefix + ":" + i, bottom: lo, top: hi });
      }
    });
    let out = cols;
    if (flipped) out = out.map((c) => ({ ...c, top: c.bottom, bottom: c.top }));
    extras.forEach((p, i) => out.push({ key: "x" + i, top: null, bottom: p }));
    return out;
  };
  // normal ports on the left, LOOP-interface ports grouped on the right
  const columns = useMemo(() => buildColumns(portOptions.filter((p) => !loopSet.has(p))), [portOptions, flipped, loopPorts]);
  const loopColumns = useMemo(() => buildColumns(portOptions.filter((p) => loopSet.has(p))), [portOptions, flipped, loopPorts]);

  const wrapRef = useRef(null);
  const chassisRef = useRef(null);
  const portRefs = useRef({});   // portName -> button el
  const devRefs = useRef({});    // inline id -> element
  const geomRef = useRef({ ports: {}, inlines: {}, center: null }); // measured points for animation
  const [cables, setCables] = useState([]);
  const [devPos, setDevPos] = useState({});   // devId -> {x,y} floating position within the panel (session only)
  const dragRef = useRef(null);               // active drag: { id, offx, offy }
  const [packets, setPackets] = useState([]);  // [{x,y}] current positions (one per active path)
  const [trails, setTrails] = useState([]);     // [[{x,y}...]] fading tails, one per packet
  const [activeDev, setActiveDev] = useState(null); // IPS id currently being traversed (for highlight)
  const [nextPortSet, setNextPortSet] = useState(() => new Set());   // ports any packet is heading toward
  const [nextDevSet, setNextDevSet] = useState(() => new Set());     // IPSs any packet is heading toward
  const [prevPortSet, setPrevPortSet] = useState(() => new Set());   // source ports (just left)
  const [prevDevSet, setPrevDevSet] = useState(() => new Set());     // source IPSs
  const [playState, setPlayState] = useState("idle"); // 'idle' | 'playing' | 'paused'
  const rafRef = useRef(0);
  const animRef = useRef({ paths: null, dur: 0, elapsed: 0, last: 0, trailBufs: [] });

  // measure port + inline-device anchor points relative to the wrapper, then
  // build a cable path (port edge → device top) for each lead. Also snapshot
  // geometry (port centres, chassis centre, inline centres) for the animation.
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wb = wrap.getBoundingClientRect();
      const portPt = (name) => {
        const el = portRefs.current[name];
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2 - wb.left, y: b.bottom - wb.top };
      };
      const portCenter = (name) => {
        const el = portRefs.current[name];
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2 - wb.left, y: b.top + b.height / 2 - wb.top };
      };
      const next = [];
      const geo = { ports: {}, inlines: {}, center: null };
      // which ports sit on the top row vs bottom row of their column (across all
      // wrapped rows), so the packet can enter/exit from the correct side.
      const topRow = new Set(), bottomRow = new Set();
      [...columns, ...loopColumns].forEach((c) => { if (c.top) topRow.add(c.top); if (c.bottom) bottomRow.add(c.bottom); });
      portOptions.forEach((p) => {
        const el = portRefs.current[p]; if (!el) return;
        const b = el.getBoundingClientRect();
        geo.ports[p] = {
          x: b.left + b.width / 2 - wb.left,
          y: b.top + b.height / 2 - wb.top,
          topEdge: b.top - wb.top,
          bottomEdge: b.bottom - wb.top,
          row: topRow.has(p) ? "top" : bottomRow.has(p) ? "bottom" : "bottom",
        };
      });
      const ch = chassisRef.current;
      if (ch) { const cb = ch.getBoundingClientRect(); geo.center = { x: cb.left + cb.width / 2 - wb.left, y: cb.top + cb.height / 2 - wb.top }; }
      const portEdges = (name) => {
        const el = portRefs.current[name];
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2 - wb.left, top: b.top - wb.top, bottom: b.bottom - wb.top, midY: b.top + b.height / 2 - wb.top };
      };
      inlines.forEach((d) => {
        const dev = devRefs.current[d.id];
        if (!dev) return;
        const db = dev.getBoundingClientRect();
        const ax = db.left + db.width * 0.32 - wb.left, bx = db.left + db.width * 0.68 - wb.left;
        const devTop = db.top - wb.top, devBottom = db.bottom - wb.top, devMidY = db.top + db.height / 2 - wb.top;
        // jack points used by the packet path: connect on whichever device edge
        // faces the ports (so the line is visible whether the IPS floats above or
        // below). We pick per side based on the port's position.
        const jackFor = (pname, dx) => {
          const pe = portEdges(pname);
          if (!pe) return null;
          const above = devMidY < pe.midY;                 // IPS sits above this port?
          const devY = above ? devBottom : devTop;          // connect on the facing device edge
          const portY = above ? pe.top : pe.bottom;         // and the facing port edge
          return { dx, devY, portX: pe.x, portY };
        };
        // remember jack points (facing edge) keyed by port, plus interior mid point
        const jA = jackFor(d.portA, ax), jB = jackFor(d.portB, bx);
        geo.inlines[d.id] = {
          [d.portA]: jA ? { x: ax, y: jA.devY } : { x: ax, y: devTop },
          [d.portB]: jB ? { x: bx, y: jB.devY } : { x: bx, y: devTop },
          mid: { x: (ax + bx) / 2, y: devMidY }, top: devTop,
        };
        [jA, jB].forEach((j, i) => {
          if (!j) return;
          const midY = (j.portY + j.devY) / 2;
          next.push({ key: d.id + "-" + i, devId: d.id, d: `M ${j.portX} ${j.portY} C ${j.portX} ${midY}, ${j.dx} ${midY}, ${j.dx} ${j.devY}`, x1: j.portX, y1: j.portY, x2: j.dx, y2: j.devY });
        });
      });
      geomRef.current = geo;
      setCables(next);
      // seed a floating position for any inline that doesn't have one yet:
      // just above its port A (so it starts near where it connects).
      setDevPos((prev) => {
        let changed = false; const nextPos = { ...prev };
        inlines.forEach((d) => {
          if (nextPos[d.id]) return;
          const pa = geo.ports[d.portA];
          if (pa) { nextPos[d.id] = { x: pa.x - 60, y: Math.max(4, (pa.topEdge ?? pa.y) - 96) }; changed = true; }
        });
        // drop positions for removed inlines
        Object.keys(nextPos).forEach((id) => { if (!inlines.some((d) => d.id === id)) { delete nextPos[id]; changed = true; } });
        return changed ? nextPos : prev;
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [inlines, portOptions, inPortSet, outPortSet, flipped, loopPorts, devPos]);

  // --- dragging floating inline devices ---
  const onDevMouseDown = (e, id) => {
    const wrap = wrapRef.current; if (!wrap) return;
    const wb = wrap.getBoundingClientRect();
    const pos = devPos[id] || { x: 0, y: 0 };
    dragRef.current = { id, offx: e.clientX - wb.left - pos.x, offy: e.clientY - wb.top - pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current; if (!drag) return;
      const wrap = wrapRef.current; if (!wrap) return;
      const wb = wrap.getBoundingClientRect();
      let x = e.clientX - wb.left - drag.offx;
      let y = e.clientY - wb.top - drag.offy;
      // keep the box within the panel
      x = Math.max(0, Math.min(x, wb.width - 60));
      y = Math.max(0, Math.min(y, wb.height - 40));
      setDevPos((prev) => ({ ...prev, [drag.id]: { x, y } }));
    };
    const onUp = () => { if (dragRef.current) { dragRef.current = null; setCables((c) => c.slice()); } };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // stop any running animation on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  // if the traced route changes (ingress / filters / inlines), reset playback
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current = { paths: null, dur: 0, elapsed: 0, last: 0, trailBufs: [] };
    setPlayState("idle"); setPackets([]); setTrails([]); setActiveDev(null); setNextPortSet(new Set()); setNextDevSet(new Set()); setPrevPortSet(new Set()); setPrevDevSet(new Set());
  }, [animPlan]);

  // Map the semantic animation plan to concrete coordinates using measured
  // geometry. "outside" points sit beyond the port, away from the chassis, so
  // the packet visibly enters from and leaves to outside the device.
  const nodesToPts = (nodes, outsidePt, geo) => {
    const pts = [];
    for (const n of nodes) {
      if (n.kind === "outside-in" || n.kind === "outside-out") { const o = outsidePt(n.port); if (o) { if (n.kind === "outside-in") { pts.push({ ...o }); if (geo.ports[n.port]) pts.push({ ...geo.ports[n.port], port: n.port }); } else { if (geo.ports[n.port]) pts.push({ ...geo.ports[n.port], port: n.port }); pts.push({ ...o }); } } }
      else if (n.kind === "port") { const p = geo.ports[n.port]; if (p) pts.push({ ...p, port: n.port }); }
      else if (n.kind === "ips-in") { const j = geo.inlines[n.devId]; if (j && j[n.port]) { pts.push({ ...j[n.port], dev: n.devId }); if (j.mid) pts.push({ ...j.mid, dev: n.devId }); } }
      else if (n.kind === "ips-out") { const j = geo.inlines[n.devId]; if (j && j[n.port]) pts.push({ ...j[n.port], dev: n.devId }); }
      else if (n.kind === "loop") { const o = outsidePt(n.port); if (o) { pts.push({ ...o, loop: true }); if (geo.ports[n.port]) pts.push({ ...geo.ports[n.port], port: n.port }); } }
      else if (n.kind === "fizzle") { const p = geo.ports[n.port]; if (p) pts.push({ x: p.x, y: p.y }); }
    }
    const clean = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
    return clean.length >= 2 ? clean : null;
  };
  // one waypoint list per path in the plan (multiple when a chain fans out to
  // several ports); each animates its own packet simultaneously.
  const buildAllWaypoints = () => {
    const geo = geomRef.current;
    if (!animPlan || !animPlan.paths || !geo.center) return null;
    const OUT = 46;
    const outsidePt = (port) => {
      const p = geo.ports[port]; if (!p) return null;
      if (p.row === "top") return { x: p.x, y: (p.topEdge ?? p.y) - OUT };
      return { x: p.x, y: (p.bottomEdge ?? p.y) + OUT };
    };
    const lists = animPlan.paths.map((nodes) => nodesToPts(nodes, outsidePt, geo)).filter(Boolean);
    return lists.length ? lists : null;
  };

  // advance every path's packet by the shared elapsed time; aggregate highlights
  // (active IPS, next/prev ports & IPSs) across all packets. Returns true when all
  // packets have reached the end.
  const applyFrame = (elapsedMs) => {
    const A = animRef.current;
    if (!A.paths) return true;
    const positions = [];
    const activeDevs = new Set(), nextP = new Set(), nextD = new Set(), prevP = new Set(), prevD = new Set();
    let allDone = true;
    A.paths.forEach((path, idx) => {
      const { pts, segs, total, dur } = path;
      const t = Math.min(1, elapsedMs / dur);
      if (t < 1) allDone = false;
      let dist = t * total, i = 0;
      while (i < segs.length && dist > segs[i]) { dist -= segs[i]; i++; }
      let pos;
      if (i >= segs.length) pos = pts[pts.length - 1];
      else { const f = segs[i] ? dist / segs[i] : 0; pos = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }; }
      positions.push(pos);
      const buf = A.trailBufs[idx] || (A.trailBufs[idx] = []);
      buf.push(pos); while (buf.length > 14) buf.shift();
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      if (a && b && a.dev && a.dev === b.dev) activeDevs.add(a.dev);
      for (let k = i + 1; k < pts.length; k++) { if (pts[k].dev) { nextD.add(pts[k].dev); break; } if (pts[k].port) { nextP.add(pts[k].port); break; } }
      for (let k = i; k >= 0; k--) { if (pts[k].dev) { prevD.add(pts[k].dev); break; } if (pts[k].port) { prevP.add(pts[k].port); break; } }
    });
    setPackets(positions);
    setTrails(A.trailBufs.map((b) => b.slice()));
    setActiveDev(activeDevs.size ? [...activeDevs][0] : null);
    setNextPortSet(nextP); setNextDevSet(nextD); setPrevPortSet(prevP); setPrevDevSet(prevD);
    return allDone;
  };

  const clearAnim = () => { setPackets([]); setTrails([]); setActiveDev(null); setNextPortSet(new Set()); setNextDevSet(new Set()); setPrevPortSet(new Set()); setPrevDevSet(new Set()); };

  const runLoop = () => {
    const A = animRef.current;
    A.last = performance.now();
    const tick = (now) => {
      const A2 = animRef.current;
      A2.elapsed += now - A2.last; A2.last = now;
      const done = applyFrame(A2.elapsed);
      if (done) { setPlayState("idle"); setTimeout(clearAnim, 550); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    cancelAnimationFrame(rafRef.current);
    const lists = buildAllWaypoints();
    if (!lists || !lists.length) return;
    const SPEED = 220; // px/sec
    let maxDur = 0;
    const paths = lists.map((pts) => {
      const segs = []; let total = 0;
      for (let i = 0; i < pts.length - 1; i++) { const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y; const len = Math.hypot(dx, dy); segs.push(len); total += len; }
      const dur = Math.max(700, (total / SPEED) * 1000);
      maxDur = Math.max(maxDur, dur);
      return { pts, segs, total, dur };
    });
    animRef.current = { paths, dur: maxDur, elapsed: 0, last: 0, trailBufs: paths.map(() => []) };
    setPlayState("playing");
    runLoop();
  };

  const pause = () => { cancelAnimationFrame(rafRef.current); setPlayState("paused"); };
  const resume = () => {
    if (!animRef.current.paths) { play(); return; }
    setPlayState("playing");
    runLoop();
  };
  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    animRef.current = { paths: null, dur: 0, elapsed: 0, last: 0, trailBufs: [] };
    setPlayState("idle");
    clearAnim();
  };

  const renderPort = (p) => {
    const role = portRole(p);
    const wired = inlinePorts.has(p);
    const isLoop = loopSet.has(p);
    return (
      <button key={p} ref={(el) => { portRefs.current[p] = el; }}
        className={"dev-port " + role + (selected === p ? " selected" : "") + (wired ? " wired" : "") + (isLoop ? " loop" : "") + (nextPortSet.has(p) ? " next" : prevPortSet.has(p) ? " from" : "")}
        onClick={() => onPick(p)} title={isLoop ? tr("sim.loopTip") : role === "both" ? tr("sim.roleBoth") : role === "in" ? tr("sim.roleIn") : role === "out" ? tr("sim.roleOut") : tr("sim.roleIdle")}>
        <span className="dev-port-led" />
        <span className="dev-port-name">{p}</span>
        {isLoop ? <span className="dev-port-role loop">LOOP ↻</span> : role !== "idle" && <span className="dev-port-role">{role === "both" ? "IN/OUT" : role.toUpperCase()}</span>}
        {wired && <span className="dev-port-jack" title={tr("sim.wiredTip")} />}
      </button>
    );
  };

  return (
    <div className="dev-panel">
      <div className="dev-wrap" ref={wrapRef}>
        <svg className="dev-cables" width="100%" height="100%">
          {cables.map((c) => {
            const on = activeDev && c.devId === activeDev;
            const next = !on && nextDevSet.has(c.devId);
            return (
              <g key={c.key}>
                <path d={c.d} className={"dev-cable" + (on ? " active" : next ? " next" : "")} />
                <circle cx={c.x1} cy={c.y1} r="3" className={"dev-cable-end" + (on || next ? " active" : "")} />
                <circle cx={c.x2} cy={c.y2} r="3" className={"dev-cable-end" + (on || next ? " active" : "")} />
              </g>
            );
          })}
        </svg>

        <div className="dev-chassis" ref={chassisRef}>
          <div className="dev-chassis-head">
            <div className="dev-brand"><span className="dev-logo">◇</span> GRISM<span className="dev-model"> · packet broker</span></div>
            <div className="dev-head-btns">
              {playState === "idle" && <button className="dev-play" onClick={play} disabled={!animPlan} title={animPlan ? tr("sim.playTip") : tr("sim.selectIngress")}>{tr("sim.play")}</button>}
              {playState === "playing" && <button className="dev-play" onClick={pause} title={tr("sim.pauseTip")}>{tr("sim.pause")}</button>}
              {playState === "paused" && <button className="dev-play" onClick={resume} title={tr("sim.resumeTip")}>{tr("sim.resume")}</button>}
              {playState !== "idle" && <button className="dev-stop" onClick={stop} title={tr("sim.stopTip")}>{tr("sim.stop")}</button>}
              <div className="inline-add-wrap">
                <button className={"inline-add-btn" + (inlineDraft.open ? " on" : "")} onClick={() => setInlineDraft((s) => ({ ...s, open: !s.open }))}>{tr("sim.addInline")}</button>
                {inlineDraft.open && (
                  <div className="inline-add-pop">
                    <input className="inline-name-in" value={inlineDraft.name} placeholder={tr("sim.namePh")}
                      onChange={(e) => setInlineDraft((s) => ({ ...s, name: e.target.value }))} />
                    <div className="inline-pop-ports">
                      <select value={inlineDraft.portA} onChange={(e) => setInlineDraft((s) => ({ ...s, portA: e.target.value }))}>
                        <option value="">{tr("sim.portA")}</option>
                        {portOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <span className="inline-lead-bridge">⇄</span>
                      <select value={inlineDraft.portB} onChange={(e) => setInlineDraft((s) => ({ ...s, portB: e.target.value }))}>
                        <option value="">{tr("sim.portB")}</option>
                        {portOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="inline-pop-actions">
                      <button className="inline-add-ok" disabled={!inlineDraft.portA || !inlineDraft.portB || inlineDraft.portA === inlineDraft.portB} onClick={onAddInline}>{tr("sim.add")}</button>
                      <button className="inline-add-cancel" onClick={() => setInlineDraft((s) => ({ ...s, open: false }))}>{tr("sim.cancel")}</button>
                    </div>
                  </div>
                )}
              </div>
              <button className="dev-flip" onClick={() => setFlipped((v) => !v)} title={tr("sim.flipTip")}>{tr("sim.flipRows")}</button>
            </div>
          </div>
          <div className="dev-port-area">
            <div className="dev-port-cols">
              {columns.map((col) => (
                <div key={col.key} className="dev-port-col">
                  <div className="dev-port-slot">{col.top ? renderPort(col.top) : <span className="dev-port-empty" />}</div>
                  <div className="dev-port-slot">{col.bottom ? renderPort(col.bottom) : <span className="dev-port-empty" />}</div>
                </div>
              ))}
            </div>
            {loopColumns.length > 0 && (
              <div className="dev-loop-group">
                <div className="dev-loop-label">LOOP</div>
                <div className="dev-port-cols">
                  {loopColumns.map((col) => (
                    <div key={col.key} className="dev-port-col">
                      <div className="dev-port-slot">{col.top ? renderPort(col.top) : <span className="dev-port-empty" />}</div>
                      <div className="dev-port-slot">{col.bottom ? renderPort(col.bottom) : <span className="dev-port-empty" />}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="dev-legend">
            <span className="dev-leg in"><span className="dev-leg-dot" />ingress</span>
            <span className="dev-leg out"><span className="dev-leg-dot" />output</span>
            <span className="dev-leg both"><span className="dev-leg-dot" />both</span>
            <span className="dev-leg idle"><span className="dev-leg-dot" />unused</span>
          </div>
        </div>

        <div className="dev-inlines">
          {inlines.map((d) => {
            const pos = devPos[d.id];
            const cls = "inline-dev floating" + (activeDev === d.id ? " active" : nextDevSet.has(d.id) ? " next" : prevDevSet.has(d.id) ? " from" : "") + (dragRef.current?.id === d.id ? " dragging" : "");
            return (
              <div key={d.id} className={cls} ref={(el) => { devRefs.current[d.id] = el; }}
                style={pos ? { left: pos.x, top: pos.y } : { visibility: "hidden" }}
                onMouseDown={(e) => onDevMouseDown(e, d.id)}>
                <div className="inline-dev-jacks"><span className="inline-jack" /><span className="inline-jack" /></div>
                <div className="inline-dev-body">
                  <span className="inline-dev-name">{d.name}</span>
                  <span className="inline-dev-sub">inline · {d.portA} ⇄ {d.portB}</span>
                </div>
                <span className="inline-dev-grip" title={tr("sim.dragReposition")}>⠿</span>
                <button className="inline-dev-del" onMouseDown={(e) => e.stopPropagation()} onClick={() => onRemoveInline(d.id)} title={tr("sim.remove")} aria-label={tr("sim.remove")}>✕</button>
              </div>
            );
          })}
        </div>

        {(packets.length > 0 || trails.some((t) => t.length)) && (
          <svg className="dev-packet-layer" width="100%" height="100%">
            {trails.map((trail, ti) => trail.map((p, i) => {
              const a = (i + 1) / (trail.length + 1);
              return <circle key={ti + "-" + i} cx={p.x} cy={p.y} r={2 + a * 3} className="dev-trail" style={{ opacity: a * 0.5 }} />;
            }))}
            {packets.map((pk, i) => (
              <g key={i}>
                <circle cx={pk.x} cy={pk.y} r="10" className="dev-packet-glow" />
                <circle cx={pk.x} cy={pk.y} r="5" className="dev-packet-core" />
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="dev-inline-controls" />

    </div>
  );
}

function SimulateTab({ doc, definedIds, portOptions, loopPorts = [], simState, simInPort, simInlines, simInlineDraft, simFlipped, t }) {
  const tr = t || ((k) => k);
  // all filter ids to offer as switches: defined here + referenced-but-undefined
  const filterIds = useMemo(() => {
    const s = new Set(doc.filters.map((f) => "F" + f.id));
    (doc.chains ?? []).forEach((c) => chainFilterRefs(c.tree, s));
    return [...s].sort((a, b) => (+a.slice(1)) - (+b.slice(1)));
  }, [doc.filters, doc.chains]);
  const filterAlt = useMemo(() => Object.fromEntries(doc.filters.map((f) => ["F" + f.id, f.name || f.alt || ""])), [doc.filters]);
  const definedSet = useMemo(() => new Set(doc.filters.map((f) => "F" + f.id)), [doc.filters]);

  const [states, setStates] = simState;      // { F1: true(match)/false(not-match) }
  const [inPort, setInPort] = simInPort;      // chosen ingress port
  const [inlines, setInlines] = simInlines;   // [{ id, name, portA, portB }] — session only, not persisted
  const [inlineDraft, setInlineDraft] = simInlineDraft;
  // resizable device-panel height (session only; null = auto/natural height)
  const [panelHeight, setPanelHeight] = useState(null);
  const resizeRef = useRef(null);
  const onResizeStart = (e) => {
    const startY = e.clientY;
    const startH = panelHeight ?? e.currentTarget.parentElement.querySelector(".dev-panel-outer")?.getBoundingClientRect().height ?? 300;
    resizeRef.current = { startY, startH };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      const r = resizeRef.current; if (!r) return;
      const h = Math.max(140, Math.min(r.startH + (e.clientY - r.startY), window.innerHeight * 0.62));
      setPanelHeight(h);
    };
    const onUp = () => { resizeRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ingress ports available: union of chains' ingress ports and the device list
  const chainInPorts = useMemo(() => {
    const s = new Set();
    (doc.chains ?? []).forEach((c) => (c.ports || "").split(",").map((p) => p.trim()).filter(Boolean).forEach((p) => s.add(p)));
    return [...s];
  }, [doc.chains]);

  // output ports any chain routes to (physical P-ports only; O-refs and 0/drop excluded)
  const chainOutPorts = useMemo(() => {
    const s = new Set();
    (doc.chains ?? []).forEach((c) => (function walk(n) {
      if (!n) return;
      if (n.t === "out" && n.ports) n.ports.split(",").map((p) => p.trim()).filter(Boolean).forEach((p) => { if (/^[A-Z]\d+$/.test(p) && !/^O\d+$/.test(p)) s.add(p); });
      ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
    })(c.tree));
    return s;
  }, [doc.chains]);
  const inPortSet = useMemo(() => new Set(chainInPorts), [chainInPorts]);

  // chains that ingress on the selected port
  const matchingChains = useMemo(() => {
    if (!inPort) return [];
    return (doc.chains ?? []).filter((c) => (c.ports || "").split(",").map((p) => p.trim()).includes(inPort));
  }, [doc.chains, inPort]);

  const results = useMemo(() => matchingChains.map((c) => ({ chain: c, ...simulateChain(c, states, filterAlt) })), [matchingChains, states, filterAlt]);

  const setFilter = (fid, on) => setStates((s) => ({ ...s, [fid]: on }));
  const allNotMatch = () => setStates({});
  const allMatch = () => setStates(Object.fromEntries(filterIds.map((id) => [id, true])));

  const addInline = () => {
    const { name, portA, portB } = inlineDraft;
    if (!portA || !portB || portA === portB) return;
    setInlines((xs) => [...xs, { id: nid(), name: name || "inline", portA, portB }]);
    setInlineDraft({ open: false, name: "IPS", portA: "", portB: "" });
  };
  const removeInline = (id) => setInlines((xs) => xs.filter((x) => x.id !== id));

  // Build a full animation plan: the packet enters from outside the ingress
  // port, runs the chain to an out port, and if that port is wired to an inline
  // device it loops A-in/B-out and re-enters via the paired port — if THAT port
  // has a chain, it runs again (using the same filter switches), continuing until
  // it reaches a port with no chain (exits to the outside) or hits the hop cap.
  const chainForPort = (p) => (doc.chains ?? []).find((c) => (c.ports || "").split(",").map((x) => x.trim()).includes(p));
  const animPlan = useMemo(() => {
    if (!inPort) return null;
    const loopSet = new Set(loopPorts);
    // Resolve an out token (physical port, or O-ref → its physical port). Returns
    // { port } or { exitAt } when the output is undefined (nowhere to send).
    const resolveOut = (tok) => {
      const t = tok.trim();
      const oMatch = /^O(\d+)$/.exec(t);
      if (!oMatch) return { port: t };
      const outDef = (doc.outputs ?? []).find((o) => o.id === +oMatch[1]);
      if (outDef && outDef.port) return { port: outDef.port, ref: t };
      return { exitAt: t };
    };
    // Build all paths from an ingress port. Returns an array of node-lists. A chain
    // that outputs to several ports fans out: the common prefix (ingress → out
    // point) is shared, then each port continues as its own path.
    const buildFrom = (ingress, guard) => {
      const prefix = [{ kind: "outside-in", port: ingress }];
      const chain = chainForPort(ingress);
      if (!chain) return [[...prefix, { kind: "port", port: ingress }, { kind: "fizzle", port: ingress, label: "no chain" }]];
      const { outcome } = simulateChain(chain, states, filterAlt);
      if (outcome.kind !== "out") return [[...prefix, { kind: "fizzle", port: ingress, label: outcome.kind }]];
      const tokens = outcome.text.split(",").map((s) => s.trim()).filter(Boolean);
      // continue a single out token from the point it leaves the chain
      const continuePort = (tok) => {
        const r = resolveOut(tok);
        const lead = [];
        if (r.ref) lead.push({ kind: "output-ref", ref: r.ref, port: r.port });
        if (r.exitAt) return [[{ kind: "port", port: r.exitAt }, { kind: "outside-out", port: r.exitAt }]];
        const outPort = r.port;
        if (loopSet.has(outPort)) {
          const head = [...lead, { kind: "port", port: outPort }, { kind: "loop", port: outPort }, { kind: "port", port: outPort }];
          if (ingress === outPort || guard >= 8) return [head];               // safety
          return buildFrom(outPort, guard + 1).map((tail) => [...head, ...tail.slice(1)]); // drop tail's outside-in
        }
        const wire = inlines.find((d) => d.portA === outPort || d.portB === outPort);
        if (!wire) return [[...lead, { kind: "port", port: outPort }, { kind: "outside-out", port: outPort }]];
        const paired = wire.portA === outPort ? wire.portB : wire.portA;
        const head = [...lead, { kind: "port", port: outPort }, { kind: "ips-in", devId: wire.id, port: outPort }, { kind: "ips-out", devId: wire.id, port: paired }, { kind: "port", port: paired }];
        if (guard >= 8) return [head];
        return buildFrom(paired, guard + 1).map((tail) => [...head, ...tail.slice(1)]);
      };
      // each token becomes one or more paths; prepend the shared ingress prefix
      const paths = [];
      tokens.forEach((tok) => { continuePort(tok).forEach((rest) => paths.push([...prefix, ...rest])); });
      return paths.length ? paths : [[...prefix, { kind: "port", port: ingress }, { kind: "fizzle", port: ingress, label: "no output" }]];
    };
    const paths = buildFrom(inPort, 0);
    return { paths, split: paths.length > 1 };
  }, [inPort, results, states, filterAlt, inlines, doc.chains, doc.outputs, loopPorts]);

  return (
    <div className="sim-page">
      <div className="dev-panel-outer" style={panelHeight ? { height: panelHeight, flex: "0 0 auto" } : undefined}>
        <DevicePanel portOptions={portOptions} inPortSet={inPortSet} outPortSet={chainOutPorts}
          selected={inPort} onPick={(p) => setInPort(p)}
          inlines={inlines} onRemoveInline={removeInline}
          inlineDraft={inlineDraft} setInlineDraft={setInlineDraft} onAddInline={addInline}
          animPlan={animPlan} flipState={simFlipped} loopPorts={loopPorts} t={tr} />
      </div>
      <div className="sim-resizer" onMouseDown={onResizeStart} title={tr("sim.resizeTip")}>
        <span className="sim-resizer-grip" />
      </div>
      <div className="sim-layout">
      <aside className="sim-controls">
        <div className="sim-section">
          <div className="sim-label">{tr("sim.ingressPort")}</div>
          <select className="sim-inport" value={inPort} onChange={(e) => setInPort(e.target.value)}>
            <option value="">— {tr("sim.selectIngressOpt")} —</option>
            {[...new Set([...chainInPorts, ...portOptions])].map((p) => <option key={p} value={p}>{p}{chainInPorts.includes(p) ? "" : ` (${tr("sim.noChain")})`}</option>)}
          </select>
        </div>

        <div className="sim-section">
          <div className="sim-filters-head">
            <span className="sim-label">{tr("sim.filterResults")}</span>
            <div className="sim-bulk">
              <button onClick={allNotMatch}>{tr("sim.allNotMatch")}</button>
              <button onClick={allMatch}>{tr("sim.allMatch")}</button>
            </div>
          </div>
          {filterIds.length === 0 && <p className="sim-empty">{tr("sim.noFilters")}</p>}
          <div className="sim-switch-list">
            {filterIds.map((fid) => {
              const on = !!states[fid];
              const undef = !definedSet.has(fid);
              return (
                <div key={fid} className="sim-switch-row">
                  <span className="sim-fid">{fid}{undef && <span className="sim-undef" title={tr("sim.notDefined")}> ·dev</span>}</span>
                  <span className="sim-falt">{filterAlt[fid]}</span>
                  <button className={"sim-toggle" + (on ? " match" : " notmatch")} onClick={() => setFilter(fid, !on)}>
                    {on ? tr("flow.match") : tr("flow.nomatch")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="sim-results">
        {!inPort && <div className="sim-hint">Select an ingress port to trace the packet path.</div>}
        {inPort && matchingChains.length === 0 && <div className="sim-hint">No chain ingresses on <code>{inPort}</code>. The packet wouldn't be processed by any chain.</div>}
        {results.map(({ chain, steps, outcome }, i) => (
          <div key={chain.cid} className="sim-trace">
            <div className="sim-trace-head">
              <span className="sim-chip in">IN {inPort}</span>
              {matchingChains.length > 1 && <span className="sim-trace-n">chain {i + 1}</span>}
            </div>
            <div className="sim-flow">
              <div className="sim-node in"><span className="sim-node-k">ingress</span><span className="sim-node-v">{inPort}</span></div>
              {steps.map((s) => (
                <React.Fragment key={s.id}>
                  <div className="sim-arrow">↓</div>
                  <div className={"sim-node branch " + (s.matched ? "matched" : "notmatched")}>
                    <span className="sim-node-k">{s.fids}{s.alt && s.alt !== s.fids ? ` · ${s.alt}` : ""}</span>
                    <span className={"sim-node-badge " + (s.matched ? "match" : "notmatch")}>{s.matched ? "match →" : "not-match →"}</span>
                  </div>
                </React.Fragment>
              ))}
              <div className="sim-arrow">↓</div>
              <div className={"sim-node out " + outcome.kind}>
                <span className="sim-node-k">{outcome.kind === "out" ? (outcome.mode === "loadBalance" ? "load balance" : "output") : outcome.kind === "drop" ? "discard" : "default"}</span>
                <span className="sim-node-v">{outcome.text}{outcome.kind === "out" && outcome.mode === "loadBalance" ? ` (${outcome.lb})` : ""}</span>
              </div>
            </div>
            <div className="sim-summary">
              Packet on <code>{inPort}</code>
              {steps.length > 0 && <> → {steps.map((s, j) => <span key={j}>{j > 0 ? ", " : ""}<code>{s.fids}</code> {s.matched ? "match" : "not-match"}</span>)}</>}
              {" → "}<b className={"sim-out-" + outcome.kind}>{outcome.kind === "out" ? outcome.text : outcome.text}</b>
            </div>
          </div>
        ))}
      </section>
      </div>
    </div>
  );
}

function ExportTab({ runXml, problems, warnings = [], onGoto, onApplyXml, onApplied, docSource, loggedIn, t }) {
  const tr = t || ((k) => k);
  const [copied, setCopied] = useState(false);
  const [submit, setSubmit] = useState({ state: "idle", msg: "" }); // idle | sending | ok | error
  const [confirmSubmit, setConfirmSubmit] = useState(false); // show the "submit to device?" confirmation
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
          onApplied?.(); // config is now live on the device → clear dirty state
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

  const submitLabel = problems.length ? tr("ex.fixToSubmit")
    : apply.active ? tr("ex.applying")
    : submit.state === "sending" ? tr("ex.submitting")
    : submit.state === "ok" ? tr("ex.applied")
    : submit.state === "error" ? tr("ex.retrySubmit")
    : tr("ex.submit");

  const editing = edit !== null;

  return (
    <div className="export-layout">
      {apply.active && (
        <div className="apply-overlay">
          <div className="apply-card">
            <div className="apply-spinner" />
            <div className="apply-msg">{apply.msg}</div>
            <div className="apply-sub">{tr("ex.applyingToDevice")}</div>
          </div>
        </div>
      )}
      {confirmSubmit && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setConfirmSubmit(false)}>
          <div className={"modal" + (docSource === "template" ? " modal-warn" : "")} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{docSource === "template" ? tr("ex.confirmTitleTmpl") : tr("ex.confirmTitle")}</div>
            <p className="modal-body">
              {docSource === "template" ? tr("ex.confirmBodyTmpl") : tr("ex.confirmBody")}
            </p>
            <button className={"opt" + (docSource === "template" ? " drop" : "")} onClick={() => { setConfirmSubmit(false); submitToDevice(); }}>
              <span className="opt-name">{docSource === "template" ? tr("ex.submitAnyway") : tr("ex.submitApply")}</span>
              <span className="opt-desc">{tr("ex.overwriteDesc")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setConfirmSubmit(false)}>{tr("ex.cancel")}</button>
          </div>
        </div>
      )}
      <div className="export-main">
        <div className="xb-head">
          <span className="xb-title">{tr("ex.completeRun")}{editing && <span className="xb-editing"> · {tr("ex.editing")}</span>}</span>
          <div className="xb-actions">
            {!editing && <>
              <button className="copy-btn" onClick={startEdit}>{tr("ex.edit")}</button>
              <button className="copy-btn" disabled={problems.length > 0} onClick={copy}>{copied ? tr("ex.copied") : problems.length ? tr("ex.fixToCopy") : tr("ex.copy")}</button>
              {loggedIn && (
                <button className={"submit-btn" + (submit.state === "error" ? " err" : submit.state === "ok" ? " ok" : "")}
                  disabled={problems.length > 0 || submit.state === "sending" || apply.active} onClick={() => setConfirmSubmit(true)}>{submitLabel}</button>
              )}
            </>}
            {editing && <>
              <button className="copy-btn" onClick={formatEdit}>{tr("ex.format")}</button>
              <button className="copy-btn" onClick={cancelEdit}>{tr("ex.cancel")}</button>
              <button className="submit-btn" onClick={applyEdit}>{tr("ex.applyChanges")}</button>
            </>}
          </div>
        </div>
        {editing
          ? <textarea className="xml-edit" value={edit} spellCheck={false}
              onChange={(e) => setEdit(e.target.value)} />
          : <XmlView xml={runXml} />}
      </div>
      <aside className="export-side">
        {!editing && <div className={"pane-validity " + (problems.length ? "bad" : warnings.length ? "warn" : "ok")}>
          <span className="dot" />{problems.length ? `${problems.length} ${problems.length>1?tr("ex.issues"):tr("ex.issue")}` : warnings.length ? `${warnings.length} ${warnings.length>1?tr("ex.warningsWord"):tr("ex.warningWord")} ${tr("ex.canSubmit")}` : tr("ex.readyExport")}
        </div>}
        {editing && <div className="edit-help">
          <p>{tr("ex.editHelp")}</p>
          {applyErr && <p className="submit-note err">{tr("ex.cantApply")}: {applyErr}. {tr("ex.fixTryAgain")}</p>}
        </div>}
        {!editing && applyWarn.length > 0 && <p className="submit-note warn">{tr("ex.appliedWith")} {applyWarn.length} {applyWarn.length>1?tr("ex.warningsWord"):tr("ex.warningWord")}: {applyWarn.slice(0,3).join("; ")}{applyWarn.length>3?"…":""}</p>}
        {!editing && apply.warn && <p className="submit-note warn">{apply.warn}</p>}
        {!editing && submit.state === "error" && <p className="submit-note err">{tr("ex.submitFailed")}: {submit.msg}. {tr("ex.checkSignedIn")}</p>}
        {!editing && submit.state === "ok" && <p className="submit-note ok">{tr("ex.appliedLive")} <code>run.xml</code>.</p>}
        {!editing && problems.length > 0 && <ul className="problem-list">
          {problems.map((p, i) => <li key={i} onClick={() => onGoto(p.scope)}><code>{p.scope}</code> {p.label ? <b>{p.label}</b> : null} — {p.msg}</li>)}
        </ul>}
        {!editing && warnings.length > 0 && <ul className="problem-list warn-list">
          {warnings.map((p, i) => <li key={i} onClick={() => onGoto(p.scope)}><code>{p.scope}</code> {p.label ? <b>{p.label}</b> : null} — {p.msg}</li>)}
        </ul>}
        {!editing && problems.length === 0 && submit.state === "idle" && applyWarn.length === 0 && <p className="export-ok">{tr("ex.allValidate")}</p>}
      </aside>
    </div>
  );
}

