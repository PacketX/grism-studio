import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import "./GrismStudio.css";
import { STUDIO_VERSION, makeT } from "./i18n.js";
import { PacketxLogo } from "./PacketxLogo.jsx";
import {
  ACT_MODS, ACT_MOD_INDEX, FIELDS, FIELD_INDEX, INPUT_FIELD_INDEX, NODE_W, NODE_H, PH_H,
  OUT_MODS, OUT_MOD_INDEX, TEMPLATES, VLAN_OPS, actionProblems, buildMgmtConfigSet,
  buildArgsConfigSet, buildInTunnelsConfigSet, buildPortConfigSet, buildServicesConfigSet,
  cUpdate, chainProblems, changedPorts, changedServices, diffDoc, docSnapshot, isDeviceFilterId,
  buildHeartbeatConfigSet, buildServiceExtrasConfigSet, currentTimezone, heartbeatProblems,
  FLOW_ARGS, SYSLOG_MATCHED_SUBTYPES, SYSLOG_SYSTEM_SUBTYPES, buildLoggingConfigSet, dataPortNames,
  buildFlowServices, buildViewsConfigSet, xmlError, grismXmlProblems, flowProblems, parseDownloadProgress, parseUpdateCheck, flowServiceProblems, mkFlowService,
  parseFlowArgs, parseFlowServices, parseViews, viewsProblems,
  heartbeatStatusRows, interfacesToList, listToInterfaces, logSourcePorts,
  insertHeartbeatTarget, loggingProblems, mkHeartbeatTarget, mkLogTarget, mkNetflowTarget,
  mkSyslogTarget, parseHeartbeat, parseLogging,
  parseHeartbeatStatus, parseServiceExtras,
  parseServices, parseTimezones, tokenizeXml,
  mergePortStats, parseInterfacePorts, cloneForDup, collectRefs, describeDoc, filterProblems,
  FACTORY_MGMT_IP, fmtBytes, fmtKB, fmtNum, fmtSpeed, formatXml, inferIntent,
  inputFieldsFor, inputProblems, isDrop, isEmptyFilter, isUnset, layoutChain,
  mkAction, mkActionMod, mkChain, firstTwoPorts, mkDrop, mkFind, lastFindField, mkGroup,
  mkInput, mkNot, mkOut, mkOutput, mkOutputMod, mkUnset,
  buildInstantCapture, captureProblems, filterLabel, isPartialCapture, outputLabel, countryName, extractUsername, fmtPct,
  dirCrumbs, joinDir, parentDir, trafficGenDefaults, parseStorageDirs, parseStorageFiles, parseStorages, storagePath, namesOnly, nid, portLabel, protocolName, signedInUser, sortPortNames,
  summarizeCountries, summarizeFilterCounters, summarizeFlowServices,
  summarizePacketTypes, summarizeSessions, normalizeDoc, outputProblems, parseMgmtIfaces, parseRun, parseRunOrEmpty, parseUserList, sha256Hex,
  UNDELETABLE_USER, newUserProblem, changePasswordProblem, internalAccountsNoteKey, accountsErrorKey,
  extraRunFilesFrom, extraRunFileHref, freeExtraRunFileNames, formatFileSize,
  isExtraRunFileEditable, newExtraRunFileProblem, grismStructureError, rootElementError, problemLine,
  parseXsd, validateAgainstXsd, xsdProblemLine,
  countryOptions, mgmtPortNames, PORT_PICKER_FIELDS, portOptionsForField,
  savedConfigsFrom, buildSaveXmlName, nextSaveSlot, formatSavedTime,
  bypassSupport, bypassStatusUrl, bypassModeUrl, parseBypassStatus,
  pct, ph, relationsFor, serializeRun, setSide, summarizeStatus,
  tRemove, tUpdate, tmplText, toks, validate,
  hasSpeedSwitch, t12sSpeeds, T12S_SPEED_GROUPS, T12S_SPEEDS, formatPortSpeed,
  SDWAN_ARG_KEYS, sdwanProblems, parsePortList, formatPortList, togglePortInList,
  MEC_ARG_KEYS, mecProblems, dedupProblems,
  parseS1apItems, s1apPageCount, s1apClampPage, s1apWindow, s1apPageList, s1apParsePage, fmtIdle,
  s1apQuery, s1apUeFilterProblem, s1apIdleProblem, fmtCount,
  S1AP_PAGE_SIZES, S1AP_PAGE_DEFAULT,
  outputIndex, destLabel,
  parseL2greCorrelation,
  suggestName,
  parseVports, vportProblems, buildVportConfigSet,
  nextVport,
  t12sPanelLayout, panelStates,
  hasFrontPanel, panelPortState, panelDensity, portMacMap, shortVersion,
  panelLayout,
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
/* Fallback port list for when the device hasn't told us its real one yet. */
const DEFAULT_PORTS = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"];

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
/* Dialogs, in one place. Twelve confirmations in this file are a scrim div
   whose onClick closes it, with the panel inside -- correct with a mouse and
   nothing else: Escape did nothing, tab walked straight into the form behind
   the scrim and could activate it, and nothing announced that a dialog had
   opened. Rather than teach each of the twelve separately, watch for them.
   Escape closes the topmost by firing the close its own scrim already carries;
   focus moves inside on open and back to the opener on close; tab cycles
   within the panel; and the panel is marked up as a dialog. */
function ModalA11y() {
  React.useEffect(() => {
    let opener = null;
    const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),'
      + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    // the confirmations, plus the login dialog and the template gallery, which
    // use a scrim class of their own but are dialogs in every other respect
    const scrims = () => [...document.querySelectorAll(".modal-scrim, .tmpl-scrim")];
    const topScrim = () => scrims()[scrims().length - 1] ?? null;
    const panelOf = (scrim) => scrim?.firstElementChild ?? scrim ?? null;
    const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    const onKey = (e) => {
      const scrim = topScrim();
      if (!scrim) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); scrim.click(); return; }
      if (e.key !== "Tab") return;
      const list = focusables(panelOf(scrim));
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (i === -1) { e.preventDefault(); list[0].focus(); return; }
      if (e.shiftKey ? i === 0 : i === list.length - 1) {
        e.preventDefault();
        list[e.shiftKey ? list.length - 1 : 0].focus();
      }
    };
    const sync = () => {
      const scrim = topScrim();
      const panel = panelOf(scrim);
      if (panel) {
        if (!panel.hasAttribute("role")) {
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-modal", "true");
          if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
        }
        if (!panel.contains(document.activeElement)) {
          if (!opener) opener = document.activeElement;
          (focusables(panel)[0] ?? panel).focus();
        }
      } else if (opener) {
        // put the caret back where the user left it, not at the top of the page
        if (document.contains(opener) && typeof opener.focus === "function") opener.focus();
        opener = null;
      }
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKey, true);
    return () => { mo.disconnect(); document.removeEventListener("keydown", onKey, true); };
  }, []);
  return null;
}

export default function GrismStudio() {
  const [doc, setDocRaw] = useState(() => normalizeDoc(TEMPLATES.find((t) => t.id === "starter").make())); // seed with the starter example

  const [tab, setTab] = useState("overview");

  // --- two-level navigation: workspaces contain tabs ---
  // Overview is a standalone page. Config holds the editing/build tabs. System
  // holds device status pages. Future feature pages become new workspaces.
  const WORKSPACES = [
    { id: "overview", tabs: ["overview"] },
    { id: "pipeline", tabs: ["chain", "inputs", "outputs", "actions", "filters", "simulate", "export", "capture"] },
    { id: "traffic", tabs: ["trafficPorts", "trafficSessions", "trafficServices", "trafficCountries", "trafficL2gre", "trafficMec"] },
    { id: "system", tabs: ["status", "syslog", "settings"] },
  ];
  const tabWorkspace = (tb) => (WORKSPACES.find((w) => w.tabs.includes(tb)) ?? WORKSPACES[0]).id;
  const workspace = tabWorkspace(tab);
  // The document controls -- load from device, and which template is open --
  // only mean anything where the document is: the overview and the pipeline.
  const docWorkspace = workspace === "overview" || workspace === "pipeline";
  // leaving the pipeline closes its popovers and folds the advanced group back up
  useEffect(() => {
    if (workspace !== "pipeline") { setHealthOpen(false); setAdvOpen(false); }
  }, [workspace]);
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
  const [acctOpen, setAcctOpen] = useState(false);       // account / preferences menu
  const healthBtnRef = useRef(null), acctBtnRef = useRef(null);
  const healthPos = useAnchoredPos(healthOpen, healthBtnRef, 460);
  const acctPos = useAnchoredPos(acctOpen, acctBtnRef, 250);
  const [navOpen, setNavOpen] = useState(true);          // sub-tabs expanded beside the workspace
  const [advOpen, setAdvOpen] = useState(false);         // advanced group revealed by clicking its label
  // jump to the tab (and item) a problem belongs to. Shared by the Export list and
  // the topbar health popover.
  // Navigate to a sub-tab from outside the tab bar (Overview links, problem lists).
  // Always reveal the sub-tabs, otherwise the user lands on a page with no visible
  // indication of where they are — the bar stays collapsed from an earlier click.
  const goTab = useCallback((k) => { setTab(k); setNavOpen(true); }, []);
  const gotoScope = useCallback((scope) => {
    if (scope === "chain" || scope.startsWith("chain:")) {
      if (scope.startsWith("chain:")) setActiveChain(scope.slice(6));
      goTab("chain");
    }
    else if (scope[0] === "I") { setActiveInput(+scope.slice(1)); goTab("inputs"); }
    else if (scope[0] === "O") { setActiveOutput(+scope.slice(1)); goTab("outputs"); }
    else if (scope[0] === "A") { setActiveAction(+scope.slice(1)); goTab("actions"); }
    else { setActiveFilter(+scope.slice(1)); goTab("filters"); }
  }, [goTab]);
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

  /* The L2GRE correlation table only exists on a device that is decapsulating
     L2GRE, so its page appears only when the device has rows to show. Read once
     on arriving in the workspace -- it is a lookup table, not a live counter. */
  const [l2gre, setL2gre] = useState(null);
  // <args><grel2Correlation>, read from the same get_config the port list comes
  // from. Declared here so hasL2gre below can see it.
  const [l2greOn, setL2greOn] = useState(false);
  const [s1cOn, setS1cOn] = useState(false);            // <args><s1cCorrelation>
  const [deviceModel, setDeviceModel] = useState("");   // <args><model>, for panels that are model-specific
  useEffect(() => {
    if (workspace !== "traffic" || !login.who) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_l2gre_correlation_table", { credentials: "include" });
        if (!res.ok) return;
        const parsed = parseL2greCorrelation(await res.json());
        if (alive) setL2gre(parsed);
      } catch { /* leave the page hidden, as for a device that has no table */ }
    })();
    return () => { alive = false; };
  }, [workspace, login.who]);
  /* Show the page whenever correlation is switched on -- a device that has just
     been turned on has an empty table, and hiding the page then reads as the
     feature being missing. Also show it when rows survive the switch being
     turned off, because those rows are still the answer to "what was in there". */
  const hasL2gre = l2greOn || (l2gre?.rows.length ?? 0) > 0;
  // a table that empties while it is open would otherwise leave a blank tab
  useEffect(() => { if (tab === "trafficL2gre" && !hasL2gre) setTab("trafficPorts"); }, [tab, hasL2gre]);
  // and the same for the MEC page if correlation is switched off while it is open
  useEffect(() => { if (tab === "trafficMec" && !s1cOn) setTab("trafficPorts"); }, [tab, s1cOn]);

  // Why the session ended, when something other than the logout button ended it.
  // Set as the tab that triggered it unmounts, so it has to live out here.
  const [signedOutNotice, setSignedOutNotice] = useState("");
  const [devicePorts, setDevicePorts] = useState(null); // null = use defaults; array = from device
  const [mgmtPorts, setMgmtPorts] = useState([]);       // management interfaces, e.g. M0
  const [hbTargets, setHbTargets] = useState([]); // heartbeat targets from get_config: {id, sendPort, receivePort}
  const [deviceStorages, setDeviceStorages] = useState([]); // enabled storage names from get_config (output port options)
  const [loopPorts, setLoopPorts] = useState([]); // ports on a LOOP-type interface (out returns in on the same port)
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
  const [baselineDoc, setBaselineDoc] = useState(null); // the document that baseline XML came from
  // What changed since the config was loaded — drives the "modified" badges so the
  // user can see which sections and which rows they actually touched.
  const changes = useMemo(() => (baselineDoc ? diffDoc(baselineDoc, doc) : null), [baselineDoc, doc]);
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
            // Not defined here. Ids at or above the device threshold are created on
            // the device itself, so referencing one is expected — only lower ids are
            // genuinely missing from this configuration.
            if (isDeviceFilterId(id)) return;
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
  }, [doc.chains, definedIds, outputIds]);

  // --- load the device's running config ---
  const [load, setLoad] = useState({ state: "idle", msg: "" }); // idle | loading | ok | error
  const doLoadRunning = useCallback(async () => {
    setLoad({ state: "loading", msg: "" });
    try {
      const res = await fetch("/grism/task/get_running_file?filename=run.xml", { credentials: "include" });
      // 404 means the device has no run.xml, which is a state, not a failure.
      // Anything else really is one. (If a device were ever to lack the endpoint
      // entirely it would read as "no configuration" here — still better than
      // leaving the starter template on screen as if it came from the device.)
      if (!res.ok && res.status !== 404) throw new Error(`device responded ${res.status}`);
      const text = res.ok ? await res.text() : "";
      const { doc: parsed, warnings, empty } = parseRunOrEmpty(text);
      const normalized = normalizeDoc(parsed);
      docRef.current = normalized; setDocRaw(normalized);
      resetHistory();                          // the load itself is not undoable
      setDocSource("running");
      setBaseline(serializeRun(normalized)); setBaselineDoc(normalized); // in sync with the device
      setActiveFilter(parsed.filters[0]?.id ?? 1);
      setActiveOutput(parsed.outputs[0]?.id ?? 1);
      setActiveAction(parsed.actions[0]?.id ?? 1);
      setActiveChain(parsed.chains[0]?.cid ?? null);
      setLoad({ state: "ok", empty, msg: warnings.length ? `loaded with ${warnings.length} warning${warnings.length>1?"s":""}` : "loaded running config", warnings });
    } catch (e) {
      // The device answered with something unreadable — truncated, not XML at
      // all, "XML is not well-formed". Whatever it is, it is not the starter
      // template, and leaving that on screen makes it what Export and Submit
      // would act on. Clear to an empty document instead. The banner keeps the
      // failure visible and warns that the device's own configuration was not
      // read, so submitting from here would replace whatever is still on it.
      const blank = normalizeDoc({ filters: [], inputs: [], outputs: [], actions: [], chains: [] });
      docRef.current = blank; setDocRaw(blank);
      resetHistory();
      setDocSource("new");
      setBaseline(serializeRun(blank)); setBaselineDoc(blank);
      setActiveFilter(null); setActiveOutput(null); setActiveAction(null); setActiveChain(null);
      setLoad({ state: "error", cleared: true, msg: e.message || "load failed" });
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
  /* Loading a template replaces the working document, so it goes through the
     same guard as loading a running config. goTo lets a caller outside the
     pipeline -- the SD-WAN settings card -- land on the chains it just made. */
  const applyTemplate = useCallback((tpl, goTo) => {
    if (!tpl) return;
    requestLoad({ kind: "template", run: () => {
      const nd = normalizeDoc(tpl.make());
      docRef.current = nd; setDocRaw(nd);
      setBaseline(null); setBaselineDoc(null);
      setDocSource("template"); setTemplateName(tpl.title);
      setLoad({ state: "idle", msg: "" });
      resetHistory(); setActiveFilter(1); setShowTemplates(false);
      if (goTo) setTab(goTo);
    } });
  }, [requestLoad]);

  const loadRunning = useCallback(() => {
    requestLoad({ kind: "running", run: doLoadRunning });
  }, [doLoadRunning, requestLoad]);

  // Ask the device who is signed in. Any failure (missing endpoint, error status,
  // unexpected body) resolves to "" so the caller just keeps its fallback.
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/grism/task/get_current_user", { credentials: "include" });
      if (!res.ok) return "";
      return extractUsername(await res.text());
    } catch { return ""; }
  }, []);

  // fetch the device's interface/port list; flatten every interface's ports to
  // their names. Falls back to the default list on any failure.
  // `preloaded` lets a caller that already fetched get_config (the session probe)
  // hand the parsed body over instead of us fetching the same thing again.
  const loadDevicePorts = useCallback(async (preloaded) => {
    try {
      let cfg = preloaded;
      if (!cfg) {
        const res = await fetch("/grism/task/get_config", { credentials: "include" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        cfg = await res.json();
      }
      const ifaces = cfg.interfaces ?? [];
      // Sort the device's ports predictably: virtual (V*) first, then physical (P*),
      // then anything else — each numerically ascending, so the pickers always read
      // V0, V1 … P0, P1 … regardless of the order the config happens to use.
      const names = ifaces.flatMap((i) => i.ports ?? []).map((p) => p.name).filter(Boolean);
      setDevicePorts(names.length ? sortPortNames([...new Set(names)]) : null);
      // ports belonging to a LOOP-type interface: traffic sent out returns on the
      // same port. Tracked separately so the panel can list & animate them.
      const loops = ifaces.filter((i) => (i.type || "").toUpperCase() === "LOOP")
        .flatMap((i) => i.ports ?? []).map((p) => p.name).filter(Boolean);
      setLoopPorts([...new Set(loops)]);
      // whether the device is correlating L2GRE at all -- the table page is only
      // worth showing when it is, or when it still holds rows from when it was
      setL2greOn((cfg.args ?? {}).grel2Correlation === true);
      // the MEC mapping table is only meaningful while S1AP/NGAP correlation
      // is on: with it off the device builds no items at all
      setS1cOn((cfg.args ?? {}).s1cCorrelation === true);
      setDeviceModel(String((cfg.args ?? {}).model ?? ""));
      const targets = (cfg.heartbeat?.target ?? [])
        .map((t) => ({ id: t.id, sendPort: t.sendPort, receivePort: t.receivePort }))
        .filter((t) => t.id != null);
      setHbTargets(targets);
      const storages = (cfg.storages ?? []).filter((s) => s.enable).map((s) => s.name).filter(Boolean);
      setDeviceStorages([...new Set(storages)]);
      // grism.port.linkdown can name a management interface as well as a data
      // port, and those live in ifcfgs rather than interfaces
      setMgmtPorts([...new Set(mgmtPortNames(cfg))]);
    } catch { setDevicePorts(null); setHbTargets([]); setDeviceStorages([]); setLoopPorts([]); setMgmtPorts([]); } // keep defaults
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
      setSignedOutNotice("");
      setLogin((l) => ({ ...l, busy: false, ok: true, pass: "", open: false, who: username }));
      setTimeout(() => setLogin((l) => ({ ...l, ok: false })), 2500);
      loadDevicePorts();   // interface/port list for the pickers
      // loadRunning() replaces the document and sets the baseline itself. It only
      // does that straight away when there's nothing to lose; if it has to ask
      // first, fetch the baseline separately so the sync indicator is still right.
      if (docModified()) loadBaseline();
      loadRunning();
    } catch (e) {
      setLogin((l) => ({ ...l, busy: false, err: e.message || "login failed" }));
    }
  }, [loadBaseline, loadDevicePorts, loadRunning, docModified]);

  // On mount, detect an existing device session (the session cookie survives a
  // page refresh even though React state resets). We probe an authed endpoint;
  // if it succeeds we're still logged in, so restore the signed-in UI and run the
  // usual post-login loads. The device also records the account name in a readable
  // cookie, so a restored session shows the real user rather than a generic marker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_config", { credentials: "include" });
        if (!res.ok || cancelled) return;                 // not authenticated → stay logged out
        const cfg = await res.json().catch(() => null);   // reuse this body for the port list
        if (cancelled) return;
        // Show the real account when we can. The username cookie is usually HttpOnly
        // (so unreadable here), so ask the device; if that endpoint doesn't exist or
        // doesn't answer, fall back to the cookie and then to a generic marker.
        setLogin((l) => ({ ...l, who: signedInUser() || "signed in" }));
        loadDevicePorts(cfg);
        fetchCurrentUser().then((name) => {
          if (name && !cancelled) setLogin((l) => (l.who ? { ...l, who: name } : l));
        });
        doLoadRunning();   // loads the running config AND sets the sync baseline
      } catch { /* offline or not authed — stay logged out */ }
    })();
    return () => { cancelled = true; };
  }, [loadDevicePorts, doLoadRunning, fetchCurrentUser]);

  const doLogout = useCallback(async (notice = "") => {
    setSignedOutNotice(notice);
    try {
      await fetch("/logout", { method: "POST", credentials: "include" });
    } catch { /* clear local session regardless of network result */ }
    setDevicePorts(null); setMgmtPorts([]); // fall back to default port list
    setHbTargets([]);
    setDeviceStorages([]);
    setLoopPorts([]);
    setL2greOn(false); setL2gre(null); setDeviceModel("");
    setLogin((l) => ({ ...l, who: null, ok: false, pass: "", err: "" }));
    /* The open document may be the device's running config, which is no longer
       ours to show and can no longer be reloaded. Go back to the overview on the
       starter template, so what is on screen matches what we still have. */
    setTab("overview");
    const starter = TEMPLATES.find((x) => x.id === "starter");
    if (starter) {
      const nd = normalizeDoc(starter.make());
      docRef.current = nd; setDocRaw(nd);
      setBaseline(null); setBaselineDoc(null);
      setDocSource("template"); setTemplateName(starter.title);
      setLoad({ state: "idle", msg: "" });
      resetHistory(); setActiveFilter(1);
    }
  }, [resetHistory]);

  return (
    <div className={"gs-root" + (theme === "light" ? " light" : "")}>
      <ModalA11y />

      <header className="topbar">
        <button className="brand" onClick={() => setTab("overview")}>
          <span className="logo">◇</span>
          <span className="brand-name">GRISM</span>
          <span className="brand-sub">studio</span>
        </button>
        {/* Workspace switcher. Each workspace's sub-tabs slide out horizontally to the
            right of its button, so switching sections never shifts the rows below.
            Clicking the active workspace collapses the sub-tabs again. */}
        <nav className="ws-switch">
          {WORKSPACES.filter((w) => w.id !== "overview").map((w) => {
            const active = workspace === w.id;
            const open = active && navOpen;
            return (
              <span className={"ws-item" + (open ? " open" : "")} key={w.id}>
                <button className={"ws-btn" + (active ? " on" : "")}
                  onClick={() => { if (active) setNavOpen((v) => !v); else { gotoWorkspace(w.id); setNavOpen(true); } }}
                  aria-expanded={open}>
                  {t("ws." + w.id)}
                  <span className="ws-caret" aria-hidden="true">{open ? "▲" : "▼"}</span>
                </button>

                {open && w.id === "pipeline" && (() => {
                  const counts = { inputs: doc.inputs?.length ?? 0, outputs: doc.outputs?.length ?? 0, actions: doc.actions?.length ?? 0 };
                  const advKeys = ["inputs", "outputs", "actions"];
                      // All-or-nothing: show all three or none. Showing a subset made
                      // the row's width -- and every tab's position -- change as the
                      // sections filled up.
                      //
                      // Being on one of them keeps the group open. Folding from there
                      // is allowed -- it moves to chains, since staying on a tab that
                      // is no longer in the row would leave nothing selected. The
                      // folded label carries the count, so putting the group away does
                      // not hide that there is anything in it.
                      const onAdvTab = advKeys.includes(tab);
                      const foldAdv = () => { setAdvOpen(false); if (onAdvTab) setTab("chain"); };
                      const shown = (advOpen || onAdvTab) ? advKeys : [];
                      const advCount = advKeys.reduce((sum, k) => sum + (counts[k] || 0), 0);
                  const hidden = advKeys.length - shown.length;
                  // a tab shows a dot when its section differs from the loaded config
                  const TAB_SECTION = { filters: "filters", inputs: "inputs", outputs: "outputs", actions: "actions", chain: "chains" };
                  const tabBtn = (k) => (
                    <button key={k} className={"tab" + (tab === k ? " on" : "") + (advKeys.includes(k) ? " adv" : "")} onClick={() => setTab(k)}>
                      {t("tab." + k)}
                      {k === "filters" && <span className="tab-badge">{doc.filters.length}</span>}
                      {counts[k] > 0 && <span className="tab-badge">{counts[k]}</span>}
                      {k === "chain" && (doc.chains?.length ?? 0) > 0 && <span className="tab-badge">{doc.chains.length}</span>}
                      {(changes?.[TAB_SECTION[k]]?.count ?? 0) > 0 &&
                        <span className="tab-changed" title={t("chg.tabTip")} aria-label={t("chg.tabTip")} />}
                    </button>
                  );
                  return (
                    <nav className="tabs ws-tabs">
                      {tabBtn("chain")}
                      {tabBtn("filters")}
                      <span className={"tab-group" + (hidden > 0 ? " collapsed" : "")}>
                        {hidden > 0 ? (
                          <button className="tab-group-label as-button" onClick={() => setAdvOpen(true)}
                            title={t("nav.advancedTip")} aria-label={t("nav.advancedTip")} aria-expanded={false}>
                            {t("nav.advanced")}
                            {advCount > 0 && <span className="tab-badge">{advCount}</span>}
                            <span className="tab-group-caret" aria-hidden="true">▼</span>
                          </button>
                        ) : (
                          <button className="tab-group-label as-button" onClick={foldAdv}
                            title={t("nav.advancedHide")} aria-label={t("nav.advancedHide")} aria-expanded={true}>
                            {t("nav.advanced")}
                            <span className="tab-group-caret" aria-hidden="true">▲</span>
                          </button>
                        )}
                        {shown.map(tabBtn)}
                      </span>
                      {tabBtn("simulate")}
                      {tabBtn("export")}
                      {/* capture submits a temporary run of its own — set it apart
                          from the tabs that build the persistent configuration */}
                      <span className="tab-divider" aria-hidden="true" />
                      {tabBtn("capture")}
                    </nav>
                  );
                })()}

                {open && w.id === "traffic" && (
                  <nav className="tabs ws-tabs">
                    {["trafficPorts", "trafficSessions", "trafficServices", "trafficCountries",
                      ...(hasL2gre ? ["trafficL2gre"] : []),
                      ...(s1cOn ? ["trafficMec"] : [])].map((k) => (
                      <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
                        {t("tab." + k)}
                      </button>
                    ))}
                  </nav>
                )}

                {open && w.id === "system" && (
                  <nav className="tabs ws-tabs">
                    {["status", "syslog", "settings"].map((k) => (
                      <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
                        {t("tab." + k)}
                      </button>
                    ))}
                  </nav>
                )}
              </span>
            );
          })}
        </nav>
        <div className="tabs-spacer" />
        {docWorkspace && <>
          {login.who && (
            <button className={"load-btn " + load.state + (docSource === "running" ? " src-active" : "")} onClick={loadRunning} disabled={load.state === "loading"}
              title={baseline !== null ? (dirty ? t("sync.dirtyTip") : t("sync.syncedTip")) : t("btn.loadRunningTip")}>
              {load.state === "loading" ? t("btn.loading") : load.state === "error" ? t("btn.loadFailed") : t("btn.loadRunning")}
              {/* sync state belongs to the loaded config, so it rides on this button */}
              {baseline !== null && (
                <span className={"load-sync " + (dirty ? "dirty" : "synced")}>
                  <span className="load-sync-dot" aria-hidden="true" />
                  {dirty ? t("sync.dirty") : t("sync.synced")}
                </span>
              )}
            </button>
          )}
        </>}
        {/* Which document is open. A template is usually picked from the
            overview, so the label has to survive there and not only in the
            pipeline -- but it means nothing on the traffic or system pages. */}
        {docWorkspace && docSource === "template" && (
          <button className="tmpl-chip" onClick={() => setShowTemplates(true)}
            title={t("btn.fromTemplateTip")}>
            <span className="tmpl-chip-tag">{t("btn.fromTemplate")}</span>
            <span className="tmpl-chip-name">{(() => {
              const tp = TEMPLATES.find((x) => x.title === templateName);
              return tp ? tmplText(tp, "title", lang) : templateName;
            })()}</span>
          </button>
        )}
        {workspace === "pipeline" && (
        <div className="health-wrap">
          <button ref={healthBtnRef} className={"health " + (allProblems.length ? "bad" : allWarnings.length ? "warn" : "ok")}
            onClick={() => setHealthOpen((v) => !v)} title={t("health.tip")} aria-expanded={healthOpen}>
            <span className="dot" />{allProblems.length ? `${allProblems.length} ${allProblems.length>1?t("health.issues"):t("health.issue")}` : allWarnings.length ? `${allWarnings.length} ${allWarnings.length>1?t("health.warnings"):t("health.warning")}` : t("health.valid")}
          </button>
          {healthOpen && (
            <>
              <div className="health-scrim" onClick={() => setHealthOpen(false)} />
              <div className="health-pop" style={healthPos ? { top: healthPos.top, left: healthPos.left, width: healthPos.width } : undefined}>
                <div className="health-pop-head">
                  <span>{allProblems.length || allWarnings.length ? t("health.detailsTitle") : t("health.noneTitle")}</span>
                  <button className="health-pop-close" onClick={() => setHealthOpen(false)} aria-label={t("health.close")}>✕</button>
                </div>
                {(changes?.total ?? 0) > 0 && (
                  <div className="chg-summary">
                    <div className="chg-summary-head">{t("chg.title")}</div>
                    <ul className="chg-list">
                      {[["filters", "F"], ["inputs", "I"], ["outputs", "O"], ["actions", "A"], ["chains", "C"]]
                        .filter(([sec]) => changes[sec].count > 0)
                        .map(([sec, prefix]) => {
                          const c = changes[sec];
                          const parts = [];
                          if (c.added.length) parts.push(`+${c.added.length} ${t("chg.added")}`);
                          if (c.changed.length) parts.push(`${c.changed.length} ${t("chg.edited")}`);
                          if (c.removed.length) parts.push(`−${c.removed.length} ${t("chg.removed")}`);
                          const ids = [...c.added, ...c.changed].map((id) => prefix + id).join(", ");
                          return (
                            <li key={sec} onClick={() => { gotoScope(sec === "chains" ? "chain" : prefix + ([...c.touched][0] ?? "")); setHealthOpen(false); }}>
                              <b>{t("tab." + (sec === "chains" ? "chain" : sec))}</b>
                              <span className="chg-detail">{parts.join(" · ")}</span>
                              {ids && <code className="chg-ids">{ids}</code>}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
                {allProblems.length === 0 && allWarnings.length === 0 && (changes?.total ?? 0) === 0 && <p className="health-pop-none">{t("health.noneBody")}</p>}
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
        {histKey && (
          <div className="topbar-undo" title={t("undo.tip")}>
            <button className="undo-btn" onClick={doUndo} disabled={!canUndo} title={t("undo.undo")} aria-label={t("undo.undo")}>↶</button>
            <button className="undo-btn" onClick={doRedo} disabled={!canRedo} title={t("undo.redo")} aria-label={t("undo.redo")}>↷</button>
          </div>
        )}
        {/* Account menu: session, language and theme live behind one control so the
            topbar stays focused on the work rather than on settings. */}
        <div className="acct-wrap">
          <button ref={acctBtnRef} className={"acct-btn" + (acctOpen ? " on" : "")} onClick={() => setAcctOpen((v) => !v)}
            title={login.who || t("btn.login")} aria-expanded={acctOpen} aria-haspopup="true">
            <span className="acct-avatar" aria-hidden="true">{login.who ? login.who.slice(0, 1).toUpperCase() : "◦"}</span>
            <span className="acct-name">{login.who || t("btn.login")}</span>
            <span className="acct-caret" aria-hidden="true">{acctOpen ? "▲" : "▼"}</span>
          </button>
          {acctOpen && (
            <>
              <div className="acct-scrim" onClick={() => setAcctOpen(false)} />
              <div className="acct-menu" style={acctPos ? { top: acctPos.top, left: acctPos.left, width: acctPos.width } : undefined}>
                <div className="acct-section">
                  {login.who ? (
                    <>
                      <div className="acct-user">
                        <span className="acct-user-k">{t("user.signedIn")}</span>
                        <span className="acct-user-v">{login.who}</span>
                      </div>
                      <button className="acct-item" onClick={() => { setAcctOpen(false); doLogout(); }}>
                        {t("btn.logout")}
                      </button>
                    </>
                  ) : (
                    <button className="acct-item" onClick={() => { setAcctOpen(false); setLogin((l) => ({ ...l, open: true, err: "" })); }}>
                      {t("btn.login")}
                    </button>
                  )}
                </div>

                <div className="acct-section">
                  <div className="acct-row">
                    <span className="acct-row-k">{t("acct.language")}</span>
                    <div className="acct-seg">
                      <button className={lang === "zh-TW" ? "on" : ""} onClick={() => setLang("zh-TW")}>繁中</button>
                      <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
                    </div>
                  </div>
                  <div className="acct-row">
                    <span className="acct-row-k">{t("acct.theme")}</span>
                    <div className="acct-seg">
                      <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>☀️ {t("acct.light")}</button>
                      <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>🌙 {t("acct.dark")}</button>
                    </div>
                  </div>
                </div>

                <div className="acct-foot">GRISM Studio {STUDIO_VERSION}</div>
              </div>
            </>
          )}
        </div>
      </header>
      {signedOutNotice && <div className="load-banner">{signedOutNotice}</div>}
      {load.state === "error" && <div className="load-banner err">{t("banner.loadFailed")}: {load.msg}.{" "}
        {load.cleared ? t("banner.clearedNotDevice") : t("banner.checkSignedIn")}</div>}
      {load.state === "ok" && load.msg.includes("warning") && <div className="load-banner warn">{load.msg} — {t("banner.someUnrecognised")}</div>}
      {/* An empty canvas right after signing in is ambiguous — say the device has
          nothing configured, so it does not read as a load that silently failed. */}
      {load.state === "ok" && load.empty && <div className="load-banner">{t("banner.deviceEmpty")}</div>}

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
            <TemplatesTab lang={lang} t={t} onApply={applyTemplate} />
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
        <TabErrorBoundary tabKey={tab} label={t("err.tabFailed")} retryLabel={t("err.retry")}>
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
            onOpenTemplates={() => setShowTemplates(true)}
            onGoto={goTab} />
        )}
        {tab === "status" && (
          <SystemStatusTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "syslog" && (
          <SystemLogTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "settings" && (
          <SettingsTab loggedIn={!!login.who} t={t} portOptions={devicePorts ?? DEFAULT_PORTS} onSignedOut={doLogout}
            onUseTemplate={(id) => applyTemplate(TEMPLATES.find((x) => x.id === id), "chain")}
            filterIds={doc.filters.map((f) => ({ id: "F" + f.id, label: filterLabel(f) }))} />
        )}
        {tab === "trafficPorts" && (
          <TrafficTab loggedIn={!!login.who} t={t} model={deviceModel} />
        )}
        {tab === "trafficSessions" && (
          <TrafficSessionsTab loggedIn={!!login.who} t={t}
            filterNames={Object.fromEntries(doc.filters.map((f) => [f.id, f.name || f.alt || ""]))} />
        )}
        {tab === "trafficServices" && (
          <TrafficServicesTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "trafficCountries" && (
          <TrafficCountriesTab loggedIn={!!login.who} t={t} lang={lang} />
        )}
        {tab === "trafficL2gre" && (
          <L2greTab data={l2gre} correlating={l2greOn} onData={setL2gre} t={t} />
        )}
        {tab === "trafficMec" && (
          <MecTab loggedIn={!!login.who} t={t} />
        )}
        {tab === "capture" && (
          <CaptureTab loggedIn={!!login.who} t={t}
            ports={devicePorts ?? DEFAULT_PORTS} filterIds={doc.filters.map((f) => ({ id: "F" + f.id, label: filterLabel(f) }))} />
        )}
        {tab === "filters" && (
          <FiltersTab
            doc={doc} setDoc={setDoc}
            activeFilter={activeFilter} setActiveFilter={setActiveFilter}
            setFilterRoot={setFilterRoot} hbTargets={hbTargets} t={t} touched={changes?.filters?.touched}
            portOptions={devicePorts ?? DEFAULT_PORTS} mgmtPorts={mgmtPorts} lang={lang}
          />
        )}
        {tab === "inputs" && (
          <InputsTab doc={doc} setDoc={setDoc} activeInput={activeInput} setActiveInput={setActiveInput} portOptions={devicePorts ?? DEFAULT_PORTS} t={t} touched={changes?.inputs?.touched} />
        )}
        {tab === "outputs" && (
          <OutputsTab doc={doc} setDoc={setDoc} activeOutput={activeOutput} setActiveOutput={setActiveOutput} portOptions={[...(devicePorts ?? DEFAULT_PORTS), ...deviceStorages]} t={t} touched={changes?.outputs?.touched} />
        )}
        {tab === "actions" && (
          <ActionsTab doc={doc} setDoc={setDoc} activeAction={activeAction} setActiveAction={setActiveAction} portOptions={devicePorts ?? DEFAULT_PORTS} t={t} touched={changes?.actions?.touched} />
        )}
        {tab === "chain" && (
          <ChainTab doc={doc} definedIds={definedIds} outputIds={outputIds}
            setChainTreeFor={setChainTreeFor} setDoc={setDoc} touched={changes?.chains?.touched}
            activeChain={activeChain} setActiveChain={setActiveChain}
            t={t}
            portOptions={devicePorts ?? DEFAULT_PORTS} portsFromDevice={devicePorts !== null} />
        )}
        {tab === "simulate" && (
          <SimulateTab doc={doc} definedIds={definedIds} portOptions={devicePorts ?? DEFAULT_PORTS} loopPorts={loopPorts} t={t}
            simState={simState} simInPort={simInPort} simInlines={simInlines} simInlineDraft={simInlineDraft} simFlipped={simFlipped} />
        )}
        {tab === "export" && (
          <ExportTab runXml={runXml} problems={allProblems} warnings={allWarnings} docSource={docSource} loggedIn={!!login.who} lang={lang} t={t}
            onApplied={() => { setBaseline(runXml); setBaselineDoc(doc); }}
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
        </TabErrorBoundary>
      </div>
    </div>
  );
}

/* ============================================================
   Overview tab — auto-generated explanation of the current doc
   ============================================================ */
function OverviewTab({ doc, docSource, templateName, onGoto, lang, t, loggedIn, onOpenTemplates }) {
  const tr = t || ((k) => k);
  const info = useMemo(() => describeDoc(doc, tr), [doc, lang]);
  const [filtersOpen, setFiltersOpen] = React.useState(false); // Overview: show all filters vs first few

  /* templateName holds the English title -- it is the key the gallery is looked
     up by -- so anything shown to the reader goes through tmplText. */
  const template = docSource === "template" ? TEMPLATES.find((x) => x.title === templateName) : null;
  const tplName = template ? tmplText(template, "title", lang) : templateName;

  const sourceLabel = docSource === "running" ? tr("ov.src.running")
    : docSource === "template" ? tr("ov.src.template").replace("{name}", tplName) : tr("ov.src.manual");

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
            ["ov.capTraffic", "ov.capTrafficBody", "trafficPorts"],
            ["ov.capSystem", "ov.capSystemBody", "status"]].map(([tk, bk, dest]) => (
            <div className={"ov-cap" + (dest ? " linked" : "")} key={tk}
              onClick={dest ? () => onGoto(dest) : undefined}
              role={dest ? "button" : undefined} tabIndex={dest ? 0 : undefined}
              onKeyDown={dest ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGoto(dest); } } : undefined}>
              <span className="ov-cap-title">{tr(tk)}</span>
              <span className="ov-cap-body">{tr(bk)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Signed out, nothing has been read from a device — make it unmistakable that
          what's on screen is an example, not this device's configuration. */}
      {!loggedIn && docSource === "template" && (
        <div className="tmpl-banner">
          <div className="tmpl-banner-text">
            <b>{tr("ov.tmplBannerTitle")} · {tplName}</b>
            <span>{tr("ov.tmplBannerBody")}</span>
          </div>
          {onOpenTemplates && (
            <button className="tmpl-btn on" onClick={onOpenTemplates}>{tr("ov.tmplBannerBtn")}</button>
          )}
        </div>
      )}

      <div className="ov-head">
        <div>
          <h3 className="ov-section-label">{tr("ov.currentTitle")}</h3>
          <h2 className="ov-title">{tr("ov.title")}</h2>
          <p className="ov-sub">{tr("ov.loadedFrom")} {sourceLabel}. <span className="ov-summary">{summary}</span></p>
        </div>
        {onOpenTemplates && (
          <button className={"tmpl-btn" + (docSource === "template" ? " src-active" : "")} onClick={onOpenTemplates}
            title={docSource === "template" ? `${tr("btn.template_current")}: ${tplName}` : tr("tmpl.tip")}>
            {docSource === "template" ? `${tr("btn.template_current")} · ${tplName}` : tr("btn.templates")}
          </button>
        )}
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
            {info.chains.map((c, i) => <ChainFlow key={i} chain={c} filterNames={info.filterNames} outputInfo={info.outputInfo} t={tr} />)}
          </div>
          <button className="ov-jump" onClick={() => onGoto("chain")}>{tr("ov.editChains")}</button>
        </section>
      )}

      <footer className="ov-footer">
        <a className="ov-logo" href="http://www.packetx.biz/" target="_blank" rel="noreferrer">
          <PacketxLogo />
        </a>
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
/* Which interfaces an exporter covers. A dropdown rather than a row of checkboxes:
   the list can be long, and it keeps each target compact. */
function InterfacePicker({ value, ports, onChange, tr, hideBulk = false }) {
  const [open, setOpen] = React.useState(false);
  // "all" is a distinct value from "nothing chosen" — an empty string must not
  // fall back to all, or clearing the selection would tick every box instead.
  const isAll = String(value ?? "").trim().toLowerCase() === "all";
  const chosen = interfacesToList(value, ports);
  const toggle = (p) => onChange(listToInterfaces(
    chosen.includes(p) ? chosen.filter((x) => x !== p) : [...chosen, p], ports));
  // A <div>, not a <label>: a label forwards clicks anywhere inside it to its
  // control, which swallowed the scrim and the Select all / Clear buttons.
  return (
    <div className="ml iface-pick"><span>{tr("set.lgInterfaces")}</span>
      <button type="button" className="iface-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="mono">{isAll ? tr("set.lgAllInterfaces") : (chosen.join(",") || tr("set.lgNoInterfaces"))}</span>
        <span className="iface-caret" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <div className="iface-scrim" onClick={() => setOpen(false)} />
          <div className="iface-menu">
            {!hideBulk && (
              <div className="iface-menu-head">
                <button type="button" onClick={() => onChange("all")}>{tr("set.lgSelectAll")}</button>
                <button type="button" onClick={() => onChange("")}>{tr("set.lgSelectNone")}</button>
              </div>
            )}
            {ports.map((p) => (
              <label className="iface-opt" key={p}>
                <input type="checkbox" checked={chosen.includes(p)} onChange={() => toggle(p)} />
                <span className="mono">{p}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* One collector target. Every exporter shares this shape — address, port, which
   interfaces to cover and an optional filter — so they share one editor. */
function LogTarget({ target, onPatch, onRemove, tr, extra, dataPorts = [], filterIds = [], hideScope = false }) {
  return (
    <div className="hb-target">
      <div className="hb-target-head">
        <span className="log-target-name mono">{target.dip || tr("set.lgNoCollector")}</span>
        <button className="del" onClick={onRemove}>{tr("common.delete")}</button>
      </div>
      <div className="set-grid">
        <label className="ml"><span>{tr("set.lgCollector")}</span>
          <input value={target.dip} placeholder="192.168.1.10"
            onChange={(e) => onPatch({ dip: e.target.value })} /></label>
        <label className="ml" style={{ flex: "0 1 120px" }}><span>{tr("set.bkPort")}</span>
          <input type="number" min="1" max="65535" value={target.dport}
            onChange={(e) => onPatch({ dport: Number(e.target.value) || 0 })} /></label>
        {!hideScope && (
          <label className="ml"><span>{tr("set.lgFilter")}</span>
            <select value={target.filter} onChange={(e) => onPatch({ filter: e.target.value })}>
              <option value="">{tr("set.lgAllTraffic")}</option>
              {filterIds.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select></label>
        )}
      </div>
      {!hideScope && <InterfacePicker value={target.interfaces} ports={dataPorts} tr={tr}
        onChange={(v) => onPatch({ interfaces: v })} />}
      {extra}
    </div>
  );
}

/* A file chooser that shows what's selected and warns if the name doesn't match
   what the device expects — picking the wrong archive is an easy mistake. */
function FilePick({ accept, file, onPick, tr, hint }) {
  const ref = React.useRef(null);
  const wrong = file && hint && file.name !== hint;
  return (
    <div className="file-pick">
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <button className="copy-btn" onClick={() => ref.current?.click()}>{tr("set.chooseFile")}</button>
      <span className="file-name mono">{file ? file.name : tr("set.noFile")}</span>
      {file && <span className="file-size mono">{fmtBytes(file.size)}</span>}
      {wrong && <span className="file-warn">{tr("set.fileNameHint")} {hint}</span>}
    </div>
  );
}

/* The device's log, as plain text. It's append-only, so the view stays pinned to
   the newest line unless the reader has scrolled up to look at something. */
function SystemLogTab({ loggedIn, t }) {
  const tr = t || ((k) => k);
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState("idle");
  const [errMsg, setErrMsg] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [follow, setFollow] = React.useState(true);
  const boxRef = React.useRef(null);

  const load = React.useCallback(async () => {
    setState((p) => (p === "ok" ? "ok" : "loading"));
    try {
      const res = await fetch("/grism/get_log", { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setText(await res.text());
      setState("ok"); setUpdatedAt(new Date()); setErrMsg("");
    } catch (e) { setState("error"); setErrMsg(String(e.message || e)); }
  }, []);
  React.useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);
  React.useLayoutEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [text, follow]);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;
  const lines = text ? text.replace(/\s+$/, "").split("\n") : [];

  return (
    <div className="sys-wrap">
      <div className="sys-head">
        <h2 className="sys-title">{tr("log.title")}<span className="sys-card-metric">{lines.length}</span></h2>
        <div className="sys-controls">
          {updatedAt && <span className="sys-updated">{tr("tf.updated")} {updatedAt.toLocaleTimeString()}</span>}
          <label className="tf-interval"><input type="checkbox" checked={follow}
            onChange={(e) => setFollow(e.target.checked)} /> {tr("log.follow")}</label>
          <button className="sys-refresh" onClick={load} disabled={state === "loading"}>
            {state === "loading" ? tr("sys.refreshing") : tr("sys.refresh")}</button>
        </div>
      </div>
      {state === "error" && <div className="sys-err">{tr("tf.loadFailed")}: {errMsg}</div>}
      <pre className="syslog-box" ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // stop following as soon as the reader scrolls away from the end
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}>
        {lines.length ? text : <span className="dim">{tr("log.empty")}</span>}
      </pre>
    </div>
  );
}

/* An index of the cards on the settings section you are looking at.

   Sections run to seven cards, and the one you came for is usually below the
   fold. Rather than tag every card in the JSX with an id, read the headings
   back out of the rendered page -- they are the same strings the chips need,
   and no card has to remember to register itself. */
function CardJump({ rootRef, section }) {
  const [titles, setTitles] = React.useState([]);
  const stripRef = React.useRef(null);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const heads = () => [...root.querySelectorAll(".sys-card > .sys-card-title, .set-card > .set-card-head")];
    const read = () => {
      const next = heads().map((n) => {
        const h = n.querySelector("h3") ?? n;
        // the heading carries trimmings -- "M0 role: management", a metric --
        // and the chip wants the name on its own
        const extra = h.querySelector(".set-role, .sys-card-metric");
        return (extra ? h.textContent.replace(extra.textContent, "") : h.textContent).trim();
      });
      // bail when nothing moved, or the observer below re-fires on our own render
      setTitles((prev) => prev.length === next.length && prev.every((x, i) => x === next[i]) ? prev : next);
    };
    read();
    const mo = new MutationObserver((recs) => {
      if (recs.every((r) => stripRef.current?.contains(r.target))) return;
      read();
    });
    // characterData too: switching language rewrites each heading's text node in
    // place, which emits no childList records at all, and the chips would keep
    // the old language forever
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [rootRef, section]);

  /* The strip wraps to more rows as the window narrows, so the offset a jump has
     to clear is not a constant. Publish the measured height for the CSS. */
  React.useEffect(() => {
    // measure the whole sticky block (page header + chips), since that is what
    // a jumped-to card has to clear
    const strip = stripRef.current?.closest(".set-sticky") ?? stripRef.current;
    const root = rootRef.current;
    if (!strip || !root) return;
    const publish = () => root.style.setProperty("--cj-h", strip.offsetHeight + "px");
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(strip);
    return () => { ro.disconnect(); root.style.removeProperty("--cj-h"); };
  }, [rootRef, titles.length]);

  if (titles.length < 3) return null;      // a short section indexes itself
  const jump = (i) => {
    const head = [...(rootRef.current?.querySelectorAll(".sys-card > .sys-card-title, .set-card > .set-card-head") ?? [])][i];
    const card = head?.closest(".sys-card, .set-card");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.remove("jump-hit");
    void card.offsetWidth;                 // restart the animation on a repeat click
    card.classList.add("jump-hit");
  };
  return (
    <div className="card-jump" ref={stripRef}>
      {titles.map((title, i) => (
        <button key={title + i} className="cj-chip" onClick={() => jump(i)}>{title}</button>
      ))}
    </div>
  );
}

/* A VPort problem in words. */
function vportProblemText(p, tr) {
  if (!p) return "";
  if (p.kind === "noName") return tr("set.vpErrNoName");
  if (p.kind === "badName") return tr("set.vpErrBadName");
  if (p.kind === "duplicate") return `${tr("set.vpErrDup")} ${p.name}`;
  if (p.kind === "noPorts") return tr("set.vpErrNoPorts");
  if (p.kind === "unknownPort") return `${tr("set.sdwanUnknownPort")} ${p.port}`;
  if (p.kind === "badVlan") return tr("set.vpErrVlan");
  return "";
}

function SettingsTab({ loggedIn, t, portOptions = DEFAULT_PORTS, filterIds = [], onSignedOut, onUseTemplate }) {
  const tr = t || ((k) => k);
  const [raw, setRaw] = React.useState("");
  const [ifaces, setIfaces] = React.useState([]);
  const [state, setState] = React.useState("idle");     // idle | loading | ok | error
  const [errMsg, setErrMsg] = React.useState("");
  const [submit, setSubmit] = React.useState({ state: "idle", msg: "" }); // idle|sending|ok|error
  const [confirm, setConfirm] = React.useState(null);   // { kind:"ip", iface } | { kind:"xml" }
  const [section, setSection] = React.useState("system");  // system | ports | raw
  // interface (port) settings: values as the device reports them, plus the edits
  const [portsBase, setPortsBase] = React.useState(null);
  const [ports, setPorts] = React.useState(null);
  // system / packet-handling / services sections, each with an untouched baseline
  const [sysBase, setSysBase] = React.useState(null);
  const [sys, setSys] = React.useState(null);        // { timeServer, timeServer2, resolveNameServer, ... }
  const [zones, setZones] = React.useState([]);      // available timezone names
  const [zone, setZone] = React.useState("");
  const [zoneBase, setZoneBase] = React.useState("");
  const [svcBase, setSvcBase] = React.useState(null);
  const [svc, setSvc] = React.useState(null);
  const [community, setCommunity] = React.useState("");
  const [communityBase, setCommunityBase] = React.useState("");
  const [extras, setExtras] = React.useState(null);      // xmlrpc / backup service settings
  const [extrasBase, setExtrasBase] = React.useState(null);
  const [hb, setHb] = React.useState(null);              // heartbeat settings
  const [hbBase, setHbBase] = React.useState(null);
  const [hbRows, setHbRows] = React.useState([]);   // status rows lined up with targets
  const [lg, setLg] = React.useState(null);        // NetFlow / syslog / DPI logging
  const [lgBase, setLgBase] = React.useState(null);
  const [rawCfg, setRawCfg] = React.useState(null);   // for the port pickers
  // LAN bypass: only some models have the relays, so the section appears only
  // when the config says so. null = not read yet, true/false = the relay state.
  /* pair number -> true | false. A pair missing from the map is one the device
     would not report: some T12S units have no bypass board, and there is
     nothing to show or offer for those ports. */
  const [bypass, setBypass] = React.useState({});
  const [bypassBusy, setBypassBusy] = React.useState(0);
  const [bypassErr, setBypassErr] = React.useState("");
  /* The model decides whether this device has bypass relays at all, and the
     nav entry has to be right before any section is opened -- rawCfg is only
     filled once one of the sections that needs it has loaded. getConfig caches,
     so asking here costs nothing. */
  const [devModel, setDevModel] = React.useState("");
  const bypassHw = React.useMemo(() => bypassSupport(devModel), [devModel]);
  // port name -> the pair it is wired into, so the interfaces table can say so
  const bypassPairOf = React.useMemo(() => {
    const map = {};
    (bypassHw?.pairs ?? []).forEach((pair) => pair.ports.forEach((n) => { map[n] = pair.n; }));
    return map;
  }, [bypassHw]);

  const loadBypass = React.useCallback(async (hw) => {
    if (!hw) return;
    const next = {};
    for (const pair of hw.pairs) {
      try {
        const res = await fetch(bypassStatusUrl(hw.key, pair.n), { credentials: "include" });
        if (!res.ok) continue;                 // a unit built without the bypass board
        const state = parseBypassStatus(await res.text());
        if (state !== null) next[pair.n] = state;
      } catch { /* leave it out, same as a refusal */ }
    }
    setBypass(next);
  }, []);

  /* ---- T12S port speed (1G/10G, four ports per QLM) ------------------
     The mode lives in the U-Boot environment, so it only takes effect at the
     next boot and the device reboots itself right after accepting it. That is
     why this is a switch of its own rather than one of the staged port fields:
     those wait for Apply, this one takes the machine down. */
  const hasSpeed = React.useMemo(() => hasSpeedSwitch(devModel), [devModel]);
  const speeds = React.useMemo(() => t12sSpeeds(rawCfg), [rawCfg]);
  const [spDraft, setSpDraft] = React.useState({});
  // Re-seed when the device's own speeds arrive or change, so the page that comes
  // back after the reboot shows what the device now reports, not the old draft.
  const spKey = JSON.stringify(speeds);
  React.useEffect(() => { setSpDraft(JSON.parse(spKey)); }, [spKey]);
  const spChanged = React.useMemo(
    () => T12S_SPEED_GROUPS.filter((g) => speeds[g.qlm] && spDraft[g.qlm] &&
      spDraft[g.qlm] !== speeds[g.qlm]),
    [speeds, spDraft]);

  /* All the changed groups go in one request: each one costs a reboot, and
     sending them one at a time would cost three. The endpoint leaves any group
     it is not told about alone. */
  const submitSpeed = async () => {
    if (!spChanged.length) return;
    setSubmit({ state: "sending", msg: "" });
    const body = new URLSearchParams();
    for (const g of spChanged) body.set(g.qlm, spDraft[g.qlm]);
    let ok = false;
    try {
      const res = await fetch("/grism/task/set_t12s_speed", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      ok = res.ok;
      if (!ok) setSubmit({ state: "error", msg: (await res.text()).trim() || ("HTTP " + res.status) });
    } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
    if (!ok) return;
    setSubmit({ state: "idle", msg: "" });
    // Hold the page the way a firmware update does: the reboot follows within a
    // second, and a user left on a live-looking page would read the stale ports
    // table as the change having done nothing.
    setWait({ title: tr("set.speedApplying"), body: tr("set.speedApplyingBody"),
      phase: "updating", phaseKey: "set.spPhase." });
  };


  const setBypassMode = async (hw, pair, on) => {
    setBypassBusy(pair.n); setBypassErr("");
    try {
      const body = new URLSearchParams(); body.set("data", on ? "1" : "0");
      const res = await fetch(bypassModeUrl(hw.key, pair.n), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // read it back rather than assuming: the relay is what matters, not the
      // request, and on a T12S the two can differ
      await loadBypass(hw);
    } catch (e) {
      setBypassErr(String(e.message || e));
    } finally { setBypassBusy(0); }
  };
  const [views, setViews] = React.useState(null);     // RADIUS / TACACS+ login
  const [viewsBase, setViewsBase] = React.useState(null);
  const [fsList, setFsList] = React.useState(null);   // traffic service catalogue
  const [copied, setCopied] = React.useState(false);
  const [editingRaw, setEditingRaw] = React.useState(false);
  const [rawBase, setRawBase] = React.useState("");   // text as it was before editing
  // checked as you type, so a mistake is visible before you reach for a button
  // submit_config takes a <configSet>; a run.xml pasted in here is well-formed
  // and would otherwise have been sent to the device unchanged.
  const rawErr = React.useMemo(() => (raw.trim() ? rootElementError(raw, "configSet") : ""), [raw]);
  const [backupUrl, setBackupUrl] = React.useState("");
  const [restoreFile, setRestoreFile] = React.useState(null);
  const [fwFile, setFwFile] = React.useState(null);
  const [fw, setFw] = React.useState({ model: "", version: "", available: "", checked: false });
  const [dl, setDl] = React.useState(null);          // firmware download progress
  const [dlErr, setDlErr] = React.useState("");      // why it stopped, if it did
  const [fwChecking, setFwChecking] = React.useState(false);

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

  // Port settings need both sources: get_config holds the editable values, the
  // statistics feed holds the live link state. Keep an untouched copy so we can
  // tell what the user changed and submit only that.
  // Several sections read the same get_config body, and the effect below can fire
  // again while a load is still in flight. Share one request: callers awaiting the
  // same fetch get the same promise, and only an explicit refresh starts a new one.
  const cfgReq = React.useRef(null);
  const getConfig = React.useCallback((fresh = false) => {
    if (fresh || !cfgReq.current) {
      cfgReq.current = fetch("/grism/task/get_config", { credentials: "include" })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .catch((e) => { cfgReq.current = null; throw e; });
    }
    return cfgReq.current;
  }, []);

  /* Hardware addresses for the interface table. Read once per visit: they are
     burned into the port, not a live counter. */
  const [portMacs, setPortMacs] = React.useState({});
  React.useEffect(() => {
    if (!loggedIn || section !== "ports") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_port_mac", { credentials: "include" });
        if (res.ok && alive) setPortMacs(portMacMap(await res.json()));
      } catch { /* the column simply stays empty */ }
    })();
    return () => { alive = false; };
  }, [loggedIn, section]);

  const loadPorts = React.useCallback(async () => {
    try {
      const [cfg, statRes] = await Promise.all([
        getConfig(),
        fetch("/grism/task/get_statistics_json", { credentials: "include" }),
      ]);
      const stats = statRes.ok ? (await statRes.json()).statistics : [];
      const rows = mergePortStats(parseInterfacePorts(cfg), stats);
      setPortsBase(rows); setPorts(rows);
      setRawCfg(cfg);                       // the speed groups are read off the same body
    } catch (e) { warnFetch("interface settings", e); setPortsBase([]); setPorts([]); }
  }, []);
  React.useEffect(() => { if (loggedIn && section === "ports" && !ports) loadPorts(); }, [loggedIn, section, ports, loadPorts]);

  // System + packet-handling settings all come out of get_config's <args> and
  // <filters>; the timezone list and SNMP community have endpoints of their own.
  const SYS_ARGS = ["timeServer", "timeServer2", "resolveNameServer", "resolveNameServer2",
    "grel2CorrelationPort", "vxlanCorrelationPort", "encapsulationEncryptKeyTimeout",
    "deduplicationPorts", "s1apItemsClearIdleCron", "s1apItemsClearIdleMax"];
  const PKT_ARGS = ["deduplication", "ipFragmentCorrelation", "tcpSegmentDataReassemble", "sctpDataChunkReconstruct", "tryRunXmltoGdp",
    "grel2Correlation", "vxlanCorrelation", "encapsulationEncrypt",
    "s1cCorrelation", "flowExtensionGtpTunnelhdr"];
  const TUNNELS = ["GTP", "GRE", "IPV4", "VXLAN", "MPLS_IN_UDP", "MPLS_IN_GRE", "L2MPLS_IN_UDP", "L2MPLS_IN_GRE"];
  const busy = React.useRef({});
  const loadSys = React.useCallback(async () => {
    if (busy.current.sys) return; busy.current.sys = true;
    try {
      const cfg = await getConfig();
      const a = cfg.args ?? {}, t = cfg.filters?.["in-tunnels"] ?? {};
      const shaped = { ...parseFlowArgs(cfg) };
      shaped.statisticsFlowService = a.statisticsFlowService ?? "";
      setFsList(parseFlowServices(shaped.statisticsFlowService));
      SYS_ARGS.forEach((k) => { shaped[k] = a[k] ?? ""; });
      PKT_ARGS.forEach((k) => { shaped[k] = a[k] === true; });
      TUNNELS.forEach((k) => { shaped["tun_" + k] = t[k] === true; });
      setSysBase(shaped); setSys(shaped);
    } catch (e) { warnFetch("system settings", e); setSysBase({}); setSys({}); }
    finally { busy.current.sys = false; }
  }, [getConfig]);
  const loadZones = React.useCallback(async () => {
    if (busy.current.zones) return; busy.current.zones = true;
    try {
      const res = await fetch("/grism/get_time_zone", { credentials: "include" });
      if (res.ok) {
        const payload = await res.json();
        setZones(parseTimezones(payload));
        // the entry flagged with 1 is the zone the device is currently using
        const cur = currentTimezone(payload);
        setZone(cur); setZoneBase(cur);
      }
    } catch (e) { warnFetch("timezone list", e); }
    finally { busy.current.zones = false; }
  }, []);
  const loadServices = React.useCallback(async () => {
    try {
      const cfg = await getConfig();
      const list = parseServices(cfg);
      setSvcBase(list); setSvc(list);
      const ex = parseServiceExtras(cfg);
      setExtrasBase(ex); setExtras(ex);
    } catch (e) { warnFetch("services", e); setSvcBase([]); setSvc([]); }
    try {
      const res = await fetch("/grism/get_snmp_read_community", { credentials: "include" });
      if (res.ok) { const v = (await res.text()).trim(); setCommunity(v); setCommunityBase(v); }
    } catch (e) { warnFetch("SNMP community", e); }
  }, []);
  React.useEffect(() => {
    if (!loggedIn) return;
    if ((section === "system" || section === "packet") && !sys) loadSys();
    // Zones are their own endpoint and must not hang off `sys`: visiting the packet
    // page first loads `sys`, and the system page would then never fetch them.
    if (section === "system" && zones.length === 0) loadZones();
    if (section === "services" && !svc) loadServices();
  }, [loggedIn, section, sys, svc, zones.length, loadSys, loadZones, loadServices]);

  /* What each service says it is. grism answers over the RPC, so it is the
     running binary speaking; the rest are what the device can tell us. */
  const [svcVersions, setSvcVersions] = React.useState({});
  React.useEffect(() => {
    if (!loggedIn || section !== "services") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_service_versions", { credentials: "include" });
        if (res.ok && alive) setSvcVersions(await res.json());
      } catch { /* the column simply stays empty */ }
    })();
    return () => { alive = false; };
  }, [loggedIn, section]);

  // model and running version for the firmware page
  React.useEffect(() => {
    if (!loggedIn || section !== "firmware" || fw.version) return;
    (async () => {
      try {
        const cfg = await getConfig();
        const r = await fetch("/grism/task/get_version", { credentials: "include" });
        const v = r.ok ? (await r.text()).trim().split("-")[0] : "";
        setFw((o) => ({ ...o, model: cfg?.args?.model ?? "", version: v }));
      } catch (e) { warnFetch("firmware version", e); }
    })();
  }, [loggedIn, section, fw.version, getConfig]);

  /* Ask the device to fetch the image, then poll until the byte counts agree. */
  const startDownload = React.useCallback((version) => {
    // Kick the transfer off and start watching straight away — the request itself
    // stays open for the whole download, so waiting on it would leave the progress
    // bar hidden until the file had already arrived.
    setDlErr("");
    fetch(`/grism/task/update_download?version=${encodeURIComponent(version)}`, { credentials: "include" })
      .then((res) => { if (!res.ok) { setDlErr("HTTP " + res.status); setDl(null); } })
      .catch((e) => { warnFetch("firmware download", e); setDlErr(String(e.message || e)); setDl(null); });
    setDl({ done: 0, total: 0, ratio: 0, complete: false });
  }, []);
  /* Key the poll on whether it should be running, not on the progress object:
     parseDownloadProgress returns a fresh literal every time, so depending on
     `dl` tore this effect down and rebuilt it on every answer -- and the rebuild
     calls poll() immediately, turning a once-a-second poll into back-to-back
     requests at whatever rate the device could answer. */
  const dlActive = !!dl && !dl.complete;
  React.useEffect(() => {
    if (!dlActive) return;
    let alive = true;
    let quiet = 0;                            // ticks with nothing to report
    const poll = async () => {
      try {
        const res = await fetch("/grism/task/update_download_check", { credentials: "include" });
        if (!res.ok) { if (alive) setDlErr("HTTP " + res.status); return; }
        if (!alive) return;
        const next = parseDownloadProgress(await res.text());
        // A download that never reports a byte is a download that is not
        // happening -- say so rather than sit at 0 B for as long as the tab is open.
        quiet = next.total > 0 ? 0 : quiet + 1;
        if (quiet >= 30) { setDlErr("no progress"); setDl(null); return; }
        setDl(next);
      } catch { /* transient — the next tick tries again */ }
    };
    poll();                                   // report progress without waiting a tick
    const id = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(id); };
  }, [dlActive]);

  const loadViews = React.useCallback(async () => {
    try {
      const parsed = parseViews(await getConfig());
      setViewsBase(parsed); setViews(parsed);
    } catch (e) { warnFetch("login authentication", e); }
  }, [getConfig]);
  React.useEffect(() => { if (loggedIn && section === "auth" && !views) loadViews(); }, [loggedIn, section, views, loadViews]);

  const loadHeartbeat = React.useCallback(async () => {
    try {
      const parsed = parseHeartbeat(await getConfig());
      setHbBase(parsed); setHb(parsed);
    } catch (e) { warnFetch("heartbeat settings", e); }
  }, []);
  // A snapshot is enough here — the live view lives on the Traffic → Sessions page.
  const loadHbStatus = React.useCallback(async (targets) => {
    try {
      const res = await fetch("/grism/task/get_heartbeat_status", { credentials: "include" });
      if (res.ok) setHbRows(heartbeatStatusRows(targets, parseHeartbeatStatus(await res.json())));
    } catch { /* status is optional decoration */ }
  }, []);
  React.useEffect(() => {
    if (!loggedIn || section !== "packet") return;
    if (!hb) loadHeartbeat();
  }, [loggedIn, section, hb, loadHeartbeat]);
  /* The status read is about the targets the device has, not about what is
     being typed into the form. Keyed on `hb` it fired one request per keystroke;
     hbBase only changes when the settings are loaded or applied. */
  React.useEffect(() => {
    if (!loggedIn || section !== "packet" || !hbBase) return;
    loadHbStatus(hbBase.targets);
  }, [loggedIn, section, hbBase, loadHbStatus]);

  const loadLogging = React.useCallback(async () => {
    try {
      const cfg = await getConfig();
      setRawCfg(cfg);                       // port lists come from the same body
      const parsed = parseLogging(cfg);
      setLgBase(parsed); setLg(parsed);
    } catch (e) { warnFetch("logging settings", e); }
  }, []);
  React.useEffect(() => {
    // the packet page shows the flow timeouts, which are stored inside <netflow>
    if (loggedIn && (section === "logging" || section === "packet") && !lg) loadLogging();
  }, [loggedIn, section, lg, loadLogging]);
  const lgDirty = lg && lgBase && JSON.stringify(lg) !== JSON.stringify(lgBase);
  // every exporter keeps its targets the same way heartbeat does: adding reuses the
  // first disabled slot, removing switches a slot off
  const setLgTargets = (path, fn) => setLg((o) => {
    const next = structuredClone(o);
    const node = path === "netflow" ? next.netflow : path === "syslog" ? next.syslog : next[path];
    node.targets = fn(node.targets);
    return next;
  });

  const setHbField = (k, v) => setHb((o) => ({ ...o, [k]: v }));
  const setHbTarget = (i, patch) => setHb((o) => ({ ...o, targets: o.targets.map((t, j) => j === i ? { ...t, ...patch } : t) }));
  const hbDirty = hb && hbBase && JSON.stringify(hb) !== JSON.stringify(hbBase);

  const setSysField = (k, v) => setSys((o) => ({ ...o, [k]: v }));
  const sysDirty = (keys) => sys && sysBase && keys.some((k) => sys[k] !== sysBase[k]);

  // Two settings use plain form posts rather than a configSet.
  const submitForm = async (url, field, value, after) => {
    setSubmit({ state: "sending", msg: "" });
    try {
      const body = new URLSearchParams(); body.set(field, value);
      const res = await fetch(url, { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setSubmit({ state: "ok", msg: "" });
      after?.();
      setTimeout(() => setSubmit({ state: "idle", msg: "" }), 2500);
    } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
  };

  // The device stops responding as it powers down, so a network error here is the
  // expected outcome rather than a failure to report.
  const [powered, setPowered] = React.useState(null);   // "reboot" | "halt" once requested
  // { title, body, phase } while the device installs and restarts.
  // A clock would only ever be a guess: how long an image takes to apply varies,
  // and the number keeps counting after the device is already back. Report what
  // we can actually observe instead — whether the device answers.
  //   updating  : still reachable, so it is applying the image
  //   rebooting : stopped answering, so it is on its way down or coming back up
  //   done      : answering again, but only after we saw it go away
  /* Internal accounts. Only some firmware serves these endpoints — a 404 puts the
     card into an unsupported state rather than showing controls that cannot work. */
  const [users, setUsers] = React.useState(null);          // null = not loaded yet
  const [acctErr, setAcctErr] = React.useState("");
  const [acctOk, setAcctOk] = React.useState("");
  const [newUser, setNewUser] = React.useState({ name: "", pass: "", confirm: "" });
  const [pw, setPw] = React.useState({ old: "", next: "", confirm: "" });
  const [acctBusy, setAcctBusy] = React.useState(false);
  /* Who the device says we are. The X-PacketX-Username cookie is HttpOnly, so
     document.cookie cannot see it — ask the endpoint instead. Null means unknown,
     and the password form stays disabled rather than guessing an account. */
  const [me, setMe] = React.useState(null);

  /* Changing your own password ends the session on the device, so the reply can
     be a success or an Unauthorized for the very same outcome — the credentials
     the request was authenticated with stopped being valid partway through.
     Either way the password changed and this session is gone, so sign out here
     instead of leaving a page whose every later call will fail. */
  const changeOwnPassword = async (oldPass, nextPass) => {
    setAcctBusy(true); setAcctErr(""); setAcctOk("");
    try {
      const res = await fetch("/change_password", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Username: me,
          OldPasswordHash: await sha256Hex(oldPass),
          NewPasswordHash: await sha256Hex(nextPass),
        }),
      });
      const text = (await res.text().catch(() => "")).trim();
      const sessionEnded = res.status === 401 || /unauthor/i.test(text);
      if (!res.ok && !sessionEnded) throw new Error(text.slice(0, 120) || "HTTP " + res.status);
      onSignedOut?.(tr("set.acctChangedSignOut"));
    } catch (e) { setAcctErr(String(e.message || e)); }
    finally { setAcctBusy(false); }
  };

  const loadUsers = React.useCallback(async () => {
    setAcctErr("");
    try {
      const res = await fetch("/list_user", { credentials: "include" });
      if (!res.ok) {
        const key = accountsErrorKey(res.status);
        throw new Error(key ? tr(key) : "HTTP " + res.status);
      }
      setUsers(parseUserList(await res.text()));
      try {
        const who = await fetch("/grism/task/get_current_user", { credentials: "include" });
        setMe(who.ok ? (extractUsername(await who.text()) || null) : null);
      } catch { setMe(null); }
    } catch (e) { setUsers([]); setAcctErr(String(e.message || e)); }
  }, []);

  /* Each account call posts JSON; on success reload the list rather than patching
     it here, so what is shown is what the device actually holds. */
  const acctPost = async (url, body, okKey) => {
    setAcctBusy(true); setAcctErr(""); setAcctOk("");
    try {
      const res = await fetch(url, { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(text.trim().slice(0, 120) || "HTTP " + res.status);
      setAcctOk(tr(okKey));
      setTimeout(() => setAcctOk(""), 4000);
      await loadUsers();
      return true;
    } catch (e) { setAcctErr(String(e.message || e)); return false; }
    finally { setAcctBusy(false); }
  };

  // Below the state, not beside loadViews: the dependency array reads `users`,
  // which render evaluates in place — declared later, that is a TDZ error and the
  // whole Settings tab fails to render.
  React.useEffect(() => {
    if (!loggedIn) { setDevModel(""); return; }
    getConfig().then((cfg) => setDevModel(String((cfg.args && cfg.args.model) || cfg.model || "")))
      .catch(() => setDevModel(""));
  }, [loggedIn, getConfig]);
  // read the relays once when either section opens; they do not move on their own
  React.useEffect(() => {
    if (loggedIn && bypassHw && section === "ports") loadBypass(bypassHw);
  }, [loggedIn, section, bypassHw, loadBypass]);
  React.useEffect(() => { if (loggedIn && section === "auth" && users === null) loadUsers(); },
    [loggedIn, section, users, loadUsers]);

  const [wait, setWait] = React.useState(null);
  const waitPhase = wait?.phase;
  React.useEffect(() => {
    if (!waitPhase || waitPhase === "done") return;
    let alive = true;
    /* One failed read is not the device going away. Applying an image rewrites
       scripts/pywww underneath a running manage.py, which reloads and answers
       500 (or refuses the connection) for a few seconds -- and a single such
       tick used to be enough to call the device "rebooting", so the very next
       success declared the update complete while it was still flashing. Only a
       run of failures long enough to outlast that reload counts as gone. */
    const DOWN_TICKS = 3;                     // × 2s, comfortably past a reload
    let downRun = 0;
    const ping = async () => {
      let up = false;
      try {
        // no-store: a cached 200 would read as "back up" while it is still down
        const res = await fetch("/grism/task/get_version", { credentials: "include", cache: "no-store" });
        up = res.ok;
      } catch { up = false; }
      if (!alive) return;
      downRun = up ? 0 : downRun + 1;
      const goneFor = downRun;
      setWait((w) => {
        if (!w || w.phase === "done") return w;
        if (!up) {
          return (goneFor >= DOWN_TICKS && w.phase !== "rebooting") ? { ...w, phase: "rebooting" } : w;
        }
        // Reachable only means finished if it had gone away first. The device is
        // still answering for the first moments of an update, and treating that
        // as success would flash "complete" before anything had happened.
        return w.phase === "rebooting" ? { ...w, phase: "done" } : w;
      });
    };
    ping();
    const id = setInterval(ping, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [waitPhase]);

  /* POST a file and then hold the page while the device restarts. */
  const uploadAndWait = async (url, file, field, title, body) => {
    setSubmit({ state: "sending", msg: "" });
    // Hold the page from the moment the upload starts, not after it returns. A
    // firmware image is tens of megabytes: waiting for the POST left the UI live
    // for the whole transfer, and a device that closed the connection while
    // applying landed in the catch below, so the overlay never appeared at all.
    setWait({ title, body, phase: "updating" });
    try {
      const fd = new FormData(); fd.append(field, file, file.name);
      const res = await fetch(url, { method: "POST", credentials: "include", body: fd });
      // A real HTTP status means the device answered and refused: drop the hold
      // and show why. A thrown fetch means the connection went away, which for
      // these endpoints usually means it is already restarting — keep holding.
      if (!res.ok) { setWait(null); throw new Error("HTTP " + res.status); }
      setSubmit({ state: "idle", msg: "" });
    } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
  };
  const submitPower = async (url, kind) => {
    setSubmit({ state: "sending", msg: "" });
    /* Same rule as uploadAndWait: a real HTTP status means the device answered
       and refused -- pywww returns 401 for a guest or a read-only account -- so
       show why instead of locking the page behind "restarting" for a restart
       that will never happen. A thrown fetch means the connection went away,
       which for these two endpoints means it is already on its way down. */
    try {
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) { setSubmit({ state: "error", msg: "HTTP " + res.status }); return; }
    } catch { /* connection dropped -- the device is going */ }
    setSubmit({ state: "idle", msg: "" });
    setPowered(kind);
  };

  // Flow settings straddle two places in the config: the on/off switches and table
  // sizes sit in <args>, the timeouts inside <netflow>. Send both, in order.
  const submitConfigs = async (xmls) => {
    setSubmit({ state: "sending", msg: "" });
    try {
      for (const xmlText of xmls) {
        const body = new URLSearchParams(); body.set("data", xmlText);
        const res = await fetch("/grism/task/submit_config", { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        if (!res.ok) throw new Error("HTTP " + res.status);
      }
      setSubmit({ state: "ok", msg: "" });
      getConfig(true); setPorts(null); setSys(null); setSvc(null); setHb(null); setLg(null);
      setTimeout(() => setSubmit({ state: "idle", msg: "" }), 2500);
    } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
  };

  const submitConfig = async (xmlText) => {
    setSubmit({ state: "sending", msg: "" });
    try {
      const body = new URLSearchParams(); body.set("data", xmlText);
      const res = await fetch("/grism/task/submit_config", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setSubmit({ state: "ok", msg: "" });
      getConfig(true); setPorts(null); setSys(null); setSvc(null); setHb(null); setLg(null); setViews(null);   // re-read so baselines match
      setTimeout(() => setSubmit({ state: "idle", msg: "" }), 2500);
    } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
  };

  /* ---- virtual ports ------------------------------------------------
     Staged: rows to add and names to delete are collected and sent as one
     configSet, because applying it reboots the device. */
  const vports = React.useMemo(() => parseVports(rawCfg), [rawCfg]);
  const [vpAdds, setVpAdds] = React.useState([]);
  const [vpDeletes, setVpDeletes] = React.useState([]);
  // a reload of the device config invalidates a draft built against the old one
  const vpKey = React.useMemo(() => vports.map((v) => v.name).join(","), [vports]);
  React.useEffect(() => { setVpAdds([]); setVpDeletes([]); }, [vpKey]);
  const setVpAdd = (i, patch) => setVpAdds((rows) => rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const vpDirty = vpAdds.length > 0 || vpDeletes.length > 0;
  const vpProblems = React.useMemo(() => vportProblems({
    adds: vpAdds, deletes: vpDeletes, existing: vports,
    devicePorts: dataPortNames(rawCfg, { includeLoop: true }),
  }), [vpAdds, vpDeletes, vports, rawCfg]);

  /* Write a configSet, then restart, holding the screen until the device is
     back. Two steps rather than configSet reboot="yes": with the reboot inside
     the write, a write that failed and a device that went down look the same
     from here. Used by anything the firmware only picks up at startup. */
  const submitAndReboot = async (xml, { title, body: bodyText, phaseKey }) => {
    setSubmit({ state: "sending", msg: "" });
    const body = new URLSearchParams();
    body.set("data", xml);
    try {
      const res = await fetch("/grism/task/submit_config", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) {
        setSubmit({ state: "error", msg: (await res.text()).trim() || ("HTTP " + res.status) });
        return;
      }
    } catch (e) {
      setSubmit({ state: "error", msg: String(e.message || e) });
      return;
    }
    setSubmit({ state: "idle", msg: "" });
    setWait({ title, body: bodyText, phase: "updating", phaseKey });
    // the restart is its own request; it may not answer, which is expected
    try { await fetch("/grism/task/reboot", { method: "POST", credentials: "include" }); }
    catch { /* the device is already on its way down */ }
  };

  const submitVports = () => submitAndReboot(buildVportConfigSet({ adds: vpAdds, deletes: vpDeletes }),
    { title: tr("set.vportApplying"), body: tr("set.vportApplyingBody"), phaseKey: "set.vpPhase." });

  /* Only an enable flag needs the restart: descriptions are picked up live. */
  const portEnableChanged = React.useMemo(() => {
    const base = new Map((portsBase ?? []).map((p) => [p.name, p]));
    return (ports ?? []).some((p) => base.has(p.name) && !!base.get(p.name).enable !== !!p.enable);
  }, [portsBase, ports]);

  const pageRef = React.useRef(null);
  /* A new section starts at its first card. The page owns the scroll, so
     switching sections used to leave it wherever the last one had been read
     down to -- landing halfway into a set of cards the user had not seen. */
  React.useEffect(() => { if (pageRef.current) pageRef.current.scrollTop = 0; }, [section]);

  /* The card straddles <args> and <filters><in-tunnels>, so its dirty check has
     to cover both -- sysDirty alone would miss a decap flag being flipped. */
  /* Same shape as the SD-WAN check: the MEC card straddles <args> and the GTP
     flag under <filters><in-tunnels>, so both have to count as dirty. */
  const mecDirty = () =>
    [...MEC_ARG_KEYS, "tun_GTP"].some((k) => (sys[k] ?? "") !== (sysBase[k] ?? ""));

  const sdwanDirty = () =>
    [...SDWAN_ARG_KEYS, "tun_GRE", "tun_VXLAN"].some((k) => (sys[k] ?? "") !== (sysBase[k] ?? ""));

  const setIfaceField = (idx, k, v) => setIfaces((arr) => arr.map((it, i) => i === idx ? { ...it, fields: { ...it.fields, [k]: v } } : it));

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("set.needLogin")}</div></div>;

  return (
    /* set-page scopes the card styling to this tab: System status shares
       .sys-wrap and .sys-card but wants its own compact look */
    <div className="sys-wrap set-page" ref={pageRef}>
      {/* The section switcher and the re-read button are how you move around
          this page, so they follow the scroll rather than being left at the top
          of it -- together with the card index, as one block. */}
      <div className="set-sticky">
      <div className="sys-head">
        <h2 className="sys-title">{tr("set.title")}</h2>
        <div className="sys-controls">
          <div className="set-seg">
            <button className={section === "system" ? "on" : ""} onClick={() => setSection("system")}>{tr("set.system")}</button>
            <button className={section === "ports" ? "on" : ""} onClick={() => setSection("ports")}>{tr("set.interfaces")}</button>
            <button className={section === "packet" ? "on" : ""} onClick={() => setSection("packet")}>{tr("set.packet")}</button>
            <button className={section === "auth" ? "on" : ""} onClick={() => setSection("auth")}>{tr("set.auth")}</button>
            <button className={section === "logging" ? "on" : ""} onClick={() => setSection("logging")}>{tr("set.logging")}</button>
            <button className={section === "services" ? "on" : ""} onClick={() => setSection("services")}>{tr("set.services")}</button>
            <button className={section === "backup" ? "on" : ""} onClick={() => setSection("backup")}>{tr("set.backup")}</button>
            <button className={section === "firmware" ? "on" : ""} onClick={() => setSection("firmware")}>{tr("set.firmware")}</button>
            <button className={section === "raw" ? "on" : ""} onClick={() => setSection("raw")}>{tr("set.rawXml")}</button>
          </div>
          {/* refresh whichever section is on screen — they read different endpoints */}
          <button className="sys-refresh" disabled={state === "loading"}
            onClick={() => {
              getConfig(true);          // refresh means re-read, not reuse the cache
              if (section === "ports") { setPorts(null); loadPorts(); }
              else if (section === "system" || section === "packet") {
                setSys(null); loadSys();
                // the management addresses are parsed out of the raw config
                if (section === "system") { setZones([]); loadZones(); setEditingRaw(false); load(); }
                if (section === "packet") { setHb(null); loadHeartbeat(); }
              }
              else if (section === "services") { setSvc(null); loadServices(); }
              else if (section === "logging") { setLg(null); loadLogging(); }
              else if (section === "auth") { setViews(null); loadViews(); }
              else { setEditingRaw(false); load(); }
            }}>
            {state === "loading" ? tr("set.loading") : tr("set.load")}</button>
        </div>
      </div>

      <CardJump rootRef={pageRef} section={section} />
      </div>

      {state === "error" && <div className="sys-err">{tr("set.loadFailed")}: {errMsg}</div>}
      {submit.state === "error" && <div className="sys-err">{tr("set.submitFailed")}: {submit.msg}</div>}
      {submit.state === "ok" && <div className="set-ok-banner">{tr("set.applied")}</div>}

      {section === "ports" && (
        <div className="set-ports">
          <p className="page-note">{tr("set.portsNote")}</p>
          {!ports ? <p className="sys-note dim">{tr("set.loading")}</p> : (
            <>
              <div className="tf-table-wrap">
                <table className="tf-table">
                  <thead><tr>
                    <th className="tf-num">{tr("set.ifidx")}</th><th>{tr("set.port")}</th>
                    <th>{tr("set.portMac")}</th>
                    <th>{tr("tf.link")}</th><th>{tr("tf.speed")}</th>
                    <th>{tr("tf.desc")}</th><th>{tr("set.enabled")}</th>
                  </tr></thead>
                  <tbody>
                    {ports.map((p, i) => (
                      <tr key={p.name} className={p.enable ? "" : "port-off"}>
                        <td className="tf-num mono">{p.ifidx ?? "—"}</td>
                        <td className="tf-name">{p.name}
                          {bypassPairOf[p.name] !== undefined &&
                            bypass[bypassPairOf[p.name]] !== undefined && (() => {
                            const pair = bypassHw.pairs.find((x) => x.n === bypassPairOf[p.name]);
                            const on = bypass[pair.n];
                            /* A button, not one of the staged fields beside it: every other control
                               on this page waits for Apply, and this one moves a relay as soon as it
                               is confirmed. */
                            return (
                              <button className={"tf-bypass as-toggle" + (on === true ? "" : " idle")}
                                disabled={bypassBusy === pair.n}
                                title={on === true ? tr("tf.bypassTip") : tr("set.bypassPairTip")}
                                onClick={() => setConfirm({ kind: "bypass", pair, on })}>
                                {bypassBusy === pair.n ? tr("set.bypassWorking")
                                  : on === true ? tr("tf.bypass")
                                  : tr("set.bypassPair") + " " + pair.n}
                              </button>
                            );
                          })()}
                        </td>
                        <td className="mono">{portMacs[p.name] || <span className="dim">—</span>}</td>
                        <td>{p.linkUp == null ? <span className="dim">—</span>
                          : <span className={"tf-link " + (p.linkUp ? "up" : "down")}>{p.linkUp ? tr("tf.up") : tr("tf.down")}</span>}</td>
                        <td className="mono">{p.speed ? fmtSpeed(p.speed) : "—"}</td>
                        <td>
                          <input className="port-desc" value={p.description}
                            placeholder={tr("common.optional")}
                            onChange={(e) => setPorts((list) => list.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                        </td>
                        <td>
                          <input type="checkbox" checked={p.enable}
                            onChange={(e) => setPorts((list) => list.map((x, j) => j === i ? { ...x, enable: e.target.checked } : x))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* the switch is the part that costs a restart, so say it before
                  the button rather than in the dialog only */}
              {portEnableChanged && <p className="set-hint warn">{tr("set.portsNeedReboot")}</p>}
              <div className="set-actions">
                <span className="set-changed">{changedPorts(portsBase, ports).length > 0
                  ? `${changedPorts(portsBase, ports).length} ${tr("set.portsChanged")}` : ""}</span>
                <button className="copy-btn" disabled={changedPorts(portsBase, ports).length === 0}
                  onClick={() => setPorts(portsBase)}>{tr("set.revert")}</button>
                <button className="sys-refresh"
                  disabled={submit.state === "sending" || changedPorts(portsBase, ports).length === 0}
                  onClick={() => setConfirm({ kind: "ports" })}>
                  {submit.state === "sending" ? tr("set.submitting") : tr("set.applyPorts")}</button>
              </div>

                  {/* Only a T12S can retune its QLMs, and only in fours. A group whose
                      speed the config does not report is left out rather than shown as
                      an unknown that the switch would then have to guess at.

                      Staged like the ports table above rather than applied per click:
                      one reboot covers all three groups, so let the user pick
                      everything first and pay for it once. */}
                  {hasSpeed && T12S_SPEED_GROUPS.some((g) => speeds[g.qlm]) && (
                    <section className="sys-card set-speed">
                      <h3 className="sys-card-title">{tr("set.speedTitle")}</h3>
                      <p className="set-hint">{tr("set.speedNote")}</p>
                      {T12S_SPEED_GROUPS.filter((g) => speeds[g.qlm]).map((g) => {
                        const picked = spDraft[g.qlm] ?? speeds[g.qlm];
                        const moved = picked !== speeds[g.qlm];
                        return (
                          <div className={"sp-row" + (moved ? " changed" : "")} key={g.qlm}>
                            <span className="sp-ports mono">{g.ports.join(" · ")}</span>
                            {/* spell out what it is still running as until Apply */}
                            <span className="sp-was">{moved
                              ? `${formatPortSpeed(speeds[g.qlm])} → ${formatPortSpeed(picked)}` : ""}</span>
                            <span className="sp-seg">
                              {T12S_SPEEDS.map((sp) => (
                                <button key={sp}
                                  className={"sp-opt" + (picked === sp ? " on" : "")}
                                  disabled={submit.state === "sending"}
                                  onClick={() => setSpDraft((d) => ({ ...d, [g.qlm]: sp }))}>
                                  {formatPortSpeed(sp)}
                                </button>
                              ))}
                            </span>
                          </div>
                        );
                      })}
                      <div className="set-actions">
                        <span className="set-changed">{spChanged.length
                          ? `${spChanged.length} ${tr("set.speedChanged")}` : ""}</span>
                        <button className="copy-btn" disabled={!spChanged.length}
                          onClick={() => setSpDraft(speeds)}>{tr("set.revert")}</button>
                        <button className="sys-refresh"
                          disabled={submit.state === "sending" || !spChanged.length}
                          onClick={() => setConfirm({ kind: "speed" })}>
                          {submit.state === "sending" ? tr("set.submitting") : tr("set.speedApply")}</button>
                      </div>
                    </section>
                  )}

                  {/* Virtual ports. Added and removed together, because the
                      device reboots to apply the change and doing it one row at
                      a time would cost a reboot each. */}
                  <section className="sys-card set-vport">
                    <h3 className="sys-card-title">{tr("set.vport")}</h3>
                    <p className="set-hint">{tr("set.vportNote")}</p>
                    {vports.length === 0 && vpAdds.length === 0 && (
                      <p className="sys-note dim">{tr("set.vportNone")}</p>
                    )}
                    {vports.map((v) => {
                      const gone = vpDeletes.includes(v.name);
                      return (
                        <div className={"vp-row" + (gone ? " gone" : "")} key={v.name}>
                          <span className="vp-name mono">{v.name}</span>
                          <span className="vp-ports mono">{v.ports || "—"}</span>
                          <span className="vp-vlan">{v.vlanid ? "VLAN " + v.vlanid : tr("set.vportNoVlan")}</span>
                          <button className={"copy-btn" + (gone ? " on" : "")}
                            onClick={() => setVpDeletes((d) => gone ? d.filter((x) => x !== v.name) : [...d, v.name])}>
                            {gone ? tr("set.vportUndo") : tr("common.delete")}</button>
                        </div>
                      );
                    })}
                    {vpAdds.map((a, i) => {
                      const mine = vpProblems.filter((x) => x.row === i);
                      return (
                        <div className="vp-row new" key={"add" + i}>
                          <label className="vp-f"><span>{tr("set.vportName")}</span>
                            <input value={a.name} placeholder="V3"
                              onChange={(e) => setVpAdd(i, { name: e.target.value.trim() })} /></label>
                          <label className="vp-f wide"><span>{tr("set.vportPorts")}</span>
                            <input value={a.ports} placeholder="P6,P7"
                              onChange={(e) => setVpAdd(i, { ports: e.target.value })} /></label>
                          <label className="vp-f"><span>{tr("set.vportVlan")}</span>
                            <input value={a.vlanid} inputMode="numeric" placeholder={tr("common.optional")}
                              onChange={(e) => setVpAdd(i, { vlanid: e.target.value.trim() })} /></label>
                          <button className="icon-btn" aria-label={tr("common.delete")}
                            onClick={() => setVpAdds((rows) => rows.filter((_, j) => j !== i))}>✕</button>
                          {mine.length > 0 && <p className="set-hint err">{vportProblemText(mine[0], tr)}</p>}
                        </div>
                      );
                    })}
                    <div className="set-actions">
                      <button className="copy-btn"
                        onClick={() => setVpAdds((rows) => [...rows,
                          nextVport(rows.at(-1) ?? vports.at(-1))])}>
                        {tr("set.vportAdd")}</button>
                      <span className="set-changed">{vpDirty
                        ? `${vpAdds.length} ${tr("set.vportAdded")} · ${vpDeletes.length} ${tr("set.vportRemoved")}` : ""}</span>
                      <button className="copy-btn" disabled={!vpDirty}
                        onClick={() => { setVpAdds([]); setVpDeletes([]); }}>{tr("set.revert")}</button>
                      <button className="sys-refresh"
                        disabled={submit.state === "sending" || !vpDirty || vpProblems.length > 0}
                        onClick={() => setConfirm({ kind: "vport" })}>
                        {submit.state === "sending" ? tr("set.submitting") : tr("set.vportApply")}</button>
                    </div>
                  </section>
            </>
          )}
        </div>
      )}

      {section === "system" && (
        <div className="set-forms">
          {/* The management addresses come first: they are what a new box needs
              set before anything else on this page is reachable. One card with a
              row per interface rather than a card each -- three near-identical
              cards made the section look like it had three separate subjects,
              and gave the index three chips that all meant the same thing. */}
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.mgmtIP")}</h3>
            {ifaces.map((it, idx) => (
              <div className="mgmt-row" key={it.role}>
                <div className="mgmt-head">
                  <span className="mgmt-name">{it.fields.name || it.role}</span>
                  <span className="set-role">{tr("set.role")}: {it.role}</span>
                  <label className="set-enable"><input type="checkbox" checked={it.fields.enable === "True"}
                    onChange={(e) => setIfaceField(idx, "enable", e.target.checked ? "True" : "False")} /> {tr("set.enabled")}</label>
                </div>
                <div className="set-grid">
                  {[["ip","set.ip",false],["netmask","set.netmask",false],["gateway","set.gateway",false],["eth","set.eth",true]].map(([k, lbl, ro]) => (
                    <label className="set-field" key={k}><span>{tr(lbl)}</span>
                      {ro
                        ? <input className="ro" value={it.fields[k]} readOnly tabIndex={-1} />
                        : <input value={it.fields[k]} onChange={(e) => setIfaceField(idx, k, e.target.value)} />}
                    </label>
                  ))}
                </div>
                <div className="set-actions">
                  <button className="sys-refresh" disabled={submit.state === "sending"}
                    onClick={() => setConfirm({ kind: "ip", iface: it })}>
                    {submit.state === "sending" ? tr("set.submitting") : tr("set.applyIP")}</button>
                </div>
              </div>
            ))}
          </section>

          {!sys ? <p className="sys-note dim">{tr("set.loading")}</p> : (<>
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.timeServers")}</h3>
              <p className="set-hint">{tr("set.timeServersNote")}</p>
              <div className="set-grid">
                <label className="ml"><span>{tr("set.primary")}</span>
                  <input value={sys.timeServer ?? ""} placeholder="216.239.35.0"
                    onChange={(e) => setSysField("timeServer", e.target.value)} /></label>
                <label className="ml"><span>{tr("set.secondary")}</span>
                  <input value={sys.timeServer2 ?? ""} placeholder={tr("common.optional")}
                    onChange={(e) => setSysField("timeServer2", e.target.value)} /></label>
              </div>
              <div className="set-actions">
                <button className="sys-refresh" disabled={submit.state === "sending" || !sysDirty(["timeServer", "timeServer2"])}
                  onClick={() => setConfirm({ kind: "args", keys: ["timeServer", "timeServer2"] })}>{tr("set.apply")}</button>
              </div>
            </section>

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.timezone")}</h3>
              <div className="set-grid">
                <label className="ml"><span>{tr("set.timezone")}</span>
                  <select value={zone} onChange={(e) => setZone(e.target.value)}>
                    {zone === "" && <option value="">{tr("set.pickZone")}</option>}
                    {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select></label>
              </div>
              <div className="set-actions">
                <button className="sys-refresh" disabled={submit.state === "sending" || !zone || zone === zoneBase}
                  onClick={() => setConfirm({ kind: "zone" })}>{tr("set.apply")}</button>
              </div>
            </section>

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.nameServers")}</h3>
              <div className="set-grid">
                <label className="ml"><span>{tr("set.primary")}</span>
                  <input value={sys.resolveNameServer ?? ""} placeholder="8.8.8.8"
                    onChange={(e) => setSysField("resolveNameServer", e.target.value)} /></label>
                <label className="ml"><span>{tr("set.secondary")}</span>
                  <input value={sys.resolveNameServer2 ?? ""} placeholder={tr("common.optional")}
                    onChange={(e) => setSysField("resolveNameServer2", e.target.value)} /></label>
              </div>
              <div className="set-actions">
                <button className="sys-refresh" disabled={submit.state === "sending" || !sysDirty(["resolveNameServer", "resolveNameServer2"])}
                  onClick={() => setConfirm({ kind: "args", keys: ["resolveNameServer", "resolveNameServer2"] })}>{tr("set.apply")}</button>
              </div>
            </section>
            <section className="sys-card danger-card">
              <h3 className="sys-card-title">{tr("set.power")}</h3>
              <p className="set-hint">{tr("set.powerNote")}</p>
              <div className="set-actions">
                <button className="del" disabled={submit.state === "sending"}
                  onClick={() => setConfirm({ kind: "reboot" })}>{tr("set.reboot")}</button>
                <button className="del" disabled={submit.state === "sending"}
                  onClick={() => setConfirm({ kind: "halt" })}>{tr("set.halt")}</button>
              </div>
            </section>
          </>)}
        </div>
      )}

      {section === "packet" && (
        <div className="set-forms">
          {!sys ? <p className="sys-note dim">{tr("set.loading")}</p> : (<>
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.flow")}</h3>
              <p className="set-hint">{tr("set.flowNote")}</p>
              <div className="set-checks">
                <label className="set-check"><input type="checkbox" checked={!!sys.flow}
                  onChange={(e) => setSysField("flow", e.target.checked)} /> {tr("set.flowV4")}</label>
                <label className="set-check"><input type="checkbox" checked={!!sys.flowv6}
                  onChange={(e) => setSysField("flowv6", e.target.checked)} /> {tr("set.flowV6")}</label>
              </div>
              <div className="set-grid">
                <label className="ml"><span>{tr("set.flowV4Size")}</span>
                  <input type="number" min="0" value={sys.flowCacheBaseSize ?? 0}
                    onChange={(e) => setSysField("flowCacheBaseSize", Number(e.target.value) || 0)} /></label>
                <label className="ml"><span>{tr("set.flowV6Size")}</span>
                  <input type="number" min="0" value={sys.flowv6TableSize ?? 0}
                    onChange={(e) => setSysField("flowv6TableSize", Number(e.target.value) || 0)} /></label>
              </div>
              {lg && (<>
                <div className="oattr-subhead">{tr("set.flowTimeouts")}</div>
                <p className="set-hint">{tr("set.flowTimeoutsNote")}</p>
                <div className="set-grid">
                  {[["active_timeout", "set.lgActive"], ["inactive_timeout", "set.lgInactive"],
                    ["tcp_fin_rst_timeout", "set.lgFinRst"]].map(([k, lbl]) => (
                    <label className="ml" style={{ flex: "0 1 170px" }} key={k}><span>{tr(lbl)}</span>
                      <input type="number" min="0" value={lg.netflow[k]}
                        onChange={(e) => setLg((o) => ({ ...o, netflow: { ...o.netflow, [k]: Number(e.target.value) || 0 } }))} /></label>
                  ))}
                </div>
              </>)}
              {flowProblems(sys).length > 0 && (
                <ul className="problem-list">
                  {flowProblems(sys).map((p, i) => <li key={i}><code>{p.scope}</code> — {p.msg}</li>)}
                </ul>
              )}
              <div className="set-actions">
                <button className="sys-refresh"
                  disabled={submit.state === "sending" || flowProblems(sys).length > 0 || !(sysDirty(FLOW_ARGS) || lgDirty)}
                  onClick={() => setConfirm({ kind: "flow" })}>{tr("set.apply")}</button>
              </div>
            </section>

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.dedup")}</h3>
              <p className="set-hint">{tr("set.dedupNote")}</p>
              <label className="set-check"><input type="checkbox" checked={!!sys.deduplication}
                onChange={(e) => setSysField("deduplication", e.target.checked)} /> {tr("set.dedupOn")}</label>
              {(() => {
                /* Which ports get deduplicated. Empty is not "none": the
                   firmware then dedupes every port except LOOP ones, which it
                   skips on purpose. A named LOOP port is deduplicated, so the
                   list offers them too. */
                const known = dataPortNames(rawCfg, { includeLoop: true });
                const chosen = parsePortList(sys.deduplicationPorts);
                const ports = [...new Set([...known, ...chosen])];
                const probs = dedupProblems(sys, known);
                return (<>
                  <div className="sdw-ports">
                    <span className="sdw-ports-label">{tr("set.dedupPorts")}</span>
                    {ports.length === 0
                      ? <span className="dim">{tr("set.loading")}</span>
                      : <CheckAccordion label={tr("set.dedupAllPorts")} alwaysMulti t={tr}
                          items={ports.map((n) => ({ id: n, b: n, on: chosen.includes(n) }))}
                          onToggle={(n) => setSysField("deduplicationPorts", togglePortInList(sys.deduplicationPorts, n))}
                          onSetOne={(n) => setSysField("deduplicationPorts", n ?? "")}
                          onAll={(on) => setSysField("deduplicationPorts", on ? formatPortList(ports) : "")} />}
                  </div>
                  <p className="set-hint">{chosen.length ? tr("set.dedupSomeNote") : tr("set.dedupAllNote")}</p>
                  {probs.map((x, i) => (
                    <p className="set-hint err" key={i}>{tr("set.sdwanUnknownPort")} {x.port}</p>
                  ))}
                  <div className="set-actions">
                    <button className="copy-btn" disabled={!sysDirty(["deduplication", "deduplicationPorts"])}
                      onClick={() => setSys((o) => ({ ...o, deduplication: sysBase.deduplication,
                        deduplicationPorts: sysBase.deduplicationPorts }))}>{tr("set.revert")}</button>
                    <button className="sys-refresh"
                      disabled={submit.state === "sending" || !sysDirty(["deduplication", "deduplicationPorts"])}
                      onClick={() => setConfirm({ kind: "args", keys: ["deduplication", "deduplicationPorts"] })}>{tr("set.apply")}</button>
                  </div>
                </>);
              })()}
            </section>

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.reassembly")}</h3>
              <p className="set-hint">{tr("set.reassemblyNote")}</p>
              {[["ipFragmentCorrelation", "set.ipFrag"], ["tcpSegmentDataReassemble", "set.tcpSeg"], ["sctpDataChunkReconstruct", "set.sctpChunk"]].map(([k, lbl]) => (
                <label className="set-check" key={k}><input type="checkbox" checked={!!sys[k]}
                  onChange={(e) => setSysField(k, e.target.checked)} /> {tr(lbl)}</label>
              ))}
              <div className="set-actions">
                <button className="sys-refresh"
                  disabled={submit.state === "sending" || !sysDirty(["ipFragmentCorrelation", "tcpSegmentDataReassemble", "sctpDataChunkReconstruct"])}
                  onClick={() => setConfirm({ kind: "args", keys: ["ipFragmentCorrelation", "tcpSegmentDataReassemble", "sctpDataChunkReconstruct"] })}>{tr("set.apply")}</button>
              </div>
            </section>

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.liveUpdate")}</h3>
              <p className="set-hint">{tr("set.liveUpdateNote")}</p>
              <label className="set-check"><input type="checkbox" checked={!!sys.tryRunXmltoGdp}
                onChange={(e) => setSysField("tryRunXmltoGdp", e.target.checked)} /> {tr("set.liveUpdateOn")}</label>
              <div className="set-actions">
                <button className="sys-refresh" disabled={submit.state === "sending" || !sysDirty(["tryRunXmltoGdp"])}
                  onClick={() => setConfirm({ kind: "args", keys: ["tryRunXmltoGdp"] })}>{tr("set.apply")}</button>
              </div>
            </section>

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.inTunnels")}</h3>
              <p className="set-hint">{tr("set.inTunnelsNote")}</p>
              <div className="set-checks">
                {TUNNELS.map((k) => (
                  <label className="set-check" key={k}><input type="checkbox" checked={!!sys["tun_" + k]}
                    onChange={(e) => setSysField("tun_" + k, e.target.checked)} /> {k}</label>
                ))}
              </div>
              <div className="set-actions">
                <button className="sys-refresh"
                  disabled={submit.state === "sending" || !sysDirty(TUNNELS.map((k) => "tun_" + k))}
                  onClick={() => setConfirm({ kind: "tunnels" })}>{tr("set.apply")}</button>
              </div>
            </section>

            {/* Heartbeat lives here rather than in a tab of its own: it is one more
                thing the box does to traffic, and it is short enough to read in place. */}
          {!hb ? <p className="sys-note dim">{tr("set.loading")}</p> : (
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.heartbeat")}</h3>
              <p className="set-hint">{tr("set.heartbeatNote")}</p>
              {/* The status is not only for reading: a filter can test it, which
                  is how a missed target becomes a routing decision. */}
              <p className="set-hint">{tr("set.hbFilterHint")} <code>heartbeat.target.miss.id</code></p>
              <label className="set-check"><input type="checkbox" checked={hb.enable}
                onChange={(e) => setHbField("enable", e.target.checked)} /> {tr("set.hbEnable")}</label>
              <div className="set-grid">
                <label className="ml"><span>{tr("set.hbFrequency")}</span>
                  <input type="number" min="1" value={hb.frequency}
                    onChange={(e) => setHbField("frequency", e.target.value)} /></label>
                <label className="ml"><span>{tr("set.hbTimeouts")}</span>
                  <input type="number" min="1" value={hb.maxAllowTimeouts}
                    onChange={(e) => setHbField("maxAllowTimeouts", e.target.value)} /></label>
              </div>

              <div className="hb-targets">
                {/* Disabled targets stay in the document (they're still submitted) but
                    aren't shown — removing one just switches it off. */}
                <div className="oattr-subhead">{tr("set.hbTargets")} ({hb.targets.filter((t) => t.enable).length})</div>
                {hb.targets.filter((t) => t.enable).length === 0 && <p className="out-empty">{tr("set.hbNoTargets")}</p>}
                {hb.targets.map((t, i) => t.enable && (
                    <div className="hb-target" key={i}>
                      <div className="hb-target-head">
                        {(() => {
                          const row = hbRows.find((r) => r.id === t.id);
                          return row === undefined
                            ? <span className="hb-state dim">{tr("set.hbUnknown")}</span>
                            : <span className={"hb-state " + (row.up ? "up" : "down")}>
                                <span className="dot" />{row.up ? tr("set.hbUp") : tr("set.hbDown")}</span>;
                        })()}
                        <button className="del" onClick={() => setHbTarget(i, { enable: false })}>
                          {tr("common.delete")}</button>
                      </div>
                      <div className="set-grid">
                        <label className="ml" style={{ flex: "0 1 110px" }}><span>ID</span>
                          <input type="number" min="0" value={t.id}
                            onChange={(e) => setHbTarget(i, { id: Number(e.target.value) || 0 })} /></label>
                        <label className="ml" style={{ flex: "0 1 140px" }}><span>{tr("set.hbSend")}</span>
                          <PortSelect value={t.sendPort} options={portOptions}
                            onChange={(v) => setHbTarget(i, { sendPort: v })} invalid={!t.sendPort} /></label>
                        <label className="ml" style={{ flex: "0 1 140px" }}><span>{tr("set.hbReceive")}</span>
                          <PortSelect value={t.receivePort} options={portOptions}
                            onChange={(v) => setHbTarget(i, { receivePort: v })} invalid={!t.receivePort} /></label>
                        <label className="ml"><span>{tr("tf.desc")}</span>
                          <input value={t.description} placeholder={tr("common.optional")}
                            onChange={(e) => setHbTarget(i, { description: e.target.value })} /></label>
                      </div>
                      <label className="ml hb-data"><span>{tr("set.hbPacket")}</span>
                        <textarea value={t.packetData} spellCheck={false} rows={2}
                          onChange={(e) => setHbTarget(i, { packetData: e.target.value.replace(/\s+/g, "") })} /></label>
                    </div>
                ))}
                {/* a new target takes the slot it will occupy among the enabled ones */}
                <button className="add-btn" onClick={() => setHb((o) => ({ ...o,
                  targets: insertHeartbeatTarget(o.targets,
                    mkHeartbeatTarget(Math.max(0, ...o.targets.map((x) => x.id)) + 1)) }))}>
                  {tr("set.hbAddTarget")}</button>
              </div>

              {heartbeatProblems({ ...hb, targets: hb.targets.filter((t) => t.enable) }).length > 0 && (
                <ul className="problem-list">
                  {heartbeatProblems({ ...hb, targets: hb.targets.filter((t) => t.enable) }).map((p, i) => <li key={i}><code>{p.scope}</code> — {p.msg}</li>)}
                </ul>
              )}
              <div className="set-actions">
                <button className="copy-btn" disabled={!hbDirty} onClick={() => setHb(hbBase)}>{tr("set.revert")}</button>
                <button className="sys-refresh" disabled={submit.state === "sending" || !hbDirty || heartbeatProblems({ ...hb, targets: hb.targets.filter((t) => t.enable) }).length > 0}
                  onClick={() => setConfirm({ kind: "heartbeat" })}>{tr("set.apply")}</button>
              </div>
            </section>
          )}

            {/* MEC. S1AP correlation and the GTP side of it: the item table is
                built while s1cCorrelation is on, the flow extension can carry
                the GTP tunnel header, and a cron sweep drops entries that have
                gone idle. The GTP decapsulation flag is the same one the
                In-tunnel card shows, deliberately -- correlating GTP without
                decapsulating it correlates nothing. */}
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.mec")}</h3>
              <p className="set-hint">{tr("set.mecNote")}</p>
              {(() => {
                const problems = mecProblems(sys);
                const MEC_SWITCHES = ["s1cCorrelation", "tun_GTP", "flowExtensionGtpTunnelhdr"];
                const mecOn = MEC_SWITCHES.filter((k) => !!sys[k]).length;
                const mecAllOn = mecOn === MEC_SWITCHES.length;
                const mecMixed = mecOn > 0 && !mecAllOn;
                const cronErr = problems.find((x) => x.scope === "cron");
                const maxErr = problems.find((x) => x.scope === "max");
                const cronText = String(sys.s1apItemsClearIdleCron ?? "").trim();
                return (<>
                  {/* One decision, three parameters. On their own they are not
                      independent -- correlating without decapsulating GTP
                      correlates nothing, and the tunnel header in the flow
                      extension is what makes the correlation usable -- so the
                      card offers the feature and writes all three. A config
                      that arrives with them out of step shows as part-on. */}
                  <label className="set-check">
                    <input type="checkbox" checked={mecAllOn}
                      ref={(el) => { if (el) el.indeterminate = mecMixed; }}
                      onChange={(e) => { const on = e.target.checked; MEC_SWITCHES.forEach((k) => setSysField(k, on)); }} />
                    {tr("set.mecEnable")}
                  </label>
                  <p className="set-hint">{tr("set.mecEnableNote")}{" "}
                    <code>s1cCorrelation</code>, <code>in-tunnels/GTP</code>, <code>flowExtensionGtpTunnelhdr</code></p>
                  {mecMixed && <p className="set-hint warn">{tr("set.mecMixed")}</p>}

                  <div className="oattr-subhead">{tr("set.mecSweep")}</div>
                  <p className="set-hint">{tr("set.mecSweepNote")}</p>
                  <div className="set-grid">
                    <label className="ml"><span>{tr("set.mecCron")}</span>
                      <input type="text" value={sys.s1apItemsClearIdleCron ?? ""}
                        placeholder="0 2 * * 1"
                        onChange={(e) => setSysField("s1apItemsClearIdleCron", e.target.value)} /></label>
                    <label className="ml"><span>{tr("set.mecIdleMax")}</span>
                      <input type="text" inputMode="numeric" value={sys.s1apItemsClearIdleMax ?? ""}
                        placeholder="604800"
                        onChange={(e) => setSysField("s1apItemsClearIdleMax", e.target.value)} /></label>
                  </div>
                  {/* the firmware's cron is a restricted dialect and its month
                      field is tm_mon, which surprises everyone once */}
                  <p className="set-hint">{tr("set.mecCronHelp")}</p>
                  {!cronText && <p className="set-hint">{tr("set.mecCronEmpty")}</p>}
                  {cronErr && <p className="set-hint err">{
                    cronErr.kind === "fields" ? tr("set.mecCronFields")
                      : cronErr.kind === "range" ? `${tr("set.mecCronRange")} ${cronErr.field} ${cronErr.min}–${cronErr.max}`
                        : `${tr("set.mecCronSyntax")} ${cronErr.value}`}</p>}
                  {maxErr && <p className="set-hint err">{tr("set.mecIdleMaxBad")}</p>}
                  {/* the sweep is gated on correlation being on (main.c:1458) */}
                  {!sys.s1cCorrelation && (cronText || String(sys.s1apItemsClearIdleMax ?? "").trim()) &&
                    <p className="set-hint warn">{tr("set.mecSweepOff")}</p>}

                  <div className="set-actions">
                    <button className="copy-btn" disabled={!mecDirty()}
                      onClick={() => setSys((o) => ({ ...o,
                        ...Object.fromEntries(MEC_ARG_KEYS.map((k) => [k, sysBase[k]])),
                        tun_GTP: sysBase.tun_GTP }))}>{tr("set.revert")}</button>
                    <button className="sys-refresh"
                      disabled={submit.state === "sending" || !mecDirty() || problems.length > 0}
                      onClick={() => setConfirm({ kind: "mec" })}>
                      {submit.state === "sending" ? tr("set.submitting") : tr("set.apply")}</button>
                  </div>
                </>);
              })()}
            </section>

            {/* SD-WAN tunnel correlation. Two halves that work the same way: a
                switch, the ports the encapsulated traffic arrives on, and the
                matching in-tunnel decapsulation flag -- which is the same
                setting the In-tunnel inspection card above shows, deliberately,
                because turning correlation on without it correlates nothing. */}
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.sdwan")}</h3>
              <p className="set-hint">{tr("set.sdwanNote")}</p>
              {(() => {
                /* Offer the ports encapsulated traffic can arrive on -- a LOOP
                   port is not one -- but keep anything the config already names
                   in the list, or a value set elsewhere would be invisible here
                   and impossible to clear. Validation knows about every port the
                   device has, so only a name it does not have is an error. */
                const known = dataPortNames(rawCfg, { includeLoop: true });
                const chosen = [...parsePortList(sys.grel2CorrelationPort),
                                ...parsePortList(sys.vxlanCorrelationPort)];
                const ports = [...new Set([...dataPortNames(rawCfg), ...chosen])];
                const problems = sdwanProblems(sys, known);
                const row = (tunnel, onKey, portKey, tunFlag, label) => {
                  const on = !!sys[onKey];
                  const decap = !!sys["tun_" + tunFlag];
                  const mixed = on !== decap;
                  const picked = parsePortList(sys[portKey]);
                  const mine = problems.filter((x) => x.tunnel === tunnel);
                  return (
                    <div className="sdw-block" key={tunnel}>
                      <div className="oattr-subhead">{label}</div>
                      {/* Same as MEC: correlation and decapsulation are one
                          decision -- correlating a tunnel the device does not
                          unwrap correlates nothing -- so one switch writes both. */}
                      <label className="set-check">
                        <input type="checkbox" checked={on && decap}
                          ref={(el) => { if (el) el.indeterminate = mixed; }}
                          onChange={(e) => { const v = e.target.checked; setSysField(onKey, v); setSysField("tun_" + tunFlag, v); }} />
                        {tr("set.sdwanEnable")}
                      </label>
                      <p className="set-hint">{tr("set.mecEnableNote")}{" "}
                        <code>{onKey}</code>, <code>in-tunnels/{tunFlag}</code></p>
                      {mixed && <p className="set-hint warn">{tr("set.sdwanMixed")}</p>}
                      <div className="sdw-ports">
                        <span className="sdw-ports-label">{tr("set.sdwanPorts")}</span>
                        {ports.length === 0
                          ? <span className="dim">{tr("set.loading")}</span>
                          : <CheckAccordion label={tr("set.sdwanPickPorts")} alwaysMulti
                              items={ports.map((n) => ({ id: n, b: n, on: picked.includes(n) }))}
                              onToggle={(n) => setSysField(portKey, togglePortInList(sys[portKey], n))}
                              onSetOne={(n) => setSysField(portKey, n ?? "")}
                              onAll={(on) => setSysField(portKey, on ? formatPortList(ports) : "")}
                              t={tr} />}
                      </div>
                      {/* The card configures correlation; the pipeline that actually
                          unwraps and re-wraps the traffic is a separate document,
                          so offer the worked example from here. */}
                      {onUseTemplate && (
                        <p className="sdw-tpl">
                          <button className="link-btn"
                            onClick={() => setConfirm({ kind: "template",
                              tpl: tunnel === "l2gre" ? "sdwan-l2gre" : "sdwan-vxlan", label })}>
                            {tr("set.sdwanTemplate")}
                          </button>
                          <span className="dim"> {tr("set.sdwanTemplateNote")}</span>
                        </p>
                      )}
                      {mine.map((x, i) => (
                        <p className="set-hint err" key={i}>
                          {x.kind === "noPorts" ? tr("set.sdwanNoPorts") : `${tr("set.sdwanUnknownPort")} ${x.port}`}
                        </p>
                      ))}
                    </div>
                  );
                };
                return (<>
                  {row("l2gre", "grel2Correlation", "grel2CorrelationPort", "GRE", "L2GRE")}
                  {row("vxlan", "vxlanCorrelation", "vxlanCorrelationPort", "VXLAN", "VXLAN")}

                  <div className="sdw-block">
                    <div className="oattr-subhead">{tr("set.sdwanEncrypt")}</div>
                    <p className="set-hint">{tr("set.sdwanEncryptNote")}</p>
                    <label className="set-check"><input type="checkbox" checked={!!sys.encapsulationEncrypt}
                      onChange={(e) => setSysField("encapsulationEncrypt", e.target.checked)} /> {tr("set.sdwanEncryptOn")}</label>
                    <div className="set-grid">
                      <label className="ml"><span>{tr("set.sdwanKeyTimeout")}</span>
                        <input type="text" inputMode="numeric" value={sys.encapsulationEncryptKeyTimeout ?? ""}
                          placeholder={tr("common.optional")}
                          onChange={(e) => setSysField("encapsulationEncryptKeyTimeout", e.target.value)} /></label>
                    </div>
                    {/* main.c only runs the rotation handler when the timeout is
                        non-zero, and an absent arg reads as 0, so both mean the
                        key is never rotated. */}
                    {["", "0"].includes(String(sys.encapsulationEncryptKeyTimeout ?? "").trim()) &&
                      <p className="set-hint">{tr("set.sdwanKeyForever")}</p>}
                    {problems.some((x) => x.tunnel === "encrypt") &&
                      <p className="set-hint err">{tr("set.sdwanKeyTimeoutBad")}</p>}
                  </div>

                  <div className="set-actions">
                    <button className="copy-btn" disabled={!sdwanDirty()}
                      onClick={() => setSys((s) => ({ ...s,
                        ...Object.fromEntries(SDWAN_ARG_KEYS.map((k) => [k, sysBase[k]])),
                        tun_GRE: sysBase.tun_GRE, tun_VXLAN: sysBase.tun_VXLAN }))}>{tr("set.revert")}</button>
                    <button className="sys-refresh"
                      disabled={submit.state === "sending" || !sdwanDirty() || problems.length > 0}
                      onClick={() => setConfirm({ kind: "sdwan" })}>
                      {submit.state === "sending" ? tr("set.submitting") : tr("set.apply")}</button>
                  </div>
                </>);
              })()}
            </section>


            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.flowServices")}</h3>
              <p className="set-hint">{tr("set.flowServicesNote")}</p>
              {(() => {
                const list = fsList ?? [];
                // keep the edited list authoritative and mirror it into the packed
                // string so the Apply button's dirty check still works
                const write = (next) => { setFsList(next); setSysField("statisticsFlowService", buildFlowServices(next)); };
                return (<>
                  {list.length === 0 && <p className="out-empty">{tr("set.fsNone")}</p>}
                  {list.map((svc, i) => (
                    <div className="hb-target" key={i}>
                      <div className="hb-target-head">
                        <span className="log-target-name mono">{svc.name || tr("set.fsUnnamed")}</span>
                        <button className="del" onClick={() => write(list.filter((_, j) => j !== i))}>{tr("common.delete")}</button>
                      </div>
                      <div className="set-grid">
                        <label className="ml"><span>{tr("set.fsName")}</span>
                          <input value={svc.name} placeholder="HTTPS"
                            onChange={(e) => write(list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></label>
                      </div>
                      <div className="oattr-subhead">{tr("set.fsPorts")}</div>
                      <div className="fs-ports">
                        {svc.ports.map((p, k) => (
                          <span className="fs-port" key={k}>
                            <select value={p.proto} onChange={(e) => write(list.map((x, j) => j === i
                              ? { ...x, ports: x.ports.map((y, m) => m === k ? { ...y, proto: e.target.value } : y) } : x))}>
                              <option value="TCP">TCP</option><option value="UDP">UDP</option><option value="SCTP">SCTP</option>
                            </select>
                            <input type="number" min="1" max="65535" value={p.port}
                              onChange={(e) => write(list.map((x, j) => j === i
                                ? { ...x, ports: x.ports.map((y, m) => m === k ? { ...y, port: Number(e.target.value) || 0 } : y) } : x))} />
                            <button className="icon-btn" aria-label={tr("common.delete")}
                              onClick={() => write(list.map((x, j) => j === i
                                ? { ...x, ports: x.ports.filter((_, m) => m !== k) } : x))}>✕</button>
                          </span>
                        ))}
                        <button className="add-btn" onClick={() => write(list.map((x, j) => j === i
                          ? { ...x, ports: [...x.ports, { proto: "TCP", port: 0 }] } : x))}>{tr("set.fsAddPort")}</button>
                      </div>
                    </div>
                  ))}
                  <div className="add-row">
                    <button className="add-btn" onClick={() => write([...list, mkFlowService()])}>{tr("set.fsAddService")}</button>
                  </div>
                  {flowServiceProblems(list).length > 0 && (
                    <ul className="problem-list">
                      {flowServiceProblems(list).map((p, i) => <li key={i}><code>{p.scope}</code> — {p.msg}</li>)}
                    </ul>
                  )}
                  <div className="set-actions">
                    <button className="sys-refresh"
                      disabled={submit.state === "sending" || !sysDirty(["statisticsFlowService"]) || flowServiceProblems(list).length > 0}
                      onClick={() => setConfirm({ kind: "args", keys: ["statisticsFlowService"] })}>{tr("set.apply")}</button>
                  </div>
                </>);
              })()}
            </section>
          </>)}
        </div>
      )}

      {section === "auth" && (
        <div className="set-forms">
          {!views ? <p className="sys-note dim">{tr("set.loading")}</p> : (<>
            <p className="page-note">{tr("set.authNote")}</p>

          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.acct")}</h3>
            <p className="set-hint">{tr("set.acctNote")}</p>
            {/* With remote auth on these accounts are only a fallback. Say so here,
                or someone creates one and cannot work out why it is refused. */}
            {internalAccountsNoteKey(views) &&
              <p className="set-hint warn">{tr(internalAccountsNoteKey(views))}</p>}

              {users === null ? <p className="sys-note dim">{tr("set.loading")}</p> : (
                <table className="acct-table">
                  <thead><tr><th>{tr("set.acctUser")}</th><th>{tr("set.acctRole")}</th><th /></tr></thead>
                  <tbody>
                    {users.length === 0 && <tr><td colSpan={3} className="dim">{tr("set.acctNone")}</td></tr>}
                    {users.map((u) => (
                      <tr key={u.name}>
                        <td className="mono">{u.name}</td>
                        <td>{u.role}</td>
                        <td className="acct-act">
                          {u.name === UNDELETABLE_USER
                            ? <span className="dim">{tr("set.acctNoDelete")}</span>
                            : <button className="del" disabled={acctBusy}
                                onClick={() => setConfirm({ kind: "delUser", name: u.name })}>{tr("set.acctDelete")}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="set-grid">
                <label className="set-field"><span>{tr("set.acctUser")}</span>
                  <input value={newUser.name} autoComplete="off"
                    onChange={(e) => setNewUser((o) => ({ ...o, name: e.target.value }))} /></label>
                <label className="set-field"><span>{tr("set.acctPassword")}</span>
                  <input type="password" value={newUser.pass} autoComplete="new-password"
                    onChange={(e) => setNewUser((o) => ({ ...o, pass: e.target.value }))} /></label>
                <label className="set-field"><span>{tr("set.acctConfirm")}</span>
                  <input type="password" value={newUser.confirm} autoComplete="new-password"
                    onChange={(e) => setNewUser((o) => ({ ...o, confirm: e.target.value }))} /></label>
              </div>
              <div className="set-actions">
                <button className="sys-refresh"
                  disabled={acctBusy || !!newUserProblem(newUser.name, newUser.pass, newUser.confirm, users ?? [])}
                  onClick={async () => {
                    if (await acctPost("/create_user",
                      { Username: newUser.name.trim(), PasswordHash: await sha256Hex(newUser.pass) }, "set.acctCreated"))
                      setNewUser({ name: "", pass: "", confirm: "" });
                  }}>{tr("set.acctAdd")}</button>
              </div>
            </section>

            {/* Its own card, not a second heading inside the accounts one: a card
                is what the index on this page indexes, and changing your own
                password is the thing people come to this section to find. */}
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.acctChangePw")}</h3>
              {!me && <p className="set-hint warn">{tr("set.acctWhoUnknown")}</p>}
              <div className="set-grid">
                <label className="set-field"><span>{tr("set.acctOldPassword")}</span>
                  <input type="password" value={pw.old} autoComplete="current-password"
                    onChange={(e) => setPw((o) => ({ ...o, old: e.target.value }))} /></label>
                <label className="set-field"><span>{tr("set.acctNewPassword")}</span>
                  <input type="password" value={pw.next} autoComplete="new-password"
                    onChange={(e) => setPw((o) => ({ ...o, next: e.target.value }))} /></label>
                <label className="set-field"><span>{tr("set.acctConfirm")}</span>
                  <input type="password" value={pw.confirm} autoComplete="new-password"
                    onChange={(e) => setPw((o) => ({ ...o, confirm: e.target.value }))} /></label>
              </div>
              <div className="set-actions">
                <button className="sys-refresh"
                  disabled={acctBusy || !!changePasswordProblem(pw.old, pw.next, pw.confirm, me)}
                  onClick={async () => {
                    setPw({ old: "", next: "", confirm: "" });
                    await changeOwnPassword(pw.old, pw.next);
                  }}>{tr("set.acctChangePwGo")}</button>
              </div>
            {acctErr && <p className="set-hint err">{acctErr}</p>}
            {acctOk && <p className="set-hint ok">{acctOk}</p>}
          </section>
            {[["radius", "RADIUS", 1812], ["tacacs", "TACACS+", 49]].map(([key, label, defPort]) => (
              <section className="sys-card" key={key}>
                <h3 className="sys-card-title">{label}</h3>
                {/* The device authenticates against one external server, so enabling
                    one switches the other off rather than leaving both claimed. */}
                <label className="set-check"><input type="checkbox" checked={!!views[key + "Login"]}
                  onChange={(e) => setViews((o) => ({ ...o,
                    radiusLogin: key === "radius" ? e.target.checked : false,
                    tacacsLogin: key === "tacacs" ? e.target.checked : false }))} />
                  {tr("set.authUse")} {label}</label>
                <div className="set-grid">
                  <label className="ml"><span>{tr("set.authServer")}</span>
                    <input value={views[key + "Host"]} placeholder="192.168.1.10"
                      onChange={(e) => setViews((o) => ({ ...o, [key + "Host"]: e.target.value }))} /></label>
                  <label className="ml" style={{ flex: "0 1 120px" }}><span>{tr("set.bkPort")}</span>
                    {/* Number(...)||defPort snapped an emptied box straight back
                        to 1812 with the caret at the end, so backspacing to
                        retype produced 18125. Hold the raw value; the submit
                        path and viewsProblems coerce and validate it. */}
                    <input type="number" min="1" max="65535" value={views[key + "Port"] ?? ""}
                      onChange={(e) => setViews((o) => ({ ...o, [key + "Port"]:
                        e.target.value === "" ? "" : Number(e.target.value) }))}
                      onBlur={(e) => { if (e.target.value === "") setViews((o) => ({ ...o, [key + "Port"]: defPort })); }} /></label>
                  <label className="ml"><span>{tr("set.authSecret")}</span>
                    <input type="password" value={views[key + "Secret"]} placeholder={tr("common.optional")}
                      onChange={(e) => setViews((o) => ({ ...o, [key + "Secret"]: e.target.value }))} /></label>
                </div>
              </section>
            ))}
            {viewsProblems(views).length > 0 && (
              <ul className="problem-list">
                {viewsProblems(views).map((p, i) => <li key={i}><code>{p.scope}</code> — {p.msg}</li>)}
              </ul>
            )}
            <div className="set-actions">
              <button className="copy-btn" disabled={JSON.stringify(views) === JSON.stringify(viewsBase)}
                onClick={() => setViews(viewsBase)}>{tr("set.revert")}</button>
              <button className="sys-refresh"
                disabled={submit.state === "sending" || JSON.stringify(views) === JSON.stringify(viewsBase) || viewsProblems(views).length > 0}
                onClick={() => setConfirm({ kind: "views" })}>{tr("set.apply")}</button>
            </div>
          </>)}
        </div>
      )}

      {section === "logging" && (
        <div className="set-forms">
          {!lg ? <p className="sys-note dim">{tr("set.loading")}</p> : (() => {
            // adding reuses the first disabled slot, the same way heartbeat targets work
            const addTo = (path, make) => setLgTargets(path, (l) => insertHeartbeatTarget(l, make()));
            const patch = (path, i, p) => setLgTargets(path, (l) => l.map((x, j) => j === i ? { ...x, ...p } : x));
            const drop = (path, i) => setLgTargets(path, (l) => l.map((x, j) => j === i ? { ...x, enable: false } : x));
            const shown = (l) => (l ?? []).map((x, i) => ({ x, i })).filter(({ x }) => x.enable);
            const srcPorts = logSourcePorts(rawCfg);
            const dataPorts = dataPortNames(rawCfg, { includeLoop: true });   // scope may include LOOP

            const exporter = (path, title, note, head, targetExtra) => (
              <section className="sys-card" key={path}>
                <h3 className="sys-card-title">{title}
                  <span className="sys-card-metric">{shown(lg[path]?.targets ?? lg.netflow.targets).length}</span>
                </h3>
                {note && <p className="set-hint">{note}</p>}
                {path !== "netflow" && (
                  <label className="set-check"><input type="checkbox" checked={!!lg[path].enable}
                    onChange={(e) => setLg((o) => ({ ...o, [path]: { ...o[path], enable: e.target.checked } }))} />
                    {tr("set.lgEnable")}</label>
                )}
                {head}
                {shown(path === "netflow" ? lg.netflow.targets : lg[path].targets).length === 0 &&
                  <p className="out-empty">{tr("set.lgNoTargets")}</p>}
                {(path === "netflow" ? lg.netflow.targets : lg[path].targets).map((x, i) => x.enable && (
                  <LogTarget key={i} target={x} tr={tr} dataPorts={dataPorts} filterIds={filterIds}
                    onPatch={(p) => patch(path, i, p)} onRemove={() => drop(path, i)}
                    extra={targetExtra?.(x, i)} />
                ))}
                <button className="add-btn" onClick={() => addTo(path,
                  path === "netflow" ? mkNetflowTarget : () => mkLogTarget(514))}>{tr("set.lgAddTarget")}</button>
              </section>
            );

            return (<>
              {exporter("netflow", "NetFlow", tr("set.lgNetflowNote"), (
                <>
                <label className="set-check"><input type="checkbox" checked={lg.enable}
                  onChange={(e) => setLg((o) => ({ ...o, enable: e.target.checked }))} /> {tr("set.lgEnable")}</label>
                <div className="set-grid">
                  <label className="ml" style={{ flex: "0 1 130px" }}><span>{tr("set.lgPort")}</span>
                    <PortSelect value={lg.netflow.port} options={srcPorts}
                      onChange={(v) => setLg((o) => ({ ...o, netflow: { ...o.netflow, port: v } }))} /></label>
                </div>
                </>
              ), (x, i) => (
                <div className="set-grid">
                  <label className="ml" style={{ flex: "0 1 130px" }}><span>{tr("set.lgVersion")}</span>
                    <select value={x.version} onChange={(e) => patch("netflow", i, { version: Number(e.target.value) })}>
                      <option value={5}>v5</option><option value={9}>v9</option><option value={10}>IPFIX (v10)</option>
                    </select></label>
                </div>
              ))}

              <section className="sys-card">
                <h3 className="sys-card-title">{tr("set.lgSyslogTitle")}<span className="sys-card-metric">{shown(lg.syslog.targets).length}</span></h3>
                <p className="set-hint">{tr("set.lgSyslogNote")}</p>
                <label className="set-check"><input type="checkbox" checked={lg.syslog.enable}
                  onChange={(e) => setLg((o) => ({ ...o, syslog: { ...o.syslog, enable: e.target.checked } }))} /> {tr("set.lgEnable")}</label>
                <div className="set-grid">
                  <label className="ml" style={{ flex: "0 1 130px" }}><span>{tr("set.lgPort")}</span>
                    <PortSelect value={lg.syslog.port} options={srcPorts}
                      onChange={(v) => setLg((o) => ({ ...o, syslog: { ...o.syslog, port: v } }))} /></label>
                </div>
                {shown(lg.syslog.targets).length === 0 && <p className="out-empty">{tr("set.lgNoTargets")}</p>}
                {lg.syslog.targets.map((x, i) => x.enable && (
                  <LogTarget key={i} target={x} tr={tr} dataPorts={dataPorts} filterIds={filterIds}
                    hideScope={x.type === "system"}
                    onPatch={(p) => patch("syslog", i, p)} onRemove={() => drop("syslog", i)}
                    extra={(
                      <>
                        <div className="oattr-subhead">{x.type === "system" ? tr("set.lgSystemEvents") : tr("set.lgMatchedFields")}</div>
                        <div className="set-checks">
                          {(x.type === "system" ? SYSLOG_SYSTEM_SUBTYPES : SYSLOG_MATCHED_SUBTYPES).map((k) => (
                            <label className="set-check" key={k}><input type="checkbox" checked={!!x.subtype?.[k]}
                              onChange={(e) => patch("syslog", i, { subtype: { ...x.subtype, [k]: e.target.checked } })} /> {k}</label>
                          ))}
                        </div>
                      </>
                    )} />
                ))}
                <div className="add-row">
                  <button className="add-btn" onClick={() => addTo("syslog", () => mkSyslogTarget("system"))}>{tr("set.lgAddSystem")}</button>
                  <button className="add-btn" onClick={() => addTo("syslog", () => mkSyslogTarget("matched"))}>{tr("set.lgAddMatched")}</button>
                </div>
              </section>

              {exporter("dns", tr("set.lgDns"), tr("set.lgDnsNote"), (
                <div className="set-grid">
                  <label className="ml" style={{ flex: "0 1 130px" }}><span>{tr("set.lgPort")}</span>
                    <PortSelect value={lg.dns.port} options={srcPorts}
                      onChange={(v) => setLg((o) => ({ ...o, dns: { ...o.dns, port: v } }))} /></label>
                  {[["active_timeout", "set.lgActive"], ["inactive_timeout", "set.lgInactive"]].map(([k, lbl]) => (
                    <label className="ml" style={{ flex: "0 1 150px" }} key={k}><span>{tr(lbl)}</span>
                      <input type="number" min="0" value={lg.dns[k]}
                        onChange={(e) => setLg((o) => ({ ...o, dns: { ...o.dns, [k]: Number(e.target.value) || 0 } }))} /></label>
                  ))}
                  <label className="set-check"><input type="checkbox" checked={lg.dns.response_only}
                    onChange={(e) => setLg((o) => ({ ...o, dns: { ...o.dns, response_only: e.target.checked } }))} /> {tr("set.lgResponseOnly")}</label>
                  <label className="set-check"><input type="checkbox" checked={lg.dns.noerror_only}
                    onChange={(e) => setLg((o) => ({ ...o, dns: { ...o.dns, noerror_only: e.target.checked } }))} /> {tr("set.lgNoErrorOnly")}</label>
                </div>
              ))}

              {exporter("http", tr("set.lgHttp"), tr("set.lgHttpNote"), (
                <div className="set-grid">
                  <label className="ml" style={{ flex: "0 1 130px" }}><span>{tr("set.lgPort")}</span>
                    <PortSelect value={lg.http.port} options={srcPorts}
                      onChange={(v) => setLg((o) => ({ ...o, http: { ...o.http, port: v } }))} /></label>
                </div>
              ))}

              {exporter("ssl", tr("set.lgTls"), tr("set.lgTlsNote"), (
                <div className="set-grid">
                  <label className="ml" style={{ flex: "0 1 130px" }}><span>{tr("set.lgPort")}</span>
                    <PortSelect value={lg.ssl.port} options={srcPorts}
                      onChange={(v) => setLg((o) => ({ ...o, ssl: { ...o.ssl, port: v } }))} /></label>
                  <label className="set-check"><input type="checkbox" checked={lg.ssl.ja3}
                    onChange={(e) => setLg((o) => ({ ...o, ssl: { ...o.ssl, ja3: e.target.checked } }))} /> JA3</label>
                  <label className="set-check"><input type="checkbox" checked={lg.ssl.ja4}
                    onChange={(e) => setLg((o) => ({ ...o, ssl: { ...o.ssl, ja4: e.target.checked } }))} /> JA4</label>
                </div>
              ))}

              {loggingProblems(lg).length > 0 && (
                <ul className="problem-list">
                  {loggingProblems(lg).map((p, i) => <li key={i}><code>{p.scope}</code> — {p.msg}</li>)}
                </ul>
              )}
              <div className="set-actions">
                <button className="copy-btn" disabled={!lgDirty} onClick={() => setLg(lgBase)}>{tr("set.revert")}</button>
                <button className="sys-refresh" disabled={submit.state === "sending" || !lgDirty || loggingProblems(lg).length > 0}
                  onClick={() => setConfirm({ kind: "logging" })}>{tr("set.apply")}</button>
              </div>
            </>);
          })()}
        </div>
      )}

      {section === "services" && (
        <div className="set-forms">
          {!svc ? <p className="sys-note dim">{tr("set.loading")}</p> : (<>
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.services")} <span className="sys-card-metric">{svc.filter((x) => x.enable).length}/{svc.length}</span></h3>
              <div className="tf-table-wrap">
                <table className="tf-table">
                  <thead><tr><th>{tr("set.service")}</th><th>{tr("set.svcVersion")}</th>
                    <th>{tr("tf.desc")}</th><th>{tr("set.enabled")}</th></tr></thead>
                  <tbody>
                    {svc.map((x, i) => (
                      <tr key={x.name} className={x.enable ? "" : "port-off"}>
                        <td className="tf-name mono">{x.name}</td>
                        {/* Only the services that can say; the rest keep a dash
                            rather than an empty cell. The WWW service is two
                            programs -- nginx in front of pywww -- and pywww is
                            not a service of its own, so both are named here. */}
                        <td className="mono svc-ver">{(() => {
                          const v = svcVersions[x.name];
                          const behind = x.name === "pyhttpd" ? svcVersions.pywww : null;
                          if (!v && !behind) return <span className="dim">—</span>;
                          return (<>
                            {v && <span title={v}>{shortVersion(v)}</span>}
                            {behind && <span className="svc-ver-2" title={"pywww " + behind}>pywww {behind}</span>}
                          </>);
                        })()}</td>
                        <td className="dim">{x.description || "—"}</td>
                        <td><input type="checkbox" checked={x.enable}
                          onChange={(e) => setSvc((l) => l.map((y, j) => j === i ? { ...y, enable: e.target.checked } : y))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="set-actions">
                <span className="set-changed">{changedServices(svcBase, svc).length > 0 ? `${changedServices(svcBase, svc).length} ${tr("set.portsChanged")}` : ""}</span>
                <button className="copy-btn" disabled={changedServices(svcBase, svc).length === 0}
                  onClick={() => setSvc(svcBase)}>{tr("set.revert")}</button>
                <button className="sys-refresh" disabled={submit.state === "sending" || changedServices(svcBase, svc).length === 0}
                  onClick={() => setConfirm({ kind: "services" })}>{tr("set.apply")}</button>
              </div>
            </section>

            {extras && (
            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.svcExtras")}</h3>
              <p className="set-hint">{tr("set.svcExtrasNote")}</p>
              <label className="set-check"><input type="checkbox" checked={extras.xmlrpc.localhost_only}
                onChange={(e) => setExtras((o) => ({ ...o, xmlrpc: { localhost_only: e.target.checked } }))} />
                xmlrpc — {tr("set.localhostOnly")}</label>
              <div className="oattr-subhead">backup</div>
              <div className="set-grid">
                {[["host", "set.bkHost"], ["port", "set.bkPort"], ["user", "set.bkUser"],
                  ["pass", "set.bkPass"], ["dir", "set.bkDir"], ["crontab", "set.bkCron"]].map(([k, lbl]) => (
                  <label className="ml" key={k}><span>{tr(lbl)}</span>
                    <input type={k === "pass" ? "password" : k === "port" ? "number" : "text"}
                      value={extras.backup[k]} placeholder={k === "crontab" ? "0 0 * * *" : tr("common.optional")}
                      onChange={(e) => setExtras((o) => ({ ...o, backup: { ...o.backup, [k]: e.target.value } }))} /></label>
                ))}
              </div>
              <div className="set-actions">
                <button className="sys-refresh"
                  disabled={submit.state === "sending" || JSON.stringify(extras) === JSON.stringify(extrasBase)}
                  onClick={() => setConfirm({ kind: "extras" })}>{tr("set.apply")}</button>
              </div>
            </section>
            )}

            <section className="sys-card">
              <h3 className="sys-card-title">{tr("set.snmp")}</h3>
              <p className="set-hint">{tr("set.snmpNote")} <a href="/data/PACKETX-MIB.txt" download>PACKETX-MIB.txt</a></p>
              <div className="set-grid">
                <label className="ml"><span>{tr("set.readCommunity")}</span>
                  <input value={community} onChange={(e) => setCommunity(e.target.value)} /></label>
              </div>
              <div className="set-actions">
                <button className="sys-refresh" disabled={submit.state === "sending" || !community.trim() || community === communityBase}
                  onClick={() => setConfirm({ kind: "snmp" })}>{tr("set.apply")}</button>
              </div>
            </section>
          </>)}
        </div>
      )}

      {section === "backup" && (
        <div className="set-forms">
          <p className="page-note">{tr("set.backupNote")}</p>

          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.bkTake")}</h3>
            <p className="set-hint">{tr("set.bkTakeNote")}</p>
            <div className="set-actions">
              {backupUrl && <a className="copy-btn" href={backupUrl} download>{tr("set.bkDownload")}</a>}
              <button className="sys-refresh" disabled={submit.state === "sending"}
                onClick={async () => {
                  setSubmit({ state: "sending", msg: "" });
                  try {
                    const res = await fetch("/grism/task/backup", { method: "POST", credentials: "include" });
                    if (!res.ok) throw new Error("HTTP " + res.status);
                    // pywww serves the file the backup just wrote; the Go app's file
                    // manager, which used to hand it over, is gone
                    setBackupUrl("/grism/task/download_backup");
                    setSubmit({ state: "idle", msg: "" });
                  } catch (e) { setSubmit({ state: "error", msg: String(e.message || e) }); }
                }}>{tr("set.bkCreate")}</button>
            </div>
          </section>

          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.bkRestore")}</h3>
            <p className="set-hint">{tr("set.bkRestoreNote")}</p>
            <FilePick accept=".tgz" file={restoreFile} onPick={setRestoreFile} tr={tr} hint="grism-backup.tgz" />
            <div className="set-actions">
              <button className="del" disabled={!restoreFile || submit.state === "sending"}
                onClick={() => setConfirm({ kind: "restoreFile" })}>{tr("set.bkRestoreGo")}</button>
            </div>
          </section>

          <section className="sys-card danger-card">
            <h3 className="sys-card-title">{tr("set.bkFactory")}</h3>
            <p className="set-hint">{tr("set.bkFactoryNote")}</p>
            <p className="set-hint">{tr("set.factoryIp")} <span className="mono">{FACTORY_MGMT_IP}</span></p>
            <div className="set-actions">
              <button className="del" disabled={submit.state === "sending"}
                onClick={() => setConfirm({ kind: "factory" })}>{tr("set.bkFactoryGo")}</button>
            </div>
          </section>
        </div>
      )}

      {section === "firmware" && (
        <div className="set-forms">
          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.fwCurrent")}</h3>
            <div className="sess-figures">
              <div><span className="sess-k">{tr("ov.model")}</span><span className="sess-v">{fw.model ? "GRISM-" + fw.model : "—"}</span></div>
              <div><span className="sess-k">{tr("ov.version")}</span><span className="sess-v mono">{fw.version || "—"}</span></div>
            </div>
          </section>

          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.fwManual")}</h3>
            <p className="set-hint">{tr("set.fwManualNote")}</p>
            <FilePick accept=".tgz" file={fwFile} onPick={setFwFile} tr={tr} hint="grism-bin.tgz" />
            <div className="set-actions">
              <button className="del" disabled={!fwFile || submit.state === "sending"}
                onClick={() => setConfirm({ kind: "fwUpload" })}>{tr("set.fwUpload")}</button>
            </div>
          </section>

          <section className="sys-card">
            <h3 className="sys-card-title">{tr("set.fwOnline")}</h3>
            <p className="set-hint">{tr("set.fwOnlineNote")}</p>
            {fwChecking
              ? <p className="sys-note dim">{tr("set.fwCheckingNote")}</p>
              : fw.available
                ? <p className="sys-note">{tr("set.fwFound")} <b className="mono">{fw.available}</b></p>
                : fw.checked && <p className="sys-note dim">{tr("set.fwUpToDate")}</p>}
            {dl && (
              <div className="fw-progress">
                <div className="apply-bar"><div style={{ width: (dl.ratio * 100).toFixed(1) + "%", animation: "none" }} /></div>
                <span className="mono">{fmtBytes(dl.done)} / {fmtBytes(dl.total)}</span>
              </div>
            )}
            {/* a refused or stalled download used to leave the bar at 0 B with
                nothing said, and the poll running for as long as the tab stayed open */}
            {dlErr && <p className="set-hint err">{tr("set.fwDownloadFailed")}: {dlErr}</p>}
            <div className="set-actions">
              {/* the device queries the update server, which can take a moment */}
              <button className="copy-btn" disabled={submit.state === "sending" || fwChecking}
                onClick={async () => {
                  setFwChecking(true);
                  try {
                    const res = await fetch("/grism/task/update_check", { credentials: "include" });
                    const v = res.ok ? parseUpdateCheck(await res.text()) : "";
                    setFw((o) => ({ ...o, available: v, checked: true }));
                  } catch (e) { warnFetch("update check", e); setFw((o) => ({ ...o, checked: true })); }
                  finally { setFwChecking(false); }
                }}>{fwChecking ? tr("set.fwChecking") : tr("set.fwCheck")}</button>
              {fw.available && !dl?.complete && (
                <button className="sys-refresh" disabled={submit.state === "sending"}
                  onClick={() => startDownload(fw.available)}>{tr("set.fwDownload")}</button>
              )}
              {dl?.complete && (
                <button className="sys-refresh" disabled={submit.state === "sending"}
                  onClick={() => setConfirm({ kind: "fwOnline" })}>{tr("set.fwInstall")}</button>
              )}
            </div>
          </section>
        </div>
      )}

      {section === "raw" && (
        <div className="set-raw xml-box export-main">
          {/* the same panel the export pane uses: header with the description and
              the actions, then the XML, all inside one rounded box */}
          <div className="xb-head">
            <span className="xb-title xb-title-plain">{tr("set.rawNote")}
              {editingRaw && <span className="xb-editing"> · {tr("ex.editing")}</span>}</span>
            <div className="xb-actions">
              <button className="copy-btn"
                disabled={!raw.trim()}
                onClick={() => {
                  if (editingRaw) { setRaw(rawBase); setEditingRaw(false); }
                  else { setRawBase(raw); setEditingRaw(true); }
                }}>{editingRaw ? tr("ex.cancel") : tr("ex.edit")}</button>
              <button className="copy-btn" disabled={!editingRaw || !raw.trim()}
                onClick={() => { try { setRaw(formatXml(raw)); } catch { /* indent only; the notice below reports syntax */ } }}>
                {tr("ex.format")}</button>
              <button className="copy-btn" disabled={!raw.trim()}
                onClick={async () => {
                  try { await navigator.clipboard.writeText(raw); setCopied(true); setTimeout(() => setCopied(false), 1600); }
                  catch { /* clipboard blocked — the text is still selectable */ }
                }}>{copied ? tr("ex.copied") : tr("ex.copy")}</button>
              <button className="submit-btn"
                disabled={submit.state === "sending" || !raw.trim() || !!rawErr}
                onClick={() => setConfirm({ kind: "raw" })}>
                {submit.state === "sending" ? tr("set.submitting") : tr("ex.submit")}</button>
            </div>
          </div>
          {rawErr && <div className="sys-err">{tr("set.xmlInvalid")}: {rawErr}</div>}
          {/* line numbers only matter while editing, so the read-only view is plain */}
          {editingRaw
            ? <XmlEditor value={raw} onChange={setRaw} />
            : <XmlView xml={raw} />}
        </div>
      )}

      {confirm && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setConfirm(null)}>
          <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{confirm.kind === "ip" ? tr("set.confirmTitle") : confirm.kind === "ports" ? tr("set.confirmPortsTitle") : confirm.kind === "raw" ? tr("set.confirmXmlTitle") : confirm.kind === "reboot" ? tr("set.confirmRebootTitle") : confirm.kind === "halt" ? tr("set.confirmHaltTitle") : confirm.kind === "template" ? tr("set.tplConfirmTitle") : confirm.kind === "vport" ? tr("set.vportConfirmTitle") : confirm.kind === "speed" ? tr("set.speedConfirmTitle") : confirm.kind === "bypass" ? tr("set.bypassConfirmTitle") : confirm.kind === "delUser" ? tr("set.acctConfirmDeleteTitle") : ["restoreFile","factory","fwUpload","fwOnline"].includes(confirm.kind) ? tr("set." + confirm.kind + "Title") : tr("set.confirmApplyTitle")}</div>
            <p className="modal-body">{confirm.kind === "ip" ? `${confirm.iface.fields.name || confirm.iface.role} (${confirm.iface.fields.ip || "—"}) — ${tr("set.confirmBody")}` : confirm.kind === "ports" ? (portEnableChanged ? `${tr("set.confirmPortsBody")} ${tr("set.portsNeedReboot")}` : tr("set.confirmPortsBody")) : confirm.kind === "raw" ? tr("set.confirmXmlBody") : confirm.kind === "reboot" ? tr("set.confirmRebootBody") : confirm.kind === "halt" ? tr("set.confirmHaltBody") : confirm.kind === "template" ? `${confirm.label} — ${tr("set.tplConfirmBody")}` : confirm.kind === "vport" ? `${vpAdds.map((a) => "+" + a.name).concat(vpDeletes.map((n) => "−" + n)).join(" ")} — ${tr("set.vportConfirmBody")}` : confirm.kind === "speed" ? `${spChanged.map((g) => `${g.ports.join(" · ")} → ${formatPortSpeed(spDraft[g.qlm])}`).join("; ")} — ${tr("set.speedConfirmBody")}` : confirm.kind === "bypass" ? `${confirm.pair.ports.join(" · ")} — ${confirm.on ? tr("set.bypassConfirmOff") : tr("set.bypassConfirmOn")}` : confirm.kind === "delUser" ? `${tr("set.acctConfirmDeleteBody")} (${confirm.name})` : ["restoreFile","factory","fwUpload","fwOnline"].includes(confirm.kind) ? tr("set." + confirm.kind + "Body") : tr("set.confirmApplyBody")}</p>
            {/* The reset takes the management address with it, so this session
                ends the moment it is confirmed. Say where to continue while the
                user can still choose not to. */}
            {confirm.kind === "bypass" &&
              <p className="modal-body"><strong>{tr("set.bypassConfirmNow")}</strong></p>}
            {confirm.kind === "factory" &&
              <p className="modal-body"><strong>{tr("set.factoryIp")} <span className="mono">{FACTORY_MGMT_IP}</span></strong></p>}
            <button className="opt drop" onClick={() => {
              const k = confirm.kind;
              setConfirm(null);
              if (k === "zone") { submitForm("/grism/set_time_zone", "timezone", zone, () => setZoneBase(zone)); return; }
              if (k === "reboot" || k === "halt") { submitPower(k === "reboot" ? "/grism/task/reboot" : "/grism/task/halt", k); return; }
              if (k === "restoreFile") {
                uploadAndWait("/grism/task/restore_from_file", restoreFile, "file",
                  tr("set.bkRestoring"), tr("set.bkRestoringBody")); return;
              }
              if (k === "fwUpload") {
                uploadAndWait("/grism/task/update", fwFile, "file",
                  tr("set.fwUpdating"), tr("set.fwUpdatingBody")); return;
              }
              /* Loading a template replaces the pipeline document, which is not
                 what this page is about -- so say so before leaving it. */
              if (k === "template") { onUseTemplate(confirm.tpl); return; }
              if (k === "vport") { submitVports(); return; }
              if (k === "speed") { submitSpeed(); return; }
              if (k === "bypass") {
                setBypassMode(bypassHw, confirm.pair, !confirm.on);
                return;
              }
              if (k === "delUser") {
                acctPost("/delete_user2", { Username: confirm.name, PasswordHash: "" }, "set.acctDeleted");
                return;
              }
              if (k === "factory") {
                fetch("/grism/task/restore", { method: "POST", credentials: "include" }).catch(() => {});
                // not bkRestoringBody: that one says to reload this page, which is
                // exactly what will not work once the address has moved
                setWait({ title: tr("set.bkResetting"), body: tr("set.factoryResetBody"),
                          phase: "updating", factory: true }); return;
              }
              if (k === "fwOnline") {
                // GET, like every other update endpoint. This one is a Django view
                // and its route is not wrapped in csrf_exempt, unlike the POST
                // routes next to it in urls.py — so a POST without a token was
                // rejected by CsrfViewMiddleware before the handler ever ran, and
                // the install silently never started. The handler reads nothing
                // from the request and does not check the method.
                fetch("/grism/task/update_download_update", { credentials: "include" }).catch(() => {});
                setWait({ title: tr("set.fwUpdating"), body: tr("set.fwUpdatingBody"), phase: "updating" }); return;
              }
              if (k === "flow") {
                submitConfigs([
                  buildArgsConfigSet(Object.fromEntries(FLOW_ARGS.map((key) => [key, sys[key]]))),
                  ...(lg ? [buildLoggingConfigSet(lg)] : []),
                ]);
                return;
              }
              if (k === "snmp") { submitForm("/grism/set_snmp_read_community", "read_community", community,
                () => setCommunityBase(community)); return; }
              /* Correlation lives in <args>, decapsulation in <filters>; the
                 device takes one configSet at a time, so send both. */
              /* Same split as SD-WAN: the switches are <args>, the GTP
                 decapsulation flag is a filter, and the device takes one
                 configSet at a time. */
              if (k === "mec") {
                submitConfigs([
                  buildArgsConfigSet(Object.fromEntries(MEC_ARG_KEYS.map((key) => [key, sys[key]]))),
                  buildInTunnelsConfigSet({ GTP: !!sys.tun_GTP }),
                ]);
                return;
              }
              if (k === "sdwan") {
                const tidy = (k) => (k.endsWith("CorrelationPort")
                  ? formatPortList(parsePortList(sys[k]))     // the device had "    " in one of these
                  : sys[k]);
                submitConfigs([
                  buildArgsConfigSet(Object.fromEntries(SDWAN_ARG_KEYS.map((key) => [key, tidy(key)]))),
                  buildInTunnelsConfigSet({ GRE: !!sys.tun_GRE, VXLAN: !!sys.tun_VXLAN }),
                ]);
                return;
              }
              if (k === "args" && confirm.keys?.includes("deduplicationPorts")) {
                submitConfigs([buildArgsConfigSet({
                  deduplication: !!sys.deduplication,
                  deduplicationPorts: formatPortList(parsePortList(sys.deduplicationPorts)),
                })]);
                return;
              }
              /* The firmware reads the port enable flags at startup, so a
                 port switched on or off does nothing until it restarts. A
                 description-only edit is picked up live and applies as normal. */
              if (k === "ports" && portEnableChanged) {
                submitAndReboot(buildPortConfigSet(changedPorts(portsBase, ports)),
                  { title: tr("set.portsApplying"), body: tr("set.portsApplyingBody"), phaseKey: "set.ptPhase." });
                return;
              }
              const xml =
                k === "ip" ? buildMgmtConfigSet(confirm.iface)
                : k === "ports" ? buildPortConfigSet(changedPorts(portsBase, ports))
                : k === "services" ? buildServicesConfigSet(changedServices(svcBase, svc))
                : k === "tunnels" ? buildInTunnelsConfigSet(Object.fromEntries(TUNNELS.map((t) => [t, !!sys["tun_" + t]])))
                : k === "heartbeat" ? buildHeartbeatConfigSet(hb)
                : k === "logging" ? buildLoggingConfigSet(lg)
                : k === "views" ? buildViewsConfigSet(views)
                : k === "extras" ? buildServiceExtrasConfigSet(extras)
                : k === "args" ? buildArgsConfigSet(Object.fromEntries(confirm.keys.map((key) => [key, sys[key]])))
                : raw;
              submitConfig(xml);
            }}>
              <span className="opt-name">{tr("set.confirmApply")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setConfirm(null)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}

      {/* Firmware update, restore and factory reset take the device away for
          minutes. Hold the page so nothing else is submitted meanwhile and the
          user can see how long is left. setWait/setPowered had been setting this
          state, and the countdown effect had been ticking it down, but nothing
          ever rendered it — so every one of those flows looked like it had done
          nothing at all. */}
      {wait && (
        <div className="apply-overlay">
          <div className="apply-card">
            {wait.phase === "done" ? <div className="apply-tick">✓</div> : <div className="apply-spinner" />}
            <div className="apply-msg">{wait.title}</div>
            <div className="apply-sub">{wait.body}</div>
            <div className={"apply-phase" + (wait.phase === "done" ? " ok" : "")}>
              {tr((wait.phaseKey ?? "set.fwPhase.") + wait.phase)}
            </div>
            {/* A factory reset never reaches "done": the device comes back on its
                factory address, so the poll against this one can only ever see it
                offline. Send the user there instead of waiting for a completion
                that cannot arrive. Reloading this page would not help either. */}
            {wait.factory
              ? <a className="primary" href={`https://${FACTORY_MGMT_IP}/grism-studio/`}>
                  {tr("set.factoryIp")} <span className="mono">{FACTORY_MGMT_IP}</span>
                </a>
              : wait.phase === "done" &&
                /* The device may now be serving a different build of this page, so
                   offer a reload rather than dropping the user back into the old one. */
                <button className="primary" onClick={() => window.location.reload()}>{tr("set.fwReload")}</button>}
          </div>
        </div>
      )}
      {powered && (
        <div className="apply-overlay">
          <div className="apply-card">
            <div className="apply-spinner" />
            <div className="apply-msg">{tr(powered === "reboot" ? "set.rebooting" : "set.halting")}</div>
            <div className="apply-sub">{tr(powered === "reboot" ? "set.rebootingBody" : "set.haltingBody")}</div>
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
/* Shared polling for the traffic pages: fetch on sign-in, refresh on an interval
   the user controls, and expose the plumbing each page needs for its header. */
function usePolledJson(url, loggedIn, { transform, defaultSec = 10, prefKey = "refreshSecStats", followSec = null } = {}) {
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState("idle");   // idle | loading | ok | error
  const [errMsg, setErrMsg] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState(null);
  // The statistics pages refresh less often than the interface counters — their
  // data moves slowly and the payloads are much larger.
  const [ownSec, setRefreshSec] = React.useState(() => readPrefs()[prefKey] ?? defaultSec);
  // a secondary poll on the same page follows the primary one's interval
  const refreshSec = followSec ?? ownSec;
  React.useEffect(() => { if (followSec == null) writePref(prefKey, ownSec); }, [prefKey, ownSec, followSec]);

  /* Two things a plain setInterval gets wrong against a slow device: it fires
     whether or not the last request came back, so requests stack up; and the
     answers can arrive out of order, so a late older sample overwrites a newer
     one and the counters visibly go backwards. A sequence number drops stale
     answers, and re-arming after each response means only one is ever in
     flight. */
  const seqRef = React.useRef(0);
  const load = React.useCallback(async () => {
    const mine = ++seqRef.current;
    setState((s) => (s === "ok" ? "ok" : "loading"));
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (mine !== seqRef.current) return;             // a newer read already answered
      setData(transform ? transform(json) : json);
      setState("ok"); setUpdatedAt(new Date()); setErrMsg("");
    } catch (e) {
      if (mine !== seqRef.current) return;
      setState("error"); setErrMsg(String(e.message || e));
    }
  }, [url]);

  React.useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);
  React.useEffect(() => {
    if (!loggedIn) return;
    let alive = true, timer = 0;
    const gap = Math.max(1, Number(refreshSec) || 5) * 1000;
    const arm = () => { timer = setTimeout(tick, gap); };
    const tick = async () => {
      if (!alive) return;
      // a hidden tab is not being read; polling it only costs the device
      if (typeof document !== "undefined" && document.visibilityState === "hidden") { arm(); return; }
      await load();
      if (alive) arm();
    };
    arm();
    return () => { alive = false; clearTimeout(timer); };
  }, [refreshSec, loggedIn, load]);

  return { data, state, errMsg, updatedAt, refreshSec, setRefreshSec, reload: load };
}

/* The header every traffic page shares: title, last-updated, interval, refresh. */
function TrafficHead({ title, tr, poll, onClear }) {
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="sys-head">
      <h2 className="sys-title">{title}</h2>
      <div className="sys-controls">
        {poll.updatedAt && <span className="sys-updated">{tr("tf.updated")} {poll.updatedAt.toLocaleTimeString()}</span>}
        <label className="tf-interval">{tr("tf.every")}
          <input type="number" min="1" value={poll.refreshSec} onChange={(e) => poll.setRefreshSec(e.target.value)} />
          {tr("tf.seconds")}</label>
        {onClear && (
          <button className="del" disabled={busy} onClick={() => setAsking(true)}>
            {busy ? tr("tf.clearing") : tr("tf.clear")}</button>
        )}
        <button className="sys-refresh" onClick={poll.reload} disabled={poll.state === "loading"}>
          {poll.state === "loading" ? tr("tf.refreshing") : tr("tf.refresh")}</button>
      </div>
      {asking && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setAsking(false)}>
          <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{tr("tf.clearTitle")}</div>
            <p className="modal-body">{tr("tf.clearBody")}</p>
            <button className="opt drop" onClick={async () => {
              setAsking(false); setBusy(true);
              try { await onClear(); await poll.reload(); } catch { /* reported by the poll */ }
              finally { setBusy(false); }
            }}>
              <span className="opt-name">{tr("tf.clear")}</span>
              <span className="opt-desc">{tr("tf.clearDesc")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setAsking(false)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Counters live on the device, so clearing is a request rather than local state. */
const clearCounters = (url) => fetch(url, { credentials: "include" })
  .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); });

/* A compact breakdown table (protocols / ports): busiest first with a share bar. */
function BreakdownTable({ rows, keyLabel, labelOf, tr, limit = 10 }) {
  const [showAll, setShowAll] = React.useState(false);
  if (!rows.length) return <p className="sys-note dim">{tr("sess.none")}</p>;
  const max = Math.max(...rows.map((r) => r.concurrent), 1);
  // rows arrive busiest-first, so the head of the list is the part worth showing
  const shown = showAll ? rows : rows.slice(0, limit);
  const hidden = rows.length - shown.length;
  return (
    <>
      <table className="tf-mini-table">
        <thead><tr><th>{keyLabel}</th><th className="tf-num">{tr("sess.sessions")}</th><th className="tf-num">{tr("sess.bytes")}</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key}>
              <td className="mono">{labelOf(r.key)}</td>
              <td className="tf-num">
                <div className="tf-share"><div className="tf-share-bar"><div style={{ width: (r.concurrent / max) * 100 + "%" }} /></div><span className="mono">{fmtNum(r.concurrent)}</span></div>
              </td>
              <td className="tf-num mono">{fmtBytes(r.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(hidden > 0 || showAll) && (
        <button className="tf-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `▴ ${tr("tf.showLess")}` : `▾ ${tr("tf.showAll")} (${hidden})`}
        </button>
      )}
    </>
  );
}

/* ============================================================
   T12S front panel — the ports as they sit on the box
   ============================================================ */
function FrontPanel({ model, stats, mgmtStat, bypassed, bypassedPorts, stale = false, t }) {
  const tr = t || ((k) => k);
  const L = panelLayout(model);
  const st = panelStates(stats, model);
  const topRow = Math.min(...L.cages.map((c) => c.y));
  /* Nothing read yet, or nothing readable: the lamps say nothing rather than
     saying every link is down, which is a different and alarming claim. */
  const blind = !(stats ?? []).length;
  const mgmt = panelPortState(mgmtStat);
  /* Anything at all counts as activity: the panel answers "is traffic moving
     here", and the table above it carries the rates. */
  const moving = (v) => v > 0;
  return (
    <section className="panel-strip">
      <div className="panel-wrap">
        <svg viewBox={`0 0 ${L.width} ${L.height}`}
          className={"fp" + (blind ? " blind" : "") + (stale ? " stale" : "")}
          role="img" aria-label={tr("panel.title")}>
          <rect x="1" y="1" width={L.width - 2} height={L.height - 2} rx="10" className="fp-chassis" />
          {/* management port, immediately left of P0 */}
          <g>
            <rect x={L.mgmt.x} y={L.mgmt.y} width={L.mgmt.w} height={L.mgmt.h} rx="3" className="fp-mgmt" />
            <rect x={L.mgmt.x + 8} y={L.mgmt.y + L.mgmt.h - 9} width={18} height={6} rx="1" className="fp-mgmt-clip" />
            {/* the management port has a link light like any other */}
            <circle cx={L.mgmt.x + 5} cy={L.mgmt.y + L.mgmt.h - 5} r="2.6"
              className={"fp-led" + (!blind && mgmt.link ? " on" : "")} />
            <title>{`${tr("panel.mgmt")} — ${blind ? tr("panel.unknown") : mgmt.link ? tr("panel.keyUp") : tr("panel.keyDown")}`}</title>
            <text x={L.mgmt.x + L.mgmt.w / 2} y={L.mgmt.y + L.mgmt.h + 11} className="fp-lbl mgmt">{tr("panel.mgmt")}</text>
          </g>
          {/* the lamps this chassis carries, if any -- on a G8S the two bypass
              pairs, whose state the page already knows */}
          {bypassed && (L.lamps ?? []).map((l) => {
            const on = !blind && !!bypassed?.has(l.pair);
            return (
              <g key={l.id}>
                <circle cx={l.x} cy={l.y} r="3" className={"fp-led byp" + (on ? " on" : "")} />
                <text x={l.x + 8} y={l.y + 3} className="fp-lbl lamp">{l.id}</text>
                <title>{`${l.id} — ${blind ? tr("panel.unknown") : on ? tr("panel.bypassOn") : tr("panel.bypassOff")}`}</title>
              </g>
            );
          })}
          {L.cages.map((c) => {
            const s = st[c.name] ?? { link: false, rx: 0, tx: 0 };
            const cx = c.x + c.w / 2;
            const labelAbove = c.y === topRow;
            return (
              <g key={c.name} className={"fp-port" + (!blind && s.link ? " up" : "")
                + (bypassedPorts?.has(c.name) ? " byp" : "")}>
                <rect x={c.x} y={c.y} width={c.w} height={c.h} rx="3" className="fp-cage" />
                {c.kind === "rj45" ? (
                  /* a jack: the opening with the latch notch cut into its top */
                  <path className="fp-slot" d={`M ${c.x + 8} ${c.y + 4}
                    h ${c.w - 16} v ${c.h - 14} h -${c.w - 16} z
                    M ${c.x + c.w / 2 - 4} ${c.y + 4} h 8 v -3 h -8 z`} />
                ) : (
                  <rect x={c.x + 5} y={c.y + 5} width={c.w - 10} height={c.h - 16} rx="1.5" className="fp-slot" />
                )}
                {/* the state in words, for anyone not reading the colours */}
                <title>{`${c.name} — ${blind ? tr("panel.unknown")
                  : s.link ? [tr("panel.keyUp"), moving(s.rx) && tr("panel.keyRx"), moving(s.tx) && tr("panel.keyTx")]
                    .filter(Boolean).join(", ")
                  : tr("panel.keyDown")}${bypassedPorts?.has(c.name) ? " · " + tr("tf.bypass") : ""}`}</title>
                {/* the link light, as on the front of the box */}
                <circle cx={c.x + 6} cy={c.y + c.h - 5} r="2.6" className={"fp-led" + (!blind && s.link ? " on" : "")} />
                {/* in and out, lit only while something is moving */}
                <path d={`M ${cx - 9} ${c.y + c.h - 8} l 4 5 l 4 -5 z`}
                  className={"fp-act rx" + (!blind && moving(s.rx) ? " on" : "")} />
                <path d={`M ${cx + 1} ${c.y + c.h - 3} l 4 -5 l 4 5 z`}
                  className={"fp-act tx" + (!blind && moving(s.tx) ? " on" : "")} />
                <text x={cx} y={labelAbove ? c.y - 5 : c.y + c.h + 11} className="fp-lbl">{c.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {blind && <p className="sys-note dim">{tr("panel.noData")}</p>}
      {!blind && stale && <p className="set-hint warn">{tr("panel.stale")}</p>}
      <div className="fp-key" title={tr("panel.note")}>
        <span><i className="fp-key-led on" /> {tr("panel.keyUp")}</span>
        <span><i className="fp-key-led" /> {tr("panel.keyDown")}</span>
        <span><i className="fp-key-rx" /> {tr("panel.keyRx")}</span>
        <span><i className="fp-key-tx" /> {tr("panel.keyTx")}</span>
        {bypassed && (L.lamps ?? []).length > 0 &&
          <span><i className="fp-key-byp" /> {tr("panel.keyBypass")}</span>}
      </div>
    </section>
  );
}

function TrafficTab({ loggedIn, t, model = "" }) {
  const tr = t || ((k) => k);
  const [rows, setRows] = React.useState([]);
  const [sessions, setSessions] = React.useState(null); // { v4:{total,concurrent}, v6:{total,concurrent} }
  const [descs, setDescs] = React.useState({});         // { portName: description }
  const [devModel, setDevModel] = React.useState("");   // from this page's own get_config
  const [state, setState] = React.useState("idle");   // idle | loading | ok | error
  const [errMsg, setErrMsg] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState(null);
  const [refreshSec, setRefreshSec] = React.useState(() => readPrefs().refreshSec ?? 5);
  React.useEffect(() => { writePref("refreshSec", refreshSec); }, [refreshSec]);
  const [expanded, setExpanded] = React.useState(null); // idx of the open detail row
  const [showPhys, setShowPhys] = React.useState(false); // when V-ports exist, also show physical
  /* Which ports sit behind a closed bypass relay. Read once when the page opens
     and not again: a relay only moves when somebody moves it, so polling it
     alongside the counters would be several ssh round trips a second on a T12S
     for a value that does not change. */
  const [bypassed, setBypassed] = React.useState(new Set());
  // the same answer keyed by pair, for the front panel's BYP lamps
  const [bypassedPairs, setBypassedPairs] = React.useState(null);   // null = the device would not say

  React.useEffect(() => {
    if (!loggedIn) { setBypassed(new Set()); setBypassedPairs(null); return; }
    let live = true;
    (async () => {
      try {
        const cfg = await (await fetch("/grism/task/get_config", { credentials: "include" })).json();
        const hw = bypassSupport((cfg.args && cfg.args.model) || cfg.model || "");
        if (!hw) return;
        const out = new Set(), pairs = new Set();
        let known = true;
        for (const pair of hw.pairs) {
          const res = await fetch(bypassStatusUrl(hw.key, pair.n), { credentials: "include" });
          const state = res.ok ? parseBypassStatus(await res.text()) : null;
          if (state === null) { known = false; continue; }
          if (state === true) { pair.ports.forEach((n) => out.add(n)); pairs.add(pair.n); }
        }
        if (live) { setBypassed(out); setBypassedPairs(known ? pairs : null); }
      } catch { /* a device that cannot say leaves the column unmarked */ }
    })();
    return () => { live = false; };
  }, [loggedIn]);

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
      setDevModel(String((json.args ?? {}).model ?? ""));
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

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;

  // detail field groups for the expanded ingress view
  const DETAIL_SIMPLE = ["inMulticastPackets", "inBroadcastPackets", "inDups", "inDropBytes"];
  const DETAIL_LEN = ["inLen64Packets", "inLen65-127Packets", "inLen128-255Packets", "inLen256-511Packets", "inLen512-1023Packets", "inLen1024-1518Packets", "inLen1519-MaxPackets"];
  const DETAIL_ERR = ["inFcsAlignErrorPackets", "inRuntErrorPackets", "inRuntCrcErrorPackets", "inOversizeErrorPackets", "inOversizeCrcErrorPackets"];
  const COLSPAN = 15;

  return (
    <div className="sys-wrap">
      {/* the same header the statistics pages use, so clearing works identically */}
      <TrafficHead title={tr("tf.title")} tr={tr}
        poll={{ updatedAt, refreshSec, setRefreshSec, reload: load, state }}
        onClear={() => clearCounters("/grism/task/clear_lite_counters")} />

      {state === "error" && <div className="sys-err">{tr("tf.loadFailed")}: {errMsg}</div>}

      {/* the ports as they sit on the box, above the table that lists them --
          it is the first thing worth looking at, so it goes first */}
      {hasFrontPanel(model || devModel) && (
        <FrontPanel model={model || devModel} stats={rows}
          mgmtStat={rows.find((r) => r.name === "H1")}
          bypassed={bypassedPairs} bypassedPorts={bypassed}
          stale={state === "error"} t={t} />
      )}

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
                      <td className="tf-name">{r.name}
                        {bypassed.has(r.name) &&
                          <span className="tf-bypass" title={tr("tf.bypassTip")}>{tr("tf.bypass")}</span>}
                      </td>
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


/* ============================================================
   Traffic → Sessions: session tables, protocol/port breakdowns,
   packet types and filter hit counters
   ============================================================ */
function TrafficSessionsTab({ loggedIn, t, filterNames = {} }) {
  const tr = t || ((k) => k);
  const poll = usePolledJson("/grism/task/get_statistics_json", loggedIn);
  const fPoll = usePolledJson("/grism/task/get_filter_counter", loggedIn, { followSec: poll.refreshSec });
  // heartbeat: the status rows are positional, so the target list labels them
  const hbPoll = usePolledJson("/grism/task/get_heartbeat_status", loggedIn, { followSec: poll.refreshSec });
  /* The target list only labels the status rows, and it changes when someone
     edits the settings -- not every tick. Polling the whole configuration
     document alongside the counters re-downloaded it every refresh, on a device
     that is already the slow part, for a card that is not even drawn when there
     are no targets. */
  const [hbTargets, setHbTargets] = React.useState([]);
  React.useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_config", { credentials: "include" });
        if (res.ok && alive) setHbTargets(parseHeartbeat(await res.json()).targets);
      } catch { /* the rows simply stay unlabelled */ }
    })();
    return () => { alive = false; };
  }, [loggedIn]);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;

  const v4 = summarizeSessions(poll.data?.sessions);
  const v6 = summarizeSessions(poll.data?.sessionsv6, { v6: true });
  const pkts = summarizePacketTypes(poll.data?.packet_type_counter);
  const filters = summarizeFilterCounters(fPoll.data?.filter_counter);
  const hbRows = heartbeatStatusRows(hbTargets, parseHeartbeatStatus(hbPoll.data));

  const family = (info, label, protoLabel) => info && (
    <section className="sys-card">
      <h3 className="sys-card-title">{label}
        <span className="sys-card-metric">{fmtNum(info.concurrent)} {tr("sess.concurrent").toLowerCase()}</span>
      </h3>
      <div className="sess-figures">
        <div><span className="sess-k">{tr("sess.total")}</span><span className="sess-v mono">{fmtNum(info.total)}</span></div>
        <div><span className="sess-k">{tr("sess.concurrent")}</span><span className="sess-v mono">{fmtNum(info.concurrent)}</span>
          <span className="sess-sub mono">{fmtPct(info.usage)} {tr("sess.ofTotal")}</span></div>
        <div><span className="sess-k">{tr("sess.netflow")}</span><span className="sess-v mono">{fmtNum(info.netflowCount)}</span>
          <span className="sess-sub mono">{info.netflowEps} {tr("sess.eps")}</span></div>
      </div>
      <div className="sess-breakdowns">
        <div><div className="sess-bd-head">{protoLabel}</div>
          <BreakdownTable rows={info.protocols} keyLabel={tr("sess.proto")} labelOf={protocolName} tr={tr} /></div>
        <div><div className="sess-bd-head">{tr("sess.tcpPorts")}</div>
          <BreakdownTable rows={info.tcp} keyLabel={tr("sess.port")} labelOf={portLabel} tr={tr} /></div>
        <div><div className="sess-bd-head">{tr("sess.udpPorts")}</div>
          <BreakdownTable rows={info.udp} keyLabel={tr("sess.port")} labelOf={portLabel} tr={tr} /></div>
      </div>
    </section>
  );

  return (
    <div className="sys-wrap">
      <TrafficHead title={tr("sess.title")} tr={tr} poll={poll}
        onClear={() => clearCounters("/grism/task/clear_counters").then(() => fPoll.reload())} />
      <p className="page-note">{tr("sess.note")}</p>
      {poll.state === "error" && <div className="sys-err">{tr("tf.loadFailed")}: {poll.errMsg}</div>}

      <div className="sess-families">
        {family(v4, tr("sess.v4"), tr("sess.protocols"))}
        {family(v6, tr("sess.v6"), tr("sess.nextHdr"))}
      </div>

      {pkts.length > 0 && (
        <section className="sys-card">
          <h3 className="sys-card-title">{tr("sess.pktTypes")}</h3>
          <div className="tf-detail-grid">
            {pkts.map((p) => (
              <div className="tf-dcell" key={p.key}>
                <span className="tf-dk">{p.key}</span>
                <span className={"tf-dv mono" + (p.count ? "" : " dim")}>{fmtNum(p.count)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hbRows.length > 0 && (
        <section className="sys-card">
          <h3 className="sys-card-title">{tr("set.heartbeat")}
            <span className="sys-card-metric">{hbRows.filter((r) => r.up).length}/{hbRows.length} {tr("set.hbUp")}</span>
          </h3>
          <table className="tf-table">
            <thead><tr>
              <th>{tr("set.hbTargets")}</th><th>{tr("set.hbSend")}</th><th>{tr("set.hbReceive")}</th>
              <th>{tr("tf.desc")}</th><th>{tr("tf.link")}</th>
            </tr></thead>
            <tbody>
              {hbRows.map((r) => (
                <tr key={r.index}>
                  <td className="tf-name mono">{r.id == null ? `#${r.index}` : `ID ${r.id}`}</td>
                  <td className="mono">{r.sendPort || "—"}</td>
                  <td className="mono">{r.receivePort || "—"}</td>
                  <td className="dim">{r.description || "—"}</td>
                  <td><span className={"hb-state " + (r.up ? "up" : "down")}>
                    <span className="dot" />{r.up ? tr("set.hbUp") : tr("set.hbDown")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="sys-card">
        <h3 className="sys-card-title">{tr("sess.filters")} <span className="sys-card-metric">{filters.length}</span></h3>
        {filters.length === 0 ? <p className="sys-note dim">{tr("sess.noFilters")}</p> : (
          <table className="tf-table sess-filter-table">
            <thead><tr>
              <th>{tr("sess.filterId")}</th><th>{tr("common.name")}</th><th className="tf-num">{tr("sess.refs")}</th>
              <th className="tf-num">{tr("sess.tried")}</th><th className="tf-num">{tr("sess.matched")}</th>
              <th>{tr("sess.rate")}</th><th className="tf-num">{tr("sess.perSec")}</th>
            </tr></thead>
            <tbody>
              {filters.map((f) => (
                <tr key={f.id}>
                  <td className="tf-name">F{f.id}</td>
                  <td className="dim">{filterNames?.[f.id] || <span className="dim">—</span>}</td>
                  <td className="tf-num mono">{f.refs}</td>
                  <td className="tf-num mono">{fmtNum(f.tried)}</td>
                  <td className="tf-num mono">{fmtNum(f.matched)}</td>
                  <td>
                    <div className="tf-share">
                      <div className="tf-share-bar"><div style={{ width: (f.rate * 100).toFixed(1) + "%" }} /></div>
                      <span className="mono">{(f.rate * 100).toFixed(f.rate >= 0.1 ? 0 : 2)}%</span>
                    </div>
                  </td>
                  <td className="tf-num mono">{f.perSecond}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  );
}

/* Hosts behind one service. Busy services can list hundreds, so only the top
   talkers are shown until the user asks for the rest. */
function HostTable({ hosts, tr, limit = 20 }) {
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? hosts : hosts.slice(0, limit);
  const hidden = hosts.length - shown.length;
  return (
    <>
      <table className="tf-mini-table">
        <thead><tr><th>{tr("svc.host")}</th><th className="tf-num">{tr("sess.sessions")}</th><th className="tf-num">{tr("sess.bytes")}</th></tr></thead>
        <tbody>
          {shown.map((h) => (
            <tr key={h.ip}>
              <td className="mono">{h.ip}</td>
              <td className="tf-num mono">{fmtNum(h.sessions)}</td>
              <td className="tf-num mono">{fmtBytes(h.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(hidden > 0 || showAll) && (
        <button className="tf-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `▴ ${tr("tf.showLess")}` : `▾ ${tr("tf.showAll")} (${hidden})`}
        </button>
      )}
    </>
  );
}

/* ============================================================
   Traffic → Services: flow services and the hosts behind them
   ============================================================ */
function TrafficServicesTab({ loggedIn, t }) {
  const tr = t || ((k) => k);
  const poll = usePolledJson("/grism/task/get_flow_service", loggedIn);
  const [open, setOpen] = React.useState(null);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;
  const services = summarizeFlowServices(poll.data?.flow_service);

  return (
    <div className="sys-wrap">
      <TrafficHead title={tr("svc.title")} tr={tr} poll={poll} />
      <p className="page-note">{tr("svc.note")}</p>
      {poll.state === "error" && <div className="sys-err">{tr("tf.loadFailed")}: {poll.errMsg}</div>}

      {services.length === 0 ? <p className="sys-note dim">{tr("svc.none")}</p> : (
        <div className="tf-table-wrap">
          <table className="tf-table">
            <thead><tr>
              <th className="tf-expander" /><th>{tr("svc.service")}</th><th>{tr("svc.scope")}</th>
              <th className="tf-num">{tr("svc.hosts")}</th><th className="tf-num">{tr("sess.sessions")}</th>
              <th className="tf-num">{tr("sess.bytes")}</th>
            </tr></thead>
            <tbody>
              {services.map((s, i) => {
                const isOpen = open === i;
                return (
                  <React.Fragment key={i}>
                    <tr className={"tf-row" + (isOpen ? " open" : "")} onClick={() => setOpen(isOpen ? null : i)}>
                      <td className="tf-expander"><span className="tf-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span></td>
                      <td className="tf-name">{s.name}</td>
                      <td><span className={"svc-scope " + s.scope}>{tr("svc." + s.scope)}</span></td>
                      <td className="tf-num mono">{s.hosts.length}</td>
                      <td className="tf-num mono">{fmtNum(s.sessions)}</td>
                      <td className="tf-num mono">{fmtBytes(s.bytes)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="tf-detail-row"><td colSpan={6}>
                        <div className="tf-detail">
                          <div className="tf-detail-title">{tr("svc.hosts")} · <code>{s.name}</code></div>
                          <HostTable hosts={s.hosts} tr={tr} />
                        </div>
                      </td></tr>
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

/* ============================================================
   Traffic → Countries: GeoIP traffic breakdown
   ============================================================ */
function TrafficCountriesTab({ loggedIn, t, lang = "en" }) {
  const tr = t || ((k) => k);
  const [showAll, setShowAll] = React.useState(false);
  const poll = usePolledJson("/grism/task/get_country_counter", loggedIn);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;
  const { rows, totalBytes, totalPackets } = summarizeCountries(poll.data?.country_counter);
  // rows arrive busiest-first, so the head of the list is the part worth showing
  const shownRows = showAll ? rows : rows.slice(0, 20);
  const hiddenRows = rows.length - shownRows.length;

  return (
    <div className="sys-wrap">
      <TrafficHead title={tr("ctry.title")} tr={tr} poll={poll} />
      {poll.state === "error" && <div className="sys-err">{tr("tf.loadFailed")}: {poll.errMsg}</div>}

      {rows.length === 0 ? <p className="sys-note dim">{tr("ctry.none")}</p> : (
        <>
          <div className="tf-flow-line">
            <span className="tf-flow-seg"><b>{tr("ctry.packets")}</b> <span className="mono">{fmtNum(totalPackets)}</span></span>
            <span className="tf-flow-div">|</span>
            <span className="tf-flow-seg"><b>{tr("ctry.bytes")}</b> <span className="mono">{fmtBytes(totalBytes)}</span></span>
          </div>
          <div className="tf-table-wrap">
            <table className="tf-table">
              <thead><tr>
                <th>{tr("ctry.country")}</th><th className="tf-num">{tr("ctry.packets")}</th>
                <th className="tf-num">{tr("ctry.bytes")}</th><th>{tr("ctry.share")}</th>
              </tr></thead>
              <tbody>
                {shownRows.map((r) => (
                  <tr key={r.iso}>
                    <td className="tf-name">
                      <span className="ctry-code mono">{r.iso}</span>
                      <span className="ctry-name">{countryName(r.iso, lang)}</span>
                    </td>
                    <td className="tf-num mono">{fmtNum(r.packets)}</td>
                    <td className="tf-num mono">{fmtBytes(r.bytes)}</td>
                    <td>
                      <div className="tf-share">
                        <div className="tf-share-bar"><div style={{ width: (r.share * 100).toFixed(1) + "%" }} /></div>
                        <span className="mono">{(r.share * 100).toFixed(r.share >= 0.1 ? 0 : 1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(hiddenRows > 0 || showAll) && (
            <button className="tf-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? `▴ ${tr("tf.showLess")}` : `▾ ${tr("tf.showAll")} (${hiddenRows})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ===================== storage browsing =====================
   Shared by the capture page and the replay-pcap inputs: list the enabled
   volumes, the directories inside one, and the files inside that. */
function useStorageBrowser(loggedIn, { defaultDir = "" } = {}) {
  const [storages, setStorages] = React.useState([]);
  const [storage, setStorage] = React.useState("");
  const [dir, setDir] = React.useState(defaultDir);
  const [files, setFiles] = React.useState([]);

  React.useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const res = await fetch("/grism/task/get_storages", { credentials: "include" });
        if (!res.ok) return;
        const list = parseStorages(await res.json());
        setStorages(list);
        setStorage((cur) => cur || list[0]?.name || "");
      } catch (e) { warnFetch("storage volumes", e); }
    })();
  }, [loggedIn]);

  const post = React.useCallback(async (fields) => {
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => body.set(k, v));
    const res = await fetch("/grism/task/get_storage_file_list", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }, []);

  // Open on the caller's preferred directory when the volume actually has it;
  // otherwise start at the volume root and let the user walk down from there.
  React.useEffect(() => {
    if (!loggedIn || !storage || !defaultDir) return;
    let alive = true;
    (async () => {
      try {
        const top = parseStorageDirs(await post({ name: storage }));
        if (alive) setDir(top.includes(defaultDir) ? defaultDir : "");
      } catch { if (alive) setDir(""); }
    })();
    return () => { alive = false; };
  }, [loggedIn, storage, post, defaultDir]);

  // Listing a volume with no directory gives its root; with one, that directory.
  const listFiles = React.useCallback(async () => {
    if (!storage) { setFiles([]); return; }
    try {
      const payload = dir ? await post({ name: storage, dir }) : await post({ name: storage });
      setFiles(parseStorageFiles(payload, { storage, dir }));
    } catch { setFiles([]); }
  }, [storage, dir, post]);
  React.useEffect(() => { if (loggedIn) listFiles(); }, [loggedIn, listFiles]);

  const enterDir = React.useCallback((name) => setDir((cur) => joinDir(cur, name)), []);
  const goUp = React.useCallback(() => setDir((cur) => parentDir(cur)), []);

  /* Delete one or several files. The device takes one filename per request, so
     they go in sequence; every failure is collected rather than stopping at the
     first, so a bad file can't hide the ones that did work. */
  const removeFiles = React.useCallback(async (names) => {
    const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
    const failed = [];
    for (const name of list) {
      try {
        const body = new URLSearchParams();
        body.set("name", storage); body.set("dir", dir); body.set("filename", name);
        const res = await fetch("/grism/task/del_storage_file", { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        if (!res.ok) throw new Error("HTTP " + res.status);
      } catch (e) { failed.push(`${name}: ${e.message || e}`); }
    }
    await listFiles();
    if (failed.length) throw new Error(failed.join("; "));
  }, [storage, dir, listFiles]);
  const removeFile = React.useCallback((name) => removeFiles([name]), [removeFiles]);

  return { storages, storage, setStorage, dir, setDir, files, listFiles, removeFile, removeFiles,
    enterDir, goUp, crumbs: dirCrumbs(dir),
    volume: storages.find((x) => x.name === storage) };
}

/* The volume and directory selectors both pages share. */
/* Just the volume: the directory is chosen by walking the breadcrumbs, so a
   separate dropdown would be a second way to do the same thing. */
function StoragePickers({ br, tr }) {
  return (
    <label className="ml"><span>{tr("cap.storage")}</span>
      <select value={br.storage} onChange={(e) => br.setStorage(e.target.value)}>
        {br.storages.length === 0 && <option value="">{tr("cap.noStorage")}</option>}
        {br.storages.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
      </select></label>
  );
}

/* A render error in one tab used to blank the whole application, leaving nothing
   to diagnose from. Contain it: the rest of the UI keeps working and the failure
   is shown with its stack so it can be reported. */
class TabErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[GRISM Studio] tab render failed:", error, info); }
  componentDidUpdate(prev) { if (prev.tabKey !== this.props.tabKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sys-wrap">
        <div className="sys-err tab-error">
          <b>{this.props.label}</b>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <pre>{String(this.state.error?.stack || "").split("\n").slice(0, 6).join("\n")}</pre>
          <button className="copy-btn" onClick={() => this.setState({ error: null })}>{this.props.retryLabel}</button>
        </div>
      </div>
    );
  }
}

/* Tracks which files are ticked for deletion, forgetting the selection whenever
   the listing changes so a stale name can't be sent. */
function useFileSelection(files) {
  const [marked, setMarked] = React.useState([]);
  const names = files.map((f) => f.name).join("\u0000");
  // keyed on the listing's contents: when the folder changes, drop names that
  // are no longer there so a stale selection can't be submitted
  React.useEffect(() => { setMarked((m) => m.filter((n) => files.some((f) => !f.isDir && f.name === n))); },
    [names, files]);
  const deletable = files.filter((f) => !f.isDir);
  return {
    marked, setMarked,
    toggle: (n) => setMarked((m) => (m.includes(n) ? m.filter((x) => x !== n) : [...m, n])),
    allOn: deletable.length > 0 && marked.length === deletable.length,
    toggleAll: () => setMarked((m) => (m.length === deletable.length ? [] : deletable.map((f) => f.name))),
    clear: () => setMarked([]),
    count: deletable.length,
  };
}

/* Where you are in the volume, and a way back out. */
function StorageCrumbs({ br, tr }) {
  return (
    <div className="crumbs">
      <button className="crumb" disabled={!br.dir} onClick={br.goUp} title={tr("in.up")}>↑</button>
      <button className={"crumb" + (br.dir ? "" : " on")} onClick={() => br.setDir("")}>
        {br.storage || tr("cap.storage")}
      </button>
      {br.crumbs.map((c, i) => (
        <React.Fragment key={c.path}>
          <span className="crumb-sep">/</span>
          <button className={"crumb" + (i === br.crumbs.length - 1 ? " on" : "")}
            onClick={() => br.setDir(c.path)}>{c.name}</button>
        </React.Fragment>
      ))}
    </div>
  );
}

/* Choose pcap files straight off the device's storage. Used inline by the
   replay-pcap input so paths never have to be typed. */
function StorageFilePicker({ tr, loggedIn, chosen = [], onChange, max = 100 }) {
  const br = useStorageBrowser(loggedIn, { defaultDir: "in" });
  const fileRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [ask, setAsk] = React.useState(null);        // files queued for deletion
  const sel = useFileSelection(br.files);

  const toggle = (path) => onChange(chosen.includes(path)
    ? chosen.filter((p) => p !== path)
    : [...chosen, path].slice(0, max));

  /* Upload one or more pcaps into the selected volume and directory. */
  const upload = async (list) => {
    const files = [...(list ?? [])];
    if (!files.length || !br.storage || !br.dir) return;
    setBusy(true); setErr("");
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("storage", br.storage);
        fd.append("dir", br.dir);
        fd.append("file", f, f.name);
        const res = await fetch("/grism/task/upload_pcap_file", { method: "POST", credentials: "include", body: fd });
        if (!res.ok) throw new Error(`${f.name}: HTTP ${res.status}`);
      }
      await br.listFiles();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const remove = async (names) => {
    setErr("");
    const list = Array.isArray(names) ? names : [names];
    try { await br.removeFiles(list); }
    catch (e) { setErr(String(e.message || e)); }
    finally {
      // deleted files can't be replayed, so drop them from the selection too
      const gone = new Set(list.map((n) => storagePath(br.storage, br.dir, n)));
      if (chosen.some((p) => gone.has(p))) onChange(chosen.filter((p) => !gone.has(p)));
      sel.clear();
    }
  };

  return (
    <div className="storage-picker">
      <div className="set-grid">
        <StoragePickers br={br} tr={tr} />
        <button className="copy-btn storage-reload" onClick={br.listFiles}>{tr("sys.refresh")}</button>
      </div>
      {br.volume && (
        <p className="set-hint">{tr("cap.used")} <span className="mono">{fmtKB(br.volume.usage)}</span>
          {" · "}{tr("cap.free")} <span className="mono">{fmtKB(br.volume.available)}</span></p>
      )}

      <div className="storage-upload">
        <input ref={fileRef} type="file" accept=".pcap,.pcapng,.cap" multiple style={{ display: "none" }}
          onChange={(e) => upload(e.target.files)} />
        <button className="copy-btn" disabled={busy || !br.storage || !br.dir}
          onClick={() => fileRef.current?.click()}>
          {busy ? tr("in.uploading") : tr("in.upload")}</button>
        <span className="dim">{tr("in.uploadHint")}</span>
      </div>
      {err && <div className="sys-err">{err}</div>}

      <StorageCrumbs br={br} tr={tr} />
      <div className="tf-table-wrap storage-files">
        <table className="tf-table">
          <thead><tr>
            <th>{tr("cap.file")}</th>
            <th className="tf-num">{tr("sess.bytes")}</th>
            <th>{tr("cap.modified")}</th>
            <th className="sel-head" colSpan={2}>
              <div className="sel-head-in">
                <button className="del" disabled={sel.marked.length === 0}
                  onClick={() => setAsk(sel.marked)}>
                  {tr("cap.delSelected")}{sel.marked.length > 0 ? ` (${sel.marked.length})` : ""}</button>
                <input type="checkbox" title={tr("cap.selectAll")}
                  checked={sel.allOn} disabled={sel.count === 0} onChange={sel.toggleAll} />
              </div>
            </th>
          </tr></thead>
          <tbody>
            {br.files.length === 0 && (
              <tr><td colSpan={5} className="dim storage-empty">{tr("cap.noFiles")}</td></tr>
            )}
            {br.files.map((f) => {
              if (f.isDir) return (
                <tr key={"d:" + f.name} className="cap-dir" onClick={() => br.enterDir(f.name)}>
                  <td className="mono cap-name"><span className="dir-icon" aria-hidden="true">▸</span> {f.name}</td>
                  <td className="tf-num dim">{tr("in.folder")}</td>
                  <td className="mono dim">{f.modified}</td>
                  <td /><td className="sel-col" />
                </tr>
              );
              const path = storagePath(br.storage, br.dir, f.name);
              return (
                <tr key={"f:" + f.name} className={sel.marked.includes(f.name) ? "marked" : ""}>
                  {/* the name is the control: clicking it queues the file for replay */}
                  <td className={"mono cap-name pick-name" + (chosen.includes(path) ? " picked" : "")}
                    onClick={() => toggle(path)} role="button" tabIndex={0}
                    title={chosen.includes(path) ? tr("in.remove") : tr("in.pickFiles")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(path); } }}>
                    <span className="pick-mark" aria-hidden="true">{chosen.includes(path) ? "✓" : ""}</span>
                    {f.name}
                  </td>
                  <td className="tf-num mono">{fmtBytes(f.bytes)}</td>
                  <td className="mono dim">{f.modified}</td>
                  <td className="cap-actions">
                    {isPartialCapture(f.name)
                      ? <span className="dim file-partial">{tr("cap.writing")}</span>
                      : <a className="copy-btn" href={f.href} download>{tr("cap.download")}</a>}
                  </td>
                  <td className="sel-col">
                    <input type="checkbox" title={tr("cap.markForDelete")}
                      checked={sel.marked.includes(f.name)} onChange={() => sel.toggle(f.name)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ask && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setAsk(null)}>
          <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{ask.length > 1 ? `${tr("cap.delTitleN")} (${ask.length})` : tr("cap.delTitle")}</div>
            <p className="modal-body">{tr("cap.delBody")}
              <br />{ask.map((n) => <code className="cap-del-name" key={n}>{n}</code>)}</p>
            <button className="opt drop" onClick={() => { const n = ask; setAsk(null); remove(n); }}>
              <span className="opt-name">{tr("common.delete")}</span>
              <span className="opt-desc">{tr("cap.delDesc")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setAsk(null)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Traffic → Capture: record packets to a storage volume for a
   fixed number of seconds, then download the pcap
   ============================================================ */
function CaptureTab({ loggedIn, t, ports, filterIds }) {
  const tr = t || ((k) => k);
  const [sel, setSel] = React.useState([]);          // ingress ports
  const [filter, setFilter] = React.useState("");
  const [stl, setStl] = React.useState(5);
  const br = useStorageBrowser(loggedIn, { defaultDir: "snapshot" });
  const { storage, dir, files, listFiles } = br;
  const [running, setRunning] = React.useState(0);   // seconds left while capturing
  const [err, setErr] = React.useState("");
  const [auto, setAuto] = React.useState(true);     // keep the folder listing fresh
  const [ask, setAsk] = React.useState(null);       // { kind: "start" | "delete", file? }
  const [applying, setApplying] = React.useState(false);
  const fileSel = useFileSelection(files);

  // while a capture runs, count down and refresh the folder every second
  React.useEffect(() => {
    if (running <= 0) return;
    const id = setInterval(() => { listFiles(); setRunning((n) => n - 1); }, 1000);
    return () => clearInterval(id);
  }, [running, listFiles]);
  React.useEffect(() => { if (running === 0) listFiles(); }, [running]);  // final refresh
  React.useEffect(() => {
    if (!loggedIn || !auto || running > 0) return;   // the capture poll covers the running case
    const id = setInterval(listFiles, 5000);
    return () => clearInterval(id);
  }, [loggedIn, auto, running, listFiles]);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;

  const opts = { ports: sel, filter, stl: Number(stl) || 0, storage, dir };
  const problems = captureProblems(opts);

  const start = async () => {
    setErr("");
    try {
      const body = new URLSearchParams(); body.set("data", buildInstantCapture(opts));
      const res = await fetch("/grism/task/submit_instant", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // The device needs a moment to apply the configuration. Counting down from
      // the submit would start the clock before the capture does, so wait until
      // it reports it has finished loading.
      setApplying(true);
      await new Promise((r) => setTimeout(r, 1000));
      for (let i = 0; i < 60; i++) {
        try {
          const st = await fetch("/grism/task/get_status", { credentials: "include" });
          if (st.ok) {
            const body = await st.json().catch(() => null);
            if (body && body.loading === false) break;
          }
        } catch { /* keep waiting */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setApplying(false);
      setRunning(Number(stl) || 0);
    } catch (e) { setApplying(false); setErr(String(e.message || e)); }
  };

  return (
    <div className="sys-wrap">
      <div className="sys-head"><h2 className="sys-title">{tr("cap.title")}</h2></div>
      <p className="page-note">{tr("cap.note")}</p>

      <section className="sys-card">
        <div className="set-grid">
          <InterfacePicker value={sel.length === ports.length ? "all" : sel.join(",")} ports={ports} tr={tr}
            hideBulk onChange={(v) => setSel(interfacesToList(v, ports))} />
          <label className="ml"><span>{tr("set.lgFilter")}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{tr("set.lgAllTraffic")}</option>
              {filterIds.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select></label>
          <label className="ml" style={{ flex: "0 1 150px" }}><span>{tr("cap.stl")}</span>
            <input type="number" min="1" max="3600" value={stl}
              onChange={(e) => setStl(e.target.value)} /></label>
          <StoragePickers br={br} tr={tr} />
        </div>
        <p className="set-hint">
          {tr("cap.writesTo")} <code className="mono">{storagePath(storage, dir) || storage || "—"}</code>
          {br.volume && <> {" · "}{tr("cap.used")} <span className="mono">{fmtKB(br.volume.usage)}</span>
            {" · "}{tr("cap.free")} <span className="mono">{fmtKB(br.volume.available)}</span></>}
        </p>
        {problems.length > 0 && (
          <ul className="problem-list">{problems.map((p, i) => <li key={i}>{p.msg}</li>)}</ul>
        )}
        {err && <div className="sys-err">{err}</div>}
        <div className="set-actions">
          <button className="sys-refresh" disabled={problems.length > 0 || running > 0 || applying}
            onClick={() => setAsk({ kind: "start" })}>
            {running > 0 ? tr("cap.running") : tr("cap.start")}</button>
        </div>
      </section>

      <section className="sys-card">
        <h3 className="sys-card-title">{tr("cap.files")}
          <span className="sys-card-metric">{files.length}</span>
          <label className="tf-interval cap-refresh"><input type="checkbox" checked={auto}
            onChange={(e) => setAuto(e.target.checked)} /> {tr("cap.auto")}</label>
          <button className="copy-btn" onClick={listFiles}>{tr("sys.refresh")}</button>
        </h3>
        <StorageCrumbs br={br} tr={tr} />
        {files.length === 0 ? <p className="sys-note dim">{tr("cap.noFiles")}</p> : (
          <div className="tf-table-wrap">
            <table className="tf-table">
              <thead><tr>
                <th>{tr("cap.file")}</th><th className="tf-num">{tr("sess.bytes")}</th>
                <th>{tr("cap.modified")}</th>
                <th className="sel-head" colSpan={2}>
                  <div className="sel-head-in">
                    {/* always shown, so the tick boxes on the right have an obvious purpose */}
                    <button className="del" disabled={fileSel.marked.length === 0}
                      onClick={() => setAsk({ kind: "delete", files: fileSel.marked })}>
                      {tr("cap.delSelected")}{fileSel.marked.length > 0 ? ` (${fileSel.marked.length})` : ""}</button>
                    <input type="checkbox" title={tr("cap.selectAll")}
                      checked={fileSel.allOn} disabled={fileSel.count === 0} onChange={fileSel.toggleAll} />
                  </div>
                </th>
              </tr></thead>
              <tbody>
                {files.map((f) => f.isDir ? (
                  <tr key={"d:" + f.name} className="cap-dir" onClick={() => br.enterDir(f.name)}>
                    <td className="mono cap-name"><span className="dir-icon" aria-hidden="true">▸</span> {f.name}</td>
                    <td className="tf-num dim">{tr("in.folder")}</td>
                    <td className="mono dim">{f.modified}</td>
                    <td /><td />
                  </tr>
                ) : (
                  <tr key={"f:" + f.name} className={fileSel.marked.includes(f.name) ? "marked" : ""}>
                    <td className="mono cap-name">{f.name}</td>
                    <td className="tf-num mono">{fmtBytes(f.bytes)}</td>
                    <td className="mono dim">{f.modified}</td>
                    <td className="cap-actions">
                      {isPartialCapture(f.name)
                        ? <span className="dim file-partial">{tr("cap.writing")}</span>
                        : <a className="copy-btn" href={f.href} download>{tr("cap.download")}</a>}
                    </td>
                    <td className="sel-col"><input type="checkbox" title={tr("cap.markForDelete")}
                      checked={fileSel.marked.includes(f.name)} onChange={() => fileSel.toggle(f.name)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ask && (
        <div className="modal-scrim confirm-load-scrim" onClick={() => setAsk(null)}>
          <div className={"modal" + (ask.kind === "delete" ? " modal-warn" : "")} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {ask.kind === "start" ? tr("cap.confirmTitle")
                : ask.files.length > 1 ? `${tr("cap.delTitleN")} (${ask.files.length})` : tr("cap.delTitle")}
            </div>
            <p className="modal-body">
              {ask.kind === "start" ? tr("cap.confirmBody") : tr("cap.delBody")}
              {ask.kind === "delete" && <><br />{ask.files.map((n) => <code className="cap-del-name" key={n}>{n}</code>)}</>}
            </p>
            <button className={"opt" + (ask.kind === "delete" ? " drop" : "")} onClick={() => {
              const a = ask; setAsk(null);
              if (a.kind === "start") { start(); return; }
                br.removeFiles(a.files).catch((e) => setErr(String(e.message || e))).finally(() => fileSel.clear());
            }}>
              <span className="opt-name">{ask.kind === "start" ? tr("cap.start") : tr("common.delete")}</span>
              <span className="opt-desc">{ask.kind === "start" ? tr("cap.confirmDesc") : tr("cap.delDesc")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setAsk(null)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}

      {(applying || running > 0) && (
        <div className="apply-lock" role="alertdialog" aria-busy="true">
          <div className="apply-lock-box">
            <div className="apply-bar"><div /></div>
            <div className="apply-lock-title">{applying ? tr("cap.applying") : tr("cap.capturing")}</div>
            <div className="apply-lock-body">{applying ? tr("cap.applyingBody") : tr("cap.capturingBody")}</div>
            {!applying && <div className="apply-countdown mono">{running}s</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const ChainFlow = React.memo(function ChainFlow({ chain, filterNames = {}, outputInfo = {}, t }) {
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
  /* A destination that resolves to an output carries a second line (its port and
     name), which needs a wider box than a bare "P1" does. */
  const destSub = Object.fromEntries(destOrder.map((d) => {
    const oi = outputInfo[d];
    const sub = oi ? [oi.port, oi.name].filter(Boolean).join(" · ") : "";
    return [d, sub.length > 24 ? sub.slice(0, 23) + "…" : sub];
  }));
  const outWEff = destOrder.some((d) => destSub[d]) ? 160 : outW;
  const width = outX + outWEff + 40;

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
        {destOrder.map((d) => {
          /* "O2" is a reference; what matters to a reader is the port it lands
             on and what the output was called. A plain port destination has
             neither, and stays a single line. */
          const subText = destSub[d];
          const h = subText ? 42 : 30;
          return (
            <g key={"d" + d}>
              <rect x={outX} y={destY[d] - h / 2} width={outWEff} height={h} rx="7"
                className={d === "drop" ? "ovf-out drop" : "ovf-out"} />
              <text x={outX + outWEff / 2} y={destY[d] + (subText ? -2 : 5)}
                className={"ovf-out-lbl" + (d === "drop" ? " drop" : "")}>{d}</text>
              {subText && <text x={outX + outWEff / 2} y={destY[d] + 12} className="ovf-out-sub">{subText}</text>}
            </g>
          );
        })}

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
/* A name field that offers a suggestion read from the element itself. The
   suggestion is only ever a placeholder and a button -- nothing is written
   until it is taken, so a deliberately blank name stays blank. */
function NameField({ kind, item, value, onChange, t }) {
  const tr = t || ((k) => k);
  const hint = suggestName(kind, item);
  const empty = !String(value ?? "").trim();
  return (
    <label className="ml name"><span>{tr("common.name")}</span>
      <span className="name-with-hint">
        <input value={value ?? ""} onChange={onChange}
          placeholder={hint || tr("common.optional")} />
        {hint && empty && (
          <button type="button" className="name-take" title={tr("common.useSuggested")}
            onClick={() => onChange({ target: { value: hint } })}>{tr("common.use")}</button>
        )}
      </span>
    </label>
  );
}

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
function SortableList({ items, activeKey, getKey, renderLabel, onSelect, onReorder, onDuplicate, addLabel, dupLabel, onAdd, title, dragTitle = "Drag to reorder" }) {
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
    <aside className="filter-list" role="listbox" aria-label={title || undefined}>
      {title && <div className="chain-list-head">{title}</div>}
      {items.map((it, i) => {
        const k = getKey(it);
        return (
          <div key={k}
            className={"filter-item sortable" + (k === activeKey ? " on" : "") + (k === overKey && dragKey !== k ? " drop-target" : "") + (k === dragKey ? " dragging" : "")}
            draggable
            onDragStart={(e) => { setDragKey(k); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); if (overKey !== k) setOverKey(k); }}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            onDrop={(e) => { e.preventDefault(); if (dragKey != null) move(dragKey, k); setDragKey(null); setOverKey(null); }}
            onClick={() => onSelect(it)}
            /* Selecting an item was mouse-only: tab went straight past the list
               to "+ Add", so a keyboard user could only ever edit whichever
               item happened to be active. */
            tabIndex={0} role="option" aria-selected={k === activeKey}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(it); } }}>
            <span className="drag-handle" title={dragTitle} aria-hidden="true">⠿</span>
            {renderLabel(it, i)}
          </div>
        );
      })}
      <button className="filter-add" onClick={onAdd}>{addLabel}</button>
      {active && <button className="filter-dup" onClick={() => onDuplicate(active)}>{dupLabel}</button>}
    </aside>
  );
}

function FiltersTab({ doc, setDoc, activeFilter, setActiveFilter, setFilterRoot, hbTargets, portOptions, mgmtPorts, lang, t, touched }) {
  const tr = t || ((k) => k);
  const [attrsOpen, setAttrsOpen] = useState(false);   // advanced attributes panel
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
  const onAddCond = (id) => mutate(id, (n) => ({ ...n, children: [...(n.children ?? []), mkFind(lastFindField(n))] }));
  const onAddGroup = (id) => mutate(id, (n) => ({ ...n, children: [...(n.children ?? []), mkGroup("or")] }));
  const onAddNot = (id) => mutate(id, (n) => ({ ...n, children: [...(n.children ?? []), mkNot()] }));
  const onRemove = (id) => setFilterRoot(f.id, (root) => tRemove(root, id));

  if (!f) return <div className="empty-pane"><button className="primary" onClick={addFilter}>{tr("common.newFilter")}</button></div>;

  return (
    <div className="filters-layout">
      <SortableList dragTitle={tr("ch.dragReorder")}
        title={tr("tab.filters")} items={doc.filters} activeKey={f.id} getKey={(x) => x.id}
        renderLabel={(x) => <><b>F{x.id}</b><span>{x.name || <em>{tr("flt.unnamed")}</em>}</span>{touched?.has(x.id) && <span className="row-changed" title={tr("chg.rowTip")} />}</>}
        onSelect={(x) => setActiveFilter(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, filters: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...doc.filters.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, filters: [...d.filters, copy] })); setActiveFilter(nextId); }}
        addLabel={tr("common.addFilter")} dupLabel={tr("flt.dupFilter")} onAdd={addFilter} />

      <div className="filter-editor">
        <div className="filter-meta">
          <IdField prefix="F" id={f.id} siblingIds={doc.filters.map((x) => x.id)}
            onCommit={(newId) => { setDoc((d) => ({ ...d, filters: d.filters.map((x) => x.id === f.id ? { ...x, id: newId } : x) })); setActiveFilter(newId); }} />
          <NameField kind="filter" item={f} t={t} value={f[f.labelAttr ?? "name"] ?? f.name ?? ""}
            onChange={(e) => { const k = f.labelAttr ?? "name"; patchMeta(k === "alt" ? { alt: e.target.value } : { name: e.target.value }); }} />
          <label className="ml" title={`sessionBase — ${tr("flt.sessionBaseTip")}`}><span>{tr("flt.sessionBase")}</span>
            <select value={f.sessionBase} onChange={(e) => patchMeta({ sessionBase: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <label className="ml" title={`blockifempty — ${tr("flt.blockIfEmptyTip")}`}><span>{tr("flt.blockIfEmpty")}</span>
            <select value={f.blockifempty || "no"} onChange={(e) => patchMeta({ blockifempty: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <label className="ml" title={`matchedlog — ${tr("flt.matchedLogTip")}`}><span>{tr("flt.matchedLog")}</span>
            <select value={f.matchedlog || "no"} onChange={(e) => patchMeta({ matchedlog: e.target.value })}>
              <option value="no">no</option><option value="yes">yes</option>
            </select></label>
          <AttrToggle t={tr} open={attrsOpen} onToggle={() => setAttrsOpen((v) => !v)}
            label={tr("flt.advAttrs")} active={Object.values(f.fattrs ?? {}).some((v) => v && v !== "no")} />
          <button className="del" onClick={() => delFilter(f.id)}>{tr("common.delete")}</button>
        </div>

        {attrsOpen && (
        <div className="oattr-bar">
          <div className="oattr-panel">
            <div className="oattr-grid">
              {[{ name: "maxPackets", label: "Max packets per session", kind: "num" }].map((a) => (
                <label key={a.name} className="oattr-field"
                  title={a.name === "mpslog" ? `mpslog — ${tr("flt.mpslogTip")}` : a.name}>
                  <span>{a.label ?? a.name}</span>
                  <input value={(f.fattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                    onChange={(e) => patchFattr(a.name, e.target.value)} />
                </label>
              ))}
            </div>
            <div className="oattr-subhead">{tr("flt.regexOnly")}</div>
            <div className="oattr-grid">
              {[
                { name: "masking", label: "Mask the match", opts: ["no","yes"] },
                { name: "start", label: "Search from", opts: ["","l2","l3","l4","l7","http_body"] },
                { name: "position", label: "Offset from start (bytes)", kind: "num" },
                { name: "within", label: "Search length (bytes)", kind: "num" },
              ].map((a) => (
                <label key={a.name} className="oattr-field" title={a.name}>
                  <span>{a.label ?? a.name}</span>
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
                { name: "tuple5_live_hashtable_size", label: "5-tuple table size", kind: "num" },
                { name: "mpslog", label: "Matches/sec → syslog", kind: "num" },
              ].map((a) => (
                <label key={a.name} className="oattr-field"
                  title={a.name === "mpslog" ? `mpslog — ${tr("flt.mpslogTip")}` : a.name}>
                  <span>{a.label ?? a.name}</span>
                  <input value={(f.fattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                    onChange={(e) => patchFattr(a.name, e.target.value)} />
                </label>
              ))}
            </div>
          </div>
        </div>
        )}

        <div className="tree-scroll">
          <CritNode node={f.root} depth={0} canRemove={false} isRoot={true} hbTargets={hbTargets}
            portOptions={portOptions} mgmtPorts={mgmtPorts} lang={lang} t={tr}
            onChangeOp={onChangeOp} onChangeFind={onChangeFind}
            onAddCond={onAddCond} onAddGroup={onAddGroup} onAddNot={onAddNot} onRemove={onRemove} />
        </div>


        {isEmptyFilter(f) && (
          <div className="empty-note">
            <div className="empty-note-body">
              <b>{tr("flt.emptyTitle")}</b>{" "}
              {f.blockifempty === "yes"
                ? <>{tr("flt.emptyWith")} <code>blockifempty="yes"</code>,{" "}
                  <span dangerouslySetInnerHTML={{ __html: tr("flt.emptyNone") }} /></>
                : <>{tr("flt.emptyByDefault")}{" "}
                  <span dangerouslySetInnerHTML={{ __html: tr("flt.emptyAll") }} /></>}
            </div>
            <button className="empty-toggle"
              onClick={() => patchMeta({ blockifempty: f.blockifempty === "yes" ? "no" : "yes" })}>
              {f.blockifempty === "yes" ? tr("flt.switchToAll") : tr("flt.switchToNone")}
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
  if (node.t === "find") return <FindRow node={node} onChange={props.onChangeFind} onRemove={props.onRemove} canRemove={props.canRemove}
    hbTargets={props.hbTargets} portOptions={props.portOptions} mgmtPorts={props.mgmtPorts} lang={props.lang} t={props.t} />;
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
function FindRow({ node, onChange, onRemove, canRemove, hbTargets, portOptions, mgmtPorts, lang, t }) {
  const tr = t || ((k) => k);
  const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
  const rels = relationsFor(kind); const isEx = kind === "exists";
  const err = isEx ? null : validate(kind, node.val);
  const isHbId = node.field === "heartbeat.target.miss.id";
  const targets = hbTargets ?? [];
  /* Fields whose value comes from a known set get a picker rather than a text
     box. A value outside the set is still offered, so a config written
     elsewhere never silently loses what it had. */
  const isCountry = kind === "country";
  const isPort = PORT_PICKER_FIELDS.has(node.field);
  const countries = isCountry ? countryOptions(lang) : [];
  const ports = isPort ? portOptionsForField(node.field, portOptions, mgmtPorts) : [];
  const listed = isCountry ? countries.some((c) => c.code === node.val)
    : isPort ? ports.includes(node.val) : true;
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
          : isCountry && countries.length > 0
            ? <select className={"val" + (err ? " invalid" : "")} value={node.val}
                onChange={(e) => onChange(node.id, { val: e.target.value })}>
                {!node.val && <option value="">{tr("flt.pickCountry")}</option>}
                {!listed && node.val && <option value={node.val}>{node.val}</option>}
                {countries.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
          : isPort && ports.length > 0
            ? <select className={"val" + (err ? " invalid" : "")} value={node.val}
                onChange={(e) => onChange(node.id, { val: e.target.value })}>
                {!node.val && <option value="">{tr("flt.pickPort")}</option>}
                {!listed && node.val && <option value={node.val}>{node.val} {tr("flt.notOnDevice")}</option>}
                {ports.map((pn) => <option key={pn} value={pn}>{pn}</option>)}
              </select>
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

function InputsTab({ doc, setDoc, activeInput, setActiveInput, portOptions, t, touched }) {
  const [showPicked, setShowPicked] = React.useState(false);
  const [portMacs, setPortMacs] = React.useState(null);
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/grism/task/get_port_mac", { credentials: "include" });
        if (res.ok) setPortMacs(await res.json());
      } catch { /* defaults simply omit the MACs */ }
    })();
  }, []);
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
      <SortableList dragTitle={tr("ch.dragReorder")}
        title={tr("tab.inputs")} items={inputs} activeKey={inp.id} getKey={(x) => x.id}
        renderLabel={(x, i) => <><b>{i + 1}</b><span>{x.name || <em>{x.type === "traffic-gen" ? "traffic-gen" : x.port}</em>}</span>{touched?.has(x.id) && <span className="row-changed" title={tr("chg.rowTip")} />}</>}
        onSelect={(x) => setActiveInput(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, inputs: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...inputs.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, inputs: [...d.inputs, copy] })); setActiveInput(nextId); }}
        addLabel={tr("common.addInput")} dupLabel={tr("common.dupInput")} onAdd={addInput} />

      <div className="filter-editor">
        <div className="filter-meta">
              {/* No id field, as for actions: <input id> is optional in run.xsd,
                  nothing references an input by it, and it is not written out. */}
          <NameField kind="input" item={inp} t={t} value={inp[inp.labelAttr ?? "name"] ?? inp.name ?? ""}
            onChange={(e) => { const k = inp.labelAttr ?? "name"; patch(k === "alt" ? { alt: e.target.value } : { name: e.target.value }); }} />
          <label className="ml"><span>{tr("common.type")}</span>
            <select value={inp.type} onChange={(e) => {
              const type = e.target.value;
              if (type !== "traffic-gen") { patch({ type }); return; }
              // Generator settings live under `fields`, not on the input itself.
              // Seed only the ones still empty so existing values survive a
              // round trip through the type selector.
              const seed = trafficGenDefaults(portMacs);
              const cur = inp.fields ?? {};
              const fill = Object.fromEntries(
                Object.entries(seed).filter(([k]) => !String(cur[k] ?? "").trim()));
              patch({ type, fields: { ...cur, ...fill } });
            }}>
              <option value="replayPcap">replayPcap</option>
              <option value="traffic-gen">traffic-gen</option>
            </select></label>
          <label className="ml" title="port"><span>{tr("in.outputPort")}</span>
            <PortSelect value={inp.port} options={portOptions} onChange={(v) => patch({ port: v })}
              invalid={!/^[A-Z][0-9]+$/.test(inp.port)} /></label>
          <button className="del" onClick={() => delInput(inp.id)}>{tr("common.delete")}</button>
        </div>

        <div className="tree-scroll">
          <p className="out-empty">
            {inp.type === "traffic-gen" ? tr("in.helpGen") : tr("in.helpPcap")}
          </p>
          {inp.type === "traffic-gen" && fields.map(renderField)}

          {inp.type === "replayPcap" && <>
            <div className="mod-row">
              <span className="mod-key">{tr("in.source")}</span>
              {/* Switching to a file list takes the played-files handling with
                  it: the firmware would still act on it, and a setting that is
                  applied but cannot be seen is how the last one went wrong. */}
              <select className="mod-val" value={inp.pcapMode || "files"} onChange={(e) => {
                const mode = e.target.value;
                if (mode !== "files") { patch({ pcapMode: mode }); return; }
                const fields = { ...(inp.fields ?? {}) };
                delete fields.playedFilesHandle; delete fields.playedFilesMoveTo;
                patch({ pcapMode: mode, fields });
              }}>
                <option value="files">{tr("in.fileList")}</option>
                <option value="scandir">{tr("in.scanDir")}</option>
              </select>
            </div>

            {(inp.pcapMode || "files") === "files" && (
              <div className="filepath-list">
                {(() => {
                  const picked = (inp.filepaths ?? []).filter(Boolean);
                  return (<>
                    <div className="mod-row">
                      <span className="mod-key">{tr("in.filePaths")}</span>
                      {/* the count alone hides which files are queued — let it open */}
                      <button className="picked-toggle" disabled={picked.length === 0}
                        onClick={() => setShowPicked((v) => !v)} aria-expanded={showPicked}>
                        {picked.length}/100
                        {picked.length === 0
                          ? ` — ${tr("in.pickFiles")}`
                          : <span className="picked-caret" aria-hidden="true">{showPicked ? " ▲" : " ▼"}</span>}
                      </button>
                    </div>
                    {showPicked && picked.length > 0 && (
                      <ol className="picked-list">
                        {picked.map((p, i) => (
                          <li key={p}>
                            <span className="picked-idx mono">{i + 1}</span>
                            <code className="picked-path">{p}</code>
                            <button className="fp-del" title={tr("in.remove")} aria-label={tr("in.remove")}
                              onClick={() => patch({ filepaths: picked.filter((x) => x !== p) })}>✕</button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>);
                })()}
                <StorageFilePicker tr={tr} loggedIn chosen={(inp.filepaths ?? []).filter(Boolean)}
                  onChange={(paths) => patch({ filepaths: paths.length ? paths : [""] })} />
              </div>
            )}

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
              {/* What to do with a file once it has been replayed. Offered for a
                  scanned directory only: a named file list is a list someone
                  chose, and deleting or moving its files out from under it is
                  not what that choice means. */}
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

function OutputsTab({ doc, setDoc, activeOutput, setActiveOutput, portOptions, t, touched }) {
  const tr = t || ((k) => k);
  const [attrsOpen, setAttrsOpen] = useState(false);   // output attributes panel
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
      <SortableList dragTitle={tr("ch.dragReorder")}
        title={tr("tab.outputs")} items={outputs} activeKey={o.id} getKey={(x) => x.id}
        renderLabel={(x) => <><b>O{x.id}</b><span>{x.name || <em>{x.port}</em>}</span>{touched?.has(x.id) && <span className="row-changed" title={tr("chg.rowTip")} />}</>}
        onSelect={(x) => setActiveOutput(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, outputs: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...outputs.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, outputs: [...d.outputs, copy] })); setActiveOutput(nextId); }}
        addLabel={tr("common.addOutput")} dupLabel={tr("common.dupOutput")} onAdd={addOutput} />

      <div className="filter-editor">
        <div className="filter-meta">
          <IdField prefix="O" id={o.id} siblingIds={doc.outputs.map((x) => x.id)}
            onCommit={(newId) => { setDoc((d) => ({ ...d, outputs: d.outputs.map((x) => x.id === o.id ? { ...x, id: newId } : x) })); setActiveOutput(newId); }} />
          <NameField kind="output" item={o} t={t} value={o[o.labelAttr ?? "name"] ?? o.name ?? ""}
            onChange={(e) => { const k = o.labelAttr ?? "name"; patch(k === "alt" ? { alt: e.target.value } : { name: e.target.value }); }} />
          <label className="ml"><span>{tr("out.port")}</span>
            <PortSelect value={o.port} options={portOptions} onChange={(v) => patch({ port: v })}
              invalid={!/^[A-Z][0-9]+$/.test(o.port)} /></label>
          <AttrToggle t={tr} open={attrsOpen} onToggle={() => setAttrsOpen((v) => !v)}
            label={tr("out.attrs")} active={Object.values(o.oattrs ?? {}).some((v) => v && v !== "no")} />
          <button className="del" onClick={() => delOutput(o.id)}>{tr("common.delete")}</button>
        </div>

        {attrsOpen && (
        <div className="oattr-bar">
          <div className="oattr-panel">
            <div className="oattr-grid">
              {[
                { name: "type", label: "Type", opts: ["","httprequesthijack","tcpreset","udpencap"] },
                { name: "mtu", label: "MTU", kind: "num" },
                { name: "stl", label: "Seconds to Live", kind: "num" },
                { name: "arp_srcip", label: "ARP source IP", kind: "ip" },
                { name: "arp_dstip_mac", label: "ARP destination IP → MAC", opts: ["no","yes"] },
                { name: "minbps", label: "Minimum bitrate (bps)", kind: "num" },
                { name: "maxbps", label: "Maximum bitrate (bps)", kind: "num" },
              ].map((a) => (
                <label key={a.name} className="oattr-field" title={a.name}>
                  <span>{a.label ?? a.name}</span>
                  {a.opts
                    ? <select value={(o.oattrs ?? {})[a.name] ?? "" } onChange={(e) => patchAttr(a.name, e.target.value)}>
                        {a.opts.map((op) => <option key={op} value={op}>{op || "—"}</option>)}
                      </select>
                    : <input value={(o.oattrs ?? {})[a.name] ?? ""} placeholder={a.name}
                        onChange={(e) => patchAttr(a.name, e.target.value)} />}
                </label>
              ))}
            </div>
          </div>
        </div>
        )}

        <div className="tree-scroll">
          {(o.mods ?? []).length === 0 && (
            <p className="out-empty">{tr("out.forwardNote")}</p>
          )}
          {(o.mods ?? []).map((m) => <OutputModRow t={tr} key={m.id} mod={m} onChange={setMod} onOp={setModOp} onAttr={setModAttr} onRemove={delMod} />)}

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
            {((o.oattrs ?? {}).type === "tcpreset") &&
              <p className="out-empty">{tr("out.noMods").replace("{type}", "tcpreset")}</p>}
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

function OutputModRow({ mod, onChange, onOp, onAttr, onRemove, t }) {
  const tr = t || ((k) => k);
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
      {isFlag ? <span className="exists-note">{tr("out.noValue")}</span>
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
      <button className="icon-btn" onClick={() => onRemove(mod.id)} aria-label={tr("out.removeMod")}>✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Actions tab — <action> input-packet-process / linkpairs
   ============================================================ */
function ActionsTab({ doc, setDoc, activeAction, setActiveAction, portOptions, t, touched }) {
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
      <SortableList dragTitle={tr("ch.dragReorder")}
        title={tr("tab.actions")} items={actions} activeKey={a.id} getKey={(x) => x.id}
        renderLabel={(x, i) => <><b>{i + 1}</b><span>{x.name || <em>{x.type === "linkpairs" ? "linkpairs" : x.port}</em>}</span>{touched?.has(x.id) && <span className="row-changed" title={tr("chg.rowTip")} />}</>}
        onSelect={(x) => setActiveAction(x.id)}
        onReorder={(next) => setDoc((d) => ({ ...d, actions: next }))}
        onDuplicate={(x) => { const nextId = Math.max(0, ...actions.map((y) => y.id)) + 1; const copy = { ...cloneForDup(x), id: nextId }; setDoc((d) => ({ ...d, actions: [...d.actions, copy] })); setActiveAction(nextId); }}
        addLabel={tr("common.addAction")} dupLabel={tr("common.dupAction")} onAdd={addAction} />

      <div className="filter-editor">
        <div className="filter-meta">
          {/* No id field: <action id> is optional in run.xsd, nothing references
              an action by it, and it is no longer written out. The id stays
              internal, as the key for selection and reordering. */}
          <NameField kind="action" item={a} t={t} value={a.name}
            onChange={(e) => patch({ name: e.target.value })} />
          <label className="ml"><span>{tr("common.type")}</span>
            <select value={a.type} onChange={(e) => patch({ type: e.target.value })}>
              <option value="input-packet-process">{tr("act.typeProcess")}</option>
              <option value="linkpairs">{tr("act.typeLinkPairs")}</option>
            </select></label>
          {isLink ? (<>
            <label className="ml" title="portA"><span>{tr("act.portA")}</span>
              <PortSelect value={a.portA} options={portOptions} onChange={(v) => patch({ portA: v })}
                invalid={!/^[A-Z][0-9]+$/.test(a.portA)} /></label>
            <label className="ml" title="portB"><span>{tr("act.portB")}</span>
              <PortSelect value={a.portB} options={portOptions} onChange={(v) => patch({ portB: v })}
                invalid={!/^[A-Z][0-9]+$/.test(a.portB)} /></label>
          </>) : (
            <label className="ml" title="port"><span>{tr("act.inputPort")}</span>
              <PortSelect value={a.port} options={portOptions} onChange={(v) => patch({ port: v })}
                invalid={!/^[A-Z][0-9]+$/.test(a.port)} /></label>
          )}
          <button className="del" onClick={() => delAction(a.id)}>{tr("common.delete")}</button>
        </div>

        <div className="tree-scroll">
          {isLink ? (
            <div className="link-form">
              <p className="out-empty">{tr("act.linkNote")}</p>
            </div>
          ) : (
            <>
              {(a.mods ?? []).length === 0 && (
                <p className="out-empty">{tr("act.modNote")}</p>
              )}
              {(a.mods ?? []).map((m) => <ActionModRow t={tr} key={m.id} mod={m} onChange={setMod} onRemove={delMod} onMtu={(mid, mtu) => patch({ mods: a.mods.map((x) => x.id === mid ? { ...x, mtu } : x) })} />)}

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

function ActionModRow({ mod, onChange, onRemove, onMtu, t }) {
  const tr = t || ((k) => k);
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
      <button className="icon-btn" onClick={() => onRemove(mod.id)} aria-label={tr("out.removeMod")}>✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Chain tab — decision tree canvas
   ============================================================ */
/* A meta-row toggle for a panel that opens below the row. Keeps the row compact
   while still signalling (via the dot) that values are set inside. */
/* Position a popup under its trigger using viewport coordinates, clamped so it can
   never run off either edge. Absolute positioning anchored to the trigger breaks
   once the topbar wraps and the trigger sits near the left of the screen. */
function useAnchoredPos(open, triggerRef, width) {
  const [pos, setPos] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    /* This hook is called from the root component, so every setPos re-renders
       the whole app. It ran on every scroll event -- capture phase, so nested
       scrollers counted too -- and always allocated a new object, which React
       cannot bail out of. Scrolling the health popover's own list rebuilt the
       Export tab's highlighting before each paint. Keep the same value when
       nothing moved, and do the work once per frame. */
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(width, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
      const top = r.bottom + 8;
      setPos((prev) => (prev && prev.top === top && prev.left === left && prev.width === w) ? prev : { top, left, width: w });
    };
    const place = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    };
  }, [open, triggerRef, width]);
  return pos;
}

function AttrToggle({ label, active, open, onToggle, t }) {
  const tr = t || ((k) => k);
  return (
    <button className={"attr-toggle" + (open ? " open" : "")} onClick={onToggle} aria-expanded={open}>
      <span>{label}</span>
      {active && !open && <span className="coll-dot" title={tr("common.valueSet")} />}
      <span className="attr-toggle-caret" aria-hidden="true">{open ? "▲" : "▼"}</span>
    </button>
  );
}

function CollapseSection({ label, active, children, t }) {
  const tr = t || ((k) => k);

  const [open, setOpen] = useState(false);
  return (
    <div className="coll">
      <button className={"coll-head" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        {active && !open && <span className="coll-dot" title={tr("common.valueSet")} />}
      </button>
      {open && <div className="coll-body">{children}</div>}
    </div>
  );
}

function CheckAccordion({ label, items, onToggle, onAll, onSetOne, onNegate, emptyNote, defaultOpen = false,
  alwaysMulti = false, joiner, onJoiner, joinerOptions, joinerLabel, joinerText, prefix, extra, t }) {
  const tr = t || ((k) => k);
  // the chosen rows, named, for the header -- listed up to a few, then counted
  const chosenAll = items.filter((it) => it.on)
    .map((it) => ({ id: it.neg ? "!" + it.b : it.b, sub: it.sub }));
  const chosen = chosenAll;
  const [open, setOpen] = useState(defaultOpen);
  const picked = items.filter((it) => it.on).length;
  // default single, unless already multiple -- except where the underlying field
  // is a list (port sets), which has no single-value state to fall back to
  const [multi, setMulti] = useState(alwaysMulti || picked > 1);
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
        {/* what is chosen, named -- the generic label is only the empty state */}
        {chosen.length
          ? <span className="known-chosen">
              {prefix && chosen.length > 1 && <span className="chosen-join">{prefix}</span>}
              {chosen.map((c, i) => (
              <React.Fragment key={c.id}>
                {/* the joiner reads between the filters it joins, so the header
                    states the whole condition rather than just its parts */}
                {i > 0 && !prefix && (joinerText ?? joiner) &&
                  <span className="chosen-join">{joinerText ?? joiner}</span>}
                <span className="chosen-one">
                  <b>{c.id}</b>{c.sub && <span>{c.sub}</span>}
                </span>
              </React.Fragment>))}</span>
          : <span className="known-label">{label}</span>}
        {chosenAll.length > 2 && <span className="acc-count">{chosenAll.length}</span>}
      </button>
      {open && <div className="acc-body">
        <div className="acc-toolbar">
          {!alwaysMulti && (
            <label className="acc-multi">
              <input type="checkbox" checked={multi} onChange={(e) => e.target.checked ? setMulti(true) : switchToSingle()} />
              multi-select
            </label>
          )}
          {/* how the chosen rows combine -- and/or for filters, duplicate or
              load balance for ports. Only meaningful once there are two. */}
          {onJoiner && picked > 1 && (
            <label className="acc-join">{joinerLabel ?? tr("ch.combine")}
              <select value={joiner} onChange={(e) => onJoiner(e.target.value)}>
                {(joinerOptions ?? [{ v: "or", l: "or" }, { v: "and", l: "and" }])
                  .map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>
          )}
          {picked > 1 && extra}
          {multi && items.length > 0 && <button className="acc-all" onClick={() => onAll(!allOn)}>
            {allOn ? "Clear all" : "Select all"}
          </button>}
        </div>
        <div className="fid-checks">
          {items.map((it) => (
            <label key={it.id} className={"fid-check" + (it.on ? " on" : "") + (it.neg ? " neg" : "")}>
              <input type={multi ? "checkbox" : "radio"} checked={it.on}
                onChange={() => multi ? onToggle(it.id) : onSetOne(it.id)} />
              <b>{it.neg ? "!" + it.b : it.b}</b>
              {it.neg && <span className="fid-negword">{tr("ch.doesNotMatch")}</span>}
              {it.sub && <span>{it.sub}</span>}
              {/* negation belongs on the row it negates, not in a text box the
                  reader has to know the syntax for */}
              {onNegate && it.on && (
                <button type="button" className={"fid-neg" + (it.neg ? " on" : "")}
                  title={it.neg ? tr("ch.negOff") : tr("ch.negOn")}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNegate(it.id); }}>!</button>
              )}
            </label>
          ))}
        </div>
        {items.length === 0 && emptyNote && <p className="fid-empty">{emptyNote}</p>}
      </div>}
    </div>
  );
}

function ChainTab({ doc, definedIds, outputIds, setChainTreeFor, setDoc, activeChain, setActiveChain, portOptions, portsFromDevice, t, touched }) {
  const tr = t || ((k) => k);
  // {name} placeholders, so a translation can put the value where its own
  // grammar needs it rather than where English happened to put it
  const fill = (str, vals) => String(str).replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? "");
  const sideWord = (side) => tr(side === "match" ? "sim.match" : "sim.notMatch");
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
  const outputAlt = useMemo(() => Object.fromEntries((doc.outputs ?? []).map((o) => { const lbl = outputLabel(o); return lbl ? ["O" + o.id, lbl] : null; }).filter(Boolean)), [doc.outputs]);
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

  const [destOpen, setDestOpen] = useState(null);   // chain whose full output list is showing
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
  const fidsNegated = (fids, fid) => fidsTokens(fids).some((t) => t === "!" + fid);
  const negateFid = (nodeId, fids, fid) => {
    const next = fidsTokens(fids).map((t) =>
      t.replace(/^!/, "") === fid ? (t.startsWith("!") ? fid : "!" + fid) : t);
    mutate(nodeId, (n) => ({ ...n, fids: next.join(",") }));
  };
  const toggleFid = (nodeId, fids, fid) => {
    const toks = fidsTokens(fids);
    const idx = toks.findIndex((t) => t.replace(/^!/, "") === fid);
    const next = idx >= 0 ? toks.filter((_, i) => i !== idx) : [...toks, fid];
    mutate(nodeId, (n) => ({ ...n, fids: next.join(",") }));
  };
  // generic comma-list toggle for port fields (ingress ports, output ports)
  const listTokens = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  const listHas = (v, item) => listTokens(v).includes(item);
  /* On the canvas an output reference reads as "O2(P0)": the id it is written
     as, and the port it actually leaves by. */
  const withOutPorts = (ports) => listTokens(ports).map((tok) => {
    const o = (doc.outputs ?? []).find((x) => "O" + x.id === tok);
    return o && o.port ? `${tok}(${o.port})` : tok;
  }).join(",");
  /* Everything a chain's <out> accepts, in one list: ports, the outputs this
     document defines, then the two standalone values. */
  const SOLO_OUTS = [{ id: "0", subKey: "ch.outDrop" }, { id: "S", subKey: "ch.outSwitch" }];
  const outChoices = useMemo(() => [
    ...portOptions.map((p) => ({ id: p, sub: "" })),
    ...(doc.outputs ?? []).map((o) => ({
      id: "O" + o.id,
      label: o.port ? `O${o.id}(${o.port})` : "O" + o.id,
      sub: String(o.name || o.alt || "").trim(),
    })),
    ...SOLO_OUTS.map((x) => ({ id: x.id, sub: tr(x.subKey), solo: true })),
  ], [portOptions, doc.outputs, tr]);
  const toggleOutChoice = (nodeId, ports, item) => {
    const solo = SOLO_OUTS.some((x) => x.id === item);
    const toks = listTokens(ports);
    let next;
    if (solo) next = toks.includes(item) ? [] : [item];
    else next = (toks.includes(item) ? toks.filter((t) => t !== item) : [...toks, item])
      .filter((t) => !SOLO_OUTS.some((x) => x.id === t));
    mutate(nodeId, (n) => ({ ...n, ports: next.join(",") }));
  };
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
    const [ingress, egress] = firstTwoPorts(portOptions);
    const c = mkChain(ingress, egress);
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
        if (n.t === "out") {
          String(n.ports ?? "").split(",").map((x) => x.trim()).filter(Boolean)
            .forEach((tok) => outs.push(tok === "0" ? "drop" : tok));
          return;
        }
      ["match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
    })(c.tree);
      return [...new Set(outs)].map((tok) => {
        const o = (doc.outputs ?? []).find((x) => "O" + x.id === tok);
        return o && o.port ? `${tok}(${o.port})` : tok;
      });
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
    // the side not being kept is left unspecified rather than an output with no
      // port: an empty <out> is an error, "unspecified" is a decision still to make
      const wrap = (node) => ({ id: newId, t: "branch", fids: "", fidOp: "or",
      [keepSide]: node, [otherSide]: mkUnset() });
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
  /* Turning an unspecified side into a real route drops the user on the output
     with nothing chosen, rather than guessing a port for them. */
  const restoreSide = (nid2) => {
    const o = ownerOf(nid2); if (!o) return;
    const out = mkOut("");
    setChainTreeFor(cid, (tree) => setSide(tree, o.branchId, o.side, out));
    setSelId(out.id);
  };

  const PAD = 40, svgW = totalW + PAD * 2, svgH = totalH + PAD * 2;

  /* Zoom. The viewBox stays at the drawing's own size and only the rendered
     width and height scale, so nothing has to know about it -- node positions,
     hit areas and edges are all still in layout units. */
  const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.25, 1.5, 2];
  const [zoom, setZoom] = React.useState(() => readPrefs().chainZoom ?? 1);
  React.useEffect(() => { writePref("chainZoom", zoom); }, [zoom]);
  const paneRef = React.useRef(null);
  const stepZoom = (dir) => setZoom((z) => {
    const i = ZOOM_STEPS.findIndex((v) => v >= z - 0.001);
    const next = dir > 0 ? ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, i + 1)]
      : ZOOM_STEPS[Math.max(0, (i < 0 ? ZOOM_STEPS.length : i) - 1)];
    return next ?? z;
  });
  const fitZoom = React.useCallback(() => {
    const pane = paneRef.current;
    if (!pane || !svgW) return;
    const cs = getComputedStyle(pane);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    // scale to whichever side runs out first, enlarging a small chain as well
    // as shrinking a large one, within the range the buttons can reach
    const f = Math.min((pane.clientWidth - padX) / svgW, (pane.clientHeight - padY) / svgH);
    setZoom(Math.min(2, Math.max(0.2, Math.floor(f * 100) / 100)));
  }, [svgW, svgH]);

  /* React attaches wheel handlers as passive, so preventDefault inside one is
     ignored and the pane scrolls under the zoom. Bind it ourselves. */
  React.useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;   // plain scrolling still scrolls
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    };
    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => pane.removeEventListener("wheel", onWheel);
    /* paneRef is only attached in the main return, below an early return for
       the no-chain empty state -- so with [] this ran once, found nothing, and
       never looked again. Creating the first chain does not remount the tab,
       so ctrl+wheel stayed dead until the user switched tabs and back. */
  }, [chain]);
  const center = (n) => ({ x: n._x + NODE_W / 2 + PAD, y: n._y + PAD });
  const byId = Object.fromEntries(placed.map((n) => [n.id, n]));

  if (!chain) return (
    <div className="empty-pane">
      <div className="empty-cta">
        <p>{tr("ch.emptyTitle")}</p>
        <button className="primary" onClick={addChain}>{tr("ch.newChain")}</button>
      </div>
    </div>
  );

  return (
    <div className="chain-layout3">
      <aside className="chain-list" role="listbox" aria-label={tr("tab.chain")}>
        <div className="chain-list-head">{tr("tab.chain")}</div>
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
              onClick={() => { setActiveChain(c.cid); setSelId(null); }}
              tabIndex={0} role="option" aria-selected={c.cid === cid}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveChain(c.cid); setSelId(null); } }}>
              <span className="drag-handle" title={tr("ch.dragReorder")} aria-hidden="true">⠿</span>
              <span className="chain-flow"><b>{inP || "?"}</b> <span className="arr">→</span> <span className="dest">{(() => {
                const all = chainDest(c);
                if (!all.length) return "—";
                const open = destOpen === c.cid;
                const shown = open ? all : all.slice(0, 3);
                return (<>
                  {shown.join(", ")}
                  {/* the rest is a click away rather than gone */}
                  {all.length > shown.length && (
                    <button className="dest-more"
                      onClick={(e) => { e.stopPropagation(); setDestOpen(c.cid); }}>+{all.length - shown.length}</button>
                  )}
                  {open && all.length > 3 && (
                    <button className="dest-more" onClick={(e) => { e.stopPropagation(); setDestOpen(null); }}>−</button>
                  )}
                </>);
              })()}</span></span>
              {touched?.has(c.cid) && <span className="row-changed" title={tr("chg.rowTip")} />}
            </div>
          );
        })}
        <button className="filter-add" onClick={addChain}>{tr("ch.addChain")}</button>
        {chain && <button className="filter-dup" onClick={() => dupChain(chain)}>{tr("ch.dupChain")}</button>}
        {chains.length > 1 && (
          <button className="chain-del" onClick={() => delChain(cid)}>{tr("ch.deleteChain")}</button>
        )}
      </aside>

      <section className="canvas-wrap" ref={paneRef} onClick={() => setSelId(null)}>
        <div className="zoom-bar" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]}
            title={tr("ch.zoomOut")} aria-label={tr("ch.zoomOut")}>−</button>
          <button className="zoom-pct" onClick={() => setZoom(1)} title={tr("ch.zoomReset")}>
            {Math.round(zoom * 100)}%</button>
          <button onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            title={tr("ch.zoomIn")} aria-label={tr("ch.zoomIn")}>+</button>
          <button className="zoom-fit" onClick={fitZoom} title={tr("ch.zoomFitTip")}>{tr("ch.zoomFit")}</button>
        </div>
        <svg width={svgW * zoom} height={svgH * zoom} viewBox={`0 0 ${svgW} ${svgH}`} className="canvas">
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
                <text x={c.x} y={c.y - 3} className="n-kind dim">{tr("ch.capUnspecified")}</text>
                <text x={c.x} y={c.y + 11} className="n-default">{tr("ch.capDeviceDefault")}</text>
              </g>;
            }
            const x = c.x - NODE_W / 2, y = c.y - NODE_H / 2, drop = isDrop(n), bad = problemIds.has(n.id);
            return <g key={n.id} className={`gnode ${n.t}${drop ? " drop" : ""}${bad ? " bad" : ""}${isSel ? " sel" : ""}`} onClick={(ev) => { ev.stopPropagation(); setSelId(n.id); }}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="9" />
              {bad && <text x={x + NODE_W - 13} y={y + 16} className="n-warn">!</text>}
              {n.t === "in" && <><text x={c.x} y={c.y - 5} className="n-kind">{tr("ch.capIngress")}</text><text x={c.x} y={c.y + 12} className="n-main">{n.ports}</text></>}
              {n.t === "branch" && (() => { const full = branchAlt(n.fids, n.fidOp); return <><text x={c.x} y={c.y - 5} className={full ? "n-alt" : "n-kind"}>{full && <title>{full}</title>}{capAlt(full) || tr("ch.capFilter")}</text><text x={c.x} y={c.y + 12} className="n-main">{n.fids}</text></>; })()}
              {n.t === "out" && <><text x={c.x} y={c.y - 5} className="n-kind">{drop ? tr("ch.capDiscard") : (n.mode === "loadBalance" ? tr("ch.capBalance") : tr("ch.capOutput"))}</text><text x={c.x} y={c.y + 12} className="n-main">{drop ? "drop (0)" : withOutPorts(n.ports)}</text></>}
            </g>;
          })}
        </svg>
      </section>

      <aside className="chain-rail">
        <div className="inspector">
          <div className="insp-head">{sel ? (isUnset(sel) ? tr("ch.unspecified") : sel.t === "in" ? tr("ch.ingress") : sel.t === "branch" ? tr("ch.filter") : isDrop(sel) ? tr("ch.discard") : tr("ch.output")) : tr("ch.inspector")}</div>
          {!sel && <p className="insp-empty">{tr("ch.selectNode")}</p>}
          {sel && sel.t === "in" && <>
            <CheckAccordion
              label={tr("ch.ingressPorts")}
              t={t}
              items={portOptions.map((p) => ({ id: p, b: p, on: listHas(chain.ports, p) }))}
              onToggle={(p) => toggleInPort(p)}
              onAll={(on) => setAllInPorts(portOptions, on)}
              onSetOne={(p) => setOneInPort(portOptions, p)}
              emptyNote={!portsFromDevice ? tr("ch.defaultPorts") : null} />
            <CollapseSection t={tr} label={tr("ch.advancedOp")} active={!!chain.inVlan?.vlantype}>
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
            {/* No free-text fids: every value it could hold is a filter that is
                either defined or a reference to nothing, and "!" is a control,
                not something to spell. The chosen value reads off the picker. */}
            <CheckAccordion
              label={tr("ch.definedFilters")}
              t={t} joiner={sel.fidOp} onJoiner={(v) => mutate(sel.id, (n) => ({ ...n, fidOp: v }))}
              items={doc.filters.map((f) => ({ id: "F" + f.id, b: "F" + f.id, sub: f.name || tr("flt.unnamed"),
                on: fidsHas(sel.fids, "F" + f.id), neg: fidsNegated(sel.fids, "F" + f.id) }))}
              onToggle={(fid) => toggleFid(sel.id, sel.fids, fid)}
              onNegate={(fid) => negateFid(sel.id, sel.fids, fid)}
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
            {/* One list: the device's ports, the outputs this document defines,
                and the two values that are neither -- 0 discards, S hands the
                packet to the switch. Those two stand alone, so choosing one
                clears the rest and choosing a port clears them. */}
            {isDrop(sel) && <p className="insp-note">{tr("ch.dropNote")}</p>}
            <>
              <CheckAccordion
                label={tr("ch.outputPorts")}
                t={t}
                items={outChoices.map((c) => ({ id: c.id, b: c.label ?? c.id, sub: c.sub, on: listHas(sel.ports, c.id) }))}
                onToggle={(p2) => toggleOutChoice(sel.id, sel.ports, p2)}
                onAll={(on) => setAllOutPorts(sel.id, sel.ports, outChoices.filter((c) => !c.solo).map((c) => c.id), on)}
                onSetOne={(p2) => setOneOutPort(sel.id, sel.ports, outChoices.map((c) => c.id), p2)}
                joiner={sel.mode} onJoiner={(v) => mutate(sel.id, (n) => ({ ...n, mode: v }))}
                joinerLabel={tr("ch.mode")}
                joinerOptions={[{ v: "duplicate", l: tr("ch.modeDuplicate") }, { v: "loadBalance", l: tr("ch.modeBalance") }]}
                prefix={sel.mode === "loadBalance" ? tr("ch.modeBalanceTo") : tr("ch.modeDuplicateTo")}
                extra={sel.mode === "loadBalance" && (
                  <label className="acc-join">{tr("ch.balanceBy")}
                    <select value={sel.lb} onChange={(e) => mutate(sel.id, (n) => ({ ...n, lb: e.target.value }))}>
                      {["session", "5thash", "rr", "sip", "dip"].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                )}
                emptyNote={!portsFromDevice ? tr("ch.portsDefaultNote") : null} />
              <CollapseSection t={tr} label={tr("ch.advancedOp")} active={!!sel.vlantype}>
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
            </>
            {selOwner && <button className="danger" onClick={() => requestRemove(sel.id)}>{tr("ch.removeBranch").replace("{side}", selOwner.side)}</button>}
          </>}
        </div>

        <div className="refs">
          <div className="refs-head"><span>{tr("ch.filtersReferenced")}</span><span className="refs-count">{refs.length}</span></div>
          {refs.map((r) => <div key={r.id} className={"ref-row " + (r.defined ? "here" : r.onDevice ? "device" : "missing")}>
            <span className="ref-dot" /><code className="ref-id">{r.id}</code>
            <span className="ref-name">{knownNames[r.id] || ""}</span>
            <span className="ref-where">{r.defined ? tr("ch.definedHere") : r.onDevice ? tr("ch.onDevice") : tr("ch.notDefined")}</span>
          </div>)}
          {refs.some((r) => r.onDevice) && <p className="refs-note">{tr("ch.deviceNote")}</p>}
          {refs.some((r) => !r.defined && !r.onDevice) && <p className="refs-note bad">{tr("ch.missingNote")}</p>}
        </div>
      </aside>

      {confirm && <div className="modal-scrim" onClick={() => setConfirm(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">{fill(tr("ch.rmTitle"), { side: sideWord(confirm.side), fids: confirm.fids })}</div>
          <p className="modal-body">{tr("ch.rmBody")}</p>
          {confirm.blockUnset
            ? <div className="rule-note">{fill(tr("ch.rmOnlySide"), { side: sideWord(confirm.otherSide) })}</div>
            : <button className="opt" onClick={() => resolveRemove("unset")}><span className="opt-name">{tr("ch.rmUnset")}</span><span className="opt-desc">{tr("ch.rmUnsetDesc")}</span></button>}
          <button className="opt drop" onClick={() => resolveRemove("drop")}><span className="opt-name">{tr("ch.rmDrop")}</span><span className="opt-desc">{tr("ch.rmDropDesc")}</span></button>
          <button className="opt-cancel" onClick={() => setConfirm(null)}>{tr("common.cancel")}</button>
        </div>
      </div>}

      {chipConfirm && <div className="modal-scrim" onClick={() => setChipConfirm(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">{tr(chipConfirm.field === "fids" ? "ch.repTitleF" : "ch.repTitleO")}</div>
          <p className="modal-body">{fill(tr("ch.repBody"), { from: chipConfirm.from, to: chipConfirm.to })}</p>
          <button className="opt" onClick={resolveChip}><span className="opt-name">{fill(tr("ch.repGo"), { to: chipConfirm.to })}</span><span className="opt-desc">{tr("ch.repDesc")}</span></button>
          <button className="opt-cancel" onClick={() => setChipConfirm(null)}>{tr("common.cancel")}</button>
        </div>
      </div>}
    </div>
  );
}


/* The device serves the schema it was built with at /data/run.xsd, so a config
   can be checked against the same firmware it is going to. Fetched once and
   remembered; if it cannot be had -- an older image, or the tool opened away
   from a device -- the editors fall back to their own checks rather than
   refusing everything. */
let _runSchema;                  // undefined = not tried, null = unavailable
let _runSchemaPending = null;
async function loadRunSchema() {
  if (_runSchema !== undefined) return _runSchema;
  if (!_runSchemaPending) {
    _runSchemaPending = (async () => {
      try {
        const res = await fetch("/data/run.xsd", { credentials: "include" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        _runSchema = parseXsd(await res.text());
      } catch {
        _runSchema = null;
      }
      return _runSchema;
    })();
  }
  return _runSchemaPending;
}

/* Poll /grism/task/get_status once a second until the device reports it has
   finished applying. Shared by the run.xml submit and the extra-files pane so
   both hold the screen the same way and neither can spin forever. Resolves to
   a warning to show the user, or "" when it completed cleanly. */
async function waitForDeviceApply(onProgress) {
  const POLL_MS = 1000, TIMEOUT_MS = 90000, MAX_FAILS = 5;
  const started = Date.now();
  let fails = 0;
  // small initial delay before the first status check
  await new Promise((r) => setTimeout(r, POLL_MS));
  while (true) {
    if (Date.now() - started > TIMEOUT_MS) {
      return "Apply timed out — the device is still working or unreachable. Check its status directly.";
    }
    try {
      const res = await fetch("/grism/task/get_status", { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      fails = 0;
      if (!data.loading) return "";
      onProgress?.(data.message || "applying configuration…");
    } catch {
      fails += 1;
      if (fails >= MAX_FAILS) {
        return "Lost contact with the device while applying. Check that you're signed in and the device is reachable.";
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}


/* ============================================================
   Saved configurations

   Snapshots of run.xml kept on the device. Sits under the Export pane beside
   the other-files strip: save what is on screen, bring an earlier one back
   into the editor, retitle it, or drop it.

   Loading one replaces the whole working configuration, so it goes through a
   confirmation the same way submitting does.
   ============================================================ */
/* Opened from the Export command row, as a card over the page rather than an
   inline section: the list, its rename fields and its confirmations are a task
   of their own, and unfolding them in the middle of the XML pushed everything
   else around. The caller owns "open". */
function SavedConfigs({ runXml, onLoadXml, lang, open, onClose, t }) {
  const tr = t || ((k) => k);
  const [files, setFiles] = useState(null);
  const [listErr, setListErr] = useState(false);
  const [state, setState] = useState({ kind: "idle", msg: "" });
  const [saving, setSaving] = useState(null);      // description being typed for a new save
  const [renaming, setRenaming] = useState(null);  // { name, description }
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmLoad, setConfirmLoad] = useState(null);

  const fetchList = async () => {
    const res = await fetch("/grism/task/get_save_xml_list", { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return savedConfigsFrom(await res.json());
  };
  const load = useCallback(async () => {
    try { setFiles(await fetchList()); setListErr(false); }
    catch { setFiles([]); setListErr(true); }
  }, []);
  useEffect(() => { if (open && files === null) load(); }, [open, files, load]);

  const post = async (path, fields) => {
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([k, v]) => body.set(k, v));
    const res = await fetch("/grism/task/" + path, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
  };

  const doSave = async (description) => {
    setState({ kind: "sending", msg: "" });
    try {
      const name = buildSaveXmlName({
        description,
        slot: nextSaveSlot(files ?? []),
        timestamp: Date.now(),
        size: new TextEncoder().encode(runXml).length,
      });
      await post("save_xml", { name, data: runXml, description });
      setSaving(null);
      await load();
      setState({ kind: "ok", msg: tr("sv.saved") });
      setTimeout(() => setState({ kind: "idle", msg: "" }), 2500);
    } catch (e) { setState({ kind: "err", msg: tr("sv.saveFailed") + ": " + (e.message || e) }); }
  };

  const doRename = async (name, description) => {
    setState({ kind: "sending", msg: "" });
    try {
      await post("set_xml_description", { name, description });
      setRenaming(null);
      await load();
      setState({ kind: "ok", msg: tr("sv.renamed") });
      setTimeout(() => setState({ kind: "idle", msg: "" }), 2500);
    } catch { setState({ kind: "err", msg: tr("sv.renameFailed") }); }
  };

  const doDelete = async (name) => {
    setConfirmDel(null);
    setState({ kind: "sending", msg: "" });
    try {
      await post("del_xml", { name });
      await load();
      setState({ kind: "ok", msg: tr("sv.deleted") });
      setTimeout(() => setState({ kind: "idle", msg: "" }), 2500);
    } catch { setState({ kind: "err", msg: tr("sv.deleteFailed") }); }
  };

  const doLoad = async (name) => {
    setConfirmLoad(null);
    setState({ kind: "sending", msg: "" });
    try {
      const body = new URLSearchParams(); body.set("name", name);
      const res = await fetch("/grism/task/get_save_xml", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const xml = await res.text();
      if (!xml.trim()) throw new Error(tr("sv.empty"));
      onLoadXml(xml);                              // throws if it will not parse
      setState({ kind: "ok", msg: tr("sv.loaded") });
      setTimeout(() => setState({ kind: "idle", msg: "" }), 2500);
    } catch (e) { setState({ kind: "err", msg: tr("sv.loadFailed") + ": " + (e.message || e) }); }
  };

  if (!open) return null;
  return (
    <div className="modal-scrim saved-scrim" onClick={onClose}>
      <section className="saved-modal" onClick={(e) => e.stopPropagation()}>
        <div className="saved-head">
          <span className="saved-title">{tr("sv.title")}
            {files && files.length > 0 && <span className="xf-count">{files.length}</span>}</span>
          <button className="tmpl-close" onClick={onClose} aria-label={tr("xf.cancel")}>✕</button>
        </div>
      {true && (
        <div className="xf-body">
          <p className="xf-note">{tr("sv.note")}</p>
          {listErr && <p className="submit-note err">{tr("sv.listFailed")}</p>}
          {files !== null && files.length === 0 && !listErr && <p className="xf-empty">{tr("sv.none")}</p>}
          {files !== null && files.length > 0 && (
            <ul className="xf-list sv-list">
              {files.map((f) => (
                <li key={f.name}>
                  {renaming?.name === f.name
                    ? <>
                        <input className="sv-desc-input" value={renaming.description} autoFocus
                          placeholder={tr("sv.describePlaceholder")}
                          onChange={(e) => setRenaming({ ...renaming, description: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") doRename(f.name, renaming.description); }} />
                        <button className="copy-btn" onClick={() => doRename(f.name, renaming.description)}>{tr("sv.save")}</button>
                        <button className="copy-btn" onClick={() => setRenaming(null)}>{tr("xf.cancel")}</button>
                      </>
                    : <>
                        <span className="sv-desc" title={f.name}>
                          {f.description || <em className="sv-nodesc">{tr("sv.noDescription")}</em>}
                        </span>
                        <span className="xf-size">
                          {f.size === null ? "" : formatFileSize(f.size)}
                          {f.mtime ? " · " + formatSavedTime(f.mtime, lang) : ""}
                        </span>
                        <button className="copy-btn" onClick={() => setConfirmLoad(f)}>{tr("sv.load")}</button>
                        <button className="copy-btn" onClick={() => setRenaming({ name: f.name, description: f.description })}>{tr("sv.describe")}</button>
                        <button className="copy-btn xf-del" onClick={() => setConfirmDel(f)}>{tr("xf.delete")}</button>
                      </>}
                </li>
              ))}
            </ul>
          )}

          {saving === null
            ? <button className="xf-add" onClick={() => setSaving("")}>{tr("sv.saveCurrent")}</button>
            : (
              <div className="xf-new">
                <label>{tr("sv.description")}
                  <input className="sv-desc-input" value={saving} autoFocus placeholder={tr("sv.describePlaceholder")}
                    onChange={(e) => setSaving(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doSave(saving); }} />
                </label>
                <button className="copy-btn" disabled={state.kind === "sending"} onClick={() => doSave(saving)}>{tr("sv.save")}</button>
                <button className="copy-btn" onClick={() => setSaving(null)}>{tr("xf.cancel")}</button>
              </div>
            )}

          {state.kind === "err" && <p className="submit-note err">{state.msg}</p>}
          {state.kind === "ok" && <p className="submit-note ok">{state.msg}</p>}

          {confirmDel && (
            <div className="modal-scrim" onClick={() => setConfirmDel(null)}>
              <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">{tr("sv.deleteTitle")}</div>
                <p className="modal-body">{confirmDel.description || confirmDel.name} — {tr("sv.deleteBody")}</p>
                <button className="opt drop" onClick={() => doDelete(confirmDel.name)}>
                  <span className="opt-name">{tr("xf.deleteConfirm")}</span>
                  <span className="opt-desc">{tr("sv.deleteBody")}</span>
                </button>
                <button className="opt-cancel" onClick={() => setConfirmDel(null)}>{tr("xf.cancel")}</button>
              </div>
            </div>
          )}
          {confirmLoad && (
            <div className="modal-scrim" onClick={() => setConfirmLoad(null)}>
              <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">{tr("sv.loadTitle")}</div>
                <p className="modal-body">{confirmLoad.description || confirmLoad.name} — {tr("sv.loadBody")}</p>
                <button className="opt drop" onClick={() => doLoad(confirmLoad.name)}>
                  <span className="opt-name">{tr("sv.loadConfirm")}</span>
                  <span className="opt-desc">{tr("sv.loadBody")}</span>
                </button>
                <button className="opt-cancel" onClick={() => setConfirmLoad(null)}>{tr("xf.cancel")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      </section>
    </div>
  );
}

/* ============================================================
   Other config files (run1.xml … run15.xml)

   Deliberately understated: the intended workflow is run.xml on the pane
   above, and these are the exception -- extra filter lists, usually dropped
   in over sftp. Collapsed by default, and it says nothing at all when the
   device has none.

   Small files open in the same editor run.xml uses and submit through
   submitxml. Past the size limit the core sets, a file is download-only:
   these reach tens of megabytes and would wedge a textarea.
   ============================================================ */
function OtherConfigFiles({ t }) {
  const tr = t || ((k) => k);
  const [open, setOpen] = useState(false);   // the strip is visible; the list unfolds on demand
  const [files, setFiles] = useState(null);      // null until first load
  const [listErr, setListErr] = useState(false);
  const [busy, setBusy] = useState("");          // name currently being read
  const [editing, setEditing] = useState(null);  // { name, text, dirty }
  const [state, setState] = useState({ kind: "idle", msg: "" });
  const [adding, setAdding] = useState(null);    // chosen name while adding
  const [confirmDel, setConfirmDel] = useState(null);
  const [apply, setApply] = useState({ active: false, msg: "", warn: "" });
  const [schema, setSchema] = useState(undefined);   // undefined = still loading

  useEffect(() => { if (open) loadRunSchema().then(setSchema); }, [open]);

  const fetchList = async () => {
    const res = await fetch("/grism/task/get_running_filelist", { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return extraRunFilesFrom(await res.json());
  };

  const load = useCallback(async () => {
    try {
      setFiles(await fetchList());
      setListErr(false);
    } catch {
      setFiles([]);
      // a flag, not the message: translating here would tie this callback to
      // tr, which is a new function on every render
      setListErr(true);
    }
  }, []);

  /* submitxml writes the file to ftproot and drops a .ok next to it; the device
     moves it into running-config a moment later. Reloading straight away shows
     a list without the file in it, so wait for it to turn up -- and give up
     rather than spin if it never does. */
  const loadUntilPresent = async (name) => {
    for (let i = 0; i < 12; i++) {
      try {
        const listed = await fetchList();
        setFiles(listed); setListErr(false);
        if (listed.some((f) => f.name === name)) return;
      } catch { /* keep trying; the final load() reports a lasting failure */ }
      await new Promise((r) => setTimeout(r, 600));
    }
    await load();
  };

  useEffect(() => { if (open && files === null) load(); }, [open, files, load]);

  const openFile = async (name) => {
    setBusy(name); setState({ kind: "idle", msg: "" });
    try {
      const res = await fetch(extraRunFileHref(name), { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setEditing({ name, text: await res.text() });
    } catch {
      setState({ kind: "err", msg: tr("xf.loadFailed") });
    } finally { setBusy(""); }
  };

  const submitFile = async (name, text) => {
    setState({ kind: "sending", msg: "" });
    try {
      const body = new URLSearchParams();
      body.set("filename", name);
      body.set("data", text);
      const res = await fetch("/grism/task/submitxml", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setEditing(null); setAdding(null);
      // the device applies the file the same way it applies run.xml, so hold
      // the screen until it says it has finished
      setApply({ active: true, msg: tr("ex.applying"), warn: "" });
      const warn = await waitForDeviceApply((msg) => setApply({ active: true, msg, warn: "" }));
      setApply({ active: false, msg: "", warn });
      setState({ kind: "sending", msg: "" });
      await loadUntilPresent(name);
      setState(warn ? { kind: "err", msg: warn } : { kind: "ok", msg: tr("xf.saved") });
      if (!warn) setTimeout(() => setState({ kind: "idle", msg: "" }), 2500);
    } catch (e) {
      setState({ kind: "err", msg: tr("xf.submitFailed") + ": " + (e.message || e) });
    }
  };

  const deleteFile = async (name) => {
    setConfirmDel(null);
    setState({ kind: "sending", msg: "" });
    try {
      const res = await fetch("/grism/task/del_running?name=" + encodeURIComponent(name), { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setState({ kind: "ok", msg: tr("xf.deleted") });
      if (editing?.name === name) setEditing(null);
      await load();
      setTimeout(() => setState({ kind: "idle", msg: "" }), 2500);
    } catch {
      setState({ kind: "err", msg: tr("xf.deleteFailed") });
    }
  };

  const formatEditing = () => {
    try { setEditing({ ...editing, text: formatXml(editing.text) }); }
    catch { /* indent only; editErr reports the syntax itself */ }
  };

  const taken = (files ?? []).map((f) => f.name);
  const free = freeExtraRunFileNames(taken);
  const addProblem = adding === null ? "" : newExtraRunFileProblem(adding, taken);
  /* Checked against the device's own run.xsd, so the vocabulary is whatever
     this firmware actually understands -- a schema failure refuses the submit.
     Without a schema to check against, fall back to the structural check so a
     device too old to serve one is still usable. Field-value complaints stay
     advisory: these files are fragments and may lean on what run.xml defines. */
  /* Memoised on the text being edited: as bare render-body expressions these
     four re-parsed the file on every render of the page, including renders
     caused by typing somewhere else entirely. */
  const editText = editing ? editing.text : null;
  const structErr = React.useMemo(() => (editText ? grismStructureError(editText) : ""), [editText]);
  const xsdProblems = React.useMemo(
    () => (editText && !structErr && schema ? validateAgainstXsd(editText, schema) : []),
    [editText, structErr, schema]);
  const editErr = structErr || (xsdProblems.length ? xsdProblemLine(xsdProblems[0]) : "");
  const editIssues = React.useMemo(
    () => (editText && !editErr ? grismXmlProblems(editText) : []), [editText, editErr]);

  return (
    <section className="xfiles">
      {apply.active && (
        <div className="apply-overlay">
          <div className="apply-card">
            <div className="apply-spinner" />
            <div className="apply-msg">{apply.msg}</div>
            <div className="apply-sub">{tr("ex.applyingToDevice")}</div>
          </div>
        </div>
      )}
      <button className="xf-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {tr("xf.title")}
        {files && files.length > 0 && <span className="xf-count">{files.length}</span>}
        <span className="xf-chev">{open ? tr("xf.hide") : tr("xf.show")}</span>
      </button>
      {open && (
        <div className="xf-body">
          <p className="xf-note">{tr("xf.note")}</p>
          {listErr && <p className="submit-note err">{tr("xf.listFailed")}</p>}
          {files !== null && files.length === 0 && !listErr && <p className="xf-empty">{tr("xf.none")}</p>}
          {files !== null && files.length > 0 && (
            <ul className="xf-list">
              {files.map((f) => {
                const editable = isExtraRunFileEditable(f.size);
                return (
                  <li key={f.name} className={editing?.name === f.name ? "on" : ""}>
                    <code className="xf-name">{f.name}</code>
                    <span className="xf-size">
                      {f.size === null ? tr("xf.unknownSize") : formatFileSize(f.size)}
                      {!editable && f.size !== null && <span className="xf-big"> · {tr("xf.tooBig")}</span>}
                    </span>
                    {editable
                      ? <button className="copy-btn" disabled={busy === f.name} onClick={() => openFile(f.name)}>
                          {busy === f.name ? tr("xf.loading") : tr("xf.open")}</button>
                      : <a className="copy-btn" href={extraRunFileHref(f.name)} download={f.name}>{tr("xf.download")}</a>}
                    <button className="copy-btn xf-del" onClick={() => setConfirmDel(f.name)}>{tr("xf.delete")}</button>
                  </li>
                );
              })}
            </ul>
          )}

          {adding === null
            ? free.length > 0 && <button className="xf-add" onClick={() => setAdding(free[0])}>{tr("xf.add")}</button>
            : (
              <div className="xf-new">
                <label>{tr("xf.namePick")}
                  <select value={adding} onChange={(e) => setAdding(e.target.value)}>
                    {free.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button className="copy-btn" disabled={!!addProblem}
                  onClick={() => { setEditing({ name: adding, text: "<run>\n</run>" }); setAdding(null); }}>
                  {tr("xf.create")}</button>
                <button className="copy-btn" onClick={() => setAdding(null)}>{tr("xf.cancel")}</button>
                {addProblem && <span className="submit-note err">{tr(addProblem)}</span>}
              </div>
            )}

          {editing && (
            <div className="xf-edit">
              <div className="xb-head">
                <span className="xb-title"><code>{editing.name}</code></span>
                <div className="xb-actions">
                  <button className="copy-btn" onClick={() => setEditing(null)}>{tr("xf.cancel")}</button>
                  <button className="copy-btn" onClick={formatEditing}>{tr("ex.format")}</button>
                  <button className="submit-btn" disabled={!!editErr || state.kind === "sending"}
                    onClick={() => submitFile(editing.name, editing.text)}>
                    {state.kind === "sending" ? tr("xf.submitting") : tr("xf.submit")}</button>
                </div>
              </div>
              <p className="xf-note">{tr("xf.editingNote")}</p>
              <XmlEditor value={editing.text} onChange={(v) => setEditing({ ...editing, text: v })} />
              {/* syntax first -- a file that will not parse cannot be submitted --
                  then the GRISM field checks, which inform without blocking: these
                  files are fragments and may reference things run.xml defines. */}
              {editErr && <p className="submit-note err">{tr("set.xmlInvalid")}: {editErr}
                {xsdProblems.length > 1 && <> ({xsdProblems.length} {tr("ex.issues")})</>}</p>}
              {!editErr && editIssues.length > 0 && (
                <p className="submit-note warn">
                  {editIssues.length} {editIssues.length > 1 ? tr("ex.issues") : tr("ex.issue")}:{" "}
                  {editIssues.slice(0, 3).map(problemLine).join("; ")}
                  {editIssues.length > 3 ? "…" : ""}</p>
              )}
              {!editErr && editIssues.length === 0 && <p className="submit-note ok">{tr("ex.xmlOk")}</p>}
            </div>
          )}

          {state.kind === "err" && <p className="submit-note err">{state.msg}</p>}
          {state.kind === "ok" && <p className="submit-note ok">{state.msg}</p>}

          {confirmDel && (
            <div className="modal-scrim" onClick={() => setConfirmDel(null)}>
              <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">{tr("xf.deleteTitle")}</div>
                <p className="modal-body"><code>{confirmDel}</code> — {tr("xf.deleteBody")}</p>
                <button className="opt drop" onClick={() => deleteFile(confirmDel)}>
                  <span className="opt-name">{tr("xf.deleteConfirm")}</span>
                  <span className="opt-desc">{tr("xf.deleteBody")}</span>
                </button>
                <button className="opt-cancel" onClick={() => setConfirmDel(null)}>{tr("xf.cancel")}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
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
/* The XML editor used by both the export pane and the device-settings page: a
   highlighted copy under a transparent textarea, with a gutter of line numbers.
   All three layers share the same metrics so the text lines up exactly. */
function XmlEditor({ value, onChange, readOnly = false, className = "" }) {
  const taRef = React.useRef(null);
  const hlRef = React.useRef(null);
  const gutRef = React.useRef(null);
  const lineCount = React.useMemo(() => String(value ?? "").split("\n").length, [value]);
  const sync = (e) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (hlRef.current) { hlRef.current.scrollTop = scrollTop; hlRef.current.scrollLeft = scrollLeft; }
    if (gutRef.current) gutRef.current.scrollTop = scrollTop;
  };
  return (
    <div className={"xml-editor" + (readOnly ? "" : " editing") + (className ? " " + className : "")}>
      <pre className="xml-gutter" ref={gutRef} aria-hidden="true"><code>
        {Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n")}
      </code></pre>
      <div className="xml-editor-main">
        <pre className="xml-hl" ref={hlRef} aria-hidden="true"><code>
          {tokenizeXml(value).map((t, i) => <span key={i} className={"x-" + t.type}>{t.text}</span>)}
          {"\n"}
        </code></pre>
        <textarea ref={taRef} className="set-raw-xml" value={value} spellCheck={false} readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)} onScroll={sync} />
      </div>
    </div>
  );
}

function XmlView({ xml }) {
  const lines = xml.split("\n");
  return (
    <pre className="xml"><code>{lines.map((ln, i) => (
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
  /* The outcome describes itself with a key rather than a sentence: this runs
     in a Chinese UI, and prose built here cannot be translated where it is
     shown. `text` stays for the cases that are already a port list. */
  let outcome = { kind: "default", key: "sim.noRoute" };
  let guard = 0;
  while (node && guard++ < 200) {
    if (isUnset(node)) { outcome = { kind: "default", key: "sim.unspecified" }; break; }
    if (node.t === "out") {
      if (isDrop(node)) outcome = { kind: "drop", key: "sim.dropped" };
      else outcome = { kind: "out", text: node.ports, mode: node.mode, lb: node.lb };
      break;
    }
    if (node.t === "branch") {
      const matched = evalFids(node.fids, node.fidOp, states);
      const alt = node.fids.split(",").map((t) => { const id = t.trim().replace(/^!/, ""); const neg = t.trim().startsWith("!"); return (neg ? "!" : "") + (filterAlt[id] || id); }).join(node.fidOp === "and" ? " AND " : " OR ");
      steps.push({ id: node.id, fids: node.fids, alt, matched });
      const nextNode = matched ? node.match : node.notmatch;
      if (!nextNode || isUnset(nextNode)) {
        outcome = { kind: "default", key: matched ? "sim.matchUnspec" : "sim.notMatchUnspec" };
        break;
      }
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
  const density = panelDensity(portOptions.length);
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
  // packets currently inside the device, each with the route it was launched on
  const animRef = useRef({ packets: [], last: 0, sinceSpawn: 0, seq: 0 });
  const planRef = useRef(animPlan);

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
      geo.wrapH = wb.height;   // how far a packet may travel before it is clipped
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
      // Seed a floating position for any inline that doesn't have one yet: below and
      // to the right of its port A, nudged further down if that spot is already
      // taken, so new devices land in free space rather than on top of each other.
      setDevPos((prev) => {
        let changed = false; const nextPos = { ...prev };
        const wrapH = wrap.getBoundingClientRect().height;
        inlines.forEach((d) => {
          if (nextPos[d.id]) return;
          const pa = geo.ports[d.portA];
          if (!pa) return;
          const bottom = pa.bottomEdge ?? pa.y;
          let x = pa.x + 34, y = bottom + 40;
          const taken = (px, py) => Object.values(nextPos).some((p) => Math.abs(p.x - px) < 120 && Math.abs(p.y - py) < 70);
          let guard = 0;
          while (taken(x, y) && guard++ < 12) y += 72;               // stack downward…
          if (y > wrapH - 60) { y = bottom + 40; x += 150; }          // …then start a new column
          nextPos[d.id] = { x: Math.max(4, x), y: Math.max(4, y) };
          changed = true;
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
  /* Keep the newest route where the spawner can reach it. Changing a filter
     switch mid-stream is not a reason to restart: packets already inside keep
     the route they entered on, and the next one to arrive picks up the new one.
     Losing the ingress port is different -- there is then nothing to send. */
  useEffect(() => {
    planRef.current = animPlan;
    if (!animPlan) {
      cancelAnimationFrame(rafRef.current);
      animRef.current = { packets: [], last: 0, sinceSpawn: 0, seq: 0 };
      setPlayState("idle"); setPackets([]); setTrails([]); setActiveDev(null);
      setNextPortSet(new Set()); setNextDevSet(new Set()); setPrevPortSet(new Set()); setPrevDevSet(new Set());
    }
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
    const plan = planRef.current;              // read at launch, not at play
    if (!plan || !plan.paths || !geo.center) return null;
    const OUT = 46;
    /* Outside the port, away from the chassis -- but never past the edge of the
       panel, which is scroll-clipped: a packet that starts there is invisible
       until it is already inside the device. */
    const H = geo.wrapH || 0;
    const outsidePt = (port) => {
      const p = geo.ports[port]; if (!p) return null;
      if (p.row === "top") return { x: p.x, y: Math.max(7, (p.topEdge ?? p.y) - OUT) };
      return { x: p.x, y: H ? Math.min(H - 7, (p.bottomEdge ?? p.y) + OUT) : (p.bottomEdge ?? p.y) + OUT };
    };
    const lists = plan.paths.map((nodes) => nodesToPts(nodes, outsidePt, geo)).filter(Boolean);
    return lists.length ? lists : null;
  };

  // advance every packet in flight by its own elapsed time; aggregate highlights
  // (active IPS, next/prev ports & IPSs) across all of them.
  const applyFrame = () => {
    const A = animRef.current;
    const positions = [], trailsOut = [];
    const activeDevs = new Set(), nextP = new Set(), nextD = new Set(), prevP = new Set(), prevD = new Set();
    A.packets.forEach((pk) => {
      const { pts, segs, total, dur } = pk;
      const t = Math.min(1, pk.elapsed / dur);
      let dist = t * total, i = 0;
      while (i < segs.length && dist > segs[i]) { dist -= segs[i]; i++; }
      let pos;
      if (i >= segs.length) pos = pts[pts.length - 1];
      else { const f = segs[i] ? dist / segs[i] : 0; pos = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }; }
      positions.push(pos);
      pk.trail.push(pos); while (pk.trail.length > 14) pk.trail.shift();
      trailsOut.push(pk.trail.slice());
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      if (a && b && a.dev && a.dev === b.dev) activeDevs.add(a.dev);
      for (let k = i + 1; k < pts.length; k++) { if (pts[k].dev) { nextD.add(pts[k].dev); break; } if (pts[k].port) { nextP.add(pts[k].port); break; } }
      for (let k = i; k >= 0; k--) { if (pts[k].dev) { prevD.add(pts[k].dev); break; } if (pts[k].port) { prevP.add(pts[k].port); break; } }
    });
    setPackets(positions);
    setTrails(trailsOut);
    setActiveDev(activeDevs.size ? [...activeDevs][0] : null);
    setNextPortSet(nextP); setNextDevSet(nextD); setPrevPortSet(prevP); setPrevDevSet(prevD);
  };

  const clearAnim = () => { setPackets([]); setTrails([]); setActiveDev(null); setNextPortSet(new Set()); setNextDevSet(new Set()); setPrevPortSet(new Set()); setPrevDevSet(new Set()); };

  // Travel time is distance-based so short hops feel snappy, but it's clamped at
  // both ends: without a ceiling, a packet routed through an inline device or a
  // LOOP port covers so much distance that the animation drags.
  const SPEED = 320;      // px/sec for ordinary distances
  const MIN_DUR = 650, MAX_DUR = 2000;
  const SPAWN_MS = 520;   // gap between arrivals -- a steady stream, never empty

  /* Launch one arrival: its route is resolved from the plan as it stands right
     now, so the filter switches decide where THIS packet goes. A chain that
     fans out to several ports launches one packet per branch. */
  const spawn = () => {
    const lists = buildAllWaypoints();
    if (!lists || !lists.length) return false;
    const A = animRef.current;
    lists.forEach((pts) => {
      const segs = []; let total = 0;
      for (let i = 0; i < pts.length - 1; i++) { const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y; const len = Math.hypot(dx, dy); segs.push(len); total += len; }
      const dur = Math.min(MAX_DUR, Math.max(MIN_DUR, (total / SPEED) * 1000));
      A.packets.push({ id: ++A.seq, pts, segs, total, dur, elapsed: 0, trail: [] });
    });
    return true;
  };

  const runLoop = () => {
    animRef.current.last = performance.now();
    const tick = (now) => {
      const A = animRef.current;
      const dt = Math.min(64, now - A.last);   // a backgrounded tab must not jump
      A.last = now;
      A.sinceSpawn += dt;
      if (A.sinceSpawn >= SPAWN_MS) { A.sinceSpawn = 0; spawn(); }
      A.packets.forEach((pk) => { pk.elapsed += dt; });
      A.packets = A.packets.filter((pk) => pk.elapsed < pk.dur);   // gone off the far end
      applyFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    cancelAnimationFrame(rafRef.current);
    animRef.current = { packets: [], last: 0, sinceSpawn: 0, seq: 0 };
    if (!spawn()) return;                   // no geometry yet / nothing to trace
    setPlayState("playing");
    runLoop();
  };

  const pause = () => { cancelAnimationFrame(rafRef.current); setPlayState("paused"); };
  const resume = () => { setPlayState("playing"); runLoop(); };
  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    animRef.current = { packets: [], last: 0, sinceSpawn: 0, seq: 0 };
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
    <div className="dev-panel" data-dense={density}>
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
            {/* the legend rides in the head rather than taking a row of its own,
                which is height the chain view below needs more than it does */}
            {/* the same four states the port tooltips already name */}
            <div className="dev-legend">
              <span className="dev-leg in"><span className="dev-leg-dot" />{tr("sim.roleIn")}</span>
              <span className="dev-leg out"><span className="dev-leg-dot" />{tr("sim.roleOut")}</span>
              <span className="dev-leg both"><span className="dev-leg-dot" />{tr("sim.roleBoth")}</span>
              <span className="dev-leg idle"><span className="dev-leg-dot" />{tr("sim.roleIdle")}</span>
            </div>
            <div className="dev-head-btns">
              {playState === "idle" && <button className="dev-play" onClick={play} disabled={!animPlan} title={animPlan ? tr("sim.playTip") : tr("sim.selectIngress")}>{tr("sim.play")}</button>}
              {playState === "playing" && <button className="dev-play" onClick={pause} title={tr("sim.pauseTip")}>{tr("sim.pause")}</button>}
              {playState === "paused" && <button className="dev-play" onClick={resume} title={tr("sim.resumeTip")}>{tr("sim.resume")}</button>}
              {playState !== "idle" && <button className="dev-stop" onClick={stop} title={tr("sim.stopTip")}>{tr("sim.stop")}</button>}
              <div className="inline-add-wrap">
                <button className={"inline-add-btn" + (inlineDraft.open ? " on" : "")}
                  onClick={() => setInlineDraft((s) => {
                    if (s.open) return { ...s, open: false };
                    // Prefill with the selected port and the one after it; with nothing
                    // selected, fall back to the first two ports on the device.
                    const i = selected ? portOptions.indexOf(selected) : -1;
                    const a = i >= 0 ? portOptions[i] : portOptions[0] ?? "";
                    const b = i >= 0 ? (portOptions[i + 1] ?? portOptions[i - 1] ?? "")
                                     : (portOptions[1] ?? "");
                    return { ...s, open: true, portA: a, portB: b };
                  })}>{tr("sim.addInline")}</button>
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

/* ============================================================
   L2GRE correlation — which tunnel each inner MAC was seen inside
   ============================================================ */
/* ============================================================
   MEC mapping table — the S1AP/NGAP item table, a page at a time
   ------------------------------------------------------------
   The table holds up to a million rows and the firmware builds its answer in a
   64KB buffer, so the page asks for a window (offset/limit) rather than the
   whole thing, and reads the matched total back to know how many pages there
   are. Auto-refresh is off by default here, unlike the counter pages: rows move
   under a reader who is on page 7 of 400, and re-sorting the ground under them
   every five seconds is not a service.
   ============================================================ */
function MecTab({ loggedIn, t }) {
  const tr = t || ((k) => k);
  const [data, setData] = React.useState(null);      // null = not read yet
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(S1AP_PAGE_DEFAULT);
  const [jump, setJump] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  /* This page refreshes by default, unlike the other tables: the mapping is a
     live thing an operator watches while traffic runs. Five seconds, and the
     interval is theirs to change. */
  const [auto, setAuto] = React.useState(true);
  const [every, setEvery] = React.useState(5);
  const [updatedAt, setUpdatedAt] = React.useState(null);
  // filters, applied by the device: a UE address or subnet, and an idle time
  // with the comparison the firmware implements (at most / longer than)
  const [ue, setUe] = React.useState("");
  const [all, setAll] = React.useState(false);     // include rows with no UE address
  /* The view an operator wants first is the sessions that are still current,
     so the filter starts at "idle at most an hour". Emptying the seconds box
     shows everything. */
  const [idleOp, setIdleOp] = React.useState("le");
  const [idleSecs, setIdleSecs] = React.useState("3600");
  const [confirm, setConfirm] = React.useState(null);   // { kind: "idle" | "all" }
  const [cleared, setCleared] = React.useState("");
  const seq = React.useRef(0);
  const filters = React.useRef({ ue: "", all: false, idleOp: "le", idleSecs: "3600" });
  filters.current = { ue, all, idleOp, idleSecs };

  const read = React.useCallback(async (wantPage, wantSize) => {
    const mine = ++seq.current;
    setBusy(true);
    try {
      const f = filters.current;
      const res = await fetch(`/grism/task/get_s1ap_items?${s1apQuery({ page: wantPage, size: wantSize, ...f })}`,
        { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const parsed = parseS1apItems(await res.json());
      if (mine !== seq.current) return;               // a newer read already answered
      setData(parsed); setErr(""); setUpdatedAt(new Date());
      /* The table can shrink between reads -- the idle sweep runs, or someone
         clears it -- so a page that no longer exists comes back to the last one
         that does, and reads again rather than showing an empty screen. */
      const clamped = s1apClampPage(wantPage, parsed.matched, wantSize);
      if (clamped !== wantPage) setPage(clamped);
    } catch (e) {
      if (mine === seq.current) setErr(String(e.message || e));
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, []);

  /* The filters are part of what a page means, so changing one starts again at
     the first page rather than leaving the reader on page 7 of a different
     result set. */
  const applyFilters = () => { setPage(1); read(1, size); };
  const clearFilters = () => {
    setUe(""); setAll(false); setIdleOp("le"); setIdleSecs("3600");
    filters.current = { ue: "", all: false, idleOp: "le", idleSecs: "3600" };
    setPage(1); read(1, size);
  };
  const filtered = !!String(ue).trim() || all || String(idleSecs).trim() !== "3600" || idleOp !== "le";
  /* Clearing by idle time only means anything for rows idle LONGER than the
     number given -- that is what the device does with it. Offering the button
     next to "at most" would invite clearing everything that is still in use. */
  const idleSecsN = String(idleSecs).trim();
  const canClearIdle = idleOp === "gt" && /^\d+$/.test(idleSecsN) && +idleSecsN > 0;
  const ueProblem = s1apUeFilterProblem(ue);
  const idleProblem = s1apIdleProblem(idleSecs);

  /* Both clears are the device's own: one drops the rows that have been idle
     longer than the number given, the other empties the S1AP tables outright.
     Destructive, so both go through a confirmation. */
  const runClear = async (kind) => {
    setConfirm(null); setBusy(true);
    try {
      const url = kind === "idle"
        ? `/grism/task/clear_s1ap_items?max-idle=${encodeURIComponent(String(idleSecs).trim() || "0")}`
        : "/grism/task/clear_s1ap_tables";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setCleared(kind);
      setTimeout(() => setCleared(""), 2500);
      setPage(1); await read(1, size);
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  React.useEffect(() => { if (loggedIn) read(page, size); }, [loggedIn, page, size, read]);
  React.useEffect(() => {
    if (!auto || !loggedIn) return;
    const id = setInterval(() => read(page, size), Math.max(1, Number(every) || 5) * 1000);
    return () => clearInterval(id);
  }, [auto, every, loggedIn, page, size, read]);

  if (!loggedIn) return <div className="sys-wrap"><div className="sys-need-login">{tr("tf.needLogin")}</div></div>;

  const rows = data?.rows ?? [];
  const matched = data?.matched ?? 0;
  const pages = s1apPageCount(matched, size);
  const first = matched === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(matched, (page - 1) * size + rows.length);
  const go = (n) => { const next = s1apClampPage(n, matched, size); setJump(""); setPage(next); };

  return (
    <div className="sys-wrap">
      <div className="sys-head">
        <h2 className="sys-title">{tr("tab.trafficMec")}</h2>
        <div className="sys-controls">
          {updatedAt && <span className="sys-updated">{tr("tf.updated")} {updatedAt.toLocaleTimeString()}</span>}
          <label className="sys-auto"><input type="checkbox" checked={auto}
            onChange={(e) => setAuto(e.target.checked)} /> {tr("sys.auto")}</label>
          {/* typed, like the interface page: five seconds suits a busy device
              and thirty suits a quiet one, and neither is worth a dropdown */}
          <label className="tf-interval">{tr("tf.every")}
            <input type="number" min="1" value={every} disabled={!auto}
              onChange={(e) => setEvery(e.target.value)} />
            {tr("tf.seconds")}</label>
          <button className="sys-refresh" onClick={() => read(page, size)} disabled={busy}>
            {busy ? tr("sys.refreshing") : tr("sys.refresh")}</button>
        </div>
      </div>
      <p className="page-note">{tr("mec.note")}</p>

      <div className="mec-filters">
        <div className="mec-filter-group">
        <label className="ml"><span>{tr("mec.ueFilter")}</span>
          <input type="text" value={ue} placeholder="172.16.0.0/16"
            onChange={(e) => setUe(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !ueProblem && !idleProblem) applyFilters(); }} /></label>
        {/* without this the device only returns rows that already have a UE
            address; the ones still being set up are invisible */}
        <label className="set-check"><input type="checkbox" checked={all} disabled={!!String(ue).trim()}
          onChange={(e) => setAll(e.target.checked)} /> {tr("mec.showAll")}</label>
        </div>
        <label className="ml"><span>{tr("mec.idleFilter")}</span>
          <select value={idleOp} onChange={(e) => setIdleOp(e.target.value)}>
            <option value="le">{tr("mec.idleLe")}</option>
            <option value="gt">{tr("mec.idleGt")}</option>
          </select></label>
        <label className="ml"><span>{tr("mec.idleSecs")}</span>
          <input type="text" inputMode="numeric" value={idleSecs} placeholder="600"
            onChange={(e) => setIdleSecs(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !ueProblem && !idleProblem) applyFilters(); }} /></label>
        <button className="sys-refresh" disabled={busy || !!ueProblem || !!idleProblem}
          onClick={applyFilters}>{tr("mec.search")}</button>
        {filtered && <button className="copy-btn" disabled={busy} onClick={clearFilters}>{tr("mec.clearFilter")}</button>}
        {/* both of these change the device, so they sit apart from the search */}
        <span className="mec-filter-gap" />
        <button className="copy-btn" disabled={busy || !canClearIdle}
          title={tr("mec.clearIdleTip")}
          onClick={() => setConfirm({ kind: "idle" })}>{tr("mec.clearIdle")}</button>
        <button className="del" disabled={busy} onClick={() => setConfirm({ kind: "all" })}>{tr("mec.clearAll")}</button>
      </div>
      {ueProblem && <p className="set-hint err">{tr("mec.ueFilterBad")}</p>}
      {idleProblem && <p className="set-hint err">{tr("mec.idleSecsBad")}</p>}
      {cleared && <div className="set-ok-banner">{tr(cleared === "idle" ? "mec.clearedIdle" : "mec.clearedAll")}</div>}

      {err && <div className="sys-err">{tr("set.loadFailed")}: {err}</div>}
      {data === null && !err && <p className="sys-note dim">{tr("set.loading")}</p>}

      {data && (
        <div className="mec-summary">
          <span>{tr("mec.inTable")} <b className="mono">{fmtCount(data.used)}</b>
            <span className="dim"> / {fmtCount(data.capacity)}</span></span>
        </div>
      )}
      {/* The firmware fills a 64KB buffer; when that ends the page rather than
          the data, the page is short and the reader has to be told why. */}
      {data?.truncated && <p className="set-hint warn">{tr("mec.truncated")}</p>}

      {data && rows.length === 0 && <p className="sys-note dim">{tr("mec.empty")}</p>}

      {rows.length > 0 && <div className="tf-table-wrap">
        <table className="tf-table">
          {/* The device does not say whether a row came from S1AP or NGAP --
              the isngap bit is not on the wire -- so the identity columns name
              both. The request/response E-RAB pair is the uplink and downlink
              GTP tunnel respectively. */}
          <thead><tr>
            <th>{tr("mec.mmeUeId")}</th>
            <th>{tr("mec.ranUeId")}</th>
            <th>{tr("mec.plmnId")}</th>
            <th>{tr("mec.cellId")}</th>
            <th>{tr("mec.spid")}</th>
            <th>{tr("mec.ulTeid")}</th>
            <th>{tr("mec.ulIp")}</th>
            <th>{tr("mec.dlTeid")}</th>
            <th>{tr("mec.dlIp")}</th>
            <th>{tr("mec.ueIp")}</th>
            <th>{tr("mec.idle")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${data.offset}-${i}`}>
                <td className="mono">{r.mmeid}</td>
                <td className="mono">{r.enbid}</td>
                {/* verbatim: the firmware prints this decimal when it can
                    decode the PLMN and as raw BCD hex when it cannot, and the
                    two are indistinguishable here */}
                <td className="mono">{r.plmnid}</td>
                <td className="mono">{r.cellid}</td>
                {/* 0 is a real SPID as far as this table can tell: the field is
                    left at zero when the setup carried none */}
                <td className="mono">{r.spid}</td>
                <td className="mono">{r.reqTeid}</td>
                <td className="mono">{r.reqIp}</td>
                <td className="mono">{r.resTeid}</td>
                <td className="mono">{r.resIp}</td>
                <td className="mono">{r.ueIp || "—"}</td>
                <td className="mono">{fmtIdle(r.idle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {confirm && (
        <div className="modal-scrim" onClick={() => setConfirm(null)}>
          <div className="modal modal-warn" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{tr(confirm.kind === "idle" ? "mec.clearIdleTitle" : "mec.clearAllTitle")}</div>
            <p className="modal-body">{confirm.kind === "idle"
              ? tr("mec.clearIdleBody").replace("{n}", String(idleSecs).trim())
              : tr("mec.clearAllBody")}</p>
            <button className="opt drop" onClick={() => runClear(confirm.kind)}>
              <span className="opt-name">{tr(confirm.kind === "idle" ? "mec.clearIdle" : "mec.clearAll")}</span>
            </button>
            <button className="opt-cancel" onClick={() => setConfirm(null)}>{tr("common.cancel")}</button>
          </div>
        </div>
      )}

      {data && (
        <div className="mec-pager">
          {/* exact, not compacted: this is a row range the reader may want to
              compare or type into the page box */}
          <span className="mec-range">{tr("mec.showing")
            .replace("{from}", fmtCount(first)).replace("{to}", fmtCount(last)).replace("{total}", fmtCount(matched))}</span>
          <label className="ml mec-size"><span>{tr("mec.perPage")}</span>
            <select value={size} onChange={(e) => { setPage(1); setSize(+e.target.value); }}>
              {S1AP_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="mec-pager-btns">
            <button className="copy-btn" disabled={page <= 1 || busy} onClick={() => go(page - 1)}>{tr("mec.prev")}</button>
            {s1apPageList(page, pages).map((n, i) => (n === "gap"
              ? <span className="mec-gap" key={"g" + i}>…</span>
              : <button key={n} className={"mec-page" + (n === page ? " on" : "")}
                  disabled={busy} onClick={() => go(n)}>{n}</button>))}
            <button className="copy-btn" disabled={page >= pages || busy} onClick={() => go(page + 1)}>{tr("mec.next")}</button>
          </div>
          <form className="mec-jump" onSubmit={(e) => {
            e.preventDefault();
            const n = s1apParsePage(jump, matched, size);
            if (n !== null) go(n);
          }}>
            <label className="ml"><span>{tr("mec.jump")}</span>
              <input type="text" inputMode="numeric" value={jump} placeholder={String(page)}
                onChange={(e) => setJump(e.target.value)} /></label>
            <button className="copy-btn" type="submit"
              disabled={busy || s1apParsePage(jump, matched, size) === null}>{tr("mec.go")}</button>
            <span className="dim">{tr("mec.ofPages").replace("{n}", fmtCount(pages))}</span>
          </form>
        </div>
      )}
    </div>
  );
}

function L2greTab({ data, correlating, onData, t }) {
  const tr = t || ((k) => k);
  const rows = data?.rows ?? [];
  const loading = data === null;
  const [auto, setAuto] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const read = React.useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/grism/task/get_l2gre_correlation_table", { credentials: "include" });
      if (res.ok) onData?.(parseL2greCorrelation(await res.json()));
    } catch { /* keep whatever was last read */ }
    finally { setBusy(false); }
  }, [onData]);

  React.useEffect(() => {
    if (!auto) return;
    const id = setInterval(read, 5000);
    return () => clearInterval(id);
  }, [auto, read]);
  return (
    <div className="sys-wrap">
      <div className="sys-head">
        <h2 className="sys-title">{tr("tab.trafficL2gre")}</h2>
        <div className="sys-controls">
          <label className="sys-auto"><input type="checkbox" checked={auto}
            onChange={(e) => setAuto(e.target.checked)} /> {tr("sys.auto")}</label>
          <button className="sys-refresh" onClick={read} disabled={busy}>
            {busy ? tr("sys.refreshing") : tr("sys.refresh")}</button>
        </div>
      </div>
      <p className="page-note">{tr("l2g.note")}</p>
      {data?.hidden > 0 && (
        <p className="set-hint warn">{tr("l2g.truncated").replace("{n}", data.hidden)}</p>
      )}
      {/* The two states worth explaining rather than showing as an empty table */}
      {!loading && rows.length === 0 && correlating && (
        <p className="sys-note dim">{tr("l2g.emptyOn")}</p>
      )}
      {rows.length > 0 && !correlating && (
        <p className="set-hint warn">{tr("l2g.staleOff")}</p>
      )}
      {loading && <p className="sys-note dim">{tr("set.loading")}</p>}
      {rows.length > 0 && <div className="tf-table-wrap">
        <table className="tf-table">
          <thead><tr>
            <th>{tr("l2g.outerDst")}</th>
            <th>{tr("l2g.outerSrc")}</th>
            <th>{tr("l2g.inner")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {/* the tunnel endpoint the traffic went to, then where it came
                    from, then the MAC that was riding inside */}
                <td className="mono">{r.outerDstIp} <span className="l2g-mac">({r.outerDstMac})</span></td>
                <td className="mono">{r.outerSrcIp} <span className="l2g-mac">({r.outerSrcMac})</span></td>
                <td className="mono">{r.innerMac}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {rows.length > 0 && <p className="sys-note dim">{rows.length} {tr("l2g.entries")}</p>}
    </div>
  );
}

function SimulateTab({ doc, definedIds, portOptions, loopPorts = [], simState, simInPort, simInlines, simInlineDraft, simFlipped, t }) {
  /* Where each "On" in an outcome actually sends the packet. */
  const outIdx = React.useMemo(() => outputIndex(doc), [doc.outputs]);
  const destLines = (text) => String(text ?? "").split(",").map((x) => x.trim()).filter(Boolean)
    .map((tok) => { const d = destLabel(tok, outIdx); return d ? `${tok} → ${d}` : ""; })
    .filter(Boolean);
  const tr = t || ((k) => k);
  // a port list stays as it is; anything else names a translated sentence
  const outcomeText = (o) => (o.key ? tr(o.key) : o.text);
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
        {!inPort && <div className="sim-hint">{tr("sim.pickIngress")}</div>}
        {inPort && matchingChains.length === 0 &&
          <div className="sim-hint">{tr("sim.noChainFor").replace("{port}", inPort)}</div>}
        {results.map(({ chain, steps, outcome }, i) => (
          <div key={chain.cid} className="sim-trace">
            <div className="sim-trace-head">
              <span className="sim-chip in">IN {inPort}</span>
              {matchingChains.length > 1 && <span className="sim-trace-n">{tr("sim.chainN").replace("{n}", i + 1)}</span>}
            </div>
            <div className="sim-flow">
              <div className="sim-node in"><span className="sim-node-k">{tr("sim.ingress")}</span><span className="sim-node-v">{inPort}</span></div>
              {steps.map((s) => (
                <React.Fragment key={s.id}>
                  <div className="sim-arrow">↓</div>
                  <div className={"sim-node branch " + (s.matched ? "matched" : "notmatched")}>
                    <span className="sim-node-k">{s.fids}{s.alt && s.alt !== s.fids ? ` · ${s.alt}` : ""}</span>
                    <span className={"sim-node-badge " + (s.matched ? "match" : "notmatch")}>{(s.matched ? tr("sim.match") : tr("sim.notMatch")) + " →"}</span>
                  </div>
                </React.Fragment>
              ))}
              <div className="sim-arrow">↓</div>
              <div className={"sim-node out " + outcome.kind}>
                <span className="sim-node-k">{outcome.kind === "out" ? (outcome.mode === "loadBalance" ? tr("sim.loadBalance") : tr("sim.output")) : outcome.kind === "drop" ? tr("sim.discard") : tr("sim.default")}</span>
                <span className="sim-node-v">{outcomeText(outcome)}{outcome.kind === "out" && outcome.mode === "loadBalance" ? ` (${outcome.lb})` : ""}</span>
                {/* "O2" is a reference; say which port it leaves by, and what it
                    was called, as the overview flow does */}
                {destLines(outcome.text ?? "").map((line, k) => (
                  <span className="sim-node-dest" key={k}>{line}</span>
                ))}
              </div>
            </div>
            <div className="sim-summary">
              {tr("sim.packetOn")} <code>{inPort}</code>
              {steps.length > 0 && <> → {steps.map((s, j) => <span key={j}>{j > 0 ? ", " : ""}<code>{s.fids}</code> {s.matched ? tr("sim.match") : tr("sim.notMatch")}</span>)}</>}
              {" → "}<b className={"sim-out-" + outcome.kind}>{outcomeText(outcome)}</b>
              {destLines(outcome.text ?? "").length > 0 && <span className="sim-summary-dest"> ({destLines(outcome.text ?? "").join("; ")})</span>}
            </div>
          </div>
        ))}
      </section>
      </div>
    </div>
  );
}

function ExportTab({ runXml, problems, warnings = [], onGoto, onApplyXml, onApplied, docSource, loggedIn, lang, t }) {
  const tr = t || ((k) => k);
  const [copied, setCopied] = useState(false);
  const [submit, setSubmit] = useState({ state: "idle", msg: "" }); // idle | sending | ok | error
  const [confirmSubmit, setConfirmSubmit] = useState(false); // show the "submit to device?" confirmation
  const [apply, setApply] = useState({ active: false, msg: "", warn: "" }); // device-side apply polling
  const [edit, setEdit] = useState(null); // null = read-only; string = editing draft
  const [applyErr, setApplyErr] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [applyWarn, setApplyWarn] = useState([]);
  const copy = () => { if (problems.length) return; navigator.clipboard?.writeText(runXml); setCopied(true); setTimeout(() => setCopied(false), 1400); };

  const startEdit = () => { setEdit(runXml); setApplyErr(""); setApplyWarn([]); };
  const cancelEdit = () => { setEdit(null); setApplyErr(""); setApplyWarn([]); };
  const formatEdit = () => {
    try { setEdit(formatXml(edit)); } catch { /* indent only; editErr reports syntax */ }
  };

  /* Checked as you type: a mistake shows up immediately rather than when a button
     is pressed, and the GRISM checks only run once the XML itself parses. */
  /* Structure, not just syntax: a well-formed document with no <run> in it
     used to leave "apply changes" enabled, and only failed once pressed. */
  const [schema, setSchema] = useState(undefined);
  useEffect(() => { loadRunSchema().then(setSchema); }, []);
  /* Validation is expensive -- a structural check is three parses of the whole
     document and the schema check two more -- and it used to run on the value
     as typed, with grismStructureError called twice over. A large config made
     every keystroke a visible stall. Validate the deferred value, so typing
     stays ahead of it, and compute the structural error once. */
  const deferredEdit = React.useDeferredValue(edit);
  const structErr = React.useMemo(
    () => (deferredEdit && deferredEdit.trim() ? grismStructureError(deferredEdit) : ""), [deferredEdit]);
  const xsdProblems = React.useMemo(
    () => (deferredEdit && deferredEdit.trim() && schema && !structErr ? validateAgainstXsd(deferredEdit, schema) : []),
    [deferredEdit, schema, structErr]);
  const editErr = React.useMemo(
    () => (deferredEdit && deferredEdit.trim()
      ? structErr || (xsdProblems.length ? xsdProblemLine(xsdProblems[0]) : "")
      : ""), [deferredEdit, structErr, xsdProblems]);
  const editIssues = React.useMemo(
    () => (deferredEdit && deferredEdit.trim() && !editErr ? grismXmlProblems(deferredEdit) : []), [deferredEdit, editErr]);
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

  // Locks the screen with an overlay; unlocks on completion, timeout, or
  // repeated request failure so the UI can never get stuck.
  const pollApplyStatus = async () => {
    setApply({ active: true, msg: "applying configuration…", warn: "" });
    const warn = await waitForDeviceApply((msg) => setApply({ active: true, msg, warn: "" }));
    setApply({ active: false, msg: "", warn });
    if (warn) return;
    setSubmit({ state: "ok", msg: "applied" });
    onApplied?.(); // config is now live on the device → clear dirty state
    setTimeout(() => setSubmit({ state: "idle", msg: "" }), 2500);
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
            {/* same button order in both states, and the same order the device
                settings page uses: edit/cancel · format · copy · primary action */}
            {loggedIn && <button className={"copy-btn" + (showSaved ? " on" : "")}
              onClick={() => setShowSaved((v) => !v)}>{tr("sv.title")}</button>}
            <button className="copy-btn" onClick={editing ? cancelEdit : startEdit}>
              {editing ? tr("ex.cancel") : tr("ex.edit")}</button>
            <button className="copy-btn" disabled={!editing} onClick={formatEdit}>{tr("ex.format")}</button>
            <button className="copy-btn" disabled={!editing && problems.length > 0}
              onClick={() => { if (editing) { navigator.clipboard?.writeText(edit); setCopied(true); setTimeout(() => setCopied(false), 1400); } else copy(); }}>
              {copied ? tr("ex.copied") : (!editing && problems.length) ? tr("ex.fixToCopy") : tr("ex.copy")}</button>
            {loggedIn && <SavedConfigs runXml={runXml} onLoadXml={onApplyXml} lang={lang}
              open={showSaved} onClose={() => setShowSaved(false)} t={t} />}
            {editing
              ? <button className="submit-btn" disabled={!!editErr} onClick={applyEdit}>{tr("ex.applyChanges")}</button>
              : loggedIn && (
                <button className={"submit-btn" + (submit.state === "error" ? " err" : submit.state === "ok" ? " ok" : "")}
                  disabled={problems.length > 0 || submit.state === "sending" || apply.active} onClick={() => setConfirmSubmit(true)}>{submitLabel}</button>
              )}
          </div>
        </div>
        {editing
          ? (
            <XmlEditor value={edit} onChange={setEdit} className="xml-editor-flex" />
          )
          : <XmlView xml={runXml} />}
      </div>
      <aside className="export-side">
        {!editing && <div className={"pane-validity " + (problems.length ? "bad" : warnings.length ? "warn" : "ok")}>
          <span className="dot" />{problems.length ? `${problems.length} ${problems.length>1?tr("ex.issues"):tr("ex.issue")}` : warnings.length ? `${warnings.length} ${warnings.length>1?tr("ex.warningsWord"):tr("ex.warningWord")} ${tr("ex.canSubmit")}` : tr("ex.readyExport")}
        </div>}
        {editing && <div className="edit-help">
          <p>{tr("ex.editHelp")}</p>
          {/* live feedback while typing: syntax first, then the GRISM checks */}
          {editErr && <p className="submit-note err">{tr("set.xmlInvalid")}: {editErr}
            {xsdProblems.length > 1 && <> ({xsdProblems.length} {tr("ex.issues")})</>}</p>}
          {!editErr && editIssues.length > 0 && (
            <p className="submit-note warn">{editIssues.length} {editIssues.length > 1 ? tr("ex.issues") : tr("ex.issue")}:{" "}
              {editIssues.slice(0, 3).map(problemLine).join("; ")}{editIssues.length > 3 ? "…" : ""}</p>
          )}
          {!editErr && editIssues.length === 0 && <p className="submit-note ok">{tr("ex.xmlOk")}</p>}
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
      {loggedIn && <OtherConfigFiles t={t} />}
    </div>
  );
}

