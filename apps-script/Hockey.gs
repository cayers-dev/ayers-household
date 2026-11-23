// ============================================================
// AYERS HOUSEHOLD - TRAVEL HOCKEY MODULE
//
// Data lives in the "Ayers Household - Travel Hockey" spreadsheet.
// Areas (set per person on Permissions):
//   earnings  logging chores and the monthly chore plan
//   totals    weekly required vs earned, exclude weeks, consequences
//   expenses  season expenses
//   schedule  practices, games, tournaments and venues
//   seasons   seasons, dropdown lists and module settings
//
// Weekly required (matches the original sheet):
//   share of billable expenses received so far (Season ▸ Share %), minus what
//   earlier weeks already required, spread over the weeks left in the season
//   (this week included). Met = total earned so far ≥ total required so far.
//   A week that isn't met (and isn't excluded) raises the consequence level by 1
//   and makes the next week a consequence week. Level n = consequences 1..n.
//   While behind, the week's target gets Season ▸ Past Due Extra on top.
// ============================================================

function hockeyDef_() {
   return {
      key: "hockey",
      name: "Travel Hockey",
      areas: ["earnings", "totals", "expenses", "schedule", "seasons"],
      tables: {
         seasons: { tab: "Seasons", label: "Seasons", id: "Season ID", prefix: "SEA-", kind: "list", area: "seasons", adminOnly: true,
            unique: ["Season"], title: r => r["Season"],
            fields: [
               { name: "Season", type: "text", required: true, hint: "e.g. 2026-27" },
               { name: "Start Date", type: "date", required: true },
               { name: "End Date", type: "date", required: true },
               { name: "Share %", type: "percent", required: true, default: 20, hint: "Part of billable expenses the player earns back" },
               { name: "Past Due Extra", type: "money", required: true, default: 15, hint: "Added to the week's target while behind" },
               { name: "Notes", type: "longtext" }
            ] },
         earnings: { tab: "Earnings", label: "Earnings", id: "Earning ID", prefix: "ERN-", kind: "record", area: "earnings",
            title: r => r["Chore Name"],
            fields: [
               { name: "Date", type: "date", required: true },
               { name: "Chore ID", label: "Chore", type: "ref", ref: "chores", required: true },
               { name: "Chore Name", type: "text", readOnly: true },
               { name: "Amount", type: "money", readOnly: true, hint: "From the chore list" },
               { name: "Season ID", label: "Season", type: "ref", ref: "seasons" },
               { name: "Notes", type: "longtext" }
            ] },
         plan: { tab: "Chore Plan", label: "Chore Plan", id: "Plan ID", prefix: "PLN-", kind: "record", area: "earnings",
            title: r => r["Chore Name"] || r["Chore ID"],
            fields: [
               { name: "Date", type: "date", required: true },
               { name: "Chore ID", label: "Chore", type: "ref", ref: "chores", required: true },
               { name: "Chore Name", type: "text", readOnly: true },
               { name: "Season ID", label: "Season", type: "ref", ref: "seasons" },
               { name: "Status", type: "text", readOnly: true },
               { name: "Earning ID", type: "text", readOnly: true },
               { name: "Notes", type: "longtext" }
            ] },
         expenses: { tab: "Expenses", label: "Expenses", id: "Expense ID", prefix: "EXP-", kind: "record", area: "expenses",
            title: r => r["Item"] || r["Category"],
            fields: [
               { name: "Date", type: "date", required: true },
               { name: "Category", type: "list", list: "Expense Category", required: true },
               { name: "Item", type: "text" },
               { name: "Location ID", label: "Location", type: "ref", ref: "venues" },
               { name: "Amount", type: "money", required: true },
               { name: "Non-Billable", type: "bool", hint: "Not part of what the player earns back" },
               { name: "Sport", type: "list", list: "Sport" },
               { name: "Season ID", label: "Season", type: "ref", ref: "seasons", required: true },
               { name: "Notes", type: "longtext" }
            ] },
         events: { tab: "Schedule", label: "Schedule", id: "Event ID", prefix: "EVT-", kind: "record", area: "schedule",
            title: r => [r["Type"], r["Title"]].filter(Boolean).join(": "),
            fields: [
               { name: "Type", type: "list", list: "Event Type", required: true },
               { name: "Title", type: "text", hint: "e.g. vs. Jr. Ducks, Thanksgiving Classic" },
               { name: "Start", type: "datetime", required: true },
               { name: "End", type: "datetime" },
               { name: "Venue ID", label: "Venue", type: "ref", ref: "venues" },
               { name: "Opponent", type: "text" },
               { name: "Sport", type: "list", list: "Sport" },
               { name: "Season ID", label: "Season", type: "ref", ref: "seasons" },
               { name: "Notes", type: "longtext" }
            ] },
         chores: { tab: "Chores", label: "Chores", id: "Chore ID", prefix: "CHR-", kind: "list", area: "earnings",
            unique: ["Chore"], title: r => r["Chore"],
            fields: [
               { name: "Chore", type: "text", required: true },
               { name: "Amount", type: "money", required: true },
               { name: "Notes", type: "longtext" }
            ] },
         venues: { tab: "Venues", label: "Venues", id: "Venue ID", prefix: "VEN-", kind: "list", area: "schedule",
            unique: ["Name"], title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true },
               { name: "Address", type: "text" },
               { name: "Rink Notes", type: "longtext", hint: "Which rink / sheet, locker rooms, pro shop..." },
               { name: "Parking", type: "longtext" },
               { name: "Contact", type: "text" },
               { name: "Phone", type: "text" },
               { name: "Website", type: "url" },
               { name: "Notes", type: "longtext" }
            ] },
         consequences: { tab: "Consequences", label: "Consequences", id: "Consequence ID", prefix: "CON-", kind: "list", area: "totals",
            unique: ["Level"], title: r => "Level " + r["Level"] + ": " + r["Consequence"],
            fields: [
               { name: "Level", type: "number", required: true, hint: "Applies from this consequence level up" },
               { name: "Consequence", type: "text", required: true },
               { name: "Notes", type: "longtext" }
            ] },
         weekflags: { tab: "Week Flags", label: "Week Flags", id: "Week Flag ID", prefix: "WKF-", kind: "record", area: "totals",
            title: r => "Week of " + r["Week Start"],
            fields: [
               { name: "Season ID", label: "Season", type: "ref", ref: "seasons", required: true },
               { name: "Week Start", type: "date", required: true },
               { name: "Exclude", type: "bool", hint: "Doesn't count toward consequences; the amount still counts" },
               { name: "Note", type: "text" }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "seasons",
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            listAreas: { "Expense Category": "expenses", "Event Type": "schedule", "Sport": "seasons" },
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] },
         settings: { tab: "Settings", label: "Settings", id: "Setting ID", prefix: "SET-", kind: "list", area: "seasons", adminOnly: true,
            unique: ["Setting"], title: r => r["Setting"],
            fields: [
               { name: "Setting", type: "text", required: true },
               { name: "Value", type: "text" },
               { name: "Notes", type: "text" }
            ] }
      },
      lists: ["Expense Category", "Event Type", "Sport"],
      beforeSave: hockeyBeforeSave_,
      afterSave: hockeyAfterSave_,
      afterDelete: hockeyAfterDelete_,
      home: hockeyHome_,
      actions: {
         load:       { fn: hockeyLoad_ },
         planDone:   { fn: hockeyPlanDone_, write: true },
         setExclude: { fn: hockeySetExclude_, write: true }
      }
   };
}

// ------------------------------------------------------------
// Seasons
// ------------------------------------------------------------

function hockeyToday_() {
   return Utilities.formatDate(new Date(), coreSs_().getSpreadsheetTimeZone(), "yyyy-MM-dd");
}

// The season to use when none is picked: the open one covering today, else the latest open one.
function hockeyCurrentSeason_(def) {
   const today = hockeyToday_();
   const open = modRows_(def, "seasons").filter(s => s["Active"] !== false)
      .sort((a, b) => String(b["Start Date"]).localeCompare(String(a["Start Date"])));
   return open.find(s => s["Start Date"] <= today && today <= s["End Date"]) || open[0] ||
          modRows_(def, "seasons").sort((a, b) => String(b["Start Date"]).localeCompare(String(a["Start Date"])))[0] || null;
}

// The season a date falls in (open seasons first), else the current season.
function hockeySeasonForDate_(def, dateStr) {
   const all = modRows_(def, "seasons");
   const inRange = s => s["Start Date"] <= dateStr && dateStr <= s["End Date"];
   const hit = all.filter(s => s["Active"] !== false).find(inRange) || all.find(inRange);
   return hit || hockeyCurrentSeason_(def);
}

const hockeyIso_ = d => d instanceof Date ? Utilities.formatDate(d, coreSs_().getSpreadsheetTimeZone(), "yyyy-MM-dd") : String(d || "").slice(0, 10);

function hockeySetting_(def, name, fallback) {
   const r = modRows_(def, "settings").find(x => x["Setting"] === name);
   return r && String(r["Value"]).trim() !== "" ? String(r["Value"]).trim() : fallback;
}


// ------------------------------------------------------------
// Save hooks
// ------------------------------------------------------------

function hockeyBeforeSave_(tableKey, values, before, user, req) {
   const def = hockeyDef_();
   const merged = Object.assign({}, before || {}, values);
   // Chore entries carry the chore's name and price at the time (a static log).
   if ((tableKey === "earnings" || tableKey === "plan") && values["Chore ID"] !== undefined && (!before || values["Chore ID"] !== before["Chore ID"])) {
      const chore = modFind_(def, "chores", values["Chore ID"]);
      values["Chore Name"] = chore["Chore"];
      if (tableKey === "earnings") values["Amount"] = chore["Amount"];
   }
   if (tableKey === "plan" && !before) values["Status"] = "Planned";
   // Season: picked, else the one the date falls in.
   if (["earnings", "plan", "events", "expenses"].indexOf(tableKey) !== -1 && !merged["Season ID"]) {
      const d = tableKey === "events" ? hockeyIso_(merged["Start"]) : hockeyIso_(merged["Date"]);
      const s = d ? hockeySeasonForDate_(def, d) : hockeyCurrentSeason_(def);
      if (s) values["Season ID"] = s["Season ID"];
   }
   if (tableKey === "events" && merged["End"] && merged["Start"] && hockeyStamp_(merged["End"]) < hockeyStamp_(merged["Start"])) {
      throw coreError_("INVALID", "The end time is before the start time.");
   }
   if (tableKey === "seasons" && merged["Start Date"] && merged["End Date"] && hockeyIso_(merged["End Date"]) < hockeyIso_(merged["Start Date"])) {
      throw coreError_("INVALID", "The season ends before it starts.");
   }
   // A new price for a chore: ask whether this season's entries should change too.
   if (tableKey === "chores" && before && values["Amount"] !== undefined && Number(values["Amount"]) !== Number(before["Amount"])) {
      const season = req.seasonId ? modRows_(def, "seasons").find(s => s["Season ID"] === req.seasonId) : hockeyCurrentSeason_(def);
      const affected = season ? modRows_(def, "earnings").filter(e => e["Chore ID"] === before["Chore ID"] &&
         e["Season ID"] === season["Season ID"] && Number(e["Amount"]) !== Number(values["Amount"])) : [];
      if (affected.length && req.applyToSeason === undefined) {
         throw coreError_("CONFIRM", "Update " + affected.length + " " + (affected.length === 1 ? "entry" : "entries") + " already logged this season?", {
            confirm: { kind: "chorePrice", count: affected.length, from: before["Amount"], to: values["Amount"],
                       season: season["Season"], seasonId: season["Season ID"], chore: before["Chore"] }
         });
      }
      req._priceTargets = req.applyToSeason ? affected : [];
   }
   return values;
}
const hockeyStamp_ = v => v instanceof Date ? v.getTime() : new Date(String(v).replace(" ", "T")).getTime();

function hockeyAfterSave_(tableKey, id, values, before, user, req) {
   const def = hockeyDef_();
   if (tableKey === "chores" && req._priceTargets && req._priceTargets.length) {
      req._priceTargets.forEach(e => modChange_(def, "earnings", e, { "Amount": values["Amount"] }, user, "Price update"));
   }
}

// An earning made from the chore plan goes away -> the plan item is back to Planned.
function hockeyAfterDelete_(tableKey, row, user) {
   if (tableKey !== "earnings") return;
   const def = hockeyDef_();
   modRows_(def, "plan").filter(p => p["Earning ID"] === row["Earning ID"])
      .forEach(p => modChange_(def, "plan", p, { "Status": "Planned", "Earning ID": "" }, user, "Back to planned"));
}


// ------------------------------------------------------------
// Weekly totals
// ------------------------------------------------------------

// Weeks of a season with required / earned / met / consequences, as in the original sheet.
// Weeks that have ended are final; the current week shows progress so far.
function hockeyWeeks_(season, expenses, earnings, flags, today) {
   if (!season || !season["Start Date"] || !season["End Date"]) return [];
   const parse = s => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); };
   const iso = d => d.toISOString().slice(0, 10);
   const start = parse(season["Start Date"]), end = parse(season["End Date"]);
   const nWeeks = Math.ceil((Math.round((end - start) / 86400000) + 1) / 7);
   const pct = (Number(season["Share %"]) || 0) / 100;
   const extra = Number(season["Past Due Extra"]) || 0;
   const sid = season["Season ID"];
   const exp = expenses.filter(e => e["Season ID"] === sid && !e["Non-Billable"] && e["Date"])
      .map(e => ({ d: String(e["Date"]).slice(0, 10), a: Number(e["Amount"]) || 0 }));
   const earn = earnings.filter(e => e["Season ID"] === sid && e["Date"])
      .map(e => ({ d: String(e["Date"]).slice(0, 10), a: Number(e["Amount"]) || 0 }));
   const flagOf = {};
   flags.filter(f => f["Season ID"] === sid).forEach(f => flagOf[String(f["Week Start"]).slice(0, 10)] = f);

   const weeks = [];
   let cumReq = 0, cumEarn = 0, prevDiff = null, prevMissed = false, level = 0;
   for (let i = 0; i < nWeeks; i++) {
      const ws = new Date(start.getTime() + i * 7 * 86400000), we = new Date(ws.getTime() + 6 * 86400000);
      const wsI = iso(ws), weI = iso(we);
      const totalExp = exp.filter(x => x.d <= weI).reduce((s, x) => s + x.a, 0);
      const weeklyRequired = (totalExp * pct - cumReq) / (nWeeks - i);
      cumReq += weeklyRequired;
      const weeklyEarned = earn.filter(x => x.d >= wsI && x.d <= weI).reduce((s, x) => s + x.a, 0);
      cumEarn += weeklyEarned;
      const diff = cumEarn - cumReq;
      const flag = flagOf[wsI];
      const exclude = !!(flag && flag["Exclude"]);
      const state = weI < today ? "done" : (wsI <= today ? "current" : "future");
      const pastDue = prevDiff !== null && prevDiff < -0.005;
      let met = "";
      if (state !== "future") met = exclude ? "Exc" : (diff >= -0.005 ? "Y" : "N");
      const consequenceWeek = prevMissed;
      if (state === "done" && met === "N") level++;
      weeks.push({
         n: i + 1, start: wsI, end: weI, state: state, totalExp: hockeyR_(totalExp),
         weeklyRequired: hockeyR_(weeklyRequired), required: hockeyR_(cumReq),
         weeklyEarned: hockeyR_(weeklyEarned), earned: hockeyR_(cumEarn), diff: hockeyR_(diff),
         met: met, consequenceWeek: consequenceWeek, exclude: exclude, note: flag ? flag["Note"] || "" : "",
         pastDue: pastDue, remaining: hockeyR_(weeklyRequired - weeklyEarned + (pastDue ? extra : 0)),
         target: hockeyR_(weeklyRequired + (pastDue ? extra : 0)), level: level
      });
      prevDiff = diff;
      prevMissed = state === "done" && met === "N";
   }
   return weeks;
}
const hockeyR_ = n => Math.round(n * 100) / 100;

// Summary of a season's weeks: this week, consequence level and the consequences that apply.
function hockeyStatus_(weeks, consequences) {
   const current = weeks.find(w => w.state === "current") || null;
   const done = weeks.filter(w => w.state === "done");
   const level = done.length ? done[done.length - 1].level : 0;
   const list = consequences.filter(c => c["Active"] !== false).sort((a, b) => Number(a["Level"]) - Number(b["Level"]));
   return {
      current: current, level: level,
      consequences: list.filter(c => Number(c["Level"]) <= level).map(c => ({ level: Number(c["Level"]), text: c["Consequence"] })),
      behind: done.length ? done[done.length - 1].diff < -0.005 : false
   };
}


// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------

// req: { seasonId? } -> everything the Travel Hockey screens need, limited to what the person may see.
function hockeyLoad_(req, user) {
   const def = hockeyDef_();
   const can = a => coreCan_(user, "hockey", a, "view");
   if (!def.areas.some(can)) throw coreError_("FORBIDDEN", "You don't have access to Travel Hockey.");
   const seasons = modRows_(def, "seasons").sort((a, b) => String(b["Start Date"]).localeCompare(String(a["Start Date"])));
   const season = (req.seasonId && seasons.find(s => s["Season ID"] === req.seasonId)) || hockeyCurrentSeason_(def);
   const sid = season ? season["Season ID"] : "";
   const inSeason = r => r["Season ID"] === sid;
   const today = hockeyToday_();
   const expensesAll = modRows_(def, "expenses"), earningsAll = modRows_(def, "earnings");
   const weeks = hockeyWeeks_(season, expensesAll, earningsAll, modRows_(def, "weekflags"), today);
   const out = {
      today: today, seasons: seasons, seasonId: sid,
      schema: modSchema_(def), caps: modCaps_(def, user),
      chores: modRows_(def, "chores"), venues: modRows_(def, "venues"),
      lists: modRows_(def, "lists"),
      settings: { defaultSport: hockeySetting_(def, "Default Sport", ""), playerId: hockeySetting_(def, "Player", "") },
      users: coreGetUsers_().map(u => ({ id: u.id, name: u.name }))
   };
   if (can("earnings")) {
      out.earnings = earningsAll.filter(inSeason);
      out.plan = modRows_(def, "plan").filter(inSeason);
   }
   if (can("totals")) {
      out.weeks = weeks;
      out.status = hockeyStatus_(weeks, modRows_(def, "consequences"));
      out.consequences = modRows_(def, "consequences");
   } else if (can("earnings")) {
      // Planning needs the month's required amount even without the weekly totals screen.
      out.weeks = weeks.map(w => ({ start: w.start, end: w.end, weeklyRequired: w.weeklyRequired, state: w.state }));
   }
   if (can("expenses")) out.expenses = expensesAll.filter(inSeason);
   if (can("schedule")) out.events = modRows_(def, "events").filter(inSeason);
   if (user.admin) out.settingsRows = modRows_(def, "settings");
   return out;
}

// req: { id, date? } -> logs a planned chore as earned (on its planned day unless a date is given).
function hockeyPlanDone_(req, user) {
   const def = hockeyDef_();
   const plan = modFind_(def, "plan", req.id);
   if (plan["Status"] === "Done" && plan["Earning ID"]) throw coreError_("INVALID", "That chore is already logged (" + plan["Earning ID"] + ").");
   if (!coreCan_(user, "hockey", "earnings", "add")) throw coreError_("FORBIDDEN", "You don't have access to log chores.");
   const date = req.date ? hockeyIso_(modParseDate_(req.date)) : plan["Date"];
   const res = modAdd_({ module: "hockey", table: "earnings", values: { "Date": date, "Chore ID": plan["Chore ID"], "Season ID": plan["Season ID"], "Notes": plan["Notes"] } }, user);
   modChange_(def, "plan", modFind_(def, "plan", req.id), { "Status": "Done", "Earning ID": res.id }, user, "Mark done");
   return { earningId: res.id };
}

// req: { seasonId, weekStart, exclude, note } -> marks a week excluded from consequences (editors).
function hockeySetExclude_(req, user) {
   const def = hockeyDef_();
   if (!coreCan_(user, "hockey", "totals", "edit")) throw coreError_("FORBIDDEN", "Only editors and admins can exclude weeks.");
   const season = modFind_(def, "seasons", req.seasonId);
   const ws = hockeyIso_(modParseDate_(req.weekStart));
   if (!hockeyWeeks_(season, [], [], [], hockeyToday_()).some(w => w.start === ws)) throw coreError_("INVALID", "That isn't a week of this season.");
   const existing = modRows_(def, "weekflags").find(f => f["Season ID"] === season["Season ID"] && String(f["Week Start"]).slice(0, 10) === ws);
   const values = { "Exclude": !!req.exclude, "Note": String(req.note || "").trim() };
   if (existing) modChange_(def, "weekflags", existing, values, user);
   else modInsert_(def, "weekflags", Object.assign({ "Season ID": season["Season ID"], "Week Start": modParseDate_(ws) }, values), user);
   return { exclude: !!req.exclude };
}

// Home: this week's target and upcoming schedule, for Due Soon and the Home tile.
function hockeyHome_(user, days) {
   const def = hockeyDef_();
   const out = { dueSoon: [] };
   const season = hockeyCurrentSeason_(def);
   if (!season) return out;
   const today = hockeyToday_();
   const tz = coreSs_().getSpreadsheetTimeZone();
   if (coreCan_(user, "hockey", "totals", "view")) {
      const weeks = hockeyWeeks_(season, modRows_(def, "expenses"), modRows_(def, "earnings"), modRows_(def, "weekflags"), today);
      const w = weeks.find(x => x.state === "current");
      if (w) {
         const left = Math.max(0, w.remaining);
         out.summary = left > 0 ? "This week: $" + left.toFixed(2) + " to go" : "This week: on track";
         if (left > 0) out.dueSoon.push({ title: "Earn $" + left.toFixed(2) + " in chores" + (w.pastDue ? " (includes past-due extra)" : ""),
            when: "by " + hockeyNiceDate_(w.end), sortKey: w.end + "T23:59", href: "#/hockey/weeks" });
      }
   }
   if (coreCan_(user, "hockey", "schedule", "view")) {
      const until = Utilities.formatDate(new Date(Date.now() + days * 86400000), tz, "yyyy-MM-dd'T'HH:mm");
      const now = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm");
      const venues = modRows_(def, "venues");
      modRows_(def, "events").filter(e => e["Start"] >= now.slice(0, 10) && e["Start"] <= until)
         .sort((a, b) => String(a["Start"]).localeCompare(String(b["Start"]))).slice(0, 10)
         .forEach(e => {
            const v = venues.find(x => x["Venue ID"] === e["Venue ID"]);
            out.dueSoon.push({ title: [e["Type"], e["Title"]].filter(Boolean).join(": ") + (v ? " at " + v["Name"] : ""),
               when: hockeyNiceDate_(e["Start"]) + hockeyNiceTime_(e["Start"]), sortKey: e["Start"], href: "#/hockey/event/" + encodeURIComponent(e["Event ID"]) });
         });
   }
   return out;
}
function hockeyNiceDate_(s) {
   const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
   const d = new Date(+m[1], +m[2] - 1, +m[3]);
   return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + (d.getMonth() + 1) + "/" + d.getDate();
}
function hockeyNiceTime_(s) {
   const m = String(s).match(/T(\d{2}):(\d{2})/);
   if (!m || (m[1] === "00" && m[2] === "00")) return "";
   const h = +m[1];
   return ", " + ((h % 12) || 12) + ":" + m[2] + (h < 12 ? " AM" : " PM");
}


// ------------------------------------------------------------
// Setup: run hockeySetup() once from the script editor.
// Builds the tabs and fills in the dropdown lists and the 2026-27 season
// from the original "2026-27 Travel Hockey" sheet. No earnings or expenses
// are copied.
// ------------------------------------------------------------

const HOCKEY_SPREADSHEET_ID = "1jOUtyuzg_ekISVzUgBeIk81N19vdhA5h8FO4n7W4FRg";

function hockeySetup() {
   const core = coreSheet_(CORE_CONFIG.tabs.modules);
   const mods = coreTable_(CORE_CONFIG.tabs.modules);
   const row = mods.rows.find(r => r["Module Key"] === "hockey");
   const hm = coreHeaderMap_(core).map;
   if (!String(row["Spreadsheet ID"] || "").trim()) core.getRange(row._row, hm["spreadsheet id"]).setValue(HOCKEY_SPREADSHEET_ID);
   CORE_GRID = {};
   const def = hockeyDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.admin) || { id: "USR-1" };

   modSeed_(def, "seasons", [{ "Season": "2026-27", "Start Date": new Date(2026, 3, 27), "End Date": new Date(2027, 1, 28),
      "Share %": 20, "Past Due Extra": 15, "Notes": "From the original 2026-27 Travel Hockey sheet" }], owner);
   modSeed_(def, "chores", HOCKEY_SEED.chores.map(c => ({ "Chore": c[0], "Amount": c[1] })), owner);
   modSeed_(def, "venues", HOCKEY_SEED.venues.map(v => ({ "Name": v })), owner);
   modSeed_(def, "consequences", HOCKEY_SEED.consequences.map(c => ({ "Level": c[0], "Consequence": c[1] })), owner);
   const lists = [];
   HOCKEY_SEED.categories.forEach((v, i) => lists.push({ "List": "Expense Category", "Value": v, "Sort": 0 }));
   HOCKEY_SEED.eventTypes.forEach((v, i) => lists.push({ "List": "Event Type", "Value": v, "Sort": 0 }));
   lists.push({ "List": "Sport", "Value": "Hockey", "Sort": 0 });
   modSeed_(def, "lists", lists, owner);
   modSeed_(def, "settings", [
      { "Setting": "Default Sport", "Value": "Hockey", "Notes": "Filled in on new expenses and events" },
      { "Setting": "Player", "Value": "USR-3", "Notes": "User ID of the player (USR-3 Jasper Ayers)" }
   ], owner);

   // Module is ready: show it as Active.
   CORE_GRID = {};
   const r2 = coreTable_(CORE_CONFIG.tabs.modules).rows.find(r => r["Module Key"] === "hockey");
   core.getRange(r2._row, hm["status"]).setValue("Active");
   console.log("Travel Hockey setup done.");
}

const HOCKEY_SEED = {
   chores: [["1 Helper", 1], ["5 Helper", 5], ["10 Helper", 10], ["15 Helper", 15], ["20 Helper", 20], ["25 Helper", 25],
      ["Bath (Apollo)", 10], ["Bath (Dot)", 10], ["Bathroom Mirror (Back) Clean", 4], ["Bathroom Mirror (Front) Clean", 4],
      ["Bathroom Sink (Back) Clean", 4], ["Bathroom Sink (Front) Clean", 4], ["Brush (Apollo)", 8], ["Brush (Dot)", 8],
      ["Clean all light switches", 2], ["Clean Kitchen Cabinets", 7], ["Dishes (Family Meal)", 3],
      ["Door & Jambs (1 Door Both Sides) Clean", 6], ["Door & Jambs (2 Doors Both Sides) Clean", 12], ["Door & Jambs (3 Doors Both Sides) Clean", 18],
      ["Door & Jambs (4 Doors Both Sides) Clean", 24], ["Door & Jambs (5 Doors Both Sides) Clean", 30], ["Fold Towels", 3],
      ["Kennel (Apollo) Clean", 3], ["Kennel (Dot) Clean", 3], ["Microwave - Inside and Outside", 5], ["Mow - Backyard", 15], ["Mow - Front Yard", 10],
      ["Swiffer Common Spaces", 8], ["Vacuum Couch", 6], ["Vacuum Living Room Rug", 5],
      ["Window Wash (Bathroom Back) Inside & Outside", 4], ["Window Wash (Bathroom Front) Inside & Outside", 4], ["Window Wash (Connor) Inside & Outside", 4],
      ["Window Wash (Jasper) Inside & Outside", 4], ["Window Wash (Kitchen) Inside & Outside", 4], ["Window Wash (Living Room) Inside & Outside", 4],
      ["Window Wash (Mom & Dad) Inside & Outside", 4], ["Wipe Fridge (Outside)", 3], ["Wipe Kitchen Counters", 4]],
   categories: ["Clinics", "Clothing", "Club Fees", "Equipment", "Practice - Stick Time", "Practice - Team Ice", "Tournament - Hotel",
      "Tournament - Other", "Tournament - Registration", "Tryouts", "Uniform", "USA Hockey Registration"],
   eventTypes: ["Camp", "Clinic", "Game", "Practice", "Team Event", "Tournament", "Tryout", "Other"],
   venues: ["Carlsbad", "Great Parks - Irvine", "Kroc", "Poway", "Pure Hockey - San Marcos", "SDIA", "UTC"],
   consequences: [[1, "10 Push ups (Daily)"], [2, "2 Street Runs (Daily)"], [3, "Additional Chore - No Credit ($10 Value)"],
      [4, "1 Minute wall sit (Daily)"], [5, "All dishes for week - No Week"], [6, "30 Jumping Jacks (Daily)"],
      [7, "Loss of Phone for 1 Day"], [8, "Loss of Gulls Games (2 events/ games) **next planned attending"]]
};
