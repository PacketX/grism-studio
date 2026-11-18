/* ============================================================
   Modules -- a feature as a few fields

   The device (pywww modules.py) owns the module catalogue, each module's form
   schema, and the run.xml blocks an instance turns into; this component only
   draws the form the schema describes and asks the device to apply or
   release. So a new module on the device needs nothing here.

   Two places show it:
   - Settings > Modules (mode "settings"): one card per module of the
     catalogue, there from the start, with an active / not-applied badge and
     two buttons, Apply and Release, each behind a confirm. Apply puts an
     empty instance on the device (kept there on one inert filter), which is
     what turns the pipeline page into the module's; Release takes it off.
     No field is set here.
   - Pipeline > MEC (mode "detail"): every instance's full form, the advanced
     fields (the cell / UE / SPID rules) included, applied in place after a
     confirm -- the apply that first configures an instance replaces the
     device's packet-processing configuration with the module's (the device
     keeps the old run.xml as a pre-submit snapshot, listed on the Export
     tab). The editor's own tabs stay beside it; the Raw XML button 2.285-
     2.287 had here went at the user's word (the Export tab shows the XML).

   Field types the schema may use: port, ip, cidr_list, text, int, bool, enum,
   table (columns of the same types, minus table). Labels come as {en, zh}.
   A field's `when: {key, value}` ties it to another field's choice (shown and
   required only then); `wide` gives it the whole row.
   ============================================================ */
import React, { useState, useEffect, useCallback, useRef } from "react";

const L = (d, lang) => (d && typeof d === "object" ? (d[lang === "zh-TW" ? "zh" : "en"] || d.en || "") : (d ?? ""));

async function getJson(path) {
  const r = await fetch(path, { credentials: "include" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function postJson(path, body) {
  const r = await fetch(path, { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* a plain-text refusal */ }
  if (!r.ok) {
    const msg = data?.problems?.length ? data.problems.map((p) => (p.where ? p.where + ": " : "") + p.msg).join("; ") : (text || ("HTTP " + r.status));
    throw new Error(msg);
  }
  return data;
}

/* the form holds strings; the device parses lists and numbers itself */
const joinList = (v) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));

function emptyRow(columns) {
  const row = {};
  columns.forEach((c) => { row[c.key] = c.type === "bool" ? !!c.default : (c.default ?? ""); });
  return row;
}

function formFromParams(schema, params) {
  const form = {};
  schema.forEach((f) => {
    const v = params?.[f.key];
    if (f.type === "table") {
      form[f.key] = (Array.isArray(v) ? v : []).map((row) => {
        const r = {};
        f.columns.forEach((c) => { r[c.key] = c.type === "bool" ? !!row?.[c.key] : (row?.[c.key] == null ? (c.default ?? "") : (Array.isArray(row[c.key]) ? row[c.key].join(", ") : String(row[c.key]))); });
        return r;
      });
    } else if (f.type === "bool") form[f.key] = v == null ? !!f.default : !!v;
    else if (f.type === "cidr_list") form[f.key] = joinList(v);
    else form[f.key] = v == null ? (f.default ?? "") : String(v);
  });
  return form;
}

function Field({ f, value, onChange, lang, tr, dependent = false }) {
  const label = L(f.label, lang);
  const hint = L(f.hint, lang);
  let input;
  if (f.type === "port" || f.type === "enum") {
    input = (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {!f.required && f.default == null && <option value="">—</option>}
        {f.required && !value && <option value="">{tr("mod.pick")}</option>}
        {(f.options || []).map((o) => <option key={o.value} value={o.value}>{typeof o.label === "object" ? L(o.label, lang) : (o.label ?? o.value)}</option>)}
      </select>);
  } else if (f.type === "bool") {
    input = (
      <label className="set-check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>);
    return <div className="set-field mod-field mod-field-bool">{input}{hint && <p className="set-hint">{hint}</p>}</div>;
  } else if (f.type === "int") {
    input = <input type="number" min={f.min} max={f.max} value={value ?? ""} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
  } else {
    input = <input value={value ?? ""} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={"set-field mod-field" + (f.type === "cidr_list" || f.wide ? " mod-field-wide" : "") + (dependent ? " mod-field-dep" : "")}>
      <span>{dependent && <span className="mod-dep-mark" aria-hidden="true">↳ </span>}{label}{f.required && <em className="mod-req"> *</em>}</span>
      {input}
      {hint && <p className="set-hint">{hint}</p>}
    </div>);
}

function TableField({ f, rows, onChange, lang, tr }) {
  const cols = f.columns || [];
  const patch = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= rows.length) return; const n = rows.slice(); [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="mod-table-field">
      <div className="oattr-subhead">{L(f.label, lang)}</div>
      {L(f.hint, lang) && <p className="set-hint">{L(f.hint, lang)}</p>}
      {rows.length > 0 && (
        <div className="al-table-wrap">
          <table className="al-table mod-table">
            <thead><tr><th>#</th>{cols.map((c) => <th key={c.key}>{L(c.label, lang)}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="dim">{i + 1}</td>
                  {cols.map((c) => (
                    <td key={c.key}>
                      {c.type === "enum" || c.type === "port" ? (
                        <select value={row[c.key] ?? ""} onChange={(e) => patch(i, c.key, e.target.value)}>
                          {(c.options || []).map((o) => <option key={o.value} value={o.value}>{typeof o.label === "object" ? L(o.label, lang) : (o.label ?? o.value)}</option>)}
                        </select>
                      ) : c.type === "bool" ? (
                        <input type="checkbox" checked={!!row[c.key]} onChange={(e) => patch(i, c.key, e.target.checked)} />
                      ) : c.type === "int" ? (
                        <input className="al-host mod-num" type="number" min={c.min} max={c.max} value={row[c.key] ?? ""} placeholder={c.placeholder || ""} onChange={(e) => patch(i, c.key, e.target.value)} />
                      ) : (
                        <input className="al-host" value={row[c.key] ?? ""} placeholder={c.placeholder || ""} onChange={(e) => patch(i, c.key, e.target.value)} />
                      )}
                    </td>
                  ))}
                  <td className="mod-row-btns">
                    <button className="icon-btn" title={tr("mod.rowUp")} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button className="icon-btn" title={tr("mod.rowDown")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button className="icon-btn" title={tr("mod.rowDel")} onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="add-row">
        <button className="add-btn" disabled={f.max && rows.length >= f.max} onClick={() => onChange([...rows, emptyRow(cols)])}>{tr("mod.rowAdd")}</button>
      </div>
    </div>);
}

/* The form for one instance. `fields` says which of the schema's fields to
   show. Apply goes through the confirm the parent shows; Cancel puts the
   fields back to what the device holds. */
function ModuleForm({ module, inst, fields, lang, tr, canOperate, busy, notice, onApply, title }) {
  const [form, setForm] = useState(() => formFromParams(module.schema, inst?.params || {}));
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => setForm(formFromParams(module.schema, inst?.params || {}));
  const dirty = JSON.stringify(form) !== JSON.stringify(formFromParams(module.schema, inst?.params || {}));
  // a field with `when` belongs to another field's choice: shown, and required,
  // only while that field has the value
  const shown = (f) => !f.when || String(form[f.when.key] ?? "") === String(f.when.value);
  const visible = fields.filter(shown);
  const missing = visible.filter((f) => f.required && !String(form[f.key] ?? "").trim());
  return (
    <section className="sys-card wide mod-form-card mod-card">
      {title}
      <div className="mod-form">
        {visible.filter((f) => f.type !== "table").map((f) => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr}
            dependent={!!f.when} />
        ))}
      </div>
      {visible.filter((f) => f.type === "table").map((f) => (
        <TableField key={f.key} f={f} rows={form[f.key] || []} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
      ))}
      {notice &&<p className={"set-hint " + (notice.kind === "ok" ? "ok" : "err")}>{notice.msg}</p>}
      {missing.length > 0 && <p className="set-hint dim">{tr("mod.missing")}: {missing.map((f) => L(f.label, lang)).join(", ")}</p>}
      <div className="set-actions">
        <button className="copy-btn" disabled={busy != null || !dirty} onClick={reset}>{tr("mod.cancel")}</button>
        <button className="sys-refresh" disabled={!canOperate || busy != null || missing.length > 0} onClick={() => onApply(form)}>{busy === "apply" ? tr("mod.applying") : tr("mod.apply")}</button>
      </div>
    </section>);
}

export default function ModulesTab({ loggedIn, canOperate = false, t, lang = "en", onDeviceChanged, mode = "settings", moduleType = "mec" }) {
  const tr = t || ((k) => k);
  const [catalogue, setCatalogue] = useState(null);     // [{type, name, description, schema, version}]
  const [instances, setInstances] = useState([]);
  const [listState, setListState] = useState("idle");  // idle | loading | ok | error
  const [busy, setBusy] = useState(null);               // "apply" | "release"
  const [notice, setNotice] = useState(null);           // { type, kind: ok|err, msg }
  const [confirm, setConfirm] = useState(null);         // { kind: apply|release, type, id, form, name, update }
  const [sessions, setSessions] = useState(null);       // MEC table fill, where a MEC instance exists
  const [portLinks, setPortLinks] = useState({});       // port name -> link up (true/false)
  const [formKey, setFormKey] = useState(0);            // remounts the forms after an apply or release
  const [handwritten, setHandwritten] = useState(false); // run.xml still holds configuration outside the modules
  const timer = useRef(null);

  /* an apply or release hands run.xml to the device's watcher, which moves it
     into place within a second or two: read the list now, and again after */
  const reloadSoon = useCallback((fn) => { [0, 2500, 6000].forEach((ms) => setTimeout(fn, ms)); }, []);
  const load = useCallback(async () => {
    setListState("loading");
    try {
      const [cat, inst] = await Promise.all([getJson("/grism/task/get_modules"), getJson("/grism/task/get_module_instances")]);
      setCatalogue(cat.modules || []);
      setInstances(inst.instances || []);
      setHandwritten(!!inst.handwritten);
      setListState("ok");
    } catch { setListState("error"); }
  }, []);
  useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);

  // live figures: each port's link, and the MEC table's fill where a MEC
  // instance exists -- once every ten seconds while the page is open
  useEffect(() => {
    if (!loggedIn || instances.length === 0) { setSessions(null); setPortLinks({}); return; }
    const hasMec = instances.some((i) => i.type === "mec");
    const tick = async () => {
      try {
        const st = await getJson("/grism/task/get_lite_statistics_json");
        const links = {};
        (st.statistics || []).forEach((r) => { if (r.name) links[r.name] = r.linkStatus === 1; });
        setPortLinks(links);
      } catch { /* keep the last reading */ }
      if (hasMec) {
        try { const d = await getJson("/grism/task/get_s1ap_items?offset=0&limit=1"); const c = d.s1ap_items_count; setSessions(Array.isArray(c) ? c.map((x) => Number(x).toLocaleString()).join(" / ") : (c == null ? null : String(c))); }
        catch { setSessions(null); }
      }
    };
    tick();
    timer.current = setInterval(tick, 10000);
    return () => clearInterval(timer.current);
  }, [loggedIn, instances]);

  const moduleOf = (type) => (catalogue || []).find((m) => m.type === type);
  const instPorts = (inst) => ["ran_port", "core_port", "edge_port"].map((k) => inst.params?.[k]).filter(Boolean);
  const portChips = (inst) => instPorts(inst).map((p) => (
    <span key={p} className={"mod-port " + (portLinks[p] === true ? "ok" : portLinks[p] === false ? "bad" : "")} title={portLinks[p] === true ? tr("mod.linkUp") : portLinks[p] === false ? tr("mod.linkDown") : ""}>{p}</span>));
  const noticeFor = (type) => (notice && notice.type === type ? notice : null);

  const doApply = async (type, id, form) => {
    setBusy("apply"); setNotice(null);
    try {
      const r = await postJson("/grism/task/apply_module", { type, id, params: form, mode: "replace" });
      const argsChanged = r.args && (Object.keys(r.args.args || {}).length || Object.keys(r.args["in-tunnels"] || {}).length);
      setNotice({ type, kind: "ok", msg: tr("mod.applied") + (argsChanged ? " " + tr("mod.appliedArgs") : "") + (r.snapshot ? " " + tr("mod.appliedSnapshot") : "") });
      setFormKey((k) => k + 1);
      reloadSoon(load);
      if (onDeviceChanged) setTimeout(onDeviceChanged, 3000);
    } catch (e) { setNotice({ type, kind: "err", msg: e.message }); }
    setBusy(null);
  };
  /* Settings > Modules' Apply: an empty instance, which the device keeps on
     one inert filter beside whatever runs now -- the pipeline page is the
     module's from here, and the fields are set there */
  const doEnable = async (type) => {
    setBusy("apply"); setNotice(null);
    try {
      await postJson("/grism/task/apply_module", { type, params: {}, mode: "merge" });
      setNotice({ type, kind: "ok", msg: tr("mod.enabled") });
      setFormKey((k) => k + 1);
      reloadSoon(load);
      if (onDeviceChanged) setTimeout(onDeviceChanged, 3000);
    } catch (e) { setNotice({ type, kind: "err", msg: e.message }); }
    setBusy(null);
  };
  const doRelease = async (type, id) => {
    setBusy("release"); setNotice(null);
    try {
      await postJson("/grism/task/remove_module", { type, id });
      setNotice({ type, kind: "ok", msg: tr("mod.released") });
      setFormKey((k) => k + 1);
      reloadSoon(load);
      if (onDeviceChanged) setTimeout(onDeviceChanged, 3000);
    } catch (e) { setNotice({ type, kind: "err", msg: e.message }); }
    setBusy(null);
  };
  const runConfirm = () => {
    const c = confirm; setConfirm(null);
    if (!c) return;
    if (c.kind === "apply") doApply(c.type, c.id, c.form);
    else if (c.kind === "enable") doEnable(c.type);
    else doRelease(c.type, c.id);
  };

  const confirmModal = confirm && (
    <div className="modal-scrim mod-fixed" onClick={() => setConfirm(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{tr(confirm.kind === "release" ? "mod.releaseAskTitle" : "mod.applyAskTitle").replace("{name}", confirm.name)}</div>
        <p className="modal-body">{confirm.kind === "release" ? tr(confirm.blank ? "mod.releaseAskBodyBlank" : "mod.releaseAskBody") : confirm.kind === "enable" ? tr("mod.enableAskBody") : tr(confirm.update ? "mod.applyAskBodyUpdate" : "mod.applyAskBody")}</p>
        <button className="opt drop" onClick={runConfirm}>
          <span className="opt-name">{tr(confirm.kind === "release" ? "mod.releaseGo" : "mod.applyGo")}</span>
          <span className="opt-desc">{tr(confirm.kind === "release" ? "mod.releaseGoDesc" : confirm.kind === "enable" ? "mod.enableGoDesc" : "mod.applyGoDesc")}</span>
        </button>
        <button className="opt-cancel" onClick={() => setConfirm(null)}>{tr("mod.cancel")}</button>
      </div>
    </div>);

  if (!loggedIn) return <div className="set-forms"><p className="sys-note dim">{tr("mod.signIn")}</p></div>;

  /* ---- Pipeline > MEC: every instance of the module, every field, applied in place ---- */
  if (mode === "detail") {
    const list = instances.filter((i) => i.type === moduleType);
    const m = moduleOf(moduleType);
    return (
      <div className="sys-wrap set-page mod-tab">
        {listState === "error" && <p className="set-hint err">{tr("mod.unavailable")}</p>}
        {listState === "ok" && list.length === 0 && (
          <section className="sys-card"><h3 className="sys-card-title">{m ? L(m.name, lang) : moduleType}</h3>
            <p className="set-hint">{tr("mod.noInstance")}</p></section>)}
        {m && list.map((inst) => (
          <ModuleForm key={formKey + ":" + inst.id + ":" + JSON.stringify(inst.params)} module={m} inst={inst} fields={m.schema} lang={lang} tr={tr}
            canOperate={canOperate} busy={busy} notice={noticeFor(inst.type)}
            onApply={(form) => setConfirm({ kind: "apply", type: inst.type, id: inst.id, form, name: L(m.name, lang), update: !handwritten })}
            title={<>
              <h3 className="sys-card-title">{L(m.name, lang)} <span className="dim">#{inst.id}{inst.name ? " · " + inst.name : ""}</span>
                <span className="sys-card-metric">{inst.type === "mec" && sessions != null ? tr("mod.sessions") + " " + sessions : ""}</span></h3>
              <p className="set-hint">{L(m.description, lang)}</p>
              {inst.configured === false
                ? <p className="set-hint warn">{tr("mod.unconfiguredHere")}</p>
                : <p className="set-hint"><span className="mod-ports">{portChips(inst)}</span> {inst.summary}</p>}
              <p className="set-hint dim">{tr("mod.detailNote")}</p>
            </>} />
        ))}
        {confirmModal}
      </div>);
  }

  /* ---- Settings > Modules: one card per module of the catalogue, Apply and Release only ---- */
  return (
    <div className="set-forms mod-tab">
      <section className="sys-card">
        <h3 className="sys-card-title">{tr("mod.title")}
          <span className="sys-card-metric">{instances.length}</span>
        </h3>
        <p className="set-hint">{tr("mod.note")}</p>
        {listState === "error" && <p className="set-hint err">{tr("mod.unavailable")}</p>}
        {listState === "loading" && !catalogue && <p className="sys-note dim">{tr("set.loading")}</p>}
        {!canOperate && catalogue && <p className="set-hint dim">{tr("mod.readOnly")}</p>}
      </section>
      {(catalogue || []).map((m) => {
        const mine = instances.filter((i) => i.type === m.type);
        const inst = mine[0] || null;
        const unconfigured = !!inst && inst.configured === false;
        const n = noticeFor(m.type);
        const name = L(m.name, lang);
        return (
          <section key={m.type} className="sys-card wide mod-card">
            <h3 className="sys-card-title">{name}
              <span className={"mod-status" + (inst ? (unconfigured ? " on part" : " on") : "")}>{inst ? tr(unconfigured ? "mod.activeUnconfigured" : "mod.active") : tr("mod.inactive")}</span>
              <span className="sys-card-metric">{inst && inst.type === "mec" && sessions != null ? tr("mod.sessions") + " " + sessions : ""}</span></h3>
            <p className="set-hint">{L(m.description, lang)}</p>
            {inst && !unconfigured && <p className="set-hint"><span className="mod-ports">{portChips(inst)}</span> #{inst.id}{inst.name ? " · " + inst.name : ""} — {inst.summary}
              {inst.problems?.length > 0 && <span className="err"> {inst.problems.join("; ")}</span>}</p>}
            {unconfigured && <p className="set-hint warn">{tr("mod.unconfigured")}</p>}
            {mine.length > 1 && <p className="set-hint warn">{tr("mod.otherInstances").replace("{n}", String(mine.length - 1))}</p>}
            <p className="set-hint dim">{tr(inst ? "mod.detailWhere" : "mod.replaceNote")}</p>
            {n && <p className={"set-hint " + (n.kind === "ok" ? "ok" : "err")}>{n.msg}</p>}
            <div className="set-actions">
              <button className="copy-btn danger" disabled={!canOperate || busy != null || !inst}
                onClick={() => inst && setConfirm({ kind: "release", type: m.type, id: inst.id, name, blank: unconfigured })}>{busy === "release" ? tr("mod.releasing") : tr("mod.release")}</button>
              <button className="sys-refresh" disabled={!canOperate || busy != null || !!inst}
                onClick={() => setConfirm({ kind: "enable", type: m.type, name })}>{busy === "apply" ? tr("mod.applying") : tr("mod.apply")}</button>
            </div>
          </section>);
      })}
      {confirmModal}
    </div>
  );
}
