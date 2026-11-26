// =========================================================
// AYERS HOUSEHOLD - TASKS MODULE
// =========================================================
// Data lives in the "Ayers Household - Tasks" spreadsheet (Tasks folder).
//
// One list per person (Assigned To). Admins and editors see everyone's tasks, assign tasks to
// anyone and make household tasks (no one assigned: anyone with access can do them).
// Data Entry make tasks for themselves only; everyone sees their own tasks, household tasks and
// tasks they assigned to someone else (and can edit those).
//
// Status comes from the Status dropdown (editors can add values). "Done" completes a task:
// it drops off the list (kept; "Show completed" shows it). A repeating task makes its next one when
// it's completed, dated from its due date. Checklist = tick-off steps stored one per line,
// "[x] " in front of the done ones.
//
// Other modules add tasks through tasksUpsertAuto_ (a Source Key ties the task to where it came from;
// e.g. a Vehicles follow-up becomes a task for the vehicle's primary driver; a Financial bill with
// "Reminder task" ticked gets a task per payment, and ticking it done marks the payment paid).
// Google Tasks sync comes next ("Send to Google" is kept ready for it).
// Run tasksSetup() once from the script editor.
// =========================================================

const TASKS_SPREADSHEET_ID = "1oUoc1-KgQGVJBSSsgd0s8PL6Q9niKP5sHgqH7ZD7wZA";
const TASKS_DONE = "Done";

function tasksDef_() {
   return {
      key: "tasks",
      name: "Tasks",
      areas: ["tasks"],
      tables: {
         tasks: { tab: "Tasks", label: "Tasks", id: "Task ID", prefix: "TSK-", kind: "record", area: "tasks",
            title: r => r["Title"],
            fields: [
               { name: "Title", type: "text", required: true },
               { name: "Assigned To", type: "user", hint: "Blank = household task (anyone can do it)" },
               { name: "Due Date", type: "date" },
               { name: "Due Time", type: "time" },
               { name: "Priority", type: "choice", options: ["High", "Normal", "Low"], required: true, default: "Normal" },
               { name: "Category", type: "list", list: "Category" },
               { name: "Status", type: "list", list: "Status", required: true, default: "To do" },
               { name: "Checklist", type: "longtext", hint: "Steps to tick off" },
               { name: "Notes", type: "longtext" },
               { name: "Repeat Every", type: "number", hint: "Blank = doesn't repeat" },
               { name: "Repeat Unit", type: "choice", options: ["Days", "Weeks", "Months", "Years"] },
               { name: "Repeat Days", type: "text", hint: "For weekly repeats, e.g. Mon,Thu" },
               { name: "Send to Google", label: "Send to Google Tasks", type: "bool", hint: "Also put it in the person's Google Tasks (once they've connected)" },
               { name: "Completed At", type: "datetime", readOnly: true },
               { name: "Completed By", type: "user", readOnly: true },
               { name: "Next Task ID", type: "text", readOnly: true },
               { name: "Google Task ID", type: "text", readOnly: true },
               { name: "Google Owner", type: "user", readOnly: true },
               { name: "Google Hash", type: "text", readOnly: true },
               { name: "Google Synced At", type: "datetime", readOnly: true },
               { name: "Source", type: "text", readOnly: true },
               { name: "Source Key", type: "text", readOnly: true }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "tasks",
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Category", "Status"],
      allow: tasksAllow_,
      guard: tasksGuard_,
      beforeSave: tasksBeforeSave_,
      afterSave: tasksAfterSave_,
      afterDelete: (tableKey, row) => { if (tableKey === "tasks") gtPushId_(tasksDef_(), row["Task ID"]); },
      home: tasksHome_,
      actions: {
         load:     { fn: tasksLoad_ },
         complete: { fn: tasksComplete_, write: true },
         check:    { fn: tasksCheck_, write: true },
         gConnect:    { fn: tasksGConnect_, write: true },
         gDisconnect: { fn: tasksGDisconnect_, write: true },
         gDefault:    { fn: tasksGDefault_, write: true },
         gSetSecret:  { fn: tasksGSetSecret_, write: true },
         gSync:       { fn: tasksGSync_, write: true },
         pull:        { fn: tasksPull_, write: true }
      }
   };
}

// ------------------------------------------------------------
// Who sees and changes what
// ------------------------------------------------------------
const tasksSeesAll_ = user => coreCan_(user, "tasks", "tasks", "edit");      // admins and editors
function tasksVisible_(user, r) {
   if (tasksSeesAll_(user)) return true;
   const a = String(r["Assigned To"] || "");
   return !a || a === user.id || r["Added By"] === user.id;
}
// The person a task is assigned to may change it (Data Entry or above), whoever added it.
function tasksAllow_(user, tableKey, op, row) {
   if (tableKey !== "tasks" || op !== "edit" || !row) return false;
   return row["Assigned To"] === user.id && coreCan_(user, "tasks", "tasks", "add");
}
function tasksGuard_(user, tableKey, op, row, values) {
   if (tableKey !== "tasks") return;
   if (row && !tasksVisible_(user, row)) throw coreError_("FORBIDDEN", "That task isn't on your list.");
   if (op === "delete" || tasksSeesAll_(user)) return;
   const merged = Object.assign({}, row || {}, values || {});
   const who = String(merged["Assigned To"] || "");
   const changed = !row || (values && "Assigned To" in values && String(values["Assigned To"] || "") !== String(row["Assigned To"] || ""));
   if (changed && who !== user.id) throw coreError_("FORBIDDEN", who ? "You can only make tasks for yourself." : "Only admins and editors can make household tasks.");
}

// ------------------------------------------------------------
// Saving: completion, repeats
// ------------------------------------------------------------
function tasksBeforeSave_(tableKey, values, before, user) {
   if (tableKey !== "tasks") return values;
   if ("Due Time" in values && values["Due Time"] && !values["Due Date"] && !(before && before["Due Date"])) throw coreError_("INVALID", "Pick a due date for the time.");
   if ("Repeat Every" in values && values["Repeat Every"] !== "") {
      const n = Number(values["Repeat Every"]);
      if (!(n >= 1 && n === Math.round(n))) throw coreError_("INVALID", "Repeat every must be a whole number, 1 or more.");
   }
   const merged = Object.assign({}, before || {}, values);
   if (merged["Repeat Every"] !== "" && merged["Repeat Every"] !== undefined && !merged["Repeat Unit"]) throw coreError_("INVALID", "Pick days, weeks, months or years for the repeat.");
   if ("Repeat Days" in values) values["Repeat Days"] = tasksDays_(values["Repeat Days"]).map(d => TASKS_WEEKDAYS[d]).join(",");
   if ("Checklist" in values) values["Checklist"] = tasksTidyChecklist_(values["Checklist"]);
   if (!before && !("Send to Google" in values && values["Send to Google"] !== "")) values["Send to Google"] = gtDefaultSend_(merged["Assigned To"]);
   const wasDone = before && before["Status"] === TASKS_DONE, nowDone = merged["Status"] === TASKS_DONE;
   if (nowDone && !wasDone) { values["Completed At"] = new Date(); values["Completed By"] = user.id; }
   if (!nowDone && wasDone) { values["Completed At"] = ""; values["Completed By"] = ""; }
   return values;
}
function tasksAfterSave_(tableKey, id, values, before, user) {
   if (tableKey !== "tasks") return;
   const def = tasksDef_();
   const wasDone = before && before["Status"] === TASKS_DONE;
   gtPushId_(def, id);
   if (values["Status"] === TASKS_DONE && !wasDone) {
      modForget_(def, "tasks");
      const row = modRows_(def, "tasks").find(r => r["Task ID"] === id);
      if (row) tasksAfterDone_(def, row, user);
   }
}

// After a task is completed: make the next one of a repeat (once), tell the module it came from.
function tasksAfterDone_(def, row, user) {
   if (Number(row["Repeat Every"]) >= 1 && row["Repeat Unit"] && !row["Next Task ID"]) {
      const base = row["Due Date"] || vehToday_();
      const next = tasksNextDate_(base, Number(row["Repeat Every"]), row["Repeat Unit"], row["Repeat Days"]);
      const copy = {};
      ["Title", "Assigned To", "Due Time", "Priority", "Category", "Notes", "Repeat Every", "Repeat Unit", "Repeat Days", "Send to Google", "Source", "Source Key"]
         .forEach(k => copy[k] = row[k] === undefined ? "" : row[k]);
      copy["Due Date"] = coreDate_(next);
      copy["Status"] = "To do";
      copy["Checklist"] = tasksTidyChecklist_(String(row["Checklist"] || "").split("\n").map(l => l.replace(/^\[x\]\s*/i, "")).join("\n"));
      copy["Source Key"] = "";   // the repeat is its own task
      const nid = modInsert_(def, "tasks", copy, user);
      gtPushId_(def, nid);
      modForget_(def, "tasks");
      const fresh = modRows_(def, "tasks").find(r => r["Task ID"] === row["Task ID"]);
      if (fresh) coreWriteChanges_(modSheet_(def, def.tables.tasks), fresh._row, fresh, { "Next Task ID": nid });
      modForget_(def, "tasks");
   }
   const key = String(row["Source Key"] || "");
   if (/^vehicles:/.test(key) && typeof vehFollowUpDone_ === "function") {
      try { vehFollowUpDone_(key.slice(9), true, user); } catch (e) { console.warn("Vehicles follow-up not updated: " + e); }
   }
   if (/^pets:/.test(key) && typeof petsTaskDone_ === "function") {
      try { petsTaskDone_(key.slice(5), user); } catch (e) { console.warn("Pets entry not updated: " + e); }
   }
   if (/^work:/.test(key) && typeof workTaskDone_ === "function") {
      try { workTaskDone_(key.slice(5), user); } catch (e) { console.warn("Work entry not updated: " + e); }
   }
   if (/^financial:/.test(key) && typeof finTaskDone_ === "function") {
      try { finTaskDone_(key.slice(10), user); } catch (e) { console.warn("Financial entry not updated: " + e); }
   }
}

const TASKS_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Mon, thu" -> [1, 4]
function tasksDays_(s) {
   const out = [];
   String(s || "").split(/[\s,;]+/).forEach(x => {
      const i = TASKS_WEEKDAYS.findIndex(d => d.toLowerCase() === x.slice(0, 3).toLowerCase());
      if (i !== -1 && out.indexOf(i) === -1) out.push(i);
   });
   return out.sort((a, b) => a - b);
}
// The next due date after `iso` for a repeat of every n units (weekly repeats can pick weekdays).
function tasksNextDate_(iso, n, unit, days) {
   n = Math.max(1, Math.round(n || 1));
   if (unit === "Days") return vehAddDays_(iso, n);
   if (unit === "Months") return vehAddMonths_(iso, n);
   if (unit === "Years") return vehAddMonths_(iso, 12 * n);
   const picks = tasksDays_(days);
   if (!picks.length) return vehAddDays_(iso, 7 * n);
   const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
   const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
   const later = picks.find(d => d > dow);
   if (later !== undefined) return vehAddDays_(iso, later - dow);   // later in the same week
   return vehAddDays_(iso, 7 * (n - 1) + (7 - dow) + picks[0]);       // first pick in the next cycle
}
// Checklist lines: trims, drops blanks, keeps "[x] " on done steps.
function tasksTidyChecklist_(s) {
   return String(s || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      .map(l => { const done = /^\[x\]/i.test(l); const t = l.replace(/^\[[ x]?\]\s*/i, "").trim(); return t ? (done ? "[x] " : "") + t : ""; })
      .filter(Boolean).join("\n");
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------
function tasksLoad_(req, user) {
   const def = tasksDef_();
   if (!coreCan_(user, "tasks", "tasks", "view")) throw coreError_("FORBIDDEN", "You don't have access to Tasks.");
   modPrefetch_(def);   // (Google Tasks changes come in afterwards through tasks.pull, so the list opens at once)
   const users = coreGetUsers_().filter(u => u.active).map(u => ({ id: u.id, name: u.name }));
   return {
      tasks: modRows_(def, "tasks").filter(r => tasksVisible_(user, r)),
      lists: modRows_(def, "lists"),
      schema: modSchema_(def), caps: modCaps_(def, user), seesAll: tasksSeesAll_(user),
      users: users, google: gtStatus_(user, tasksSeesAll_(user) ? users : users.filter(u => u.id === user.id)),
      today: vehToday_()
   };
}

// May this person tick this task done (or undone)? Its assignee (any role), anyone who can change it,
// and for household tasks anyone who can add tasks.
function tasksCanTick_(user, def, row) {
   if (!tasksVisible_(user, row)) return false;
   if (row["Assigned To"] === user.id) return true;
   if (!row["Assigned To"] && coreCan_(user, "tasks", "tasks", "add")) return true;
   return coreCan_(user, "tasks", "tasks", "edit", row["Added By"]);
}

// req: { id, done } -> completes (Status Done) or reopens a task.
function tasksComplete_(req, user) {
   const def = tasksDef_();
   const row = modFind_(def, "tasks", req.id);
   if (!tasksCanTick_(user, def, row)) throw coreError_("FORBIDDEN", "You can't tick off that task.");
   const done = req.done !== false;
   if ((row["Status"] === TASKS_DONE) === done) return { already: true };
   const values = tasksBeforeSave_("tasks", { "Status": done ? TASKS_DONE : "To do" }, row, user);
   modChange_(def, "tasks", row, values, user, done ? "Complete" : "Reopen");
   gtPushId_(def, row["Task ID"]);
   if (done) {
      modForget_(def, "tasks");
      tasksAfterDone_(def, modRows_(def, "tasks").find(r => r["Task ID"] === row["Task ID"]), user);
   } else if (/^vehicles:/.test(String(row["Source Key"] || "")) && typeof vehFollowUpDone_ === "function") {
      try { vehFollowUpDone_(String(row["Source Key"]).slice(9), false, user); } catch (e) { console.warn(e); }
   }
   return { done: done };
}

// req: { id, index, done } -> ticks one checklist step.
function tasksCheck_(req, user) {
   const def = tasksDef_();
   const row = modFind_(def, "tasks", req.id);
   if (!tasksCanTick_(user, def, row)) throw coreError_("FORBIDDEN", "You can't change that task.");
   const lines = String(row["Checklist"] || "").split("\n").filter(Boolean);
   const i = Number(req.index);
   if (!(i >= 0 && i < lines.length)) throw coreError_("STALE", "That step changed. Refresh and try again.");
   const text = lines[i].replace(/^\[x\]\s*/i, "");
   lines[i] = (req.done ? "[x] " : "") + text;
   modChange_(def, "tasks", row, { "Checklist": lines.join("\n") }, user, req.done ? "Tick step" : "Untick step");
   gtPushId_(def, row["Task ID"]);
   return { done: !!req.done };
}

// ------------------------------------------------------------
// Other modules: one task per Source Key (made, kept up to date, or removed while still open).
// values: { Title, Notes, "Assigned To", "Due Date" (yyyy-MM-dd), Category, Source }; null = remove.
// ------------------------------------------------------------
function tasksActive_() {
   const m = coreModules_().find(x => x.key === "tasks");
   return !!(m && m.status === "Active" && m.spreadsheetId);
}
function tasksUpsertAuto_(key, values, user) {
   if (!tasksActive_()) return null;
   const def = tasksDef_();
   const row = modRows_(def, "tasks").find(r => r["Source Key"] === key && !r["Next Task ID"]);
   if (!values) {
      if (row && row["Status"] !== TASKS_DONE) { modChange_(def, "tasks", row, { "Deleted": true, "Deleted By": user.id, "Deleted At": new Date() }, user, "Soft delete"); gtPushId_(def, row["Task ID"]); }
      return null;
   }
   const want = {
      "Title": values["Title"], "Notes": values["Notes"] || "", "Assigned To": values["Assigned To"] || "",
      "Due Date": values["Due Date"] ? coreDate_(values["Due Date"]) : "", "Category": values["Category"] || "", "Source": values["Source"] || ""
   };
   if (want["Category"] && !modListValues_(def, "Category").some(v => v.value === want["Category"])) want["Category"] = "";
   if (row) {
      if (values["Done"] !== undefined && (row["Status"] === TASKS_DONE) !== !!values["Done"]) {
         want["Status"] = values["Done"] ? TASKS_DONE : "To do";
         Object.assign(want, tasksBeforeSave_("tasks", { "Status": want["Status"] }, row, user));
      }
      modChange_(def, "tasks", row, want, user);
      gtPushId_(def, row["Task ID"]);
      return row["Task ID"];
   }
   if (values["Done"]) return null;
   const nid = modInsert_(def, "tasks", Object.assign(want, { "Priority": "Normal", "Status": "To do", "Send to Google": gtDefaultSend_(want["Assigned To"]), "Source Key": key }), user);
   gtPushId_(def, nid);
   return nid;
}

// req: { every: "home" | "load" } -> brings in changes made in Google Tasks (and sends the app's), at most
// once a minute (list) or every 10 minutes (Home). The app calls it after the screen is showing.
function tasksPull_(req, user) {
   if (!coreCan_(user, "tasks", "tasks", "view")) return { changed: false };
   const r = gtSyncUser_(user.id, user, false, req.every === "home" ? GT_PULL_EVERY.home : GT_PULL_EVERY.load) || {};
   return { changed: !!(r.pulled || r.pushed), pulled: r.pulled || 0, pushed: r.pushed || 0, skipped: r.skipped || "", error: r.error || "" };
}

// ------------------------------------------------------------
// Home: My tasks (overdue, today and the next 7 days, plus every open household task) and the tile summary
// ------------------------------------------------------------
function tasksHome_(user) {
   const out = { dueSoon: [], tasks: [] };
   if (!coreCan_(user, "tasks", "tasks", "view")) return out;
   const def = tasksDef_();
   modPrefetch_(def);
   const today = vehToday_(), week = vehAddDays_(today, 7);
   const open = modRows_(def, "tasks").filter(r => r["Status"] !== TASKS_DONE && (r["Assigned To"] === user.id || !r["Assigned To"]));
   const rank = { "High": 0, "Normal": 1, "Low": 2 };
   // Mine: due in the next 7 days (or overdue). Household: every open one, whatever its date.
   out.tasks = open.filter(r => !r["Assigned To"] || (r["Due Date"] && r["Due Date"] <= week))
      .sort((a, b) => (!a["Assigned To"] - !b["Assigned To"]) || (rank[a["Priority"]] - rank[b["Priority"]]) ||
         String((a["Due Date"] || "9999") + (a["Due Time"] || "")).localeCompare(String((b["Due Date"] || "9999") + (b["Due Time"] || ""))))
      .map(r => {
         const steps = String(r["Checklist"] || "").split("\n").filter(Boolean);
         return { id: r["Task ID"], title: r["Title"], due: r["Due Date"], time: r["Due Time"] || "", priority: r["Priority"], overdue: !!r["Due Date"] && r["Due Date"] < today,
                  shared: !r["Assigned To"], steps: steps.length, stepsDone: steps.filter(s => /^\[x\]/i.test(s)).length,
                  href: "#/tasks/t/" + encodeURIComponent(r["Task ID"]) };
      });
   const mine = open.filter(r => r["Assigned To"] === user.id);
   const overdue = mine.filter(r => r["Due Date"] && r["Due Date"] < today).length;
   out.summary = mine.length ? mine.length + " open" + (overdue ? " · " + overdue + " overdue" : "") : "Nothing open";
   return out;
}

// ------------------------------------------------------------
// Setup (run once; safe to run again): links the spreadsheet, turns the module on, builds the tabs,
// fills the Category and Status dropdowns, and turns open Vehicles follow-ups into tasks.
// ------------------------------------------------------------
const TASKS_SEED = {
   categories: ["Home", "School", "Work", "Vehicles", "Hockey", "Health", "Other"],
   statuses: [["To do", 1], ["In progress", 2], ["Done", 3]]
};
function tasksSetup() {
   const core = coreSheet_(CORE_CONFIG.tabs.modules);
   const row = coreTable_(CORE_CONFIG.tabs.modules).rows.find(r => r["Module Key"] === "tasks");
   if (!row) throw new Error("There's no tasks row on the Modules tab.");
   const hm = coreHeaderMap_(core).map;
   if (!String(row["Spreadsheet ID"] || "").trim()) core.getRange(row._row, hm["spreadsheet id"]).setValue(TASKS_SPREADSHEET_ID);
   if (String(row["Status"] || "").trim() !== "Active") core.getRange(row._row, hm["status"]).setValue("Active");
   CORE_GRID = {}; MOD_SS = {}; MOD_ROWS = {};
   const def = tasksDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   const lists = TASKS_SEED.categories.map(v => ({ "List": "Category", "Value": v, "Sort": "" }))
      .concat(TASKS_SEED.statuses.map(s => ({ "List": "Status", "Value": s[0], "Sort": s[1] })));
   const out = ["Lists: " + modSeed_(def, "lists", lists, owner)];
   let n = 0;
   if (typeof vehSyncAllFollowUps_ === "function") { try { n = vehSyncAllFollowUps_(owner); } catch (e) { out.push("Vehicles follow-ups not copied: " + e.message); } }
   out.push("Vehicles follow-ups as tasks: " + n);
   coreFlushLog_();
   const ss = modSs_("tasks");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   SpreadsheetApp.flush();
   console.log("Tasks setup done | " + out.join(" | "));
   return out.join(" | ");
}
