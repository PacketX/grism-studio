/* ============================================================
   GRISM Manager — the pages: sign-in, the node list, a node's detail, events,
   accounts, audit and settings. Every node's own pages are its Studio, opened
   through the manager at /n/<id>/grism-studio/.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtBytes, fmtSpeed, fmtUptime } from "../grism-core.js";
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
  const TABS = [["nodes", 1], ["traffic", 1], ["host", 1], ["events", 1], ["firmware", 15], ["backups", 15], ["accounts", 15], ["audit", 15], ["settings", 1]];

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
              {tab === "traffic" && <TrafficView t={t} call={call} me={me} />}
              {tab === "host" && <HostView t={t} call={call} />}
              {tab === "events" && <EventsView t={t} call={call} />}
              {tab === "firmware" && admin && <FirmwareView t={t} call={call} />}
              {tab === "backups" && admin && <BackupsView t={t} call={call} />}
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
              <span className="mgr-role">{t("role." + M.roleOf(me.priv))}</span>
              {me.signed_in_by && me.signed_in_by !== "local" && <span className="mgr-role">{M.sourceName(me.signed_in_by)}</span>}</div>
            {(!me.signed_in_by || me.signed_in_by === "local") &&
              <button className="mgr-menu-item" onClick={() => { setOpen(false); setPw(true); }}>{t("menu.password")}</button>}
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
                        <td>{n.maintenance ? <span className="mgr-st run"><i />{t("st.maint." + n.maintenance)}</span>
                          : <StatusDot t={t} status={st.status} />}</td>
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
          <label className="ml"><span>{t("add.address")}</span><input autoFocus value={f.address} onChange={set("address")} placeholder="192.168.2.100" /></label>
          <label className="ml mgr-port"><span>{t("add.port")}</span><input value={f.port} onChange={set("port")} inputMode="numeric" /></label>
          <label className="ml"><span>{t("add.nameOptional")}</span><input value={f.name} onChange={set("name")} placeholder={t("add.namePlaceholder")} /></label>
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
        {f.address && probs.filter((k) => k !== "password" && k !== "username").length > 0 && (
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

/* ------------------------------------------------------------------ batch jobs */
const STAGES = ["check", "upload", "apply", "restart", "backup", "download"];

/* One job's items as they go: polled every two seconds while it runs. */
function JobPanel({ t, call, id, onClose, onEnded }) {
  const [j, setJ] = useState(null);
  const [err, setErr] = useState("");
  const ended = useRef(false);
  const endRef = useRef(onEnded);
  endRef.current = onEnded;
  useEffect(() => {
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const r = await call(`/api/v1/jobs/${id}`, { background: true });
          if (stop) return;
          setJ(r); setErr("");
          if (r.state !== "running") {
            if (!ended.current) { ended.current = true; endRef.current?.(r); }
            return;
          }
        } catch (e) { if (e.status === 401 || e.status === 404) return; setErr(e.message); }
        await sleep(2000);
      }
    })();
    return () => { stop = true; };
  }, [call, id]);
  if (!j) return <div className="sys-card"><p className="mgr-dim">{err || t("app.loading")}</p></div>;
  const pending = (j.counts.pending || 0) > 0;
  const now = Date.now() / 1000;
  return (
    <div className="sys-card mgr-job">
      <div className="mgr-toolbar">
        <h3 className="sys-card-title">{t("job." + j.kind)} #{j.id}
          <span className={"mgr-jst " + M.jobTone(j.state)}>{t("jst." + j.state)}</span></h3>
        <span className="mgr-dim">{M.fmtTime(j.created)} · {j.created_by === "schedule" ? t("bk.bySchedule") : j.created_by}</span>
        <span className="mgr-spacer" />
        {j.state === "running" && pending && <button className="copy-btn" onClick={() => call(`/api/v1/jobs/${id}/cancel`, { method: "POST", body: {} }).catch((e) => setErr(e.message))}>
          {t("job.cancel")}</button>}
        {onClose && <button className="copy-btn" onClick={onClose} aria-label={t("common.close")}>✕</button>}
      </div>
      {err && <p className="set-hint err">{err}</p>}
      <table className="acct-table mgr-table">
        <thead><tr><th>{t("ev.node")}</th><th>{t("job.state")}</th><th>{t("job.stage")}</th>
          {j.kind === "firmware" && <th>{t("fw.fromTo")}</th>}<th>{t("job.message")}</th><th>{t("job.took")}</th></tr></thead>
        <tbody>
          {j.items.map((it) => {
            const pct = M.uploadPercent(it);
            const took = it.started ? (it.finished || now) - it.started : null;
            return (
              <tr key={it.id}>
                <td className="mgr-name">{it.node_name}</td>
                <td><span className={"mgr-jst " + M.jobTone(it.state)}>{t("jst." + it.state)}</span></td>
                <td className="mgr-nowrap">
                  {pct != null ? <span className="mgr-bar"><i style={{ width: pct + "%" }} /><b>{t("stage.upload")} {pct}%</b></span>
                    : it.state === "running" && STAGES.includes(it.stage) ? t("stage." + it.stage) : ""}
                </td>
                {j.kind === "firmware" && <td className="mono mgr-nowrap">{it.before}{it.after && it.after !== it.before ? " → " + it.after : ""}</td>}
                <td className="mgr-msg">{it.message}</td>
                <td className="mono mgr-nowrap">{took != null ? M.fmtDurationS(took) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {j.state === "running" && j.kind === "firmware" && <p className="set-hint dim">{t("fw.runningHint")}</p>}
    </div>
  );
}

function JobList({ t, jobs, onOpen }) {
  if (!jobs || !jobs.length) return <p className="mgr-dim">{t("job.none")}</p>;
  return (
    <table className="acct-table mgr-table">
      <thead><tr><th>#</th><th>{t("ev.time")}</th><th>{t("audit.who")}</th><th>{t("job.state")}</th><th>{t("job.result")}</th><th /></tr></thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td className="mono">{j.id}</td>
            <td className="mono mgr-nowrap">{M.fmtTime(j.created)}</td>
            <td>{j.created_by === "schedule" ? t("bk.bySchedule") : j.created_by}</td>
            <td><span className={"mgr-jst " + M.jobTone(j.state)}>{t("jst." + j.state)}</span></td>
            <td className="mgr-dim">{Object.entries(j.counts || {}).map(([k, v]) => `${t("jst." + k)} ${v}`).join(" · ")}</td>
            <td className="mgr-act"><button className="copy-btn" onClick={() => onOpen(j.id)}>{t("job.open")}</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function uploadImage(file, onProgress) {
  return uploadFile("/api/v1/images?filename=" + encodeURIComponent(file.name), file, onProgress);
}

function uploadFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let d = null;
      try { d = JSON.parse(x.responseText); } catch { d = { detail: x.responseText }; }
      if (x.status === 200) resolve(d); else reject(new ApiError(x.status, d));
    };
    x.onerror = () => reject(new Error("the upload broke off"));
    x.send(file);
  });
}

function FirmwareView({ t, call }) {
  const [images, setImages] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [choice, setChoice] = useState({});
  const [opts, setOpts] = useState({ concurrency: 1, stop: true, force: false });
  const [up, setUp] = useState(null);             // {name, pct, phase} while an image goes up
  const [ask, setAsk] = useState(false);
  const [delImg, setDelImg] = useState(null);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const load = useCallback(async () => {
    try {
      const [i, n, j] = await Promise.all([call("/api/v1/images"), call("/api/v1/nodes"), call("/api/v1/jobs?kind=firmware&limit=10")]);
      setImages(i.images); setNodes(n.nodes); setJobs(j.jobs); setErr("");
      const run = j.jobs.find((x) => x.state === "running");
      if (run) setJob((cur) => cur ?? run.id);
    } catch (e) { if (e.status !== 401) setErr(e.message); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  const plan = useMemo(() => M.firmwarePlan(nodes, [...sel], images || [], choice), [nodes, sel, images, choice]);
  const models = [...new Set(plan.map((p) => p.node.model))];
  const runnable = plan.filter((p) => p.image && (opts.force || !p.same));
  const toggle = (id) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const updatable = nodes.filter((n) => M.imagesFor(images, n.model).length);
  const pick = async (file) => {
    if (!file) return;
    setErr(""); setUp({ name: file.name, pct: 0, phase: "send" });
    try {
      const r = await uploadImage(file, (f) => setUp({ name: file.name, pct: Math.round(f * 100), phase: f >= 1 ? "check" : "send" }));
      setUp(null);
      if (!r.new) setErr(t("fw.already").replace("{v}", `${r.model} ${r.version}`));
      load();
    } catch (e) { setUp(null); setErr(e.message); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const start = async () => {
    setAsk(false); setErr("");
    try {
      const r = await call("/api/v1/firmware/jobs", { method: "POST", body: {
        nodes: plan.map((p) => p.node.id), images: M.planImages(plan), concurrency: Number(opts.concurrency),
        stop_on_failure: opts.stop, force: opts.force } });
      setJob(r.id); setSel(new Set()); load();
    } catch (e) { setErr(e.message); }
  };
  return (
    <section className="mgr-pane mgr-stack">
      {err && <p className="set-hint err">{err}</p>}
      {job && <JobPanel key={job} t={t} call={call} id={job} onClose={() => setJob(null)} onEnded={() => load()} />}

      <div className="sys-card">
        <div className="mgr-toolbar">
          <h3 className="sys-card-title">{t("fw.images")}</h3>
          <span className="mgr-spacer" />
          <input ref={fileRef} type="file" accept=".tgz,.tar.gz,application/gzip" hidden onChange={(e) => pick(e.target.files[0])} />
          <button className="sys-refresh" disabled={!!up} onClick={() => fileRef.current?.click()}>{t("fw.upload")}</button>
        </div>
        <p className="set-hint">{t("fw.imagesLead")}</p>
        {up && <p><span className="mgr-bar wide"><i style={{ width: up.pct + "%" }} />
          <b>{up.name} · {up.phase === "check" ? t("fw.checking") : up.pct + "%"}</b></span></p>}
        {images && images.length === 0 && <p className="mgr-dim">{t("fw.noImages")}</p>}
        {images && images.length > 0 && (
          <table className="acct-table mgr-table">
            <thead><tr><th>{t("col.model")}</th><th>{t("col.firmware")}</th><th>{t("node.revision")}</th><th>{t("fw.arch")}</th>
              <th>{t("fw.size")}</th><th>{t("fw.uploaded")}</th><th>{t("fw.file")}</th><th /></tr></thead>
            <tbody>
              {images.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.model}</b></td><td className="mono">{i.version}</td><td className="mono">{(i.revision || "").slice(0, 12)}</td>
                  <td className="mono">{i.arch}</td><td className="mono">{fmtBytes(i.size)}</td>
                  <td className="mgr-dim mgr-nowrap">{M.fmtTime(i.uploaded)} · {i.uploaded_by}</td>
                  <td className="mgr-dim mgr-trunc" title={i.filename}>{i.filename}</td>
                  <td className="mgr-act"><button className="del" onClick={() => setDelImg(i)}>{t("common.delete")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="sys-card">
        <h3 className="sys-card-title">{t("fw.batch")}</h3>
        <p className="set-hint">{t("fw.batchLead")}</p>
        <table className="acct-table mgr-table">
          <thead><tr>
            <th><input type="checkbox" checked={updatable.length > 0 && updatable.every((n) => sel.has(n.id))}
              onChange={(e) => setSel(e.target.checked ? new Set(updatable.map((n) => n.id)) : new Set())} /></th>
            <th>{t("col.name")}</th><th>{t("col.model")}</th><th>{t("fw.current")}</th><th>{t("fw.to")}</th><th>{t("col.status")}</th>
          </tr></thead>
          <tbody>
            {nodes.map((n) => {
              const p = plan.find((x) => x.node.id === n.id);
              const has = M.imagesFor(images, n.model).length > 0;
              return (
                <tr key={n.id} className={has ? "" : "mgr-dim"}>
                  <td><input type="checkbox" disabled={!has} checked={sel.has(n.id)} onChange={() => toggle(n.id)} /></td>
                  <td className="mgr-name">{n.name}</td><td>{n.model}<span className="mgr-line">{M.lineName(n)}</span></td>
                  <td className="mono">{n.firmware}</td>
                  <td className="mono">{!has ? t("fw.noImageFor") : p ? (p.same && !opts.force ? t("fw.sameSkip") : p.image.version) : ""}</td>
                  <td>{n.maintenance ? t("st.maint." + n.maintenance) : <StatusDot t={t} status={n.state?.status} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {models.some((m) => M.imagesFor(images, m).length > 1) && (
          <div className="set-grid">
            {models.map((m) => {
              const list = M.imagesFor(images, m);
              if (list.length < 2) return null;
              return (
                <label className="ml" key={m}><span>{t("fw.imageFor").replace("{m}", m)}</span>
                  <select value={choice[m] ?? list[0].id} onChange={(e) => setChoice({ ...choice, [m]: Number(e.target.value) })}>
                    {list.map((i) => <option key={i.id} value={i.id}>{i.version} ({(i.revision || "").slice(0, 8)})</option>)}
                  </select></label>
              );
            })}
          </div>
        )}
        <div className="mgr-opts">
          <label className="ml"><span>{t("fw.concurrency")}</span>
            <select value={opts.concurrency} onChange={(e) => setOpts({ ...opts, concurrency: Number(e.target.value) })}>
              {[1, 2, 4, 8].map((k) => <option key={k} value={k}>{k}</option>)}
            </select></label>
          <label className="mgr-check"><input type="checkbox" checked={opts.stop} onChange={(e) => setOpts({ ...opts, stop: e.target.checked })} />{t("fw.stopOnFailure")}</label>
          <label className="mgr-check"><input type="checkbox" checked={opts.force} onChange={(e) => setOpts({ ...opts, force: e.target.checked })} />{t("fw.force")}</label>
          <span className="mgr-spacer" />
          <button className="sys-refresh" disabled={!runnable.length || jobs.some((x) => x.state === "running")}
            onClick={() => setAsk(true)}>{t("fw.start").replace("{n}", runnable.length)}</button>
        </div>
      </div>

      <div className="sys-card">
        <h3 className="sys-card-title">{t("fw.jobs")}</h3>
        <JobList t={t} jobs={jobs} onOpen={setJob} />
      </div>

      {ask && (
        <Modal title={t("fw.confirmTitle").replace("{n}", runnable.length)} onClose={() => setAsk(false)} warn>
          <div className="modal-body">
            <p>{t("fw.confirmBody")}</p>
            <ul className="mgr-plan">
              {plan.map((p) => (
                <li key={p.node.id}><b>{p.node.name}</b> {p.node.firmware} → {p.image ? p.image.version : "–"}
                  {p.same && !opts.force && <span className="mgr-dim"> · {t("fw.sameSkip")}</span>}</li>
              ))}
            </ul>
            <p className="mgr-dim">{opts.concurrency === 1 ? t("fw.oneAtATime") : t("fw.nAtATime").replace("{n}", opts.concurrency)}
              {opts.stop ? " " + t("fw.stopsOnFailure") : ""}</p>
          </div>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setAsk(false)}>{t("common.cancel")}</button>
            <button className="del" onClick={start}>{t("fw.go")}</button>
          </div>
        </Modal>
      )}
      {delImg && (
        <Modal title={t("fw.deleteTitle").replace("{v}", `${delImg.model} ${delImg.version}`)} onClose={() => setDelImg(null)} warn>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setDelImg(null)}>{t("common.cancel")}</button>
            <button className="del" onClick={async () => {
              try { await call(`/api/v1/images/${delImg.id}`, { method: "DELETE" }); } catch (e) { setErr(e.message); }
              setDelImg(null); load();
            }}>{t("common.delete")}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function BackupsView({ t, call }) {
  const [nodes, setNodes] = useState([]);
  const [rows, setRows] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [sched, setSched] = useState(null);
  const [form, setForm] = useState(null);
  const [sel, setSel] = useState(null);           // null: every node
  const [only, setOnly] = useState("");
  const [job, setJob] = useState(null);
  const [del, setDel] = useState(null);
  const [restore, setRestore] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [hostBusy, setHostBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const offset = -new Date().getTimezoneOffset();
  const load = useCallback(async () => {
    try {
      const [n, b, j, s] = await Promise.all([call("/api/v1/nodes"), call("/api/v1/backups"),
        call("/api/v1/jobs?kind=backup&limit=10"), call("/api/v1/settings/backup-schedule")]);
      setNodes(n.nodes); setRows(b.backups); setJobs(j.jobs); setSched(s); setErr("");
      setForm((f) => f ?? { enabled: s.enabled, time: M.utcMinuteToLocal(s.utc_minute, offset), keep: s.keep });
      const run = j.jobs.find((x) => x.state === "running");
      if (run) setJob((cur) => cur ?? run.id);
    } catch (e) { if (e.status !== 401) setErr(e.message); }
  }, [call, offset]);
  useEffect(() => { load(); }, [load]);
  const chosen = sel ?? new Set(nodes.map((n) => n.id));
  const toggle = (id) => setSel(() => { const x = new Set(chosen); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const backupNow = async () => {
    setErr("");
    try {
      const all = chosen.size === nodes.length;
      const r = await call("/api/v1/backups/jobs", { method: "POST", body: { nodes: all ? [] : [...chosen] } });
      setJob(r.id);
    } catch (e) { setErr(e.message); }
  };
  const saveSched = async () => {
    setErr(""); setMsg("");
    const um = M.localToUtcMinute(form.time, offset);
    if (um == null) { setErr(t("bk.badTime")); return; }
    try {
      const s = await call("/api/v1/settings/backup-schedule", { method: "PUT",
        body: { enabled: form.enabled, utc_minute: um, keep: Number(form.keep) } });
      setSched(s); setMsg(t("common.saved"));
    } catch (e) { setErr(e.message); }
  };
  const shown = (rows || []).filter((b) => !only || String(b.node_id) === only);
  const hostNow = async () => {
    setErr(""); setHostBusy("make");
    try { await call("/api/v1/host-backups", { method: "POST" }); await load(); }
    catch (e) { setErr(e.message); } finally { setHostBusy(""); }
  };
  const hostUpload = async (file) => {
    if (!file) return;
    setErr(""); setHostBusy("upload");
    try { await uploadFile("/api/v1/host-backups/upload", file, () => {}); await load(); }
    catch (e) { setErr(e.message); } finally { setHostBusy(""); }
  };
  const doRestore = async () => {
    const b = restore;
    setRestore(null); setErr("");
    try {
      await call(`/api/v1/backups/${b.id}/restore`, { method: "POST" });
      setRestarting(true);
      await sleep(4000);
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch("/api/v1/version", { cache: "no-store" }); if (r.ok) break; } catch { /* restarting */ }
        await sleep(1000);
      }
      window.location.reload();
    } catch (e) { setErr(e.message); setRestarting(false); }
  };
  const nodeName = (b) => (b.node_id === 0 ? t("bk.hostName") : b.node_name);
  return (
    <section className="mgr-pane mgr-stack">
      {err && <p className="set-hint err">{err}</p>}
      {restarting && <p className="set-hint">{t("bk.restarting")}</p>}
      {job && <JobPanel key={job} t={t} call={call} id={job} onClose={() => setJob(null)} onEnded={() => load()} />}
      <div className="mgr-settings">
        <div className="sys-card">
          <h3 className="sys-card-title">{t("bk.now")}</h3>
          <p className="set-hint">{t("bk.nowLead")}</p>
          <div className="mgr-checks">
            {nodes.map((n) => (
              <label key={n.id} className="mgr-check"><input type="checkbox" checked={chosen.has(n.id)} onChange={() => toggle(n.id)} />{n.name}</label>
            ))}
          </div>
          <button className="sys-refresh" disabled={!chosen.size || jobs.some((x) => x.state === "running")} onClick={backupNow}>
            {t("bk.go").replace("{n}", chosen.size)}</button>
        </div>
        <div className="sys-card">
          <h3 className="sys-card-title">{t("bk.daily")}</h3>
          {form && (
            <>
              <label className="mgr-check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />{t("bk.dailyOn")}</label>
              <div className="set-grid">
                <label className="ml"><span>{t("bk.time")}</span>
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
                <label className="ml"><span>{t("bk.keep")}</span>
                  <input type="number" min={1} max={1000} value={form.keep} onChange={(e) => setForm({ ...form, keep: e.target.value })} /></label>
              </div>
              <p className="set-hint dim">{t("bk.dailyHint")}{sched?.last_day ? " " + t("bk.lastDay").replace("{d}", sched.last_day) : ""}</p>
              <button className="sys-refresh" onClick={saveSched}>{t("common.save")}</button>{msg && <span className="mgr-ok"> {msg}</span>}
            </>
          )}
        </div>
        <div className="sys-card">
          <h3 className="sys-card-title">{t("bk.host")}</h3>
          <p className="set-hint">{t("bk.hostLead")}</p>
          <div className="mgr-buttons left">
            <button className="sys-refresh" disabled={!!hostBusy} onClick={hostNow}>{hostBusy === "make" ? t("bk.hostMaking") : t("bk.hostNow")}</button>
            <label className="copy-btn mgr-filebtn">{hostBusy === "upload" ? t("bk.hostUploading") : t("bk.hostUpload")}
              <input type="file" accept=".tgz,application/gzip" hidden disabled={!!hostBusy}
                onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; hostUpload(f); }} /></label>
          </div>
          <p className="set-hint dim">{t("bk.hostHint")}</p>
        </div>
      </div>
      <div className="sys-card">
        <div className="mgr-toolbar">
          <h3 className="sys-card-title">{t("bk.list")}</h3>
          <span className="mgr-spacer" />
          <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">{t("bk.allNodes")}</option>
            <option value="0">{t("bk.hostName")}</option>
            {nodes.map((n) => <option key={n.id} value={String(n.id)}>{n.name}</option>)}
          </select>
        </div>
        {rows && shown.length === 0 && <p className="mgr-dim">{t("bk.none")}</p>}
        {shown.length > 0 && (
          <table className="acct-table mgr-table">
            <thead><tr><th>{t("ev.node")}</th><th>{t("ev.time")}</th><th>{t("fw.size")}</th><th>{t("col.firmware")}</th><th>{t("bk.by")}</th><th /></tr></thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td className="mgr-name">{nodeName(b)}</td>
                  <td className="mono mgr-nowrap">{M.fmtTime(b.ts)}</td>
                  <td className="mono">{fmtBytes(b.size)}</td>
                  <td className="mono">{b.firmware}</td>
                  <td>{b.origin === "schedule" ? t("bk.bySchedule") : b.origin === "found on disk" ? t("bk.foundOnDisk") : b.origin}</td>
                  <td className="mgr-act">
                    <a className="copy-btn" href={`/api/v1/backups/${b.id}/download`}>{t("bk.download")}</a>
                    {b.node_id === 0 && <button className="copy-btn" disabled={restarting} onClick={() => setRestore(b)}>{t("bk.restore")}</button>}
                    <button className="del" onClick={() => setDel(b)}>{t("common.delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="set-hint dim">{t("bk.restoreHint")}</p>
      </div>
      <div className="sys-card">
        <h3 className="sys-card-title">{t("bk.jobs")}</h3>
        <JobList t={t} jobs={jobs} onOpen={setJob} />
      </div>
      {del && (
        <Modal title={t("bk.deleteTitle").replace("{n}", nodeName(del)).replace("{d}", M.fmtTime(del.ts))} onClose={() => setDel(null)} warn>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setDel(null)}>{t("common.cancel")}</button>
            <button className="del" onClick={async () => {
              try { await call(`/api/v1/backups/${del.id}`, { method: "DELETE" }); } catch (e) { setErr(e.message); }
              setDel(null); load();
            }}>{t("common.delete")}</button>
          </div>
        </Modal>
      )}
      {restore && (
        <Modal title={t("bk.restoreTitle").replace("{d}", M.fmtTime(restore.ts))} onClose={() => setRestore(null)} warn>
          <p>{t("bk.restoreBody")}</p>
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setRestore(null)}>{t("common.cancel")}</button>
            <button className="del" onClick={doRestore}>{t("bk.restore")}</button>
          </div>
        </Modal>
      )}
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
          <thead><tr><th>{t("acc.name")}</th><th>{t("acc.source")}</th><th>{t("acc.level")}</th><th>{t("acc.lastLogin")}</th><th>{t("acc.state")}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.username}</b>{u.id === me.id && <span className="mgr-tag">{t("acc.you")}</span>}</td>
                <td className={u.source === "local" ? "mgr-dim" : ""}>{u.source === "local" ? t("acc.local") : M.sourceName(u.source)}</td>
                <td>
                  {u.source === "local" ? (
                    <select value={u.priv} onChange={(e) => patch(u, { priv: Number(e.target.value) })}>
                      {M.PRIV_LEVELS.map((p) => <option key={p} value={p}>{t("role." + M.roleOf(p))}</option>)}
                    </select>
                  ) : <span title={t("acc.serverLevel")}>{t("role." + M.roleOf(u.priv))}</span>}
                </td>
                <td className="mgr-dim">{u.last_login ? `${M.fmtTime(u.last_login)} · ${u.last_from}` : t("acc.never")}</td>
                <td>
                  {u.locked && <span className="mgr-badge warn">{t("acc.locked")}</span>}
                  {u.disabled && <span className="mgr-badge">{t("acc.disabled")}</span>}
                  {u.must_change && <span className="mgr-badge">{t("acc.mustChange")}</span>}
                </td>
                <td className="mgr-act">
                  {u.locked && <button className="copy-btn" onClick={() => patch(u, { unlock: true })}>{t("acc.unlock")}</button>}
                  {u.source === "local" && <button className="copy-btn" onClick={() => setReset({ u, password: "" })}>{t("acc.reset")}</button>}
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

/* ------------------------------------------------------------------ traffic */
function useWidth(ref) {
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((es) => setW(Math.max(240, Math.floor(es[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/* Lines over time on one axis: a legend for two or more, direct end labels for
   up to four when they do not collide, a 10% wash under at most two, and a
   crosshair readout of every series at the nearest time (pointer or arrow keys). */
function LineChart({ t, series, from, to, res, height = 220, fmt = M.fmtBps, area = false }) {
  const box = useRef(null);
  const width = useWidth(box);
  const [hi, setHi] = useState(null);
  const times = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b), [series]);
  const lookup = useMemo(() => series.map((s) => new Map(s.points)), [series]);
  const max = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p[1])));
  const ticks = M.niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const labelled = series.length >= 1 && series.length <= 4;
  const pad = { l: 64, r: labelled ? 92 : 16, t: 12, b: 26 };
  const W = width, H = height;
  const x = (tt) => pad.l + ((tt - from) / Math.max(1, to - from)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const base = y(0);
  const gap = res * 1.5;
  // end labels: the last value of each series, all of them or none if two would collide
  const ends = series.map((s, i) => ({ i, p: s.points[s.points.length - 1] })).filter((e) => e.p);
  const ys = ends.map((e) => y(e.p[1])).sort((a, b) => a - b);
  const endLabels = labelled && ends.length > 0 && ys.every((v, i) => i === 0 || v - ys[i - 1] >= 14);
  const pick = (clientX) => {
    const r = box.current.getBoundingClientRect();
    const tt = from + ((clientX - r.left - pad.l) / Math.max(1, W - pad.l - pad.r)) * (to - from);
    setHi(M.nearestIndex(times, tt));
  };
  const key = (e) => {
    if (!times.length) return;
    if (e.key === "ArrowLeft") { setHi((h) => Math.max(0, (h ?? times.length) - 1)); e.preventDefault(); }
    if (e.key === "ArrowRight") { setHi((h) => Math.min(times.length - 1, (h ?? -1) + 1)); e.preventDefault(); }
  };
  const ht = hi != null && hi >= 0 ? times[hi] : null;
  const span = to - from;
  return (
    <div className="mgr-chart" ref={box}>
      {series.length >= 2 && (
        <div className="mgr-legend">
          {series.map((s) => <span key={s.key}><i style={{ background: `var(--viz-${s.slot})` }} />{s.label}</span>)}
        </div>
      )}
      <svg width={W} height={H} role="img" aria-label={series.map((s) => s.label).join(", ")} tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setHi(null)} onKeyDown={key} onBlur={() => setHi(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "mgr-axis" : "mgr-grid"} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="mgr-tick">{fmt(v)}</text>
          </g>
        ))}
        {M.timeTicks(from, to, W - pad.l - pad.r).map((tt) => (
          <text key={tt} x={x(tt)} y={H - 6} textAnchor="middle" className="mgr-tick">{M.fmtTick(tt, span)}</text>
        ))}
        {area && series.length <= 2 && series.map((s) => {
          const d = M.linePath(s.points, x, y, gap);
          return d.split("M").filter(Boolean).map((seg, k) => {
            const pts = seg.split("L");
            const first = pts[0].split(",")[0], last = pts[pts.length - 1].split(",")[0];
            return <path key={s.key + k} d={`M${seg}L${last},${base}L${first},${base}Z`} style={{ fill: `var(--viz-${s.slot})` }} className="mgr-area" />;
          });
        })}
        {series.map((s) => <path key={s.key} d={M.linePath(s.points, x, y, gap)} style={{ stroke: `var(--viz-${s.slot})` }} className="mgr-line" />)}
        {ends.map((e) => <circle key={e.i} cx={x(e.p[0])} cy={y(e.p[1])} r={4} style={{ fill: `var(--viz-${series[e.i].slot})` }} className="mgr-dot" />)}
        {endLabels && ends.map((e) => (
          <text key={"l" + e.i} x={x(e.p[0]) + 8} y={y(e.p[1]) + 4} className="mgr-endlabel">{series[e.i].label}</text>
        ))}
        {ht != null && (
          <g>
            <line x1={x(ht)} x2={x(ht)} y1={pad.t} y2={base} className="mgr-cross" />
            {series.map((s, i) => lookup[i].has(ht) && (
              <circle key={s.key} cx={x(ht)} cy={y(lookup[i].get(ht))} r={4} style={{ fill: `var(--viz-${s.slot})` }} className="mgr-dot" />
            ))}
          </g>
        )}
      </svg>
      {ht != null && (
        <div className="mgr-tip" style={{ left: Math.min(x(ht) + 12, W - 200), top: 8 + (series.length >= 2 ? 24 : 0) }}>
          <div className="mgr-tip-when">{M.fmtWhen(ht, span)}</div>
          {series.map((s, i) => (
            <div key={s.key} className="mgr-tip-row"><i style={{ background: `var(--viz-${s.slot})` }} />
              <b>{lookup[i].has(ht) ? fmt(lookup[i].get(ht)) : "–"}</b><span>{s.label}</span></div>
          ))}
        </div>
      )}
      {!times.length && <div className="mgr-chart-empty">{t("tr.noData")}</div>}
    </div>
  );
}

function SeriesTable({ series, span, fmt = M.fmtBps }) {
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => b - a);
  const maps = series.map((s) => new Map(s.points));
  return (
    <div className="mgr-scroll">
      <table className="acct-table mgr-table mgr-compact">
        <thead><tr><th />{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{times.map((tt) => (
          <tr key={tt}><td className="mono mgr-nowrap">{M.fmtWhen(tt, span)}</td>
            {maps.map((m, i) => <td key={i} className="mono">{m.has(tt) ? fmt(m.get(tt)) : "–"}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* A chart card with its table view a click away. */
function ChartCard({ t, title, sub, series, from, to, res, area, fmt, height }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="sys-card">
      <div className="mgr-toolbar">
        <h3 className="sys-card-title">{title}</h3>
        {sub && <span className="mgr-dim">{sub}</span>}
        <span className="mgr-spacer" />
        <span className="acct-seg">
          <button className={asTable ? "" : "on"} onClick={() => setAsTable(false)}>{t("tr.chart")}</button>
          <button className={asTable ? "on" : ""} onClick={() => setAsTable(true)}>{t("tr.table")}</button>
        </span>
      </div>
      {asTable ? <SeriesTable series={series} span={to - from} fmt={fmt} />
        : <LineChart t={t} series={series} from={from} to={to} res={res} area={area} fmt={fmt} height={height} />}
    </div>
  );
}

function Spark({ values }) {
  if (!values || values.length < 2) return <span className="mgr-dim">–</span>;
  const w = 110, h = 26, mx = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v / mx) * (h - 6)).toFixed(1)}`).join("");
  return <svg width={w} height={h} className="mgr-spark" aria-hidden="true"><path d={d} /></svg>;
}

function Meter({ pct }) {
  if (pct == null) return <span className="mgr-dim">–</span>;
  return (
    <span className="mgr-meter" title={`${pct}%`}>
      <span className="mgr-meter-track"><span className={pct >= 90 ? "bad" : pct >= 70 ? "warn" : ""} style={{ width: `${Math.min(100, pct)}%` }} /></span>
      <em className="mono">{pct}%</em>
    </span>
  );
}

function TrafficView({ t, call, me }) {
  const [range, setRange] = useState("24h");
  const [menu, setMenu] = useState(false);
  const [clearing, setClearing] = useState(null);     // {counters, busy, done}
  const [scope, setScope] = useState("");             // "" | "node:<id>" | "tag:<name>"
  const [nodes, setNodes] = useState([]);
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);               // {node_id, node, port}
  const [portData, setPortData] = useState(null);
  const query = useMemo(() => {
    const q = new URLSearchParams({ range });
    if (scope.startsWith("node:")) q.set("node", scope.slice(5));
    if (scope.startsWith("tag:")) q.set("tag", scope.slice(4));
    return q.toString();
  }, [range, scope]);
  const load = useCallback(async (background) => {
    setLoading(true);
    try { setD(await call(`/api/v1/traffic/summary?${query}`, { background })); setErr(""); }
    catch (e) { if (e.status !== 401) setErr(e.message); }
    finally { setLoading(false); }
  }, [call, query]);
  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => { call("/api/v1/nodes", { background: true }).then((r) => setNodes(r.nodes)).catch(() => {}); }, [call]);
  useEffect(() => {
    if (!sel) { setPortData(null); return; }
    call(`/api/v1/traffic/port?node=${sel.node_id}&port=${encodeURIComponent(sel.port)}&range=${range}`, { background: true })
      .then(setPortData).catch((e) => setErr(e.message));
  }, [call, sel, range]);
  const tags = [...new Set(nodes.flatMap((n) => n.tags || []))].sort();
  const scopeName = scope.startsWith("node:") ? (nodes.find((n) => String(n.id) === scope.slice(5)) || {}).name
    : scope.startsWith("tag:") ? t("tr.tagScope").replace("{tag}", scope.slice(4)) : t("tr.allNodes");
  const exportHref = (kind) => `/api/v1/traffic/export?kind=${kind}&${query}&tzoff=${-new Date().getTimezoneOffset()}`;
  const doClear = async () => {
    setClearing((c) => ({ ...c, busy: true }));
    const body = { node_counters: !!clearing.counters };
    if (scope.startsWith("node:")) body.node = Number(scope.slice(5));
    if (scope.startsWith("tag:")) body.tag = scope.slice(4);
    try {
      const r = await call("/api/v1/traffic/clear", { method: "POST", body });
      setClearing(null); setSel(null);
      setErr(Object.keys(r.counters_failed || {}).length ? t("tr.clearCountersFailed").replace("{nodes}", Object.keys(r.counters_failed).join(", ")) : "");
      await load(false);
    } catch (e) { setErr(e.message); setClearing(null); }
  };
  const from = d ? d.from : 0, to = d ? d.to : 0, span = to - from;
  const inOut = (pts, ii, oi) => [
    { key: "in", label: t("tr.in"), slot: 1, points: pts.map((p) => [p[0], p[ii]]) },
    { key: "out", label: t("tr.out"), slot: 2, points: pts.map((p) => [p[0], p[oi]]) },
  ];
  return (
    <section className="mgr-pane mgr-stack">
      <div className="mgr-filters">
        <span className="acct-seg">
          {M.RANGES.map((r) => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{t("tr.range." + r)}</button>)}
        </span>
        <select value={scope} onChange={(e) => { setScope(e.target.value); setSel(null); }}>
          <option value="">{t("tr.allNodes")}</option>
          {tags.length > 0 && <optgroup label={t("tr.byTag")}>{tags.map((g) => <option key={g} value={"tag:" + g}>{g}</option>)}</optgroup>}
          <optgroup label={t("tr.byNode")}>{nodes.map((n) => <option key={n.id} value={"node:" + n.id}>{n.name}</option>)}</optgroup>
        </select>
        {d && d.since && <span className="mgr-dim">{t("tr.since").replace("{t}", M.fmtTime(d.since))}</span>}
        <span className="mgr-spacer" />
        <span className="mgr-menu-wrap">
          <button className="copy-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>{t("tr.export")} ▾</button>
          {menu && (
            <>
              <div className="acct-scrim" onClick={() => setMenu(false)} />
              <div className="mgr-menu mgr-menu-down">
                {["ports", "filters", "total"].map((k) => (
                  <a key={k} className="mgr-menu-item" href={exportHref(k)} onClick={() => setMenu(false)}>{t("tr.export." + k)}</a>
                ))}
                <div className="mgr-menu-note">{t("tr.exportNote")}</div>
              </div>
            </>
          )}
        </span>
        {me.priv >= 10 && <button className="del" onClick={() => setClearing({ counters: false })}>{t("tr.clear")}</button>}
      </div>
      {clearing && (
        <Modal title={t("tr.clearTitle").replace("{scope}", scopeName || "?")} onClose={clearing.busy ? undefined : () => setClearing(null)} warn>
          <p>{t("tr.clearBody")}</p>
          <label className="mgr-check"><input type="checkbox" checked={!!clearing.counters}
            onChange={(e) => setClearing({ ...clearing, counters: e.target.checked })} />{t("tr.clearCounters")}</label>
          <div className="mgr-buttons">
            <button className="copy-btn" disabled={clearing.busy} onClick={() => setClearing(null)}>{t("common.cancel")}</button>
            <button className="del" disabled={clearing.busy} onClick={doClear}>{clearing.busy ? t("tr.clearing") : t("tr.clear")}</button>
          </div>
        </Modal>
      )}
      {err && <p className="set-hint err">{err}</p>}
      {!d ? <p className="mgr-dim">{t("app.loading")}</p> : (
        <div className={"mgr-stack" + (loading ? " mgr-refetch" : "")}>
          <div className="mgr-tiles">
            <div className="mgr-tile"><span>{t("tr.nowIn")}</span><b>{M.fmtBps(d.now.in)}</b></div>
            <div className="mgr-tile"><span>{t("tr.nowOut")}</span><b>{M.fmtBps(d.now.out)}</b></div>
            <div className="mgr-tile"><span>{t("tr.peak")}</span><b>{M.fmtBps(Math.max(d.peak.in, d.peak.out))}</b>
              <em>{d.peak.in >= d.peak.out ? t("tr.in") : t("tr.out")}{(d.peak.in_t || d.peak.out_t) ? " · " + M.fmtWhen(d.peak.in >= d.peak.out ? d.peak.in_t : d.peak.out_t, span) : ""}</em></div>
            <div className="mgr-tile"><span>{t("tr.dropsErrors")}</span><b>{M.fmtCount(d.drops)} / {M.fmtCount(d.errors)}</b>
              <em>{t("tr.inRange")}</em></div>
            <div className="mgr-tile"><span>{t("tr.ports")}</span><b>{d.now.ports_busy} / {d.now.ports_up}</b></div>
          </div>
          <ChartCard t={t} title={t("tr.total")} sub={t("tr.totalSub")} series={inOut(d.total, 1, 2)} from={from} to={to} res={d.res} area />
          <div className="sys-card">
            <h3 className="sys-card-title">{t("tr.topPorts")}</h3>
            {d.top_ports.length === 0 ? <p className="mgr-dim">{t("tr.noData")}</p> : (
              <table className="acct-table mgr-table mgr-click">
                <thead><tr><th>{t("ev.node")}</th><th>{t("tr.port")}</th><th>{t("tr.avgIn")}</th><th>{t("tr.avgOut")}</th>
                  <th>{t("tr.peakCol")}</th><th>{t("tr.util")}</th><th>{t("tr.trend")}</th></tr></thead>
                <tbody>{d.top_ports.map((p) => (
                  <tr key={p.node_id + p.port} className={sel && sel.node_id === p.node_id && sel.port === p.port ? "on" : ""}
                    tabIndex={0} onClick={() => setSel(p)} onKeyDown={(e) => e.key === "Enter" && setSel(p)}>
                    <td>{p.node}</td><td className="mono"><b>{p.port}</b></td>
                    <td className="mono">{M.fmtBps(p.in)}</td><td className="mono">{M.fmtBps(p.out)}</td>
                    <td className="mono">{M.fmtBps(Math.max(p.in_max, p.out_max))}</td>
                    <td><Meter pct={p.util_max} /></td><td><Spark values={p.spark} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <p className="set-hint dim">{t("tr.topPortsHint")}</p>
          </div>
          {sel && portData && (
            <ChartCard t={t} title={`${portData.node} ${portData.port}`}
              sub={portData.speed ? t("tr.speed").replace("{s}", fmtSpeed(portData.speed)) : ""}
              series={inOut(portData.points, 1, 2)} from={portData.from} to={portData.to} res={portData.res} area />
          )}
          <div className="sys-card">
            <h3 className="sys-card-title">{t("tr.topFilters")}</h3>
            {d.top_filters.length === 0 ? <p className="mgr-dim">{t("tr.noFilters")}</p> : (
              <table className="acct-table mgr-table">
                <thead><tr><th>{t("ev.node")}</th><th>{t("tr.filter")}</th><th>{t("tr.mps")}</th><th>{t("tr.mpsMax")}</th><th>{t("tr.matched")}</th></tr></thead>
                <tbody>{d.top_filters.map((f) => {
                  const mx = d.top_filters[0].matched || 1;
                  return (
                    <tr key={f.node_id + "-" + f.fid}>
                      <td>{f.node}</td><td><b className="mono">F{f.fid}</b>{f.name && <span className="mgr-dim"> {f.name}</span>}</td>
                      <td className="mono">{M.fmtCount(f.mps)}</td><td className="mono">{M.fmtCount(f.mps_max)}</td>
                      <td><span className="mgr-hbar"><span style={{ width: `${(100 * f.matched) / mx}%` }} /></span> <span className="mono">{M.fmtCount(f.matched)}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </div>
          {d.tags.length > 0 ? (
            <ChartCard t={t} title={t("tr.byTagTitle")} sub={d.tags_more ? t("tr.tagsMore").replace("{n}", d.tags_more) : t("tr.byTagSub")}
              series={d.tags.map((g, i) => ({ key: g.tag, label: `${g.tag} (${g.nodes})`, slot: i + 1, points: g.points }))}
              from={from} to={to} res={d.res} />
          ) : !scope && <p className="set-hint dim">{t("tr.noTags")}</p>}
          {d.top_drops.length > 0 && (
            <div className="sys-card">
              <h3 className="sys-card-title">{t("tr.drops")}</h3>
              <table className="acct-table mgr-table">
                <thead><tr><th>{t("ev.node")}</th><th>{t("tr.port")}</th><th>{t("tr.dropCount")}</th><th>{t("tr.errCount")}</th></tr></thead>
                <tbody>{d.top_drops.map((p) => (
                  <tr key={p.node_id + p.port}><td>{p.node}</td><td className="mono"><b>{p.port}</b></td>
                    <td className="mono">{M.fmtCount(p.drops)}</td><td className="mono">{M.fmtCount(p.errors)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ this host */
/* The host the manager runs on -- for the user, the box itself: identity, CPU,
   memory, the BMC's sensors, disks, network ports and the cards' PCIe links,
   services, time, and what is wrong. Read every 10 s. */
function HostView({ t, call }) {
  const [h, setH] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (background) => {
    try { setH(await call("/api/v1/host/status", { background })); setErr(""); }
    catch (e) { if (e.status !== 401) setErr(e.message); }
  }, [call]);
  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 10000);
    return () => clearInterval(id);
  }, [load]);
  if (!h) return <section className="mgr-pane"><p className="mgr-dim">{err || t("app.loading")}</p></section>;
  const sy = h.system || {}, dmi = sy.dmi || {}, mem = h.memory || {}, se = h.sensors || {};
  const ipmi = se.ipmi || [];
  const group = (kind) => ipmi.filter((x) => x.kind === kind && x.status !== "absent");
  const badge = (st) => <span className={"mgr-badge" + (st === "crit" ? " bad" : st === "warn" ? " warn" : "")}>{t("hs.st." + (st || "ok"))}</span>;
  const sensorTable = (kind, title) => {
    const rows = group(kind);
    if (!rows.length) return null;
    return (
      <>
        <h4 className="mgr-h4">{title}</h4>
        <table className="acct-table mgr-table mgr-compact">
          <tbody>{rows.map((x) => (
            <tr key={x.name}><td className="mono">{x.name}</td>
              <td className="mono">{x.value != null ? `${x.value} ${x.unit === "C" ? "°C" : x.unit}` : x.reading}</td><td>{badge(x.status)}</td></tr>
          ))}</tbody>
        </table>
      </>
    );
  };
  const probs = h.problems || [];
  return (
    <section className="mgr-pane mgr-stack">
      {err && <p className="set-hint err">{err}</p>}
      <div className={"mgr-hostsum " + (probs.some((p) => p.level === "crit") ? "bad" : probs.length ? "warn" : "ok")}>
        {probs.length === 0 ? t("hs.allGood") : (
          <ul>{probs.map((p) => <li key={p.key}>{badge(p.level)} {p.text}</li>)}</ul>
        )}
        <span className="mgr-dim mgr-hostsum-time">{t("hs.taken").replace("{t}", M.fmtTime(h.taken))}</span>
      </div>
      <div className="mgr-settings">
        <div className="sys-card">
          <h3 className="sys-card-title">{t("hs.system")}</h3>
          <dl className="mgr-kv">
            <dt>{t("hs.hostname")}</dt><dd className="mono">{sy.hostname}</dd>
            <dt>{t("hs.machine")}</dt><dd>{[dmi.sys_vendor, dmi.product_name].filter(Boolean).join(" ") || "–"}</dd>
            {se.serials?.product_serial && <><dt>{t("hs.serial")}</dt><dd className="mono">{se.serials.product_serial}
              {M.placeholderSerial(se.serials.product_serial) && <span className="mgr-dim"> ({t("hs.serialUnset")})</span>}</dd></>}
            {se.serials?.board_serial && <><dt>{t("hs.boardSerial")}</dt><dd className="mono">{se.serials.board_serial}</dd></>}
            <dt>{t("hs.bios")}</dt><dd className="mono">{[dmi.bios_version, dmi.bios_date].filter(Boolean).join(" · ") || "–"}</dd>
            <dt>{t("hs.os")}</dt><dd>{sy.os} <span className="mgr-dim mono">{sy.kernel}</span></dd>
            <dt>{t("node.uptime")}</dt><dd className="mono">{fmtUptime(sy.uptime_s || 0)}</dd>
            <dt>{t("hs.load")}</dt><dd className="mono">{(sy.load || []).join(" ")}</dd>
            <dt>{t("hs.cpu")}</dt><dd>{sy.cpu_model} <span className="mgr-dim">× {sy.cpus}</span></dd>
            <dt>{t("hs.cpuUse")}</dt><dd>
              <span className="mono">{h.cpu?.total}%</span>
              <span className="mgr-cores">{(h.cpu?.cores || []).map((c, i) => <span key={i} title={`${i}: ${c}%`} style={{ height: `${Math.max(2, c)}%` }} />)}</span>
            </dd>
            <dt>{t("node.memory")}</dt><dd className="mono">{mem.used_pct}% · {fmtBytes(mem.total - mem.available)} / {fmtBytes(mem.total)}</dd>
            {(h.cpu_temps || []).length > 0 && <><dt>{t("hs.cpuTemp")}</dt>
              <dd className="mono">{Math.max(...h.cpu_temps.map((x) => x.value))} °C <span className="mgr-dim">({t("hs.hottest")})</span></dd></>}
          </dl>
        </div>
        <div className="sys-card">
          <h3 className="sys-card-title">{t("hs.sensors")}</h3>
          {!se.collected && <p className="set-hint">{t("hs.noSensors")}</p>}
          {se.ipmi_error && <p className="set-hint dim">{se.ipmi_error}</p>}
          {sensorTable("fan", t("hs.fans"))}
          {sensorTable("temperature", t("hs.temps"))}
          {sensorTable("power", t("hs.power"))}
          {sensorTable("voltage", t("hs.volts"))}
          {se.collected && <p className="set-hint dim">{t("hs.read").replace("{t}", M.fmtTime(se.collected))}</p>}
        </div>
        <div className="sys-card">
          <h3 className="sys-card-title">{t("hs.services")}</h3>
          <table className="acct-table mgr-table mgr-compact">
            <tbody>{(h.services || []).map((x) => (
              <tr key={x.name}><td className="mono">{x.name}</td><td>{badge(x.active === "active" ? "ok" : x.enabled === "enabled" ? "crit" : "warn")}
                <span className="mgr-dim"> {x.active}{x.enabled === "enabled" ? "" : ` · ${x.enabled}`}</span></td></tr>
            ))}</tbody>
          </table>
          <h4 className="mgr-h4">{t("hs.time")}</h4>
          <p className="set-hint">{badge(h.time?.synchronized ? "ok" : "warn")} {h.time?.synchronized ? t("hs.synced").replace("{s}", h.time.server || "?") : t("hs.notSynced")}
            <span className="mgr-dim"> · {h.time?.timezone}</span></p>
        </div>
      </div>
      <div className="sys-card">
        <h3 className="sys-card-title">{t("hs.network")}</h3>
        <table className="acct-table mgr-table">
          <thead><tr><th>{t("host.iface")}</th><th>{t("hs.link")}</th><th>{t("hs.speed")}</th><th>{t("host.addr")}</th><th>{t("hs.rx")}</th><th>{t("hs.tx")}</th><th>{t("hs.errors")}</th></tr></thead>
          <tbody>{(h.interfaces || []).map((x) => (
            <tr key={x.name}>
              <td className="mono"><b>{x.name}</b>{x.card && <span className="mgr-tag">{t("hs.cardLink")}</span>}<div className="mgr-dim">{x.mac}</div></td>
              <td>{badge(x.state === "up" ? "ok" : x.card ? "crit" : "warn")} <span className="mgr-dim">{x.state}</span></td>
              <td className="mono">{x.card && x.pcie ? M.pcieText(x.pcie) : x.speed ? fmtSpeed(x.speed) : "–"}</td>
              <td className="mono">{(x.addresses || []).join(", ") || "–"}</td>
              <td className="mono">{M.fmtBps(x.rx_bps)}</td><td className="mono">{M.fmtBps(x.tx_bps)}</td>
              <td className="mono">{x.rx_errors + x.tx_errors}{x.rx_dropped ? ` · ${t("hs.dropped")} ${x.rx_dropped}` : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="sys-card">
        <h3 className="sys-card-title">{t("hs.storage")}</h3>
        <table className="acct-table mgr-table">
          <thead><tr><th>{t("hs.mount")}</th><th>{t("hs.used")}</th><th>{t("hs.free")}</th><th>{t("hs.size")}</th></tr></thead>
          <tbody>{(h.filesystems || []).map((f) => (
            <tr key={f.mount}><td className="mono">{f.mount} <span className="mgr-dim">{f.type}</span></td>
              <td><span className="mgr-bar"><span className={f.used_pct >= 90 ? "warn" : ""} style={{ width: `${f.used_pct}%` }} /></span> <span className="mono">{f.used_pct}%</span></td>
              <td className="mono">{fmtBytes(f.free)}</td><td className="mono">{fmtBytes(f.total)}</td></tr>
          ))}</tbody>
        </table>
        {(se.disks || []).length > 0 && (
          <table className="acct-table mgr-table">
            <thead><tr><th>{t("hs.disk")}</th><th>{t("hs.size")}</th><th>{t("hs.health")}</th><th>{t("hs.diskTemp")}</th><th>{t("hs.hours")}</th><th>{t("hs.sectors")}</th></tr></thead>
            <tbody>{se.disks.map((d) => (
              <tr key={d.device}><td><span className="mono">{d.device}</span> {d.model}<div className="mgr-dim mono">{d.serial}</div></td>
                <td className="mono">{d.bytes ? fmtBytes(d.bytes) : "–"}</td>
                <td>{badge(d.passed === false ? "crit" : (d.pending || d.uncorrectable) ? "warn" : "ok")} <span className="mgr-dim">{d.passed === false ? "FAILED" : d.passed ? "PASSED" : "?"}</span></td>
                <td className="mono">{d.temperature != null ? d.temperature + " °C" : "–"}</td>
                <td className="mono">{d.hours != null ? d.hours.toLocaleString() : "–"}</td>
                <td className="mono">{[d.reallocated, d.pending, d.uncorrectable].map((v) => v ?? "–").join(" / ")}</td></tr>
            ))}</tbody>
          </table>
        )}
        {se.disks_error && <p className="set-hint dim">{se.disks_error}</p>}
        {(se.disks || []).length > 0 && <p className="set-hint dim">{t("hs.sectorsHint")}</p>}
      </div>
      {(se.sel || []).length > 0 && (
        <div className="sys-card">
          <h3 className="sys-card-title">{t("hs.sel")}</h3>
          <table className="acct-table mgr-table mgr-compact">
            <tbody>{se.sel.slice().reverse().map((x) => (
              <tr key={x.id}><td className="mono mgr-nowrap">{x.when}</td><td>{x.sensor}</td><td>{x.event}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ settings */
/* Who checks passwords: the local accounts, or a TACACS+ / RADIUS server first.
   A try button asks the server about an account with the settings on the form,
   saved or not, so a server can be checked before anyone depends on it. */
function SignInServerCard({ t, call }) {
  const [f, setF] = useState(null);
  const [hasSecret, setHasSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [probe, setProbe] = useState({ username: "", password: "" });
  const [probeOut, setProbeOut] = useState(null);
  const load = useCallback(async () => {
    try { const r = await call("/api/v1/settings/auth"); setF(M.authToForm(r)); setHasSecret(!!r.has_secret); }
    catch (e) { setErr(e.message); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  if (!f) return <div className="sys-card"><p className="mgr-dim">{err || t("app.loading")}</p></div>;
  const save = async () => {
    setBusy(true); setErr(""); setMsg("");
    try { const r = await call("/api/v1/settings/auth", { method: "PUT", body: M.formToAuth(f) });
      setF(M.authToForm(r)); setHasSecret(!!r.has_secret); setMsg(t("common.saved")); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const tryIt = async () => {
    setBusy(true); setProbeOut(null);
    try { setProbeOut(await call("/api/v1/settings/auth/test", { method: "POST", body: { ...M.formToAuth(f), ...probe } })); }
    catch (e) { setProbeOut({ result: "error", detail: e.message }); } finally { setBusy(false); }
  };
  const remote = f.mode !== "local";
  const setSrv = (i, patch) => setF({ ...f, servers: f.servers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="sys-card mgr-wide-card">
      <h3 className="sys-card-title">{t("auth.title")}</h3>
      <p className="set-hint">{t("auth.lead")}</p>
      <div className="acct-seg mgr-seg">
        {["local", "tacacs", "radius"].map((m) => (
          <button key={m} className={f.mode === m ? "on" : ""} onClick={() => setF({ ...f, mode: m })}>{t("auth.mode." + m)}</button>
        ))}
      </div>
      {remote && (
        <>
          {f.servers.map((x, i) => (
            <div className="mgr-row2" key={i}>
              <label className="ml"><span>{t("auth.server")} {i + 1}</span><input value={x.host} onChange={(e) => setSrv(i, { host: e.target.value })} /></label>
              <label className="ml mgr-port"><span>{t("host.port")}</span>
                <input value={x.port} placeholder={f.mode === "tacacs" ? "49" : "1812"} onChange={(e) => setSrv(i, { port: e.target.value })} /></label>
              {f.servers.length > 1 && <button className="del mgr-rowdel" onClick={() => setF({ ...f, servers: f.servers.filter((_, j) => j !== i) })}>{t("common.delete")}</button>}
            </div>
          ))}
          <button className="copy-btn" disabled={f.servers.length >= 3} onClick={() => setF({ ...f, servers: [...f.servers, { host: "", port: "" }] })}>{t("auth.addServer")}</button>
          <div className="set-grid">
            <label className="ml"><span>{t("auth.secret")}</span>
              <input type="password" autoComplete="new-password" value={f.secret} placeholder={hasSecret ? t("auth.secretKept") : ""}
                onChange={(e) => setF({ ...f, secret: e.target.value })} /></label>
            <label className="ml"><span>{t("auth.timeout")}</span>
              <input type="number" min={1} max={30} value={f.timeout} onChange={(e) => setF({ ...f, timeout: e.target.value })} /></label>
            <label className="ml"><span>{t("auth.defaultPriv")}</span>
              <select value={f.default_priv} onChange={(e) => setF({ ...f, default_priv: Number(e.target.value) })}>
                {M.PRIV_LEVELS.map((p) => <option key={p} value={p}>{t("role." + M.roleOf(p))}</option>)}
              </select></label>
          </div>
          <p className="set-hint dim">{t("auth.levelHint." + f.mode)}</p>
          <label className="mgr-check"><input type="checkbox" checked={f.fallback} onChange={(e) => setF({ ...f, fallback: e.target.checked })} /> {t("auth.fallback")}</label>
          {f.mode === "radius" && (
            <label className="mgr-check"><input type="checkbox" checked={f.require_ma} onChange={(e) => setF({ ...f, require_ma: e.target.checked })} /> {t("auth.requireMa")}</label>
          )}
          <label className="ml"><span>{t("auth.localHosts")}</span>
            <input value={f.local_hosts} placeholder="192.168.1.0/24, 10.0.0.5" onChange={(e) => setF({ ...f, local_hosts: e.target.value })} /></label>
          <p className="set-hint dim">{t("auth.localHostsHint")}</p>
          <h4 className="mgr-h4">{t("auth.try")}</h4>
          <div className="mgr-row2">
            <label className="ml"><span>{t("acc.name")}</span><input value={probe.username} autoComplete="off" onChange={(e) => setProbe({ ...probe, username: e.target.value })} /></label>
            <label className="ml"><span>{t("login.password")}</span><input type="password" autoComplete="new-password" value={probe.password}
              onChange={(e) => setProbe({ ...probe, password: e.target.value })} /></label>
            <button className="copy-btn mgr-rowdel" disabled={busy || !probe.username || !probe.password} onClick={tryIt}>{t("auth.tryBtn")}</button>
          </div>
          {probeOut && (
            <p className={"set-hint " + (probeOut.result === "accepted" ? "" : "err")}>
              {t("auth.result." + probeOut.result) + (probeOut.role ? " — " + t("role." + probeOut.role) : "")}
              <span className="mgr-dim"> {probeOut.detail}</span>
            </p>
          )}
        </>
      )}
      <p className="set-hint dim">{t("auth.recover")}</p>
      <div className="mgr-buttons left">
        <button className="sys-refresh" disabled={busy} onClick={save}>{t("common.save")}</button>
        {msg && <span className="mgr-ok">{msg}</span>}
      </div>
      {err && <p className="set-hint err">{err}</p>}
    </div>
  );
}

/* The host's own settings, one card each: network (management interfaces and the
   cards' NAT), time, syslog, management access. The manager writes them, root
   applies them (grism-host-apply). Each card saves its own part, and a save
   leaves what another card is still editing alone. */
function HostSettingsCards({ t, call }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [mg, setMg] = useState([]);
  const [nat, setNat] = useState(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const [status, setStatus] = useState(null);
  const [you, setYou] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState({});
  const fetchHost = useCallback(() => call("/api/v1/settings/host"), [call]);
  useEffect(() => {
    fetchHost().then((r) => {
      setForm(M.hostSettingsToForm(r.settings)); setSaved(r.settings); setStatus(r.status); setYou(r.you || "");
      setMg(M.mgmtToForm(r.interfaces || [], r.settings.mgmt || {})); setNat(r.card_nat || null);
    }).catch((e) => setErr({ load: e.message }));
  }, [fetchHost]);
  const pending = status && status.mgmt_pending;
  useEffect(() => {
    if (!pending) return undefined;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [pending]);
  // save one part; afterwards refresh what the server says, and only that part of the forms
  const putHost = async (part, patch, okMsg) => {
    setBusy(part); setErr({ ...err, [part]: "" }); setMsg({ ...msg, [part]: "" });
    try {
      await call("/api/v1/settings/host", { method: "PUT", body: { ...saved, ...patch } });
      await sleep(2500);
      const r = await fetchHost();
      setSaved(r.settings); setStatus(r.status); setNat(r.card_nat || null);
      const fresh = M.hostSettingsToForm(r.settings);
      if (part in fresh) setForm((f) => ({ ...f, [part]: fresh[part] }));
      if (part === "mgmt") setMg(M.mgmtToForm(r.interfaces || [], r.settings.mgmt || {}));
      const failed = r.status && r.status.applied > Date.now() / 1000 - 30 && !r.status.ok;
      if (failed) setErr((e) => ({ ...e, [part]: (r.status.errors || []).join("; ") }));
      else setMsg((m) => ({ ...m, [part]: okMsg }));
    } catch (e) { setErr((x) => ({ ...x, [part]: e.message })); } finally { setBusy(""); }
  };
  const confirmMgmt = async () => {
    setBusy("mgmt");
    try {
      await call("/api/v1/settings/host/confirm-mgmt", { method: "POST" });
      await sleep(1500);
      const r = await fetchHost();
      setStatus(r.status); setSaved(r.settings);
      setMsg((m) => ({ ...m, mgmt: t("host.mgmtConfirmed") }));
    } catch (e) { setErr((x) => ({ ...x, mgmt: e.message })); } finally { setBusy(""); }
  };
  if (!form) return <div className="sys-card mgr-wide-card"><p className="mgr-dim">{err.load || t("app.loading")}</p></div>;
  const row = (key, i, patch) => setForm({ ...form, [key]: form[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const mrow = (i, patch) => setMg(mg.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const foot = (part, button) => (
    <>
      <div className="mgr-buttons left">
        {button}
        {msg[part] && <span className="mgr-ok">{msg[part]}</span>}
      </div>
      {err[part] && <p className="set-hint err">{err[part]}</p>}
    </>
  );
  const saveBtn = (part, onClick, disabled) => (
    <button className="sys-refresh" disabled={!!busy || disabled} onClick={onClick}>{busy === part ? t("common.saving") : t("common.save")}</button>
  );
  const asSettings = () => M.hostFormToSettings(form);
  return (
    <>
      <div className="sys-card mgr-wide-card">
        <h3 className="sys-card-title">{t("set.network")}</h3>
        <p className="set-hint">{t("set.networkLead")}</p>
        <h4 className="mgr-h4">{t("host.mgmt")}</h4>
        {pending && (
          <div className="mgr-pending">
            <span>{t("host.mgmtPending").replace("{s}", Math.max(0, Math.round(pending.deadline - now)))}</span>
            <button className="sys-refresh" disabled={!!busy || pending.deadline < now} onClick={confirmMgmt}>{t("host.mgmtConfirm")}</button>
          </div>
        )}
        <table className="acct-table mgr-table">
          <thead><tr><th>{t("host.iface")}</th><th>{t("host.now")}</th><th>{t("host.mode")}</th><th>{t("host.addr")}</th><th>{t("host.gw")}</th><th>{t("host.dns")}</th></tr></thead>
          <tbody>
            {mg.map((x, i) => (
              <tr key={x.iface}>
                <td className="mono"><b>{x.iface}</b> <span className={"mgr-badge" + (x.state === "UP" ? "" : " warn")}>{x.state || "?"}</span></td>
                <td className="mono mgr-dim">{(x.addresses || []).join(", ") || "-"}{x.gateway_now ? ` via ${x.gateway_now}` : ""}</td>
                <td><select value={x.mode} onChange={(e) => mrow(i, { mode: e.target.value })}>
                  <option value="system">{t("host.modeSystem")}</option><option value="static">{t("host.modeStatic")}</option><option value="dhcp">DHCP</option>
                </select></td>
                <td><input className="mono" disabled={x.mode !== "static"} value={x.address} placeholder="a.b.c.d/nn" onChange={(e) => mrow(i, { address: e.target.value })} /></td>
                <td><input className="mono" disabled={x.mode !== "static"} value={x.gateway} onChange={(e) => mrow(i, { gateway: e.target.value })} /></td>
                <td><input className="mono" disabled={x.mode !== "static"} value={x.dns} onChange={(e) => mrow(i, { dns: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="set-hint dim">{t("host.mgmtHint")}</p>
        {foot("mgmt", <button className="sys-refresh" disabled={!!busy || !!pending || !M.mgmtChanged(mg, saved?.mgmt || {})}
          onClick={() => putHost("mgmt", { mgmt: M.formToMgmt(mg), confirm: 120 }, t("host.mgmtApplied"))}>
          {busy === "mgmt" ? t("common.saving") : t("host.mgmtApply")}</button>)}

        {nat && nat.cards && nat.cards.length > 0 && (
          <>
            <h4 className="mgr-h4">{t("host.nat")}</h4>
            <p className="set-hint">{t("host.natLead").replace("{cards}", nat.cards.join(", "))}</p>
            <p className="set-hint">{t(nat.enabled ? "host.natOn" : "host.natOff")}{nat.enabled && !nat.forwarding ? " " + t("host.natNoFwd") : ""}</p>
            {foot("card_nat", <button className={nat.enabled ? "del" : "sys-refresh"} disabled={!!busy}
              onClick={() => putHost("card_nat", { card_nat: { enabled: !nat.enabled } }, t("host.saved"))}>
              {t(nat.enabled ? "host.natTurnOff" : "host.natTurnOn")}</button>)}
            <p className="set-hint dim">{t("host.natHint")}</p>
          </>
        )}
        {status && (
          <p className={"set-hint dim" + (status.ok ? "" : " err")}>
            {t("host.applied").replace("{t}", M.fmtTime(status.applied))}{status.ok ? "" : " — " + (status.errors || []).join("; ")}
          </p>
        )}
      </div>

      <div className="sys-card">
        <h3 className="sys-card-title">{t("host.ntp")}</h3>
        <label className="ml"><span>{t("host.ntpServers")}</span>
          <input value={form.ntp} onChange={(e) => setForm({ ...form, ntp: e.target.value })} placeholder="time.google.com, 216.239.35.0" /></label>
        <p className="set-hint dim">{t("host.ntpHint")}</p>
        {foot("ntp", saveBtn("ntp", () => putHost("ntp", { ntp: asSettings().ntp }, t("host.saved"))))}
      </div>

      <div className="sys-card">
        <h3 className="sys-card-title">{t("host.syslog")}</h3>
        {form.syslog.map((x, i) => (
          <div className="mgr-row2" key={i}>
            <label className="ml"><span>{t("host.server")}</span><input value={x.host} onChange={(e) => row("syslog", i, { host: e.target.value })} /></label>
            <label className="ml mgr-port"><span>{t("host.port")}</span><input value={x.port} onChange={(e) => row("syslog", i, { port: e.target.value })} /></label>
            <label className="ml mgr-port"><span>{t("host.proto")}</span>
              <select value={x.proto} onChange={(e) => row("syslog", i, { proto: e.target.value })}><option value="udp">UDP</option><option value="tcp">TCP</option></select></label>
            <button className="del mgr-rowdel" onClick={() => setForm({ ...form, syslog: form.syslog.filter((_, j) => j !== i) })}>{t("common.delete")}</button>
          </div>
        ))}
        <button className="copy-btn" disabled={form.syslog.length >= 4} onClick={() => setForm({ ...form, syslog: [...form.syslog, { host: "", port: "514", proto: "udp" }] })}>{t("host.addSyslog")}</button>
        <p className="set-hint dim">{t("host.syslogHint")}</p>
        {foot("syslog", saveBtn("syslog", () => putHost("syslog", { syslog: asSettings().syslog }, t("host.saved"))))}
      </div>

      <div className="sys-card">
        <h3 className="sys-card-title">{t("host.access")}</h3>
        {form.access.map((x, i) => (
          <div className="mgr-row2" key={i}>
            <label className="ml"><span>{t("host.src")}</span><input value={x.src} onChange={(e) => row("access", i, { src: e.target.value })} placeholder="192.168.1.0/24" /></label>
            <label className="ml mgr-port"><span>{t("host.sport")}</span><input value={x.sport} onChange={(e) => row("access", i, { sport: e.target.value })} placeholder={t("host.any")} /></label>
            <label className="ml mgr-port"><span>{t("host.dport")}</span><input value={x.dport} onChange={(e) => row("access", i, { dport: e.target.value })} placeholder="22,443" /></label>
            <button className="del mgr-rowdel" onClick={() => setForm({ ...form, access: form.access.filter((_, j) => j !== i) })}>{t("common.delete")}</button>
          </div>
        ))}
        <button className="copy-btn" disabled={form.access.length >= 64} onClick={() => setForm({ ...form, access: [...form.access, { src: "", sport: "", dport: "" }] })}>{t("host.addAccess")}</button>
        <p className="set-hint dim">{t("host.accessHint").replace("{ip}", you || "?")}</p>
        {form.access.length > 0 && !M.accessAdmits(form.access, you, 443) && <p className="set-hint err">{t("host.lockout").replace("{ip}", you)}</p>}
        {foot("access", saveBtn("access", () => putHost("access", { access: asSettings().access }, t("host.saved"))))}
      </div>
    </>
  );
}

/* Factory settings with this host's management address kept: the manager
   restarts, everyone signs in again with the administrator named here. */
function FactoryResetCard({ t, call, me }) {
  const [f, setF] = useState({ user: me.username, pw: "", pw2: "", cards: false, confirm: "" });
  const [cards, setCards] = useState([]);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  useEffect(() => { call("/api/v1/settings/host").then((r) => setCards((r.card_nat && r.card_nat.cards) || [])).catch(() => {}); }, [call]);
  const ready = f.user.trim() && f.pw && f.pw === f.pw2 && f.confirm.trim() === "RESET";
  const go = async () => {
    setAsk(false); setBusy(true); setErr("");
    try {
      const r = await call("/api/v1/factory-reset", { method: "POST",
        body: { admin_user: f.user.trim(), admin_password: f.pw, cards: f.cards, confirm: f.confirm.trim() } });
      setDone(r);
      await sleep(4000);
      for (let i = 0; i < 60; i++) {
        try { const v = await fetch("/api/v1/version", { cache: "no-store" }); if (v.ok) break; } catch { /* restarting */ }
        await sleep(1000);
      }
      window.location.reload();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="sys-card mgr-wide-card mgr-danger-card">
      <h3 className="sys-card-title">{t("fr.title")}</h3>
      <p className="set-hint">{t("fr.lead")}</p>
      <ul className="set-hint mgr-list">
        <li>{t("fr.reset")}</li>
        <li>{t("fr.kept")}</li>
      </ul>
      {cards.length > 0 && (
        <label className="mgr-check"><input type="checkbox" checked={f.cards} onChange={(e) => setF({ ...f, cards: e.target.checked })} />
          {t("fr.cards").replace("{cards}", cards.join(", "))}</label>
      )}
      <div className="set-grid">
        <label className="ml"><span>{t("fr.admin")}</span><input value={f.user} autoComplete="off" onChange={(e) => setF({ ...f, user: e.target.value })} /></label>
        <label className="ml"><span>{t("fr.pw")}</span><input type="password" autoComplete="new-password" value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} /></label>
        <label className="ml"><span>{t("fr.pw2")}</span><input type="password" autoComplete="new-password" value={f.pw2} onChange={(e) => setF({ ...f, pw2: e.target.value })} /></label>
        <label className="ml"><span>{t("fr.typeReset")}</span><input value={f.confirm} placeholder="RESET" autoComplete="off" onChange={(e) => setF({ ...f, confirm: e.target.value })} /></label>
      </div>
      {f.pw && f.pw2 && f.pw !== f.pw2 && <p className="set-hint err">{t("fr.pwDiffer")}</p>}
      <div className="mgr-buttons left">
        <button className="del" disabled={!ready || busy} onClick={() => setAsk(true)}>{busy ? t("fr.going") : t("fr.go")}</button>
      </div>
      {err && <p className="set-hint err">{err}</p>}
      {done && (
        <p className="set-hint">{t("fr.restarting")}
          {(done.cards_reset || []).length > 0 && " " + t("fr.cardsReset").replace("{cards}", done.cards_reset.join(", "))}
          {Object.keys(done.cards_failed || {}).length > 0 && " " + t("fr.cardsFailed").replace("{cards}", Object.keys(done.cards_failed).join(", "))}
        </p>
      )}
      {ask && (
        <Modal title={t("fr.askTitle")} onClose={() => setAsk(false)} warn>
          <p>{t("fr.askBody").replace("{user}", f.user.trim())}</p>
          {f.cards && <p>{t("fr.askCards")}</p>}
          <div className="mgr-buttons">
            <button className="copy-btn" onClick={() => setAsk(false)}>{t("common.cancel")}</button>
            <button className="del" onClick={go}>{t("fr.go")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

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
      min_length: Number(p.min_length), min_classes: Number(p.min_classes), max_age_days: Number(p.max_age_days),
      not_username: !!p.not_username } }));
      setMsg(t("common.saved")); }
    catch (e) { setErr(e.message); }
  };
  // basics first (network, time, logging), then who may get in, then accounts' rules, then what this is
  return (
    <section className="mgr-pane mgr-settings mgr-settings3">
      {admin && <HostSettingsCards t={t} call={call} />}
      {admin && <SignInServerCard t={t} call={call} />}
      <div className="sys-card mgr-span2">
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
        {p && (
          <label className="mgr-check"><input type="checkbox" disabled={!admin} checked={!!p.not_username}
            onChange={(e) => setP({ ...p, not_username: e.target.checked })} />{t("set.notUsername")}</label>
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
      {admin && <FactoryResetCard t={t} call={call} me={me} />}
    </section>
  );
}
