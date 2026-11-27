/* Ayers Household - Work screens
 * Work home (tiles for each area the person can see), the comp / OT tracker (time entries,
 * comp balance by July–June fiscal year, the printable monthly B-2CL time sheet), work receipts
 * (receipt + line items in one form, the yearly per-person report), and job applications
 * (status chips, follow-ups, companies and contacts, jobs, the communication log and files).
 * Data comes from work.load; simple adds and edits use the shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, $$, toast, ICONS, svg, section, plural } = C;

  const wk = { data: null, loading: false, error: "", appFilter: "Open", company: "" };
  const IC = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    brief: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
    sheet: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    building: svg('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>'),
    chat: svg('<path d="M4 5h16v11H8l-4 4z"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>')
  };

  const D = () => wk.data;
  const rows = t => (D() && D()[t]) || [];
  const byId = (t, id) => { const s = ctx.schema(t); return s ? rows(t).find(r => r[s.id] === id) || null : null; };
  const see = a => M.can(ctx, a, "view");
  const can = (t, op, row, values) => M.tableCan(ctx, t, op, row, values);
  const day = s => s ? M.fmtDay(s, { weekday: undefined, year: "numeric" }) : "";
  const short = s => s ? M.fmtDay(s, { weekday: undefined }) : "";
  const today = () => D().today;
  const me = () => C.state.me.id;
  const uname = id => M.userName(ctx, id);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const hrs = n => { const v = r2(n); return (v === Math.round(v) ? String(v) : v.toFixed(2).replace(/0$/, "")) + " h"; };
  const listVals = name => rows("lists").filter(l => l["List"] === name && l["Active"] !== false)
    .sort((a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999) || a["Value"].localeCompare(b["Value"])).map(l => l["Value"]);
  const company = id => byId("companies", id);
  const companyName = id => (company(id) || {})["Name"] || "";
  const fyOf = iso => { const y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7); return m >= 7 ? y : y - 1; };
  const fyLabel = y => "FY " + y + "–" + String(y + 1).slice(2);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const kv = pairs => { const p = pairs.filter(x => x[1] !== "" && x[1] !== undefined && x[1] !== null); return p.length ? '<div class="card kv">' + p.map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + (x[2] ? x[1] : esc(x[1])) + '</div>').join("") + '</div>' : ""; };
  const tileBtn = (attrs, icon, label, info) => '<a class="home-link" ' + attrs + '><span class="home-icon">' + icon + '</span><span class="home-text"><span class="home-label">' + esc(label) + '</span>' +
    (info ? '<span class="home-info">' + esc(info) + '</span>' : "") + '</span></a>';
  const linkRow = (href, icon, title, sub, right) => '<a class="list-item" href="' + href + '"><span class="thumb">' + icon + '</span><div class="body"><div class="title">' + esc(title) + '</div>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div>' + (right || '<span class="thumb">' + ICONS.next + '</span>') + '</a>';
  const empty = msg => '<div class="card"><div class="empty">' + esc(msg) + '</div></div>';
  const linkify = url => /^https?:\/\//i.test(String(url || "")) ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(String(url).replace(/^https?:\/\/(www\.)?/i, "").slice(0, 48)) + '</a>' : esc(url || "");

  async function load() {
    wk.loading = true; wk.error = "";
    try { wk.data = await C.api("work.load"); }
    catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { wk.loading = false; C.handleError(err); return; }
      wk.error = err.message;
    } finally { wk.loading = false; }
    if (C.parseRoute().name === "work") C.render();
  }

  const ctx = {
    key: "work",
    data: () => wk.data,
    applyData: d => { wk.data = d; },
    schema: t => wk.data.schema[t],
    rows: t => rows(t),
    defaults: t => t === "contacts" && wk.company ? { "Company ID": wk.company } : {},
    refLabel: (t, r) => {
      switch (t) {
        case "categories": return r["Category"];
        case "companies": return r["Name"];
        case "contacts": return r["Name"] + (r["Title"] ? " · " + r["Title"] : "");
        case "applications": return companyName(r["Company ID"]) + (r["Date Submitted"] ? " · " + day(r["Date Submitted"]) : "");
        case "receipts": return [r["Store"], day(r["Date"])].filter(Boolean).join(" · ");
        case "lists": return r["Value"];
        default: return r[ctx.schema(t).fields[0].name] || "";
      }
    },
    title: (t, r) => {
      switch (t) {
        case "entries": return (r["Activity"] || "Time entry") + " · " + short(r["Date"]);
        case "profiles": return "Time sheet details";
        case "jobs": return r["Job Title"];
        case "comms": return [r["Type"], r["Direction"]].filter(Boolean).join(" · ") + " · " + short(r["When"]);
        default: return ctx.refLabel(t, r);
      }
    },
    singular: t => ({ entries: "time entry", categories: "time sheet category", profiles: "time sheet details", receipts: "receipt", companies: "company", contacts: "contact", applications: "application", jobs: "job", comms: "log entry", lists: "list value" }[t] || "entry"),
    hideField: (t, name, values, row) => {
      if ((t === "entries" || t === "applications") && name === "Person") return !D().seesAll[t === "entries" ? "time" : "applications"];
      if ((t === "applications" || t === "comms") && name === "Follow Up Done") return !row;
      return false;
    },
    formOpts: t => ({ jobs: { hide: ["Application ID"] }, comms: { hide: ["Application ID"] }, contacts: {} }[t] || {}),
    onFormReady: (t, form, row) => {
      if (t === "entries") wireEntryForm(form);
      if (t === "comms") {
        // Contacts: only the application's company.
        const appId = (form.querySelector('[name="Application ID"]') || {}).value;
        const a = byId("applications", appId), sel = form.querySelector('select[name="Contact ID"]');
        if (a && sel) $$("option", sel).forEach(o => { if (o.value && o.value !== "__new__") { const c = byId("contacts", o.value); if (c && c["Company ID"] !== a["Company ID"]) o.remove(); } });
        if (a) wk.company = a["Company ID"];
      }
    },
    save: async (action, payload, msg) => {
      C.busy(true);
      let res;
      try { res = await C.api(action, Object.assign({ module: "work", reload: true }, payload)); }
      catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        if (err.code === "FORBIDDEN") { wk.data = null; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast((typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) wk.data = res.moduleData; else await load();
      C.state.homeStale = true;
      C.render();
      return res || true;
    },
    reload: () => load()
  };

  // ==================================================================
  // COMP / OT
  // ==================================================================
  const tmHours = (s, e) => {
    const m = x => { const a = /^(\d{1,2}):(\d{2})/.exec(String(x || "")); return a ? (+a[1]) * 60 + (+a[2]) : null; };
    const a = m(s), b = m(e); if (a === null || b === null) return null;
    let d = b - a; if (d < 0) d += 1440; return r2(d / 60);
  };
  const entryKind = r => r["Comp Use"] === true ? "Comp used" : r["Time Sheet"] === true ? "Time sheet" : r["OT Rate"] === true ? "OT 1.5×" : "Comp earned";
  function wireEntryForm(form) {
    const q = n => form.querySelector('[name="' + n + '"]');
    const box = document.createElement("div");
    box.className = "hint wk-calc";
    const end = q("End Time"); if (end) end.closest(".field").after(box);
    const catField = (q("Category ID") || {}).closest ? q("Category ID").closest(".field") : null;
    const upd = () => {
      const h = tmHours((q("Start Time") || {}).value, (q("End Time") || {}).value);
      const use = q("Comp Use") && q("Comp Use").checked, ts = q("Time Sheet") && q("Time Sheet").checked, ot = q("OT Rate") && q("OT Rate").checked;
      [q("OT Rate"), q("Time Sheet")].forEach(c => { if (c) c.disabled = use; });
      if (q("Comp Use")) q("Comp Use").disabled = ts || ot;
      if (catField) catField.hidden = !ts;
      box.textContent = h === null ? "" : hrs(h) + " · " + (use ? "uses " + hrs(h) + " of comp" : ts ? "paid on the time sheet (no comp)" : "earns " + hrs(ot ? h * 1.5 : h) + " comp");
    };
    form.addEventListener("input", upd); form.addEventListener("change", upd); upd();
  }
  function compSums(list) {
    const earned = r2(list.filter(r => Number(r["Comp Hours"]) > 0).reduce((s, r) => s + Number(r["Comp Hours"]), 0));
    const used = r2(-list.filter(r => Number(r["Comp Hours"]) < 0).reduce((s, r) => s + Number(r["Comp Hours"]), 0));
    const sheet = r2(list.filter(r => r["Time Sheet"] === true).reduce((s, r) => s + (Number(r["Hours"]) || 0), 0));
    return { earned: earned, used: used, balance: r2(earned - used), sheet: sheet };
  }
  const people = (list, field) => { const ids = []; list.forEach(r => { if (r[field] && ids.indexOf(r[field]) === -1) ids.push(r[field]); }); return ids; };
  function personPicker(ids, on, base) {
    if (ids.length < 2) return "";
    return '<div class="segmented">' + ids.map(id => '<button class="' + (id === on ? "on" : "") + '" data-wk="go" data-to="' + esc(base + encodeURIComponent(id)) + '">' + esc(uname(id)) + '</button>').join("") + '</div>';
  }

  function viewTime(fyArg, personArg) {
    const all = rows("entries");
    const ids = people(all, "Person"); if (ids.indexOf(me()) === -1) ids.unshift(me());
    const person = personArg && ids.indexOf(personArg) !== -1 ? personArg : me();
    const mine = all.filter(r => r["Person"] === person);
    const fys = []; mine.forEach(r => { const y = fyOf(r["Date"]); if (fys.indexOf(y) === -1) fys.push(y); });
    const cur = fyOf(today()); if (fys.indexOf(cur) === -1) fys.push(cur);
    fys.sort((a, b) => b - a);
    const fy = fyArg && !isNaN(+fyArg) ? +fyArg : cur;
    const inFy = mine.filter(r => fyOf(r["Date"]) === fy).sort((a, b) => String(b["Date"] + b["Start Time"]).localeCompare(String(a["Date"] + a["Start Time"])));
    const life = compSums(mine), yr = compSums(inFy);
    const stat = (n, l) => '<div class="wk-stat"><div class="wk-num">' + esc(n) + '</div><div class="wk-lab">' + esc(l) + '</div></div>';
    const base = "#/work/time/";
    const head = personPicker(D().seesAll.time ? ids : [], person, base + fy + "/") +
      '<div class="card wk-stats">' + stat(hrs(life.balance), "Comp available") + stat(hrs(yr.earned), "Earned " + fyLabel(fy)) + stat(hrs(yr.used), "Used " + fyLabel(fy)) + stat(hrs(yr.sheet), "Time sheet " + fyLabel(fy)) + '</div>' +
      '<div class="segmented">' + fys.map(y => '<button class="' + (y === fy ? "on" : "") + '" data-wk="go" data-to="' + base + y + (person !== me() ? "/" + encodeURIComponent(person) : "") + '">' + fyLabel(y) + '</button>').join("") + '</div>';
    // Grouped by month, newest first.
    const groups = {};
    inFy.forEach(r => { const k = String(r["Date"]).slice(0, 7); (groups[k] = groups[k] || []).push(r); });
    const body = Object.keys(groups).sort().reverse().map(k => {
      const list = groups[k], s = compSums(list), y = +k.slice(0, 4), m = +k.slice(5, 7);
      const tsLink = list.some(r => r["Time Sheet"] === true) ? '<a class="link-btn" href="#/work/timesheet/' + k + (person !== me() ? "/" + encodeURIComponent(person) : "") + '">Time sheet</a>' : "";
      return section(MONTHS_LONG[m - 1] + " " + y, '<div class="card list">' + list.map(r => {
        const ch = Number(r["Comp Hours"]) || 0;
        return '<div class="list-item" role="button" tabindex="0" data-mod-edit="entries" data-id="' + esc(r["Entry ID"]) + '"><div class="body"><div class="title">' + esc(r["Activity"]) + '</div>' +
          '<div class="sub">' + esc([short(r["Date"]), M.fmtTime("T" + r["Start Time"]) + "–" + M.fmtTime("T" + r["End Time"]), hrs(r["Hours"]), entryKind(r)].join(" · ")) + '</div></div>' +
          '<div class="wk-ch ' + (ch < 0 ? "neg" : ch > 0 ? "pos" : "") + '">' + (ch ? (ch > 0 ? "+" : "") + hrs(ch) : r["Time Sheet"] === true ? "TS" : "") + '</div></div>';
      }).join("") + '</div><p class="hint wk-msum">' + esc("Comp +" + hrs(s.earned) + " / −" + hrs(s.used) + (s.sheet ? " · time sheet " + hrs(s.sheet) : "")) + '</p>', tsLink);
    }).join("") || empty("No time entries in " + fyLabel(fy) + ".");
    const add = can("entries", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-wk="add-entry">' + ICONS.plus + 'Time entry</button>' +
      '<a class="btn" href="#/work/timesheet/' + today().slice(0, 7) + (person !== me() ? "/" + encodeURIComponent(person) : "") + '">' + IC.sheet + ' Time sheet</a></div>' : "";
    const links = '<div class="card list">' + linkRow("#/work/categories", IC.tag, "Time sheet categories", "Descriptions and account numbers") +
      linkRow("#/work/profile" + (person !== me() ? "/" + encodeURIComponent(person) : ""), IC.sheet, "Time sheet details", "Employer, position title, employee number") + '</div>';
    return { title: "Comp / OT", back: true, html: add + head + body + section("Settings", links) };
  }

  // The monthly time sheet: one line per category, a column per day.
  function viewTimesheet(month, personArg) {
    const person = personArg || me();
    if (!/^\d{4}-\d{2}$/.test(month || "")) month = today().slice(0, 7);
    const y = +month.slice(0, 4), m = +month.slice(5, 7), days = new Date(y, m, 0).getDate();
    const list = rows("entries").filter(r => r["Person"] === person && r["Time Sheet"] === true && String(r["Date"]).slice(0, 7) === month);
    const prof = rows("profiles").find(p => p["Person"] === person) || {};
    const lines = {};
    list.forEach(r => {
      const k = r["Category ID"] || "";
      const L = lines[k] = lines[k] || { cells: Array(32).fill(0), total: 0, notes: [] };
      const d = +String(r["Date"]).slice(8, 10);
      L.cells[d] = r2(L.cells[d] + (Number(r["Hours"]) || 0)); L.total = r2(L.total + (Number(r["Hours"]) || 0));
    });
    const keys = Object.keys(lines).sort((a, b) => String((byId("categories", a) || {})["Category"] || "").localeCompare(String((byId("categories", b) || {})["Category"] || "")));
    const dayTot = Array(32).fill(0); keys.forEach(k => lines[k].cells.forEach((c, i) => dayTot[i] = r2(dayTot[i] + c)));
    const grand = r2(keys.reduce((s, k) => s + lines[k].total, 0));
    const cell = v => v ? String(v) : "";
    const dcols = Array.from({ length: days }, (_, i) => i + 1);
    const prevM = m === 1 ? (y - 1) + "-12" : y + "-" + String(m - 1).padStart(2, "0"), nextM = m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
    const suffix = person !== me() ? "/" + encodeURIComponent(person) : "";
    const nav = '<div class="actions wk-noprint" style="margin:0 0 8px"><a class="btn" href="#/work/timesheet/' + prevM + suffix + '">‹ ' + MONTHS[(m + 10) % 12] + '</a>' +
      '<a class="btn" href="#/work/timesheet/' + nextM + suffix + '">' + MONTHS[m % 12] + ' ›</a><button class="btn primary" data-wk="print">Print</button></div>';
    const sheet = '<div class="wk-print wk-ts">' +
      '<div class="wk-ts-head"><div><b>' + esc(String(prof["Employer"] || "").toUpperCase()) + '</b><br>' + esc(String(prof["Form Title"] || "Time Sheet").toUpperCase()) + '</div>' +
      '<div class="wk-ts-form">' + esc(prof["Form"] || "") + '</div></div>' +
      '<div class="wk-ts-info"><div><span>Name</span><b>' + esc(uname(person)) + '</b></div><div><span>Month / Year</span><b>' + esc(MONTHS_LONG[m - 1] + " " + y) + '</b></div>' +
      '<div><span>Position title</span><b>' + esc(prof["Position Title"] || "") + '</b></div><div><span>Employee #</span><b>' + esc(prof["Employee Number"] || "") + '</b></div></div>' +
      '<div class="wk-ts-wrap"><table class="wk-ts-grid"><thead><tr><th class="wk-ts-acct">Account #</th><th class="wk-ts-desc">Description</th>' + dcols.map(d => '<th>' + d + '</th>').join("") + '<th>Total</th></tr></thead><tbody>' +
      (keys.map(k => { const c = byId("categories", k) || {}, L = lines[k];
        return '<tr><td class="wk-ts-acct">' + esc(c["Account"] || "") + '</td><td class="wk-ts-desc">' + esc(c["Category"] || "(no category)") + '</td>' + dcols.map(d => '<td>' + cell(L.cells[d]) + '</td>').join("") + '<td><b>' + cell(L.total) + '</b></td></tr>'; }).join("") ||
        '<tr><td colspan="' + (days + 3) + '" class="wk-ts-none">No time sheet entries this month.</td></tr>') +
      '</tbody><tfoot><tr><td></td><td class="wk-ts-desc"><b>Total</b></td>' + dcols.map(d => '<td>' + cell(dayTot[d]) + '</td>').join("") + '<td><b>' + cell(grand) + '</b></td></tr></tfoot></table></div>' +
      '<div class="wk-ts-sign"><div>Employee signature</div><div>Date</div><div>Supervisor signature</div><div>Date</div></div></div>';
    const missing = !prof["Position Title"] ? '<p class="hint wk-noprint">Add your position title and employee number on <a href="#/work/profile' + suffix + '">Time sheet details</a>.</p>' : "";
    return { title: "Time sheet · " + MONTHS[m - 1] + " " + y, back: true, html: nav + missing + sheet };
  }

  function viewProfile(personArg) {
    const person = personArg || me();
    const p = rows("profiles").find(x => x["Person"] === person);
    const f = n => M.shownValue(ctx, ctx.schema("profiles").fields.find(x => x.name === n), p ? p[n] : "");
    const html = (p ? kv([["Person", uname(person)], ["Employer", f("Employer")], ["Form", f("Form")], ["Form title", f("Form Title")], ["Position title", f("Position Title")], ["Employee number", f("Employee Number")]]) : empty("No time sheet details yet.")) +
      '<div class="actions">' + (p ? (can("profiles", "edit", p) ? '<button class="btn" data-mod-edit="profiles" data-id="' + esc(p["Profile ID"]) + '">Edit</button>' : "") :
        (can("profiles", "add") ? '<button class="btn primary" data-wk="add-profile" data-id="' + esc(person) + '">Add details</button>' : "")) + '</div>';
    return { title: "Time sheet details", back: true, html: html };
  }

  // ==================================================================
  // RECEIPTS
  // ==================================================================
  const linesOf = id => rows("lines").filter(l => l["Receipt ID"] === id).sort((a, b) => (Number(a["Sort"]) || 0) - (Number(b["Sort"]) || 0));
  // Each item line with its share of the receipt's tax and shipping.
  function allocated(r) {
    const ls = linesOf(r["Receipt ID"]), items = ls.filter(l => l["Kind"] === "Item");
    const sub = items.reduce((s, l) => s + (Number(l["Amount"]) || 0), 0);
    const extra = (Number(r["Tax"]) || 0) + (Number(r["Shipping"]) || 0);
    return items.map(l => Object.assign({}, l, { share: sub ? r2((Number(l["Amount"]) || 0) + (Number(l["Amount"]) || 0) / sub * extra) : r2(l["Amount"]) }));
  }

  function lineHtml(l, assigned) {
    const kind = l["Kind"] || "Item";
    const opt = (vals, v) => '<option value=""></option>' + (v && vals.indexOf(v) === -1 ? '<option selected>' + esc(v) + '</option>' : "") + vals.map(x => '<option' + (x === v ? " selected" : "") + '>' + esc(x) + '</option>').join("");
    const users = D().users || [];
    const who = l["Assigned To"] || assigned || "";
    if (kind !== "Item") return '<div class="wk-line wk-line-x" data-line data-kind="' + esc(kind) + '" data-id="' + esc(l["Line ID"] || "") + '">' +
      '<div class="wk-lx-l">' + esc(kind) + '</div><div class="money-wrap suffix-wrap"><span class="prefix">$</span><input type="number" step="0.01" inputmode="decimal" data-l="Price" value="' + esc(l["Price"] === undefined ? "" : l["Price"]) + '" aria-label="' + esc(kind) + '"></div>' +
      '<button type="button" class="icon-btn" data-wk-rm aria-label="Remove">' + ICONS.close + '</button></div>';
    return '<div class="wk-line" data-line data-kind="Item" data-id="' + esc(l["Line ID"] || "") + '"' + (l["Assigned To"] && l["Assigned To"] !== assigned ? ' data-touched="1"' : "") + '>' +
      '<input type="text" class="wk-l-item" data-l="Item" placeholder="Item" value="' + esc(l["Item"] || "") + '" aria-label="Item">' +
      '<input type="number" class="wk-l-qty" data-l="Quantity" step="any" inputmode="decimal" placeholder="Qty" value="' + esc(l["Quantity"] === undefined ? "" : l["Quantity"]) + '" aria-label="Quantity">' +
      '<div class="wk-l-price money-wrap suffix-wrap"><span class="prefix">$</span><input type="number" step="0.01" inputmode="decimal" data-l="Price" placeholder="Price" value="' + esc(l["Price"] === undefined ? "" : l["Price"]) + '" aria-label="Price each"></div>' +
      '<button type="button" class="icon-btn wk-l-rm" data-wk-rm aria-label="Remove line">' + ICONS.close + '</button>' +
      '<select data-l="Category" class="wk-l-cat" aria-label="Category">' + opt(listVals("Expense Category"), l["Category"] || "").replace('<option value=""></option>', '<option value="">Category</option>') + '</select>' +
      '<select data-l="Rationale" class="wk-l-rat" aria-label="Rationale">' + opt(listVals("Rationale"), l["Rationale"] || "").replace('<option value=""></option>', '<option value="">Rationale (optional)</option>') + '</select>' +
      '<select data-l="Assigned To" class="wk-l-who" aria-label="Assigned to">' + users.map(u => '<option value="' + esc(u.id) + '"' + (u.id === who ? " selected" : "") + '>' + esc(u.name) + '</option>').join("") + '</select>' +
      '<label class="check wk-l-inv"><input type="checkbox" data-l="Add To Inventory"' + (l["Add To Inventory"] === true ? " checked" : "") + '> Inventory</label></div>';
  }

  function receiptForm(id) {
    const t = ctx.schema("receipts");
    const row = id ? byId("receipts", id) : null;
    const editable = row ? can("receipts", "edit", row) : can("receipts", "add");
    const values = Object.assign({ "Date": M.isoDay(new Date()), "Paid By": me(), "Assigned To": me() }, row || {});
    const fld = n => t.fields.find(f => f.name === n);
    const cards = D().cards || [];
    const cardHtml = cards.length ? '<div class="field"><label for="wk_card">Payment card</label><select id="wk_card" name="Card"><option value=""></option>' +
      (values["Card"] && !cards.some(c => c.label === values["Card"]) ? '<option selected>' + esc(values["Card"]) + '</option>' : "") +
      cards.map(c => '<option' + (c.label === values["Card"] ? " selected" : "") + '>' + esc(c.label) + '</option>').join("") + '</select></div>' : M.fieldHtml(ctx, "receipts", fld("Card"), values["Card"], {});
    const ls = row ? linesOf(id) : [];
    const startLines = ls.length ? ls : [{ "Kind": "Item", "Assigned To": values["Assigned To"] }];
    const body = (row ? '<div class="meta rec-meta">' + esc(row["Receipt ID"]) + '</div>' : "") +
      ["Date", "Store", "Paid By", "Assigned To"].map(n => M.fieldHtml(ctx, "receipts", fld(n), values[n], {})).join("") + cardHtml +
      '<div class="field"><label>Items</label><div class="wk-lines">' + startLines.map(l => lineHtml(l, values["Assigned To"])).join("") + '</div>' +
      '<div class="actions wk-line-add"><button type="button" class="btn" data-wk-addl="Item">' + ICONS.plus + 'Item</button><button type="button" class="btn" data-wk-addl="Tax">+ Tax</button><button type="button" class="btn" data-wk-addl="Shipping">+ Shipping</button></div>' +
      '<div class="wk-totals"></div></div>' +
      M.fieldHtml(ctx, "receipts", fld("Receipt"), values["Receipt"], {}) + M.fieldHtml(ctx, "receipts", fld("Notes"), values["Notes"], {}) +
      (row && can("receipts", "delete", row) ? '<div class="danger-zone"><button type="button" class="btn danger" data-wk-del>Delete receipt</button></div>' : "");
    let formEl;
    C.openSheet({
      title: row ? "Edit receipt" : "Add receipt", body: body, submitLabel: row ? "Save" : "Add", noSubmit: !editable,
      onReady: (form, close) => {
        formEl = form;
        if (!editable) $$("input, select, textarea, button[data-wk-addl], button[data-wk-rm]", form).forEach(el => el.disabled = true);
        M.wireAddNew(ctx, "receipts", form);
        M.wireFiles(ctx, form, row ? { table: "receipts", id: id, close: close } : null);
        const box = $(".wk-lines", form), tot = $(".wk-totals", form);
        const assignSel = form.querySelector('select[name="Assigned To"]');
        let lastAssign = assignSel ? assignSel.value : "";
        const totals = () => {
          let sub = 0, tax = 0, ship = 0;
          $$("[data-line]", box).forEach(el => {
            const p = Number((el.querySelector('[data-l="Price"]') || {}).value) || 0;
            if (el.dataset.kind === "Item") { const q = el.querySelector('[data-l="Quantity"]').value; sub += p * (q === "" ? 1 : Number(q) || 0); }
            else if (el.dataset.kind === "Tax") tax += p; else ship += p;
          });
          tot.innerHTML = '<span>Subtotal ' + esc(M.money(r2(sub))) + '</span>' + (tax ? '<span>Tax ' + esc(M.money(r2(tax))) + '</span>' : "") + (ship ? '<span>Shipping ' + esc(M.money(r2(ship))) + '</span>' : "") + '<b>Total ' + esc(M.money(r2(sub + tax + ship))) + '</b>';
        };
        form.addEventListener("input", totals);
        box.addEventListener("change", e => { if (e.target.matches('[data-l="Assigned To"]')) e.target.closest("[data-line]").dataset.touched = "1"; });
        if (assignSel) assignSel.addEventListener("change", () => {
          const v = assignSel.value;
          $$('[data-line][data-kind="Item"]', box).forEach(el => { const s = el.querySelector('[data-l="Assigned To"]'); if (!el.dataset.touched || s.value === lastAssign) { s.value = v || form.querySelector('select[name="Paid By"]').value; delete el.dataset.touched; } });
          lastAssign = v;
        });
        form.addEventListener("click", async e => {
          const add = e.target.closest("[data-wk-addl]");
          if (add) {
            const k = add.dataset.wkAddl;
            if (k !== "Item" && box.querySelector('[data-kind="' + k + '"]')) { box.querySelector('[data-kind="' + k + '"] input').focus(); return; }
            box.insertAdjacentHTML("beforeend", lineHtml({ "Kind": k }, assignSel ? assignSel.value : me()));
            const items = $$('[data-line][data-kind="Item"]', box), last = k === "Item" ? items[items.length - 1] : box.lastElementChild;
            if (k === "Item" && items.length) { box.insertBefore(last, box.querySelector('[data-kind="Tax"], [data-kind="Shipping"]')); }
            (last.querySelector("input") || {}).focus && last.querySelector("input").focus();
            totals(); return;
          }
          const rm = e.target.closest("[data-wk-rm]");
          if (rm) { rm.closest("[data-line]").remove(); totals(); return; }
          if (e.target.closest("[data-wk-del]")) {
            if (!(await M.confirmSheet({ title: "Delete receipt?", message: "Delete this receipt and its lines? An admin can bring it back.", submitLabel: "Delete", danger: true }))) return;
            try { await ctx.save("modDelete", { table: "receipts", id: id }, "Deleted"); close(); location.hash = "#/work/receipts"; } catch (err) { toast(err.message, true); }
          }
        });
        totals();
      },
      onSubmit: async v => {
        const vals = {};
        ["Date", "Store", "Paid By", "Assigned To", "Card", "Notes"].forEach(n => { if (n in v && v[n] !== "__new__") vals[n] = v[n]; });
        const lines = $$("[data-line]", formEl).map(el => {
          const o = { "Kind": el.dataset.kind };
          if (el.dataset.id) o.id = el.dataset.id;
          $$("[data-l]", el).forEach(i => { o[i.dataset.l] = i.type === "checkbox" ? i.checked : i.value; });
          return o;
        });
        const res = await ctx.save("work.saveReceipt", { receiptId: id || undefined, values: vals, lines: lines }, row ? "Receipt saved" : "Receipt added");
        if (!res) return false;
        for (const p of M.pickedFiles(formEl)) { try { await M.uploadFile(ctx, "receipts", res.id, p.field, p.file); } catch (err) { toast(err.message, true); } }
        if (!row) location.hash = "#/work/receipt/" + encodeURIComponent(res.id);
        return true;
      }
    });
  }

  function viewReceipts(yearArg) {
    const all = rows("receipts");
    const years = []; all.forEach(r => { const y = +String(r["Date"]).slice(0, 4); if (y && years.indexOf(y) === -1) years.push(y); });
    const cy = +today().slice(0, 4); if (years.indexOf(cy) === -1) years.push(cy);
    years.sort((a, b) => b - a);
    const year = yearArg && !isNaN(+yearArg) ? +yearArg : cy;
    const list = all.filter(r => String(r["Date"]).slice(0, 4) === String(year)).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])));
    const total = r2(list.reduce((s, r) => s + (Number(r["Total"]) || 0), 0));
    const html = (can("receipts", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-wk="add-receipt">' + ICONS.plus + 'Receipt</button>' +
      '<a class="btn" href="#/work/report/' + year + '">' + IC.chart + ' ' + year + ' report</a></div>' : "") +
      '<div class="segmented">' + years.map(y => '<button class="' + (y === year ? "on" : "") + '" data-wk="go" data-to="#/work/receipts/' + y + '">' + y + '</button>').join("") + '</div>' +
      section(list.length ? plural(list.length, "receipt") + " · " + M.money(total) : "Receipts", '<div class="card list">' + (list.map(r => {
        const ls = linesOf(r["Receipt ID"]).filter(l => l["Kind"] === "Item");
        const whos = people(ls, "Assigned To").map(uname).join(", ");
        return linkRow("#/work/receipt/" + encodeURIComponent(r["Receipt ID"]), IC.receipt, r["Store"] || "Receipt",
          [short(r["Date"]), plural(ls.length, "item"), whos].filter(Boolean).join(" · "), '<div class="vh-cost">' + esc(M.money(r["Total"])) + '</div>');
      }).join("") || '<div class="empty">No receipts in ' + year + '.</div>') + '</div>') +
      section("Lists", '<div class="card list">' + linkRow("#/work/lists", IC.tag, "Dropdown lists", "Stores, expense categories, rationale…") + '</div>');
    return { title: "Work receipts", back: true, html: html };
  }

  function viewReceipt(id) {
    const r = byId("receipts", id);
    if (!r) return { title: "Receipt", back: true, html: empty("That receipt isn’t here any more.") };
    const ls = linesOf(id), alloc = allocated(r);
    const share = lid => (alloc.find(a => a["Line ID"] === lid) || {}).share;
    const items = ls.filter(l => l["Kind"] === "Item");
    const html = '<div class="card hero"><h2>' + esc(r["Store"] || "Receipt") + '</h2><div class="meta">' + esc([r["Receipt ID"], day(r["Date"]), M.money(r["Total"])].join(" · ")) + '</div>' +
      (can("receipts", "edit", r) ? '<div class="actions"><button class="btn" data-wk="edit-receipt" data-id="' + esc(id) + '">Edit</button></div>' : "") + '</div>' +
      kv([["Paid by", uname(r["Paid By"])], ["Card", r["Card"]], ["Subtotal", M.money(r["Subtotal"])], ["Tax", r["Tax"] ? M.money(r["Tax"]) : ""], ["Shipping", r["Shipping"] ? M.money(r["Shipping"]) : ""], ["Total", M.money(r["Total"])]]) +
      section("Items", '<div class="card list">' + (items.map(l => '<div class="list-item"><div class="body"><div class="title">' + esc(l["Item"]) + (Number(l["Quantity"]) > 1 ? ' <span class="vh-every">× ' + esc(l["Quantity"]) + '</span>' : "") + '</div>' +
        '<div class="sub">' + esc([l["Category"], l["Rationale"], uname(l["Assigned To"]), l["Add To Inventory"] === true ? "→ Inventory" : ""].filter(Boolean).join(" · ")) + '</div>' +
        ((r["Tax"] || r["Shipping"]) ? '<div class="sub">' + esc("With tax/shipping: " + M.money(share(l["Line ID"]))) + '</div>' : "") + '</div><div class="vh-cost">' + esc(M.money(l["Amount"])) + '</div></div>').join("") || '<div class="empty">No items.</div>') + '</div>') +
      (r["Receipt"] ? section("Receipt", '<div class="card vh-file">' + M.fileHtml(ctx, r["Receipt"], "vh-receipt") + '</div>') : "") +
      (r["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(r["Notes"]) + '</div></div>') : "");
    return { title: "Receipt", back: true, html: html };
  }

  // Yearly report for one person (calendar year): category × month, rationale, receipts.
  function viewReport(yearArg, personArg) {
    const year = yearArg && !isNaN(+yearArg) ? +yearArg : +today().slice(0, 4);
    const inYear = rows("receipts").filter(r => String(r["Date"]).slice(0, 4) === String(year));
    const lineSets = inYear.map(r => ({ r: r, lines: allocated(r) }));
    const ids = []; lineSets.forEach(x => x.lines.forEach(l => { if (l["Assigned To"] && ids.indexOf(l["Assigned To"]) === -1) ids.push(l["Assigned To"]); }));
    if (ids.indexOf(me()) === -1) ids.unshift(me());
    const person = personArg && ids.indexOf(personArg) !== -1 ? personArg : me();
    const mine = []; lineSets.forEach(x => x.lines.filter(l => l["Assigned To"] === person).forEach(l => mine.push({ r: x.r, l: l })));
    const cats = {}, rats = {}, recs = {}, monthTot = Array(12).fill(0);
    mine.forEach(({ r, l }) => {
      const m = +String(r["Date"]).slice(5, 7) - 1, c = l["Category"] || "(no category)";
      (cats[c] = cats[c] || Array(12).fill(0))[m] += l.share;
      monthTot[m] += l.share;
      const ra = l["Rationale"] || "(none given)"; rats[ra] = r2((rats[ra] || 0) + l.share);
      const k = r["Receipt ID"]; recs[k] = recs[k] || { r: r, amt: 0, n: 0 }; recs[k].amt = r2(recs[k].amt + l.share); recs[k].n++;
    });
    const grand = r2(monthTot.reduce((s, v) => s + v, 0));
    const mo = v => v ? M.money(r2(v)) : "";
    const ck = Object.keys(cats).sort();
    const grid = '<div class="fin-gridwrap"><table class="fin-grid wk-rgrid"><thead><tr><th class="fin-rh">Category</th>' + MONTHS.map(x => '<th>' + x + '</th>').join("") + '<th>Total</th></tr></thead><tbody>' +
      ck.map(c => '<tr><th class="fin-rh">' + esc(c) + '</th>' + cats[c].map(v => '<td>' + mo(v) + '</td>').join("") + '<td><b>' + mo(cats[c].reduce((s, v) => s + v, 0)) + '</b></td></tr>').join("") +
      '</tbody><tfoot><tr><th class="fin-rh">Total</th>' + monthTot.map(v => '<td>' + mo(v) + '</td>').join("") + '<td><b>' + mo(grand) + '</b></td></tr></tfoot></table></div>';
    const byCat = '<div class="card list">' + ck.map(c => { const t = r2(cats[c].reduce((s, v) => s + v, 0)); return '<div class="list-item"><div class="body"><div class="title">' + esc(c) + '</div></div><div class="vh-cost">' + esc(M.money(t)) + '</div></div>'; }).join("") + '</div>';
    const html = '<div class="actions wk-noprint" style="margin:0 0 8px"><a class="btn" href="#/work/report/' + (year - 1) + '/' + encodeURIComponent(person) + '">‹ ' + (year - 1) + '</a><a class="btn" href="#/work/report/' + (year + 1) + '/' + encodeURIComponent(person) + '">' + (year + 1) + ' ›</a><button class="btn primary" data-wk="print">Print</button></div>' +
      '<div class="wk-noprint">' + personPicker(ids, person, "#/work/report/" + year + "/") + '</div>' +
      '<div class="wk-print"><h2 class="wk-rtitle">' + esc(uname(person) + " · work expenses " + year) + '</h2>' +
      '<p class="hint">' + esc(mine.length ? plural(mine.length, "item") + " on " + plural(Object.keys(recs).length, "receipt") + " · " + M.money(grand) + " including each line's share of tax and shipping." : "No work expenses assigned to " + uname(person) + " in " + year + ".") + '</p>' +
      (mine.length ? section("By category and month", '<div class="wk-desk">' + grid + '</div><div class="wk-phone">' + byCat + '</div>') +
        section("By rationale", '<div class="card list">' + Object.keys(rats).sort().map(k => '<div class="list-item"><div class="body"><div class="title">' + esc(k) + '</div></div><div class="vh-cost">' + esc(M.money(rats[k])) + '</div></div>').join("") + '</div>') +
        section("Receipts", '<div class="card list">' + Object.keys(recs).map(k => recs[k]).sort((a, b) => String(a.r["Date"]).localeCompare(String(b.r["Date"]))).map(x =>
          linkRow("#/work/receipt/" + encodeURIComponent(x.r["Receipt ID"]), IC.receipt, x.r["Store"] || "Receipt", [x.r["Receipt ID"], short(x.r["Date"]), plural(x.n, "item"), x.r["Receipt"] ? "receipt on file" : ""].filter(Boolean).join(" · "), '<div class="vh-cost">' + esc(M.money(x.amt)) + '</div>')).join("") + '</div>') : "") + '</div>';
    return { title: "Work expenses · " + year, back: true, html: html };
  }

  // ==================================================================
  // APPLICATIONS
  // ==================================================================
  const groups = () => D().statusGroups || {};
  const groupOf = s => Object.keys(groups()).find(g => groups()[g].indexOf(s) !== -1) || "Active";
  const isOpen = a => ["Closed"].indexOf(groupOf(a["Status"])) === -1 && a["Status"] !== "Accepted";
  // Open follow-ups of an application (its own and its log entries'), earliest first.
  function followUps(a) {
    const out = [];
    if (a["Follow Up Date"] && a["Follow Up Done"] !== true) out.push({ table: "applications", id: a["Application ID"], date: a["Follow Up Date"], text: "Follow up" });
    rows("comms").filter(c => c["Application ID"] === a["Application ID"] && c["Follow Up Date"] && c["Follow Up Done"] !== true)
      .forEach(c => out.push({ table: "comms", id: c["Log ID"], date: c["Follow Up Date"], text: "Follow up: " + String(c["Summary"] || "").slice(0, 60) }));
    return out.sort((x, y) => String(x.date).localeCompare(String(y.date)));
  }
  const nextFu = a => followUps(a)[0];
  const statusPill = s => '<span class="pill wk-st wk-st-' + esc(groupOf(s).toLowerCase()) + '">' + esc(s || "") + '</span>';
  const jobsOf = id => rows("jobs").filter(j => j["Application ID"] === id);

  function appRow(a) {
    const fu = nextFu(a), js = jobsOf(a["Application ID"]);
    const sub = [a["Application ID"], a["Date Submitted"] ? "applied " + short(a["Date Submitted"]) : "", js.length ? js.map(j => j["Job Title"]).slice(0, 2).join(", ") + (js.length > 2 ? " +" + (js.length - 2) : "") : "",
      D().seesAll.applications && a["Person"] !== me() ? uname(a["Person"]) : ""].filter(Boolean).join(" · ");
    return '<a class="list-item" href="#/work/app/' + encodeURIComponent(a["Application ID"]) + '"><span class="thumb">' + IC.brief + '</span><div class="body"><div class="title">' + esc(companyName(a["Company ID"]) || "Application") + '</div>' +
      '<div class="sub">' + esc(sub) + '</div>' + (fu ? '<div class="sub ' + (fu.date < today() ? "wk-over" : "") + '">' + esc((fu.date < today() ? "Follow-up overdue since " : "Follow up ") + day(fu.date)) + '</div>' : "") + '</div>' + statusPill(a["Status"]) + '</a>';
  }

  function viewApps(filterArg) {
    const all = rows("applications");
    const filter = filterArg || wk.appFilter;
    wk.appFilter = filter;
    const chips = ["Open"].concat(Object.keys(groups())).concat(["All"]);
    const count = f => all.filter(a => f === "All" ? true : f === "Open" ? isOpen(a) : groupOf(a["Status"]) === f).length;
    const shown = all.filter(a => filter === "All" ? true : filter === "Open" ? isOpen(a) : groupOf(a["Status"]) === filter);
    const t = today();
    shown.sort((a, b) => {
      const fa = nextFu(a), fb = nextFu(b), oa = fa && fa.date < t, ob = fb && fb.date < t;
      if (oa !== ob) return oa ? -1 : 1;
      if (oa && ob) return String(fa.date).localeCompare(String(fb.date));
      return String(b["Date Submitted"] || b["Added At"] || "").localeCompare(String(a["Date Submitted"] || a["Added At"] || ""));
    });
    const overdue = all.filter(a => { const f = nextFu(a); return f && f.date < t; }).length;
    // Yearly summary: applications by year submitted, by status group.
    const yrs = {};
    all.forEach(a => { const y = String(a["Date Submitted"] || a["Added At"] || "").slice(0, 4); if (!y) return; const g = groupOf(a["Status"]); yrs[y] = yrs[y] || { n: 0, jobs: 0 }; yrs[y].n++; yrs[y][g] = (yrs[y][g] || 0) + 1; yrs[y].jobs += jobsOf(a["Application ID"]).length; });
    const summary = Object.keys(yrs).sort().reverse().map(y => '<div class="list-item"><div class="body"><div class="title">' + esc(y + " · " + plural(yrs[y].n, "application") + " · " + plural(yrs[y].jobs, "job")) + '</div>' +
      '<div class="sub">' + esc(Object.keys(groups()).filter(g => yrs[y][g]).map(g => g + " " + yrs[y][g]).join(" · ")) + '</div></div></div>').join("");
    const html = (can("applications", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-wk="add-app">' + ICONS.plus + 'Application</button></div>' : "") +
      (overdue ? '<div class="notice">' + esc(plural(overdue, "follow-up") + " overdue") + '</div>' : "") +
      '<div class="segmented">' + chips.map(c => '<button class="' + (c === filter ? "on" : "") + '" data-wk="go" data-to="#/work/apps/' + encodeURIComponent(c) + '">' + esc(c) + ' <span class="wk-n">' + count(c) + '</span></button>').join("") + '</div>' +
      '<div class="card list">' + (shown.map(appRow).join("") || '<div class="empty">' + (all.length ? "None here." : "No applications yet.") + '</div>') + '</div>' +
      (summary ? section("By year", '<div class="card list">' + summary + '</div>') : "") +
      section("More", '<div class="card list">' + linkRow("#/work/companies", IC.building, "Companies & contacts", plural(rows("companies").length, "company", "companies")) +
        linkRow("#/work/lists", IC.tag, "Dropdown lists", "Statuses, applied through, communication types…") + '</div>');
    return { title: "Job applications", back: true, html: html };
  }

  function viewApp(id) {
    const a = byId("applications", id);
    if (!a) return { title: "Application", back: true, html: empty("That application isn’t here any more.") };
    wk.company = a["Company ID"];
    const c = company(a["Company ID"]) || {};
    const edit = can("applications", "edit", a);
    const fus = followUps(a);
    const js = jobsOf(id).sort((x, y) => String(x["Job Title"]).localeCompare(String(y["Job Title"])));
    const log = rows("comms").filter(x => x["Application ID"] === id).sort((x, y) => String(y["When"]).localeCompare(String(x["When"])));
    const contactName = cid => { const k = byId("contacts", cid); return k ? k["Name"] : ""; };
    const statusSel = edit ? '<select class="wk-status" data-wk-status="applications" data-id="' + esc(id) + '" aria-label="Status">' + listVals("Application Status").map(s => '<option' + (s === a["Status"] ? " selected" : "") + '>' + esc(s) + '</option>').join("") + '</select>' : statusPill(a["Status"]);
    const html = '<div class="card hero"><h2>' + esc(c["Name"] || "Application") + '</h2><div class="meta">' + esc([a["Application ID"], a["Date Submitted"] ? "Applied " + day(a["Date Submitted"]) : "Not submitted yet", D().seesAll.applications ? uname(a["Person"]) : ""].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="actions">' + statusSel + (edit ? '<button class="btn" data-mod-edit="applications" data-id="' + esc(id) + '">Edit</button>' : "") + '</div></div>' +
      (fus.length ? section("Follow-ups", '<div class="card list">' + fus.map(f => '<div class="list-item">' + (edit ? '<button class="sh-check" data-wk="fu-done" data-table="' + f.table + '" data-id="' + esc(f.id) + '" aria-label="Mark done"></button>' : "") +
        '<div class="body"><div class="title">' + esc(f.text) + '</div><div class="sub ' + (f.date < today() ? "wk-over" : "") + '">' + esc((f.date < today() ? "Overdue since " : "By ") + day(f.date)) + '</div></div></div>').join("") + '</div>') : "") +
      kv([["Applied through", a["Applied Through"]], ["Reference #", a["Reference Number"]], ["Resume", a["Resume Version"]], ["Cover letter", a["Cover Letter"] === true ? "Yes" : ""],
        ["Company site", c["Website"] ? linkify(c["Website"]) : "", true]]) +
      section("Jobs", '<div class="card list">' + (js.map(j => '<div class="list-item" role="button" tabindex="0" data-mod-edit="jobs" data-id="' + esc(j["Job ID"]) + '"><div class="body"><div class="title">' + esc(j["Job Title"]) + '</div>' +
        '<div class="sub">' + esc([j["Posting Number"] ? "#" + j["Posting Number"] : "", j["Location"], j["Job Type"], j["Pay"], j["Closing Date"] ? "closes " + short(j["Closing Date"]) : ""].filter(Boolean).join(" · ")) + '</div>' +
        (j["Link"] ? '<div class="sub">' + linkify(j["Link"]) + '</div>' : "") + '</div>' + statusPill(j["Status"]) + '</div>').join("") || '<div class="empty">No jobs added yet.</div>') + '</div>',
        can("jobs", "add") && edit ? '<button class="link-btn" data-wk="add-job" data-id="' + esc(id) + '">+ Add</button>' : "") +
      section("Communication log", '<div class="card list">' + (log.map(x => '<div class="list-item" role="button" tabindex="0" data-mod-edit="comms" data-id="' + esc(x["Log ID"]) + '"><span class="thumb">' + IC.chat + '</span><div class="body">' +
        '<div class="title">' + esc([x["Type"], x["Direction"], contactName(x["Contact ID"])].filter(Boolean).join(" · ")) + '</div><div class="sub">' + esc(M.fmtDayTime(x["When"])) + '</div>' +
        '<div class="sub wk-sum">' + esc(x["Summary"] || "") + '</div>' + (x["Follow Up Date"] ? '<div class="sub">' + esc("Follow up " + day(x["Follow Up Date"]) + (x["Follow Up Done"] === true ? " (done)" : "")) + '</div>' : "") +
        (x["Files"] ? '<div class="sub">📎 file attached</div>' : "") + '</div></div>').join("") || '<div class="empty">Nothing logged yet.</div>') + '</div>',
        can("comms", "add") && edit ? '<button class="link-btn" data-wk="add-com" data-id="' + esc(id) + '">+ Log</button>' : "") +
      (a["Files"] ? section("Files", '<div class="card vh-file">' + M.fileHtml(ctx, a["Files"], "vh-receipt") + '</div>') : "") +
      (a["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(a["Notes"]) + '</div></div>') : "") +
      section("Company", '<div class="card list">' + linkRow("#/work/company/" + encodeURIComponent(a["Company ID"]), IC.building, c["Name"] || "Company", plural(rows("contacts").filter(k => k["Company ID"] === a["Company ID"]).length, "contact") + " · " + plural(rows("applications").filter(x => x["Company ID"] === a["Company ID"]).length, "application")) + '</div>');
    return { title: "Application", back: true, html: html };
  }

  function viewCompanies() {
    const list = rows("companies").slice().sort((a, b) => String(a["Name"]).localeCompare(String(b["Name"])));
    const html = (can("companies", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-mod-add="companies">' + ICONS.plus + 'Company</button></div>' : "") +
      '<div class="card list">' + (list.map(c => linkRow("#/work/company/" + encodeURIComponent(c["Company ID"]), IC.building, c["Name"],
        [plural(rows("applications").filter(a => a["Company ID"] === c["Company ID"]).length, "application"), plural(rows("contacts").filter(k => k["Company ID"] === c["Company ID"]).length, "contact"), c["Industry"]].filter(Boolean).join(" · "))).join("") ||
        '<div class="empty">No companies yet.</div>') + '</div>';
    return { title: "Companies", back: true, html: html };
  }
  function viewCompany(id) {
    const c = company(id);
    if (!c) return { title: "Company", back: true, html: empty("That company isn’t here any more.") };
    wk.company = id;
    const contacts = rows("contacts").filter(k => k["Company ID"] === id).sort((a, b) => String(a["Name"]).localeCompare(String(b["Name"])));
    const apps = rows("applications").filter(a => a["Company ID"] === id).sort((a, b) => String(b["Date Submitted"]).localeCompare(String(a["Date Submitted"])));
    const html = '<div class="card hero"><h2>' + esc(c["Name"]) + '</h2><div class="meta">' + esc([c["Company ID"], c["Industry"], c["Address"]].filter(Boolean).join(" · ")) + '</div>' +
      (can("companies", "edit", c) ? '<div class="actions"><button class="btn" data-mod-edit="companies" data-id="' + esc(id) + '">Edit</button></div>' : "") + '</div>' +
      kv([["Website", c["Website"] ? linkify(c["Website"]) : "", true], ["Notes", c["Notes"]]]) +
      section("Contacts", '<div class="card list">' + (contacts.map(k => '<div class="list-item" role="button" tabindex="0" data-mod-edit="contacts" data-id="' + esc(k["Contact ID"]) + '"><div class="body"><div class="title">' + esc(k["Name"]) + '</div>' +
        '<div class="sub">' + [esc(k["Title"] || ""), esc(k["Email"] || ""), k["Phone"] ? M.phoneLink(k["Phone"]) : ""].filter(Boolean).join(" · ") + '</div></div></div>').join("") || '<div class="empty">No contacts yet.</div>') + '</div>',
        can("contacts", "add") ? '<button class="link-btn" data-wk="add-contact" data-id="' + esc(id) + '">+ Add</button>' : "") +
      section("Applications", '<div class="card list">' + (apps.map(appRow).join("") || '<div class="empty">None yet.</div>') + '</div>',
        can("applications", "add") ? '<button class="link-btn" data-wk="add-app" data-company="' + esc(id) + '">+ Add</button>' : "");
    return { title: c["Name"], back: true, html: html };
  }

  // ==================================================================
  // HOME, LISTS, ROUTING
  // ==================================================================
  function viewHome() {
    const tiles = [];
    if (see("time")) { const s = compSums(rows("entries").filter(r => r["Person"] === me())); tiles.push(tileBtn('href="#/work/time"', IC.clock, "Comp / OT", hrs(s.balance) + " comp available")); }
    if (see("receipts")) {
      const y = today().slice(0, 4), list = rows("receipts").filter(r => String(r["Date"]).slice(0, 4) === y);
      tiles.push(tileBtn('href="#/work/receipts"', IC.receipt, "Receipts", plural(list.length, "receipt") + " in " + y));
    }
    if (see("applications")) {
      const open = rows("applications").filter(isOpen), over = rows("applications").filter(a => { const f = nextFu(a); return f && f.date < today(); }).length;
      tiles.push(tileBtn('href="#/work/apps"', IC.brief, "Applications", plural(open.length, "open application") + (over ? " · " + over + " overdue" : "")));
    }
    const quick = [];
    if (can("entries", "add") && see("time")) quick.push('<button class="btn" data-wk="add-entry">' + ICONS.plus + 'Time entry</button>');
    if (can("receipts", "add") && see("receipts")) quick.push('<button class="btn" data-wk="add-receipt">' + ICONS.plus + 'Receipt</button>');
    if (can("applications", "add") && see("applications")) quick.push('<button class="btn" data-wk="add-app">' + ICONS.plus + 'Application</button>');
    let fuHtml = "";
    if (see("applications")) {
      const horizon = M.isoDay(new Date(M.parseIso(today()).getTime() + 14 * 86400000));
      const items = [];
      rows("applications").filter(a => a["Person"] === me()).forEach(a => followUps(a).forEach(f => { if (f.date <= horizon) items.push({ a: a, f: f }); }));
      items.sort((x, y) => String(x.f.date).localeCompare(String(y.f.date)));
      if (items.length) fuHtml = section("Follow-ups", '<div class="card list">' + items.map(x => linkRow("#/work/app/" + encodeURIComponent(x.a["Application ID"]), IC.brief, companyName(x.a["Company ID"]), (x.f.date < today() ? "Overdue since " : "By ") + day(x.f.date) + " · " + x.f.text)).join("") + '</div>');
    }
    const html = '<div class="home-grid vh-tiles">' + tiles.join("") + '</div>' + (quick.length ? '<div class="actions" style="margin:4px 0 8px">' + quick.join("") + '</div>' : "") + fuHtml +
      (C.isAdmin() ? '<p class="hint"><a href="#/work/deleted">Deleted items</a></p>' : "");
    return { title: "Work", back: true, html: html };
  }
  function viewLists() {
    const names = [];
    if (see("receipts")) names.push("Store", "Expense Category", "Rationale");
    if (see("applications")) names.push("Application Status", "Applied Through", "Communication Type", "Industry");
    return { title: "Dropdown lists", back: true, html: '<div class="card list">' + names.map(n => linkRow("#/work/list/" + encodeURIComponent(n), IC.tag, n, listVals(n).join(", ") || "Empty")).join("") + '</div>' };
  }

  function view(args) {
    M.current = ctx;
    if (wk.error) return { title: "Work", back: true, html: empty(wk.error) + '<div class="actions"><button class="btn" data-wk="retry">Try again</button></div>' };
    if (!wk.data) {
      if (!wk.loading) load();
      return { title: "Work", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "time": return viewTime(args[1], args[2]);
      case "timesheet": return viewTimesheet(args[1], args[2]);
      case "profile": return viewProfile(args[1]);
      case "categories": return M.listView(ctx, { table: "categories", title: "Time sheet categories", label: r => r["Category"], sub: r => r["Account"] ? "Acct # " + r["Account"] : "" });
      case "receipts": return viewReceipts(args[1]);
      case "receipt": return viewReceipt(args[1]);
      case "report": return viewReport(args[1], args[2]);
      case "apps": return viewApps(args[1]);
      case "app": return viewApp(args[1]);
      case "companies": return viewCompanies();
      case "company": return viewCompany(args[1]);
      case "lists": return viewLists();
      case "list": return M.listView(ctx, { table: "lists", list: args[1], title: args[1], sort: args[1] === "Application Status" ? (a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999) : undefined });
      case "deleted": return M.deletedView(ctx);
      default: return viewHome();
    }
  }
  C.registerModule("work", view, () => { wk.data = null; wk.loading = false; M.clearDeleted("work"); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  const nowLocal = () => { const d = new Date(); return M.isoDay(d) + "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  function appForm(prefill) {
    M.recordForm(ctx, "applications", "", { prefill: Object.assign({ "Person": me(), "Date Submitted": M.isoDay(new Date()), "Status": "Submitted" }, prefill || {}), title: "Add application",
      onCreated: id => { location.hash = "#/work/app/" + encodeURIComponent(id); } });
  }
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-act='refresh']") && C.parseRoute().name === "work") { wk.data = null; M.clearDeleted("work"); }
    const el = e.target.closest("[data-wk]");
    if (!el || el.tagName === "INPUT" || C.parseRoute().name !== "work") return;
    const d = el.dataset;
    switch (d.wk) {
      case "retry": wk.error = ""; C.render(); break;
      case "go": location.replace(d.to); break;
      case "print": window.print(); break;
      case "add-entry": M.recordForm(ctx, "entries", "", { prefill: { "Person": me(), "Date": M.isoDay(new Date()) }, title: "Add time entry" }); break;
      case "add-profile": M.recordForm(ctx, "profiles", "", { prefill: { "Person": d.id }, hide: ["Person"], title: "Time sheet details" }); break;
      case "add-receipt": receiptForm(""); break;
      case "edit-receipt": receiptForm(d.id); break;
      case "add-app": appForm(d.company ? { "Company ID": d.company } : {}); break;
      case "add-job": M.recordForm(ctx, "jobs", "", { prefill: { "Application ID": d.id, "Status": (byId("applications", d.id) || {})["Status"] || "Submitted" }, hide: ["Application ID"], title: "Add job" }); break;
      case "add-com": M.recordForm(ctx, "comms", "", { prefill: { "Application ID": d.id, "When": nowLocal(), "Direction": "Sent" }, hide: ["Application ID"], title: "Log communication" }); break;
      case "add-contact": wk.company = d.id; M.recordForm(ctx, "contacts", "", { prefill: { "Company ID": d.id }, hide: ["Company ID"], title: "Add contact" }); break;
      case "fu-done":
        try { await ctx.save("work.followUp", { table: d.table, id: d.id, done: true }, "Follow-up done"); } catch (err) { toast(err.message, true); }
        break;
    }
  });
  document.addEventListener("change", async e => {
    const s = e.target.closest && e.target.closest("[data-wk-status]");
    if (!s || C.parseRoute().name !== "work") return;
    try { await ctx.save("modUpdate", { table: s.dataset.wkStatus, id: s.dataset.id, values: { "Status": s.value } }, "Status: " + s.value); }
    catch (err) { toast(err.message, true); C.render(); }
  });
})();
