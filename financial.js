/* Ayers Household - Financial screens
 * Financial home (this month, bills due and income coming in the next N days, with a tick to mark
 * them paid), bills and income (grouped, with upcoming and past entries), loans (balance, payoff),
 * accounts (last 4 digits only), Plan / Save For (options with cost lines), the yearly month grid,
 * and the dropdown lists. Data comes from financial.load; simple adds and edits use the shared
 * module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, $$, toast, ICONS, svg, section, plural } = C;

  const fin = { data: null, loading: false, error: "", days: null, allHistory: {}, report: null, reportYear: null, reportLoading: false };
  const IC = {
    bill: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    income: svg('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
    loan: svg('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
    account: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    plan: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
    report: svg('<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    file: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>')
  };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Bills and income work the same way; these name the parts that differ.
  const KINDS = {
    bills:  { items: "bills",  entries: "entries",  id: "Bill ID",   paid: "Paid",     open: "Due",      area: "bills",  one: "bill",          path: "bill", list: "bills",  title: "Bills",  verb: "Paid",     undo: "Not paid" },
    income: { items: "income", entries: "deposits", id: "Income ID", paid: "Received", open: "Expected", area: "income", one: "income source", path: "inc",  list: "income", title: "Income", verb: "Received", undo: "Not received" }
  };

  // ------------------------------------------------------------------
  // Data helpers
  // ------------------------------------------------------------------
  const D = () => fin.data;
  const rows = t => (D() && D()[t]) || [];
  const byId = (t, id) => { const s = ctx.schema(t); return s ? rows(t).find(r => r[s.id] === id) || null : null; };
  const money = n => M.money(n) || "$0.00";
  const day = s => s ? M.fmtDay(s, { weekday: undefined, year: "numeric" }) : "";
  const shortDay = s => s ? M.fmtDay(s, { weekday: "short" }) : "";
  const see = area => M.can(ctx, area, "view");
  const can = (t, op, row, values) => M.tableCan(ctx, t, op, row, values);
  const today = () => D().today;
  const addDays = (iso, n) => { const d = M.parseIso(iso); d.setDate(d.getDate() + n); return M.isoDay(d); };
  const monthName = ym => { const m = /^(\d{4})-(\d{2})/.exec(ym || ""); return m ? MONTHS[+m[2] - 1] + " " + m[1] : ""; };
  const unpaid = e => e["Status"] === "Scheduled" || e["Status"] === "Due" || e["Status"] === "Expected";
  const listVals = name => rows("lists").filter(l => l["List"] === name && l["Active"] !== false)
    .sort((a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999) || String(a["Value"]).localeCompare(String(b["Value"]))).map(l => l["Value"]);
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  const kindOfEntries = table => table === "deposits" ? KINDS.income : KINDS.bills;
  const itemOf = (K, e) => byId(K.items, e[K.id]);
  const entriesOf = (K, id) => rows(K.entries).filter(e => e[K.id] === id);

  function freqText(it) {
    const s = String(it["Start Date"] || ""), d = +s.slice(8, 10);
    const wd = M.parseIso(s) ? M.parseIso(s).toLocaleDateString(undefined, { weekday: "short" }) : "";
    switch (it["Frequency"]) {
      case "Weekly": return "Weekly (" + wd + ")";
      case "Every 2 weeks": return "Every 2 weeks (" + wd + ")";
      case "Twice a month": return "Twice a month (" + ord(d) + " & " + ord(Number(it["Second Day"]) || 0) + ")";
      case "Monthly": return "Monthly on the " + ord(d);
      case "Every 2 months": return "Every 2 months on the " + ord(d);
      case "Quarterly": return "Quarterly on the " + ord(d);
      case "Every 6 months": return "Every 6 months on the " + ord(d);
      case "Annually": return "Annually (" + M.fmtDay(s, { weekday: undefined }) + ")";
      case "Every N months": return "Every " + (Number(it["Every N Months"]) || "?") + " months on the " + ord(d);
      case "One-time": return "One-time (" + day(s) + ")";
    }
    return it["Frequency"] || "";
  }
  const nextOpen = (K, id) => entriesOf(K, id).filter(unpaid).sort((a, b) => String(a["Due Date"]).localeCompare(String(b["Due Date"])))[0];
  const ended = it => it["End Date"] && it["End Date"] < today();

  function payoffText(s, loan) {
    if (!s) return "";
    if (s.basis === "done") return "Paid off";
    if (s.basis === "none") return "Link its payment bill to estimate the payoff";
    if (s.basis === "never") return "The payment doesn't cover the interest";
    return "Paid off about " + monthName(s.payoff) + (s.basis === "rate" ? " (at " + loan["Interest Rate"] + "% APR)" : "");
  }
  const bar = p => '<div class="fin-bar"><span style="width:' + Math.round(Math.max(0, Math.min(1, p || 0)) * 100) + '%"></span></div>';

  async function load(silent) {
    fin.loading = true; if (!silent) fin.error = "";
    try { fin.data = await C.api("financial.load"); if (fin.days === null) fin.days = fin.data.days; }
    catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { fin.loading = false; C.handleError(err); return; }
      fin.error = err.message;
    } finally { fin.loading = false; }
    if (C.parseRoute().name === "financial") C.render();
  }

  const ctx = {
    key: "financial",
    data: () => fin.data,
    applyData: d => { fin.data = d; },
    schema: t => fin.data.schema[t],
    rows: t => rows(t),
    refLabel: (t, r) => {
      switch (t) {
        case "bills": case "income": case "loans": case "vehicles": return r["Name"];
        case "accounts": return r["Nickname"] + (r["Kind"] ? " · " + r["Kind"] : "");
        case "plans": return r["Goal"];
        case "options": return r["Option"];
        case "lists": return r["Value"];
        default: return r[ctx.schema(t).fields[0].name] || "";
      }
    },
    title: (t, r) => {
      if (t === "entries" || t === "deposits") { const K = kindOfEntries(t), it = itemOf(K, r); return (it ? it["Name"] : r[K.id]) + " · " + day(r["Due Date"]); }
      if (t === "loanpays") return r["Kind"] + " · " + day(r["Date"]);
      return ctx.refLabel(t, r);
    },
    singular: t => ({ bills: "bill", income: "income source", entries: "bill entry", deposits: "income entry", loans: "loan", loanpays: "loan payment",
      accounts: "account", plans: "goal", options: "option", lists: "list value" }[t] || "entry"),
    formOpts: t => ({ entries: { hide: ["Bill ID"] }, deposits: { hide: ["Income ID"] }, loanpays: { hide: ["Loan ID"] } }[t] || {}),
    onFormReady: (t, form) => {
      const fieldOf = n => { const el = form.querySelector('[name="' + n + '"]'); return el && el.closest(".field"); };
      if (t === "bills" || t === "income") {
        const sync = () => {
          const f = (form.querySelector('[name="Frequency"]') || {}).value;
          const a = fieldOf("Every N Months"); if (a) a.hidden = f !== "Every N months";
          const b = fieldOf("Second Day"); if (b) b.hidden = f !== "Twice a month";
          const on = (form.querySelector('[name="Reminder"]') || {}).checked;
          ["Reminder To", "Reminder Days"].forEach(n => { const x = fieldOf(n); if (x) x.hidden = !on; });
        };
        form.addEventListener("change", sync); sync();
      }
    },
    save: async (action, payload, msg) => {
      C.busy(true);
      let res;
      try { res = await C.api(action, Object.assign({ module: "financial", reload: true }, payload)); }
      catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        if (err.code === "FORBIDDEN") { fin.data = null; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast((typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) fin.data = res.moduleData; else await load();
      fin.report = null;
      C.render();
      return res || true;
    },
    reload: () => load(),
    // A new default amount: update the upcoming unpaid entries too?
    confirm: async q => {
      if (q.kind !== "finAmount") return null;
      const a = await M.chooseSheet({
        title: "Update upcoming entries?",
        message: plural(q.count, "upcoming unpaid entry", "upcoming unpaid entries") + " for " + q.name + (q.count === 1 ? " is " : " are ") + "still " + money(q.from) +
          ". Change " + (q.count === 1 ? "it" : "them") + " to " + money(q.to) + " too? Paid entries never change.",
        choices: [{ value: "yes", label: "Update " + (q.count === 1 ? "it" : "them"), primary: true }, { value: "no", label: "Leave " + (q.count === 1 ? "it" : "them") }]
      });
      return a === null ? null : { updateFuture: a === "yes" };
    }
  };

  // ------------------------------------------------------------------
  // Marking paid / received (shows at once; the server confirms)
  // ------------------------------------------------------------------
  async function mark(table, id, to) {
    const K = kindOfEntries(table);
    const e = rows(K.entries).find(x => x["Entry ID"] === id);
    if (!e) return;
    const was = { s: e["Status"], p: e["Paid Date"] };
    if (to === "paid") { e["Status"] = K.paid; e["Paid Date"] = today(); }
    else if (to === "skip") { e["Status"] = "Skipped"; e["Paid Date"] = ""; }
    else { e["Status"] = e["Due Date"] > today() ? "Scheduled" : K.open; e["Paid Date"] = ""; }
    C.render();
    try {
      const r = await C.api("financial.mark", { module: "financial", table: table, id: id, to: to, reload: true });
      if (r.moduleData) fin.data = r.moduleData;
      fin.report = null;
      toast(to === "paid" ? K.verb : to === "skip" ? "Skipped" : K.undo, false);
      C.state.homeStale = true;
      C.render();
    } catch (err) {
      e["Status"] = was.s; e["Paid Date"] = was.p; C.render();
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
      toast(err.message, true);
    }
  }

  // One entry as a list row: tick (paid / received), name or date, amount, status.
  function entryRow(table, e, opts) {
    opts = opts || {};
    const K = kindOfEntries(table), it = itemOf(K, e);
    const done = e["Status"] === K.paid, skipped = e["Status"] === "Skipped";
    const editable = can(table, "edit", e);
    const late = unpaid(e) && e["Due Date"] < today(), isToday = unpaid(e) && e["Due Date"] === today();
    const name = opts.showName ? (it ? it["Name"] : e[K.id]) : day(e["Due Date"]);
    const sub = [opts.showName ? shortDay(e["Due Date"]) : "",
      done && e["Paid Date"] ? K.verb + " " + day(e["Paid Date"]) : "", skipped ? "Skipped" : "",
      unpaid(e) && it && it["Autopay"] === true ? (table === "deposits" ? "Automatic" : "Autopay") : "",
      e["Confirmation"] ? "Conf. " + e["Confirmation"] : "", e["Hockey Expense ID"] ? "On Travel Hockey" : ""].filter(Boolean).join(" · ");
    const hockey = opts.hockey && done && !e["Hockey Expense ID"] && D().hockey && table === "entries"
      ? '<button class="link-btn fin-hk" data-fin="hockey" data-id="' + esc(e["Entry ID"]) + '">→ Hockey</button>' : "";
    return '<div class="list-item fin-entry' + (done ? " done" : "") + (skipped ? " skipped" : "") + (late ? " late" : "") + '">' +
      (editable && !skipped ? '<button class="sh-check' + (done ? " on" : "") + '" data-fin="mark" data-table="' + table + '" data-id="' + esc(e["Entry ID"]) + '" data-to="' + (done ? "unpaid" : "paid") + '" aria-pressed="' + done + '" aria-label="' + esc((done ? K.undo + ": " : "Mark " + K.paid.toLowerCase() + ": ") + (it ? it["Name"] : "") + " " + day(e["Due Date"])) + '">' + (done ? IC.check : "") + '</button>'
        : '<span class="sh-check off' + (done ? " on" : "") + '" aria-hidden="true">' + (done ? IC.check : "") + '</span>') +
      '<div class="body" role="button" tabindex="0" data-mod-edit="' + table + '" data-id="' + esc(e["Entry ID"]) + '"><div class="title">' + esc(name) + (e["Statement"] ? ' <span class="fin-fileicon" title="Statement attached">' + IC.file + '</span>' : "") + '</div>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div>' + hockey +
      (late ? '<span class="pill vh-over">Overdue</span>' : isToday ? '<span class="pill vh-soon">Today</span>' : "") +
      '<div class="vh-cost">' + esc(money(e["Amount"])) + '</div></div>';
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  const tile = (href, icon, label, info) => '<a class="home-link" href="' + href + '"><span class="home-icon">' + icon + '</span><span class="home-text"><span class="home-label">' + esc(label) + '</span>' +
    (info ? '<span class="home-info">' + esc(info) + '</span>' : "") + '</span></a>';

  function monthTotals(ym) {
    const sum = (list) => list.filter(e => String(e["Due Date"]).slice(0, 7) === ym && e["Status"] !== "Skipped").reduce((s, e) => s + (Number(e["Amount"]) || 0), 0);
    return { income: sum(rows("deposits")), bills: sum(rows("entries")) };
  }

  function viewHome() {
    const t = today(), days = fin.days || D().days, until = addDays(t, days);
    const ym = t.slice(0, 7), tot = monthTotals(ym);
    const stats = [];
    if (see("income")) stats.push(["Income", money(tot.income)]);
    if (see("bills")) stats.push(["Bills", money(tot.bills)]);
    if (see("income") && see("bills")) stats.push(["Left", money(tot.income - tot.bills), tot.income - tot.bills < 0 ? "neg" : ""]);
    const hero = stats.length ? '<div class="card hero fin-month"><div class="meta">' + esc(monthName(ym)) + '</div><div class="fin-stats">' +
      stats.map(s => '<div class="fin-stat ' + (s[2] || "") + '"><span>' + esc(s[0]) + '</span><b>' + esc(s[1]) + '</b></div>').join("") + '</div></div>' : "";
    const choices = [3, 7, 14, 30, 60, 90];
    if (choices.indexOf(days) === -1) choices.push(days);
    const win = '<div class="fin-window"><label for="fin_days">Show the next</label><select id="fin_days" data-fin="days">' +
      choices.sort((a, b) => a - b).map(n => '<option value="' + n + '"' + (n === days ? " selected" : "") + '>' + plural(n, "day") + (n === D().days ? " (my default)" : "") + '</option>').join("") + '</select>' +
      (days !== D().days ? '<button class="link-btn" data-fin="default-days">Make this my default</button>' : "") + '</div>';
    const due = (table) => {
      const K = kindOfEntries(table);
      return rows(K.entries).filter(e => unpaid(e) && e["Due Date"] <= until).sort((a, b) => String(a["Due Date"]).localeCompare(String(b["Due Date"])) || String((itemOf(K, a) || {})["Name"]).localeCompare(String((itemOf(K, b) || {})["Name"])));
    };
    let body = "";
    if (see("bills")) {
      const list = due("entries");
      const total = list.reduce((s, e) => s + (Number(e["Amount"]) || 0), 0);
      body += section("Bills due", '<div class="card list">' + (list.map(e => entryRow("entries", e, { showName: true })).join("") ||
        '<div class="empty">Nothing due in the next ' + plural(days, "day") + '.</div>') + '</div>', list.length ? '<span class="fin-sum">' + esc(money(total)) + '</span>' : "");
    }
    if (see("income")) {
      const list = due("deposits");
      body += section("Income coming in", '<div class="card list">' + (list.map(e => entryRow("deposits", e, { showName: true })).join("") ||
        '<div class="empty">Nothing expected in the next ' + plural(days, "day") + '.</div>') + '</div>');
    }
    const n = (t2) => rows(t2).length;
    const tiles = [
      see("bills") ? tile("#/financial/bills", IC.bill, "Bills", plural(rows("bills").filter(b => !ended(b)).length, "bill")) : "",
      see("income") ? tile("#/financial/income", IC.income, "Income", plural(rows("income").filter(b => !ended(b)).length, "source")) : "",
      see("loans") ? tile("#/financial/loans", IC.loan, "Loans", plural(n("loans"), "loan")) : "",
      see("accounts") ? tile("#/financial/accounts", IC.account, "Accounts", plural(n("accounts"), "account")) : "",
      see("plans") ? tile("#/financial/plans", IC.plan, "Plan / Save For", plural(rows("plans").filter(p => p["Status"] === "Active").length, "goal")) : "",
      see("reports") ? tile("#/financial/report", IC.report, "Reports", "Month by month") : ""
    ].join("");
    const lists = can("lists", "add", null, { "List": "Category" }) ? section("Lists & settings", '<div class="card list"><a class="list-item" href="#/financial/lists"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">Dropdown lists</div><div class="sub">Groups, categories, people</div></div><span class="thumb">' + ICONS.next + '</span></a></div>') : "";
    const html = hero + (see("bills") || see("income") ? win : "") + body + (tiles ? '<div class="home-grid fin-tiles">' + tiles + '</div>' : "") + lists +
      (C.isAdmin() ? '<p class="hint"><a href="#/financial/deleted">Deleted items</a></p>' : "");
    return { title: "Financial", back: true, html: html };
  }

  // Bills or income, grouped.
  function viewItems(K) {
    const all = rows(K.items);
    const itemRow = it => {
      const nx = nextOpen(K, it[K.id]);
      const sub = [money(it["Amount"]), freqText(it), ended(it) ? "Ended " + day(it["End Date"]) : nx ? "Next " + shortDay(nx["Due Date"]) : ""].filter(Boolean).join(" · ");
      return '<a class="list-item' + (ended(it) ? " dim" : "") + '" href="#/financial/' + K.path + '/' + encodeURIComponent(it[K.id]) + '"><div class="body"><div class="title">' + esc(it["Name"]) + '</div>' +
        '<div class="sub">' + esc(sub) + '</div></div>' +
        (it["Autopay"] === true ? '<span class="pill">' + (K === KINDS.income ? "Auto" : "Autopay") + '</span>' : "") +
        (it["Reminder"] === true ? '<span class="pill">Reminder</span>' : "") + '<span class="thumb">' + ICONS.next + '</span></a>';
    };
    const add = can(K.items, "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-mod-add="' + K.items + '">' + ICONS.plus + 'Add ' + K.one + '</button></div>' : "";
    let html = add;
    if (K === KINDS.bills) {
      const groups = listVals("Group");
      all.forEach(b => { if (b["Group"] && groups.indexOf(b["Group"]) === -1) groups.push(b["Group"]); });
      groups.forEach(g => {
        const gs = all.filter(b => (b["Group"] || "Expenses") === g).sort((a, b) => ended(a) - ended(b) || String(a["Name"]).localeCompare(String(b["Name"])));
        if (!gs.length) return;
        const monthly = gs.filter(b => !ended(b)).reduce((s, b) => s + (Number(b["Amount"]) || 0) * perMonth(b), 0);
        html += section(g, '<div class="card list">' + gs.map(itemRow).join("") + '</div>', '<span class="fin-sum">' + esc(money(monthly)) + ' / mo</span>');
      });
      if (!all.length) html += '<div class="card"><div class="empty">No bills yet.</div></div>';
    } else {
      html += '<div class="card list">' + (all.slice().sort((a, b) => ended(a) - ended(b) || String(a["Name"]).localeCompare(String(b["Name"]))).map(itemRow).join("") || '<div class="empty">No income sources yet.</div>') + '</div>';
    }
    html += '<p class="hint">Entries are made 3 months ahead (and the next one for anything billed less often). Each one turns ' +
      (K === KINDS.bills ? "Due on its date, or Paid if it's on autopay" : "Expected on its date, or Received if it comes in automatically") + '.</p>';
    return { title: K.title, back: true, html: html };
  }
  function perMonth(it) {
    switch (it["Frequency"]) {
      case "Weekly": return 52 / 12; case "Every 2 weeks": return 26 / 12; case "Twice a month": return 2; case "Monthly": return 1;
      case "Every 2 months": return 1 / 2; case "Quarterly": return 1 / 3; case "Every 6 months": return 1 / 6; case "Annually": return 1 / 12;
      case "Every N months": return 1 / (Number(it["Every N Months"]) || 1);
    }
    return 0;
  }

  const kv = pairs => { const p = pairs.filter(x => x[1] !== "" && x[1] !== undefined && x[1] !== null); return p.length ? '<div class="card kv">' + p.map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + (x[2] ? x[1] : esc(x[1])) + '</div>').join("") + '</div>' : ""; };
  const link = (href, text) => '<a href="' + href + '">' + esc(text) + '</a>';

  function viewItem(K, id) {
    const it = byId(K.items, id);
    if (!it) return { title: K.title, back: true, html: '<div class="card"><div class="empty">That ' + K.one + ' isn’t here any more.</div></div>' };
    const es = entriesOf(K, id);
    const open = es.filter(unpaid).sort((a, b) => String(a["Due Date"]).localeCompare(String(b["Due Date"])));
    const past = es.filter(e => !unpaid(e)).sort((a, b) => String(b["Due Date"]).localeCompare(String(a["Due Date"])));
    const shown = fin.allHistory[id] ? past : past.slice(0, 12);
    const acct = it["Account ID"] ? byId("accounts", it["Account ID"]) : null;
    const loan = it["Loan ID"] ? byId("loans", it["Loan ID"]) : null;
    const plan = it["Plan ID"] ? byId("plans", it["Plan ID"]) : null;
    const hero = '<div class="card hero"><h2>' + esc(it["Name"]) + '</h2><div class="meta">' + esc([it[K.id], it["Group"], it["Category"]].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="fin-amount">' + esc(money(it["Amount"])) + ' <span>' + esc(freqText(it)) + '</span></div>' +
      (can(K.items, "edit", it) ? '<div class="actions"><button class="btn" data-mod-edit="' + K.items + '" data-id="' + esc(id) + '">Edit</button>' +
        (can(K.entries, "add") ? '<button class="btn" data-fin="add-entry" data-kind="' + (K === KINDS.bills ? "bills" : "income") + '" data-id="' + esc(id) + '">' + ICONS.plus + 'One-off entry</button>' : "") + '</div>' : "") + '</div>';
    const details = kv([
      [K === KINDS.bills ? "Autopay" : "Automatic", it["Autopay"] === true ? "Yes" : "No"],
      ["Paid by", it["Paid By"]],
      [K === KINDS.bills ? "Paid from" : "Deposited to", acct ? acct["Nickname"] : ""],
      ["Loan", loan ? link("#/financial/loan/" + encodeURIComponent(loan["Loan ID"]), loan["Name"]) : "", true],
      ["Saving toward", plan ? link("#/financial/plan/" + encodeURIComponent(plan["Plan ID"]), plan["Goal"]) : "", true],
      ["Reminder", it["Reminder"] === true ? "Task to " + M.userName(ctx, it["Reminder To"] || "USR-1") + ", " + plural(Number(it["Reminder Days"] === "" ? 3 : it["Reminder Days"]), "day") + " before" : ""],
      ["First due", day(it["Start Date"])], ["Last due", day(it["End Date"])], ["Notes", it["Notes"]]
    ]);
    const table = K.entries;
    const html = hero + details +
      section("Upcoming", '<div class="card list">' + (open.map(e => entryRow(table, e)).join("") || '<div class="empty">Nothing upcoming.</div>') + '</div>') +
      section("History", '<div class="card list">' + (shown.map(e => entryRow(table, e, { hockey: true })).join("") || '<div class="empty">Nothing ' + K.paid.toLowerCase() + ' yet.</div>') + '</div>' +
        (past.length > shown.length ? '<button class="link-btn" data-fin="all-history" data-id="' + esc(id) + '">Show all ' + past.length + '</button>' : ""));
    return { title: it["Name"], back: true, html: html };
  }

  function viewLoans() {
    const ls = rows("loans").slice().sort((a, b) => ((D().loanStatus[a["Loan ID"]] || {}).basis === "done") - ((D().loanStatus[b["Loan ID"]] || {}).basis === "done") || String(a["Name"]).localeCompare(String(b["Name"])));
    const html = (can("loans", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-mod-add="loans">' + ICONS.plus + 'Add loan</button></div>' : "") +
      '<div class="card list">' + (ls.map(l => {
        const s = D().loanStatus[l["Loan ID"]] || {};
        return '<a class="list-item fin-loanrow" href="#/financial/loan/' + encodeURIComponent(l["Loan ID"]) + '"><div class="body"><div class="title">' + esc(l["Name"]) + ' <span class="fin-right">' + esc(money(s.remaining)) + '</span></div>' +
          bar(s.progress) + '<div class="sub">' + esc([payoffText(s, l), s.monthly ? money(s.monthly) + " / mo" : ""].filter(Boolean).join(" · ")) + '</div></div></a>';
      }).join("") || '<div class="empty">No loans yet.</div>') + '</div>';
    return { title: "Loans", back: true, html: html };
  }

  function viewLoan(id) {
    const l = byId("loans", id);
    if (!l) return { title: "Loan", back: true, html: '<div class="card"><div class="empty">That loan isn’t here any more.</div></div>' };
    const s = D().loanStatus[id] || {};
    const veh = l["Vehicle ID"] ? byId("vehicles", l["Vehicle ID"]) : null;
    const acct = l["Account ID"] ? byId("accounts", l["Account ID"]) : null;
    const bills = (s.bills || []).map(b => byId("bills", b)).filter(Boolean);
    const from = l["Balance Date"] || "";
    const billIds = {}; rows("bills").filter(b => b["Loan ID"] === id).forEach(b => billIds[b["Bill ID"]] = true);
    const pays = rows("entries").filter(e => billIds[e["Bill ID"]] && e["Status"] === "Paid" && (e["Paid Date"] || e["Due Date"]) >= from)
      .map(e => ({ date: e["Paid Date"] || e["Due Date"], html: entryRow("entries", e, { showName: true }) }))
      .concat(rows("loanpays").filter(p => p["Loan ID"] === id).map(p => ({ date: p["Date"], html:
        '<div class="list-item" role="button" tabindex="0" data-mod-edit="loanpays" data-id="' + esc(p["Loan Payment ID"]) + '"><span class="thumb">' + IC.loan + '</span><div class="body"><div class="title">' + esc(p["Kind"]) + '</div><div class="sub">' + esc([day(p["Date"]), p["Notes"]].filter(Boolean).join(" · ")) + '</div></div><div class="vh-cost">' + esc(money(p["Amount"])) + '</div></div>' })))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const html = '<div class="card hero"><h2>' + esc(l["Name"]) + '</h2><div class="meta">' + esc([l["Loan ID"], l["Lender"]].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="fin-amount">' + esc(money(s.remaining)) + ' <span>left</span></div>' + bar(s.progress) +
      '<div class="meta">' + esc("Paid " + money(s.paid) + " of " + money(s.start) + " since " + day(l["Balance Date"])) + '</div>' +
      '<div class="meta"><b>' + esc(payoffText(s, l)) + '</b></div>' +
      '<div class="actions">' + (can("loans", "edit", l) ? '<button class="btn" data-mod-edit="loans" data-id="' + esc(id) + '">Edit</button>' : "") +
        (can("loanpays", "add") ? '<button class="btn" data-fin="add-loanpay" data-id="' + esc(id) + '">' + ICONS.plus + 'Extra payment / adjustment</button>' : "") + '</div></div>' +
      kv([["Monthly payment", s.monthly ? money(s.monthly) : ""], ["Interest rate", l["Interest Rate"] !== "" ? l["Interest Rate"] + "% APR" : ""],
        ["Vehicle", veh ? link("#/vehicles/v/" + encodeURIComponent(veh["Vehicle ID"]), veh["Name"]) : "", true],
        ["Account", acct ? acct["Nickname"] : ""], ["Paid off", day(l["Paid Off Date"])], ["Notes", l["Notes"]]]) +
      section("Payment bills", '<div class="card list">' + (bills.map(b => '<a class="list-item" href="#/financial/bill/' + encodeURIComponent(b["Bill ID"]) + '"><div class="body"><div class="title">' + esc(b["Name"]) + '</div><div class="sub">' + esc(money(b["Amount"]) + " · " + freqText(b)) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") ||
        '<div class="empty">No bill linked. Edit the payment bill and pick this loan, so its payments lower the balance.</div>') + '</div>') +
      section("Payments", '<div class="card list">' + (pays.map(p => p.html).join("") || '<div class="empty">No payments since ' + esc(day(from)) + '.</div>') + '</div>');
    return { title: l["Name"], back: true, html: html };
  }

  function viewAccounts() {
    const as = rows("accounts").slice().sort((a, b) => ((b["Active"] !== false) - (a["Active"] !== false)) || String(a["Nickname"]).localeCompare(String(b["Nickname"])));
    const html = (can("accounts", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-mod-add="accounts">' + ICONS.plus + 'Add account</button></div>' : "") +
      '<div class="card list">' + (as.map(a => '<div class="list-item' + (a["Active"] === false ? " dim" : "") + '"><span class="thumb">' + IC.account + '</span>' +
        '<div class="body" role="button" tabindex="0" data-mod-edit="accounts" data-id="' + esc(a["Account ID"]) + '"><div class="title">' + esc(a["Nickname"]) + '</div><div class="sub">' + esc([a["Kind"], a["Institution"], a["Card Last 4"] ? "Card ••" + a["Card Last 4"] : "", a["Account Last 4"] ? "Acct ••" + a["Account Last 4"] : "", a["Owner"]].filter(Boolean).join(" · ")) + '</div>' +
        (a["Balance"] !== "" && a["Balance"] !== undefined ? '<div class="sub">' + esc("Balance " + money(a["Balance"]) + (a["Balance Date"] ? " as of " + day(a["Balance Date"]) : "")) + '</div>' : "") + '</div>' +
        (a["Website"] ? '<a class="link-btn" href="' + esc(a["Website"]) + '" target="_blank" rel="noopener">Website</a>' : "") + (a["Active"] === false ? '<span class="pill">Off</span>' : "") + '</div>').join("") || '<div class="empty">No accounts yet.</div>') + '</div>' +
      '<p class="hint">Only the last 4 digits of card and account numbers are kept. No full numbers or passwords.</p>';
    return { title: "Accounts", back: true, html: html };
  }

  function viewPlans() {
    const ps = rows("plans").slice().sort((a, b) => (a["Status"] !== "Active") - (b["Status"] !== "Active") || String(a["Target Date"] || "9999").localeCompare(String(b["Target Date"] || "9999")));
    const html = (can("plans", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn primary" data-mod-add="plans">' + ICONS.plus + 'Add goal</button></div>' : "") +
      '<div class="card list">' + (ps.map(p => {
        const s = D().planStatus[p["Plan ID"]] || {};
        return '<a class="list-item fin-loanrow' + (p["Status"] !== "Active" ? " dim" : "") + '" href="#/financial/plan/' + encodeURIComponent(p["Plan ID"]) + '"><div class="body"><div class="title">' + esc(p["Goal"]) +
          ' <span class="fin-right">' + esc(money(s.saved) + (s.target !== null && s.target !== undefined ? " of " + money(s.target) : "")) + '</span></div>' + bar(s.progress) +
          '<div class="sub">' + esc([p["Status"] !== "Active" ? p["Status"] : "", p["Target Date"] ? "By " + day(p["Target Date"]) : "", s.needed !== null && s.needed !== undefined ? money(s.needed) + " / mo needed" : ""].filter(Boolean).join(" · ")) + '</div></div></a>';
      }).join("") || '<div class="empty">No goals yet.</div>') + '</div>';
    return { title: "Plan / Save For", back: true, html: html };
  }

  function viewPlan(id) {
    const p = byId("plans", id);
    if (!p) return { title: "Plan / Save For", back: true, html: '<div class="card"><div class="empty">That goal isn’t here any more.</div></div>' };
    const s = D().planStatus[id] || {};
    const opts = rows("options").filter(o => o["Plan ID"] === id).sort((a, b) => (b["Chosen"] === true) - (a["Chosen"] === true) || (Number(a["Total"]) || 0) - (Number(b["Total"]) || 0));
    const chosen = opts.find(o => o["Chosen"] === true);
    const bills = (s.bills || []).map(b => byId("bills", b)).filter(Boolean);
    const optHtml = opts.map(o => {
      const ls = rows("optlines").filter(l => l["Option ID"] === o["Option ID"]).sort((a, b) => (Number(a["Sort"]) || 0) - (Number(b["Sort"]) || 0));
      return '<div class="card fin-option' + (o["Chosen"] === true ? " chosen" : "") + '"><div class="fin-opt-head" role="button" tabindex="0" data-fin="edit-option" data-id="' + esc(o["Option ID"]) + '"><b>' + esc(o["Option"]) + '</b>' +
        (o["Chosen"] === true ? '<span class="pill vh-ok">Chosen</span>' : "") + '<span class="fin-right">' + esc(money(o["Total"])) + '</span></div>' +
        (ls.length ? '<div class="fin-opt-lines">' + ls.map(l => '<div><span>' + esc(l["Item"] + (Number(l["Quantity"]) !== 1 ? " × " + l["Quantity"] : "")) + '</span><span>' + esc(money((Number(l["Price"]) || 0) * (Number(l["Quantity"]) || 0))) + '</span></div>').join("") + '</div>' : "") +
        (o["Notes"] ? '<div class="sub">' + esc(o["Notes"]) + '</div>' : "") + '</div>';
    }).join("");
    const html = '<div class="card hero"><h2>' + esc(p["Goal"]) + '</h2><div class="meta">' + esc([p["Plan ID"], p["Status"] !== "Active" ? p["Status"] : ""].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="fin-amount">' + esc(money(s.saved)) + ' <span>' + esc(s.target !== null && s.target !== undefined ? "of " + money(s.target) : "saved") + '</span></div>' + bar(s.progress) +
      (s.needed !== null && s.needed !== undefined ? '<div class="meta"><b>' + esc(money(s.needed) + " a month") + '</b>' + esc(" to reach it by " + day(p["Target Date"]) + (s.pastDate ? " (date has passed)" : "")) + '</div>' : "") +
      (can("plans", "edit", p) ? '<div class="actions"><button class="btn" data-mod-edit="plans" data-id="' + esc(id) + '">Edit</button></div>' : "") + '</div>' +
      kv([["Target", p["Target Amount"] !== "" ? money(p["Target Amount"]) : chosen ? money(chosen["Total"]) + " (chosen option)" : ""], ["Target date", day(p["Target Date"])],
        ["Saved before tracking", p["Starting Saved"] !== "" ? money(p["Starting Saved"]) : ""], ["From savings bills", s.contributions ? money(s.contributions) : ""],
        ["Planned each month", p["Monthly Contribution"] !== "" ? money(p["Monthly Contribution"]) : ""], ["Notes", p["Notes"]]]) +
      section("Options", optHtml || '<div class="card"><div class="empty">No options yet. Add one for each choice you’re comparing.</div></div>',
        can("options", "add") ? '<button class="link-btn" data-fin="add-option" data-id="' + esc(id) + '">+ Option</button>' : "") +
      section("Savings bills", '<div class="card list">' + (bills.map(b => '<a class="list-item" href="#/financial/bill/' + encodeURIComponent(b["Bill ID"]) + '"><div class="body"><div class="title">' + esc(b["Name"]) + '</div><div class="sub">' + esc(money(b["Amount"]) + " · " + freqText(b)) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") ||
        '<div class="empty">No savings bill linked. Pick this goal under “Saving toward” on a savings bill so its payments count.</div>') + '</div>');
    return { title: p["Goal"], back: true, html: html };
  }

  // Option editor: name, chosen, cost lines (item, price, quantity) with a running total.
  function optionForm(planId, optionId) {
    const o = optionId ? byId("options", optionId) : null;
    let lines = o ? rows("optlines").filter(l => l["Option ID"] === optionId).sort((a, b) => (Number(a["Sort"]) || 0) - (Number(b["Sort"]) || 0)).map(l => Object.assign({}, l)) : [{}, {}, {}];
    if (!lines.length) lines = [{}];
    const editable = o ? can("options", "edit", o) : can("options", "add");
    const lineRow = (l, i) => '<div class="fin-optline" data-i="' + i + '"' + (l["Line ID"] ? ' data-id="' + esc(l["Line ID"]) + '"' : "") + '>' +
      '<input type="text" data-l="Item" placeholder="Item" value="' + esc(l["Item"] || "") + '" aria-label="Item ' + (i + 1) + '">' +
      '<div class="suffix-wrap money-wrap"><span class="prefix">$</span><input type="number" step="0.01" inputmode="decimal" data-l="Price" value="' + esc(l["Price"] === undefined ? "" : l["Price"]) + '" aria-label="Price ' + (i + 1) + '"></div>' +
      '<input type="number" step="any" inputmode="decimal" data-l="Quantity" placeholder="Qty" value="' + esc(l["Quantity"] === undefined ? "" : l["Quantity"]) + '" aria-label="Quantity ' + (i + 1) + '">' +
      '<button type="button" class="icon-btn" data-ol="remove" aria-label="Remove line">' + ICONS.close + '</button></div>';
    const read = form => $$(".fin-optline", form).map(el => {
      const x = {}; if (el.dataset.id) x.id = el.dataset.id;
      $$("[data-l]", el).forEach(i => x[i.dataset.l] = i.value);
      return x;
    });
    const body = '<div class="field"><label for="fo_name">Option <span class="req">*</span></label><input type="text" id="fo_name" name="Option" required value="' + esc(o ? o["Option"] : "") + '" placeholder="e.g. Signature (1) Deluxe (4)"></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="Chosen"' + (o && o["Chosen"] === true ? " checked" : "") + '> Chosen (sets the goal’s target)</label></div>' +
      '<div class="field"><label>Costs</label><div class="fin-optlines">' + lines.map(lineRow).join("") + '</div>' +
      '<div class="vh-line-add"><button type="button" class="link-btn" data-ol="add">+ Add a line</button><span class="vh-total">Total <b>$0.00</b></span></div>' +
      '<div class="hint">Quantity blank = 1. Lines with no item and no price are left off.</div></div>' +
      '<div class="field"><label for="fo_notes">Notes</label><textarea id="fo_notes" name="Notes">' + esc(o ? o["Notes"] || "" : "") + '</textarea></div>' +
      (o && can("options", "delete", o) ? '<div class="danger-zone"><button type="button" class="btn danger" data-ol="delete">Delete option</button></div>' : "");
    let formEl;
    C.openSheet({
      title: o ? (editable ? "Edit option" : o["Option"]) : "Add option", body: body, submitLabel: o ? "Save" : "Add", noSubmit: !editable,
      onReady: (form, close) => {
        formEl = form;
        const box = $(".fin-optlines", form);
        const total = () => { const s = read(form).reduce((a, l) => a + (Number(l.Price) || 0) * (l.Quantity === "" ? 1 : Number(l.Quantity) || 0), 0); $(".vh-total b", form).textContent = money(s); };
        const keep = () => { lines = read(form).map(l => Object.assign({}, l, l.id ? { "Line ID": l.id } : {})); };
        form.addEventListener("input", total);
        form.addEventListener("click", async e => {
          const b = e.target.closest("[data-ol]");
          if (!b) return;
          if (b.dataset.ol === "remove") { keep(); lines.splice(+b.closest(".fin-optline").dataset.i, 1); box.innerHTML = lines.map(lineRow).join(""); total(); }
          else if (b.dataset.ol === "add") { keep(); lines.push({}); box.innerHTML = lines.map(lineRow).join(""); total(); const last = box.lastElementChild.querySelector("input"); if (last) last.focus(); }
          else if (b.dataset.ol === "delete") {
            if (!(await M.confirmSheet({ title: "Delete option?", message: "Delete " + o["Option"] + " and its cost lines?", submitLabel: "Delete", danger: true }))) return;
            try { await ctx.save("modDelete", { table: "options", id: optionId }, "Deleted"); close(); } catch (err) { toast(err.message, true); }
          }
        });
        if (!editable) $$("input, textarea", form).forEach(i => i.disabled = true);
        total();
      },
      onSubmit: async v => {
        const r = await ctx.save("financial.saveOption", { optionId: optionId || undefined, values: { "Plan ID": planId, "Option": v["Option"], "Chosen": v["Chosen"] === true, "Notes": v["Notes"] || "" }, lines: read(formEl) },
          o ? "Option saved" : "Option added");
        return !!r;
      }
    });
  }

  // Send a paid bill to the Travel Hockey expenses.
  function hockeyForm(entryId) {
    const e = rows("entries").find(x => x["Entry ID"] === entryId), H = D().hockey;
    if (!e || !H) return;
    const it = byId("bills", e["Bill ID"]) || {};
    const d = e["Paid Date"] || e["Due Date"];
    const seasons = H.seasons.slice().sort((a, b) => ((b.start <= d && d <= b.end) - (a.start <= d && d <= a.end)) || String(b.start).localeCompare(String(a.start)));
    const body = '<p class="confirm-msg">' + esc(it["Name"] + " · " + money(e["Amount"]) + " · " + day(d)) + '</p>' +
      '<div class="field"><label for="fh_season">Season <span class="req">*</span></label><select id="fh_season" name="seasonId" required>' + seasons.map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join("") + '</select></div>' +
      '<div class="field"><label for="fh_cat">Category <span class="req">*</span></label><select id="fh_cat" name="category" required><option value="">Choose…</option>' + H.categories.map(c => '<option>' + esc(c) + '</option>').join("") + '</select></div>' +
      '<div class="field"><label for="fh_item">Item</label><input type="text" id="fh_item" name="item" value="' + esc(it["Name"] || "") + '"></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="nonBillable"> Non-billable (not part of what the player earns back)</label></div>' +
      '<div class="field"><label for="fh_notes">Notes</label><input type="text" id="fh_notes" name="notes"></div>';
    C.openSheet({
      title: "Add to Travel Hockey expenses", body: body, submitLabel: "Add",
      onSubmit: async v => !!(await ctx.save("financial.toHockey", { id: entryId, seasonId: v.seasonId, category: v.category, item: v.item, nonBillable: v.nonBillable === true, notes: v.notes },
        r => "Added to Travel Hockey (" + r.hockeyId + ")"))
    });
  }

  // Month grid for a year.
  function viewReport() {
    const y = fin.reportYear || +today().slice(0, 4);
    let R = D().report && D().report.year === y ? D().report : (fin.report && fin.report.year === y ? fin.report : null);
    if (!R) {
      if (!fin.reportLoading) {
        fin.reportLoading = true;
        C.api("financial.report", { year: y }).then(r => { fin.report = r.report; fin.reportLoading = false; C.render(); })
          .catch(err => { fin.reportLoading = false; toast(err.message, true); });
      }
      return { title: "Reports", back: true, html: yearNav(y) + '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    const cell = (v, proj) => '<td class="' + (proj ? "proj" : "") + (v < 0 ? " neg" : "") + '">' + (v ? esc(fmt(v)) : "") + '</td>';
    const fmt = v => (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString();
    const curM = R.year === +today().slice(0, 4) ? +today().slice(5, 7) - 1 : -1;
    const head = '<tr><th class="fin-rh">' + R.year + '</th>' + MONTHS.map((m, i) => '<th' + (i === curM ? ' class="cur"' : "") + '>' + m + '</th>').join("") + '<th>Total</th></tr>';
    const linkTo = (s, r) => '#/financial/' + (s.kind === "income" ? "inc" : "bill") + '/' + encodeURIComponent(r.id);
    let body = "";
    R.sections.forEach(s => {
      body += '<tr class="fin-grp"><th class="fin-rh">' + esc(s.name) + '</th>' + s.total.map(v => cell(v)).join("") + cell(s.total.reduce((a, b) => a + b, 0)) + '</tr>';
      s.rows.forEach(r => { body += '<tr><th class="fin-rh fin-item"><a href="' + linkTo(s, r) + '">' + esc(r.name) + '</a></th>' + r.cells.map((v, i) => cell(v, r.proj[i])).join("") + cell(r.total) + '</tr>'; });
    });
    body += '<tr class="fin-grp fin-rem"><th class="fin-rh">Remaining</th>' + R.remaining.map(v => cell(v)).join("") + cell(R.remainingTotal) + '</tr>';
    const table = '<div class="fin-gridwrap"><table class="fin-grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    const other = R.other.length ? section("Other modules", '<div class="fin-gridwrap"><table class="fin-grid"><thead>' + head + '</thead><tbody>' +
      R.other.map(o => '<tr><th class="fin-rh fin-item">' + esc(o.name) + '</th>' + o.cells.map(v => cell(v)).join("") + cell(o.total) + '</tr>').join("") + '</tbody></table></div>' +
      '<p class="hint">Logged in those modules; shown on their own so nothing counts twice.</p>') : "";
    // Start the grid scrolled to this month (the months before it are often empty).
    setTimeout(() => $$(".fin-gridwrap").forEach(w => { const th = $("th.cur", w); if (th && !w.dataset.scrolled) { w.dataset.scrolled = "1"; w.scrollLeft = Math.max(0, th.offsetLeft - $(".fin-rh", w).offsetWidth - 8); } }), 0);
    const html = yearNav(y) + (R.sections.some(s => s.rows.length) ? table : '<div class="card"><div class="empty">Nothing for ' + R.year + ' yet.</div></div>') +
      '<p class="hint">Remaining = income minus every bill group. <span class="proj-key">Gray</span> amounts are projected from the schedule (no entry made yet). Skipped entries count as $0.</p>' + other;
    return { title: "Reports", back: true, html: html };
  }
  const yearNav = y => '<div class="fin-yearnav"><button class="btn" data-fin="year" data-y="' + (y - 1) + '" aria-label="Previous year">‹</button><b>' + y + '</b><button class="btn" data-fin="year" data-y="' + (y + 1) + '" aria-label="Next year">›</button></div>';

  function viewLists() {
    const names = [["Group", "Groups (Expenses, Non-Essential, Savings…) — Sort sets their order"], ["Category", "Bill categories"], ["Person", "Paid by / account owner"]];
    return { title: "Dropdown lists", back: true, html: '<div class="card list">' + names.map(n => '<a class="list-item" href="#/financial/list/' + encodeURIComponent(n[0]) + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(n[0]) + '</div>' +
      '<div class="sub">' + esc(listVals(n[0]).join(", ") || n[1]) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") + '</div>' };
  }

  function view(args) {
    M.current = ctx;
    if (fin.error) return { title: "Financial", back: true, html: '<div class="card"><div class="empty">' + esc(fin.error) + '</div></div><div class="actions"><button class="btn" data-fin="retry">Try again</button></div>' };
    if (!fin.data) {
      if (!fin.loading) load();
      return { title: "Financial", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "bills": return viewItems(KINDS.bills);
      case "bill": return viewItem(KINDS.bills, args[1]);
      case "income": return viewItems(KINDS.income);
      case "inc": return viewItem(KINDS.income, args[1]);
      case "loans": return viewLoans();
      case "loan": return viewLoan(args[1]);
      case "accounts": return viewAccounts();
      case "plans": return viewPlans();
      case "plan": return viewPlan(args[1]);
      case "report": return viewReport();
      case "lists": return viewLists();
      case "list": return M.listView(ctx, { table: "lists", list: args[1], title: args[1], sub: r => args[1] === "Group" && r["Sort"] !== "" ? "Order " + r["Sort"] : "",
        sort: args[1] === "Group" ? ((a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999)) : undefined });
      case "deleted": return M.deletedView(ctx);
      default: return viewHome();
    }
  }
  C.registerModule("financial", view, () => { fin.data = null; fin.loading = false; fin.report = null; fin.days = null; M.clearDeleted("financial"); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-act='refresh']") && C.parseRoute().name === "financial") { fin.data = null; fin.report = null; M.clearDeleted("financial"); }
    const el = e.target.closest("[data-fin]");
    if (!el || el.tagName === "SELECT" || C.parseRoute().name !== "financial") return;
    const d = el.dataset;
    switch (d.fin) {
      case "retry": fin.error = ""; C.render(); break;
      case "mark": mark(d.table, d.id, d.to); break;
      case "all-history": fin.allHistory[d.id] = true; C.render(); break;
      case "add-entry": {
        const K = KINDS[d.kind], it = byId(K.items, d.id);
        M.recordForm(ctx, K.entries, "", { prefill: { [K.id]: d.id, "Due Date": today(), "Amount": it ? it["Amount"] : "", "Status": K.open }, hide: [K.id], title: "One-off entry · " + (it ? it["Name"] : "") });
        break;
      }
      case "add-loanpay": M.recordForm(ctx, "loanpays", "", { prefill: { "Loan ID": d.id, "Date": today() }, hide: ["Loan ID"], title: "Extra payment / adjustment" }); break;
      case "add-option": optionForm(d.id, ""); break;
      case "edit-option": { const o = byId("options", d.id); if (o) optionForm(o["Plan ID"], d.id); break; }
      case "hockey": hockeyForm(d.id); break;
      case "year": fin.reportYear = +d.y; C.render(); break;
      case "default-days":
        try {
          C.busy(true);
          const r = await C.api("financial.setDays", { module: "financial", days: fin.days });
          D().days = r.days; toast("Saved as your default"); C.render();
        } catch (err) { toast(err.message, true); } finally { C.busy(false); }
        break;
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest && e.target.closest("[data-fin='edit-option']");
    if (el) { e.preventDefault(); el.click(); }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (!t || !t.matches || C.parseRoute().name !== "financial") return;
    if (t.matches("[data-fin='days']")) { fin.days = +t.value; C.render(); }
  });
})();
