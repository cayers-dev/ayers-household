// =========================================================
// AYERS HOUSEHOLD - FINANCIAL MODULE
// =========================================================
// Data lives in the "Ayers Household - Financial" spreadsheet (Financial folder). It isn't shared
// with anyone: the app reads it as Chris (the web app runs as its owner), so only people with
// Financial access in the app ever see it.
//
// Areas (set per person on Permissions):
//   bills     Upcoming & Bills: bills (Expenses / Non-Essential / Savings lines), their entries
//   income    income sources and their entries
//   loans     loans, extra payments / adjustments, payoff
//   accounts  institutions, nicknames, last 4 digits, optional balances
//   plans     Plan / Save For goals, options compared, cost lines
//   reports   the month grid and spending from other modules
//
// A bill or income source has a default amount and a frequency. Entries (one per due date) are
// made ahead of time as Scheduled: through 3 months from today, plus the next one for anything
// billed less often. On its due date an entry turns Paid (autopay / received automatically) or
// Due / Expected (marked by hand). Past and paid entries never change when a default changes.
// A bill with "Reminder task" ticked gets a task (Tasks module) for each unpaid entry.
// Loans: each Paid entry of a bill linked to the loan lowers its balance by the full payment;
// extra payments and adjustments are logged on the loan.
// Run financialSetup() once from the script editor.
// =========================================================

const FIN_SPREADSHEET_ID = "1U5lWObFoaHHqvocMrItOFdjUdJ-JSkwyXeB6gaFP2JY";
const FIN_FOLDERS = {
   entries: { id: "1agapalEILSsj3qHxRY7Ht5WpjU5C5bgH", label: "Statement" }
};
const FIN_AREAS = ["bills", "income", "loans", "accounts", "plans", "reports"];
const FIN_LOOKUP_AREA = "lookup";   // a switch, not a data area (see finCanLookup_)
const FIN_FREQ = ["Weekly", "Every 2 weeks", "Twice a month", "Monthly", "Last weekday of the month", "Every 2 months", "Quarterly", "Every 6 months", "Annually", "Every N months", "One-time"];
const FIN_AHEAD_MONTHS = 3;
const FIN_SYNC_SECONDS = 600;
// Bills and income work the same way; these name the parts that differ.
const FIN_KINDS = {
   bills:  { items: "bills",  entries: "entries",  id: "Bill ID",   paid: "Paid",     open: "Due" },
   income: { items: "income", entries: "deposits", id: "Income ID", paid: "Received", open: "Expected" }
};
const FIN_SCHEDULE_FIELDS = ["Frequency", "Every N Months", "Start Date", "Second Day", "End Date"];

function financialDef_() {
   // Bills are due; income is received (same fields, its own words).
   const scheduleFields = (word, noun) => [
      { name: "Amount", type: "money", required: true, hint: "Default amount for each one" },
      { name: "Frequency", type: "choice", options: FIN_FREQ, required: true, default: "Monthly" },
      { name: "Every N Months", type: "number", hint: "Only for “Every N months”" },
      { name: "Start Date", label: "First " + noun + " Date", type: "date", required: true, hint: "Sets the day it's " + word + " (e.g. the 15th). For “Last weekday of the month”, any day in the first month." },
      { name: "Second Day", label: "Second " + noun + " Day", type: "number", hint: "Only for “Twice a month”, e.g. 15" },
      { name: "End Date", label: "Last " + noun + " Date", type: "date", hint: "Blank = keeps going" }
   ];
   const entryFields = (ref, refLabel, statuses, dateLabel, paidLabel) => [
      { name: ref, label: refLabel, type: "ref", ref: ref === "Bill ID" ? "bills" : "income", required: true },
      { name: "Due Date", label: dateLabel, type: "date", required: true },
      { name: "Amount", type: "money", required: true },
      { name: "Status", type: "choice", options: statuses, required: true, default: statuses[1] },
      { name: "Paid Date", label: paidLabel, type: "date" }
   ];
   return {
      key: "financial",
      name: "Financial",
      areas: FIN_AREAS,
      tables: {
         bills: { tab: "Bills", label: "Bills", id: "Bill ID", prefix: "BIL-", kind: "record", area: "bills",
            title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true, hint: "e.g. AT&T (Cell Phone Service)" },
               { name: "Group", type: "list", list: "Group", required: true, default: "Expenses" },
               { name: "Category", type: "list", list: "Category" }
            ].concat(scheduleFields("due", "Due")).concat([
               { name: "Autopay", type: "bool", hint: "Marks itself paid on the due date" },
               { name: "Paid By", type: "list", list: "Person", default: "Chris" },
               { name: "Account ID", label: "Paid From", type: "ref", ref: "accounts" },
               { name: "Card ID", label: "Card", type: "ref", ref: "cards", hint: "Optional: which card on that account" },
               { name: "Loan ID", label: "Loan", type: "ref", ref: "loans", readOnly: true, hint: "Set by the loan: this is its payment bill" },
               { name: "Plan ID", label: "Saving Toward", type: "ref", ref: "plans", hint: "Payments add to this goal's saved amount" },
               { name: "Reminder", label: "Reminder task", type: "bool", hint: "A task for each payment (Tasks)" },
               { name: "Reminder To", type: "users", default: "USR-1", hint: "Each person gets a task; ticking any one marks the bill paid" },
               { name: "Reminder Days", label: "Days before due", type: "number", default: 3 },
               { name: "Notes", type: "longtext" }
            ]) },
         income: { tab: "Income", label: "Income", id: "Income ID", prefix: "INC-", kind: "record", area: "income",
            title: r => r["Name"],
            fields: [
               { name: "Name", label: "Source", type: "text", required: true, hint: "e.g. CVUSD – Chris" }
            ].concat(scheduleFields("received", "Received")).concat([
               { name: "Autopay", label: "Received automatically", type: "bool", hint: "Direct deposit: marks itself received on the date" },
               { name: "Account ID", label: "Deposited To", type: "ref", ref: "accounts" },
               { name: "Notes", type: "longtext" }
            ]) },
         entries: { tab: "Bill Entries", label: "Bill Entries", id: "Entry ID", prefix: "PAY-", kind: "record", area: "bills",
            title: (r, def) => finItemName_(def, "bills", r["Bill ID"]) + " " + vehNiceDate_(finIso_(r["Due Date"])),
            fields: entryFields("Bill ID", "Bill", ["Scheduled", "Due", "Paid", "Skipped"], "Due Date", "Paid Date").concat([
               { name: "Confirmation", type: "text" },
               { name: "Statement", label: "Statement / confirmation", type: "file" },
               { name: "Notes", type: "longtext" },
               { name: "Scheduled For", type: "date", readOnly: true },
               { name: "Reminder Task", type: "text", readOnly: true },
               { name: "Hockey Expense ID", type: "text", readOnly: true }
            ]) },
         deposits: { tab: "Income Entries", label: "Income Entries", id: "Entry ID", prefix: "DEP-", kind: "record", area: "income",
            title: (r, def) => finItemName_(def, "income", r["Income ID"]) + " " + vehNiceDate_(finIso_(r["Due Date"])),
            fields: entryFields("Income ID", "Income", ["Scheduled", "Expected", "Received", "Skipped"], "Expected Date", "Received Date").concat([
               { name: "Notes", type: "longtext" },
               { name: "Scheduled For", type: "date", readOnly: true }
            ]) },
         loans: { tab: "Loans", label: "Loans", id: "Loan ID", prefix: "LN-", kind: "record", area: "loans", addNew: true,
            title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true, hint: "e.g. Nissan (Rogue)" },
               { name: "Institution ID", label: "Lender", type: "ref", ref: "institutions" },
               { name: "Original Amount", type: "money", hint: "Amount borrowed" },
               { name: "Start Date", label: "Loan Start Date", type: "date" },
               { name: "Term Months", label: "Term (months)", type: "number", hint: "e.g. 72" },
               { name: "Interest Rate", label: "Interest rate (APR %)", type: "percent", hint: "Splits each payment into interest and principal" },
               { name: "Payment", type: "money", hint: "Blank = worked out from the amount, APR and term" },
               { name: "Payment Frequency", type: "choice", options: ["Monthly", "Every 2 weeks", "Weekly"], required: true, default: "Monthly" },
               { name: "First Payment Date", type: "date", hint: "With a payment amount, this makes the loan's payment bill" },
               { name: "Autopay", type: "bool" },
               { name: "Account ID", label: "Paid From", type: "ref", ref: "accounts" },
               { name: "Starting Balance", label: "Current Balance", type: "money", hint: "For a loan already under way (blank = the original amount)" },
               { name: "Balance Date", label: "Current Balance as of", type: "date" },
               { name: "Vehicle ID", label: "Vehicle", type: "text", hint: "Shows the loan on that vehicle (for people who can see Loans)" },
               { name: "Paid Off Date", type: "date" },
               { name: "Remaining", label: "Remaining balance", type: "money", readOnly: true },
               { name: "Bill ID", label: "Payment bill", type: "text", readOnly: true },
               { name: "Notes", type: "longtext" }
            ] },
         loanpays: { tab: "Loan Payments", label: "Loan Payments", id: "Loan Payment ID", prefix: "LNP-", kind: "record", area: "loans",
            title: r => r["Kind"] + " " + vehNiceDate_(finIso_(r["Date"])),
            fields: [
               { name: "Loan ID", label: "Loan", type: "ref", ref: "loans", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Kind", type: "choice", options: ["Extra payment", "Adjustment"], required: true, default: "Extra payment" },
               { name: "Amount", type: "money", required: true, hint: "Lowers the balance. For an adjustment, a negative amount raises it (fees, interest)." },
               { name: "Notes", type: "text" }
            ] },
         institutions: { tab: "Institutions", label: "Institutions", id: "Institution ID", prefix: "INS-", kind: "list", area: "accounts",
            unique: ["Name"], title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true, hint: "e.g. Capital One" },
               { name: "Type", type: "choice", options: ["Bank", "Credit Union", "Card Issuer", "Lender", "Investment", "Other"], required: true, default: "Bank" },
               { name: "Website", type: "url" },
               { name: "Phone", type: "text" },
               { name: "Notes", type: "longtext", hint: "No logins or passwords" }
            ] },
         accounts: { tab: "Accounts", label: "Accounts", id: "Account ID", prefix: "ACC-", kind: "list", area: "accounts",
            unique: ["Nickname"], title: r => r["Nickname"],
            fields: [
               { name: "Nickname", type: "text", required: true, hint: "e.g. Capital One Quicksilver" },
               { name: "Institution ID", label: "Institution", type: "ref", ref: "institutions", required: true },
               { name: "Kind", type: "choice", options: ["Checking", "Savings", "Credit Card", "Loan", "Retirement", "Other"], required: true, default: "Checking" },
               { name: "Owners", type: "users" },
               { name: "Account Last 4", label: "Account – last 4 digits", type: "text", digits: 4, inputmode: "numeric" },
               { name: "Credit Limit", type: "money", hint: "Credit cards" },
               { name: "Statement Day", type: "number", hint: "Day of the month the statement closes" },
               { name: "Payment Due Day", type: "number", hint: "Day of the month payment is due" },
               { name: "APR", label: "APR %", type: "percent" },
               { name: "Balance", type: "money", hint: "Optional, typed in by hand" },
               { name: "Balance Date", label: "Balance as of", type: "date" },
               { name: "Notes", type: "longtext", hint: "No full account numbers or passwords" }
            ] },
         cards: { tab: "Cards", label: "Cards", id: "Card ID", prefix: "CRD-", kind: "list", area: "accounts",
            unique: ["Account ID", "Last 4", "Cardholder"], title: r => (r["Network"] ? r["Network"] + " " : "") + "••" + r["Last 4"],
            fields: [
               { name: "Account ID", label: "Account", type: "ref", ref: "accounts", required: true },
               { name: "Cardholder", type: "user", required: true },
               { name: "Last 4", label: "Card – last 4 digits", type: "text", required: true, digits: 4, inputmode: "numeric" },
               { name: "Network", type: "choice", options: ["Visa", "Mastercard", "Amex", "Discover", "Other"] },
               { name: "Card Type", type: "choice", options: ["Credit", "Debit"], required: true, default: "Credit" },
               { name: "Status", type: "choice", options: ["Active", "Closed"], required: true, default: "Active" },
               { name: "Notes", type: "text" }
            ] },
         plans: { tab: "Plans", label: "Plan / Save For", id: "Plan ID", prefix: "PLN-", kind: "record", area: "plans", addNew: true,
            title: r => r["Goal"],
            fields: [
               { name: "Goal", type: "text", required: true, hint: "e.g. Disneyland passes" },
               { name: "Target Amount", type: "money", hint: "Blank = the chosen option's total" },
               { name: "Target Date", type: "date" },
               { name: "Starting Saved", label: "Saved before tracking", type: "money" },
               { name: "Monthly Contribution", type: "money" },
               { name: "Transfer On", label: "Automatic transfer", type: "bool", hint: "Adds to Saved to date by itself on each transfer date" },
               { name: "Transfer Amount", type: "money" },
               { name: "Transfer Frequency", type: "choice", options: FIN_FREQ.filter(f => ["One-time", "Twice a month", "Every N months"].indexOf(f) === -1), default: "Monthly" },
               { name: "First Transfer Date", type: "date" },
               { name: "Transfer Account ID", label: "Transfer From", type: "ref", ref: "accounts" },
               { name: "Status", type: "choice", options: ["Active", "Reached", "Cancelled"], required: true, default: "Active" },
               { name: "Bill ID", label: "Transfer bill", type: "text", readOnly: true },
               { name: "Notes", type: "longtext" }
            ] },
         options: { tab: "Plan Options", label: "Plan Options", id: "Option ID", prefix: "OPT-", kind: "record", area: "plans", hardDelete: true,
            title: r => r["Option"],
            fields: [
               { name: "Plan ID", label: "Plan", type: "ref", ref: "plans", required: true },
               { name: "Option", type: "text", required: true, hint: "e.g. Signature (1) Deluxe (4)" },
               { name: "Chosen", type: "bool" },
               { name: "Total", type: "money", readOnly: true },
               { name: "Notes", type: "longtext" }
            ] },
         optlines: { tab: "Option Lines", label: "Option Lines", id: "Line ID", prefix: "OPL-", kind: "record", area: "plans", hardDelete: true,
            title: r => r["Item"],
            fields: [
               { name: "Option ID", label: "Option", type: "ref", ref: "options", required: true },
               { name: "Item", type: "text", required: true },
               { name: "Price", type: "money" },
               { name: "Quantity", type: "number", default: 1 },
               { name: "Sort", type: "number" }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "bills",
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Group", "Category", "Person"],
      beforeSave: finBeforeSave_,
      afterSave: finAfterSave_,
      afterDelete: finAfterDelete_,
      actions: {
         load:        { fn: finLoad_ },
         report:      { fn: finReportAction_ },
         file:        { fn: finFile_ },
         mark:        { fn: finMark_, write: true },
         setDays:     { fn: finSetDays_, write: true },
         upload:      { fn: finUpload_, write: true },
         clearFile:   { fn: finClearFile_, write: true },
         saveOption:  { fn: finSaveOption_, write: true },
         toHockey:    { fn: finToHockey_, write: true },
         sync:        { fn: finSyncAction_, write: true }
      }
   };
}

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
const finIso_ = v => vehIso_(v);
const finRound_ = n => Math.round((Number(n) || 0) * 100) / 100;
const finMoney_ = n => "$" + finRound_(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const finKindOfEntries_ = table => table === "deposits" ? FIN_KINDS.income : FIN_KINDS.bills;
const finUnpaid_ = e => e["Status"] === "Scheduled" || e["Status"] === "Due" || e["Status"] === "Expected";
function finItemName_(def, table, id) { const r = vehFind_(def, table, id); return r ? r["Name"] : id || ""; }
function finTasksOn_() { return typeof tasksActive_ === "function" && tasksActive_(); }
function finActive_() {
   const m = coreModules_().find(x => x.key === "financial");
   return !!(m && m.status === "Active" && m.spreadsheetId);
}
// Writes the app makes on its own (schedules, status on the due date): no Change Log line each.
function finSys_(def, table, row, values) {
   coreWriteChanges_(modSheet_(def, def.tables[table]), row._row, row, Object.assign({}, values, { "Updated At": new Date() }));
}

// ------------------------------------------------------------
// Schedules
// ------------------------------------------------------------
function finStepMonths_(it) {
   switch (it["Frequency"]) {
      case "Monthly": return 1;
      case "Every 2 months": return 2;
      case "Quarterly": return 3;
      case "Every 6 months": return 6;
      case "Annually": return 12;
      case "Every N months": return Math.max(1, Math.round(Number(it["Every N Months"]) || 1));
   }
   return 0;
}
// How many times a month it comes round (for loan payments and the plan contribution).
function finPerMonth_(it) {
   switch (it["Frequency"]) {
      case "Weekly": return 52 / 12;
      case "Every 2 weeks": return 26 / 12;
      case "Twice a month": return 2;
      case "Last weekday of the month": return 1;
      case "One-time": return 0;
   }
   const s = finStepMonths_(it);
   return s ? 1 / s : 0;
}
// Calls fn(date) for each due date in order, from the first, until fn returns false.
function finEach_(it, fn) {
   const start = finIso_(it["Start Date"]);
   if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
   const end = finIso_(it["End Date"]) || "9999-12-31";
   const f = it["Frequency"];
   const go = d => d <= end && fn(d) !== false;
   if (f === "One-time") { go(start); return; }
   if (f === "Weekly" || f === "Every 2 weeks") {
      const step = f === "Weekly" ? 7 : 14;
      for (let k = 0; k < 6000; k++) if (!go(vehAddDays_(start, k * step))) return;
      return;
   }
   if (f === "Last weekday of the month") {
      for (let k = 0; k < 2400; k++) {
         const first = vehAddMonths_(start.slice(0, 8) + "01", k);
         const d = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0));   // last day of the month
         while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
         const iso = first.slice(0, 8) + String(d.getUTCDate()).padStart(2, "0");
         if (iso < start) continue;
         if (!go(iso)) return;
      }
      return;
   }
   if (f === "Twice a month") {
      const d1 = +start.slice(8, 10), d2 = Math.round(Number(it["Second Day"]) || 0);
      for (let k = 0; k < 2400; k++) {
         const first = vehAddMonths_(start.slice(0, 8) + "01", k);
         const last = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0)).getUTCDate();
         const days = [d1].concat(d2 >= 1 && d2 <= 31 ? [d2] : []).map(x => Math.min(x, last))
            .filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
         for (let i = 0; i < days.length; i++) {
            const d = first.slice(0, 8) + String(days[i]).padStart(2, "0");
            if (d < start) continue;
            if (!go(d)) return;
         }
      }
      return;
   }
   const step = finStepMonths_(it) || 1;
   for (let k = 0; k < 2400; k++) if (!go(vehAddMonths_(start, k * step))) return;
}
// Days after the last entry that already happened before a new one can fall (most of a period, so a
// changed due day doesn't bill the same month twice).
function finMinGap_(it) {
   const f = it["Frequency"];
   if (f === "One-time") return 100000;
   if (f === "Twice a month") return 1;
   const days = f === "Weekly" ? 7 : f === "Every 2 weeks" ? 14 : (finStepMonths_(it) || 1) * 30.44;
   return Math.max(1, Math.floor(days * 0.8));
}
function finOccurrences_(it, from, to) {
   const out = [];
   finEach_(it, d => { if (d > to) return false; if (d >= from) out.push(d); });
   return out;
}
function finNextAfter_(it, after) {
   let next = "";
   finEach_(it, d => { if (d > after) { next = d; return false; } });
   return next;
}
// Entries are made from the first of the month the bill was added (or its first due date, if later):
// adding a long-running bill doesn't fill in years of history. (Old history comes in by import.)
function finTrackFrom_(it) {
   const start = finIso_(it["Start Date"]);
   if (!start) return "";
   const added = String(it["Added At"] || "").slice(0, 7);
   const from = /^\d{4}-\d{2}$/.test(added) ? added + "-01" : start;
   return start > from ? start : from;
}

// Makes the missing entries for bills or income (all, or one item) and turns Scheduled entries
// whose date has come into Paid / Received (automatic) or Due / Expected. Returns the entry IDs touched.
function finSyncKind_(def, kind, user, onlyId) {
   const K = FIN_KINDS[kind];
   const today = vehToday_(), horizon = vehAddMonths_(today, FIN_AHEAD_MONTHS);
   const items = modRows_(def, K.items).filter(it => !onlyId || it[K.id] === onlyId);
   const have = {}, kept = {};
   modRows_(def, K.entries, true).forEach(e => {
      const d = finIso_(e["Scheduled For"]) || finIso_(e["Due Date"]);
      have[e[K.id] + "|" + d] = true;
      // Entries that already happened (paid, due, skipped) end the old schedule: a changed schedule
      // picks up after the latest of them (see finMinGap_), so a month isn't billed twice.
      if (e["Status"] !== "Scheduled" && (!kept[e[K.id]] || d > kept[e[K.id]])) kept[e[K.id]] = d;
   });
   const add = [];
   items.forEach(it => {
      let from = finTrackFrom_(it);
      if (!from) return;
      if (kept[it[K.id]]) { const next = vehAddDays_(kept[it[K.id]], finMinGap_(it)); if (next > from) from = next; }
      const dates = finOccurrences_(it, from, horizon);
      if (!dates.some(d => d > today)) { const nx = finNextAfter_(it, today > horizon ? today : horizon); if (nx) dates.push(nx); }
      const auto = it["Autopay"] === true;
      dates.forEach(d => {
         const k = it[K.id] + "|" + d;
         if (have[k]) return;
         have[k] = true;
         const past = d <= today;
         add.push({ [K.id]: it[K.id], "Due Date": coreDate_(d), "Scheduled For": coreDate_(d), "Amount": finRound_(it["Amount"]),
                    "Status": past ? (auto ? K.paid : K.open) : "Scheduled", "Paid Date": past && auto ? coreDate_(d) : "" });
      });
   });
   const touched = add.length ? modBulkInsert_(def, K.entries, add, user) : [];
   const byId = {};
   modRows_(def, K.items, true).forEach(it => byId[it[K.id]] = it);
   let flipped = 0;
   modRows_(def, K.entries).forEach(e => {
      if (e["Status"] !== "Scheduled" || !e["Due Date"] || e["Due Date"] > today || (onlyId && e[K.id] !== onlyId)) return;
      const it = byId[e[K.id]], auto = !!(it && it["Autopay"] === true);
      finSys_(def, K.entries, e, auto ? { "Status": K.paid, "Paid Date": coreDate_(e["Due Date"]) } : { "Status": K.open });
      touched.push(e["Entry ID"]); flipped++;
   });
   if (flipped) modForget_(def, K.entries);
   if (add.length) modLog_(def, user, "Add", def.tables[K.entries].label, onlyId ? modTitle_(def, def.tables[K.items], byId[onlyId] || {}) : "Schedule", add.length + (add.length === 1 ? " entry" : " entries") + " scheduled");
   return touched;
}

// Takes off a bill's or income's entries that haven't happened yet (Scheduled; with includeOpen also
// Due / Expected), so the schedule can be made again. Their reminder tasks come off the task list.
function finClearUpcoming_(def, kind, itemId, user, includeOpen) {
   const K = FIN_KINDS[kind];
   const gone = modRows_(def, K.entries, true).filter(e => e[K.id] === itemId && !e["Deleted"] &&
      (e["Status"] === "Scheduled" || (includeOpen && e["Status"] === K.open))).sort((a, b) => b._row - a._row);
   gone.forEach(e => {
      if (kind === "bills" && e["Reminder Task"] && finTasksOn_()) { try { finRemoveReminders_(e["Entry ID"], user); } catch (err) { console.warn(err); } }
      modRemoveRow_(def, K.entries, e);
   });
   return gone.length;
}

// Everything due: entries for every bill and income source, reminder tasks, loan balances.
function finSyncAll_(def, user) {
   const billIds = finSyncKind_(def, "bills", user);
   finSyncKind_(def, "income", user);
   finRemind_(def, billIds, user);
   finUpdateLoans_(def);
}
// Load runs the schedule at most every 10 minutes (and always after a bill or income change).
function finMaybeSync_(def, user) {
   const cache = CacheService.getScriptCache(), key = "fin_sync_" + vehToday_();
   if (cache.get(key)) return;
   coreWrite_(() => finSyncAll_(def, user));
   cache.put(key, "1", FIN_SYNC_SECONDS);
   MOD_ROWS = {};
}
function finSyncAction_(req, user) {
   coreRequire_(user, "financial", "bills", "view");
   finSyncAll_(financialDef_(), user);
   CacheService.getScriptCache().put("fin_sync_" + vehToday_(), "1", FIN_SYNC_SECONDS);
   return { synced: true };
}

// ------------------------------------------------------------
// Reminder tasks (Tasks module): one per unpaid entry of a bill with "Reminder task" ticked
// ------------------------------------------------------------
function finReminderPeople_(bill) {
   return String((bill && bill["Reminder To"]) || "USR-1").split(",").map(x => x.trim()).filter(Boolean);
}
// Takes an entry's reminder tasks off the task list (every person, and the older one-task key).
function finRemoveReminders_(entryId, user, keep) {
   if (!finTasksOn_()) return;
   const base = "financial:" + entryId;
   tasksUpsertAuto_(base, null, user);
   coreGetUsers_(true).forEach(u => { if (!keep || keep.indexOf(u.id) === -1) tasksUpsertAuto_(base + ":" + u.id, null, user); });
}
// One task per reminder person for each unpaid entry ("financial:<entry>:<person>"). Paid = every task done.
function finReminder_(def, e, bill, user) {
   if (!finTasksOn_() || !e) return;
   const base = "financial:" + e["Entry ID"];
   try {
      const want = bill && bill["Reminder"] === true && !bill["Deleted"] && !e["Deleted"] && e["Status"] !== "Skipped";
      if (!want) {
         if (e["Reminder Task"]) { finRemoveReminders_(e["Entry ID"], user); finSys_(def, "entries", e, { "Reminder Task": "" }); }
         return;
      }
      if (!finUnpaid_(e) && !e["Reminder Task"]) return;   // already paid before a task was made
      const people = finReminderPeople_(bill);
      const days = bill["Reminder Days"] === "" || bill["Reminder Days"] === undefined ? 3 : Math.max(0, Number(bill["Reminder Days"]) || 0);
      const due = finIso_(e["Due Date"]);
      finRemoveReminders_(e["Entry ID"], user, people);   // anyone taken off the reminder (and the older one-task key)
      const ids = people.map(p => tasksUpsertAuto_(base + ":" + p, {
         "Title": "Pay " + bill["Name"] + " · " + finMoney_(e["Amount"]),
         "Notes": "Due " + vehNiceDate_(due) + (bill["Autopay"] === true ? " (autopay)" : "") + ". From Financial: " + e["Entry ID"] + " · " + bill["Bill ID"] + " " + bill["Name"] + "." +
            (people.length > 1 ? " Ticking any one of these tasks marks it paid." : ""),
         "Assigned To": p, "Due Date": vehAddDays_(due, -days), "Category": "Financial",
         "Source": "Financial " + bill["Bill ID"], "Done": !finUnpaid_(e)
      }, user)).filter(Boolean);
      const tids = ids.join(",");
      if (tids !== String(e["Reminder Task"] || "")) finSys_(def, "entries", e, { "Reminder Task": tids });
   } catch (err) { console.warn("Reminder task not updated: " + err); }
}
// Reminders for some entries (by ID) or for every entry of one bill.
function finRemind_(def, entryIds, user, billId) {
   if (!finTasksOn_()) return;
   const want = {}; (entryIds || []).forEach(id => want[id] = true);
   modForget_(def, "entries");
   const bills = {}; modRows_(def, "bills", true).forEach(b => bills[b["Bill ID"]] = b);
   modRows_(def, "entries", true).filter(e => billId ? e["Bill ID"] === billId && (finUnpaid_(e) || e["Reminder Task"]) : want[e["Entry ID"]])
      .forEach(e => { const b = bills[e["Bill ID"]]; if (b && (b["Reminder"] === true || e["Reminder Task"])) finReminder_(def, e, b, user); });
   modForget_(def, "entries");
}
// Called by Tasks when a reminder task is ticked done: the bill entry is marked paid (today), and the
// other people's reminder tasks for it are completed too.
function finTaskDone_(key, user) {
   const entryId = String(key).split(":")[0];
   const def = financialDef_();
   const e = modRows_(def, "entries").find(x => x["Entry ID"] === entryId);
   if (!e || !finUnpaid_(e)) return;
   modChange_(def, "entries", e, { "Status": "Paid", "Paid Date": coreDate_(vehToday_()) }, user, "Paid (task done)");
   modForget_(def, "entries");
   const fresh = modRows_(def, "entries").find(x => x["Entry ID"] === entryId);
   finReminder_(def, fresh, vehFind_(def, "bills", e["Bill ID"]), user);
}

// ------------------------------------------------------------
// Save rules
// ------------------------------------------------------------
function finBeforeSave_(tableKey, values, before, user, req) {
   const def = financialDef_();
   const merged = Object.assign({}, before || {}, values);
   const norm = v => v instanceof Date ? finIso_(v) : String(v === undefined || v === null ? "" : v);
   const changed = n => n in values && (before ? norm(values[n]) !== norm(before[n]) : values[n] !== "");
   if (tableKey === "bills" || tableKey === "income") {
      const f = merged["Frequency"];
      if (f === "Every N months") {
         const n = Number(merged["Every N Months"]);
         if (!(n >= 1 && n === Math.round(n))) throw coreError_("INVALID", "Every N months: enter how many months (a whole number).");
      } else if ("Every N Months" in values) values["Every N Months"] = "";
      if (f === "Twice a month") {
         const d2 = Number(merged["Second Day"]), d1 = +finIso_(merged["Start Date"]).slice(8, 10);
         if (!(d2 >= 1 && d2 <= 31 && d2 === Math.round(d2))) throw coreError_("INVALID", "Twice a month: enter the second due day (1–31).");
         if (d2 === d1) throw coreError_("INVALID", "The second due day is the same as the first one's day.");
      } else if ("Second Day" in values) values["Second Day"] = "";
      if (merged["End Date"] && merged["Start Date"] && finIso_(merged["End Date"]) < finIso_(merged["Start Date"])) throw coreError_("INVALID", "The last due date is before the first one.");
      if (tableKey === "bills" && "Reminder Days" in values && values["Reminder Days"] !== "") {
         const d = Number(values["Reminder Days"]);
         if (!(d >= 0 && d <= 60 && d === Math.round(d))) throw coreError_("INVALID", "Days before due must be a whole number from 0 to 60.");
      }
      // A new default amount: ask whether upcoming unpaid entries change too.
      if (before && "Amount" in values && finRound_(values["Amount"]) !== finRound_(before["Amount"])) {
         const K = FIN_KINDS[tableKey];
         const open = modRows_(def, K.entries).filter(e => e[K.id] === before[K.id] && finUnpaid_(e) && finRound_(e["Amount"]) !== finRound_(values["Amount"]));
         if (open.length && req && req.updateFuture === undefined) {
            throw coreError_("CONFIRM", "Update " + open.length + " upcoming unpaid " + (open.length === 1 ? "entry" : "entries") + " too?", {
               confirm: { kind: "finAmount", count: open.length, from: finRound_(before["Amount"]), to: finRound_(values["Amount"]), name: before["Name"] }
            });
         }
         if (req) req._finAmount = req.updateFuture ? open : [];
      }
      if (req && before) req._finSchedule = FIN_SCHEDULE_FIELDS.some(changed);
   }
   if (tableKey === "entries" || tableKey === "deposits") {
      const K = finKindOfEntries_(tableKey);
      if ("Status" in values) {
         if (values["Status"] === K.paid && !merged["Paid Date"]) values["Paid Date"] = coreDate_(vehToday_());
         if (values["Status"] !== K.paid) values["Paid Date"] = "";
      }
      if (!before && !("Scheduled For" in values)) values["Scheduled For"] = values["Due Date"];
   }
   const last4 = n => { if (n in values && values[n] !== "" && !/^\d{4}$/.test(String(values[n]))) throw coreError_("INVALID", "Only the last 4 digits can be saved (no full card or account numbers)."); };
   const dayOfMonth = n => { if (n in values && values[n] !== "") { const d = Number(values[n]); if (!(d >= 1 && d <= 31 && d === Math.round(d))) throw coreError_("INVALID", n + " must be a day of the month (1–31)."); } };
   if (tableKey === "accounts") { last4("Account Last 4"); dayOfMonth("Statement Day"); dayOfMonth("Payment Due Day"); }
   if (tableKey === "cards") last4("Last 4");
   if (tableKey === "bills" && merged["Card ID"]) {
      const card = vehFind_(def, "cards", merged["Card ID"]);
      if (card && merged["Account ID"] && card["Account ID"] !== merged["Account ID"]) throw coreError_("INVALID", "That card isn't on the Paid From account.");
      if (card && !merged["Account ID"]) values["Account ID"] = card["Account ID"];
   }
   if (tableKey === "loans") {
      const has = n => merged[n] !== "" && merged[n] !== undefined && merged[n] !== null;
      if (!has("Original Amount") && !has("Starting Balance")) throw coreError_("INVALID", "Enter the original amount, or the current balance for a loan already under way.");
      if (has("Starting Balance") && !has("Balance Date")) throw coreError_("INVALID", "Enter the date of the current balance.");
      if (has("Term Months")) { const n = Number(merged["Term Months"]); if (!(n >= 1 && n <= 600 && n === Math.round(n))) throw coreError_("INVALID", "Term must be a whole number of months."); }
      if (!has("Payment")) { const p = finLoanPayment_(merged); if (p) values["Payment"] = p; }
   }
   if (tableKey === "plans" && merged["Transfer On"] === true) {
      if (!(finRound_(merged["Transfer Amount"]) > 0) || !merged["First Transfer Date"] || !merged["Transfer Frequency"]) throw coreError_("INVALID", "For an automatic transfer, enter the amount, how often and the first transfer date.");
   }
   if (tableKey === "loans" && "Vehicle ID" in values && values["Vehicle ID"] !== "" && !/^VEH-\d+$/.test(String(values["Vehicle ID"]))) {
      throw coreError_("INVALID", "Pick the vehicle from the list.");
   }
   if (tableKey === "optlines" && "Quantity" in values && values["Quantity"] === "") values["Quantity"] = 1;
   return values;
}

function finAfterSave_(tableKey, id, values, before, user, req) {
   const def = financialDef_();
   if (tableKey === "bills" || tableKey === "income") {
      const K = FIN_KINDS[tableKey];
      (req && req._finAmount || []).forEach(e => modChange_(def, K.entries, e, { "Amount": finRound_(values["Amount"]) }, user, "New default amount"));
      if (req && req._finSchedule) finClearUpcoming_(def, tableKey, id, user, false);
      modForget_(def, K.entries); modForget_(def, K.items);
      const touched = finSyncKind_(def, tableKey, user, id);
      if (tableKey === "bills") finRemind_(def, touched, user, id);
      return;
   }
   if (tableKey === "entries") {
      modForget_(def, "entries");
      const e = modRows_(def, "entries").find(x => x["Entry ID"] === id);
      if (e) finReminder_(def, e, vehFind_(def, "bills", e["Bill ID"]), user);
   }
   if (tableKey === "loans") finLoanBill_(def, id, user);
   if (tableKey === "plans") finPlanBill_(def, id, user);
}

function finAfterDelete_(tableKey, row, user) {
   const def = financialDef_();
   if (tableKey === "bills" || tableKey === "income") finClearUpcoming_(def, tableKey, row[FIN_KINDS[tableKey].id], user, true);
   if (tableKey === "entries" && row["Reminder Task"] && finTasksOn_()) {
      try { finRemoveReminders_(row["Entry ID"], user); } catch (e) { console.warn(e); }
   }
   if ((tableKey === "loans" || tableKey === "plans") && row["Bill ID"]) {
      const bill = modRows_(def, "bills").find(b => b["Bill ID"] === row["Bill ID"]);
      if (bill) finRetireBill_(def, bill, user);
   }
   if (tableKey === "options") {
      modRows_(def, "optlines").filter(l => l["Option ID"] === row["Option ID"]).sort((a, b) => b._row - a._row)
         .forEach(l => modRemoveRow_(def, "optlines", l));
   }
}

// ------------------------------------------------------------
// Loans, plans
// ------------------------------------------------------------
// Payments a year for a loan's payment frequency.
const finPpy_ = f => ({ "Every 2 weeks": 26, "Weekly": 52 }[f] || 12);
// Payment worked out from amount, APR and term (standard loan payment); "" when it can't be.
function finLoanPayment_(l) {
   const amt = Number(l["Original Amount"] !== "" && l["Original Amount"] !== undefined ? l["Original Amount"] : l["Starting Balance"]) || 0;
   const months = Number(l["Term Months"]) || 0;
   if (!(amt > 0) || !(months > 0)) return "";
   const ppy = finPpy_(l["Payment Frequency"]), n = Math.round(months * ppy / 12), r = (Number(l["Interest Rate"]) || 0) / 100 / ppy;
   return finRound_(r > 0 ? amt * r / (1 - Math.pow(1 + r, -n)) : amt / n);
}
// The date of the nth payment from the first one (for the payment bill's last due date).
function finNthDate_(first, freq, n) {
   let k = 0, out = "";
   finEach_({ "Start Date": first, "Frequency": freq }, d => { k++; if (k >= n) { out = d; return false; } });
   return out;
}
// Soft-deletes a bill made by a loan or goal (its unpaid entries and reminders come off; paid ones stay).
function finRetireBill_(def, bill, user) {
   modChange_(def, "bills", bill, { "Deleted": true, "Deleted By": user.id, "Deleted At": new Date() }, user, "Soft delete");
   finClearUpcoming_(def, "bills", bill["Bill ID"], user, true);
}
// Adds or changes a bill made for a loan or a goal, then makes its schedule.
function finUpsertOwnedBill_(def, ownerTable, owner, values, user) {
   const bill = owner["Bill ID"] ? modRows_(def, "bills").find(b => b["Bill ID"] === owner["Bill ID"]) : null;
   if (!bill) {
      const groups = modListValues_(def, "Group").map(v => v.value), cats = modListValues_(def, "Category").map(v => v.value);
      values["Group"] = groups.indexOf(values["Group"]) !== -1 ? values["Group"] : (groups[0] || "Expenses");
      if (cats.indexOf(values["Category"]) === -1) values["Category"] = "";
      values["Paid By"] = "Chris"; values["Reminder"] = false; values["Reminder To"] = "USR-1"; values["Reminder Days"] = 3;
      const id = modInsert_(def, "bills", values, user);
      coreWriteChanges_(modSheet_(def, def.tables[ownerTable]), owner._row, owner, { "Bill ID": id });
      modForget_(def, ownerTable);
      finAfterSave_("bills", id, values, null, user, {});
      return id;
   }
   const req = { updateFuture: true };
   const v = finBeforeSave_("bills", Object.assign({}, values), bill, user, req);
   modChange_(def, "bills", bill, v, user, "Kept in step with " + owner[def.tables[ownerTable].id]);
   finAfterSave_("bills", bill["Bill ID"], v, bill, user, req);
   return bill["Bill ID"];
}
// A loan with a payment and first payment date has its own payment bill (Expenses › Loan).
function finLoanBill_(def, loanId, user) {
   modForget_(def, "loans");
   const loan = modRows_(def, "loans").find(l => l["Loan ID"] === loanId);
   if (!loan) return;
   const pay = finRound_(loan["Payment"]), first = finIso_(loan["First Payment Date"]);
   if (!(pay > 0) || !first) {
      const old = loan["Bill ID"] ? modRows_(def, "bills").find(b => b["Bill ID"] === loan["Bill ID"]) : null;
      if (old) finRetireBill_(def, old, user);
      if (loan["Bill ID"]) coreWriteChanges_(modSheet_(def, def.tables.loans), loan._row, loan, { "Bill ID": "" });
      return;
   }
   const freq = loan["Payment Frequency"] || "Monthly";
   let end = "";
   if (Number(loan["Term Months"]) > 0) end = finNthDate_(first, freq, Math.round(Number(loan["Term Months"]) * finPpy_(freq) / 12));
   const off = finIso_(loan["Paid Off Date"]);
   if (off && (!end || off < end)) end = off < first ? first : off;
   finUpsertOwnedBill_(def, "loans", loan, {
      "Name": loan["Name"] + " payment", "Group": "Expenses", "Category": "Loan", "Amount": pay, "Frequency": freq,
      "Start Date": coreDate_(first), "End Date": end ? coreDate_(end) : "", "Autopay": loan["Autopay"] === true,
      "Account ID": loan["Account ID"] || "", "Loan ID": loanId
   }, user);
}
// A goal with an automatic transfer has its own savings bill (on autopay), so each transfer adds to Saved to date.
function finPlanBill_(def, planId, user) {
   modForget_(def, "plans");
   const p = modRows_(def, "plans").find(x => x["Plan ID"] === planId);
   if (!p) return;
   const on = p["Transfer On"] === true && p["Status"] === "Active" && finRound_(p["Transfer Amount"]) > 0 && finIso_(p["First Transfer Date"]);
   if (!on) {
      const old = p["Bill ID"] ? modRows_(def, "bills").find(b => b["Bill ID"] === p["Bill ID"]) : null;
      if (old) finRetireBill_(def, old, user);
      if (p["Bill ID"]) coreWriteChanges_(modSheet_(def, def.tables.plans), p._row, p, { "Bill ID": "" });
      return;
   }
   finUpsertOwnedBill_(def, "plans", p, {
      "Name": p["Goal"] + " (automatic transfer)", "Group": "Savings", "Category": "Savings", "Amount": finRound_(p["Transfer Amount"]),
      "Frequency": p["Transfer Frequency"] || "Monthly", "Start Date": coreDate_(finIso_(p["First Transfer Date"])), "End Date": "",
      "Autopay": true, "Account ID": p["Transfer Account ID"] || "", "Plan ID": planId
   }, user);
}

function finLoanStatus_(loan, bills, entries, pays, today) {
   const lid = loan["Loan ID"];
   // A loan already under way counts from its current balance; otherwise from the original amount.
   const cur = loan["Starting Balance"] !== "" && loan["Starting Balance"] !== undefined && loan["Starting Balance"] !== null;
   const start = finRound_(cur ? loan["Starting Balance"] : loan["Original Amount"]);
   const from = finIso_(cur ? loan["Balance Date"] : (loan["Start Date"] || loan["First Payment Date"])) || "0000-00-00";
   const linked = bills.filter(b => b["Loan ID"] === lid && !b["Deleted"]);
   const ids = {}; bills.filter(b => b["Loan ID"] === lid).forEach(b => ids[b["Bill ID"]] = true);
   const paid = entries.filter(e => ids[e["Bill ID"]] && e["Status"] === "Paid" && (finIso_(e["Paid Date"]) || finIso_(e["Due Date"])) >= from);
   const extra = pays.filter(p => p["Loan ID"] === lid && finIso_(p["Date"]) >= from);
   // With an APR, each regular payment pays the period's interest first; extra payments are all principal.
   const rate = Number(loan["Interest Rate"]) || 0, ppy = finPpy_(loan["Payment Frequency"]);
   const events = paid.map(e => ({ d: finIso_(e["Paid Date"]) || finIso_(e["Due Date"]), a: Number(e["Amount"]) || 0, reg: true }))
      .concat(extra.map(p => ({ d: finIso_(p["Date"]), a: Number(p["Amount"]) || 0, reg: false })))
      .sort((a, b) => a.d.localeCompare(b.d) || (b.reg - a.reg));
   let bal = start, interest = 0;
   events.forEach(ev => {
      if (ev.reg && rate > 0 && bal > 0) { const i = finRound_(bal * rate / 100 / ppy); interest += i; bal = finRound_(bal - (ev.a - i)); }
      else bal = finRound_(bal - ev.a);
   });
   const remaining = finRound_(bal), done = finRound_(start - bal);
   const monthly = finRound_(linked.filter(b => !b["End Date"] || finIso_(b["End Date"]) >= today).reduce((s, b) => s + (Number(b["Amount"]) || 0) * finPerMonth_(b), 0));
   const o = { id: lid, start: start, paid: done, interest: finRound_(interest), original: finRound_(loan["Original Amount"]), from: from,
               remaining: Math.max(0, remaining), progress: start > 0 ? Math.min(1, Math.max(0, done / start)) : 0,
               monthly: monthly, months: null, payoff: "", basis: "", bills: linked.map(b => b["Bill ID"]) };
   if (remaining <= 0 || loan["Paid Off Date"]) { o.basis = "done"; o.remaining = Math.max(0, remaining); o.progress = 1; return o; }
   if (monthly <= 0) { o.basis = "none"; return o; }
   if (rate > 0) {
      let bal = remaining, n = 0;
      const r = rate / 1200;
      if (monthly <= bal * r) { o.basis = "never"; return o; }
      while (bal > 0.005 && n < 1200) { bal = bal * (1 + r) - monthly; n++; }
      o.months = n; o.basis = "rate";
   } else { o.months = Math.ceil(remaining / monthly - 1e-9); o.basis = "simple"; }
   o.payoff = vehAddMonths_(today, o.months).slice(0, 7);
   return o;
}
function finLoanAll_(def, today) {
   const bills = modRows_(def, "bills", true), entries = modRows_(def, "entries"), pays = modRows_(def, "loanpays");
   const out = {};
   modRows_(def, "loans").forEach(l => out[l["Loan ID"]] = finLoanStatus_(l, bills, entries, pays, today));
   return out;
}
// Keeps the sheet's Remaining column up to date (for anyone reading the sheet itself).
function finUpdateLoans_(def) {
   const st = finLoanAll_(def, vehToday_());
   let n = 0;
   modRows_(def, "loans").forEach(l => {
      const s = st[l["Loan ID"]];
      if (s && (l["Remaining"] === "" || finRound_(l["Remaining"]) !== s.remaining)) { coreWriteChanges_(modSheet_(def, def.tables.loans), l._row, l, { "Remaining": s.remaining }); n++; }
   });
   if (n) modForget_(def, "loans");
}

function finPlanStatus_(def, today) {
   const bills = modRows_(def, "bills", true), entries = modRows_(def, "entries");
   const options = modRows_(def, "options");
   const out = {};
   modRows_(def, "plans").forEach(p => {
      const pid = p["Plan ID"];
      const ids = {}; bills.filter(b => b["Plan ID"] === pid).forEach(b => ids[b["Bill ID"]] = true);
      const contrib = finRound_(entries.filter(e => ids[e["Bill ID"]] && e["Status"] === "Paid").reduce((s, e) => s + (Number(e["Amount"]) || 0), 0));
      const saved = finRound_((Number(p["Starting Saved"]) || 0) + contrib);
      const chosen = options.find(o => o["Plan ID"] === pid && o["Chosen"] === true);
      const target = p["Target Amount"] !== "" && p["Target Amount"] !== undefined ? finRound_(p["Target Amount"]) : chosen ? finRound_(chosen["Total"]) : null;
      const td = finIso_(p["Target Date"]);
      const monthsLeft = td ? Math.max(1, Math.ceil(vehDaysBetween_(today, td) / 30.4375)) : null;
      out[pid] = { saved: saved, contributions: contrib, target: target, chosen: chosen ? chosen["Option ID"] : "", monthsLeft: monthsLeft, pastDate: !!(td && td < today),
         needed: target !== null && monthsLeft ? finRound_(Math.max(0, target - saved) / monthsLeft) : null,
         progress: target ? Math.min(1, saved / target) : 0, bills: Object.keys(ids) };
   });
   return out;
}

// ------------------------------------------------------------
// Report: the month grid for a calendar year
// ------------------------------------------------------------
function finReport_(def, year) {
   year = Math.round(Number(year)) || +vehToday_().slice(0, 4);
   const months = []; for (let i = 1; i <= 12; i++) months.push(year + "-" + String(i).padStart(2, "0"));
   const sum = a => finRound_(a.reduce((s, x) => s + x, 0));
   const zeros = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
   const rowsFor = kind => {
      const K = FIN_KINDS[kind];
      const allEntries = modRows_(def, K.entries, true);
      const last = {};
      allEntries.forEach(e => { const d = finIso_(e["Scheduled For"]) || finIso_(e["Due Date"]); if (!last[e[K.id]] || d > last[e[K.id]]) last[e[K.id]] = d; });
      const items = modRows_(def, K.items, true);
      return items.map(it => {
         const cells = zeros(), proj = zeros().map(() => false);
         allEntries.filter(e => e[K.id] === it[K.id] && !e["Deleted"] && e["Status"] !== "Skipped" && String(e["Due Date"]).slice(0, 4) === String(year))
            .forEach(e => { cells[+String(e["Due Date"]).slice(5, 7) - 1] += Number(e["Amount"]) || 0; });
         if (!it["Deleted"]) {
            const track = finTrackFrom_(it);
            let from = year + "-01-01";
            if (track > from) from = track;
            if (last[it[K.id]] && vehAddDays_(last[it[K.id]], 1) > from) from = vehAddDays_(last[it[K.id]], 1);
            finOccurrences_(it, from, year + "-12-31").forEach(d => { const m = +d.slice(5, 7) - 1; cells[m] += Number(it["Amount"]) || 0; proj[m] = true; });
         }
         return { id: it[K.id], name: it["Name"], group: kind === "income" ? "Income" : (it["Group"] || "Expenses"), cells: cells.map(finRound_), proj: proj, total: sum(cells) };
      }).filter(r => r.cells.some(c => c !== 0));
   };
   const sections = [];
   const inc = rowsFor("income").sort((a, b) => a.name.localeCompare(b.name));
   sections.push({ name: "Income", kind: "income", rows: inc, total: months.map((m, i) => sum(inc.map(r => r.cells[i]))) });
   const bills = rowsFor("bills");
   const order = modListValues_(def, "Group").map(v => v.value);
   bills.forEach(r => { if (order.indexOf(r.group) === -1) order.push(r.group); });
   order.forEach(g => {
      const rows = bills.filter(r => r.group === g).sort((a, b) => a.name.localeCompare(b.name));
      if (rows.length) sections.push({ name: g, kind: "bills", rows: rows, total: months.map((m, i) => sum(rows.map(r => r.cells[i]))) });
   });
   const out = sections.filter(s => s.kind === "bills");
   const remaining = months.map((m, i) => finRound_(sections[0].total[i] - out.reduce((s, x) => s + x.total[i], 0)));
   // Spending logged in other modules (shown on its own, so nothing counts twice).
   const other = [];
   const add = (name, rows, dateField, amountField) => {
      const cells = zeros();
      rows.forEach(r => { const d = String(r[dateField] || ""); if (d.slice(0, 4) === String(year)) cells[+d.slice(5, 7) - 1] += Number(r[amountField]) || 0; });
      if (cells.some(c => c)) other.push({ name: name, cells: cells.map(finRound_), total: sum(cells) });
   };
   const mods = coreModules_();
   const on = k => { const m = mods.find(x => x.key === k); return !!(m && m.spreadsheetId); };
   try { if (on("vehicles")) add("Vehicles – service", modRows_(vehiclesDef_(), "visits"), "Date", "Total"); } catch (e) { console.warn("Vehicles report: " + e); }
   try { if (on("hockey")) add("Travel Hockey – expenses", modRows_(hockeyDef_(), "expenses"), "Date", "Amount"); } catch (e) { console.warn("Hockey report: " + e); }
   try { if (on("work") && typeof workDef_ === "function") add("Work – receipts", modRows_(workDef_(), "receipts"), "Date", "Total"); } catch (e) { console.warn("Work report: " + e); }
   return { year: year, months: months, sections: sections, remaining: remaining, remainingTotal: sum(remaining), other: other, today: vehToday_() };
}
function finReportAction_(req, user) {
   coreRequire_(user, "financial", "reports", "view");
   const def = financialDef_();
   modPrefetch_(def);
   return { report: finReport_(def, req.year) };
}

// ------------------------------------------------------------
// Load
// ------------------------------------------------------------
function finDays_(user) {
   const v = Number(PropertiesService.getScriptProperties().getProperty("fin_days_" + user.id));
   return v >= 1 && v <= 365 ? v : 7;
}
function finSetDays_(req, user) {
   const d = Math.round(Number(req.days));
   if (!(d >= 1 && d <= 365)) throw coreError_("INVALID", "Pick 1 to 365 days.");
   PropertiesService.getScriptProperties().setProperty("fin_days_" + user.id, String(d));
   return { days: d };
}

// Number lookup: admins, and people an admin switched it on for (Financial ▸ Number lookup = On).
// Never inherited from the Financial role. The lookup runs in the app on the person's device:
// the typed number is never sent to the server, saved or written to the Change Log.
function finCanLookup_(user) {
   if (user.admin) return true;
   return coreGetPerms_().some(p => p.userId === user.id && p.module === "financial" && p.area === FIN_LOOKUP_AREA && p.role !== "No Access");
}
// Every card and account by its last 4, with who and where (no balances, limits or notes).
function finLookupIndex_(def) {
   const users = {}; coreGetUsers_(true).forEach(u => users[u.id] = u.name);
   const inst = {}; modRows_(def, "institutions").forEach(i => inst[i["Institution ID"]] = i["Name"]);
   const accts = {}; modRows_(def, "accounts").forEach(a => accts[a["Account ID"]] = a);
   const names = ids => String(ids || "").split(",").map(x => x.trim()).filter(Boolean).map(id => users[id] || id);
   const out = [];
   modRows_(def, "cards").forEach(c => {
      const a = accts[c["Account ID"]] || {};
      if (String(c["Last 4"] || "").trim()) out.push({ kind: "Card", id: c["Card ID"], last4: String(c["Last 4"]).trim(), network: c["Network"] || "", type: c["Card Type"] || "", status: c["Status"] || "",
         active: c["Active"] !== false && a["Active"] !== false, institution: inst[a["Institution ID"]] || "", account: a["Nickname"] || "", accountId: a["Account ID"] || "", people: names(c["Cardholder"]) });
   });
   Object.keys(accts).forEach(k => {
      const a = accts[k];
      if (String(a["Account Last 4"] || "").trim()) out.push({ kind: "Account", id: a["Account ID"], last4: String(a["Account Last 4"]).trim(), network: "", type: a["Kind"] || "", status: "",
         active: a["Active"] !== false, institution: inst[a["Institution ID"]] || "", account: a["Nickname"] || "", accountId: a["Account ID"], people: names(a["Owners"]) });
   });
   return out;
}

function finLoad_(req, user) {
   const def = financialDef_();
   const see = a => coreCan_(user, "financial", a, "view");
   const canLookup = finCanLookup_(user);
   if (!FIN_AREAS.some(see) && !canLookup) throw coreError_("FORBIDDEN", "You don't have access to Financial.");
   modPrefetch_(def);
   if (!req.reload && (see("bills") || see("income"))) finMaybeSync_(def, user);
   const today = vehToday_();
   const out = {
      schema: modSchema_(def), caps: modCaps_(def, user), today: today, days: finDays_(user),
      users: coreGetUsers_().map(u => ({ id: u.id, name: u.name })),
      lists: modRows_(def, "lists"),
      bills: [], entries: [], income: [], deposits: [], accounts: [], institutions: [], cards: [], loans: [], loanpays: [], loanStatus: {},
      plans: [], options: [], optlines: [], planStatus: {}, report: null, vehicles: [], hockey: null,
      lookup: canLookup ? finLookupIndex_(def) : null
   };
   if (see("bills")) { out.bills = modRows_(def, "bills"); out.entries = modRows_(def, "entries"); }
   if (see("income")) { out.income = modRows_(def, "income"); out.deposits = modRows_(def, "deposits"); }
   if (see("accounts")) { out.accounts = modRows_(def, "accounts"); out.institutions = modRows_(def, "institutions"); out.cards = modRows_(def, "cards"); }
   else if (see("bills") || see("income") || see("loans") || see("plans")) {
      // Names only, for the Paid From / Card / Lender dropdowns.
      out.accounts = modRows_(def, "accounts").map(a => ({ "Account ID": a["Account ID"], "Nickname": a["Nickname"], "Kind": a["Kind"], "Institution ID": a["Institution ID"], "Active": a["Active"] }));
      out.institutions = modRows_(def, "institutions").map(i => ({ "Institution ID": i["Institution ID"], "Name": i["Name"], "Type": i["Type"], "Active": i["Active"] }));
      out.cards = modRows_(def, "cards").map(c => ({ "Card ID": c["Card ID"], "Account ID": c["Account ID"], "Last 4": c["Last 4"], "Network": c["Network"], "Cardholder": c["Cardholder"], "Status": c["Status"], "Active": c["Active"] }));
   }
   if (see("loans")) { out.loans = modRows_(def, "loans"); out.loanpays = modRows_(def, "loanpays"); out.loanStatus = finLoanAll_(def, today); }
   if (see("plans")) { out.plans = modRows_(def, "plans"); out.options = modRows_(def, "options"); out.optlines = modRows_(def, "optlines"); out.planStatus = finPlanStatus_(def, today); }
   if (see("reports")) { try { out.report = finReport_(def, req.year); } catch (e) { console.warn("Financial report: " + e); } }
   // Vehicles to link a loan to (names only).
   try {
      const m = coreModules_().find(x => x.key === "vehicles");
      if (see("loans") && m && m.spreadsheetId) out.vehicles = modRows_(vehiclesDef_(), "vehicles").map(v => ({ "Vehicle ID": v["Vehicle ID"], "Name": vehName_(v), "Status": v["Status"] }));
   } catch (e) { console.warn("Vehicles for loans: " + e); }
   if (out.schema.loans) {
      const f = out.schema.loans.fields.find(x => x.name === "Vehicle ID");
      if (f) { f.type = "ref"; f.ref = "vehicles"; }
      out.schema.vehicles = { label: "Vehicles", id: "Vehicle ID", kind: "record", area: "loans", fields: [{ name: "Name", type: "text" }] };
   }
   // Travel Hockey: can this person send a paid bill to the hockey expenses?
   try {
      const m = coreModules_().find(x => x.key === "hockey");
      if (see("bills") && m && m.status === "Active" && m.spreadsheetId && coreCan_(user, "hockey", "expenses", "add")) {
         const hd = hockeyDef_();
         out.hockey = {
            categories: modListValues_(hd, "Expense Category").filter(v => v.active).map(v => v.value),
            seasons: modRows_(hd, "seasons").filter(s => s["Active"] !== false).map(s => ({ id: s["Season ID"], name: s["Season"] + (s["Sport"] ? " " + s["Sport"] : ""), start: s["Start Date"], end: s["End Date"] }))
         };
      }
   } catch (e) { console.warn("Hockey for Financial: " + e); }
   return out;
}

// Loans shown on a vehicle (Vehicles screens): only for people who can see Financial ▸ Loans.
function finVehicleLoans_(user) {
   if (!finActive_() || !coreCan_(user, "financial", "loans", "view")) return {};
   const def = financialDef_(), today = vehToday_();
   const st = finLoanAll_(def, today), out = {};
   modRows_(def, "loans").filter(l => l["Vehicle ID"]).forEach(l => {
      const s = st[l["Loan ID"]];
      (out[l["Vehicle ID"]] = out[l["Vehicle ID"]] || []).push({ id: l["Loan ID"], name: l["Name"], remaining: s.remaining, payoff: s.payoff, basis: s.basis, monthly: s.monthly });
   });
   return out;
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------

// req: { table: "entries" | "deposits", id, to: "paid" | "unpaid" | "skip", amount?, date? }
function finMark_(req, user) {
   const def = financialDef_();
   const table = req.table === "deposits" ? "deposits" : "entries", K = finKindOfEntries_(table), t = def.tables[table];
   const row = modFind_(def, table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   const today = vehToday_();
   let values, label;
   if (req.to === "skip") { values = { "Status": "Skipped", "Paid Date": "" }; label = "Skip"; }
   else if (req.to === "unpaid") { values = { "Status": finIso_(row["Due Date"]) > today ? "Scheduled" : K.open, "Paid Date": "" }; label = "Not " + K.paid.toLowerCase(); }
   else {
      const d = req.date ? modParseDate_(req.date, { name: "Date" }) : coreDate_(today);
      values = { "Status": K.paid, "Paid Date": d };
      if (req.amount !== undefined && req.amount !== null && req.amount !== "") {
         const n = Number(String(req.amount).replace(/[$,\s]/g, ""));
         if (isNaN(n) || n < 0) throw coreError_("INVALID", "The amount must be a number.");
         values["Amount"] = finRound_(n);
      }
      label = K.paid;
   }
   modChange_(def, table, row, values, user, label);
   if (table === "entries") {
      modForget_(def, "entries");
      const e = modRows_(def, "entries").find(x => x["Entry ID"] === row["Entry ID"]);
      finReminder_(def, e, vehFind_(def, "bills", row["Bill ID"]), user);
   }
   return { status: values["Status"] };
}

// req: { optionId?, values: { Plan ID, Option, Chosen, Notes }, lines: [{ id?, Item, Price, Quantity }] }
function finSaveOption_(req, user) {
   const def = financialDef_(), to = def.tables.options, tl = def.tables.optlines;
   const before = req.optionId ? modFind_(def, "options", req.optionId) : null;
   modRequire_(user, def, to, before ? "edit" : "add", before, req.values || {});
   const values = modClean_(def, to, req.values || {}, user, before);
   modCheckRequired_(to, Object.assign({}, before || {}, values));
   const old = before ? modRows_(def, "optlines").filter(l => l["Option ID"] === before["Option ID"]) : [];
   const keep = {}, lines = [];
   (req.lines || []).forEach((raw, i) => {
      const o = raw.id ? old.find(l => l["Line ID"] === raw.id) : null;
      if (raw.id && !o) throw coreError_("STALE", "A line on this option changed. Refresh and try again.");
      const v = modClean_(def, tl, Object.assign({}, raw, { "Option ID": undefined }), user, o);
      delete v["Option ID"];
      if (!String(v["Item"] || "").trim() && (v["Price"] === "" || v["Price"] === undefined)) return;
      if (!String(v["Item"] || "").trim()) throw coreError_("INVALID", "Each line with a price needs an item.");
      if (v["Quantity"] === "" || v["Quantity"] === undefined) v["Quantity"] = 1;
      v["Sort"] = i + 1;
      if (o) keep[o["Line ID"]] = true;
      lines.push({ old: o, values: v });
   });
   values["Total"] = finRound_(lines.reduce((s, l) => s + (Number(l.values["Price"]) || 0) * (Number(l.values["Quantity"]) || 0), 0));
   let id;
   if (before) { id = before["Option ID"]; modChange_(def, "options", before, values, user); }
   else id = modInsert_(def, "options", values, user);
   lines.filter(l => l.old).forEach(l => modChange_(def, "optlines", l.old, l.values, user));
   const fresh = lines.filter(l => !l.old).map(l => Object.assign({ "Option ID": id }, l.values));
   if (fresh.length) modBulkInsert_(def, "optlines", fresh, user);
   old.filter(l => !keep[l["Line ID"]]).sort((a, b) => b._row - a._row).forEach(l => {
      modForget_(def, "optlines");
      const r = modRows_(def, "optlines").find(x => x["Line ID"] === l["Line ID"]);
      if (r) modRemoveRow_(def, "optlines", r);
   });
   // One chosen option per plan.
   modForget_(def, "options");
   const planId = values["Plan ID"] || (before && before["Plan ID"]);
   if ((values["Chosen"] === true)) modRows_(def, "options").filter(o => o["Plan ID"] === planId && o["Option ID"] !== id && o["Chosen"] === true)
      .forEach(o => modChange_(def, "options", o, { "Chosen": false }, user, "Not chosen"));
   return { id: id, total: values["Total"] };
}

// req: { id (bill entry), seasonId?, category, item?, nonBillable?, notes? } -> a Travel Hockey expense.
function finToHockey_(req, user) {
   const def = financialDef_();
   const e = modFind_(def, "entries", req.id);
   modRequire_(user, def, def.tables.entries, "edit", e, {});
   if (e["Status"] !== "Paid") throw coreError_("INVALID", "Mark it paid first.");
   if (e["Hockey Expense ID"]) throw coreError_("INVALID", "It's already on the Travel Hockey expenses (" + e["Hockey Expense ID"] + ").");
   if (!coreCan_(user, "hockey", "expenses", "add")) throw coreError_("FORBIDDEN", "You can't add Travel Hockey expenses.");
   const hd = hockeyDef_();
   const date = finIso_(e["Paid Date"]) || finIso_(e["Due Date"]);
   const seasons = modRows_(hd, "seasons");
   const season = req.seasonId ? seasons.find(s => s["Season ID"] === req.seasonId) : seasons.find(s => s["Start Date"] <= date && date <= s["End Date"]);
   if (!season) throw coreError_("INVALID", "No Travel Hockey season covers " + vehNiceDate_(date) + ".");
   const cat = modListValues_(hd, "Expense Category").find(v => v.active && v.value.toLowerCase() === String(req.category || "").toLowerCase());
   if (!cat) throw coreError_("INVALID", "Pick a hockey expense category.");
   const bill = vehFind_(def, "bills", e["Bill ID"]) || {};
   const hid = modInsert_(hd, "expenses", {
      "Date": coreDate_(date), "Category": cat.value, "Item": String(req.item || bill["Name"] || "").trim(), "Amount": finRound_(e["Amount"]),
      "Non-Billable": req.nonBillable === true, "Sport": season["Sport"] || "", "Season ID": season["Season ID"],
      "Notes": ("From Financial " + e["Entry ID"] + (req.notes ? " · " + String(req.notes).trim() : "")).slice(0, 500)
   }, user);
   modChange_(def, "entries", e, { "Hockey Expense ID": hid }, user, "Sent to Travel Hockey");
   return { hockeyId: hid };
}

// Statement / confirmation file on a bill entry (Financial ▸ Statements in Drive).
function finUpload_(req, user) {
   const def = financialDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f || !FIN_FOLDERS[req.table]) throw coreError_("BAD_REQUEST", "That can't have a file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   const file = req.file || {};
   if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(file.mimeType))) throw coreError_("INVALID", "Use a photo (JPG, PNG) or a PDF.");
   const bytes = Utilities.base64Decode(String(file.data || "").replace(/^data:[^,]*,/, ""));
   if (!bytes.length) throw coreError_("INVALID", "The file is empty.");
   if (bytes.length > 15 * 1024 * 1024) throw coreError_("INVALID", "That file is too large (15 MB at most).");
   const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif", "application/pdf": ".pdf" }[file.mimeType];
   const name = (row["Entry ID"] + " " + finItemName_(def, "bills", row["Bill ID"]) + " – " + FIN_FOLDERS[req.table].label + " – " + finIso_(row["Due Date"]))
      .replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) + ext;
   const saved = DriveApp.getFolderById(FIN_FOLDERS[req.table].id).createFile(Utilities.newBlob(bytes, file.mimeType, name));
   saved.setDescription(row["Entry ID"] + " · uploaded by " + user.name + " (" + user.id + ") via Ayers Household");
   const url = "https://drive.google.com/file/d/" + saved.getId() + "/view";
   modChange_(def, req.table, row, { [f.name]: url }, user, "Add file");
   return { url: url, name: name };
}
function finClearFile_(req, user) {
   const def = financialDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f) throw coreError_("BAD_REQUEST", "That has no file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   modChange_(def, req.table, row, { [f.name]: "" }, user, "Remove file");
   return { cleared: true };
}
function finFile_(req, user) {
   const def = financialDef_();
   const fileId = String(req.fileId || "");
   if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw coreError_("BAD_REQUEST", "Unknown file.");
   if (!coreCan_(user, "financial", "bills", "view")) throw coreError_("NOT_FOUND", "That file isn't linked to anything you can see.");
   const linked = modRows_(def, "entries").some(r => String(r["Statement"] || "").indexOf("/d/" + fileId + "/") !== -1);
   if (!linked) throw coreError_("NOT_FOUND", "That file isn't linked to anything you can see.");
   let blob;
   try { blob = DriveApp.getFileById(fileId).getBlob(); } catch (e) { throw coreError_("NOT_FOUND", "The file couldn't be found in Drive (it may have been moved or deleted)."); }
   return { file: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()), name: blob.getName() } };
}

// ------------------------------------------------------------
// Setup (run once from the script editor; safe to run again: only adds what's missing).
// Links the spreadsheet, turns the module on, builds the tabs, fills the dropdowns, adds the
// Reports area (and names the Bills area "Upcoming & Bills"), and adds "Financial" to the
// Tasks categories, and makes Brittany an Editor on Financial if she has no Financial role yet.
// No bills, income or history are copied in (that's a separate import, later).
// ------------------------------------------------------------
// Update of 11/25 (safe to run again): accounts move under institutions (made from their old
// Institution text), their card's last 4 becomes a card, Owner becomes Owners, and a loan's Lender
// text becomes an institution.
function financialUpgrade_(def, owner) {
   const users = coreGetUsers_(true);
   const person = name => { const n = String(name || "").trim().toLowerCase(); if (!n) return []; if (n === "joint") return ["USR-1", "USR-2"];
      const u = users.find(x => x.name.split(" ")[0].toLowerCase() === n || x.name.toLowerCase() === n); return u ? [u.id] : []; };
   let made = 0, moved = 0, cards = 0, lenders = 0;
   const inst = (name, type, website) => {
      name = String(name || "").replace(/\s+/g, " ").trim();
      if (!name) return "";
      const have = modRows_(def, "institutions", true).find(i => String(i["Name"]).toLowerCase() === name.toLowerCase());
      if (have) { if (website && !have["Website"]) coreWriteChanges_(modSheet_(def, def.tables.institutions), have._row, have, { "Website": website }); return have["Institution ID"]; }
      made++;
      return modInsert_(def, "institutions", { "Name": name, "Type": type, "Website": website || "" }, owner);
   };
   modRows_(def, "accounts", true).filter(a => !a["Institution ID"]).forEach(a => {
      const iid = inst(a["Institution"] || a["Nickname"], a["Kind"] === "Credit Card" ? "Card Issuer" : "Bank", a["Website"]);
      const ch = { "Institution ID": iid };
      const who = person(a["Owner"]);
      if (!a["Owners"] && who.length) ch["Owners"] = who.join(",");
      modForget_(def, "accounts");
      const row = modRows_(def, "accounts", true).find(x => x["Account ID"] === a["Account ID"]);
      coreWriteChanges_(modSheet_(def, def.tables.accounts), row._row, row, ch);
      moved++;
      const l4 = /^\d{1,4}$/.test(String(a["Card Last 4"] || "")) ? String(a["Card Last 4"]).padStart(4, "0") : "";
      if (l4 && !modRows_(def, "cards", true).some(c => c["Account ID"] === a["Account ID"] && c["Last 4"] === l4)) {
         modInsert_(def, "cards", { "Account ID": a["Account ID"], "Cardholder": who[0] || "USR-1", "Last 4": l4, "Card Type": a["Kind"] === "Credit Card" ? "Credit" : "Debit", "Status": "Active" }, owner);
         cards++;
      }
   });
   modForget_(def, "accounts");
   modRows_(def, "loans", true).filter(l => !l["Institution ID"] && String(l["Lender"] || "").trim()).forEach(l => {
      const iid = inst(l["Lender"], "Lender", "");
      modForget_(def, "loans");
      const row = modRows_(def, "loans", true).find(x => x["Loan ID"] === l["Loan ID"]);
      coreWriteChanges_(modSheet_(def, def.tables.loans), row._row, row, { "Institution ID": iid });
      lenders++;
   });
   modForget_(def, "loans");
   return "Upgrade: institutions made " + made + ", accounts moved " + moved + ", cards made " + cards + ", lenders linked " + lenders;
}

const FIN_SEED = {
   "Group": [["Expenses", 1], ["Non-Essential", 2], ["Savings", 3]],
   "Category": ["Utilities", "Phone", "TV & Internet", "Insurance", "Loan", "Credit Card", "School", "Subscriptions", "Food", "Household", "Gasoline", "Car Wash", "Savings", "Other"],
   "Person": ["Chris", "Brittany", "Joint"]
};
function financialSetup() {
   const core = coreSheet_(CORE_CONFIG.tabs.modules);
   const row = coreTable_(CORE_CONFIG.tabs.modules).rows.find(r => r["Module Key"] === "financial");
   if (!row) throw new Error("There's no financial row on the Modules tab.");
   const hm = coreHeaderMap_(core).map;
   if (!String(row["Spreadsheet ID"] || "").trim()) core.getRange(row._row, hm["spreadsheet id"]).setValue(FIN_SPREADSHEET_ID);
   if (String(row["Status"] || "").trim() !== "Active") core.getRange(row._row, hm["status"]).setValue("Active");
   CORE_GRID = {}; MOD_SS = {}; MOD_ROWS = {};
   const def = financialDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   const out = [];
   const have = modRows_(def, "lists", true).map(r => r["List"] + "|" + String(r["Value"]).toLowerCase());
   const lists = [];
   Object.keys(FIN_SEED).forEach(l => FIN_SEED[l].forEach(v => {
      const val = Array.isArray(v) ? v[0] : v, sort = Array.isArray(v) ? v[1] : "";
      if (have.indexOf(l + "|" + val.toLowerCase()) === -1) lists.push({ "List": l, "Value": val, "Sort": sort });
   }));
   if (lists.length) modBulkInsert_(def, "lists", lists, owner);
   out.push("List values added: " + lists.length);
   out.push(financialUpgrade_(def, owner));
   // Last 4 columns as plain text, so leading zeros stay (0123, not 123).
   const z = modFixDigits_(def, "cards", "Last 4") + modFixDigits_(def, "accounts", "Account Last 4");
   out.push("Last 4 kept as text" + (z ? " (" + z + " fixed)" : ""));
   // Areas: Reports, and the Bills area's name.
   const areas = coreSheet_(CORE_CONFIG.tabs.areas), am = coreHeaderMap_(areas).map;
   const arows = coreTable_(CORE_CONFIG.tabs.areas).rows;
   const bills = arows.find(r => r["Module Key"] === "financial" && r["Area Key"] === "bills");
   if (bills && String(bills["Area Name"]).trim() === "Bills") { areas.getRange(bills._row, am["area name"]).setValue("Upcoming & Bills"); out.push("Area renamed: Upcoming & Bills"); }
   if (!arows.some(r => r["Module Key"] === "financial" && r["Area Key"] === "reports")) {
      coreAppendRow_(areas, { "Module Key": "financial", "Area Key": "reports", "Area Name": "Reports", "Sort": 60, "Description": "Month grid and spending from other modules" });
      out.push("Area added: Reports");
   }
   if (!arows.some(r => r["Module Key"] === "financial" && r["Area Key"] === FIN_LOOKUP_AREA)) {
      coreAppendRow_(areas, { "Module Key": "financial", "Area Key": FIN_LOOKUP_AREA, "Area Name": "Number lookup", "Sort": 70, "Description": "Look up a card or account number: shows the institution, person and last 4. Off unless switched on here; admins always have it." });
      out.push("Area added: Number lookup");
   }
   CORE_GRID = {};
   // Tasks: a Financial category for bill reminders.
   if (finTasksOn_()) {
      const td = tasksDef_();
      if (!modListValues_(td, "Category").some(v => v.value === "Financial")) { modBulkInsert_(td, "lists", [{ "List": "Category", "Value": "Financial", "Sort": "" }], owner); out.push("Tasks category added: Financial"); }
   }
   // Brittany: Editor on all of Financial (answer of 11/24), unless a Financial role is already set for her.
   CORE_PERMS = null; CORE_GRID = {};
   if (!coreGetPerms_().some(p => p.userId === "USR-2" && p.module === "financial" && !p.area) && coreGetUsers_(true).some(u => u.id === "USR-2")) {
      coreAppendRow_(coreSheet_(CORE_CONFIG.tabs.perms), { "User ID": "USR-2", "Module Key": "financial", "Area Key": "", "Role": "Editor" });
      coreLog_(owner, "core", "Permissions", "Brittany Ayers", "Financial", "Role: Editor", true);
      CORE_PERMS = null; CORE_GRID = {};
      out.push("Brittany set to Editor");
   }
   const perms = coreGetPerms_().filter(p => p.module === "financial").map(p => p.userId + (p.area ? "/" + p.area : "") + "=" + p.role);
   out.push("Access: " + (perms.join(", ") || "admins only"));
   coreFlushLog_();
   const ss = modSs_("financial");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   Object.keys(FIN_FOLDERS).forEach(k => DriveApp.getFolderById(FIN_FOLDERS[k].id).getName());
   SpreadsheetApp.flush();
   console.log("Financial setup done | " + out.join(" | "));
   return out.join(" | ");
}
