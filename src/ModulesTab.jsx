/* ============================================================
   Modules -- a feature as a few fields

   The device (pywww modules.py) owns the module catalogue, each module's form
   schema, and the run.xml blocks an instance turns into; this component only
   draws the form the schema describes and asks the device to apply or
   remove. So a new module on the device needs nothing here.

   Two places show it:
   - Settings > Modules (mode "settings"): the instances, add one with the
     basic fields, remove one. Applying replaces the device's packet-
     processing configuration with the module's (the device keeps the old
     run.xml as a pre-submit snapshot, listed on the Export tab).
   - Pipeline > MEC (mode "detail"): the one instance's full form, the
     advanced fields (the cell / UE / SPID rules) included, applied in place.

   Field types the schema may use: port, ip, cidr_list, text, int, bool, enum,
   table (columns of the same types, minus table). Labels come as {en, zh}.
   ============================================================ */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

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

function Field({ f, value, onChange, lang, tr }) {
  const label = L(f.label, lang);
  const hint = L(f.hint, lang);
  let input;
  if (f.type === "port" || f.type === "enum") {
    input = (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {!f.required && <option value="">—</option>}
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
    <div className={"set-field mod-field" + (f.type === "cidr_list" ? " mod-field-wide" : "")}>
      <span>{label}{f.required && <em className="mod-req"> *</em>}</span>
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

/* The form for one instance (new or existing). `fields` says which of the
   schema's fields to show; the apply goes straight to the device. */
function ModuleForm({ module, inst, fields, lang, tr, canOperate, busy, notice, onApply, onCancel, title }) {
  const [form, setForm] = useState(() => formFromParams(module.schema, inst?.params || {}));
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const missing = fields.filter((f) => f.required && !String(form[f.key] ?? "").trim());
  return (
    <section className="sys-card wide mod-form-card">
      {title}
      <div className="mod-form">
        {fields.filter((f) => f.type !== "table").map((f) => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
        ))}
      </div>
      {fields.filter((f) => f.type === "table").map((f) => (
        <TableField key={f.key} f={f} rows={form[f.key] || []} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
      ))}
      {notice && <p className={"set-hint " + (notice.kind === "ok" ? "ok" : "err")}>{notice.msg}</p>}
      {missing.length > 0 && <p className="set-hint dim">{tr("mod.missing")}: {missing.map((f) => L(f.label, lang)).join(", ")}</p>}
      <div className="set-actions">
        {onCancel && <button className="copy-btn" disabled={busy != null} onClick={onCancel}>{tr("mod.cancel")}</button>}
        <button className="sys-refresh" disabled={!canOperate || busy != null || missing.length > 0} onClick={() => onApply(form)}>{busy === "apply" ? tr("mod.applying") : tr("mod.apply")}</button>
      </div>
    </section>);
}

export default function ModulesTab({ loggedIn, canOperate = false, t, lang = "en", onDeviceChanged, mode = "settings", moduleType = "mec" }) {
  const tr = t || ((k) => k);
  const [catalogue, setCatalogue] = useState(null);     // [{type, name, description, schema, version}]
  const [instances, setInstances] = useState([]);
  const [listState, setListState] = useState("idle");  // idle | loading | ok | error
  const [sel, setSel] = useState(null);                 // settings mode: { type, id (null = new) }
  const [busy, setBusy] = useState(null);               // "apply" | "remove"
  const [notice, setNotice] = useState(null);           // { kind: ok|err, msg }
  const [removing, setRemoving] = useState(null);       // instance pending confirm
  const [sessions, setSessions] = useState(null);       // MEC table fill, where a MEC instance exists
  const [portLinks, setPortLinks] = useState({});       // port name -> link up (true/false)
  const [formKey, setFormKey] = useState(0);            // remounts the detail form after an apply
  const timer = useRef(null);

  /* an apply or remove hands run.xml to the device's watcher, which moves it
     into place within a second or two: read the list now, and again after */
  const reloadSoon = useCallback((fn) => { [0, 2500, 6000].forEach((ms) => setTimeout(fn, ms)); }, []);
  const load = useCallback(async () => {
    setListState("loading");
    try {
      const [cat, inst] = await Promise.all([getJson("/grism/task/get_modules"), getJson("/grism/task/get_module_instances")]);
      setCatalogue(cat.modules || []);
      setInstances(inst.instances || []);
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

  const doApply = async (type, id, form) => {
    setBusy("apply"); setNotice(null);
    try {
      const r = await postJson("/grism/task/apply_module", { type, id, params: form, mode: "replace" });
      const argsChanged = r.args && (Object.keys(r.args.args || {}).length || Object.keys(r.args["in-tunnels"] || {}).length);
      setNotice({ kind: "ok", msg: tr("mod.applied") + (argsChanged ? " " + tr("mod.appliedArgs") : "") + (r.snapshot ? " " + tr("mod.appliedSnapshot") : "") });
      setSel(null);
      setFormKey((k) => k + 1);
      reloadSoon(load);
      if (onDeviceChanged) setTimeout(onDeviceChanged, 3000);
    } catch (e) { setNotice({ kind: "err", msg: e.message }); }
    setBusy(null);
  };
  const doRemove = async (inst) => {
    setBusy("remove"); setNotice(null);
    try {
      await postJson("/grism/task/remove_module", { type: inst.type, id: inst.id });
      setNotice({ kind: "ok", msg: tr("mod.removed") });
      setRemoving(null);
      if (sel && sel.type === inst.type && sel.id === inst.id) setSel(null);
      reloadSoon(load);
      if (onDeviceChanged) setTimeout(onDeviceChanged, 3000);
    } catch (e) { setNotice({ kind: "err", msg: e.message }); }
    setBusy(null);
  };

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
            canOperate={canOperate} busy={busy} notice={notice}
            onApply={(form) => doApply(inst.type, inst.id, form)}
            title={<>
              <h3 className="sys-card-title">{L(m.name, lang)} <span className="dim">#{inst.id}{inst.name ? " · " + inst.name : ""}</span>
                <span className="sys-card-metric">{inst.type === "mec" && sessions != null ? tr("mod.sessions") + " " + sessions : ""}</span></h3>
              <p className="set-hint">{L(m.description, lang)}</p>
              <p className="set-hint"><span className="mod-ports">{portChips(inst)}</span> {inst.summary}</p>
              <p className="set-hint dim">{tr("mod.detailNote")}</p>
            </>} />
        ))}
      </div>);
  }

  /* ---- Settings > Modules: the list, add with the basic fields, remove ---- */
  const selModule = sel ? moduleOf(sel.type) : null;
  const selInst = sel && sel.id ? instances.find((i) => i.type === sel.type && i.id === sel.id) : null;
  const basicFields = useMemo(() => (selModule ? selModule.schema.filter((f) => f.group !== "advanced") : []), [selModule]);
  return (
    <div className="set-forms mod-tab">
      <section className="sys-card">
        <h3 className="sys-card-title">{tr("mod.title")}
          <span className="sys-card-metric">{instances.length}</span>
        </h3>
        <p className="set-hint">{tr("mod.note")}</p>
        {listState === "error" && <p className="set-hint err">{tr("mod.unavailable")}</p>}
        {listState === "loading" && instances.length === 0 && <p className="sys-note dim">{tr("set.loading")}</p>}
        {listState === "ok" && instances.length === 0 && <p className="sys-note dim">{tr("mod.none")}</p>}
        {instances.length > 0 && (
          <div className="al-table-wrap">
            <table className="al-table mod-list">
              <thead><tr><th>{tr("mod.colName")}</th><th>{tr("mod.colModule")}</th><th>{tr("mod.colSummary")}</th><th>{tr("mod.colPorts")}</th><th>{tr("mod.colElements")}</th><th /></tr></thead>
              <tbody>
                {instances.map((inst) => {
                  const m = moduleOf(inst.type);
                  return (
                    <tr key={inst.type + "#" + inst.id}>
                      <td>{inst.name || <span className="dim">{inst.type}#{inst.id}</span>}</td>
                      <td>{m ? L(m.name, lang) : inst.type}<span className="dim"> #{inst.id}</span></td>
                      <td className="mod-summary">{inst.summary || <span className="dim">—</span>}
                        {inst.problems?.length > 0 && <div className="set-hint err mod-inline">{inst.problems.join("; ")}</div>}
                        {inst.type === "mec" && sessions != null && <div className="dim mod-inline">{tr("mod.sessions")}: {sessions}</div>}
                      </td>
                      <td className="mod-ports">{portChips(inst)}</td>
                      <td className="dim">{inst.elements}</td>
                      <td className="mod-row-btns">
                        <button className="copy-btn" disabled={!m || !canOperate || inst.problems?.some((p) => /missing/.test(p))} onClick={() => { setSel({ type: inst.type, id: inst.id }); setNotice(null); }}>{tr("mod.edit")}</button>
                        {" "}
                        {removing && removing.type === inst.type && removing.id === inst.id ? (
                          <span className="mod-confirm">
                            <span className="dim">{tr("mod.removeAsk")}</span>{" "}
                            <button className="copy-btn danger" disabled={busy === "remove"} onClick={() => doRemove(inst)}>{tr("mod.removeYes")}</button>{" "}
                            <button className="copy-btn" onClick={() => setRemoving(null)}>{tr("mod.cancel")}</button>
                          </span>
                        ) : (
                          <button className="copy-btn" disabled={!canOperate || busy != null} onClick={() => { setRemoving(inst); setNotice(null); }}>{tr("mod.remove")}</button>
                        )}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
        {catalogue && catalogue.length > 0 && (
          <div className="add-row mod-add-row">
            {catalogue.map((m) => (
              <button key={m.type} className="add-btn" disabled={!canOperate} onClick={() => { setSel({ type: m.type, id: null }); setNotice(null); }}>{tr("mod.addPrefix")}{L(m.name, lang)}</button>
            ))}
            {!canOperate && <span className="dim mod-ro">{tr("mod.readOnly")}</span>}
          </div>
        )}
        {notice && !sel && <p className={"set-hint " + (notice.kind === "ok" ? "ok" : "err")}>{notice.msg}</p>}
      </section>

      {sel && selModule && (
        <ModuleForm key={sel.type + ":" + (sel.id || "new")} module={selModule} inst={selInst} fields={basicFields} lang={lang} tr={tr}
          canOperate={canOperate} busy={busy} notice={notice}
          onApply={(form) => doApply(sel.type, sel.id, form)}
          onCancel={() => { setSel(null); setNotice(null); }}
          title={<>
            <h3 className="sys-card-title">{L(selModule.name, lang)} <span className="dim">{sel.id ? "#" + sel.id : tr("mod.new")}</span></h3>
            <p className="set-hint">{L(selModule.description, lang)}</p>
            <p className="set-hint warn">{tr("mod.replaceNote")}</p>
            <p className="set-hint dim">{tr("mod.detailWhere")}</p>
          </>} />
      )}
    </div>
  );
}
