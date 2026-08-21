import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import "./GrismStudio.css";

/* ===================== i18n (English / Traditional Chinese) =====================
   Lightweight dictionary. Covers the main navigation and common controls; add
   keys here to extend coverage. Missing keys fall back to English, then the key. */
const I18N = {
  en: {
    "tab.filters": "Filters", "tab.inputs": "Inputs", "tab.outputs": "Outputs",
    "tab.actions": "Actions", "tab.chain": "Chains", "tab.simulate": "Simulate",
    "tab.export": "Export", "tab.overview": "Overview",
    "nav.advanced": "advanced",
    "brand.tip": "Overview — what this configuration does",
    "btn.templates": "Templates", "btn.template_current": "Template",
    "btn.loadRunning": "load running config", "btn.loading": "loading…",
    "btn.loadFailed": "load failed — retry",
    "btn.login": "login", "btn.logout": "logout",
    "sync.dirty": "unapplied changes", "sync.synced": "in sync",
    "sync.dirtyTip": "The current config differs from what's running on the device",
    "sync.syncedTip": "In sync with the device",
    "health.issues": "issues", "health.issue": "issue",
    "health.warnings": "warnings", "health.warning": "warning", "health.valid": "valid",
    "theme.toDark": "Switch to dark mode", "theme.toLight": "Switch to light mode",
    "lang.toggle": "切換中文", "lang.name": "EN",
    "undo.tip": "Undo / redo edits on this tab", "undo.undo": "Undo (Ctrl/Cmd+Z)", "undo.redo": "Redo (Ctrl/Cmd+Shift+Z)",
    "user.signedIn": "Signed in", "btn.loadRunningTip": "Fetch and load the config currently running on the device",
    "btn.loginTip": "Sign in to the device", "btn.logoutTip": "Sign out of the device",
    "tmpl.tip": "Start from a ready-made configuration",
    "tmpl.lead": "Start from a working pattern. Applying a template loads its filters and chain into the document — then refine them in the other tabs.",
    "tmpl.apply": "Apply →",
    // Overview page
    "ov.title": "What this configuration does",
    "ov.loadedFrom": "Currently loaded from",
    "ov.src.running": "the device's running config",
    "ov.src.template": "the \"{name}\" template",
    "ov.src.manual": "a manually entered config",
    "ov.unit.filter": "filter", "ov.unit.filters": "filters",
    "ov.unit.chain": "chain", "ov.unit.chains": "chains",
    "ov.unit.port": "port", "ov.unit.ports": "ports",
    "ov.looksLike": "What this looks like", "ov.inferred": "inferred",
    "ov.inferNote": "This is a best-effort reading of the structure — the details below are exact.",
    "ov.filters": "Filters", "ov.chains": "Chains",
    "ov.noCondition": "(no condition)",
    "ov.editFilters": "edit filters →", "ov.editChains": "edit chains →",
    // chain flow labels
    "flow.in": "traffic in", "flow.match": "match", "flow.nomatch": "no match",
    "flow.forward": "forward", "flow.loadBalance": "load balance", "flow.duplicate": "duplicate",
    "flow.drop": "drop", "flow.all": "all", "flow.any": "any",
    // criterion connectors
    "crit.and": "AND", "crit.or": "OR", "crit.not": "NOT",
    "crit.matchAll": "(matches all)", "crit.matchAny": "(matches any)",
    // inferred intent
    "intent.bidir": "Bidirectional forwarding between {pairs} — traffic passes through in both directions.",
    "intent.lb": "Uses load balancing — matched traffic is spread across multiple ports, keeping each session on one port.",
    "intent.drop": "Some traffic is explicitly discarded (dropped).",
    "intent.heartbeat": "Watches a heartbeat target — when the heartbeat is missed, matching traffic is steered differently (a bypass/failover pattern).",
    "intent.web": "Inspects web traffic (HTTP/HTTPS) — likely steering or filtering by web service.",
    "intent.geo": "Filters by country (GeoIP).",
    "intent.ip": "Matches specific IP addresses — an allow/block list pattern.",
    // Export tab
    "ex.completeRun": "Complete <run>", "ex.editing": "editing",
    "ex.edit": "edit", "ex.copy": "copy", "ex.copied": "copied ✓",
    "ex.fixToCopy": "fix issues to copy", "ex.format": "format", "ex.cancel": "cancel",
    "ex.applyChanges": "apply changes",
    "ex.submit": "submit to device", "ex.fixToSubmit": "fix issues to submit",
    "ex.applying": "applying…", "ex.submitting": "submitting…", "ex.applied": "applied ✓", "ex.retrySubmit": "retry submit",
    "ex.applyingToDevice": "Applying to the device — please wait.",
    "ex.confirmTitle": "Submit to device?", "ex.confirmTitleTmpl": "⚠ Submit a template to the device?",
    "ex.confirmBody": "This will overwrite the device's running config and apply it live.",
    "ex.confirmBodyTmpl": "This configuration came straight from a template and may not be tuned for this device. Submitting will overwrite the device's running config and apply it live.",
    "ex.submitApply": "Submit and apply", "ex.submitAnyway": "I understand — submit anyway",
    "ex.overwriteDesc": "Overwrite and apply the running config on the device.",
    "ex.readyExport": "ready to export", "ex.canSubmit": "— can still submit",
    "ex.editHelp": "Edit the XML directly. Format tidies the indentation without changing anything. Apply changes parses it back in — every tab updates to match. Cancel discards your edits.",
    "ex.cantApply": "Couldn't apply", "ex.fixTryAgain": "Fix the XML and try again.",
    "ex.appliedWith": "Applied with", "ex.warningWord": "warning", "ex.warningsWord": "warnings",
    "ex.submitFailed": "Submit failed", "ex.checkSignedIn": "Check that you're signed in to the device and try again.",
    "ex.appliedLive": "Configuration applied — the device is now running",
    "ex.allValidate": "All filters and the chain validate. Edit the XML, copy it, or submit straight to the device.",
    "ex.issue": "issue", "ex.issues": "issues",
    // Simulate tab
    "sim.ingressPort": "Ingress port",
    "sim.filterResults": "Filter results",
    "sim.allNotMatch": "all not-match", "sim.allMatch": "all match",
    "sim.noFilters": "No filters referenced.",
    "sim.notDefined": "not defined in this config",
    "sim.play": "▶ play", "sim.pause": "⏸ pause", "sim.resume": "▶ resume", "sim.stop": "⏹ stop",
    "sim.playTip": "Animate a packet along the traced path", "sim.selectIngress": "Select an ingress port first",
    "sim.pauseTip": "Pause", "sim.resumeTip": "Resume", "sim.stopTip": "Stop",
    "sim.addInline": "+ inline device (IPS, etc.)",
    "sim.namePh": "name (e.g. IPS)", "sim.portA": "port A", "sim.portB": "port B",
    "sim.add": "add", "sim.cancel": "cancel",
    "sim.flipRows": "⇅ flip rows", "sim.flipTip": "Swap which ports sit on the top / bottom row",
    "sim.resizeTip": "Drag to resize the device panel",
    "sim.dragReposition": "Drag to reposition", "sim.remove": "Remove",
    "sim.loopTip": "LOOP interface — traffic returns on the same port",
    "sim.wiredTip": "wired to an inline device",
    "sim.roleBoth": "ingress + output", "sim.roleIn": "ingress", "sim.roleOut": "output", "sim.roleIdle": "unused",
    "sim.selectIngressOpt": "select ingress", "sim.noChain": "no chain",
    // shared / common
    "adv.badge": "Advanced",
    "adv.inputs": "Inputs replay pcap files or generate synthetic traffic. Most setups feed traffic from physical ports and won't need this.",
    "adv.outputs": "Outputs define reusable egress port rewrites and encapsulation (VXLAN/NVGRE). Basic forwarding is handled directly in Chains — you only need Outputs for packet modification.",
    "adv.actions": "Actions apply ingress packet processing or link-pair failover. Most setups don't need these.",
    "login.title": "Sign in to the device", "login.username": "Username", "login.password": "Password",
    "login.signingIn": "signing in…", "login.signIn": "Sign in",
    "confirm.discardTitle": "Discard current edits?",
    "common.delete": "Delete", "common.cancel": "Cancel", "common.optional": "optional",
    "common.name": "name", "common.type": "type", "common.id": "id",
    "common.addFilter": "+ Add filter", "common.newFilter": "+ New filter",
    "common.addInput": "+ Add input", "common.dupInput": "⧉ Duplicate input",
    "common.addOutput": "+ Add output", "common.dupOutput": "⧉ Duplicate output",
    "common.addAction": "+ Add action", "common.dupAction": "⧉ Duplicate action",
    "common.issuesIn": "issues in", "common.issueIn": "issue in", "common.valid": "valid",
    "confirm.discardBodyRunning": "Loading the running config replaces the whole document. Your current edits will be lost and undo history will be cleared.",
    "confirm.discardBodyTemplate": "Loading a template replaces the whole document. Your current edits will be lost and undo history will be cleared.",
    "confirm.discardLoad": "Discard and load",
    "confirm.replaceRunning": "Replace everything with the device's running config.",
    "confirm.replaceTemplate": "Replace everything with the template.",
    "banner.loadFailed": "Couldn't load running config",
    "banner.checkSignedIn": "Check you're signed in to the device.",
    "banner.someUnrecognised": "some elements weren't recognised and may need review.",
    "tmpl.modalTitle": "Start from a template",
    // filter editor
    "flt.unnamed": "unnamed", "flt.namePh": "e.g. block list",
    "flt.opAllMatch": "all must match", "flt.opAnyMatch": "any must match", "flt.opNotMatch": "must NOT match the item below",
    "flt.addCondition": "+ Condition", "flt.addGroup": "+ Group", "flt.addNot": "+ NOT",
    "flt.dupFilter": "⧉ Duplicate filter",
    "flt.existsNote": "exists — no value", "flt.signInList": "sign in to list targets",
    "flt.notExistsNote": "does not exist — no value",
    // inputs editor
    "in.outputPort": "Output port *", "in.source": "Source",
    "in.fileList": "file list", "in.scanDir": "scan directory",
    "in.filePaths": "File paths", "in.filePath": "file path",
    "in.maxFiles": "(max 100)", "in.remove": "remove",
    "in.scanDirLabel": "Scan directory", "in.afterReplay": "After replay", "in.moveTo": "Move played to",
    "in.helpGen": "Synthesise packets onto the port. Fill only the fields you need — empty ones aren't emitted.",
    "in.helpPcap": "Replay pcap files. A file path or a scan directory is required; other fields are optional.",
    "in.emptyMsg": "No inputs yet. An <input> replays pcap files or generates traffic onto a port.",
    "in.newInput": "+ New input",
    // outputs editor
    "out.emptyMsg": "No outputs yet. An <output> lets a chain rewrite or tag packets — reference it from a chain <out> as O1.",
    "out.newOutput": "+ New output", "out.port": "port *",
    "out.forwardNote": "This output just forwards unchanged. Add a modifier below to rewrite or tag packets.",
    "out.pAdd": "add modifier", "out.pReply": "ARP / ICMP reply", "out.pRedirect": "DNS response / redirect",
    "out.pMirror": "mirror to file", "out.pVxlan": "VXLAN encapsulation", "out.pNvgre": "NVGRE encapsulation",
    // actions editor
    "act.emptyMsg": "No actions yet. An <action> processes packets at ingress, or links two ports so one going down takes the other with it.",
    "act.newAction": "+ New action",
    "act.linkNote": "If one link goes down, the other is forced down too. Enter the two ports to bind.",
    "act.portA": "Port A", "act.portB": "Port B", "act.inputPort": "Input port *",
    "act.modNote": "Add a modifier below to strip, tag, re-VLAN, or answer ARP/ICMP for packets arriving on this port.",
    "act.addModifier": "add modifier",
    // chain editor
    "ch.inspector": "Inspector", "ch.selectNode": "Select a node to edit.",
    "ch.unspecified": "Unspecified", "ch.ingress": "Ingress", "ch.filter": "FILTER", "ch.discard": "Discard", "ch.output": "Output",
    "ch.ingressPorts": "Ingress ports", "ch.routeExplicitly": "Route explicitly",
    "ch.unsetNote": "No branch here — device default applies. No <next> is written.",
    "ch.filters": "Filter(s)", "ch.combine": "Combine",
    "ch.definedFilters": "defined filters", "ch.noFiltersDefined": "No filters defined yet.",
    "ch.insertKeepTest": "Insert filter above — keep this test on:",
    "ch.insertKeepOutput": "Insert filter above — keep this output on:",
    "ch.filterToMatch": "+ filter (this → match)", "ch.filterToNotmatch": "+ filter (this → notmatch)",
    "ch.removeTest": "Remove test → output",
    "ch.outputPorts": "Output ports", "ch.mode": "Mode", "ch.balanceBy": "Balance by",
    "ch.devicePorts": "device ports", "ch.portsDefault": "ports (default list)",
    "ch.definedOutputs": "defined outputs", "ch.deleteChain": "Delete this chain",
    "ch.filtersReferenced": "Filters referenced",
    "ch.vlanOp": "VLAN operation", "ch.vlanId": "VLAN id",
    "ch.advancedOp": "Advanced operation",
    "ch.dragReorder": "Drag to reorder", "ch.portConflict": "another chain uses this ingress port",
    "ch.removeBranch": "Remove {side} branch…",
    "ch.definedHere": "defined here", "ch.onDevice": "on device",
    "ch.addChain": "+ Add chain", "ch.dupChain": "⧉ Duplicate chain",
    "flt.validIn": "valid", "flt.issuesIn": "issues in", "flt.issueIn": "issue in",
  },
  "zh-TW": {
    "tab.filters": "篩選器", "tab.inputs": "輸入", "tab.outputs": "輸出",
    "tab.actions": "動作", "tab.chain": "鏈結", "tab.simulate": "模擬",
    "tab.export": "匯出", "tab.overview": "總覽",
    "nav.advanced": "進階",
    "brand.tip": "總覽 — 這份設定在做什麼",
    "btn.templates": "範本", "btn.template_current": "範本",
    "btn.loadRunning": "載入執行中設定", "btn.loading": "載入中…",
    "btn.loadFailed": "載入失敗 — 重試",
    "btn.login": "登入", "btn.logout": "登出",
    "sync.dirty": "尚未套用的變更", "sync.synced": "已同步",
    "sync.dirtyTip": "目前設定與裝置執行中的設定不同",
    "sync.syncedTip": "與裝置同步中",
    "health.issues": "個問題", "health.issue": "個問題",
    "health.warnings": "個警告", "health.warning": "個警告", "health.valid": "有效",
    "theme.toDark": "切換到夜間模式", "theme.toLight": "切換到日間模式",
    "lang.toggle": "Switch to English", "lang.name": "繁",
    "undo.tip": "復原 / 重做此分頁的編輯", "undo.undo": "復原 (Ctrl/Cmd+Z)", "undo.redo": "重做 (Ctrl/Cmd+Shift+Z)",
    "user.signedIn": "已登入", "btn.loadRunningTip": "抓取並載入裝置目前執行中的設定",
    "btn.loginTip": "登入裝置", "btn.logoutTip": "登出裝置",
    "tmpl.tip": "從現成的設定範本開始",
    "tmpl.lead": "從一個可用的範例開始。套用範本會把它的篩選器和鏈結載入到文件中,再到其他分頁調整。",
    "tmpl.apply": "套用 →",
    // Overview page
    "ov.title": "這份設定在做什麼",
    "ov.loadedFrom": "目前載入自",
    "ov.src.running": "裝置執行中的設定",
    "ov.src.template": "「{name}」範本",
    "ov.src.manual": "手動輸入的設定",
    "ov.unit.filter": "個篩選器", "ov.unit.filters": "個篩選器",
    "ov.unit.chain": "條鏈結", "ov.unit.chains": "條鏈結",
    "ov.unit.port": "個埠", "ov.unit.ports": "個埠",
    "ov.looksLike": "推測用途", "ov.inferred": "推測",
    "ov.inferNote": "這是根據結構的推測 — 下方的明細才是精確的。",
    "ov.filters": "篩選器", "ov.chains": "鏈結",
    "ov.noCondition": "(無條件)",
    "ov.editFilters": "編輯篩選器 →", "ov.editChains": "編輯鏈結 →",
    // chain flow labels
    "flow.in": "流量進入", "flow.match": "符合", "flow.nomatch": "不符合",
    "flow.forward": "轉發", "flow.loadBalance": "負載平衡", "flow.duplicate": "複製",
    "flow.drop": "丟棄", "flow.all": "全部", "flow.any": "任一",
    // criterion connectors
    "crit.and": "且", "crit.or": "或", "crit.not": "非",
    "crit.matchAll": "(全部符合)", "crit.matchAny": "(任一符合)",
    // inferred intent
    "intent.bidir": "在 {pairs} 之間雙向轉發 — 流量雙向通過。",
    "intent.lb": "使用負載平衡 — 符合的流量分散到多個埠,同一連線維持在同一埠。",
    "intent.drop": "部分流量被明確丟棄。",
    "intent.heartbeat": "監看 heartbeat 目標 — 當 heartbeat 中斷時,符合的流量會改走不同路徑(bypass/failover 模式)。",
    "intent.web": "檢查網頁流量(HTTP/HTTPS)— 可能依網頁服務分流或過濾。",
    "intent.geo": "依國家過濾(GeoIP)。",
    "intent.ip": "比對特定 IP 位址 — allow/block 清單模式。",
    // Export tab
    "ex.completeRun": "完整 <run>", "ex.editing": "編輯中",
    "ex.edit": "編輯", "ex.copy": "複製", "ex.copied": "已複製 ✓",
    "ex.fixToCopy": "修正問題才能複製", "ex.format": "格式化", "ex.cancel": "取消",
    "ex.applyChanges": "套用變更",
    "ex.submit": "提交到裝置", "ex.fixToSubmit": "修正問題才能提交",
    "ex.applying": "套用中…", "ex.submitting": "提交中…", "ex.applied": "已套用 ✓", "ex.retrySubmit": "重試提交",
    "ex.applyingToDevice": "正在套用到裝置 — 請稍候。",
    "ex.confirmTitle": "提交到裝置?", "ex.confirmTitleTmpl": "⚠ 要把範本提交到裝置?",
    "ex.confirmBody": "這會覆蓋裝置執行中的設定並即時套用。",
    "ex.confirmBodyTmpl": "這份設定直接來自範本,可能未針對此裝置調整。提交將覆蓋裝置執行中的設定並即時套用。",
    "ex.submitApply": "提交並套用", "ex.submitAnyway": "我了解 — 仍要提交",
    "ex.overwriteDesc": "覆蓋並套用裝置上執行中的設定。",
    "ex.readyExport": "可以匯出", "ex.canSubmit": "— 仍可提交",
    "ex.editHelp": "直接編輯 XML。格式化會整理縮排但不改內容。套用變更會把它解析回來 — 每個分頁都會同步更新。取消則放棄編輯。",
    "ex.cantApply": "無法套用", "ex.fixTryAgain": "修正 XML 後再試。",
    "ex.appliedWith": "套用完成,含", "ex.warningWord": "個警告", "ex.warningsWord": "個警告",
    "ex.submitFailed": "提交失敗", "ex.checkSignedIn": "確認已登入裝置後再試。",
    "ex.appliedLive": "設定已套用 — 裝置現在執行的是",
    "ex.allValidate": "所有篩選器與鏈結都通過驗證。可編輯 XML、複製它,或直接提交到裝置。",
    "ex.issue": "個問題", "ex.issues": "個問題",
    // Simulate tab
    "sim.ingressPort": "入口埠",
    "sim.filterResults": "篩選結果",
    "sim.allNotMatch": "全部不符合", "sim.allMatch": "全部符合",
    "sim.noFilters": "沒有引用任何篩選器。",
    "sim.notDefined": "此設定中未定義",
    "sim.play": "▶ 播放", "sim.pause": "⏸ 暫停", "sim.resume": "▶ 繼續", "sim.stop": "⏹ 停止",
    "sim.playTip": "沿追蹤路徑動畫呈現封包", "sim.selectIngress": "請先選擇入口埠",
    "sim.pauseTip": "暫停", "sim.resumeTip": "繼續", "sim.stopTip": "停止",
    "sim.addInline": "+ inline 裝置(IPS 等)",
    "sim.namePh": "名稱(例如 IPS)", "sim.portA": "埠 A", "sim.portB": "埠 B",
    "sim.add": "新增", "sim.cancel": "取消",
    "sim.flipRows": "⇅ 翻轉列", "sim.flipTip": "交換上/下排的埠",
    "sim.resizeTip": "拖曳以調整裝置面板大小",
    "sim.dragReposition": "拖曳以移動位置", "sim.remove": "移除",
    "sim.loopTip": "LOOP 介面 — 流量從同一埠返回",
    "sim.wiredTip": "已接到 inline 裝置",
    "sim.roleBoth": "入口 + 輸出", "sim.roleIn": "入口", "sim.roleOut": "輸出", "sim.roleIdle": "未使用",
    "sim.selectIngressOpt": "選擇入口埠", "sim.noChain": "無 chain",
    // shared / common
    "adv.badge": "進階",
    "adv.inputs": "Inputs 重播 pcap 檔或產生合成流量。大多數設定從實體埠餵入流量,不需要用到這個。",
    "adv.outputs": "Outputs 定義可重複使用的出口埠改寫與封裝(VXLAN/NVGRE)。基本轉發直接在 Chains 處理 — 只有需要改封包時才用 Outputs。",
    "adv.actions": "Actions 套用入口封包處理或 link-pair failover。大多數設定不需要這些。",
    "login.title": "登入裝置", "login.username": "帳號", "login.password": "密碼",
    "login.signingIn": "登入中…", "login.signIn": "登入",
    "confirm.discardTitle": "放棄目前的編輯?",
    "common.delete": "刪除", "common.cancel": "取消", "common.optional": "選填",
    "common.name": "名稱", "common.type": "類型", "common.id": "id",
    "common.addFilter": "+ 新增篩選器", "common.newFilter": "+ 新篩選器",
    "common.addInput": "+ 新增 input", "common.dupInput": "⧉ 複製 input",
    "common.addOutput": "+ 新增 output", "common.dupOutput": "⧉ 複製 output",
    "common.addAction": "+ 新增 action", "common.dupAction": "⧉ 複製 action",
    "common.issuesIn": "個問題於", "common.issueIn": "個問題於", "common.valid": "有效",
    "confirm.discardBodyRunning": "載入執行中設定會取代整份文件。目前的編輯會遺失,復原紀錄也會清除。",
    "confirm.discardBodyTemplate": "載入範本會取代整份文件。目前的編輯會遺失,復原紀錄也會清除。",
    "confirm.discardLoad": "放棄並載入",
    "confirm.replaceRunning": "以裝置執行中的設定取代全部。",
    "confirm.replaceTemplate": "以範本取代全部。",
    "banner.loadFailed": "無法載入執行中設定",
    "banner.checkSignedIn": "請確認已登入裝置。",
    "banner.someUnrecognised": "部分元素無法辨識,可能需要檢查。",
    "tmpl.modalTitle": "從範本開始",
    // filter editor
    "flt.unnamed": "未命名", "flt.namePh": "例如 block list",
    "flt.opAllMatch": "全部都要符合", "flt.opAnyMatch": "任一符合即可", "flt.opNotMatch": "下方項目必須「不」符合",
    "flt.addCondition": "+ 條件", "flt.addGroup": "+ 群組", "flt.addNot": "+ NOT",
    "flt.dupFilter": "⧉ 複製篩選器",
    "flt.existsNote": "存在即符合 — 不需值", "flt.signInList": "登入以列出目標",
    "flt.notExistsNote": "不存在即符合 — 不需值",
    // inputs editor
    "in.outputPort": "輸出埠 *", "in.source": "來源",
    "in.fileList": "檔案清單", "in.scanDir": "掃描目錄",
    "in.filePaths": "檔案路徑", "in.filePath": "檔案路徑",
    "in.maxFiles": "(上限 100)", "in.remove": "移除",
    "in.scanDirLabel": "掃描目錄", "in.afterReplay": "重播後", "in.moveTo": "已播檔移至",
    "in.helpGen": "在埠上合成封包。只需填你要的欄位 — 空的不會輸出。",
    "in.helpPcap": "重播 pcap 檔。需要檔案路徑或掃描目錄;其他欄位選填。",
    "in.emptyMsg": "尚無 input。<input> 會重播 pcap 檔或在埠上產生流量。",
    "in.newInput": "+ 新 input",
    // outputs editor
    "out.emptyMsg": "尚無 output。<output> 讓鏈結改寫或標記封包 — 在鏈結的 <out> 以 O1 引用。",
    "out.newOutput": "+ 新 output", "out.port": "埠 *",
    "out.forwardNote": "此 output 只是原樣轉發。在下方新增 modifier 以改寫或標記封包。",
    "out.pAdd": "新增 modifier", "out.pReply": "ARP / ICMP 回應", "out.pRedirect": "DNS 回應 / 重導向",
    "out.pMirror": "鏡像到檔案", "out.pVxlan": "VXLAN 封裝", "out.pNvgre": "NVGRE 封裝",
    // actions editor
    "act.emptyMsg": "尚無 action。<action> 在入口處理封包,或連結兩個埠使其一斷線時另一個也強制斷線。",
    "act.newAction": "+ 新 action",
    "act.linkNote": "一條連線斷線時,另一條也會被強制斷線。輸入要綁定的兩個埠。",
    "act.portA": "埠 A", "act.portB": "埠 B", "act.inputPort": "輸入埠 *",
    "act.modNote": "在下方新增 modifier,對此埠進來的封包進行移除、標記、重設 VLAN,或回應 ARP/ICMP。",
    "act.addModifier": "新增 modifier",
    // chain editor
    "ch.inspector": "檢視器", "ch.selectNode": "選擇一個節點來編輯。",
    "ch.unspecified": "未指定", "ch.ingress": "入口", "ch.filter": "篩選", "ch.discard": "丟棄", "ch.output": "輸出",
    "ch.ingressPorts": "入口埠", "ch.routeExplicitly": "明確指定路由",
    "ch.unsetNote": "此處沒有分支 — 套用裝置預設。不會寫出 <next>。",
    "ch.filters": "篩選器", "ch.combine": "組合方式",
    "ch.definedFilters": "已定義的篩選器", "ch.noFiltersDefined": "尚未定義任何篩選器。",
    "ch.insertKeepTest": "在上方插入篩選器 — 將此測試保留在:",
    "ch.insertKeepOutput": "在上方插入篩選器 — 將此輸出保留在:",
    "ch.filterToMatch": "+ 篩選器(此 → 符合)", "ch.filterToNotmatch": "+ 篩選器(此 → 不符合)",
    "ch.removeTest": "移除測試 → 輸出",
    "ch.outputPorts": "輸出埠", "ch.mode": "模式", "ch.balanceBy": "分流依據",
    "ch.devicePorts": "裝置埠", "ch.portsDefault": "埠(預設清單)",
    "ch.definedOutputs": "已定義的 output", "ch.deleteChain": "刪除此鏈結",
    "ch.filtersReferenced": "引用的篩選器",
    "ch.vlanOp": "VLAN 操作", "ch.vlanId": "VLAN id",
    "ch.advancedOp": "進階操作",
    "ch.dragReorder": "拖曳以重新排序", "ch.portConflict": "另一條鏈結使用了此入口埠",
    "ch.removeBranch": "移除{side}分支…",
    "ch.definedHere": "在此定義", "ch.onDevice": "在裝置上",
    "ch.addChain": "+ 新增鏈結", "ch.dupChain": "⧉ 複製鏈結",
    "flt.validIn": "有效", "flt.issuesIn": "個問題於", "flt.issueIn": "個問題於",
  },
};
const makeT = (lang) => (key) => (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;

/* ============================================================
   GRISM XML Studio (integrated prototype)
   One app, one document model, three workspaces:
     • Templates — start from a known-good pattern
     • Filters   — define F1, F2… as recursive boolean trees
     • Chain     — wire ingress → filter tests → outputs
   Everything writes to a single `doc`; Export renders the whole
   <run>. Filter ids defined in Filters flow into Chain, so the
   chain knows which references are local vs device-side.
   ============================================================ */

/* ===================== shared ids / helpers ===================== */
let _id = 0;
const nid = () => `n${++_id}`;
const esc = (s) => String(s).replace(/[<>&"]/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const splitList = (s) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
// Deep-clone a model object for duplication, regenerating any internal node
// "id" fields (the n… keys used for tree/mod identity) so the copy shares no
// references with the original. The top-level element id/cid is set separately.
function cloneForDup(obj) {
  if (Array.isArray(obj)) return obj.map(cloneForDup);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === "id" && typeof val === "string" && /^n\d+$/.test(val)) out[key] = nid();
      else out[key] = cloneForDup(val);
    }
    return out;
  }
  return obj;
}

/* ===================== field catalogue =====================
   Complete GRISM <find> name list, transcribed from the official
   find.md. `kind` drives which relations are offered and how the
   value is validated. exists = boolean presence check (no value). */
const FIELDS = [
  { g: "Ethernet / VLAN", items: [
    { v: "eth.addr", label: "MAC (src or dst)", kind: "mac" },
    { v: "eth.src", label: "Source MAC", kind: "mac" },
    { v: "eth.dst", label: "Destination MAC", kind: "mac" },
    { v: "eth.type", label: "EtherType", kind: "uint16" },
    { v: "vlan.id", label: "VLAN ID", kind: "vlan" },
    { v: "vlan.l2.id", label: "VLAN layer-2 ID", kind: "vlan" },
    { v: "vlan.priority", label: "VLAN priority", kind: "uint8" },
  ]},
  { g: "IPv4", items: [
    { v: "ip", label: "is IPv4", kind: "exists" },
    { v: "ip.addr", label: "IP (src or dst)", kind: "ip" },
    { v: "ip.src", label: "Source IP", kind: "ip" },
    { v: "ip.dst", label: "Destination IP", kind: "ip" },
    { v: "ip.proto", label: "IP protocol", kind: "uint8" },
    { v: "ip.fragment", label: "is IPv4 fragment", kind: "exists" },
    { v: "ip.flags.df", label: "don't-fragment flag", kind: "bit" },
    { v: "ip.flags.mf", label: "more-fragment flag", kind: "bit" },
    { v: "ip.dsfield", label: "DiffServ field", kind: "uint8" },
  ]},
  { g: "IPv6", items: [
    { v: "ipv6", label: "is IPv6", kind: "exists" },
    { v: "ipv6.addr", label: "IPv6 (src or dst)", kind: "ipv6" },
    { v: "ipv6.src", label: "Source IPv6", kind: "ipv6" },
    { v: "ipv6.dst", label: "Destination IPv6", kind: "ipv6" },
    { v: "ipv6.nxt", label: "Next header", kind: "uint8" },
  ]},
  { g: "TCP", items: [
    { v: "tcp", label: "is TCP", kind: "exists" },
    { v: "tcp.port", label: "TCP port (src or dst)", kind: "port" },
    { v: "tcp.srcport", label: "TCP source port", kind: "port" },
    { v: "tcp.dstport", label: "TCP dest port", kind: "port" },
    { v: "tcp.flags.syn", label: "TCP SYN", kind: "bit" },
    { v: "tcp.flags.ack", label: "TCP ACK", kind: "bit" },
    { v: "tcp.flags.fin", label: "TCP FIN", kind: "bit" },
    { v: "tcp.flags.reset", label: "TCP RST", kind: "bit" },
  ]},
  { g: "UDP / SCTP", items: [
    { v: "udp", label: "is UDP", kind: "exists" },
    { v: "udp.port", label: "UDP port (src or dst)", kind: "port" },
    { v: "udp.srcport", label: "UDP source port", kind: "port" },
    { v: "udp.dstport", label: "UDP dest port", kind: "port" },
    { v: "sctp", label: "is SCTP", kind: "exists" },
    { v: "sctp.port", label: "SCTP port (src or dst)", kind: "port" },
    { v: "sctp.srcport", label: "SCTP source port", kind: "port" },
    { v: "sctp.dstport", label: "SCTP dest port", kind: "port" },
    { v: "5-tuple", label: "5-tuple (sip dip proto sp dp)", kind: "tuple" },
  ]},
  { g: "GTP", items: [
    { v: "gtp.cp", label: "GTP control plane", kind: "exists" },
    { v: "gtp.data", label: "GTP data", kind: "exists" },
    { v: "gtp.imsi", label: "GTP IMSI", kind: "str" },
    { v: "gtp.teid", label: "GTP TEID", kind: "str" },
    { v: "ip.addr.related.gtp.imsi", label: "IP related to GTP IMSI", kind: "str" },
  ]},
  { g: "Tunnels", items: [
    { v: "gre", label: "is GRE", kind: "exists" },
    { v: "vxlan", label: "is VXLAN", kind: "exists" },
    { v: "vxlan.vni", label: "VXLAN VNI", kind: "uint24" },
    { v: "erspan.spanid", label: "ERSPAN ID", kind: "num" },
  ]},
  { g: "VoIP", items: [
    { v: "voip", label: "is SIP or RTP", kind: "exists" },
    { v: "voip.account", label: "VoIP account", kind: "str" },
    { v: "voip.from", label: "VoIP from", kind: "str" },
    { v: "voip.to", label: "VoIP to", kind: "str" },
  ]},
  { g: "DNS", items: [
    { v: "dns.a", label: "DNS type-A address", kind: "ip" },
    { v: "dns.flags.response", label: "DNS response flag", kind: "bit" },
    { v: "dns.count.add_rr", label: "DNS additional RR count", kind: "num" },
    { v: "dns.qry.type", label: "DNS query type", kind: "num" },
    { v: "dns.qry.name", label: "DNS query name", kind: "str" },
    { v: "dns.qry.name_public_suffix", label: "DNS query public suffix", kind: "str" },
    { v: "dns.qry.name.resp.ip.addr", label: "DNS name → response IP", kind: "str" },
  ]},
  { g: "HTTP", items: [
    { v: "http", label: "is HTTP", kind: "exists" },
    { v: "http.request", label: "is HTTP request", kind: "exists" },
    { v: "http.host", label: "HTTP host", kind: "str" },
    { v: "http.request.uri", label: "HTTP request URI", kind: "str" },
    { v: "http.request.method", label: "HTTP method", kind: "str" },
    { v: "http.request.url", label: "HTTP request URL", kind: "str" },
  ]},
  { g: "TLS / SSL", items: [
    { v: "ssl", label: "is SSL", kind: "exists" },
    { v: "ssl.server_name", label: "TLS server name (SNI)", kind: "str" },
    { v: "ssl.server_name_public_suffix", label: "TLS SNI public suffix", kind: "str" },
    { v: "ssl.handshake.type", label: "TLS handshake type", kind: "bit" },
    { v: "ssl.ja3_digest", label: "TLS JA3 digest", kind: "str" },
    { v: "ssl.ja3s_digest", label: "TLS JA3S digest", kind: "str" },
  ]},
  { g: "ARP / FTP", items: [
    { v: "arp", label: "is ARP", kind: "exists" },
    { v: "arp.request", label: "is ARP request", kind: "exists" },
    { v: "arp.reply", label: "is ARP reply", kind: "exists" },
    { v: "arp.request.target.ip", label: "ARP target IP", kind: "ip" },
    { v: "arp.request.sender.ip", label: "ARP sender IP", kind: "ip" },
    { v: "ftp", label: "is FTP", kind: "exists" },
  ]},
  { g: "ICMP", items: [
    { v: "icmp", label: "is ICMP", kind: "exists" },
    { v: "icmp.type", label: "ICMP type", kind: "num" },
    { v: "icmp.code", label: "ICMP code", kind: "num" },
  ]},
  { g: "Meta / flow / system", items: [
    { v: "regex", label: "Regular expression", kind: "regex" },
    { v: "country.iso_code", label: "Country ISO code", kind: "country" },
    { v: "packet.len", label: "Packet length", kind: "num" },
    { v: "grism.srcport", label: "Ingress port", kind: "grismport" },
    { v: "grism.port.linkdown", label: "Port link down", kind: "grismport" },
    { v: "session.packet.nth", label: "Nth packet in flow", kind: "num" },
    { v: "heartbeat.target.miss.id", label: "Heartbeat miss (target id)", kind: "num" },
    { v: "flowtable.matched.fid", label: "Flow matched filter id", kind: "fidref" },
    { v: "flowtable.inport", label: "Flow ingress port", kind: "grismport" },
    { v: "dstmac.in.l2gre.mapping.table", label: "dstMAC in l2gre table", kind: "exists" },
    { v: "dstmac.in.vxlan.mapping.table", label: "dstMAC in vxlan table", kind: "exists" },
    { v: "dstip.in.dns.response.ip.table", label: "dstIP in DNS response table", kind: "exists" },
  ]},
];
const FIELD_INDEX = Object.fromEntries(FIELDS.flatMap((g) => g.items.map((i) => [i.v, i])));

const RELS = {
  exists: ["==","!="], num: ["==","!=",">=","<="], uint8: ["==","!=",">=","<="],
  uint16: ["==","!=",">=","<="], uint24: ["==","!=",">=","<="], port: ["==","!=",">=","<="],
  vlan: ["==","!=",">=","<="], bit: ["==","!="],
  default: ["==","!="],
};
const relationsFor = (k) => RELS[k] ?? RELS.default;

const VAL = {
  mac: (s) => /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(s) ? null : "MAC expected",
  ip: (s) => /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)(\/([0-9]|[12]\d|3[0-2]))?$/.test(s) ? null : "IPv4 or CIDR",
  ipv6: (s) => /^[0-9A-Fa-f:]+(\/\d{1,3})?$/.test(s) && s.includes(":") ? null : "IPv6 address",
  port: (s) => /^\d+$/.test(s) && +s <= 65535 ? null : "Port 0–65535",
  vlan: (s) => /^\d+$/.test(s) && +s >= 1 && +s <= 4094 ? null : "VLAN 1–4094",
  uint8: (s) => /^\d+$/.test(s) && +s <= 255 ? null : "0–255",
  uint16: (s) => /^\d+$/.test(s) && +s <= 65535 ? null : "0–65535",
  uint24: (s) => /^\d+$/.test(s) && +s <= 16777215 ? null : "0–16777215",
  bit: (s) => s === "0" || s === "1" ? null : "0 or 1",
  num: (s) => /^\d+$/.test(s) ? null : "Number",
  int: (s) => /^-?\d+$/.test(s) ? null : "Integer",
  country: (s) => /^[A-Za-z]{2}$/.test(s) ? null : "ISO code, e.g. TW",
  grismport: (s) => /^[A-Z]\d+$/.test(s) ? null : "Port, e.g. P0",
  fidref: (s) => /^F\d+$/.test(s) ? null : "Filter id, e.g. F1",
  tuple: (s) => s.trim().split(/\s+/).length === 5 ? null : "5 fields: sip dip proto sp dp (- = any)",
  str: (s) => s && s.length ? null : "Required",
  regex: (s) => s && s.length ? null : "Pattern required",
  exists: () => null,
};
const validate = (k, v) => (VAL[k] ?? VAL.str)(v ?? "");
const ph = (k) => ({ ip:"8.8.8.8", ipv6:"2001:db8::1", mac:"12:34:56:78:9a:bc", port:"443",
  vlan:"100", uint8:"6", uint16:"2048", uint24:"1", bit:"1", country:"TW", num:"500",
  grismport:"P0", fidref:"F1", tuple:"- 192.168.1.203 - - 443", regex:"\\x08facebook\\x03com" }[k] ?? "value");

/* ===================== filter (boolean tree) model ===================== */
const mkFind = () => ({ id: nid(), t: "find", field: "ip.addr", rel: "==", val: "" });
const mkGroup = (op) => ({ id: nid(), t: op, children: [mkFind()] });
const mkNot = () => ({ id: nid(), t: "not", children: [mkFind()] });

function tUpdate(node, id, fn) {
  if (node.id === id) return fn(node);
  if (!node.children) return node;
  let ch = false;
  const kids = node.children.map((c) => { const u = tUpdate(c, id, fn); if (u !== c) ch = true; return u; });
  return ch ? { ...node, children: kids } : node;
}
function tRemove(node, id) {
  if (!node.children) return node;
  return { ...node, children: node.children.filter((c) => c.id !== id).map((c) => tRemove(c, id)) };
}
function serializeCriterion(node, depth) {
  const pad = "  ".repeat(depth);
  if (node.t === "find") {
    // every find emits relation + content; exists-type fields carry an empty
    // content ("") since they have no value.
    const kind = FIELD_INDEX[node.field]?.kind ?? "str";
    const rel = node.rel || "==";
    const val = kind === "exists" ? "" : node.val;
    return `${pad}<find name="${node.field}" relation="${rel}" content="${esc(val)}" />`;
  }
  const inner = (node.children ?? []).map((c) => serializeCriterion(c, depth + 1)).join("\n");
  return `${pad}<${node.t}>\n${inner}\n${pad}</${node.t}>`;
}
function serializeFilter(f) {
  const fa = f.fattrs ?? {};
  const attrs = [`id="${f.id}"`, f.name ? `name="${esc(f.name)}"` : null,
    f.alt ? `alt="${esc(f.alt)}"` : null,
    `sessionBase="${f.sessionBase}"`,
    f.matchedlog === "yes" ? `matchedlog="yes"` : null,
    (fa.masking && fa.masking !== "no") ? `masking="${esc(fa.masking)}"` : null,
    fa.maxPackets ? `maxPackets="${esc(fa.maxPackets)}"` : null,
    fa.tuple5_live_hashtable_size ? `tuple5_live_hashtable_size="${esc(fa.tuple5_live_hashtable_size)}"` : null,
    fa.start ? `start="${esc(fa.start)}"` : null,
    fa.position ? `position="${esc(fa.position)}"` : null,
    fa.within ? `within="${esc(fa.within)}"` : null,
    fa.mpslog ? `mpslog="${esc(fa.mpslog)}"` : null,
    f.blockifempty === "yes" ? `blockifempty="yes"` : null].filter(Boolean).join(" ");
  return `<filter ${attrs}>\n${serializeCriterion(f.root, 1)}\n</filter>`;
}

/* ===================== human-readable summary (Overview page) ===================== */
// A short readable description of a filter's boolean tree, e.g.
// "TCP port == 443 OR UDP port == 443" or "country == CN,RU AND NOT (ip == …)".
function describeCriterion(node, t) {
  const tr = t || ((k) => ({ "crit.and": "AND", "crit.or": "OR", "crit.not": "NOT", "crit.matchAll": "(matches all)", "crit.matchAny": "(matches any)" }[k] || k));
  if (!node) return "";
  if (node.t === "find") {
    const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
    const label = f?.label ?? node.field;
    if (kind === "exists") return label;
    return `${label} ${node.rel || "=="} ${node.val || "?"}`;
  }
  const AND = tr("crit.and"), OR = tr("crit.or");
  const kids = (node.children ?? []).map((c) => describeCriterion(c, t)).filter(Boolean);
  if (node.t === "not") return `${tr("crit.not")} (${kids.join(", ")})`;
  if (!kids.length) return node.t === "and" ? tr("crit.matchAll") : tr("crit.matchAny");
  const joiner = node.t === "and" ? ` ${AND} ` : ` ${OR} `;
  return kids.length > 1 ? kids.map((k) => (k.includes(` ${AND} `) || k.includes(` ${OR} `) ? `(${k})` : k)).join(joiner) : kids[0];
}
// Flatten a chain's decision tree into readable routing rules, e.g.
// [{ test: "F1", match: "P1", notmatch: "(next)" }, …] plus a terminal.
// Turn a chain's decision tree into a structure the Overview can lay out. Returns
// { root } where each test node is { id, test, op, match, notmatch } and each side
// is one of: { kind:"ports", ports, mode }, { kind:"drop" }, { kind:"default" },
// or { kind:"test", node } (the side continues into another filter test).
let _cfid = 0;
function summarizeChain(tree) {
  const build = (node) => {
    if (!node || node.t === "__unset__") return { kind: "default" };
    if (node.t === "out") return node.ports === "0" ? { kind: "drop" } : { kind: "ports", ports: node.ports, mode: node.mode };
    if (node.t === "branch") {
      return { kind: "test", node: {
        id: "t" + (++_cfid),
        test: node.fids || "?", op: node.fidOp || "or",
        match: build(node.match), notmatch: build(node.notmatch),
      } };
    }
    return { kind: "default" };
  };
  const top = build(tree);
  // a chain whose root is a plain output (pure forward) → no tests
  if (top.kind !== "test") return { root: null, terminal: top };
  return { root: top.node, terminal: null };
}
// Flat list kept for the text summary / port collection (order of tests).
function summarizeChainTree(tree) {
  const rules = [];
  (function walk(node) {
    if (!node || node.t === "__unset__") return;
    if (node.t === "out") { rules.push({ terminal: node.ports === "0" ? "drop" : node.ports, terminalMode: node.mode }); return; }
    if (node.t === "branch") {
      const m = node.match, n = node.notmatch;
      const sideText = (s) => !s || s.t === "__unset__" ? "device default" : s.t === "out" ? (s.ports === "0" ? "drop" : s.ports) : "→ next test";
      const sideMode = (s) => s && s.t === "out" ? s.mode : null;
      rules.push({ test: node.fids || "?", op: node.fidOp || "or", match: sideText(m), matchMode: sideMode(m), notmatch: sideText(n), notmatchMode: sideMode(n) });
      if (m && m.t === "branch") walk(m);
      if (n && n.t === "branch") walk(n);
    }
  })(tree);
  return rules;
}
// Whole-document overview: counts, per-filter conditions, per-chain routing, ports used.
function describeDoc(doc, t) {
  const filters = (doc.filters ?? []).map((f) => ({ id: "F" + f.id, name: f.name || f.alt || "", cond: describeCriterion(f.root, t) }));
  const filterNames = Object.fromEntries(filters.map((f) => [f.id, f.name]));
  const chains = (doc.chains ?? []).map((c) => ({ ingress: c.ports || "P0", rules: summarizeChainTree(c.tree), flow: summarizeChain(c.tree) }));
  const portSet = new Set();
  chains.forEach((c) => {
    (c.ingress || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => portSet.add(p));
    c.rules.forEach((r) => { [r.match, r.notmatch, r.terminal].filter(Boolean).forEach((v) => { if (/^[PVLO]?\d/.test(v)) v.split(",").map((s) => s.trim()).forEach((p) => portSet.add(p)); }); });
  });
  const ports = [...portSet].filter((p) => /^[A-Za-z]*\d+$/.test(p)).sort();
  return {
    counts: { filters: filters.length, chains: chains.length, ports: ports.length },
    ports, filters, filterNames, chains,
  };
}
// Resolve a fids expression (e.g. "F1", "F1,!F3") to a readable name string
// using the filter-name map, for chain-flow labels. Falls back to the raw id.
function fidsLabel(fids, names) {
  const toks = String(fids || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!toks.length) return fids || "?";
  const parts = toks.map((tok) => {
    const neg = tok.startsWith("!"); const id = tok.replace(/^!/, "");
    const nm = names[id];
    return (neg ? "!" : "") + id + (nm ? ` ${nm}` : "");
  });
  return parts.join(", ");
}
// Just the filter name(s) for a fids expression (no ids), for the flow-diagram
// name line. Returns "" when none of the referenced filters have a name.
function namesOnly(fids, names) {
  const toks = String(fids || "").split(",").map((s) => s.trim()).filter(Boolean);
  const nm = toks.map((tok) => { const neg = tok.startsWith("!"); const id = tok.replace(/^!/, ""); const n = names[id]; return n ? (neg ? "not " : "") + n : ""; }).filter(Boolean);
  return nm.join(", ");
}
// Used for running configs and pasted XML where there's no authored description.
// Returns an array of short observation strings.
function inferIntent(doc, t) {
  const tr = t || ((k) => k);
  const out = [];
  const chains = doc.chains ?? [];
  const filters = doc.filters ?? [];
  if (!chains.length) return out;
  // map ingress -> set of destination ports (terminal + branch outs)
  const dests = (tree) => { const s = new Set(); (function w(n){ if(!n||n.t==="__unset__")return; if(n.t==="out"){ if(n.ports&&n.ports!=="0") n.ports.split(",").forEach((p)=>s.add(p.trim())); return; } if(n.t==="branch"){ w(n.match); w(n.notmatch); } })(tree); return s; };
  const ingressOf = (c) => (c.ports||"").split(",").map((s)=>s.trim()).filter(Boolean);
  // detect bidirectional pairs: chain A: X->…->Y and chain B: Y->…->X
  const pairs = [];
  for (let i = 0; i < chains.length; i++) for (let j = i + 1; j < chains.length; j++) {
    const ai = ingressOf(chains[i]), aj = ingressOf(chains[j]);
    const di = dests(chains[i].tree), dj = dests(chains[j].tree);
    if (ai.some((p) => dj.has(p)) && aj.some((p) => di.has(p))) pairs.push([ai[0], aj[0]]);
  }
  if (pairs.length) out.push(tr("intent.bidir").replace("{pairs}", pairs.map(([a, b]) => `${a}↔${b}`).join(", ")));
  // detect load balancing
  let lb = false;
  chains.forEach((c) => (function w(n){ if(!n)return; if(n.t==="out"&&n.mode==="loadBalance")lb=true; ["match","notmatch"].forEach((k)=>n&&n[k]&&w(n[k])); })(c.tree));
  if (lb) out.push(tr("intent.lb"));
  // detect drops
  let drops = false;
  chains.forEach((c) => (function w(n){ if(!n)return; if(n.t==="out"&&n.ports==="0")drops=true; ["match","notmatch"].forEach((k)=>n&&n[k]&&w(n[k])); })(c.tree));
  if (drops) out.push(tr("intent.drop"));
  // filter themes
  const allConds = filters.map((f) => serializeCriterion(f.root, 0)).join(" ").toLowerCase();
  if (allConds.includes("heartbeat")) out.push(tr("intent.heartbeat"));
  if (allConds.includes("443") || allConds.includes("ssl.server_name") || allConds.includes("http.host")) out.push(tr("intent.web"));
  if (allConds.includes("country")) out.push(tr("intent.geo"));
  if (allConds.includes("ip.addr") || allConds.includes("ip.src") || allConds.includes("ip.dst")) out.push(tr("intent.ip"));
  return out;
}

// An empty <or>/<and> is legal: by default it matches unconditionally
// (everything). blockifempty="yes" flips that to match nothing. So an
// empty group is NOT an error — only invalid find values are.
function hasAnyFind(node) {
  if (!node) return false;
  if (node.t === "find") return true;
  return (node.children ?? []).some(hasAnyFind);
}
const isEmptyFilter = (f) => !hasAnyFind(f.root);
function filterProblems(node, out) {
  if (node.t === "find") {
    const f = FIELD_INDEX[node.field]; const kind = f?.kind ?? "str";
    const msg = validate(kind, node.val);
    if (msg) out.push({ id: node.id, msg, label: f?.label ?? node.field });
  } else {
    (node.children ?? []).forEach((c) => filterProblems(c, out));
  }
  return out;
}

/* ===================== chain (decision tree) model ===================== */
const UNSET = "__unset__";
const mkOut = (ports = "P1") => ({ id: nid(), t: "out", ports, mode: "duplicate", lb: "5thash" });
const mkDrop = () => ({ id: nid(), t: "out", ports: "0", mode: "duplicate", lb: "5thash" });
const mkUnset = () => ({ id: nid(), t: UNSET });
const mkBranch = (fids = "F1") => ({ id: nid(), t: "branch", fids, fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") });
const isUnset = (n) => n && n.t === UNSET;
const isDrop = (n) => n && n.t === "out" && n.ports === "0";

function cUpdate(node, id, fn) {
  if (!node) return node;
  if (node.id === id) return fn(node);
  let out = node;
  for (const k of ["child", "match", "notmatch"]) if (node[k]) {
    const u = cUpdate(node[k], id, fn); if (u !== node[k]) out = { ...out, [k]: u };
  }
  return out;
}
const setSide = (node, bid, side, val) => cUpdate(node, bid, (b) => ({ ...b, [side]: val }));

// A document holds an array of chains. Each chain is one ingress pipeline,
// identified by its <in> port. Templates may still return a single `chain`;
// normalizeDoc upgrades that to a `chains` array so the rest of the app only
// ever deals with the plural form.
const mkChain = (ports = "P0") => ({ cid: nid(), ports, tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } });
function normalizeDoc(d) {
  if (d.chains) return { ...d, chains: d.chains.map((c) => c.cid ? c : { ...c, cid: nid() }) };
  const { chain, ...rest } = d;
  return { ...rest, chains: [{ cid: nid(), ports: chain?.ports ?? "P0", tree: chain?.tree }] };
}

function vlanAttrs(o) {
  if (!o || !o.vlantype) return "";
  const idAttr = o.vlanid != null && o.vlanid !== "" ? ` vlanid="${esc(o.vlanid)}"` : "";
  return ` vlantype="${o.vlantype}"${idAttr}`;
}
function serializeChain(chain) {
  const inPorts = chain.ports || "P0";
  const emitOut = (n, pad) => {
    const attr = n.mode === "loadBalance" ? ` type="loadBalance" lbtype="${n.lb}"` : "";
    return `${pad}<out${attr}${vlanAttrs(n)}>${n.ports}</out>`;
  };
  function body(node, depth) {
    const pad = "  ".repeat(depth);
    if (!node || isUnset(node)) return null;
    if (node.t === "out") return emitOut(node, pad);
    const fidType = node.fidOp && node.fidOp !== "or" ? ` type="${node.fidOp}"` : "";
    const fidAlt = node.fidAlt ? ` alt="${esc(node.fidAlt)}"` : "";
    const lines = [`${pad}<fid${fidType}${fidAlt}>${node.fids}</fid>`];
    if (node.match && !isUnset(node.match)) {
      if (node.match.t === "out") lines.push(emitOut(node.match, pad));
      else { lines.push(`${pad}<next>`); const i = body(node.match, depth+1); if (i) lines.push(i); lines.push(`${pad}</next>`); }
    }
    if (node.notmatch && !isUnset(node.notmatch)) {
      lines.push(`${pad}<next type="notmatch">`); const i = body(node.notmatch, depth+1); if (i) lines.push(i); lines.push(`${pad}</next>`);
    }
    return lines.join("\n");
  }
  return `<chain>\n  <in${vlanAttrs(chain.inVlan)}>${inPorts}</in>\n${body(chain.tree, 1)}\n</chain>`;
}
function chainProblems(tree, out) {
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch") {
      if (!String(n.fids || "").trim())
        out.push({ id: n.id, fids: n.fids, msg: `filter test has no filter selected` });
      else if (isUnset(n.match) && isUnset(n.notmatch))
        out.push({ id: n.id, fids: n.fids, msg: `${n.fids} routes neither side` });
    }
    // an explicit out node must send somewhere ("0" = drop is valid, blank is not)
    if (n.t === "out" && !String(n.ports ?? "").trim())
      out.push({ id: n.id, msg: `output has no port set` });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return out;
}
function collectRefs(tree, definedIds) {
  const seen = new Map();
  (function walk(n) {
    if (!n) return;
    if (n.t === "branch" && n.fids) n.fids.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const id = tok.replace(/^!/, "");
      if (!seen.has(id)) seen.set(id, { id, defined: definedIds.has(id) });
    });
    ["child", "match", "notmatch"].forEach((k) => n[k] && walk(n[k]));
  })(tree);
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/* ===================== templates ===================== */
const finds = (field, rel, items) => items.map((c) => ({ id: nid(), t: "find", field, rel, val: c }));
const TEMPLATES = [
  { id: "starter", title: "Starter (heartbeat + HTTPS)", tag: "Starter",
    title_zh: "入門(heartbeat + HTTPS)", tag_zh: "入門",
    blurb: "Two-way forwarding with heartbeat-miss and HTTPS steering, plus return-path chains for P2/P3.",
    blurb_zh: "雙向轉發,含 heartbeat 中斷與 HTTPS 分流,並有 P2/P3 的回程鏈結。",
    detail: "A protective inline setup. P0 and P1 are the two sides of a link the device sits in the middle of. Normally traffic flows P0→P1 and P1→P0. Two conditions change that: F1 fires when the device stops seeing its heartbeat target (a link-health signal) — this is the bypass/failover trigger; F2 matches encrypted web traffic on port 443. When either matches, traffic is steered to P1/P0 as configured. Anything that matches neither falls through to P2 (from P0) or P3 (from P1) — typically a monitoring or tap port. P2 and P3 then return traffic back into P0/P1 so the link stays intact.",
    detail_zh: "一個保護性的 inline 設定。P0 和 P1 是裝置所夾在中間的鏈路兩側,正常情況下流量 P0→P1、P1→P0。兩個條件會改變路徑:F1 在裝置偵測不到 heartbeat 目標(鏈路健康訊號)時觸發 — 這是 bypass/failover 的觸發條件;F2 比對 port 443 上的加密網頁流量。任一符合時,流量會依設定導向 P1/P0。兩者都不符合的流量會落到 P2(來自 P0)或 P3(來自 P1)— 通常是監控或 tap 埠。P2 和 P3 再把流量送回 P0/P1,讓鏈路維持完整。",
    make: () => ({
      filters: [
        { id: 1, name: "heartbeat miss", sessionBase: "no",
          root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "heartbeat.target.miss.id", rel: "==", val: "1" }] } },
        { id: 2, name: "https(encrypted)", sessionBase: "no",
          root: { id: nid(), t: "or", children: [
            { id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" },
            { id: nid(), t: "find", field: "udp.port", rel: "==", val: "443" } ] } },
      ],
      chains: [
        { cid: nid(), ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"),
          notmatch: { id: nid(), t: "branch", fids: "F2", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } } },
        { cid: nid(), ports: "P1", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P0"),
          notmatch: { id: nid(), t: "branch", fids: "F2", fidOp: "or", match: mkOut("P0"), notmatch: mkOut("P3") } } },
        { cid: nid(), ports: "P2", tree: { id: nid(), t: "out", ports: "P0", mode: "duplicate", lb: "5thash" } },
        { cid: nid(), ports: "P3", tree: { id: nid(), t: "out", ports: "P1", mode: "duplicate", lb: "5thash" } },
      ],
    }) },
  { id: "minimal", title: "Minimal forward", tag: "Basic",
    title_zh: "最小轉發", tag_zh: "基本",
    blurb: "The smallest useful chain: packets from P0 that match F1 go to P1.",
    blurb_zh: "最精簡的實用鏈結:P0 進來、符合 F1 的封包送到 P1。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "loadbalance", title: "Load balance", tag: "Basic",
    title_zh: "負載平衡", tag_zh: "基本",
    blurb: "Matched traffic from P0 is spread across P1 and P2 by 5-tuple hash, keeping each session on one port.",
    blurb_zh: "P0 進來、符合的流量以 5-tuple hash 分散到 P1 和 P2,同一連線維持在同一埠。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or",
        match: { id: nid(), t: "out", ports: "P1,P2", mode: "loadBalance", lb: "5thash" }, notmatch: mkUnset() } },
    }) },
  { id: "ip-blacklist", title: "Block IP blacklist", tag: "L3",
    title_zh: "封鎖 IP 黑名單", tag_zh: "L3",
    blurb: "Divert packets whose IP is on a blacklist.",
    blurb_zh: "把 IP 在黑名單上的封包導向他處。",
    make: () => ({
      filters: [{ id: 1, name: "ip blacklist", sessionBase: "no",
        root: { id: nid(), t: "or", children: finds("ip.addr", "==", ["92.53.120.155","67.229.164.135"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "block-country", title: "Block by country", tag: "GeoIP",
    title_zh: "依國家封鎖", tag_zh: "GeoIP",
    blurb: "Divert traffic from specific countries. Needs dbip.",
    blurb_zh: "把來自特定國家的流量導向他處。需要 dbip。",
    make: () => ({
      filters: [{ id: 1, name: "blocked countries", sessionBase: "no",
        root: { id: nid(), t: "or", children: finds("country.iso_code", "==", ["CN","RU"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "block-sni", title: "Block TLS by SNI", tag: "TLS",
    title_zh: "依 SNI 封鎖 TLS", tag_zh: "TLS",
    blurb: "Match HTTPS by TLS server name and divert.",
    blurb_zh: "以 TLS server name 比對 HTTPS 並導向他處。",
    make: () => ({
      filters: [{ id: 1, name: "blocked SNI", sessionBase: "yes",
        root: { id: nid(), t: "or", children: finds("ssl.server_name", "==", ["facebook.com"]) } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
  { id: "rewrite-output", title: "Rewrite via output", tag: "Output",
    title_zh: "透過 output 改寫", tag_zh: "Output",
    blurb: "Matched traffic goes to an output (O1) that rewrites source IP and adds a VLAN tag, then leaves on P1.",
    blurb_zh: "符合的流量送到 output(O1),改寫來源 IP 並加上 VLAN tag,再從 P1 送出。",
    make: () => ({
      filters: [{ id: 1, name: "target", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip.dst", rel: "==", val: "10.0.0.0/24" }] } }],
      outputs: [{ id: 1, name: "rewrite", port: "P1", mods: [
        { id: nid(), k: "modify_srcip", val: "172.16.10.10" },
        { id: nid(), k: "Q", val: "100" } ] }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("O1"), notmatch: mkOut("P2") } },
    }) },
  { id: "pcap-replay", title: "Replay pcap to a port", tag: "Input",
    title_zh: "重播 pcap 到埠", tag_zh: "Input",
    blurb: "An input replays a pcap file onto P0 once, then the chain forwards matched traffic out P1.",
    blurb_zh: "一個 input 把 pcap 檔重播到 P0 一次,鏈結再把符合的流量從 P1 轉發出去。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip", rel: "==", val: "" }] } }],
      inputs: [{ id: 1, name: "replay", alt: "test pcap", type: "replayPcap", port: "P0",
        pcapMode: "files", filepaths: ["H1/in/sample.pcap"], fields: { time: "1", msinterval: "1" }, scanAttrs: {} }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "ingress-strip", title: "Strip VLAN at ingress", tag: "Action",
    title_zh: "入口移除 VLAN", tag_zh: "Action",
    blurb: "An action strips the VLAN tag from packets arriving on P0 before the chain filters them.",
    blurb_zh: "一個 action 在鏈結過濾前,先移除 P0 進來封包的 VLAN tag。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      actions: [{ id: 1, name: "strip vlan", type: "input-packet-process", port: "P0",
        mods: [{ id: nid(), k: "stripping", val: "vlan" }], portA: "P1", portB: "P2" }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkUnset() } },
    }) },
  { id: "inline-bidir", title: "Inline (bidirectional)", tag: "Multi-chain",
    title_zh: "Inline(雙向)", tag_zh: "多鏈結",
    blurb: "Two chains form an inline pair: P6→P7 forwards matched traffic, and P7→P6 carries the return path.",
    blurb_zh: "兩條鏈結組成 inline 配對:P6→P7 轉發符合的流量,P7→P6 負責回程。",
    make: () => ({
      filters: [{ id: 1, name: "match", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" }] } }],
      chains: [
        { cid: nid(), ports: "P6", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P7"), notmatch: mkOut("P7") } },
        { cid: nid(), ports: "P7", tree: { id: nid(), t: "out", ports: "P6", mode: "duplicate", lb: "5thash" } },
      ],
    }) },
  { id: "vxlan-encap", title: "VXLAN encapsulation", tag: "Output",
    title_zh: "VXLAN 封裝", tag_zh: "Output",
    blurb: "Matched traffic is wrapped in VXLAN (to a remote VTEP with a VNI) via output O1, then sent out P7.",
    blurb_zh: "符合的流量透過 output O1 封裝成 VXLAN(送到帶 VNI 的遠端 VTEP),再從 P7 送出。",
    make: () => ({
      filters: [{ id: 1, name: "to tunnel", sessionBase: "no",
        root: { id: nid(), t: "or", children: [{ id: nid(), t: "find", field: "ip.dst", rel: "==", val: "10.0.0.0/24" }] } }],
      outputs: [{ id: 1, name: "vxlan out", port: "P7", mods: [
        { id: nid(), k: "vxlan_sip", val: "192.168.1.10" },
        { id: nid(), k: "vxlan_dip", val: "192.168.1.201" },
        { id: nid(), k: "vxlan_vni", val: "100" } ] }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("O1"), notmatch: mkUnset() } },
    }) },
  { id: "geo-recursive", title: "Geo + protocol, whitelisted", tag: "Recursive",
    title_zh: "地理 + 協定,含白名單", tag_zh: "遞迴",
    blurb: "Recursive filter: geo AND (443 or 53) AND NOT whitelist.",
    blurb_zh: "遞迴篩選器:地理 且 (443 或 53) 且 非白名單。",
    make: () => ({
      filters: [{ id: 1, name: "suspicious geo traffic", sessionBase: "no",
        root: { id: nid(), t: "and", children: [
          { id: nid(), t: "or", children: finds("country.iso_code", "==", ["CN","RU"]) },
          { id: nid(), t: "or", children: [
            { id: nid(), t: "find", field: "tcp.port", rel: "==", val: "443" },
            { id: nid(), t: "find", field: "udp.port", rel: "==", val: "53" }] },
          { id: nid(), t: "not", children: [
            { id: nid(), t: "or", children: finds("ip.addr", "==", ["8.8.8.8","168.95.1.1"]) }] },
        ] } }],
      chain: { ports: "P0", tree: { id: nid(), t: "branch", fids: "F1", fidOp: "or", match: mkOut("P1"), notmatch: mkOut("P2") } },
    }) },
];

/* ===================== output (rewrite / tagging) model ===================== */
/* <output id> is a top-level element, referenced from a chain <out> as O1, O2…
   Required <port>, then an unbounded choice of modifiers. This build covers the
   rewrite family (no encapsulation): modify src/dst ip/port/mac, VLAN Q/QinQ,
   stripping, tagging, maxlen. Each modifier is one row {k, val}. */
const STRIP_TYPES = ["payload","payload2","vlan","mpls","gre","vxlan","gre-erspan","gtp","grism","mpls-in-udp","mpls-in-gre","udpencap"];
const TAG_TYPES = ["timestamp","gtp","gtp2","l2gre","vxlan","grism"];
const NVGRE_TYPES = ["eth","ip"];
const DIR_CATEGORY = ["month","day","hour","minute"];
const DIR_TYPE = ["pcap","payload"];
const YN = ["no","yes"];
const OUT_MODS = [
  { k: "modify_srcip", label: "Modify source IP", kind: "ip", ph: "10.1.1.1", grp: "rewrite",
    attrs: [{ name: "sessionDir", opts: YN, def: "no" }, { name: "nat", opts: YN, def: "no" }] },
  { k: "modify_dstip", label: "Modify dest IP", kind: "ip", ph: "10.1.1.2", grp: "rewrite",
    attrs: [{ name: "sessionDir", opts: YN, def: "no" }] },
  { k: "modify_srcport", label: "Modify source port", kind: "port", ph: "8080", grp: "rewrite" },
  { k: "modify_dstport", label: "Modify dest port", kind: "port", ph: "80", grp: "rewrite" },
  { k: "modify_srcmac", label: "Modify source MAC", kind: "mac", ph: "d8:fe:e3:a4:d3:78", grp: "rewrite" },
  { k: "modify_dstmac", label: "Modify dest MAC", kind: "mac", ph: "d8:fe:e3:a4:d3:78", grp: "rewrite" },
  { k: "modify_swapmac", label: "Swap src/dst MAC", kind: "flag", grp: "rewrite" },
  { k: "modify_src_default_mac", label: "Src = device MAC", kind: "flag", grp: "rewrite" },
  { k: "modify_dstip2nat", label: "Dst IP → NAT", kind: "flag", grp: "rewrite" },
  { k: "modify_tcp_syn_mss", label: "TCP SYN MSS", kind: "int", ph: "1400", grp: "rewrite" },
  { k: "Q", label: "VLAN tag (Q)", kind: "vlanop", ph: "10", grp: "rewrite", defOp: "add" },
  { k: "QinQ", label: "VLAN tag (QinQ)", kind: "vlanop", ph: "20", grp: "rewrite", defOp: "add" },
  { k: "gateway", label: "Gateway (ARP for MAC)", kind: "ip", ph: "192.168.1.1", grp: "rewrite" },
  { k: "stripping", label: "Strip header", kind: "enum", opts: STRIP_TYPES, grp: "rewrite" },
  { k: "tagging", label: "Add tag", kind: "enum", opts: TAG_TYPES, grp: "rewrite" },
  { k: "maxlen", label: "Max packet length", kind: "num", ph: "64", grp: "rewrite" },
  // ARP / ICMP replies
  { k: "arp_reply_target_mac", label: "ARP reply target MAC", kind: "mac", ph: "00:0c:bd:0b:fd:36", grp: "reply" },
  { k: "arp_reply_default_mac", label: "ARP reply (device MAC)", kind: "flag", grp: "reply" },
  { k: "icmp_reply", label: "ICMP reply", kind: "flag", grp: "reply" },
  { k: "icmp_reply_fragment_need", label: "ICMP frag-needed", kind: "flag", grp: "reply",
    attrs: [{ name: "mtu", kind: "num", def: "1400", required: true }] },
  // DNS response / redirect
  { k: "dns_response_ipv4", label: "DNS response IPv4", kind: "ip", ph: "1.2.3.4", grp: "redirect",
    attrs: [{ name: "noswapmac", opts: YN, def: "no" }] },
  { k: "dns_response_ipv6", label: "DNS response IPv6", kind: "ipv6", ph: "2001:db8::1", grp: "redirect" },
  { k: "redirect2safeweb", label: "Redirect to safe web", kind: "str", ph: "http://safe.example", grp: "redirect",
    attrs: [{ name: "noswapmac", opts: YN, def: "no" }, { name: "redirectPort", kind: "str", def: "" }] },
  // Mirror-to-file (dir) group
  { k: "dir", label: "Write to dir", kind: "str", ph: "/data/capture", grp: "mirror",
    attrs: [{ name: "timeout", kind: "num", def: "0" }, { name: "max_split_size", kind: "num", def: "104857600" },
            { name: "category", opts: DIR_CATEGORY, def: "" }, { name: "type", opts: DIR_TYPE, def: "pcap" }] },
  { k: "dip", label: "Mirror dest IP", kind: "str", ph: "10.0.0.9", grp: "mirror" },
  { k: "sport", label: "Mirror source port", kind: "port", ph: "0", grp: "mirror" },
  { k: "dport", label: "Mirror dest port", kind: "port", ph: "0", grp: "mirror" },
  // VXLAN encapsulation
  { k: "vxlan_sip", label: "VXLAN source IP", kind: "ip", ph: "192.168.1.10", grp: "vxlan" },
  { k: "vxlan_dip", label: "VXLAN dest IP", kind: "ip", ph: "192.168.1.201", grp: "vxlan" },
  { k: "vxlan_sport", label: "VXLAN source port", kind: "port", ph: "4789", grp: "vxlan" },
  { k: "vxlan_dport", label: "VXLAN dest port", kind: "port", ph: "4789", grp: "vxlan" },
  { k: "vxlan_vni", label: "VXLAN VNI", kind: "uint24", ph: "100", grp: "vxlan" },
  // NVGRE encapsulation
  { k: "nvgre_sip", label: "NVGRE source IP", kind: "ip", ph: "192.168.1.10", grp: "nvgre" },
  { k: "nvgre_dip", label: "NVGRE dest IP", kind: "ip", ph: "192.168.1.201", grp: "nvgre" },
  { k: "nvgre_dmac", label: "NVGRE dest MAC", kind: "mac", ph: "00:0c:bd:0b:fd:36", grp: "nvgre" },
  { k: "nvgre_type", label: "NVGRE type", kind: "enum", opts: NVGRE_TYPES, grp: "nvgre" },
];
const OUT_MOD_INDEX = Object.fromEntries(OUT_MODS.map((m) => [m.k, m]));
const VLAN_OPS = ["add","replace","remove"];
const mkOutputMod = (k) => {
  const meta = OUT_MOD_INDEX[k];
  const mod = { id: nid(), k, val: meta?.opts?.[0] ?? "", op: meta?.kind === "vlanop" ? meta.defOp : undefined };
  if (meta?.attrs) { mod.attrs = {}; meta.attrs.forEach((a) => { mod.attrs[a.name] = a.def ?? ""; }); }
  return mod;
};
const mkOutput = (id) => ({ id, name: "", port: "P1", mods: [], oattrs: {} });

function serializeOutput(o) {
  const oa = o.oattrs ?? {};
  const attrs = [`id="${o.id}"`, o.name ? `name="${esc(o.name)}"` : null,
    oa.type ? `type="${esc(oa.type)}"` : null,
    oa.mtu ? `mtu="${esc(oa.mtu)}"` : null,
    oa.stl ? `stl="${esc(oa.stl)}"` : null,
    oa.arp_srcip ? `arp_srcip="${esc(oa.arp_srcip)}"` : null,
    (oa.arp_dstip_mac && oa.arp_dstip_mac !== "no") ? `arp_dstip_mac="${esc(oa.arp_dstip_mac)}"` : null,
    oa["data-tag"] ? `data-tag="${esc(oa["data-tag"])}"` : null,
    oa["data-index"] ? `data-index="${esc(oa["data-index"])}"` : null,
    oa.minbps ? `minbps="${esc(oa.minbps)}"` : null,
    oa.maxbps ? `maxbps="${esc(oa.maxbps)}"` : null,
    o.alt ? `alt="${esc(o.alt)}"` : null].filter(Boolean).join(" ");
  const lines = [`<output ${attrs}>`, `  <port>${esc(o.port)}</port>`];
  (o.mods ?? []).forEach((m) => {
    const meta = OUT_MOD_INDEX[m.k];
    if (!meta) { lines.push(`  <${m.k}>${esc(m.val ?? "")}</${m.k}>`); return; }
    const attrStr = (meta.attrs ?? []).map((a) => {
      const v = m.attrs?.[a.name] ?? a.def ?? "";
      if (!a.required && (v === "" || v === a.def)) return null; // omit empties and defaults
      return `${a.name}="${esc(v)}"`;
    }).filter(Boolean).join(" ");
    const sp = attrStr ? " " + attrStr : "";
    if (meta.kind === "flag") lines.push(`  <${m.k}${sp}/>`);
    else if (meta.kind === "vlanop") {
      const op = m.op || meta.defOp;
      if (op === "remove") lines.push(`  <${m.k} type="remove"></${m.k}>`);
      else if (op === "add") lines.push(`  <${m.k}>${esc(m.val)}</${m.k}>`); // add is default → omit type
      else lines.push(`  <${m.k} type="${op}">${esc(m.val)}</${m.k}>`);
    }
    else lines.push(`  <${m.k}${sp}>${esc(m.val)}</${m.k}>`);
  });
  lines.push(`</output>`);
  return lines.join("\n");
}
function outputProblems(o, out) {
  if (!/^[A-Z][0-9]+$/.test(o.port || "")) out.push({ id: o.id, msg: `port must look like P1`, label: "port" });
  (o.mods ?? []).forEach((m) => {
    const meta = OUT_MOD_INDEX[m.k]; if (!meta) return;
    if (meta.kind === "enum" || meta.kind === "flag") return;
    if (meta.kind === "vlanop") {
      const op = m.op || meta.defOp;
      if (op === "remove") return; // no value needed
      const msg = validate("vlan", m.val);
      if (msg) out.push({ id: m.id, msg, label: meta.label });
      return;
    }
    const msg = validate(meta.kind, m.val);
    if (msg) out.push({ id: m.id, msg, label: meta.label });
  });
  return out;
}

/* ===================== action model ===================== */
/* <action id type> is a top-level element with two forms this build covers:
   • input-packet-process: <port> + stripping/Q/QinQ/tagging/maxlen (acts on
     packets entering a port, like output modifiers but at ingress)
   • linkpairs: <portA>/<portB> — if one link goes down, the other is forced
     down, and vice versa.
   The schema packs these (plus a heartbeat group) into one xs:choice keyed by
   @type. The UI stays stricter than the schema: picking a type shows only that
   form's fields, so you can't mix linkpairs with stripping. */
const ACT_STRIP_TYPES = ["payload","payload2","vlan","mpls","gre","vxlan","gre-erspan","gtp","grism","mpls-in-udp","mpls-in-gre","udpencap"];
const ACT_TAG_TYPES = ["grism","timestamp"];
const ACT_MODS = [
  { k: "stripping", label: "Strip header", kind: "enum", opts: ACT_STRIP_TYPES },
  { k: "Q", label: "VLAN tag (Q)", kind: "vlan", ph: "10" },
  { k: "QinQ", label: "VLAN tag (QinQ)", kind: "vlan", ph: "20" },
  { k: "tagging", label: "Add tag", kind: "enum", opts: ACT_TAG_TYPES },
  { k: "maxlen", label: "Max packet length", kind: "num", ph: "64" },
  { k: "ip", label: "Interface IP", kind: "ip", ph: "192.168.1.1" },
  { k: "gateway", label: "Gateway", kind: "ip", ph: "192.168.1.1" },
  { k: "netmask", label: "Netmask", kind: "ip", ph: "255.255.255.0" },
  { k: "arp_reply_default_mac", label: "ARP reply (default MAC)", kind: "flag" },
  { k: "icmp_reply", label: "ICMP reply", kind: "flag" },
  { k: "icmp_reply_fragment_need", label: "ICMP frag-needed", kind: "mtu", ph: "" },
];
const ACT_MOD_INDEX = Object.fromEntries(ACT_MODS.map((m) => [m.k, m]));
const mkActionMod = (k) => ({ id: nid(), k, val: ACT_MOD_INDEX[k]?.opts?.[0] ?? "", mtu: k === "icmp_reply_fragment_need" ? "1440" : undefined });

const mkAction = (id) => ({ id, name: "", type: "input-packet-process", port: "P0", mods: [], portA: "P1", portB: "P2" });

function serializeAction(a) {
  const attrs = [`id="${a.id}"`, `type="${a.type}"`, a.name ? `name="${esc(a.name)}"` : null].filter(Boolean).join(" ");
  const lines = [`<action ${attrs}>`];
  if (a.type === "linkpairs") {
    lines.push(`  <portA>${esc(a.portA)}</portA>`);
    lines.push(`  <portB>${esc(a.portB)}</portB>`);
  } else { // input-packet-process
    lines.push(`  <port>${esc(a.port)}</port>`);
    (a.mods ?? []).forEach((m) => {
      const meta = ACT_MOD_INDEX[m.k];
      if (meta?.kind === "flag") lines.push(`  <${m.k}/>`);
      else if (meta?.kind === "mtu") lines.push(`  <${m.k} mtu="${esc(m.mtu ?? "")}"/>`);
      else lines.push(`  <${m.k}>${esc(m.val)}</${m.k}>`);
    });
  }
  lines.push(`</action>`);
  return lines.join("\n");
}
function actionProblems(a, out) {
  if (a.type === "linkpairs") {
    if (!/^[A-Z][0-9]+$/.test(a.portA || "")) out.push({ id: a.id, msg: `portA must look like P1`, label: "portA" });
    if (!/^[A-Z][0-9]+$/.test(a.portB || "")) out.push({ id: a.id, msg: `portB must look like P2`, label: "portB" });
  } else {
    if (!/^[A-Z][0-9]+$/.test(a.port || "")) out.push({ id: a.id, msg: `port must look like P0`, label: "port" });
    (a.mods ?? []).forEach((m) => {
      const meta = ACT_MOD_INDEX[m.k]; if (!meta || meta.kind === "enum" || meta.kind === "flag") return;
      if (meta.kind === "mtu") {
        if (!/^\d+$/.test(m.mtu || "")) out.push({ id: m.id, msg: "MTU required", label: meta.label });
        return;
      }
      const msg = validate(meta.kind, m.val);
      if (msg) out.push({ id: m.id, msg, label: meta.label });
    });
  }
  return out;
}

/* ===================== input model =====================
   <input> has two documented forms keyed by @type:
   • replayPcap: play back pcap files from a path or a scanned directory
   • traffic-gen: synthesise packets (protocol, size, src/dest ip & port ranges)
   Both start with <port>, then an unbounded choice of setting elements. The UI
   shows only the fields relevant to the chosen type (like <action>). Fields are
   held in a flat map; only non-empty ones are emitted. */
const INPUT_PCAP_FIELDS = [
  { k: "filepath", label: "File path", kind: "str", ph: "H1/in/sample.pcap" },
  { k: "scandir", label: "Scan directory", kind: "str", ph: "H1/in", attrs: ["interval", "minbytes", "timeout"] },
  { k: "time", label: "Play count", kind: "num", ph: "1" },
  { k: "speed", label: "Speed", kind: "num", ph: "10000" },
  { k: "msinterval", label: "Interval (ms)", kind: "num", ph: "1" },
  { k: "playedFilesHandle", label: "After replay", kind: "enum", opts: ["", "delete", "move"] },
  { k: "playedFilesMoveTo", label: "Move played to", kind: "str", ph: "H1/in/played" },
];
const INPUT_GEN_FIELDS = [
  { k: "protocol", label: "Protocol", kind: "enum", opts: ["UDP", "TCP", "ICMP"] },
  { k: "packet_size", label: "Packet size", kind: "num", ph: "1024" },
  { k: "speed", label: "Speed", kind: "num", ph: "10000" },
  { k: "msinterval", label: "Interval (ms)", kind: "num", ph: "1" },
  { k: "payload_text", label: "Payload text", kind: "str", ph: "abcdefg" },
  { k: "packet_data", label: "Packet data (hex)", kind: "str", ph: "000cbd0b…" },
  { k: "src_mac", label: "Source MAC", kind: "mac", ph: "00:0d:48:28:28:56" },
  { k: "dest_mac", label: "Dest MAC", kind: "mac", ph: "00:0d:48:28:28:57" },
  { k: "src_ip", label: "Source IP", kind: "ip", ph: "10.1.0.99" },
  { k: "src_ip_min", label: "Source IP min", kind: "ip", ph: "10.1.0.0" },
  { k: "src_ip_max", label: "Source IP max", kind: "ip", ph: "10.1.0.99" },
  { k: "src_ip_inc", label: "Source IP inc", kind: "int", ph: "5" },
  { k: "src_ip_random", label: "Source IP random", kind: "t1f0", ph: "0" },
  { k: "dest_ip", label: "Dest IP", kind: "ip", ph: "11.1.1.99" },
  { k: "dest_ip_min", label: "Dest IP min", kind: "ip", ph: "11.1.1.0" },
  { k: "dest_ip_max", label: "Dest IP max", kind: "ip", ph: "11.1.2.99" },
  { k: "dest_ip_inc", label: "Dest IP inc", kind: "int", ph: "2" },
  { k: "dest_ip_random", label: "Dest IP random", kind: "t1f0", ph: "0" },
  { k: "src_port", label: "Source port", kind: "port", ph: "1234" },
  { k: "src_port_min", label: "Source port min", kind: "port", ph: "2" },
  { k: "src_port_max", label: "Source port max", kind: "port", ph: "9999" },
  { k: "src_port_inc", label: "Source port inc", kind: "int", ph: "1" },
  { k: "src_port_random", label: "Source port random", kind: "t1f0", ph: "0" },
  { k: "dest_port", label: "Dest port", kind: "port", ph: "2222" },
  { k: "dest_port_min", label: "Dest port min", kind: "port", ph: "0" },
  { k: "dest_port_max", label: "Dest port max", kind: "port", ph: "65535" },
  { k: "dest_port_inc", label: "Dest port inc", kind: "int", ph: "1" },
  { k: "dest_port_random", label: "Dest port random", kind: "t1f0", ph: "0" },
];
const INPUT_FIELD_INDEX = Object.fromEntries([...INPUT_PCAP_FIELDS, ...INPUT_GEN_FIELDS].map((f) => [f.k, f]));
const inputFieldsFor = (type) => type === "traffic-gen" ? INPUT_GEN_FIELDS : INPUT_PCAP_FIELDS;
const mkInput = (id) => ({ id, name: "", alt: "", type: "replayPcap", port: "P0",
  pcapMode: "files", filepaths: [""], fields: { time: "1" }, scanAttrs: {} });

function serializeInput(inp) {
  const attrs = [`id="${inp.id}"`, `type="${inp.type}"`,
    inp.name ? `name="${esc(inp.name)}"` : null,
    inp.alt ? `alt="${esc(inp.alt)}"` : null].filter(Boolean).join(" ");
  const lines = [`<input ${attrs}>`, `  <port>${esc(inp.port)}</port>`];
  if (inp.type === "replayPcap") {
    const mode = inp.pcapMode || "files";
    if (mode === "files") {
      (inp.filepaths || []).map((p) => p.trim()).filter(Boolean).forEach((p) => lines.push(`  <filepath>${esc(p)}</filepath>`));
    } else {
      const dir = (inp.fields?.scandir || "").trim();
      if (dir) {
        const a = inp.scanAttrs || {};
        const at = ["interval", "minbytes", "timeout"].filter((k) => a[k] != null && a[k] !== "").map((k) => ` ${k}="${esc(a[k])}"`).join("");
        lines.push(`  <scandir${at}>${esc(dir)}</scandir>`);
      }
    }
    // shared playback fields
    ["time", "speed", "msinterval"].forEach((k) => { const v = inp.fields?.[k]; if (v != null && v !== "") lines.push(`  <${k}>${esc(v)}</${k}>`); });
    // played-files handling is only meaningful in scandir mode
    if (mode === "scandir") {
      const h = inp.fields?.playedFilesHandle;
      if (h) lines.push(`  <playedFilesHandle>${esc(h)}</playedFilesHandle>`);
      if (h === "move") { const mv = inp.fields?.playedFilesMoveTo; if (mv) lines.push(`  <playedFilesMoveTo>${esc(mv)}</playedFilesMoveTo>`); }
    }
    lines.push(`</input>`);
    return lines.join("\n");
  }
  inputFieldsFor(inp.type).forEach((f) => {
    const v = inp.fields?.[f.k];
    if (v == null || v === "") return;
    lines.push(`  <${f.k}>${esc(v)}</${f.k}>`);
  });
  lines.push(`</input>`);
  return lines.join("\n");
}
function inputProblems(inp, out) {
  if (!/^[A-Z][0-9]+$/.test(inp.port || "")) out.push({ id: inp.id, msg: `port must look like P0`, label: "port" });
  if (inp.type === "replayPcap") {
    const mode = inp.pcapMode || "files";
    if (mode === "files") {
      const paths = (inp.filepaths || []).map((p) => p.trim()).filter(Boolean);
      if (!paths.length) out.push({ id: inp.id + ":src", msg: "add at least one file path", label: "source" });
      if ((inp.filepaths || []).length > 100) out.push({ id: inp.id + ":src", msg: "at most 100 file paths", label: "source" });
    } else if (!(inp.fields?.scandir || "").trim()) {
      out.push({ id: inp.id + ":src", msg: "needs a scan directory", label: "source" });
    }
  }
  inputFieldsFor(inp.type).forEach((f) => {
    const v = inp.fields?.[f.k]; if (v == null || v === "") return;
    if (f.kind === "enum" || f.kind === "str") return;
    const vk = f.kind === "t1f0" ? "bit" : f.kind === "int" ? "num" : f.kind;
    const msg = validate(vk, v);
    if (msg) out.push({ id: inp.id + ":" + f.k, msg, label: f.label });
  });
  return out;
}

/* ===================== whole-document serialiser ===================== */
function serializeRun(doc) {
  const parts = [];
  // re-emit an element's attached comment (if any) on its own line before it
  const withComment = (item, xml) => {
    const indented = xml.split("\n").map((l) => "  " + l).join("\n");
    if (item && item._comment != null) {
      const c = `  <!--${item._comment}-->`;
      return c + "\n" + indented;
    }
    return indented;
  };
  doc.filters.forEach((f) => parts.push(withComment(f, serializeFilter(f))));
  (doc.inputs ?? []).forEach((inp) => parts.push(withComment(inp, serializeInput(inp))));
  (doc.outputs ?? []).forEach((o) => parts.push(withComment(o, serializeOutput(o))));
  (doc.actions ?? []).forEach((a) => parts.push(withComment(a, serializeAction(a))));
  (doc.chains ?? []).forEach((c) => parts.push(withComment(c, serializeChain(c))));
  return `<run>\n${parts.join("\n")}\n</run>`;
}

/* ===================== XML → model parser =====================
   The inverse of serializeRun: takes a <run> string and rebuilds the
   editable document. Mirrors each serializer exactly. Throws on malformed
   XML or an unexpected shape so the caller can surface a clear message
   rather than loading a half-parsed, misleading model. */
function parseRun(xmlText) {
  const dom = new DOMParser().parseFromString(xmlText, "application/xml");
  const perr = dom.querySelector("parsererror");
  if (perr) throw new Error("XML is not well-formed");
  const run = dom.querySelector("run");
  if (!run) throw new Error("no <run> element found");
  const elemChildren = (el) => [...el.children];
  const warnings = [];

  // --- filter criterion (recursive) ---
  function parseCriterion(el) {
    const tag = el.tagName;
    if (tag === "find" || tag === "f") {
      // <f n=… r=… c=…/> is shorthand for <find name=… relation=… content=…/>
      const field = el.getAttribute("name") ?? el.getAttribute("n") ?? "ip.addr";
      const rel = el.getAttribute("relation") ?? el.getAttribute("r") ?? "==";
      const val = el.getAttribute("content") ?? el.getAttribute("c") ?? "";
      if (!FIELD_INDEX[field]) warnings.push(`unknown find field "${field}"`);
      const kind = FIELD_INDEX[field]?.kind ?? "str";
      return { id: nid(), t: "find", field, rel: rel || "==", val: kind === "exists" ? "" : val };
    }
    if (tag === "or" || tag === "and" || tag === "not") {
      return { id: nid(), t: tag, children: elemChildren(el).map(parseCriterion) };
    }
    warnings.push(`unexpected element <${tag}> in filter`);
    return { id: nid(), t: "or", children: [] };
  }
  function parseFilter(el) {
    const id = +(el.getAttribute("id") || 0);
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    const sessionBase = el.getAttribute("sessionBase") || "no";
    const matchedlog = el.getAttribute("matchedlog") === "yes" ? "yes" : "no";
    const blockifempty = el.getAttribute("blockifempty") === "yes" ? "yes" : "no";
    const fattrs = {};
    ["masking","maxPackets","tuple5_live_hashtable_size","start","position","within","mpslog"].forEach((a) => {
      const v = el.getAttribute(a); if (v != null) fattrs[a] = v;
    });
    const first = elemChildren(el)[0];
    const root = first ? parseCriterion(first) : { id: nid(), t: "or", children: [] };
    // name and alt are both free-text labels; we surface one "name" field but
    // remember which attribute the label came from so we write it back the same way.
    const labelAttr = name ? "name" : alt ? "alt" : "name";
    return { id, name, alt, labelAttr, sessionBase, matchedlog, blockifempty, fattrs, root };
  }

  // --- output ---
  function parseOutput(el) {
    const id = +(el.getAttribute("id") || 0);
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    // output-level attributes
    const oattrs = {};
    ["type","mtu","stl","arp_srcip","arp_dstip_mac","data-tag","data-index","minbps","maxbps"].forEach((a) => {
      const v = el.getAttribute(a); if (v != null) oattrs[a] = v;
    });
    let port = "P1";
    const mods = [];
    elemChildren(el).forEach((c) => {
      const k = c.tagName;
      if (k === "port") { port = c.textContent.trim(); return; }
      const meta = OUT_MOD_INDEX[k];
      if (!meta) { warnings.push(`unknown output modifier <${k}>`); return; }
      if (meta.kind === "vlanop") {
        mods.push({ id: nid(), k, val: c.textContent.trim(), op: c.getAttribute("type") || meta.defOp });
      } else {
        const mod = { id: nid(), k, val: c.textContent.trim() };
        if (meta.attrs) { mod.attrs = {}; meta.attrs.forEach((a) => { const v = c.getAttribute(a.name); mod.attrs[a.name] = v != null ? v : (a.def ?? ""); }); }
        mods.push(mod);
      }
    });
    const labelAttr = name ? "name" : alt ? "alt" : "name";
    return { id, name, alt, labelAttr, port, mods, oattrs };
  }

  // --- input ---
  function parseInput(el) {
    const id = +(el.getAttribute("id") || 0);
    const type = el.getAttribute("type") || "replayPcap";
    const name = el.getAttribute("name") || "";
    const alt = el.getAttribute("alt") || "";
    const inp = { id, name, alt, labelAttr: name ? "name" : alt ? "alt" : "name", type, port: "P0", pcapMode: "files", filepaths: [], fields: {}, scanAttrs: {} };
    elemChildren(el).forEach((c) => {
      const k = c.tagName;
      if (k === "port") { inp.port = c.textContent.trim(); return; }
      if (k === "filepath") { inp.filepaths.push(c.textContent.trim()); return; }
      if (k === "scandir") {
        inp.pcapMode = "scandir";
        inp.fields.scandir = c.textContent.trim();
        ["interval", "minbytes", "timeout"].forEach((a) => { const av = c.getAttribute(a); if (av != null) inp.scanAttrs[a] = av; });
        return;
      }
      if (!INPUT_FIELD_INDEX[k]) { warnings.push(`unknown input element <${k}>`); return; }
      inp.fields[k] = c.textContent.trim();
    });
    // decide the pcap mode: scandir present → scandir; else files
    if (inp.fields.scandir) inp.pcapMode = "scandir";
    else { inp.pcapMode = "files"; if (!inp.filepaths.length) inp.filepaths = [""]; }
    return inp;
  }

  // --- action ---
  function parseAction(el) {
    const id = +(el.getAttribute("id") || 0);
    const type = el.getAttribute("type") || "input-packet-process";
    const name = el.getAttribute("name") || "";
    const a = { id, name, type, port: "P0", mods: [], portA: "P1", portB: "P2" };
    if (type === "linkpairs") {
      elemChildren(el).forEach((c) => {
        if (c.tagName === "portA") a.portA = c.textContent.trim();
        if (c.tagName === "portB") a.portB = c.textContent.trim();
      });
    } else {
      elemChildren(el).forEach((c) => {
        const k = c.tagName;
        if (k === "port") { a.port = c.textContent.trim(); return; }
        const meta = ACT_MOD_INDEX[k];
        if (!meta) { warnings.push(`unknown action element <${k}>`); return; }
        if (meta.kind === "flag") a.mods.push({ id: nid(), k });
        else if (meta.kind === "mtu") a.mods.push({ id: nid(), k, mtu: c.getAttribute("mtu") || "" });
        else a.mods.push({ id: nid(), k, val: c.textContent.trim() });
      });
    }
    return a;
  }

  // --- chain (decision tree) ---
  // Reads <in>, then a sequence of <fid>/<out>/<next> back into the
  // branch/out/unset node shape. A <fid> with a following <out> or <next>
  // for match, and a <next type="notmatch"> for the other side.
  function parseVlan(el, obj) {
    const vt = el.getAttribute("vlantype");
    if (vt) { obj.vlantype = vt; const vid = el.getAttribute("vlanid"); if (vid != null) obj.vlanid = vid; }
    return obj;
  }
  function parseOutNode(el) {
    const n = { id: nid(), t: "out", ports: el.textContent.trim(),
      mode: el.getAttribute("type") === "loadBalance" ? "loadBalance" : "duplicate",
      lb: el.getAttribute("lbtype") || "5thash" };
    return parseVlan(el, n);
  }
  // parse the body (a list of sibling elements at one level) into a node
  function parseBody(els) {
    if (!els.length) return mkUnset();
    const fidEl = els.find((e) => e.tagName === "fid");
    if (!fidEl) {
      // no fid → a bare <out> terminal
      const outEl = els.find((e) => e.tagName === "out");
      return outEl ? parseOutNode(outEl) : mkUnset();
    }
    const node = { id: nid(), t: "branch", fids: fidEl.textContent.trim(), fidOp: fidEl.getAttribute("type") || "or",
      fidAlt: fidEl.getAttribute("alt") || "",
      match: mkUnset(), notmatch: mkUnset() };
    // walk siblings after the fid: first <out> or plain <next> = match; <next type="notmatch"> = notmatch
    const after = els.slice(els.indexOf(fidEl) + 1);
    after.forEach((e) => {
      if (e.tagName === "out") { node.match = parseOutNode(e); }
      else if (e.tagName === "next") {
        const isNot = e.getAttribute("type") === "notmatch";
        const inner = parseBody(elemChildren(e));
        if (isNot) node.notmatch = inner; else node.match = inner;
      }
    });
    return node;
  }
  function parseChain(el) {
    const inEl = elemChildren(el).find((c) => c.tagName === "in");
    const ports = inEl ? inEl.textContent.trim() : "P0";
    const chain = { cid: nid(), ports, tree: null };
    if (inEl) { const iv = {}; parseVlan(inEl, iv); if (iv.vlantype) chain.inVlan = iv; }
    const rest = elemChildren(el).filter((c) => c.tagName !== "in");
    chain.tree = parseBody(rest);
    return chain;
  }

  const filters = [], outputs = [], actions = [], chains = [], inputs = [];
  // Walk raw child nodes so we can capture comments that precede a top-level
  // element and attach them to that element as `_comment` (round-tripped on output).
  let pendingComment = [];
  [...run.childNodes].forEach((node) => {
    if (node.nodeType === 8) { // Comment node
      pendingComment.push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return; // ignore text/whitespace
    const el = node;
    const comment = pendingComment.length ? pendingComment.join("\n") : null;
    pendingComment = [];
    let parsed = null;
    switch (el.tagName) {
      case "filter": parsed = parseFilter(el); filters.push(parsed); break;
      case "input": parsed = parseInput(el); inputs.push(parsed); break;
      case "output": parsed = parseOutput(el); outputs.push(parsed); break;
      case "action": parsed = parseAction(el); actions.push(parsed); break;
      case "chain": parsed = parseChain(el); chains.push(parsed); break;
      default: warnings.push(`unexpected top-level <${el.tagName}>`);
    }
    if (parsed && comment != null) parsed._comment = comment;
  });
  if (!chains.length) chains.push(mkChain("P0"));
  if (!filters.length) filters.push({ id: 1, name: "", sessionBase: "no", blockifempty: "no", root: { id: nid(), t: "or", children: [mkFind()] } });
  return { doc: { filters, inputs, outputs, actions, chains }, warnings };
}

/* ===================== XML formatter (pure text re-indent) =====================
   Beautifies XML by recomputing indentation from tag open/close, WITHOUT
   parsing into the model — so every element is preserved, including ones the
   tool doesn't recognise. Requires well-formed tag nesting; throws otherwise
   so the caller can leave the user's text untouched and show a message. */
function formatXml(xml, indentUnit = "  ") {
  // normalise: put each tag on its own line, collapse whitespace between tags
  const normalized = xml
    .replace(/\r\n?/g, "\n")
    .replace(/>\s*</g, ">\n<")   // break between adjacent tags
    .trim();
  const rawLines = normalized.split("\n").map((l) => l.trim()).filter((l) => l.length);

  let depth = 0;
  const out = [];
  for (const line of rawLines) {
    const isClose = /^<\//.test(line);
    const isSelfClose = /\/>\s*$/.test(line);
    const isDecl = /^<[?!]/.test(line);                 // <?xml ...?>, <!-- -->
    // a line that opens and closes on itself: <tag ...>text</tag>
    const isComplete = /^<([\w:-]+)(\s[^>]*)?>.*<\/\1>\s*$/.test(line);
    const opensBlock = /^<[\w:-]/.test(line) && !isClose && !isSelfClose && !isDecl && !isComplete;

    if (isClose) depth = Math.max(0, depth - 1);
    out.push(indentUnit.repeat(depth) + line);
    if (opensBlock) depth += 1;
  }
  if (depth !== 0) throw new Error("tags aren't balanced");
  return out.join("\n");
}

/* ============================================================
   Component tree
   ============================================================ */
export default function GrismStudio() {
  const [doc, setDoc] = useState(() => normalizeDoc(TEMPLATES.find((t) => t.id === "starter").make())); // seed with the starter example

  const [tab, setTab] = useState("overview");

  // --- per-section undo/redo history (filters / inputs / outputs / actions / chains) ---
  // Each section keeps its own past/future stacks of JSON snapshots. We snapshot a
  // section whenever it changes (unless the change is itself an undo/redo). Undo/redo
  // act on the section matching the current tab. A tick state forces button re-render.
  const HIST_KEYS = ["filters", "inputs", "outputs", "actions", "chains"];
  const TAB_TO_KEY = { filters: "filters", inputs: "inputs", outputs: "outputs", actions: "actions", chain: "chains" };
  const histRef = useRef(Object.fromEntries(HIST_KEYS.map((k) => [k, { past: [], future: [], last: null, applying: false }])));
  const [histTick, setHistTick] = useState(0);
  const recordSection = (key, value) => {
    const h = histRef.current[key];
    const snap = JSON.stringify(value ?? []);
    if (h.last === null) { h.last = snap; return; }        // baseline
    if (snap === h.last) return;                            // no change
    if (h.applying) { h.applying = false; h.last = snap; return; } // from undo/redo
    h.past.push(h.last); if (h.past.length > 100) h.past.shift();
    h.future = [];
    h.last = snap;
    setHistTick((t) => t + 1);
  };
  useEffect(() => { recordSection("filters", doc.filters); }, [doc.filters]);
  useEffect(() => { recordSection("inputs", doc.inputs); }, [doc.inputs]);
  useEffect(() => { recordSection("outputs", doc.outputs); }, [doc.outputs]);
  useEffect(() => { recordSection("actions", doc.actions); }, [doc.actions]);
  useEffect(() => { recordSection("chains", doc.chains); }, [doc.chains]);
  const undoSection = useCallback((key) => {
    const h = histRef.current[key];
    if (!h.past.length) return;
    const prev = h.past.pop();
    h.future.push(h.last);
    h.applying = true;
    setDoc((d) => ({ ...d, [key]: JSON.parse(prev) }));
    setHistTick((t) => t + 1);
  }, []);
  const redoSection = useCallback((key) => {
    const h = histRef.current[key];
    if (!h.future.length) return;
    const nextSnap = h.future.pop();
    h.past.push(h.last);
    h.applying = true;
    setDoc((d) => ({ ...d, [key]: JSON.parse(nextSnap) }));
    setHistTick((t) => t + 1);
  }, []);
  const histKey = TAB_TO_KEY[tab] || null;
  // clear all undo/redo history — used after loading a template or running config,
  // so the load itself can't be undone back into the previous document.
  const resetHistory = useCallback(() => {
    HIST_KEYS.forEach((k) => { histRef.current[k] = { past: [], future: [], last: null, applying: false }; });
    setHistTick((t) => t + 1);
  }, []);
  // pending "replace the whole document" action, awaiting user confirmation.
  // Loading a template or running config discards current edits, so we confirm first.
  const [pendingLoad, setPendingLoad] = useState(null); // { run: () => void, kind: "template" | "running" }
  const canUndo = histKey ? histRef.current[histKey].past.length > 0 : false;
  const canRedo = histKey ? histRef.current[histKey].future.length > 0 : false;
  const doUndo = useCallback(() => { if (histKey) undoSection(histKey); }, [histKey, undoSection]);
  const doRedo = useCallback(() => { if (histKey) redoSection(histKey); }, [histKey, redoSection]);
  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo — on any section tab, and
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
  const [theme, setTheme] = useState("dark"); // "light" | "dark" — default dark, not persisted
  const [lang, setLang] = useState("en"); // "en" | "zh-TW" — UI language, not persisted
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
    setDoc((d) => ({ ...d, filters: d.filters.map((f) => f.id === fid ? { ...f, root: updater(f.root) } : f) }));
  }, []);
  // update the tree of one chain (by cid)
  const setChainTreeFor = useCallback((cid, updater) => {
    setDoc((d) => ({ ...d, chains: d.chains.map((c) => c.cid === cid ? { ...c, tree: updater(c.tree) } : c) }));
  }, []);

  const runXml = useMemo(() => serializeRun(doc), [doc]);

  // "dirty" tracking: baseline is the XML as last loaded from / applied to the
  // device. When the current runXml differs, there are unapplied changes.
  const [baseline, setBaseline] = useState(null); // null until first load/apply
  const [docSource, setDocSource] = useState("template"); // "template" | "running" | "new" — drives which top-bar button is highlighted
  const [templateName, setTemplateName] = useState(() => TEMPLATES.find((t) => t.id === "starter")?.title ?? "Starter"); // title of the template the doc came from (for the Templates button label)
  const dirty = baseline !== null && runXml !== baseline;

  // in-port conflict: two chains sharing the same first ingress port
  const inPortConflicts = useMemo(() => {
    const seen = new Map();
    (doc.chains ?? []).forEach((c) => {
      const first = (c.ports || "").split(",")[0].trim();
      if (!first) return;
      seen.set(first, (seen.get(first) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p));
  }, [doc.chains]);

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
    const w = [...inPortConflicts].map((p) => ({ id: "conflict-" + p, scope: "chain", msg: `two chains both ingress on ${p}`, label: "in port" }));
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
  }, [inPortConflicts, doc.chains, definedIds, outputIds, deviceFilterIds]);

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
      setDoc(normalized);
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
  const loadRunning = useCallback(() => {
    setPendingLoad({ kind: "running", run: doLoadRunning });
  }, [doLoadRunning]);

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
        <button className="brand" onClick={() => setTab("overview")} title={t("brand.tip")}>
          <span className="logo">◇</span>
          <span className="brand-name">GRISM</span>
          <span className="brand-sub">studio</span>
        </button>
        <nav className="tabs">
          {[["filters","core"],["inputs","adv"],["outputs","adv"],["actions","adv"],["chain","core"],["simulate","core"],["export","core"]].map(([k, grp], i, arr) => {
            const prevGrp = i > 0 ? arr[i-1][1] : null;
            const showDivider = grp === "adv" && prevGrp !== "adv";     // before the advanced block
            const showDividerAfter = grp === "adv" && (i === arr.length-1 || arr[i+1][1] !== "adv"); // after it
            return (
              <React.Fragment key={k}>
                {showDivider && <span className="tab-sep" title="Advanced — most setups don't need these"><span className="tab-sep-label">{t("nav.advanced")}</span></span>}
                <button className={"tab" + (tab === k ? " on" : "") + (grp === "adv" ? " adv" : "")} onClick={() => setTab(k)}>
                  {t("tab." + k)}
                  {k === "filters" && <span className="tab-badge">{doc.filters.length}</span>}
                  {k === "inputs" && (doc.inputs?.length ?? 0) > 0 && <span className="tab-badge">{doc.inputs.length}</span>}
                  {k === "outputs" && (doc.outputs?.length ?? 0) > 0 && <span className="tab-badge">{doc.outputs.length}</span>}
                  {k === "actions" && (doc.actions?.length ?? 0) > 0 && <span className="tab-badge">{doc.actions.length}</span>}
                  {k === "chain" && (doc.chains?.length ?? 0) > 0 && <span className="tab-badge">{doc.chains.length}</span>}
                </button>
                {showDividerAfter && <span className="tab-sep" />}
              </React.Fragment>
            );
          })}
        </nav>
        {histKey && (
          <div className="topbar-undo" title={t("undo.tip")}>
            <button className="undo-btn" onClick={doUndo} disabled={!canUndo} title={t("undo.undo")}>↶</button>
            <button className="undo-btn" onClick={doRedo} disabled={!canRedo} title={t("undo.redo")}>↷</button>
          </div>
        )}
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
        <div className={"health " + (allProblems.length ? "bad" : allWarnings.length ? "warn" : "ok")}>
          <span className="dot" />{allProblems.length ? `${allProblems.length} ${allProblems.length>1?t("health.issues"):t("health.issue")}` : allWarnings.length ? `${allWarnings.length} ${allWarnings.length>1?t("health.warnings"):t("health.warning")}` : t("health.valid")}
        </div>
      </header>
      {load.state === "error" && <div className="load-banner err">{t("banner.loadFailed")}: {load.msg}. {t("banner.checkSignedIn")}</div>}
      {load.state === "ok" && load.msg.includes("warning") && <div className="load-banner warn">{load.msg} — {t("banner.someUnrecognised")}</div>}

      {login.open && (
        <div className="tmpl-scrim" onClick={() => setLogin((l) => ({ ...l, open: false }))}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tmpl-modal-head">
              <span className="tmpl-modal-title">{t("login.title")}</span>
              <button className="tmpl-close" onClick={() => setLogin((l) => ({ ...l, open: false }))}>✕</button>
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
              <button className="tmpl-close" onClick={() => setShowTemplates(false)}>✕</button>
            </div>
            <TemplatesTab lang={lang} t={t} onApply={(tpl) => setPendingLoad({ kind: "template", run: () => { const nd = normalizeDoc(tpl.make()); setDoc(nd); setBaseline(null); setDocSource("template"); setTemplateName(tpl.title); setLoad({ state: "idle", msg: "" }); resetHistory(); setActiveFilter(1); setShowTemplates(false); } })} />
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
          <OverviewTab doc={doc} docSource={docSource} templateName={templateName} lang={lang} t={t}
            onGoto={(dest) => setTab(dest)} />
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
            inPortConflicts={inPortConflicts} t={t}
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
              setDoc(normalizeDoc(parsed));
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
            onGoto={(scope) => {
            if (scope === "chain" || scope.startsWith("chain:")) {
              if (scope.startsWith("chain:")) setActiveChain(scope.slice(6));
              setTab("chain");
            }
            else if (scope[0] === "I") { setActiveInput(+scope.slice(1)); setTab("inputs"); }
            else if (scope[0] === "O") { setActiveOutput(+scope.slice(1)); setTab("outputs"); }
            else if (scope[0] === "A") { setActiveAction(+scope.slice(1)); setTab("actions"); }
            else { setActiveFilter(+scope.slice(1)); setTab("filters"); }
          }} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Overview tab — auto-generated explanation of the current doc
   ============================================================ */
function OverviewTab({ doc, docSource, templateName, onGoto, lang, t }) {
  const tr = t || ((k) => k);
  const info = useMemo(() => describeDoc(doc, tr), [doc, lang]);
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
      <div className="ov-head">
        <div>
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
            {info.filters.map((f) => (
              <div className="ov-filter" key={f.id}>
                <code className="ov-fid">{f.id}</code>
                <div className="ov-fbody">
                  {f.name && <span className="ov-fname">{f.name}</span>}
                  <span className="ov-fcond">{f.cond || tr("ov.noCondition")}</span>
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
// Pick a template field in the requested language, falling back to the base field.
// e.g. tmplText(tpl, "detail", "zh-TW") → tpl.detail_zh || tpl.detail.
function tmplText(tpl, field, lang) {
  if (lang === "zh-TW" && tpl[field + "_zh"]) return tpl[field + "_zh"];
  return tpl[field] || "";
}

// Flow diagram for one chain. Renders the decision TREE: each filter test sits at
// a column by its depth; its match and notmatch each point either to another test
// (deeper column) or to an output port (shared right column). Every arrow is
// labelled by its real side, so match/no-match are never confused — even when the
// match side is the one that continues to the next test.
function ChainFlow({ chain, filterNames = {}, t }) {
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
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="ov-flow">
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
            <text x={outX + outW / 2} y={destY[d] + 5} className="ovf-out-lbl">{d}</text>
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
}
// count comma-separated fid tokens (for "any"/"all" hint)
function toks(fids) { return String(fids || "").split(",").map((s) => s.trim()).filter(Boolean).length; }
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
            <span className="drag-handle" title="Drag to reorder">⠿</span>
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
    setDoc((d) => ({ ...d, filters: [...d.filters, { id: nextId, name: "", sessionBase: "no", matchedlog: "no", root: mkGroup("or") }] }));
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
        {props.canRemove && <button className="icon-btn" onClick={() => props.onRemove(node.id)}>✕</button>}
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
      {canRemove && <button className="icon-btn" onClick={() => onRemove(node.id)}>✕</button>}
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
    setDoc((d) => ({ ...d, inputs: [...(d.inputs ?? []), mkInput(nextId)] }));
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
                  <button className="fp-del" title={tr("in.remove")} onClick={() => removeFilepath(i)}>✕</button>
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
      <button className="icon-btn" onClick={() => onRemove(mod.id)}>✕</button>
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
      <button className="icon-btn" onClick={() => onRemove(mod.id)}>✕</button>
      {err && <div className="row-err">{err}</div>}
    </div>
  );
}

/* ============================================================
   Chain tab — decision tree canvas
   ============================================================ */
const NODE_W = 150, NODE_H = 52, H_GAP = 34, V_GAP = 60, PH_H = 40;
function layoutChain(root) {
  const placed = [], edges = [];
  const inNode = { id: "__in__", t: "in", ports: root.ports, child: root.tree };
  function width(node) {
    if (!node) return 0;
    if (node.t === "in") return width(node.child);
    if (node.t === "out" || node.t === UNSET) return NODE_W;
    const wm = width(node.match), wn = width(node.notmatch);
    const kids = (wm ? 1 : 0) + (wn ? 1 : 0);
    return kids === 0 ? NODE_W : Math.max(NODE_W, wm + wn + (kids > 1 ? H_GAP : 0));
  }
  function place(node, x, y, parent, kind) {
    if (!node) return;
    if (node.t === "in") {
      const w = width(node.child) || NODE_W, cx = x + w / 2;
      placed.push({ ...node, _x: cx - NODE_W / 2, _y: y });
      if (node.child) { edges.push({ from: node.id, to: node.child.id, kind: "flow" }); place(node.child, x, y + NODE_H + V_GAP, node, "flow"); }
      return;
    }
    if (node.t === "out" || node.t === UNSET) {
      placed.push({ ...node, _x: x + (width(node) - NODE_W) / 2, _y: y });
      if (parent) edges.push({ from: parent.id, to: node.id, kind }); return;
    }
    const wm = width(node.match), wn = width(node.notmatch);
    const total = Math.max(NODE_W, wm + wn + ((wm && wn) ? H_GAP : 0)), cx = x + total / 2;
    placed.push({ ...node, _x: cx - NODE_W / 2, _y: y });
    if (parent) edges.push({ from: parent.id, to: node.id, kind });
    let cur = x; const cy = y + NODE_H + V_GAP;
    if (node.match) { place(node.match, cur, cy, node, "match"); cur += wm + H_GAP; }
    if (node.notmatch) place(node.notmatch, cur, cy, node, "notmatch");
  }
  place(inNode, 0, 0, null, null);
  const totalW = width(inNode) || NODE_W;
  const maxY = Math.max(...placed.map((n) => n._y)) + NODE_H;
  return { placed, edges, totalW, totalH: maxY };
}

/* Collapsible multi-select: a header (click to expand) showing the picked
   count, a select/clear-all row, and the checkbox list. Used for filter and
   port pickers, which can get long. */
/* Collapsible optional section for the inspector — defaults collapsed. Shows a
   small "set" hint on the header when it contains a configured value, so a
   collapsed section with an active setting is still discoverable. */
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

function ChainTab({ doc, definedIds, outputIds, setChainTreeFor, setDoc, activeChain, setActiveChain, inPortConflicts, portOptions, portsFromDevice, t }) {
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
          const conflict = inPortConflicts.has(inP);
          return (
            <div key={c.cid}
              className={"chain-item sortable" + (c.cid === cid ? " on" : "") + (c.cid === chainOverCid && chainDragCid !== c.cid ? " drop-target" : "") + (c.cid === chainDragCid ? " dragging" : "")}
              draggable
              onDragStart={(e) => { setChainDragCid(c.cid); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); if (chainOverCid !== c.cid) setChainOverCid(c.cid); }}
              onDragEnd={() => { setChainDragCid(null); setChainOverCid(null); }}
              onDrop={(e) => { e.preventDefault(); if (chainDragCid != null) moveChain(chainDragCid, c.cid); setChainDragCid(null); setChainOverCid(null); }}
              onClick={() => { setActiveChain(c.cid); setSelId(null); }}>
              <span className="drag-handle" title={tr("ch.dragReorder")}>⠿</span>
              <span className="chain-flow"><b>{inP || "?"}</b> <span className="arr">→</span> <span className="dest">{chainDest(c)}</span></span>
              {conflict && <span className="chain-conflict" title={tr("ch.portConflict")}>⚠</span>}
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
            {inPortConflicts.has(chainInFirst(chain)) && (
              <p className="conflict-note">Another chain also ingresses on <code>{chainInFirst(chain)}</code>. Each ingress port should feed one chain — the device may only apply one.</p>
            )}
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
                <button className="inline-dev-del" onMouseDown={(e) => e.stopPropagation()} onClick={() => onRemoveInline(d.id)} title={tr("sim.remove")}>✕</button>
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

