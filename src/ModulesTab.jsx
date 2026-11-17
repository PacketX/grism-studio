/* ============================================================
   Modules -- a feature as a few fields

   The device (pywww modules.py) owns the module catalogue, each module's form
   schema, and the run.xml blocks an instance turns into; this tab only draws
   the form the schema describes, shows the preview the device computes, and
   asks it to apply or remove. So a new module on the device needs nothing
   here.

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
        {!f.required && <option value="">{f.type === "port" ? "—" : "—"}</option>}
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

export default function ModulesTab({ loggedIn, canOperate = false, t, lang = "en", onDeviceChanged }) {
  const tr = t || ((k) => k);
  const [catalogue, setCatalogue] = useState(null);     // [{type, name, description, schema, version}]
  const [instances, setInstances] = useState([]);
  const [listState, setListState] = useState("idle");  // idle | loading | ok | error
  const [sel, setSel] = useState(null);                 // { type, id (null = new), form }
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);               // "preview" | "apply" | "remove"
  const [notice, setNotice] = useState(null);           // { kind: ok|err, msg }
  const [removing, setRemoving] = useState(null);       // instance pending confirm
  const [advOpen, setAdvOpen] = useState(false);
  const [xmlOpen, setXmlOpen] = useState(false);
  const [sessions, setSessions] = useState(null);       // MEC table count, where a MEC instance exists
  const [portLinks, setPortLinks] = useState({});       // port name -> link up (true/false), from the statistics
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

  // live figures: each port's link, and the MEC table's size where a MEC
  // instance exists -- once every ten seconds while the tab is open
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

  const startNew = (m) => {
    const form = formFromParams(m.schema, {});
    setSel({ type: m.type, id: null, form }); setPreview(null); setNotice(null); setAdvOpen(false); setXmlOpen(false);
  };
  const startEdit = (inst) => {
    const m = moduleOf(inst.type);
    if (!m) return;
    setSel({ type: inst.type, id: inst.id, form: formFromParams(m.schema, inst.params) });
    setPreview(null); setNotice(null); setXmlOpen(false);
    setAdvOpen(m.schema.some((f) => f.group === "advanced" && (f.type === "table" ? (inst.params?.[f.key]?.length > 0) : (inst.params?.[f.key] != null && inst.params?.[f.key] !== "" && inst.params?.[f.key] !== false))));
  };
  const setField = (k, v) => { setSel((s) => ({ ...s, form: { ...s.form, [k]: v } })); setPreview(null); };

  const doPreview = async () => {
    setBusy("preview"); setNotice(null);
    try { setPreview(await postJson("/grism/task/preview_module", { type: sel.type, id: sel.id, params: sel.form })); }
    catch (e) { setPreview(null); setNotice({ kind: "err", msg: e.message }); }
    setBusy(null);
    // the result lands below the form, under the pinned buttons: bring it up
    setTimeout(() => document.querySelector(".mod-preview, .mod-form-card .set-hint.err")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  };
  const doApply = async () => {
    setBusy("apply"); setNotice(null);
    try {
      const r = await postJson("/grism/task/apply_module", { type: sel.type, id: sel.id, params: sel.form });
      setNotice({ kind: "ok", msg: tr("mod.applied") + (r.args && (Object.keys(r.args.args || {}).length || Object.keys(r.args["in-tunnels"] || {}).length) ? " " + tr("mod.appliedArgs") : "") });
      setSel(null); setPreview(null);
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
      if (sel && sel.type === inst.type && sel.id === inst.id) { setSel(null); setPreview(null); }
      reloadSoon(load);
      if (onDeviceChanged) setTimeout(onDeviceChanged, 3000);
    } catch (e) { setNotice({ kind: "err", msg: e.message }); }
    setBusy(null);
  };

  const selModule = sel ? moduleOf(sel.type) : null;
  const basic = useMemo(() => (selModule ? selModule.schema.filter((f) => f.group !== "advanced") : []), [selModule]);
  const advanced = useMemo(() => (selModule ? selModule.schema.filter((f) => f.group === "advanced") : []), [selModule]);
  const missing = selModule ? selModule.schema.filter((f) => f.required && !String(sel.form[f.key] ?? "").trim()) : [];
  const instPorts = (inst) => ["ran_port", "core_port", "edge_port"].map((k) => inst.params?.[k]).filter(Boolean);

  if (!loggedIn) return <div className="set-forms"><p className="sys-note dim">{tr("mod.signIn")}</p></div>;

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
                      <td className="mod-ports">{instPorts(inst).map((p) => (
                        <span key={p} className={"mod-port " + (portLinks[p] === true ? "ok" : portLinks[p] === false ? "bad" : "")} title={portLinks[p] === true ? tr("mod.linkUp") : portLinks[p] === false ? tr("mod.linkDown") : ""}>{p}</span>))}</td>
                      <td className="dim">{inst.elements}</td>
                      <td className="mod-row-btns">
                        <button className="copy-btn" disabled={!m || inst.problems?.some((p) => /missing/.test(p))} onClick={() => startEdit(inst)}>{tr("mod.edit")}</button>
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
              <button key={m.type} className="add-btn" disabled={!canOperate} onClick={() => startNew(m)}>{tr("mod.addPrefix")}{L(m.name, lang)}</button>
            ))}
            {!canOperate && <span className="dim mod-ro">{tr("mod.readOnly")}</span>}
          </div>
        )}
        {notice && !sel && <p className={"set-hint " + (notice.kind === "ok" ? "ok" : "err")}>{notice.msg}</p>}
      </section>

      {sel && selModule && (
        <section className="sys-card wide mod-form-card">
          <h3 className="sys-card-title">{L(selModule.name, lang)} <span className="dim">{sel.id ? "#" + sel.id : tr("mod.new")}</span></h3>
          <p className="set-hint">{L(selModule.description, lang)}</p>
          <div className="mod-form">
            {basic.filter((f) => f.type !== "table").map((f) => (
              <Field key={f.key} f={f} value={sel.form[f.key]} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
            ))}
          </div>
          {basic.filter((f) => f.type === "table").map((f) => (
            <TableField key={f.key} f={f} rows={sel.form[f.key] || []} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
          ))}
          {advanced.length > 0 && (
            <div className="mod-advanced">
              <button className="link-btn" onClick={() => setAdvOpen((v) => !v)} aria-expanded={advOpen}>{advOpen ? "▾" : "▸"} {tr("mod.advanced")}</button>
              {advOpen && (<>
                <div className="mod-form">
                  {advanced.filter((f) => f.type !== "table").map((f) => (
                    <Field key={f.key} f={f} value={sel.form[f.key]} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
                  ))}
                </div>
                {advanced.filter((f) => f.type === "table").map((f) => (
                  <TableField key={f.key} f={f} rows={sel.form[f.key] || []} onChange={(v) => setField(f.key, v)} lang={lang} tr={tr} />
                ))}
              </>)}
            </div>
          )}

          {preview && (
            <div className="mod-preview">
              {preview.validate?.problems?.length > 0 && (
                <div className="set-hint err"><b>{tr("mod.problems")}</b>: {preview.validate.problems.map((p) => (p.where ? p.where + ": " : "") + p.msg).join("; ")}</div>)}
              {preview.warnings?.length > 0 && (
                <div className="set-hint warn"><b>{tr("mod.warnings")}</b>: {preview.warnings.join("; ")}</div>)}
              {(() => {
                const a = preview.args || {}; const keys = [...Object.keys(a.args || {}), ...Object.keys(a["in-tunnels"] || {}).map((k) => "in-tunnels/" + k)];
                return keys.length
                  ? <div className="set-hint"><b>{tr("mod.argsToChange")}</b>: {keys.map((k) => <code key={k}>{k}={String(k.startsWith("in-tunnels/") ? a["in-tunnels"][k.slice(11)] : a.args[k])} </code>)} <span className="dim">{tr("mod.argsRestart")}</span></div>
                  : <div className="set-hint ok">{tr("mod.argsNone")}</div>;
              })()}
              <div className="set-hint">{tr("mod.previewSummary").replace("{n}", String((preview.xml.match(/<!-- grism-module/g) || []).length)).replace("{ids}", preview.slot != null ? String(8000 + 100 * preview.slot + 1) + "+" : "")}{preview.replaces && " " + tr("mod.replaces")}</div>
              <button className="link-btn" onClick={() => setXmlOpen((v) => !v)}>{xmlOpen ? "▾" : "▸"} {tr("mod.xml")}</button>
              {xmlOpen && <pre className="mod-xml">{preview.xml}</pre>}
            </div>
          )}
          {notice && <p className={"set-hint " + (notice.kind === "ok" ? "ok" : "err")}>{notice.msg}</p>}
          {missing.length > 0 && <p className="set-hint dim">{tr("mod.missing")}: {missing.map((f) => L(f.label, lang)).join(", ")}</p>}
          <div className="set-actions">
            <button className="copy-btn" disabled={busy != null} onClick={() => { setSel(null); setPreview(null); setNotice(null); }}>{tr("mod.cancel")}</button>
            <button className="copy-btn" disabled={busy != null || missing.length > 0} onClick={doPreview}>{busy === "preview" ? tr("mod.previewing") : tr("mod.preview")}</button>
            <button className="sys-refresh" disabled={!canOperate || busy != null || missing.length > 0 || !preview || !preview.validate?.valid} onClick={doApply}>{busy === "apply" ? tr("mod.applying") : tr("mod.apply")}</button>
          </div>
        </section>
      )}
    </div>
  );
}
