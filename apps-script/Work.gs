// =========================================================
// AYERS HOUSEHOLD - WORK MODULE
// =========================================================
// Data lives in the "Ayers Household - Work" spreadsheet (Work folder). Three areas, set per person
// on Permissions:
//   time          comp / OT tracker: time entries (manual start and end), OT at 1.5x, comp used,
//                 time sheet entries by category (account number) and the monthly B-2CL time
//                 sheet (printed from the app). July–June fiscal year. Comp has no cap or expiry.
//   receipts      work expense receipts with line items (category, rationale, assigned person;
//                 tax and shipping spread over the lines for the yearly report, calendar year).
//   applications  job applications: companies and their contacts, applications (one or more jobs
//                 each), statuses, a communication log, follow-ups (tasks) and files.
// Each person sees their own entries, receipts (paid by them or with lines assigned to them) and
// applications; Work Editors and admins see everyone's.
// Run workSetup() once from the script editor.
// =========================================================

const WORK_SPREADSHEET_ID = "1v-Ytp59ebX92SpQBq3-K9KGuZBmEy-kQW3JjRtULQ5M";
const WORK_FOLDERS = {
   receipts:     { id: "1YfLbZKHHwdaF4-X1de1y4K0eevqTm9yg", label: "Receipt" },
   applications: { id: "1apWBUeVWiV7kM-K10X1EHgY5VIz3OBhP", label: "Application" },
   jobs:         { id: "1apWBUeVWiV7kM-K10X1EHgY5VIz3OBhP", label: "Posting" },
   comms:        { id: "1apWBUeVWiV7kM-K10X1EHgY5VIz3OBhP", label: "Communication" }
};
// Status groups for the Applications chips and the yearly summary.
const WORK_STATUS_GROUPS = {
   "Active": ["Draft", "Submitted", "Under Review"],
   "Interviewing": ["Phone Screen", "Interview", "Second Interview"],
   "Offers": ["Offer", "Accepted"],
   "Closed": ["Declined (by me)", "Rejected", "Withdrawn", "No Response"]
};

function workDef_() {
   return {
      key: "work",
      name: "Work",
      areas: ["time", "receipts", "applications"],
      tables: {
         entries: { tab: "Time Entries", label: "Time Entries", id: "Entry ID", prefix: "TIM-", kind: "record", area: "time",
            title: r => r["Activity"] || "Time entry",
            fields: [
               { name: "Person", type: "user", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Start Time", type: "time", required: true },
               { name: "End Time", type: "time", required: true },
               { name: "Activity", type: "text", required: true },
               { name: "OT Rate", label: "OT rate (1.5×)", type: "bool" },
               { name: "Comp Use", label: "Comp time used", type: "bool" },
               { name: "Time Sheet", label: "On the time sheet (paid)", type: "bool" },
               { name: "Category ID", label: "Time sheet category", type: "ref", ref: "categories" },
               { name: "Hours", type: "number", readOnly: true },
               { name: "Comp Hours", type: "number", readOnly: true, hint: "+ earned, − used" },
               { name: "Notes", type: "text" }
            ] },
         categories: { tab: "Time Sheet Categories", label: "Time Sheet Categories", id: "Category ID", prefix: "TSC-", kind: "list", area: "time",
            unique: ["Category"], title: r => r["Category"],
            fields: [
               { name: "Category", label: "Description", type: "text", required: true },
               { name: "Account", label: "Account #", type: "text" }
            ] },
         profiles: { tab: "Time Sheet Profiles", label: "Time Sheet Profiles", id: "Profile ID", prefix: "TSP-", kind: "record", area: "time",
            unique: ["Person"], title: r => r["Position Title"] || "Time sheet",
            fields: [
               { name: "Person", type: "user", required: true },
               { name: "Employer", type: "text", default: "Cajon Valley Union School District" },
               { name: "Form", type: "text", default: "B-2CL", hint: "e.g. B-2CL" },
               { name: "Form Title", type: "text", default: "Classified Employee Time Sheet" },
               { name: "Position Title", type: "text" },
               { name: "Employee Number", type: "text" }
            ] },
         receipts: { tab: "Receipts", label: "Receipts", id: "Receipt ID", prefix: "RCP-", kind: "record", area: "receipts",
            title: r => [r["Store"], vehNiceDate_(workIso_(r["Date"]))].filter(Boolean).join(" · "),
            fields: [
               { name: "Date", type: "date", required: true },
               { name: "Store", type: "list", list: "Store", required: true },
               { name: "Paid By", type: "user", required: true },
               { name: "Assigned To", type: "user", hint: "Fills in every line; change any line that's someone else's" },
               { name: "Card", label: "Payment card", type: "text" },
               { name: "Subtotal", type: "money", readOnly: true },
               { name: "Tax", type: "money", readOnly: true },
               { name: "Shipping", type: "money", readOnly: true },
               { name: "Total", type: "money", readOnly: true },
               { name: "Receipt", label: "Receipt photo or PDF", type: "file" },
               { name: "Notes", type: "longtext" }
            ] },
         lines: { tab: "Receipt Lines", label: "Receipt Lines", id: "Line ID", prefix: "RCL-", kind: "record", area: "receipts", hardDelete: true,
            title: r => r["Kind"] === "Item" ? r["Item"] : r["Kind"],
            fields: [
               { name: "Receipt ID", label: "Receipt", type: "ref", ref: "receipts", required: true },
               { name: "Kind", type: "choice", options: ["Item", "Tax", "Shipping"], required: true, default: "Item" },
               { name: "Item", type: "text" },
               { name: "Category", type: "list", list: "Expense Category" },
               { name: "Quantity", type: "number" },
               { name: "Price", type: "money" },
               { name: "Amount", type: "money", readOnly: true },
               { name: "Rationale", type: "list", list: "Rationale" },
               { name: "Assigned To", type: "user" },
               { name: "Add To Inventory", label: "Add to Inventory", type: "bool", hint: "Goes to Inventory once that module is built" },
               { name: "Sort", type: "number" }
            ] },
         companies: { tab: "Companies", label: "Companies", id: "Company ID", prefix: "CMP-", kind: "record", area: "applications", addNew: true,
            title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true },
               { name: "Website", type: "url" },
               { name: "Address", label: "Address / city", type: "text" },
               { name: "Industry", type: "list", list: "Industry" },
               { name: "Notes", type: "longtext" }
            ] },
         contacts: { tab: "Contacts", label: "Contacts", id: "Contact ID", prefix: "CON-", kind: "record", area: "applications", addNew: true,
            title: r => r["Name"],
            fields: [
               { name: "Company ID", label: "Company", type: "ref", ref: "companies", required: true },
               { name: "Name", type: "text", required: true },
               { name: "Title", type: "text" },
               { name: "Email", type: "text" },
               { name: "Phone", type: "phone" },
               { name: "LinkedIn", type: "url" },
               { name: "Notes", type: "text" }
            ] },
         applications: { tab: "Applications", label: "Applications", id: "Application ID", prefix: "APP-", kind: "record", area: "applications",
            title: (r, def) => workCompanyName_(def, r["Company ID"]) + (r["Date Submitted"] ? " · " + vehNiceDate_(workIso_(r["Date Submitted"])) : ""),
            fields: [
               { name: "Person", type: "user", required: true },
               { name: "Company ID", label: "Company", type: "ref", ref: "companies", required: true },
               { name: "Date Submitted", type: "date" },
               { name: "Applied Through", type: "list", list: "Applied Through" },
               { name: "Reference Number", label: "Application / reference number", type: "text" },
               { name: "Resume Version", type: "text" },
               { name: "Cover Letter", type: "bool" },
               { name: "Status", type: "list", list: "Application Status", required: true, default: "Submitted" },
               { name: "Follow Up Date", type: "date" },
               { name: "Follow Up Done", type: "bool" },
               { name: "Files", label: "Images / files", type: "file" },
               { name: "Notes", type: "longtext" }
            ] },
         jobs: { tab: "Jobs", label: "Jobs", id: "Job ID", prefix: "JOB-", kind: "record", area: "applications",
            title: r => r["Job Title"],
            fields: [
               { name: "Application ID", label: "Application", type: "ref", ref: "applications", required: true },
               { name: "Job Title", type: "text", required: true },
               { name: "Posting Number", label: "Posting / job number", type: "text" },
               { name: "Link", label: "Link to posting", type: "url" },
               { name: "Location", type: "text" },
               { name: "Job Type", type: "choice", options: ["Full-time", "Part-time", "Contract", "Temporary"] },
               { name: "Pay", label: "Pay / salary range", type: "text" },
               { name: "Closing Date", type: "date" },
               { name: "Status", type: "list", list: "Application Status", required: true, default: "Submitted" },
               { name: "Files", label: "Images / files", type: "file" },
               { name: "Notes", type: "text" }
            ] },
         comms: { tab: "Communication Log", label: "Communication Log", id: "Log ID", prefix: "COM-", kind: "record", area: "applications",
            title: r => [r["Type"], r["Direction"]].filter(Boolean).join(" · "),
            fields: [
               { name: "Application ID", label: "Application", type: "ref", ref: "applications", required: true },
               { name: "When", type: "datetime", required: true },
               { name: "Type", type: "list", list: "Communication Type", required: true, default: "Email" },
               { name: "Direction", type: "choice", options: ["Sent", "Received"] },
               { name: "Contact ID", label: "Contact", type: "ref", ref: "contacts" },
               { name: "Summary", type: "longtext", required: true },
               { name: "Follow Up Date", type: "date" },
               { name: "Follow Up Done", type: "bool" },
               { name: "Files", label: "Images / files", type: "file" }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "receipts",
            listAreas: { "Industry": "applications", "Applied Through": "applications", "Application Status": "applications", "Communication Type": "applications" },
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Store", "Expense Category", "Rationale", "Industry", "Applied Through", "Application Status", "Communication Type"],
      guard: workGuard_,
      beforeSave: workBeforeSave_,
      afterSave: workAfterSave_,
      afterDelete: workAfterDelete_,
      home: workHome_,
      actions: {
         load:        { fn: workLoad_ },
         file:        { fn: workFile_ },
         upload:      { fn: workUpload_, write: true },
         clearFile:   { fn: workClearFile_, write: true },
         saveReceipt: { fn: workSaveReceipt_, write: true },
         followUp:    { fn: workFollowUp_, write: true }
      }
   };
}

// ------------------------------------------------------------
// Helpers and who sees what
// ------------------------------------------------------------
const workIso_ = v => vehIso_(v);
const workRound_ = n => Math.round((Number(n) || 0) * 100) / 100;
function workCompanyName_(def, id) { const r = vehFind_(def, "companies", id); return r ? r["Name"] : id || ""; }
const workSeesAll_ = (user, area) => coreCan_(user, "work", area, "edit");   // Work Editors and admins
// "08:30" .. "17:15" -> hours (past midnight counts as the next day).
function workHours_(start, end) {
   const m = s => { const x = /^(\d{1,2}):(\d{2})/.exec(String(s || "")); return x ? (+x[1]) * 60 + (+x[2]) : null; };
   const a = m(start), b = m(end);
   if (a === null || b === null) return "";
   let d = b - a; if (d < 0) d += 24 * 60;
   return Math.round(d / 60 * 100) / 100;
}
// Comp effect of an entry: used = minus; time sheet (paid) = none; OT rate = 1.5x; otherwise 1x.
function workComp_(r, hours) {
   if (hours === "" || hours === undefined) return "";
   if (r["Comp Use"] === true) return -hours;
   if (r["Time Sheet"] === true) return 0;
   return workRound_(r["OT Rate"] === true ? hours * 1.5 : hours);
}
function workEntryVisible_(user, r) { return workSeesAll_(user, "time") || r["Person"] === user.id || r["Added By"] === user.id; }
function workReceiptVisible_(user, r, lines) {
   if (workSeesAll_(user, "receipts") || r["Paid By"] === user.id || r["Added By"] === user.id || r["Assigned To"] === user.id) return true;
   return (lines || []).some(l => l["Receipt ID"] === r["Receipt ID"] && l["Assigned To"] === user.id);
}
function workAppVisible_(user, r) { return workSeesAll_(user, "applications") || r["Person"] === user.id || r["Added By"] === user.id; }

// Module rules on top of roles: Data Entry make entries and applications for themselves.
function workGuard_(user, tableKey, op, row, values) {
   const merged = Object.assign({}, row || {}, values || {});
   if (tableKey === "entries" && !workSeesAll_(user, "time")) {
      if (row && !workEntryVisible_(user, row)) throw coreError_("FORBIDDEN", "That entry isn't yours.");
      if (op !== "delete" && merged["Person"] && merged["Person"] !== user.id) throw coreError_("FORBIDDEN", "You can only log your own time.");
   }
   if (tableKey === "applications" && !workSeesAll_(user, "applications")) {
      if (row && !workAppVisible_(user, row)) throw coreError_("FORBIDDEN", "That application isn't yours.");
      if (op !== "delete" && merged["Person"] && merged["Person"] !== user.id) throw coreError_("FORBIDDEN", "You can only track your own applications.");
   }
   if ((tableKey === "jobs" || tableKey === "comms") && !workSeesAll_(user, "applications")) {
      const app = vehFind_(workDef_(), "applications", merged["Application ID"]);
      if (app && !workAppVisible_(user, app)) throw coreError_("FORBIDDEN", "That application isn't yours.");
   }
}

// ------------------------------------------------------------
// Save rules
// ------------------------------------------------------------
function workBeforeSave_(tableKey, values, before, user) {
   const merged = Object.assign({}, before || {}, values);
   if (tableKey === "entries") {
      if (!merged["Person"]) values["Person"] = user.id;
      if (merged["Comp Use"] === true && (merged["OT Rate"] === true || merged["Time Sheet"] === true)) throw coreError_("INVALID", "Comp time used can't also be OT or time sheet time.");
      if (merged["Time Sheet"] === true && !merged["Category ID"]) throw coreError_("INVALID", "Pick the time sheet category.");
      const h = workHours_(merged["Start Time"], merged["End Time"]);
      if (h === 0) throw coreError_("INVALID", "The end time is the same as the start time.");
      values["Hours"] = h;
      values["Comp Hours"] = workComp_(merged, h);
   }
   if ((tableKey === "applications") && !merged["Person"]) values["Person"] = user.id;
   if (tableKey === "comms" && !before && !merged["When"]) values["When"] = new Date();
   return values;
}
function workAfterSave_(tableKey, id, values, before, user) {
   const def = workDef_();
   const fresh = t => { modForget_(def, t); return modRows_(def, t).find(r => r[def.tables[t].id] === id); };
   if (tableKey === "applications") {
      const a = fresh("applications");
      if (before && "Status" in values && values["Status"] !== before["Status"]) workStatusNote_(def, id, "Status: " + (before["Status"] || "(none)") + " → " + values["Status"], user);
      workAppTask_(def, a, user);
   }
   if (tableKey === "jobs" && before && "Status" in values && values["Status"] !== before["Status"]) {
      workStatusNote_(def, before["Application ID"], before["Job Title"] + ": " + (before["Status"] || "(none)") + " → " + values["Status"], user);
   }
   if (tableKey === "comms") workComTask_(def, fresh("comms"), user);
}
function workAfterDelete_(tableKey, row, user) {
   const def = workDef_();
   if (tableKey === "applications") workAppTask_(def, Object.assign({}, row, { "Deleted": true }), user);
   if (tableKey === "comms") workComTask_(def, Object.assign({}, row, { "Deleted": true }), user);
}
// A status change writes a line in the communication log.
function workStatusNote_(def, appId, text, user) {
   modInsert_(def, "comms", { "Application ID": appId, "When": new Date(), "Type": "Note", "Summary": text }, user);
   modForget_(def, "comms");
}

// ------------------------------------------------------------
// Follow-ups as tasks (work:app:<id>, work:com:<id>); done = follow-up done
// ------------------------------------------------------------
function workTasksOn_() { return typeof tasksActive_ === "function" && tasksActive_(); }
function workAppTask_(def, a, user) {
   if (!workTasksOn_() || !a) return;
   const key = "work:app:" + a["Application ID"];
   try {
      if (!a["Follow Up Date"] || a["Deleted"]) { tasksUpsertAuto_(key, null, user); return; }
      tasksUpsertAuto_(key, {
         "Title": "Follow up · " + workCompanyName_(def, a["Company ID"]), "Notes": "Application " + a["Application ID"] + (a["Status"] ? " (" + a["Status"] + ")" : "") + ".",
         "Assigned To": a["Person"] || "", "Due Date": workIso_(a["Follow Up Date"]), "Category": "Work", "Source": "Work " + a["Application ID"], "Done": a["Follow Up Done"] === true
      }, user);
   } catch (e) { console.warn("Work task not updated: " + e); }
}
function workComTask_(def, c, user) {
   if (!workTasksOn_() || !c) return;
   const key = "work:com:" + c["Log ID"];
   try {
      if (!c["Follow Up Date"] || c["Deleted"]) { tasksUpsertAuto_(key, null, user); return; }
      const a = vehFind_(def, "applications", c["Application ID"]) || {};
      tasksUpsertAuto_(key, {
         "Title": "Follow up · " + workCompanyName_(def, a["Company ID"]), "Notes": String(c["Summary"] || "").slice(0, 300),
         "Assigned To": a["Person"] || "", "Due Date": workIso_(c["Follow Up Date"]), "Category": "Work", "Source": "Work " + c["Log ID"], "Done": c["Follow Up Done"] === true
      }, user);
   } catch (e) { console.warn("Work task not updated: " + e); }
}
// Called by Tasks when a Work follow-up task is ticked done.
function workTaskDone_(key, user) {
   const def = workDef_();
   const m = /^(app|com):(.+)$/.exec(String(key));
   if (!m) return;
   const table = m[1] === "app" ? "applications" : "comms";
   const row = modRows_(def, table).find(r => r[def.tables[table].id] === m[2]);
   if (row && row["Follow Up Done"] !== true) modChange_(def, table, row, { "Follow Up Done": true }, user, "Follow-up done");
}
// req: { table: "applications" | "comms", id, done }
function workFollowUp_(req, user) {
   const def = workDef_(), table = req.table === "comms" ? "comms" : "applications";
   const row = modFind_(def, table, req.id);
   modRequire_(user, def, def.tables[table], "edit", row, {});
   modChange_(def, table, row, { "Follow Up Done": !!req.done }, user, req.done ? "Follow-up done" : "Follow-up reopened");
   modForget_(def, table);
   const fresh = modRows_(def, table).find(r => r[def.tables[table].id] === req.id);
   if (table === "applications") workAppTask_(def, fresh, user); else workComTask_(def, fresh, user);
   return { done: !!req.done };
}

// ------------------------------------------------------------
// Receipts: a receipt and its lines in one go
// req: { receiptId?, values: { receipt fields }, lines: [{ id?, Kind, Item, Category, Quantity, Price, Rationale, Assigned To }] }
// Blank lines are skipped; a blank Assigned To on a line uses the receipt's. Lines left out are removed.
// ------------------------------------------------------------
function workSaveReceipt_(req, user) {
   const def = workDef_(), tr = def.tables.receipts, tl = def.tables.lines;
   const before = req.receiptId ? modFind_(def, "receipts", req.receiptId) : null;
   if (before && !workReceiptVisible_(user, before, modRows_(def, "lines"))) throw coreError_("FORBIDDEN", "That receipt isn't yours.");
   modRequire_(user, def, tr, before ? "edit" : "add", before, req.values || {});
   const values = modClean_(def, tr, req.values || {}, user, before);
   const merged = Object.assign({}, before || {}, values);
   if (!merged["Paid By"]) values["Paid By"] = user.id;
   modCheckRequired_(tr, Object.assign({}, merged, values));
   const assigned = (values["Assigned To"] !== undefined ? values["Assigned To"] : merged["Assigned To"]) || "";
   const old = before ? modRows_(def, "lines").filter(l => l["Receipt ID"] === before["Receipt ID"]) : [];
   const keep = {}, lines = [];
   (req.lines || []).forEach((raw, i) => {
      const o = raw.id ? old.find(l => l["Line ID"] === raw.id) : null;
      if (raw.id && !o) throw coreError_("STALE", "A line on this receipt changed. Refresh and try again.");
      const v = modClean_(def, tl, Object.assign({}, raw, { "Receipt ID": undefined }), user, o);
      delete v["Receipt ID"];
      if (!v["Kind"]) v["Kind"] = "Item";
      const price = v["Price"] === "" || v["Price"] === undefined ? null : Number(v["Price"]);
      if (v["Kind"] === "Item" && !String(v["Item"] || "").trim() && price === null) return;
      if (v["Kind"] !== "Item" && price === null) return;
      if (v["Kind"] === "Item" && !String(v["Item"] || "").trim()) throw coreError_("INVALID", "Each line with a price needs an item.");
      const qty = v["Kind"] === "Item" ? (v["Quantity"] === "" || v["Quantity"] === undefined ? 1 : Number(v["Quantity"])) : 1;
      v["Quantity"] = v["Kind"] === "Item" ? qty : "";
      v["Amount"] = workRound_((price || 0) * qty);
      if (v["Kind"] !== "Item") { v["Item"] = ""; v["Category"] = ""; v["Rationale"] = ""; v["Assigned To"] = ""; v["Add To Inventory"] = false; }
      else if (!v["Assigned To"]) v["Assigned To"] = assigned || values["Paid By"] || merged["Paid By"] || user.id;
      v["Sort"] = i + 1;
      if (o) keep[o["Line ID"]] = true;
      lines.push({ old: o, values: v });
   });
   if (!lines.some(l => l.values["Kind"] === "Item")) throw coreError_("INVALID", "Add at least one item.");
   const sum = k => workRound_(lines.filter(l => l.values["Kind"] === k).reduce((s, l) => s + l.values["Amount"], 0));
   values["Subtotal"] = sum("Item"); values["Tax"] = sum("Tax"); values["Shipping"] = sum("Shipping");
   values["Total"] = workRound_(values["Subtotal"] + values["Tax"] + values["Shipping"]);
   let id;
   if (before) { id = before["Receipt ID"]; modChange_(def, "receipts", before, values, user); }
   else id = modInsert_(def, "receipts", values, user);
   lines.filter(l => l.old).forEach(l => modChange_(def, "lines", l.old, l.values, user));
   const fresh = lines.filter(l => !l.old).map(l => Object.assign({ "Receipt ID": id }, l.values));
   if (fresh.length) modBulkInsert_(def, "lines", fresh, user);
   old.filter(l => !keep[l["Line ID"]]).sort((a, b) => b._row - a._row).forEach(l => {
      modForget_(def, "lines");
      const r = modRows_(def, "lines").find(x => x["Line ID"] === l["Line ID"]);
      if (r) modRemoveRow_(def, "lines", r);
   });
   return { id: id, total: values["Total"] };
}

// ------------------------------------------------------------
// Load
// ------------------------------------------------------------
function workLoad_(req, user) {
   const def = workDef_();
   const see = a => coreCan_(user, "work", a, "view");
   if (!see("time") && !see("receipts") && !see("applications")) throw coreError_("FORBIDDEN", "You don't have access to Work.");
   modPrefetch_(def);
   const out = {
      schema: modSchema_(def), caps: modCaps_(def, user), today: vehToday_(),
      users: coreGetUsers_().map(u => ({ id: u.id, name: u.name })), lists: modRows_(def, "lists"),
      seesAll: { time: workSeesAll_(user, "time"), receipts: workSeesAll_(user, "receipts"), applications: workSeesAll_(user, "applications") },
      entries: [], categories: [], profiles: [], receipts: [], lines: [], companies: [], contacts: [], applications: [], jobs: [], comms: [], cards: []
   };
   if (see("time")) {
      out.entries = modRows_(def, "entries").filter(r => workEntryVisible_(user, r));
      out.categories = modRows_(def, "categories");
      out.profiles = modRows_(def, "profiles").filter(p => out.seesAll.time || p["Person"] === user.id);
   }
   if (see("receipts")) {
      const lines = modRows_(def, "lines");
      out.receipts = modRows_(def, "receipts").filter(r => workReceiptVisible_(user, r, lines));
      const ids = {}; out.receipts.forEach(r => ids[r["Receipt ID"]] = true);
      out.lines = lines.filter(l => ids[l["Receipt ID"]]);
      // Payment cards from Financial ▸ Accounts, for people who can see them.
      try {
         if (typeof financialDef_ === "function" && typeof finActive_ === "function" && finActive_() && coreCan_(user, "financial", "accounts", "view")) {
            const fd = financialDef_();
            const accts = {}; modRows_(fd, "accounts").forEach(a => accts[a["Account ID"]] = a["Nickname"]);
            out.cards = modRows_(fd, "cards").filter(c => c["Active"] !== false && c["Status"] !== "Closed")
               .map(c => ({ id: c["Card ID"], label: [accts[c["Account ID"]], (c["Network"] ? c["Network"] + " " : "") + "••" + c["Last 4"]].filter(Boolean).join(" · ") }));
         }
      } catch (e) { console.warn("Cards for Work: " + e); }
   }
   if (see("applications")) {
      out.applications = modRows_(def, "applications").filter(a => workAppVisible_(user, a));
      const appIds = {}, used = {};
      out.applications.forEach(a => { appIds[a["Application ID"]] = true; used[a["Company ID"]] = true; });
      out.companies = modRows_(def, "companies").filter(c => out.seesAll.applications || used[c["Company ID"]] || c["Added By"] === user.id);
      const cids = {}; out.companies.forEach(c => cids[c["Company ID"]] = true);
      out.contacts = modRows_(def, "contacts").filter(c => cids[c["Company ID"]]);
      out.jobs = modRows_(def, "jobs").filter(j => appIds[j["Application ID"]]);
      out.comms = modRows_(def, "comms").filter(c => appIds[c["Application ID"]]);
      out.statusGroups = WORK_STATUS_GROUPS;
   }
   return out;
}

// ------------------------------------------------------------
// Files: receipts, applications, jobs, log entries
// ------------------------------------------------------------
function workUpload_(req, user) {
   const def = workDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f || !WORK_FOLDERS[req.table]) throw coreError_("BAD_REQUEST", "That can't have a file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   const file = req.file || {};
   if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(file.mimeType))) throw coreError_("INVALID", "Use a photo (JPG, PNG) or a PDF.");
   const bytes = Utilities.base64Decode(String(file.data || "").replace(/^data:[^,]*,/, ""));
   if (!bytes.length) throw coreError_("INVALID", "The file is empty.");
   if (bytes.length > 15 * 1024 * 1024) throw coreError_("INVALID", "That file is too large (15 MB at most).");
   const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif", "application/pdf": ".pdf" }[file.mimeType];
   let lead, date = vehToday_();
   if (req.table === "receipts") { lead = row["Receipt ID"] + " " + (row["Store"] || ""); date = workIso_(row["Date"]) || date; }
   else {
      const appId = req.table === "applications" ? row["Application ID"] : row["Application ID"];
      const app = vehFind_(def, "applications", appId) || {};
      lead = appId + " " + workCompanyName_(def, app["Company ID"]);
   }
   const name = (lead + " – " + WORK_FOLDERS[req.table].label + " – " + date).replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) + ext;
   const saved = DriveApp.getFolderById(WORK_FOLDERS[req.table].id).createFile(Utilities.newBlob(bytes, file.mimeType, name));
   saved.setDescription(row[t.id] + " · uploaded by " + user.name + " (" + user.id + ") via Ayers Household");
   const url = "https://drive.google.com/file/d/" + saved.getId() + "/view";
   modChange_(def, req.table, row, { [f.name]: url }, user, "Add file");
   return { url: url, name: name };
}
function workClearFile_(req, user) {
   const def = workDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f) throw coreError_("BAD_REQUEST", "That has no file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   modChange_(def, req.table, row, { [f.name]: "" }, user, "Remove file");
   return { cleared: true };
}
function workFile_(req, user) {
   const fileId = String(req.fileId || "");
   if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw coreError_("BAD_REQUEST", "Unknown file.");
   const data = workLoad_({}, user);   // only what this person can see
   const has = list => list.some(r => ["Receipt", "Files"].some(n => String(r[n] || "").indexOf("/d/" + fileId + "/") !== -1));
   if (!(has(data.receipts) || has(data.applications) || has(data.jobs) || has(data.comms))) throw coreError_("NOT_FOUND", "That file isn't linked to anything you can see.");
   let blob;
   try { blob = DriveApp.getFileById(fileId).getBlob(); } catch (e) { throw coreError_("NOT_FOUND", "The file couldn't be found in Drive (it may have been moved or deleted)."); }
   return { file: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()), name: blob.getName() } };
}

// ------------------------------------------------------------
// Home: application follow-ups in Due Soon; tile summary
// ------------------------------------------------------------
function workHome_(user, days) {
   const out = { dueSoon: [] };
   const see = a => coreCan_(user, "work", a, "view");
   if (!see("time") && !see("receipts") && !see("applications")) return out;
   const def = workDef_();
   modPrefetch_(def);
   const parts = [];
   if (see("time")) {
      const bal = workRound_(modRows_(def, "entries").filter(r => r["Person"] === user.id).reduce((s, r) => s + (Number(r["Comp Hours"]) || 0), 0));
      if (modRows_(def, "entries").some(r => r["Person"] === user.id)) parts.push(bal + " comp hrs");
   }
   if (see("applications")) {
      const today = vehToday_(), horizon = vehAddDays_(today, days || 30);
      const mine = modRows_(def, "applications").filter(a => a["Person"] === user.id);
      const closed = WORK_STATUS_GROUPS["Closed"].concat(["Accepted"]);
      const open = mine.filter(a => closed.indexOf(a["Status"]) === -1);
      if (open.length) parts.push(open.length + (open.length === 1 ? " open application" : " open applications"));
      if (!workTasksOn_()) {
         const push = (title, date, href) => out.dueSoon.push({ title: title, when: (date < today ? "Overdue since " : "Due ") + vehNiceDate_(date), sortKey: date, href: href, owner: user.id, ownerName: user.name });
         mine.forEach(a => { const d = workIso_(a["Follow Up Date"]); if (d && a["Follow Up Done"] !== true && d <= horizon) push("Follow up · " + workCompanyName_(def, a["Company ID"]), d, "#/work/app/" + encodeURIComponent(a["Application ID"])); });
         const ids = {}; mine.forEach(a => ids[a["Application ID"]] = a);
         modRows_(def, "comms").forEach(c => { const a = ids[c["Application ID"]], d = workIso_(c["Follow Up Date"]); if (a && d && c["Follow Up Done"] !== true && d <= horizon) push("Follow up · " + workCompanyName_(def, a["Company ID"]), d, "#/work/app/" + encodeURIComponent(a["Application ID"])); });
      }
   }
   if (parts.length) out.summary = parts.join(" · ");
   return out;
}

// ------------------------------------------------------------
// Setup (run once; safe to run again). Links the spreadsheet, turns Work on, adds its areas and
// access (Brittany Editor; Jasper, Connor, Toby Data Entry; the comp / OT tracker is Chris only
// until an admin opens it to others), builds the tabs, fills the dropdowns, adds the time sheet
// categories from the Comp and OT Tracker and Chris's time sheet profile, and a Work category in Tasks.
// No time entries are copied in (that's a separate import, later).
// ------------------------------------------------------------
const WORK_SEED = {
   lists: {
      "Store": ["Amazon", "Costco", "Lakeshore Learning", "Office Depot", "Staples", "Target", "Walmart"],
      "Expense Category": ["Classroom Supplies", "Technology", "Books", "Professional Development", "Clothing / Uniform", "Other"],
      "Rationale": ["Used in classroom", "Required by employer", "Professional development", "Used for work tasks"],
      "Industry": ["Education", "Government", "Healthcare", "Retail", "Technology", "Other"],
      "Applied Through": ["Company site", "LinkedIn", "Indeed", "EdJoin", "Referral", "Recruiter", "Email", "In person", "Other"],
      "Application Status": ["Draft", "Submitted", "Under Review", "Phone Screen", "Interview", "Second Interview", "Offer", "Accepted", "Declined (by me)", "Rejected", "Withdrawn", "No Response"],
      "Communication Type": ["Email", "Phone", "Interview", "Video Call", "Message", "In person", "Note"]
   },
   categories: [["Software Updates", "0100.0000.000.0000.7700.2200940.000.0000.0"], ["New Software Setup", "0100.0000.000.0000.7700.2200940.000.0000.0"],
      ["Summer Camp: performed tasks such as designing, building and implementing custom solutions", ""], ["Visions Update Error Troubleshooting and Repair", "0100.0000.000.0000.7700.2200940.000.0000.0"]],
   areas: [["work", "time", "Comp / OT & Time Sheet", 10, "Time entries, comp balance and the monthly time sheet"], ["work", "receipts", "Work Receipts", 20, "Work expense receipts, line items and the yearly report"],
      ["work", "applications", "Job Applications", 30, "Companies, applications, jobs, communication log and follow-ups"]],
   access: [["USR-2", "Editor"], ["USR-3", "Data Entry"], ["USR-4", "Data Entry"], ["USR-5", "Data Entry"]]
};
function workSetup() {
   const out = [];
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   const mods = coreSheet_(CORE_CONFIG.tabs.modules), mh = coreHeaderMap_(mods).map;
   const row = coreTable_(CORE_CONFIG.tabs.modules).rows.find(r => r["Module Key"] === "work");
   if (!row) throw new Error("There's no work row on the Modules tab.");
   if (!String(row["Spreadsheet ID"] || "").trim()) mods.getRange(row._row, mh["spreadsheet id"]).setValue(WORK_SPREADSHEET_ID);
   if (String(row["Status"] || "").trim() !== "Active") mods.getRange(row._row, mh["status"]).setValue("Active");
   if (mh["description"] && /^Comp \/ OT tracker and monthly timesheet\.?$/.test(String(row["Description"] || "").trim())) mods.getRange(row._row, mh["description"]).setValue("Comp / OT and time sheet, work receipts and job applications.");
   CORE_GRID = {};
   const areas = coreSheet_(CORE_CONFIG.tabs.areas), have = coreTable_(CORE_CONFIG.tabs.areas).rows;
   WORK_SEED.areas.forEach(a => { if (!have.some(r => r["Module Key"] === a[0] && r["Area Key"] === a[1])) { coreAppendRow_(areas, { "Module Key": a[0], "Area Key": a[1], "Area Name": a[2], "Sort": a[3], "Description": a[4] }); out.push("Area added: " + a[2]); } });
   CORE_GRID = {}; CORE_PERMS = null;
   const perms = coreSheet_(CORE_CONFIG.tabs.perms), users = coreGetUsers_(true);
   const addPerm = (uid, area, role) => {
      if (!users.some(u => u.id === uid) || coreGetPerms_().some(p => p.userId === uid && p.module === "work" && p.area === area)) return;
      coreAppendRow_(perms, { "User ID": uid, "Module Key": "work", "Area Key": area, "Role": role });
      coreLog_(owner, "core", "Permissions", (users.find(u => u.id === uid) || {}).name || uid, "Work" + (area ? " ▸ " + area : ""), "Role: " + role, true);
      CORE_PERMS = null; CORE_GRID = {};
      out.push(uid + (area ? "/" + area : "") + " " + role);
   };
   WORK_SEED.access.forEach(a => addPerm(a[0], "", a[1]));
   WORK_SEED.access.forEach(a => addPerm(a[0], "time", "No Access"));   // comp / OT: Chris only for now
   CORE_GRID = {}; MOD_SS = {}; MOD_ROWS = {}; CORE_PERMS = null;
   const def = workDef_();
   modBuildTabs_(def);
   const lists = [];
   Object.keys(WORK_SEED.lists).forEach(l => WORK_SEED.lists[l].forEach((v, i) => lists.push({ "List": l, "Value": v, "Sort": l === "Application Status" ? i + 1 : "" })));
   out.push("Lists: " + modSeed_(def, "lists", lists, owner));
   out.push("Time sheet categories: " + modSeed_(def, "categories", WORK_SEED.categories.map(c => ({ "Category": c[0], "Account": c[1] })), owner));
   out.push("Profiles: " + modSeed_(def, "profiles", [{ "Person": "USR-1", "Employer": "Cajon Valley Union School District", "Form": "B-2CL", "Form Title": "Classified Employee Time Sheet", "Position Title": "Systems Analysts / Programmer" }], owner));
   if (workTasksOn_()) {
      const td = tasksDef_();
      if (!modListValues_(td, "Category").some(v => v.value === "Work")) { modBulkInsert_(td, "lists", [{ "List": "Category", "Value": "Work", "Sort": "" }], owner); out.push("Tasks category added: Work"); }
   }
   coreFlushLog_();
   const ss = modSs_("work");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   Object.keys(WORK_FOLDERS).forEach(k => DriveApp.getFolderById(WORK_FOLDERS[k].id).getName());
   SpreadsheetApp.flush();
   console.log("Work setup done | " + out.join(" | "));
   return out.join(" | ");
}
