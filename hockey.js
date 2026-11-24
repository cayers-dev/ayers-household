/* Ayers Household - Travel Hockey screens
 * Home (this week), earnings, chore plan, weekly totals, expenses, schedule, venues and settings.
 * Data comes from hockey.load; adds, edits and deletes go through the shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, $$, toast, ICONS, svg, section, tile, plural } = C;
  const { money, fmtDay, fmtTime, fmtDayTime, parseIso, isoDay } = M;

  const hk = { data: null, loading: false, error: "", seasonId: "", earnMine: false, expCat: "", schedPast: false, showFuture: false };

  // Extra icons for this module.
  const IC = {
    chore: svg('<path d="M4 20l6-6"/><path d="M14.5 3.5l6 6-7 7-6-6z"/><path d="M9 9l6 6"/>'),
    calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
    warn: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>')
  };

  // ------------------------------------------------------------------
  // Data and the module context used by the shared screens
  // ------------------------------------------------------------------
  const D = () => hk.data;
  // A closed season is view-only for everyone but admins.
  const SEASON_AREAS = ["earnings", "totals", "expenses", "schedule"];
  const SEASON_TABLES = ["earnings", "plan", "expenses", "events", "weekflags"];
  const closedLock = () => !!(hk.data && hk.data.seasonClosed) && !C.isAdmin();
  const can = (area, cap) => !(cap !== "view" && closedLock() && SEASON_AREAS.indexOf(area) !== -1) && M.can(ctx, area, cap);
  // "Jasper 2026-27 Hockey"
  const seasonLabel = s => !s ? "" : s._label || s["Season"];
  const seasonById = id => (D().seasons || []).find(s => s["Season ID"] === id);
  const season = () => seasonById(D().seasonId);
  const choreById = id => (D().chores || []).find(c => c["Chore ID"] === id);
  const venueById = id => (D().venues || []).find(v => v["Venue ID"] === id);
  const today = () => D().today;
  const sportOptions = () => (D().schema.events.fields.find(f => f.name === "Sport").options || []);

  async function load(seasonId) {
    hk.loading = true; hk.error = "";
    try {
      const r = await C.api("hockey.load", { seasonId: seasonId || hk.seasonId || undefined });
      hk.data = r; hk.seasonId = r.seasonId;
    } catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { hk.loading = false; C.handleError(err); return; }
      hk.error = err.message;
    } finally { hk.loading = false; }
    if (C.parseRoute().name === "hockey") C.render();
  }

  const ctx = {
    key: "hockey",
    data: () => hk.data,
    schema: t => hk.data.schema[t],
    rows: t => ({
      seasons: D().seasons, earnings: D().earnings, plan: D().plan, expenses: D().expenses, events: D().events,
      chores: D().chores, venues: D().venues, consequences: D().consequences, lists: D().lists, settings: D().settingsRows
    }[t] || []),
    locked: t => closedLock() && SEASON_TABLES.indexOf(t) !== -1,
    // The season's player may remove any planned chore in their season (matches the server).
    allow: (t, op, row) => t === "plan" && op === "delete" && !!row && D().settings.playerId === C.state.me.id && M.can(ctx, "earnings", "add"),
    refLabel: (t, r) => t === "chores" ? r["Chore"] + " – " + money(r["Amount"]) : t === "seasons" ? seasonLabel(r) :
      t === "venues" ? r["Name"] : t === "lists" ? r["Value"] : t === "consequences" ? r["Level"] + ". " + r["Consequence"] :
      t === "settings" ? r["Setting"] + ": " + r["Value"] : (r["Title"] || r["Item"] || ""),
    refSort: (t, a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }),
    defaults: t => {
      const d = {};
      if (["earnings", "plan", "expenses"].indexOf(t) !== -1) d["Date"] = clampToSeason(today());
      if (["earnings", "plan", "expenses", "events"].indexOf(t) !== -1) d["Season ID"] = D().seasonId;
      if (["expenses", "events"].indexOf(t) !== -1) { const sp = (season() || {})["Sport"] || D().settings.defaultSport; if (sp) d["Sport"] = sp; }
      if (t === "seasons") { d["Sport"] = D().settings.defaultSport || ""; }
      return d;
    },
    hideField: (t, name, values, row) => {
      if (name === "Sport") return sportOptions().length <= 1 && (!row || !row["Sport"] || sportOptions().indexOf(row["Sport"]) !== -1);
      if (name === "Season ID") return (D().seasons || []).filter(s => s["Active"] !== false).length <= 1 && !!values["Season ID"];
      return false;
    },
    title: (t, r) => {
      if (t === "earnings" || t === "plan") return r["Chore Name"] || (choreById(r["Chore ID"]) || {})["Chore"] || "Chore";
      if (t === "expenses") return r["Item"] || r["Category"] || "Expense";
      if (t === "events") return [r["Type"], r["Title"]].filter(Boolean).join(": ");
      return ctx.refLabel(t, r);
    },
    singular: t => ({ earnings: "chore", plan: "planned chore", expenses: "expense", events: "event", chores: "chore",
      venues: "venue", consequences: "consequence", lists: "list value", seasons: "season", settings: "setting" }[t] || "entry"),
    // Saves through the server, then reloads this module (and Home's Due Soon in the background).
    save: async (action, payload, msg, opts) => {
      C.busy(true);
      let res;
      try {
        // reload: the server answers with the fresh Travel Hockey data in the same reply.
        res = await C.api(action, Object.assign({ module: "hockey", seasonId: hk.seasonId, reload: true }, payload));
      } catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        // Refused: what's on screen is out of date (access changed, season closed...). Reload it.
        if (err.code === "FORBIDDEN") { hk.data = null; hk.loading = false; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast((typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) { hk.data = res.moduleData; hk.seasonId = res.moduleData.seasonId; }
      else await load();
      C.state.homeStale = true;   // Home's Due Soon refreshes next time Home is shown
      C.render();
      return res || true;
    },
    reload: () => load(),
    // Server asks before changing entries already logged (chore price change).
    confirm: async q => {
      if (q.kind !== "chorePrice") return null;
      const a = await M.chooseSheet({
        title: "Update logged entries?",
        message: q.chore + " is changing from " + money(q.from) + " to " + money(q.to) + ". " + plural(q.count, "entry", "entries") +
          " this season (" + q.season + ") " + (q.count === 1 ? "was" : "were") + " logged at a different price. Change " + (q.count === 1 ? "it" : "them") + " to " + money(q.to) + " too?",
        choices: [{ value: "yes", label: "Update " + (q.count === 1 ? "it" : "them"), primary: true }, { value: "no", label: "Only new entries" }]
      });
      return a === null ? null : { applyToSeason: a === "yes" };
    },
    onFormReady: (t, form, row) => {
      // Show the chore's price as it's picked.
      if (t === "earnings" || t === "plan") {
        const sel = $('select[name="Chore ID"]', form);
        if (!sel) return;
        let note = $(".chore-price", form);
        if (!note) { note = document.createElement("div"); note.className = "hint chore-price"; sel.parentNode.appendChild(note); }
        const upd = () => { const c = choreById(sel.value); note.textContent = c ? "Worth " + money(c["Amount"]) + (row && row["Amount"] !== undefined && t === "earnings" && Number(row["Amount"]) !== Number(c["Amount"]) && sel.value === row["Chore ID"] ? " now (logged at " + money(row["Amount"]) + ")" : "") : ""; };
        sel.addEventListener("change", upd); sel.addEventListener("input", upd); upd();
      }
    }
  };

  // A new entry's date stays inside the season being viewed.
  function clampToSeason(d) {
    const s = season(); if (!s) return d;
    if (d < s["Start Date"]) return s["Start Date"];
    if (d > s["End Date"]) return s["End Date"];
    return d;
  }

  // ------------------------------------------------------------------
  // Pieces
  // ------------------------------------------------------------------
  const pill = (text, cls) => '<span class="pill ' + (cls || "") + '">' + esc(text) + '</span>';
  const metPill = w => w.state === "future" ? "" : w.met === "Exc" ? pill("Excluded") : w.state === "current" ? pill(w.diff >= -0.005 ? "On track so far" : "In progress", w.diff >= -0.005 ? "ok" : "") :
    w.met === "Y" ? pill("Met", "ok") : pill("Not met", "bad");
  const weekRange = w => fmtDay(w.start, { weekday: undefined }) + " – " + fmtDay(w.end, { weekday: undefined });
  const monthly = () => !!(D().status && D().status.monthly);
  const monthName = (mo, opts) => parseIso(mo.start).toLocaleDateString(undefined, opts || { month: "long", year: "numeric" });
  const venueLine = id => { const v = venueById(id); return v ? v["Name"] : ""; };

  function seasonPicker() {
    const ss = D().seasons || [];
    if (!ss.length) return "";
    const closed = D().seasonClosed ? " " + pill("Closed" + (C.isAdmin() ? "" : " · view only")) : "";
    if (ss.length === 1) return '<div class="season-pick season-one"><span class="meta">Season</span><b>' + esc(seasonLabel(ss[0])) + '</b>' + closed + '</div>';
    return '<div class="field season-pick"><label for="hk_season">Season' + closed + '</label><select id="hk_season" data-hk="season">' +
      ss.map(s => '<option value="' + esc(s["Season ID"]) + '"' + (s["Season ID"] === D().seasonId ? " selected" : "") + '>' + esc(seasonLabel(s)) + (s["Active"] === false ? " (closed)" : "") + '</option>').join("") +
      '</select></div>';
  }

  function thisMonthCard() {
    const st = D().status, t = st.totals, mo = st.current;
    const sname = (season() || {})["Season"] || "";
    const pct = esc((season() || {})["Share %"]);
    if (!mo) {
      const months = D().months || [];
      const started = months.some(x => x.state !== "future");
      return '<a class="card hk-week" href="#/hockey/weeks"><div class="hk-week-head"><b>' + esc(sname) + '</b>' + pill(started ? "Season over" : "Not started") + '</div>' +
        (started ? '<div class="hk-kv"><div><span>Required (' + pct + '% of ' + money(t.billable) + ')</span><b>' + money(t.required) + '</b></div>' +
          '<div><span>Earned</span><b>' + money(t.earned) + '</b></div>' +
          '<div><span>' + (t.diff < -0.005 ? "Short by" : "Over by") + '</span><b class="' + (t.diff < -0.005 ? "neg" : "pos") + '">' + money(Math.abs(t.diff)) + '</b></div></div>' +
          (t.afterEnd > 0 ? '<p class="hint" style="margin:8px 0 0">Earned includes ' + money(t.afterEnd) + ' logged after the season ended.</p>' : "") : "") + '</a>';
    }
    const left = Math.max(0, mo.required - mo.earned);
    const player = (D().users || []).find(u => u.id === D().settings.playerId);
    return '<a class="card hk-week" href="#/hockey/weeks">' +
      '<div class="hk-week-head"><b>' + (player ? esc(player.name.split(" ")[0]) + "’s month" : "This month") + '</b><span class="meta">Month ' + mo.n + ' of ' + (D().months || []).length + ' · ' + esc(monthName(mo)) + '</span></div>' +
      '<div class="hk-big ' + (left > 0 ? "" : "pos") + '">' + (left > 0 ? money(left) + '<span> to go</span>' : 'On track<span> this month</span>') + '</div>' +
      '<div class="hk-kv"><div><span>Required to date</span><b>' + money(mo.required) + '</b></div>' +
        '<div><span>Earned this month</span><b>' + money(mo.monthEarned) + '</b></div>' +
        '<div><span>Earned to date</span><b>' + money(mo.earned) + '</b></div></div></a>';
  }

  function thisWeekCard() {
    const st = D().status;
    if (!st) return "";
    if (st.monthly) return thisMonthCard();
    const w = st.current;
    const sname = (season() || {})["Season"] || "";
    if (!w) {
      const last = (D().weeks || []).filter(x => x.state === "done").pop();
      return '<div class="card hk-week"><div class="hk-week-head"><b>' + esc(sname) + '</b>' + (last ? pill("Season over") : pill("Not started")) + '</div>' +
        (last ? '<div class="hk-kv"><div><span>Total required</span><b>' + money(last.required) + '</b></div><div><span>Total earned</span><b>' + money(last.earned) + '</b></div><div><span>Difference</span><b class="' + (last.diff < 0 ? "neg" : "pos") + '">' + money(last.diff) + '</b></div></div>' : "") + '</div>';
    }
    const left = Math.max(0, w.remaining);
    const player = (D().users || []).find(u => u.id === D().settings.playerId);
    return '<a class="card hk-week" href="#/hockey/weeks">' +
      '<div class="hk-week-head"><b>' + (player ? esc(player.name.split(" ")[0]) + "’s week" : "This week") + '</b><span class="meta">Week ' + w.n + ' of ' + D().weeks.length + ' · ' + esc(weekRange(w)) + '</span></div>' +
      '<div class="hk-big ' + (left > 0 ? "" : "pos") + '">' + (left > 0 ? money(left) + '<span> to go</span>' : 'On track<span> this week</span>') + '</div>' +
      '<div class="hk-kv">' +
        '<div><span>Week’s target</span><b>' + money(w.target) + '</b>' + (w.pastDue ? '<em>incl. ' + money((season() || {})["Past Due Extra"]) + ' past-due extra</em>' : "") + '</div>' +
        '<div><span>Earned this week</span><b>' + money(w.weeklyEarned) + '</b></div>' +
        '<div><span>Season so far</span><b class="' + (w.diff < -0.005 ? "neg" : "pos") + '">' + (w.diff < -0.005 ? money(-w.diff) + " behind" : money(w.diff) + " ahead") + '</b></div>' +
      '</div>' +
      (w.consequenceWeek || st.level ? '<div class="hk-cons">' + (w.consequenceWeek ? pill("Consequence week", "bad") + " " : "") +
        (st.level ? '<span class="meta">Consequence level ' + st.level + '</span>' : "") + '</div>' : "") +
      '</a>';
  }

  function consequencesCard() {
    const st = D().status;
    if (!st) return "";
    if (st.consequencesOff) return '<div class="card hk-total"><span>Consequences are turned off this season</span>' +
      (C.isAdmin() ? '<a class="link-btn" href="#/hockey/list/seasons">Change</a>' : "") + '</div>';
    const all = (D().consequences || []).filter(c => c["Active"] !== false).sort((a, b) => a["Level"] - b["Level"]);
    const body = all.length ? all.map(c => '<div class="list-item ' + (Number(c["Level"]) <= st.level ? "" : "dim") + '"><span class="thumb hk-lvl">' + esc(c["Level"]) + '</span>' +
      '<div class="body"><div class="title">' + esc(c["Consequence"]) + '</div></div>' + (Number(c["Level"]) <= st.level ? pill("Applies", "bad") : "") + '</div>').join("")
      : '<div class="empty">No consequences set up.</div>';
    return section("Consequences · level " + st.level, '<div class="card list">' + body + '</div>',
      M.tableCan(ctx, "consequences", "add") ? '<a class="link-btn" href="#/hockey/list/consequences">Edit</a>' : "");
  }

  function eventRow(e) {
    return '<a class="list-item" href="#/hockey/event/' + encodeURIComponent(e["Event ID"]) + '"><span class="thumb hk-date"><b>' +
      esc(fmtDay(e["Start"], { weekday: undefined, month: "short", day: undefined })) + '</b>' + esc(String(parseIso(e["Start"]).getDate())) + '</span>' +
      '<div class="body"><div class="title">' + esc(ctx.title("events", e)) + '</div><div class="sub">' +
      esc([fmtDay(e["Start"], { month: undefined, day: undefined }) + (fmtTime(e["Start"]) ? " " + fmtTime(e["Start"]) : ""), venueLine(e["Venue ID"])].filter(Boolean).join(" · ")) + '</div></div></a>';
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  function viewHome() {
    const d = D();
    if (!d.seasonId) {
      return { title: "Travel Hockey", back: true, html: '<div class="card"><div class="empty">' +
        (C.isAdmin() ? "No seasons yet. Add one under Lists & settings ▸ Seasons." : "There’s no Travel Hockey season for you. A season shows only to its player, editors and admins.") +
        '</div></div><div class="actions"><button class="btn" data-hk="reload">Try again</button></div>' +
        (settingsLinks().length ? '<div class="section"><div class="home-grid">' + tile("#/hockey/settings", IC.gear, "Lists & settings", "") + '</div></div>' : "") };
    }
    const upcoming = (d.events || []).filter(e => String(e["Start"]).slice(0, 10) >= today()).sort((a, b) => String(a["Start"]).localeCompare(String(b["Start"])));
    const earnTotal = (d.earnings || []).reduce((s, e) => s + (Number(e["Amount"]) || 0), 0);
    const billable = (d.expenses || []).filter(e => !e["Non-Billable"]).reduce((s, e) => s + (Number(e["Amount"]) || 0), 0);
    const monthKey = today().slice(0, 7);
    const planned = (d.plan || []).filter(p => String(p["Date"]).slice(0, 7) === monthKey);
    const actions = [];
    if (d.earnings && can("earnings", "add")) actions.push('<button class="btn primary" data-hk="log">' + ICONS.plus + 'Log a chore</button>');
    if (d.expenses && can("expenses", "add")) actions.push('<button class="btn" data-hk="add-expense">' + ICONS.plus + 'Expense</button>');
    if (d.events && can("schedule", "add")) actions.push('<button class="btn" data-hk="add-event">' + ICONS.plus + 'Schedule</button>');
    const tiles = [];
    if (d.earnings) tiles.push(tile("#/hockey/earnings", IC.chore, "Earnings", plural(d.earnings.length, "entry", "entries") + " · " + money(earnTotal)));
    if (d.plan) tiles.push(tile("#/hockey/plan/" + monthKey, IC.calendar, "Chore plan", planned.length ? plural(planned.filter(p => p["Status"] !== "Done").length, "planned chore") + " this month" : "Plan the month"));
    if (d.status && d.status.monthly) tiles.push(tile("#/hockey/weeks", IC.chart, "Monthly totals", d.status.totals.diff < -0.005 ? money(-d.status.totals.diff) + " short" : "On track"));
    else if (d.status) tiles.push(tile("#/hockey/weeks", IC.chart, "Weekly totals", d.status.consequencesOff ? "Consequences off" : "Consequence level " + d.status.level));
    if (d.expenses) tiles.push(tile("#/hockey/expenses", IC.receipt, "Expenses", money(billable) + " billable"));
    if (d.events) tiles.push(tile("#/hockey/schedule", ICONS.clock, "Schedule", plural(upcoming.length, "upcoming event")));
    if (d.events) tiles.push(tile("#/hockey/venues", IC.pin, "Venues", plural((d.venues || []).filter(v => v["Active"] !== false).length, "venue")));
    if (settingsLinks().length) tiles.push(tile("#/hockey/settings", IC.gear, "Lists & settings", settingsLinks().map(x => x[2]).slice(0, 3).join(", ")));
    const html = seasonPicker() + thisWeekCard() +
      (actions.length ? '<div class="actions hk-actions">' + actions.join("") + '</div>' : "") +
      (d.events ? section("Coming up", upcoming.length ? '<div class="card list">' + upcoming.slice(0, 3).map(eventRow).join("") + '</div>' :
        '<div class="card"><div class="empty">Nothing on the schedule.</div></div>', '<a class="link-btn" href="#/hockey/schedule">All</a>') : "") +
      '<div class="section"><div class="home-grid">' + tiles.join("") + '</div></div>';
    return { title: "Travel Hockey", back: true, html: html };
  }

  function viewEarnings() {
    const d = D();
    if (!d.earnings) return noAccess("Earnings");
    const me = C.state.me.id;
    const rows = d.earnings.filter(e => !hk.earnMine || e["Added By"] === me)
      .sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])) || String(b["Added At"]).localeCompare(String(a["Added At"])));
    const total = rows.reduce((s, e) => s + (Number(e["Amount"]) || 0), 0);
    const byDay = {};
    rows.forEach(e => { (byDay[e["Date"]] = byDay[e["Date"]] || []).push(e); });
    const groups = Object.keys(byDay).sort().reverse().map(day =>
      '<div class="hk-group"><div class="hk-grouphead"><span>' + esc(fmtDay(day)) + '</span><span>' + money(byDay[day].reduce((s, e) => s + Number(e["Amount"] || 0), 0)) + '</span></div>' +
      byDay[day].map(e => '<div class="list-item" role="button" tabindex="0" data-mod-edit="earnings" data-id="' + esc(e["Earning ID"]) + '">' +
        '<div class="body"><div class="title">' + esc(e["Chore Name"]) + '</div><div class="sub">' +
        esc([e["Added By"] !== me ? M.userName(ctx, e["Added By"]) : "", e["Notes"]].filter(Boolean).join(" · ")) + '</div></div>' +
        '<span class="hk-amt">' + money(e["Amount"]) + '</span></div>').join("") + '</div>').join("");
    const html = seasonPicker() +
      '<div class="hk-toolbar">' + (can("earnings", "add") ? '<button class="btn primary" data-hk="log">' + ICONS.plus + 'Log a chore</button>' : "") +
        '<label class="check"><input type="checkbox" data-hk="earn-mine"' + (hk.earnMine ? " checked" : "") + '> Only mine</label></div>' +
      '<div class="card hk-total"><span>' + plural(rows.length, "entry", "entries") + '</span><b>' + money(total) + '</b></div>' +
      (groups ? '<div class="card list">' + groups + '</div>' : '<div class="card"><div class="empty">No chores logged yet this season.</div></div>');
    return { title: "Earnings", back: true, html: html };
  }

  function viewPlan(month) {
    const d = D();
    if (!d.plan) return noAccess("Chore plan");
    month = /^\d{4}-\d{2}$/.test(month || "") ? month : today().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    const prev = isoDay(new Date(y, m - 2, 1)).slice(0, 7), next = isoDay(new Date(y, m, 1)).slice(0, 7);
    const items = d.plan.filter(p => String(p["Date"]).slice(0, 7) === month);
    const price = p => { const c = choreById(p["Chore ID"]); return c ? Number(c["Amount"]) : 0; };
    const plannedTotal = items.reduce((s, p) => s + price(p), 0);
    const doneTotal = items.filter(p => p["Status"] === "Done").reduce((s, p) => s + price(p), 0);
    const required = d.months ? ((d.months.find(x => x.start.slice(0, 7) === month) || {}).toEarn || 0)
      : (d.weeks || []).filter(w => w.start.slice(0, 7) === month).reduce((s, w) => s + w.weeklyRequired, 0);
    const canPlan = M.tableCan(ctx, "plan", "add");
    let list = "";
    for (let i = 1; i <= days; i++) {
      const day = isoDay(new Date(y, m - 1, i));
      const mine = items.filter(p => String(p["Date"]).slice(0, 10) === day);
      list += '<div class="hk-day' + (day === today() ? " today" : "") + '"><div class="hk-day-l"><b>' + i + '</b><span>' + esc(fmtDay(day, { month: undefined, day: undefined })) + '</span></div>' +
        '<div class="hk-day-chips">' + mine.map(p => {
          const name = (choreById(p["Chore ID"]) || {})["Chore"] || p["Chore Name"];
          const canDel = M.tableCan(ctx, "plan", "delete", p);
          return '<span class="hk-chipwrap' + (p["Status"] === "Done" ? " done" : "") + (canDel ? " has-x" : "") + '">' +
            '<button class="chip hk-chip' + (p["Status"] === "Done" ? " done" : "") + '" data-hk="plan-item" data-id="' + esc(p["Plan ID"]) + '">' +
            (p["Status"] === "Done" ? ICONS.check : "") + esc(name) + ' <span>' + money(price(p)) + '</span></button>' +
            (canDel ? '<button class="hk-chip-x" data-hk="plan-del" data-id="' + esc(p["Plan ID"]) + '" aria-label="Remove ' + esc(name) + ' from the plan">' + ICONS.close + '</button>' : "") +
            '</span>';
        }).join("") +
        (canPlan ? '<button class="chip hk-add" data-hk="plan-add" data-date="' + day + '" aria-label="Plan a chore on ' + esc(fmtDay(day)) + '">' + ICONS.plus + '</button>' : "") + '</div></div>';
    }
    const html =
      '<div class="hk-month-nav"><a class="icon-btn" href="#/hockey/plan/' + prev + '" aria-label="Previous month">' + ICONS.back + '</a>' +
        '<b>' + esc(first.toLocaleDateString(undefined, { month: "long", year: "numeric" })) + '</b>' +
        '<a class="icon-btn" href="#/hockey/plan/' + next + '" aria-label="Next month">' + ICONS.next + '</a></div>' +
      '<div class="card hk-kv hk-plan-sum">' +
        '<div><span>Month required</span><b>' + money(required) + '</b></div>' +
        '<div><span>Planned</span><b>' + money(plannedTotal) + '</b></div>' +
        '<div><span>Difference</span><b class="' + (plannedTotal - required < -0.005 ? "neg" : "pos") + '">' + money(plannedTotal - required) + '</b></div>' +
        '<div><span>Done so far</span><b>' + money(doneTotal) + '</b></div></div>' +
      '<p class="hint" style="margin:8px 4px">Tap a planned chore to log it as done. Prices shown are today’s chore prices.</p>' +
      '<div class="card hk-days">' + list + '</div>';
    return { title: "Chore plan", back: true, html: html, keepScroll: true };
  }

  // × on a planned chore: take it off the plan (a done one asks first; its logged chore stays).
  async function planDelete(id) {
    const p = (D().plan || []).find(x => x["Plan ID"] === id);
    if (!p) return;
    const name = (choreById(p["Chore ID"]) || {})["Chore"] || p["Chore Name"];
    if (p["Status"] === "Done") {
      const ok = await M.confirmSheet({ title: "Remove from the plan?", message: name + " on " + fmtDay(p["Date"]) + " comes off the plan. The chore already logged stays in Earnings.", submitLabel: "Remove", danger: true });
      if (!ok) return;
    }
    try { await ctx.save("modDelete", { table: "plan", id: id }, "Removed " + name + " from the plan"); }
    catch (err) { toast(err.message, true); }
  }

  function planItem(id) {
    const p = (D().plan || []).find(x => x["Plan ID"] === id);
    if (!p) return;
    const canDone = p["Status"] !== "Done" && can("earnings", "add");
    if (!canDone) { M.recordForm(ctx, "plan", id); return; }
    const c = choreById(p["Chore ID"]) || {};
    M.chooseSheet({
      title: c["Chore"] || p["Chore Name"],
      message: "Planned for " + fmtDay(p["Date"]) + ", worth " + money(c["Amount"]) + ".",
      choices: [{ value: "done", label: "Mark done", primary: true }].concat(M.tableCan(ctx, "plan", "edit", p) ? [{ value: "edit", label: "Edit or delete" }] : [])
    }).then(async a => {
      if (a === "done") { try { await ctx.save("hockey.planDone", { id: id }, "Logged: " + (c["Chore"] || "chore")); } catch (err) { toast(err.message, true); } }
      if (a === "edit") M.recordForm(ctx, "plan", id);
    });
  }

  function viewMonths() {
    const d = D(), t = d.status.totals;
    const pct = esc((season() || {})["Share %"]);
    const card = mo => '<div class="card hk-wk ' + mo.state + (mo.state === "current" ? " now" : "") + '" id="mo-' + mo.start + '">' +
      '<div class="hk-wk-head"><b>' + esc(monthName(mo)) + '</b><span class="meta">Month ' + mo.n + ' of ' + d.months.length + '</span><span class="hk-pills">' + metPill(mo) + '</span></div>' +
      (mo.state === "future" ? '<div class="hk-kv"><div><span>Expenses so far</span><b>' + money(mo.totalExp) + '</b></div></div>' :
      '<div class="hk-kv">' +
        '<div><span>Required to date</span><b>' + money(mo.required) + '</b></div>' +
        '<div><span>Earned to date</span><b>' + money(mo.earned) + '</b></div>' +
        '<div><span>Difference</span><b class="' + (mo.diff < -0.005 ? "neg" : "pos") + '">' + money(mo.diff) + '</b></div>' +
        '<div><span>Expenses this month</span><b>' + money(mo.monthExp) + '</b></div>' +
        '<div><span>Expenses to date</span><b>' + money(mo.totalExp) + '</b></div>' +
        '<div><span>Earned this month</span><b>' + money(mo.monthEarned) + '</b></div>' +
      '</div>') +
      (mo.state !== "future" ? '<div class="hk-wk-foot"><span class="meta"></span>' + entriesBtn(mo.start, mo.end, monthName(mo)) + '</div>' : "") + '</div>';
    const cur = d.months.filter(x => x.state === "current");
    const done = d.months.filter(x => x.state === "done").reverse();
    const future = d.months.filter(x => x.state === "future");
    const summary = '<div class="card hk-kv hk-plan-sum">' +
      '<div><span>Billable expenses</span><b>' + money(t.billable) + '</b></div>' +
      '<div><span>Required (' + pct + '%)</span><b>' + money(t.required) + '</b></div>' +
      '<div><span>Earned</span><b>' + money(t.earned) + '</b></div>' +
      '<div><span>' + (t.diff < -0.005 ? "Short by" : "Over by") + '</span><b class="' + (t.diff < -0.005 ? "neg" : "pos") + '">' + money(Math.abs(t.diff)) + '</b></div></div>' +
      (t.afterEnd > 0 ? '<p class="hint" style="margin:8px 4px 0">Earned includes ' + money(t.afterEnd) + ' logged after the season ended (not in any month below).</p>' : "");
    const html = seasonPicker() + summary +
      (cur.length ? section("This month", cur.map(card).join("")) : "") +
      (done.length ? section("Past months", done.map(card).join("")) : "") +
      (future.length ? section("Coming months", future.map(card).join("")) : "") +
      '<p class="hint">This season is tracked monthly. Each month’s required amount is ' + pct + '% of billable expenses paid so far, divided by the months left in the season (this month included), compared with everything earned up to the end of the month. No consequences.</p>';
    return { title: "Monthly totals", back: true, html: html, keepScroll: true };
  }

  function viewWeeks() {
    const d = D();
    if (!d.status) return noAccess("Weekly totals");
    if (d.status.monthly) return viewMonths();
    const canEx = can("totals", "edit") && !d.status.consequencesOff;
    const card = w => '<div class="card hk-wk ' + w.state + (w.state === "current" ? " now" : "") + '" id="wk-' + w.start + '">' +
      '<div class="hk-wk-head"><b>Week ' + w.n + '</b><span class="meta">' + esc(weekRange(w)) + '</span><span class="hk-pills">' + metPill(w) +
        (w.consequenceWeek ? pill("Consequence week", "bad") : "") + '</span></div>' +
      (w.state === "future" ? '<div class="hk-kv"><div><span>Required so far</span><b>' + money(w.weeklyRequired) + '</b></div><div><span>Expenses so far</span><b>' + money(w.totalExp) + '</b></div></div>' :
      '<div class="hk-kv">' +
        '<div><span>Week required</span><b>' + money(w.weeklyRequired) + '</b></div>' +
        '<div><span>Week earned</span><b>' + money(w.weeklyEarned) + '</b></div>' +
        '<div><span>' + (w.state === "current" ? "Still to earn" : w.remaining > 0.005 ? "Short of target" : "Over target") + '</span><b class="' + (w.remaining > 0.005 ? "neg" : "pos") + '">' + money(w.state === "current" ? Math.max(0, w.remaining) : Math.abs(w.remaining)) + '</b>' + (w.pastDue ? '<em>target incl. past-due extra</em>' : "") + '</div>' +
        '<div><span>Total required</span><b>' + money(w.required) + '</b></div>' +
        '<div><span>Total earned</span><b>' + money(w.earned) + '</b></div>' +
        '<div><span>Difference</span><b class="' + (w.diff < -0.005 ? "neg" : "pos") + '">' + money(w.diff) + '</b></div>' +
      '</div>') +
      '<div class="hk-wk-foot"><span class="meta">Billable expenses to date ' + money(w.totalExp) + (w.note ? ' · ' + esc(w.note) : "") + '</span>' +
        (w.state !== "future" ? entriesBtn(w.start, w.end, "Week " + w.n + " · " + weekRange(w)) : "") +
        (canEx && w.state !== "future" ? '<button class="link-btn" data-hk="exclude" data-week="' + w.start + '" data-on="' + (w.exclude ? "0" : "1") + '">' + (w.exclude ? "Count again" : "Exclude") + '</button>' : "") + '</div></div>';
    const cur = d.weeks.filter(w => w.state === "current");
    const done = d.weeks.filter(w => w.state === "done").reverse();
    const future = d.weeks.filter(w => w.state === "future");
    const html = seasonPicker() + consequencesCard() +
      (cur.length ? section("This week", cur.map(card).join("")) : "") +
      (done.length ? section("Past weeks", done.map(card).join("")) : "") +
      (future.length ? section("Coming weeks", hk.showFuture ? future.map(card).join("") : '<button class="btn" data-hk="show-future">Show ' + plural(future.length, "coming week") + '</button>') : "") +
      '<p class="hint">Each week’s required amount is ' + esc((season() || {})["Share %"]) + '% of billable expenses received so far, minus what earlier weeks already required, spread over the weeks left. ' + (d.status.consequencesOff ? "Consequences are turned off for this season (Lists & settings ▸ Seasons)." : "Excluded weeks still count toward the totals but not toward consequences.") + '</p>';
    return { title: "Weekly totals", back: true, html: html, keepScroll: true };
  }

  async function toggleExclude(weekStart, on) {
    let note = "";
    if (on) {
      const w = D().weeks.find(x => x.start === weekStart);
      const ok = await new Promise(resolve => {
        let done = false;
        C.openSheet({
          title: "Exclude week " + w.n + "?",
          body: '<p class="confirm-msg">Week ' + w.n + ' (' + esc(weekRange(w)) + ') won’t count toward consequences. Its required amount still counts toward the season total.</p>' +
            '<div class="field"><label for="f_exnote">Reason (optional)</label><input type="text" id="f_exnote" name="note" placeholder="e.g. Thanksgiving trip"></div>',
          submitLabel: "Exclude", onClose: () => { if (!done) resolve(false); },
          onSubmit: async v => { done = true; note = v.note; resolve(true); return true; }
        });
      });
      if (!ok) return;
    }
    try { await ctx.save("hockey.setExclude", { seasonId: hk.seasonId, weekStart: weekStart, exclude: on, note: note }, on ? "Week excluded" : "Week counts again"); }
    catch (err) { toast(err.message, true); }
  }

  function viewExpenses() {
    const d = D();
    if (!d.expenses) return noAccess("Expenses");
    const cats = Array.from(new Set(d.expenses.map(e => e["Category"]).filter(Boolean))).sort();
    const rows = d.expenses.filter(e => !hk.expCat || e["Category"] === hk.expCat).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])));
    const sum = list => list.reduce((s, e) => s + (Number(e["Amount"]) || 0), 0);
    const billable = sum(rows.filter(e => !e["Non-Billable"])), nonb = sum(rows.filter(e => e["Non-Billable"]));
    const pct = Number((season() || {})["Share %"]) || 0;
    const html = seasonPicker() +
      '<div class="hk-toolbar">' + (can("expenses", "add") ? '<button class="btn primary" data-hk="add-expense">' + ICONS.plus + 'Add expense</button>' : "") +
        '<select data-hk="exp-cat" aria-label="Category"><option value="">All categories</option>' + cats.map(c => '<option' + (c === hk.expCat ? " selected" : "") + '>' + esc(c) + '</option>').join("") + '</select></div>' +
      '<div class="card hk-kv">' +
        '<div><span>Billable</span><b>' + money(billable) + '</b></div>' +
        '<div><span>Non-billable</span><b>' + money(nonb) + '</b></div>' +
        '<div><span>Player’s ' + pct + '% share</span><b>' + money(billable * pct / 100) + '</b></div></div>' +
      (rows.length ? '<div class="card list">' + rows.map(e =>
        '<div class="list-item" role="button" tabindex="0" data-mod-edit="expenses" data-id="' + esc(e["Expense ID"]) + '">' +
        '<div class="body"><div class="title">' + esc(e["Item"] || e["Category"]) + '</div>' +
        '<div class="sub">' + esc([fmtDay(e["Date"], { weekday: undefined, year: "numeric" }), e["Item"] ? e["Category"] : "", venueLine(e["Location ID"])].filter(Boolean).join(" · ")) + '</div></div>' +
        '<span class="hk-amt">' + money(e["Amount"]) + (e["Non-Billable"] ? '<small>non-billable</small>' : "") + '</span></div>').join("") + '</div>'
        : '<div class="card"><div class="empty">No expenses yet this season.</div></div>');
    return { title: "Expenses", back: true, html: html };
  }

  function viewSchedule() {
    const d = D();
    if (!d.events) return noAccess("Schedule");
    const t = today();
    const rows = d.events.filter(e => hk.schedPast ? String(e["Start"]).slice(0, 10) < t : String(e["Start"]).slice(0, 10) >= t)
      .sort((a, b) => hk.schedPast ? String(b["Start"]).localeCompare(String(a["Start"])) : String(a["Start"]).localeCompare(String(b["Start"])));
    const html = seasonPicker() +
      '<div class="hk-toolbar">' + (can("schedule", "add") ? '<button class="btn primary" data-hk="add-event">' + ICONS.plus + 'Add event</button>' : "") +
        '<div class="segmented hk-seg"><button class="' + (hk.schedPast ? "" : "on") + '" data-hk="sched" data-past="0">Upcoming</button><button class="' + (hk.schedPast ? "on" : "") + '" data-hk="sched" data-past="1">Past</button></div></div>' +
      (rows.length ? '<div class="card list">' + rows.map(eventRow).join("") + '</div>' : '<div class="card"><div class="empty">' + (hk.schedPast ? "No past events." : "Nothing coming up.") + '</div></div>');
    return { title: "Schedule", back: true, html: html };
  }

  // Google Calendar "add event" link: the person picks the calendar on Google's own screen.
  function gcalLink(e) {
    const v = venueById(e["Venue ID"]);
    const stamp = s => String(s).replace(/[-:]/g, "").slice(0, 13) + "00";
    const start = parseIso(e["Start"]);
    const end = e["End"] ? e["End"] : (() => { const x = new Date(start.getTime() + 3600000); return isoDay(x) + "T" + String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0"); })();
    const q = new URLSearchParams({ action: "TEMPLATE", text: ctx.title("events", e), dates: stamp(e["Start"]) + "/" + stamp(end), ctz: "America/Los_Angeles" });
    if (v) q.set("location", [v["Name"], v["Address"]].filter(Boolean).join(", "));
    if (e["Notes"] || e["Opponent"]) q.set("details", [e["Opponent"] ? "Opponent: " + e["Opponent"] : "", e["Notes"]].filter(Boolean).join("\n"));
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }
  const mapsLink = v => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([v["Name"], v["Address"]].filter(Boolean).join(", "));

  function viewEvent(id) {
    const e = (D().events || []).find(x => x["Event ID"] === id);
    if (!e) return { title: "Event", back: true, html: '<div class="card"><div class="empty">That event isn’t here (deleted, or in another season).</div></div>' };
    const v = venueById(e["Venue ID"]);
    const kv = [["When", fmtDayTime(e["Start"]) + (e["End"] ? " – " + (String(e["End"]).slice(0, 10) === String(e["Start"]).slice(0, 10) ? fmtTime(e["End"]) : fmtDayTime(e["End"])) : "")],
      ["Type", e["Type"]], ["Title", e["Title"]], ["Opponent", e["Opponent"]], ["Sport", sportOptions().length > 1 ? e["Sport"] : ""], ["Notes", e["Notes"]]]
      .filter(x => x[1]).map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + esc(x[1]) + '</div>').join("");
    const html = '<div class="card kv">' + kv + '</div>' +
      (v ? section("Venue", venueCard(v)) : "") +
      '<div class="actions"><a class="btn primary" href="' + esc(gcalLink(e)) + '" target="_blank" rel="noopener">' + IC.calendar + 'Add to Google Calendar</a>' +
        (M.tableCan(ctx, "events", "edit", e) || C.isAdmin() ? '<button class="btn" data-mod-edit="events" data-id="' + esc(id) + '">Edit</button>' : "") + '</div>' +
      '<p class="hint">Google Calendar opens with the event filled in so you can pick which calendar it goes on. Later changes here don’t update it automatically yet.</p>';
    return { title: ctx.title("events", e), back: true, html: html };
  }

  function venueCard(v) {
    const kv = [["Rink notes", v["Rink Notes"]], ["Parking", v["Parking"]], ["Contact", v["Contact"]]]
      .filter(x => x[1]).map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + esc(x[1]) + '</div>').join("") +
      (v["Phone"] ? '<div class="k">Phone</div><div><a href="tel:' + esc(String(v["Phone"]).replace(/[^\d+]/g, "")) + '">' + esc(v["Phone"]) + '</a></div>' : "") +
      (v["Website"] ? '<div class="k">Website</div><div><a href="' + esc(v["Website"]) + '" target="_blank" rel="noopener">' + esc(String(v["Website"]).replace(/^https?:\/\//, "")) + '</a></div>' : "");
    return '<div class="card"><a class="list-item" href="#/hockey/venue/' + encodeURIComponent(v["Venue ID"]) + '"><span class="thumb">' + IC.pin + '</span><div class="body"><div class="title">' + esc(v["Name"]) + '</div>' +
      (v["Address"] ? '<div class="sub">' + esc(v["Address"]) + '</div>' : "") + '</div></a>' + (kv ? '<div class="kv">' + kv + '</div>' : "") +
      '<div class="actions" style="padding:0 12px 12px"><a class="btn" href="' + esc(mapsLink(v)) + '" target="_blank" rel="noopener">' + IC.pin + 'Open in Maps</a></div></div>';
  }

  function viewVenues() {
    const d = D();
    const rows = (d.venues || []).slice().sort((a, b) => ((b["Active"] !== false) - (a["Active"] !== false)) || a["Name"].localeCompare(b["Name"]));
    const html = (M.tableCan(ctx, "venues", "add") ? '<div class="actions" style="margin:0 0 12px"><button class="btn primary" data-mod-add="venues">' + ICONS.plus + 'Add venue</button></div>' : "") +
      '<div class="card list">' + (rows.map(v => '<a class="list-item ' + (v["Active"] === false ? "dim" : "") + '" href="#/hockey/venue/' + encodeURIComponent(v["Venue ID"]) + '">' +
        '<span class="thumb">' + IC.pin + '</span><div class="body"><div class="title">' + esc(v["Name"]) + '</div>' +
        '<div class="sub">' + esc(v["Address"] || "No address yet") + '</div></div>' + (v["Active"] === false ? pill("Off") : "") + '</a>').join("") || '<div class="empty">No venues yet.</div>') + '</div>';
    return { title: "Venues", back: true, html: html };
  }

  function viewVenue(id) {
    const v = venueById(id);
    if (!v) return { title: "Venue", back: true, html: '<div class="card"><div class="empty">That venue no longer exists.</div></div>' };
    const upcoming = (D().events || []).filter(e => e["Venue ID"] === id && String(e["Start"]).slice(0, 10) >= today())
      .sort((a, b) => String(a["Start"]).localeCompare(String(b["Start"])));
    const html = venueCard(v) + (v["Notes"] ? '<p class="hint" style="margin:10px 4px">' + esc(v["Notes"]) + '</p>' : "") +
      '<div class="actions"><button class="btn" data-mod-edit="venues" data-id="' + esc(id) + '">' + (M.tableCan(ctx, "venues", "edit") ? "Edit venue" : "Details") + '</button></div>' +
      (upcoming.length ? section("Coming up here", '<div class="card list">' + upcoming.map(eventRow).join("") + '</div>') : "");
    return { title: v["Name"], back: true, html: html };
  }

  // Lists & settings links the person may open: [href, icon, label, info].
  // The whole section is the "Seasons & Settings" area: without access to it, none of it shows
  // (admins always have it; Editors have it unless that area is set to No Access).
  const settingsOk = () => C.isAdmin() || M.can(ctx, "seasons", "view");
  function settingsLinks() {
    if (!settingsOk()) return [];
    const d = D(), av = a => M.can(ctx, a, "view"), admin = C.isAdmin();
    const listCount = name => (d.lists || []).filter(l => l["List"] === name && l["Active"] !== false).length;
    const out = [];
    if (av("earnings")) out.push(["#/hockey/list/chores", IC.chore, "Chores", plural((d.chores || []).filter(c => c["Active"] !== false).length, "chore")]);
    if (av("expenses")) out.push(["#/hockey/list/lists/Expense Category", IC.receipt, "Expense categories", plural(listCount("Expense Category"), "category", "categories")]);
    if (av("schedule")) out.push(["#/hockey/list/lists/Event Type", ICONS.clock, "Event types", plural(listCount("Event Type"), "type")]);
    if (av("schedule")) out.push(["#/hockey/venues", IC.pin, "Venues", plural((d.venues || []).filter(v => v["Active"] !== false).length, "venue")]);
    if (d.consequences && av("totals")) out.push(["#/hockey/list/consequences", IC.warn, "Consequences", plural((d.consequences || []).filter(c => c["Active"] !== false).length, "level")]);
    if (av("seasons")) out.push(["#/hockey/list/seasons", IC.calendar, "Seasons", season() ? "Viewing " + seasonLabel(season()) : ""]);
    if (av("seasons")) out.push(["#/hockey/list/lists/Sport", ICONS.grid, "Sports", (d.lists || []).filter(l => l["List"] === "Sport" && l["Active"] !== false).map(l => l["Value"]).join(", ")]);
    if (admin) out.push(["#/hockey/list/settings", IC.gear, "Defaults", ""]);
    if (admin) out.push(["#/hockey/deleted", IC.trash, "Deleted items", "Restore or delete permanently"]);
    return out;
  }

  function viewSettings() {
    const links = settingsLinks();
    if (!links.length) return noAccess("Lists & settings");
    const link = x => '<a class="list-item" href="' + x[0] + '"><span class="thumb">' + x[1] + '</span><div class="body"><div class="title">' + esc(x[2]) + '</div>' +
      (x[3] ? '<div class="sub">' + esc(x[3]) + '</div>' : "") + '</div><span class="thumb">' + ICONS.next + '</span></a>';
    const html = '<div class="card list">' + links.map(link).join("") + '</div>' +
      '<p class="hint">Everything here is also on the Travel Hockey spreadsheet. Changing a chore’s price asks whether this season’s logged entries should change too.</p>';
    return { title: "Lists & settings", back: true, html: html };
  }

  // Earnings and expenses between two days, in a pop-up.
  function entriesBtn(from, to, title) {
    if (!D().earnings && !D().expenses) return "";
    return '<button class="link-btn" data-hk="entries" data-from="' + from + '" data-to="' + to + '" data-title="' + esc(title) + '">Entries</button>';
  }
  function showEntries(from, to, title) {
    const d = D(), inRange = r => { const x = String(r["Date"]).slice(0, 10); return x >= from && x <= to; };
    const byDate = (a, b) => String(a["Date"]).localeCompare(String(b["Date"]));
    const row = (left, sub, amt, tag) => '<div class="list-item"><div class="body"><div class="title">' + esc(left) + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div><span class="hk-amt">' + money(amt) + (tag ? '<small>' + esc(tag) + '</small>' : "") + '</span></div>';
    let body = "";
    if (d.earnings) {
      const e = d.earnings.filter(inRange).sort(byDate);
      body += '<div class="section-head hk-ent-head"><b>Earnings</b><span>' + money(e.reduce((t, x) => t + (Number(x["Amount"]) || 0), 0)) + '</span></div>' +
        '<div class="card list">' + (e.map(x => row(x["Chore Name"], fmtDay(x["Date"]) + (x["Notes"] ? " · " + x["Notes"] : ""), x["Amount"])).join("") || '<div class="empty">No chores logged.</div>') + '</div>';
    }
    if (d.expenses) {
      const x = d.expenses.filter(inRange).sort(byDate);
      const billable = x.filter(r => !r["Non-Billable"]).reduce((t, r) => t + (Number(r["Amount"]) || 0), 0);
      body += '<div class="section-head hk-ent-head"><b>Expenses</b><span>' + money(billable) + ' billable</span></div>' +
        '<div class="card list">' + (x.map(r => row(r["Item"] || r["Category"], fmtDay(r["Date"]) + " · " + r["Category"], r["Amount"], r["Non-Billable"] ? "Non-billable" : "")).join("") || '<div class="empty">No expenses.</div>') + '</div>';
    }
    C.openSheet({ title: title, body: body, noSubmit: true, cancelLabel: "Close" });
  }

  function viewList(table, listName) {
    const titles = { chores: "Chores and prices", consequences: "Consequences", seasons: "Seasons", settings: "Defaults", venues: "Venues" };
    const sch = D().schema[table];
    if (!sch) return noAccess("that list");
    const area = listName ? ((sch.listAreas || {})[listName] || sch.area) : sch.area;
    const nice = listName === "Expense Category" ? "Expense categories" : listName === "Event Type" ? "Event types" : listName === "Sport" ? "Sports" : listName;
    if (!settingsOk() || (sch.adminOnly && table === "settings" && !C.isAdmin()) || !M.can(ctx, area, "view")) return noAccess(nice || titles[table] || "that list");
    const opts = { table: table, list: listName, title: listName ? (listName === "Expense Category" ? "Expense categories" : listName === "Event Type" ? "Event types" : listName === "Sport" ? "Sports" : listName) : titles[table] || table };
    if (table === "chores") { opts.label = r => r["Chore"]; opts.sub = r => money(r["Amount"]); }
    if (table === "consequences") { opts.sort = (a, b) => a["Level"] - b["Level"]; opts.sub = r => "Applies from level " + r["Level"]; opts.label = r => r["Consequence"]; }
    if (table === "seasons") { opts.sort = (a, b) => String(b["Start Date"]).localeCompare(String(a["Start Date"])); opts.sub = r => fmtDay(r["Start Date"], { weekday: undefined, year: "numeric" }) + " – " + fmtDay(r["End Date"], { weekday: undefined, year: "numeric" }) + " · " + r["Share %"] + "% · " + (r["Tracking"] || "Weekly") + (r["Consequences Off"] === true ? " · consequences off" : ""); opts.label = r => seasonLabel(r); }
    if (table === "settings") {
      opts.label = r => r["Setting"];
      opts.sub = r => r["Setting"] === "Player" ? M.userLabel(ctx, r["Value"]) : r["Value"];
    }
    return M.listView(ctx, opts);
  }

  function noAccess(what) { return { title: what, back: true, html: '<div class="card"><div class="empty">You don’t have access to ' + esc(what.toLowerCase()) + '.</div></div>' }; }

  // ------------------------------------------------------------------
  // Router
  // ------------------------------------------------------------------
  function view(args) {
    M.current = ctx;
    if (hk.error) return { title: "Travel Hockey", back: true, html: '<div class="card"><div class="empty">' + esc(hk.error) + '</div></div><div class="actions"><button class="btn" data-hk="retry">Try again</button></div>' };
    if (!hk.data) {
      if (!hk.loading) load();
      return { title: "Travel Hockey", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "earnings": return viewEarnings();
      case "plan": return viewPlan(args[1]);
      case "weeks": return viewWeeks();
      case "expenses": return viewExpenses();
      case "schedule": return viewSchedule();
      case "event": return viewEvent(args[1]);
      case "venues": return viewVenues();
      case "venue": return viewVenue(args[1]);
      case "settings": return viewSettings();
      case "list": return viewList(args[1], args[2]);
      case "deleted": return C.isAdmin() ? M.deletedView(ctx) : viewSettings();
      default: return viewHome();
    }
  }
  // Access changed (or a save was refused): drop what's loaded so buttons match the new access.
  C.registerModule("hockey", view, () => { hk.data = null; hk.loading = false; M.clearDeleted("hockey"); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  document.addEventListener("click", e => {
    if (e.target.closest("[data-act='refresh']") && hk.data) { hk.data = null; M.clearDeleted("hockey"); }
    const el = e.target.closest("[data-hk]");
    if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT")) return;
    const d = el.dataset;
    switch (d.hk) {
      case "log": M.recordForm(ctx, "earnings", "", { title: "Log a chore" }); break;
      case "add-expense": M.recordForm(ctx, "expenses", "", { title: "Add expense" }); break;
      case "add-event": M.recordForm(ctx, "events", "", { title: "Add to schedule" }); break;
      case "plan-add": M.recordForm(ctx, "plan", "", { title: "Plan a chore · " + fmtDay(d.date), prefill: { "Date": d.date }, hide: ["Date"] }); break;
      case "plan-item": planItem(d.id); break;
      case "plan-del": planDelete(d.id); break;
      case "exclude": toggleExclude(d.week, d.on === "1"); break;
      case "show-future": hk.showFuture = true; C.render(); break;
      case "entries": showEntries(d.from, d.to, d.title); break;
      case "sched": hk.schedPast = d.past === "1"; C.render(); break;
      case "retry": hk.error = ""; C.render(); break;
      case "reload": hk.data = null; hk.seasonId = ""; load(); C.render(); break;
    }
  });
  document.addEventListener("change", e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.hk) return;
    if (el.dataset.hk === "season") { hk.seasonId = el.value; hk.data = null; load(el.value); C.render(); }
    if (el.dataset.hk === "earn-mine") { hk.earnMine = el.checked; C.render(); }
    if (el.dataset.hk === "exp-cat") { hk.expCat = el.value; C.render(); }
  });
})();
