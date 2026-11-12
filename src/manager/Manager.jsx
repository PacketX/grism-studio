/* ============================================================
   GRISM Manager — the pages: sign-in, the node list, a node's detail, events,
   accounts, audit and settings. Every node's own pages are its Studio, opened
   through the manager at /n/<id>/grism-studio/.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtSpeed, fmtUptime } from "../grism-core.js";
import { STUDIO_VERSION } from "../i18n.js";
import { makeMT } from "./manager-i18n.js";
import * as M from "./mgr-core.js";

const PREFS_KEY = "grism-studio-prefs";     // the Studio's: one choice of language and theme for both
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch { /* private mode */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(status, body) {
    super(M.errorText(body, status));
    this.status = status;
    this.body = body;
    this.code = M.errorCode(body);
  }
}

/* The manager's API. A call the page makes on its own (the five-second
   refresh) says so, so it does not count as the user being active. */
async function api(path, { method = "GET", body, background = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (background) headers["X-GM-Background"] = "1";
  const res = await fetch(path, { method, headers, credentials: "same-origin",
                                  body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export default function Manager() {
  const [lang, setLang] = useState(() => readPrefs().lang ?? "zh-TW");
  const [theme, setTheme] = useState(() => readPrefs().theme ?? "light");
  const t = useMemo(() => makeMT(lang), [lang]);
  const [me, setMe] = useState(undefined);          // undefined: asking; null: signed out
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("nodes");

  useEffect(() => { api("/api/v1/me").then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => { document.documentElement.lang = lang === "zh-TW" ? "zh-Hant" : "en"; writePrefs({ lang }); }, [lang]);
  useEffect(() => { writePrefs({ theme }); }, [theme]);
  useEffect(() => { document.title = t("app.title"); }, [t]);

  const lost = useCallback((why) => { setMe(null); setNotice(why); }, []);
  const call = useCallback(async (path, opts) => {
    try { return await api(path, opts); } catch (e) {
      if (e.status === 401) lost(t("login.expired"));
      throw e;
    }
  }, [lost, t]);
  const logout = useCallback(async () => {
    try { await api("/api/v1/logout", { method: "POST" }); } catch { /* signed out either way */ }
    setMe(null); setNotice(t("login.signedOut")); setTab("nodes");
  }, [t]);

  const admin = me && me.priv >= 15;
  const TABS = [["nodes", 1], ["events", 1], ["accounts", 15], ["audit", 15], ["settings", 1]];

  return (
    <div className={"gs-root mgr" + (theme === "light" ? " light" : "")}>
      {me === undefined ? <div className="mgr-center mgr-dim">{t("app.loading")}</div>
        : me === null ? <LoginView t={t} notice={notice} onDone={(u) => { setNotice(""); setMe(u); }} />
        : me.must_change ? (
          <div className="mgr-center">
            <div className="mgr-login">
              <Brand />
              <h2 className="mgr-h2">{t("pw.mustTitle")}</h2>
              <p className="mgr-dim">{t("pw.mustBody")}</p>
              <PasswordForm t={t} call={call} me={me} onDone={setMe} />
              <button className="mgr-link" onClick={logout}>{t("menu.logout")}</button>
            </div>
          </div>
        ) : (
          <>
            <header className="topbar mgr-top">
              <Brand onClick={() => setTab("nodes")} />
              <nav className="mgr-nav">
                {TABS.filter(([, p]) => me.priv >= p).map(([id]) => (
                  <button key={id} className={"ws-btn" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{t("tab." + id)}</button>
                ))}
              </nav>
              <span className="mgr-spacer" />
              <UserMenu t={t} me={me} call={call} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme}
                onLogout={logout} onMe={setMe} />
            </header>
            <main className="mgr-main">
              {tab === "nodes" && <NodesView t={t} call={call} me={me} />}
              {tab === "events" && <EventsView t={t} call={call} />}
              {tab === "accounts" && admin && <AccountsView t={t} call={call} me={me} />}
              {tab === "audit" && admin && <AuditView t={t} call={call} />}
              {tab === "settings" && <SettingsView t={t} call={call} me={me} />}
            </main>
          </>
        )}
    </div>
  );
}

function Brand({ onClick }) {
  return (
    <button className="brand mgr-brand" onClick={onClick} type="button">
      <span className="logo">◇</span><span className="brand-name">GRISM</span><span className="brand-sub">manager</span>
    </button>
  );
}

function Modal({ title, children, onClose, warn }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-scrim mgr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={"modal mgr-modal" + (warn ? " modal-warn" : "")} role="dialog" aria-modal="true">
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sign-in */
function LoginView({ t, notice, onDone }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { onDone(await api("/api/v1/login", { method: "POST", body: { username: u.trim(), password: p } })); }
    catch (ex) { setErr(ex.status === 423 ? t("login.locked") : ex.status === 401 ? t("login.bad") : ex.message); }
    finally { setBusy(false); setP(""); }
  };
  return (
    <div className="mgr-center">
      <form className="mgr-login" onSubmit={submit}>
        <Brand />
        <p className="mgr-dim">{t("login.lead")}</p>
        {notice && <p className="set-hint warn">{notice}</p>}
        <label className="ml"><span>{t("login.user")}</span>
          <input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} /></label>
        <label className="ml"><span>{t("login.password")}</span>
          <input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></label>
        {err && <p className="set-hint err">{err}</p>}
        <button className="sys-refresh mgr-wide" disabled={busy || !u.trim() || !p}>{busy ? t("login.busy") : t("login.go")}</button>
      </form>
    </div>
  );
}

function PasswordForm({ t, call, me, onDone }) {
  const [old, setOld] = useState("");
  const [nw, setNw] = useState("");
  const [again, setAgain] = useState("");
  const [policy, setPolicy] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { call("/api/v1/settings/password-policy").then(setPolicy).catch(() => {}); }, [call]);
  const probs = M.passwordProblems(nw, me.username, policy);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { onDone(await call("/api/v1/me/password", { method: "POST", body: { old, new: nw } })); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <form className="mgr-form" onSubmit={submit}>
      <label className="ml"><span>{t("pw.old")}</span>
        <input type="password" autoComplete="current-password" value={old} onChange={(e) => setOld(e.target.value)} /></label>
      <label className="ml"><span>{t("pw.new")}</span>
        <input type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></label>
      <label className="ml"><span>{t("pw.again")}</span>
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
      {policy && <p className="set-hint">{t("pw.rules").replace("{len}", policy.min_length).replace("{classes}", policy.min_classes)}</p>}
      {nw && probs.length > 0 && <p className="set-hint err">{probs.map((k) => t("pw.prob." + k)).join(" · ")}</p>}
      {again && again !== nw && <p className="set-hint err">{t("pw.mismatch")}</p>}
      {err && <p className="set-hint err">{err}</p>}
      <button className="sys-refresh mgr-wide" disabled={busy || !old || !nw || nw !== again || probs.length > 0}>
        {busy ? t("common.saving") : t("pw.save")}</button>
    </form>
  );
}

function UserMenu({ t, me, call, lang, setLang, theme, setTheme, onLogout, onMe }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  return (
    <div className="mgr-user">
      <button className={"acct-btn" + (open ? " on" : "")} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="acct-avatar" aria-hidden="true">{me.username.slice(0, 1).toUpperCase()}</span>
        <span className="acct-name">{me.username}</span>
        <span className="acct-caret" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <div className="acct-scrim" onClick={() => setOpen(false)} />
          <div className="mgr-menu">
            <div className="mgr-menu-who"><span className="mgr-dim">{t("menu.signedIn")}</span> <b>{me.username}</b>
              <span className="mgr-role">{t("role." + M.roleOf(me.priv))}</span></div>
            <button className="mgr-menu-item" onClick={() => { setOpen(false); setPw(true); }}>{t("menu.password")}</button>
            <div className="mgr-menu-row"><span>{t("menu.language")}</span>
              <span className="acct-seg">
                <button className={lang === "zh-TW" ? "on" : ""} onClick={() => setLang("zh-TW")}>中文</button>
                <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>English</button>
              </span></div>
            <div className="mgr-menu-row"><span>{t("menu.theme")}</span>
              <span className="acct-seg">
                <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>{t("menu.light")}</button>
                <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>{t("menu.dark")}</button>
              </span></div>
            <button className="mgr-menu-item" onClick={() => { setOpen(false); onLogout(); }}>{t("menu.logout")}</button>
          </div>
        </>
      )}
      {pw && (
        <Modal title={t("menu.password")} onClose={() => setPw(false)}>
          <PasswordForm t={t} call={call} me={me} onDone={(u) => { onMe(u); setPw(false); }} />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ nodes */
function StatusDot({ t, status }) {
  return <span className={"mgr-st " + M.statusTone(status)}><i />{t("st." + (status || "unknown"))}</span>;
}

function NodesView({ t, call, me }) {
  const [nodes, setNodes] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState("all");
  const [sort, setSort] = useState({ key: "status", dir: 1 });
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const load = useCallback(async (background) => {
    try {
      const [n, s] = await Promise.all([call("/api/v1/nodes", { background }), call("/api/v1/summary", { background })]);
      setNodes(n.nodes); setSummary(s); setErr("");
    } catch (e) { if (e.status !== 401) setErr(e.message); }
  }, [call]);
  useEffect(() => {
    load(false);
    const h = setInterval(() => load(true), 5000);
    return () => clearInterval(h);
  }, [load]);
  const list = useMemo(() => M.sortNodes(M.filterNodes(nodes, q, show), sort.key, sort.dir), [nodes, q, show, sort]);
  const c = M.summaryCounts(summary);
  const head = (key, label) => (
    <th className={"mgr-sort" + (sort.key === key ? " on" : "")}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {label}{sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}</th>
  );
  return (
    <div className={"mgr-split" + (openId ? " with-drawer" : "")}>
      <section className="mgr-pane">
        <div className="mgr-cards">
          <Card label={t("sum.nodes")} value={c.total} />
          <Card label={t("sum.online")} value={c.online} tone={c.online === c.total && c.total ? "ok" : ""} />
          <Card label={t("sum.problem")} value={c.problem} tone={c.problem ? "bad" : ""} onClick={() => setShow("problems")} />
          <Card label={t("sum.alerts")} value={c.alerts} tone={c.alerts ? "warn" : ""} />
          <Card label={t("sum.ports")} value={summary ? `${summary.ports_up} / ${summary.ports_total}` : "–"} />
          <Card label={t("sum.traffic")} value={summary ? `${M.fmtMbps(summary.in_mbps)} ↓ · ${M.fmtMbps(summary.out_mbps)} ↑` : "–"} small />
        </div>
        <div className="mgr-toolbar">
          <input className="mgr-search" placeholder={t("nodes.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="acct-seg">
            <button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>{t("nodes.all")}</button>
            <button className={show === "problems" ? "on" : ""} onClick={() => setShow("problems")}>{t("nodes.problems")}</button>
          </span>
          <span className="mgr-spacer" />
          {me.priv >= 15 && <button className="sys-refresh" onClick={() => setAdding(true)}>{t("nodes.add")}</button>}
        </div>
        {err && <p className="set-hint err">{err}</p>}
        {nodes === null ? <p className="mgr-dim">{t("app.loading")}</p>
          : nodes.length === 0 ? (
            <div className="mgr-empty">
              <p>{t("nodes.none")}</p>
              {me.priv >= 15 ? <button className="sys-refresh" onClick={() => setAdding(true)}>{t("nodes.addFirst")}</button>
                : <p className="mgr-dim">{t("nodes.noneAsk")}</p>}
            </div>
          ) : (
            <div className="mgr-table-wrap">
              <table className="acct-table mgr-table">
                <thead><tr>
                  {head("status", t("col.status"))}{head("name", t("col.name"))}{head("address", t("col.address"))}
                  {head("model", t("col.model"))}{head("firmware", t("col.firmware"))}{head("cpu", t("col.cpu"))}
                  <th>{t("col.ports")}</th>{head("traffic", t("col.traffic"))}{head("alerts", t("col.alerts"))}
                  <th>{t("col.seen")}</th><th />
                </tr></thead>
                <tbody>
                  {list.map((n) => {
                    const st = n.state || {};
                    return (
                      <tr key={n.id} className={(openId === n.id ? "on " : "") + (M.isProblem(n) ? "mgr-problem" : "")}
                        onClick={() => setOpenId(n.id)}>
                        <td><StatusDot t={t} status={st.status} /></td>
                        <td className="mgr-name">{n.name}{(n.tags || []).map((g) => <span key={g} className="mgr-tag">{g}</span>)}</td>
                        <td className="mono">{n.address}</td>
                        <td>{n.model}<span className="mgr-line">{M.lineName(n)}</span></td>
                        <td className="mono">{n.firmware}</td>
                        <td className="mono">{st.system?.cpu_avg != null ? st.system.cpu_avg + "%" : "–"}</td>
                        <td className="mono">{st.ports_total ? `${st.ports_up}/${st.ports_total}` : "–"}</td>
                        <td className="mono mgr-rate">{M.fmtMbps(st.in_mbps)} ↓<br />{M.fmtMbps(st.out_mbps)} ↑</td>
                        <td>{M.nodeAlerts(n) ? <span className="mgr-badge warn">{M.nodeAlerts(n)}</span> : <span className="mgr-dim">0</span>}</td>
                        <td className="mgr-dim" title={M.fmtTime(st.last_ok)}>{st.last_ok ? M.fmtAgo(st.last_ok) : "–"}</td>
                        <td className="mgr-act" onClick={(e) => e.stopPropagation()}>
                          <a className="copy-btn" href={`/n/${n.id}/grism-studio/`}>{t("node.open")}</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {list.length === 0 && <p className="mgr-dim">{t("nodes.noMatch")}</p>}
            </div>
          )}
      </section>
      {openId && <NodeDrawer key={openId} t={t} call={call} me={me} id={openId} onClose={() => setOpenId(null)}
        onChanged={() => load(false)} onRemoved={() => { setOpenId(null); load(false); }} />}
      {adding && <AddNodeDialog t={t} call={call} onClose={() => setAdding(false)}
        onAdded={(n) => { setAdding(false); load(false); setOpenId(n.id); }} />}
    </div>
  );
}

function Card({ label, value, tone, small, onClick }) {
  return (
    <div className={"mgr-card" + (tone ? " " + tone : "") + (onClick ? " click" : "")} onClick={onClick}>
      <div className="mgr-card-v" style={small ? { fontSize: 15 } : undefined}>{value}</div>
      <div className="mgr-card-k">{label}</div>
    </div>
  );
}

function AddNodeDialog({ t, call, onClose, onAdded }) {
  const [f, setF] = useState({ name: "", address: "", port: 443, username: "", password: "", manager_address: "" });
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const probs = M.nodeFormProblems(f);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { onAdded(await call("/api/v1/nodes", { method: "POST", body: { ...f, port: Number(f.port) } })); }
    catch (ex) { setErr({ code: ex.code, text: ex.message }); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={t("add.title")} onClose={busy ? undefined : onClose}>
      <form className="mgr-form" onSubmit={submit}>
        <p className="modal-body">{t("add.lead")}</p>
        <div className="mgr-row2">
          <label className="ml"><span>{t("add.name")}</span><input autoFocus value={f.name} onChange={set("name")} /></label>
          <label className="ml"><span>{t("add.address")}</span><input value={f.address} onChange={set("address")} placeholder="192.168.2.100" /></label>
          <label className="ml mgr-port"><span>{t("add.port")}</span><input value={f.port} onChange={set("port")} inputMode="numeric" /></label>
        </div>
        <div className="mgr-row2">
          <label className="ml"><span>{t("add.user")}</span><input value={f.username} onChange={set("username")} autoComplete="off" /></label>
          <label className="ml"><span>{t("add.password")}</span><input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></label>
        </div>
        <button type="button" className="mgr-link" onClick={() => setAdv((v) => !v)}>{adv ? "▾ " : "▸ "}{t("add.advanced")}</button>
        {adv && (
          <label className="ml"><span>{t("add.managerAddress")}</span>
            <input value={f.manager_address} onChange={set("manager_address")} placeholder={t("add.managerAddressAuto")} />
            <small className="mgr-dim">{t("add.managerAddressHint")}</small></label>
        )}
        {f.name && probs.filter((k) => k !== "password" && k !== "username").length > 0 && (
          <p className="set-hint err">{probs.map((k) => t("add.prob." + k)).join(" · ")}</p>
        )}
        {err && <p className="set-hint err">{err.code ? t("add.err." + err.code) + " — " : ""}{err.text}</p>}
        <div className="mgr-buttons">
          <button type="button" className="copy-btn" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="sys-refresh" disabled={busy || probs.length > 0}>{busy ? t("add.busy") : t("add.go")}</button>
        </div>
      </form>
    </Modal>
  );
}

function NodeDrawer({ t, call, me, id, onClose, onChanged, onRemoved }) {
  const [n, setN] = useState(null);
  const [evs, setEvs] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState(null);       // "remove" | "trust"
  const [cert, setCert] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async (background) => {
    try {
      const [d, e] = await Promise.all([call(`/api/v1/nodes/${id}`, { background }),
                                        call(`/api/v1/events?node=${id}&limit=30`, { background })]);
      setN(d); setEvs(e.events.slice().reverse()); setErr("");
    } catch (ex) { if (ex.status !== 401) setErr(ex.message); }
  }, [call, id]);
  useEffect(() => {
    load(false);
    const h = setInterval(() => load(true), 5000);
    return () => clearInterval(h);
  }, [load]);
  const act = async (what, fn) => {
    setBusy(what); setErr("");
    try { await fn(); } catch (ex) { setErr(ex.message); } finally { setBusy(""); }
  };
  if (!n) return <aside className="mgr-drawer"><p className="mgr-dim">{err || t("app.loading")}</p></aside>;
  const st = n.state || {};
  const sys = st.system || {};
  const caps = n.capabilities || {};
  return (
    <aside className="mgr-drawer">
      <div className="mgr-drawer-head">
        <div>
          <div className="mgr-drawer-title">{n.name}</div>
          <StatusDot t={t} status={st.status} />
          <span className="mgr-dim"> · {t("node.since")} {M.fmtAgo(st.since)}</span>
        </div>
        <button className="copy-btn" onClick={onClose} aria-label={t("common.close")}>✕</button>
      </div>
      {st.error && st.status !== "online" && <p className="set-hint err">{st.error}</p>}
      {err && <p className="set-hint err">{err}</p>}
      <div className="mgr-buttons left">
        <a className="sys-refresh" href={`/n/${n.id}/grism-studio/`}>{t("node.open")}</a>
        {me.priv >= 5 && <button className="copy-btn" disabled={!!busy}
          onClick={() => act("poll", async () => { setN(await call(`/api/v1/nodes/${id}/poll`, { method: "POST", body: {} })); })}>
          {busy === "poll" ? t("node.polling") : t("node.poll")}</button>}
        {me.priv >= 10 && <button className="copy-btn" onClick={() => setEdit({ name: n.name, tags: (n.tags || []).join(", "), notes: n.notes || "" })}>
          {t("node.edit")}</button>}
      </div>

      <h4 className="mgr-h4">{t("node.device")}</h4>
      <dl className="mgr-kv">
        <dt>{t("col.address")}</dt><dd className="mono">{n.address}:{n.port}</dd>
        <dt>{t("col.model")}</dt><dd>{n.model} <span className="mgr-line">{M.lineName(n)}</span></dd>
        <dt>{t("col.firmware")}</dt><dd className="mono">{n.firmware}</dd>
        <dt>{t("node.revision")}</dt><dd className="mono mgr-trunc" title={n.revision}>{(n.revision || "").slice(0, 12)}</dd>
        {caps.device?.engine && <><dt>{t("node.engine")}</dt><dd className="mono">{caps.device.engine} · pywww {caps.device.pywww}</dd></>}
        <dt>{t("node.uptime")}</dt><dd className="mono">{sys.uptime_s != null ? fmtUptime(sys.uptime_s) : "–"}</dd>
        <dt>{t("col.cpu")}</dt><dd className="mono">{sys.cpu_avg != null ? `${sys.cpu_avg}% (${t("node.cpuMax")} ${sys.cpu_max}%)` : "–"}</dd>
        <dt>{t("node.memory")}</dt><dd className="mono">{sys.mem_used_pct != null ? sys.mem_used_pct + "%" : "–"}</dd>
        {sys.temp_max != null && <><dt>{t("node.temp")}</dt><dd className="mono">{sys.temp_max} °C</dd></>}
        {sys.fan_faults > 0 && <><dt>{t("node.fans")}</dt><dd className="mgr-bad">{t("node.fanFaults").replace("{n}", sys.fan_faults)}</dd></>}
        <dt>{t("node.rtt")}</dt><dd className="mono">{st.rtt_ms != null ? st.rtt_ms + " ms" : "–"}</dd>
        {n.notes && <><dt>{t("node.notes")}</dt><dd>{n.notes}</dd></>}
      </dl>

      {(st.alerts || []).length > 0 && (
        <>
          <h4 className="mgr-h4">{t("node.alerts")}</h4>
          <ul className="mgr-alerts">
            {st.alerts.map((a, i) => <li key={i}>{a.text || a.message || a.rule || JSON.stringify(a)}</li>)}
          </ul>
        </>
      )}

      <h4 className="mgr-h4">{t("node.ports")}</h4>
      <table className="acct-table mgr-ports">
        <thead><tr><th>{t("col.port")}</th><th>{t("col.link")}</th><th>{t("col.speed")}</th><th>{t("col.in")}</th><th>{t("col.out")}</th><th>{t("col.drops")}</th></tr></thead>
        <tbody>
          {(st.ports || []).map((p) => (
            <tr key={p.name} className={p.enabled === false ? "mgr-dim" : ""}>
              <td className="mono">{p.name}{p.loop && <span className="mgr-tag">LOOP</span>}</td>
              <td><span className={"mgr-link-dot " + (p.link ? "up" : "down")} />{p.link ? t("port.up") : t("port.down")}</td>
              <td className="mono">{p.speed ? fmtSpeed(p.speed) : "–"}</td>
              <td className="mono">{M.fmtMbps(p.in_mbps)}</td>
              <td className="mono">{M.fmtMbps(p.out_mbps)}</td>
              <td className="mono">{(p.in_drops || 0) + (p.out_drops || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mgr-h4">{t("node.events")}</h4>
      <ul className="mgr-evlist">
        {evs.length === 0 && <li className="mgr-dim">{t("ev.none")}</li>}
        {evs.map((e) => (
          <li key={e.id} className={"sev-" + e.severity}>
            <span className="mgr-dim mono" title={M.fmtTime(e.ts)}>{M.fmtAgo(e.ts)}</span> {e.text}
          </li>
        ))}
      </ul>

      <h4 className="mgr-h4">{t("node.link")}</h4>
      <dl className="mgr-kv">
        <dt>{t("node.managerAddress")}</dt><dd className="mono">{n.manager_address}</dd>
        <dt>{t("node.cert")}</dt><dd className="mono mgr-trunc" title={n.cert_sha256}>{(n.cert_sha256 || "").slice(0, 24)}…</dd>
        <dt>{t("node.added")}</dt><dd>{M.fmtTime(n.added)} · {n.added_by}</dd>
      </dl>
      {n.shared_certificate && <p className="set-hint warn">{t("node.sharedCert")}</p>}
      {cert && <p className={"set-hint " + (cert.match ? "" : "err")}>
        {cert.match ? t("node.certSame") : t("node.certDiffers").replace("{fp}", cert.presented.slice(0, 24))}</p>}
      {me.priv >= 15 && (
        <div className="mgr-buttons left">
          <button className="copy-btn" disabled={!!busy} onClick={() => act("cert", async () => setCert(await call(`/api/v1/nodes/${id}/certificate`)))}>
            {t("node.certCheck")}</button>
          {(st.status === "cert" || (cert && !cert.match)) &&
            <button className="copy-btn" onClick={() => setAsk("trust")}>{t("node.certTrust")}</button>}
          <span className="mgr-spacer" />
          <button className="del" onClick={() => setAsk("remove")}>{t("node.remove")}</button>
        </div>
      )}

      {ask === "remove" && (
        <Modal title={t("node.removeTitle").replace("{name}", n.name)} onClose={() => setAsk(null)} warn>
          <p className="modal-body">{t("node.removeBody")}</p>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setAsk(null)}>{t("common.cancel")}</button>
            <button className="del" disabled={!!busy} onClick={() => act("remove", async () => {
              await call(`/api/v1/nodes/${id}`, { method: "DELETE" }); setAsk(null); onRemoved();
            })}>{busy === "remove" ? t("common.working") : t("node.remove")}</button>
          </div>
        </Modal>
      )}
      {ask === "trust" && (
        <Modal title={t("node.certTrust")} onClose={() => setAsk(null)} warn>
          <p className="modal-body">{t("node.certTrustBody")}</p>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setAsk(null)}>{t("common.cancel")}</button>
            <button className="del" onClick={() => act("trust", async () => {
              await call(`/api/v1/nodes/${id}/trust-certificate`, { method: "POST", body: {} }); setAsk(null); setCert(null); load(false);
            })}>{t("node.certTrust")}</button>
          </div>
        </Modal>
      )}
      {edit && (
        <Modal title={t("node.edit")} onClose={() => setEdit(null)}>
          <form className="mgr-form" onSubmit={(e) => {
            e.preventDefault();
            act("edit", async () => {
              const tags = edit.tags.split(",").map((x) => x.trim()).filter(Boolean);
              setN(await call(`/api/v1/nodes/${id}`, { method: "PATCH", body: { name: edit.name.trim(), tags, notes: edit.notes } }));
              setEdit(null); onChanged();
            });
          }}>
            <label className="ml"><span>{t("add.name")}</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="ml"><span>{t("node.tags")}</span><input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder={t("node.tagsHint")} /></label>
            <label className="ml"><span>{t("node.notes")}</span><textarea rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <div className="mgr-buttons">
              <button type="button" className="copy-btn" onClick={() => setEdit(null)}>{t("common.cancel")}</button>
              <button className="sys-refresh" disabled={!edit.name.trim() || busy === "edit"}>{t("common.save")}</button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ events */
function EventsView({ t, call }) {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [sev, setSev] = useState("");
  const [q, setQ] = useState("");
  const last = useRef(0);
  useEffect(() => {
    let stop = false;
    call("/api/v1/nodes", { background: true }).then((r) => setNames(Object.fromEntries(r.nodes.map((n) => [n.id, n.name])))).catch(() => {});
    (async () => {
      try {
        const r = await call("/api/v1/events?limit=500", { background: true });
        if (stop) return;
        setRows(r.events); last.current = r.last_id;
      } catch (e) { if (e.status === 401) return; }
      while (!stop) {
        try {
          // a long poll: the manager answers when something happens, or after 25 s
          const r = await call(`/api/v1/events?since=${last.current}&wait=25&limit=500`, { background: true });
          if (stop) return;
          if (r.events.length) setRows((x) => [...x, ...r.events].slice(-2000));
          last.current = Math.max(last.current, r.last_id);
        } catch (e) {
          if (e.status === 401) return;
          await sleep(5000);
        }
      }
    })();
    return () => { stop = true; };
  }, [call]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sevs = sev === "warning" ? ["warning", "critical"] : sev === "critical" ? ["critical"] : null;
    return rows.filter((e) => (!sevs || sevs.includes(e.severity)) && (!s || (e.text + " " + e.kind + " " + (names[e.node_id] || "")).toLowerCase().includes(s)))
      .slice().reverse();
  }, [rows, q, sev, names]);
  return (
    <section className="mgr-pane">
      <div className="mgr-toolbar">
        <input className="mgr-search" placeholder={t("ev.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="acct-seg">
          <button className={sev === "" ? "on" : ""} onClick={() => setSev("")}>{t("ev.all")}</button>
          <button className={sev === "warning" ? "on" : ""} onClick={() => setSev("warning")}>{t("ev.warnUp")}</button>
          <button className={sev === "critical" ? "on" : ""} onClick={() => setSev("critical")}>{t("ev.critical")}</button>
        </span>
        <span className="mgr-dim">{t("ev.live")}</span>
      </div>
      <table className="acct-table mgr-table">
        <thead><tr><th>{t("ev.time")}</th><th>{t("ev.sev")}</th><th>{t("ev.node")}</th><th>{t("ev.kind")}</th><th>{t("ev.text")}</th></tr></thead>
        <tbody>
          {shown.map((e) => (
            <tr key={e.id} className={"sev-" + e.severity}>
              <td className="mono mgr-nowrap">{M.fmtTime(e.ts)}</td>
              <td><span className={"mgr-sev " + e.severity}>{t("sev." + e.severity)}</span></td>
              <td>{names[e.node_id] || (e.node_id ? "#" + e.node_id : "")}</td>
              <td className="mono mgr-dim">{e.kind}</td>
              <td>{e.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="mgr-dim">{t("ev.none")}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ accounts */
function AccountsView({ t, call, me }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");
  const [make, setMake] = useState(null);
  const [reset, setReset] = useState(null);
  const [del, setDel] = useState(null);
  const load = useCallback(async () => {
    try { setUsers((await call("/api/v1/users")).users); setErr(""); } catch (e) { setErr(e.message); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  const patch = async (u, body) => {
    try { await call(`/api/v1/users/${u.id}`, { method: "PATCH", body }); load(); } catch (e) { setErr(e.message); }
  };
  return (
    <section className="mgr-pane">
      <div className="mgr-toolbar">
        <h3 className="mgr-h3">{t("acc.title")}</h3>
        <span className="mgr-spacer" />
        <button className="sys-refresh" onClick={() => setMake({ username: "", password: "", priv: 1 })}>{t("acc.add")}</button>
      </div>
      <p className="set-hint">{t("acc.lead")}</p>
      {err && <p className="set-hint err">{err}</p>}
      {users && (
        <table className="acct-table mgr-table">
          <thead><tr><th>{t("acc.name")}</th><th>{t("acc.level")}</th><th>{t("acc.lastLogin")}</th><th>{t("acc.state")}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.username}</b>{u.id === me.id && <span className="mgr-tag">{t("acc.you")}</span>}</td>
                <td>
                  <select value={u.priv} onChange={(e) => patch(u, { priv: Number(e.target.value) })}>
                    {M.PRIV_LEVELS.map((p) => <option key={p} value={p}>{t("role." + M.roleOf(p))}</option>)}
                  </select>
                </td>
                <td className="mgr-dim">{u.last_login ? `${M.fmtTime(u.last_login)} · ${u.last_from}` : t("acc.never")}</td>
                <td>
                  {u.locked && <span className="mgr-badge warn">{t("acc.locked")}</span>}
                  {u.disabled && <span className="mgr-badge">{t("acc.disabled")}</span>}
                  {u.must_change && <span className="mgr-badge">{t("acc.mustChange")}</span>}
                </td>
                <td className="mgr-act">
                  {u.locked && <button className="copy-btn" onClick={() => patch(u, { unlock: true })}>{t("acc.unlock")}</button>}
                  <button className="copy-btn" onClick={() => setReset({ u, password: "" })}>{t("acc.reset")}</button>
                  {u.id !== me.id && <button className="copy-btn" onClick={() => patch(u, { disabled: !u.disabled })}>
                    {u.disabled ? t("acc.enable") : t("acc.disable")}</button>}
                  {u.id !== me.id && <button className="del" onClick={() => setDel(u)}>{t("common.delete")}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {make && (
        <Modal title={t("acc.add")} onClose={() => setMake(null)}>
          <form className="mgr-form" onSubmit={async (e) => {
            e.preventDefault();
            try { await call("/api/v1/users", { method: "POST", body: make }); setMake(null); load(); } catch (ex) { setMake({ ...make, err: ex.message }); }
          }}>
            <label className="ml"><span>{t("acc.name")}</span><input autoFocus value={make.username} onChange={(e) => setMake({ ...make, username: e.target.value })} /></label>
            <label className="ml"><span>{t("acc.initialPassword")}</span><input type="password" autoComplete="new-password" value={make.password} onChange={(e) => setMake({ ...make, password: e.target.value })} /></label>
            <label className="ml"><span>{t("acc.level")}</span>
              <select value={make.priv} onChange={(e) => setMake({ ...make, priv: Number(e.target.value) })}>
                {M.PRIV_LEVELS.map((p) => <option key={p} value={p}>{t("role." + M.roleOf(p))}</option>)}
              </select></label>
            <p className="set-hint">{t("acc.levelHint." + M.roleOf(make.priv))}</p>
            <p className="set-hint dim">{t("acc.firstChange")}</p>
            {make.err && <p className="set-hint err">{make.err}</p>}
            <div className="mgr-buttons">
              <button type="button" className="copy-btn" onClick={() => setMake(null)}>{t("common.cancel")}</button>
              <button className="sys-refresh" disabled={!make.username.trim() || !make.password}>{t("acc.create")}</button>
            </div>
          </form>
        </Modal>
      )}
      {reset && (
        <Modal title={t("acc.resetTitle").replace("{name}", reset.u.username)} onClose={() => setReset(null)}>
          <form className="mgr-form" onSubmit={async (e) => {
            e.preventDefault();
            try { await call(`/api/v1/users/${reset.u.id}`, { method: "PATCH", body: { password: reset.password } }); setReset(null); load(); }
            catch (ex) { setReset({ ...reset, err: ex.message }); }
          }}>
            <label className="ml"><span>{t("acc.newPassword")}</span><input autoFocus type="password" autoComplete="new-password" value={reset.password}
              onChange={(e) => setReset({ ...reset, password: e.target.value })} /></label>
            <p className="set-hint dim">{t("acc.resetHint")}</p>
            {reset.err && <p className="set-hint err">{reset.err}</p>}
            <div className="mgr-buttons">
              <button type="button" className="copy-btn" onClick={() => setReset(null)}>{t("common.cancel")}</button>
              <button className="sys-refresh" disabled={!reset.password}>{t("acc.reset")}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && (
        <Modal title={t("acc.deleteTitle").replace("{name}", del.username)} onClose={() => setDel(null)} warn>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setDel(null)}>{t("common.cancel")}</button>
            <button className="del" onClick={async () => {
              try { await call(`/api/v1/users/${del.id}`, { method: "DELETE" }); } catch (ex) { setErr(ex.message); }
              setDel(null); load();
            }}>{t("common.delete")}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ audit */
function AuditView({ t, call }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    try { setRows((await call("/api/v1/audit?limit=1000")).audit.slice().reverse()); setErr(""); } catch (e) { setErr(e.message); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  const s = q.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !s || `${r.who} ${r.ip} ${r.action} ${r.detail}`.toLowerCase().includes(s));
  return (
    <section className="mgr-pane">
      <div className="mgr-toolbar">
        <input className="mgr-search" placeholder={t("audit.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="copy-btn" onClick={load}>{t("common.refresh")}</button>
      </div>
      <p className="set-hint">{t("audit.lead")}</p>
      {err && <p className="set-hint err">{err}</p>}
      <table className="acct-table mgr-table">
        <thead><tr><th>{t("ev.time")}</th><th>{t("audit.who")}</th><th>{t("audit.from")}</th><th>{t("audit.action")}</th><th>{t("audit.detail")}</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td className="mono mgr-nowrap">{M.fmtTime(r.ts)}</td><td>{r.who}</td><td className="mono">{r.ip}</td>
              <td className="mono">{r.action}</td><td>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------------ settings */
function SettingsView({ t, call, me }) {
  const [p, setP] = useState(null);
  const [ver, setVer] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    call("/api/v1/settings/password-policy").then(setP).catch((e) => setErr(e.message));
    call("/api/v1/version").then((v) => setVer(v.manager)).catch(() => {});
  }, [call]);
  const admin = me.priv >= 15;
  const save = async () => {
    setMsg(""); setErr("");
    try { setP(await call("/api/v1/settings/password-policy", { method: "PUT", body: {
      min_length: Number(p.min_length), min_classes: Number(p.min_classes), max_age_days: Number(p.max_age_days) } }));
      setMsg(t("common.saved")); }
    catch (e) { setErr(e.message); }
  };
  return (
    <section className="mgr-pane mgr-settings">
      <div className="sys-card">
        <h3 className="sys-card-title">{t("set.policy")}</h3>
        <p className="set-hint">{t("set.policyLead")}</p>
        {p && (
          <div className="set-grid">
            <label className="ml"><span>{t("set.minLength")}</span>
              <input type="number" min={1} max={128} disabled={!admin} value={p.min_length} onChange={(e) => setP({ ...p, min_length: e.target.value })} /></label>
            <label className="ml"><span>{t("set.minClasses")}</span>
              <input type="number" min={0} max={4} disabled={!admin} value={p.min_classes} onChange={(e) => setP({ ...p, min_classes: e.target.value })} /></label>
            <label className="ml"><span>{t("set.maxAge")}</span>
              <input type="number" min={0} max={3650} disabled={!admin} value={p.max_age_days} onChange={(e) => setP({ ...p, max_age_days: e.target.value })} /></label>
          </div>
        )}
        <p className="set-hint dim">{t("set.lockoutNote")}</p>
        {admin && <button className="sys-refresh" onClick={save}>{t("common.save")}</button>}
        {msg && <span className="mgr-ok"> {msg}</span>}
        {err && <p className="set-hint err">{err}</p>}
      </div>
      <div className="sys-card">
        <h3 className="sys-card-title">{t("set.about")}</h3>
        <dl className="mgr-kv">
          <dt>GRISM Manager</dt><dd className="mono">{ver}</dd>
          <dt>GRISM Studio</dt><dd className="mono">{STUDIO_VERSION}</dd>
        </dl>
        <p className="set-hint">{t("set.aboutBody")}</p>
      </div>
    </section>
  );
}
