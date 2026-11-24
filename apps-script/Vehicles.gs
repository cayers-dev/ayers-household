// =========================================================
// AYERS HOUSEHOLD - VEHICLES MODULE
// =========================================================
// Data lives in the "Ayers Household - Vehicles" spreadsheet (Vehicles folder).
// Areas (set per person on Permissions):
//   vehicles   vehicle details, features, license plates, places (dealers, shops...)
//   service    service visits and their lines, odometer readings, service intervals
//   insurance  insurance policies and cards, registration renewals
//
// Service visit = one ID (date, mileage, shop, receipt) with several lines. Each line
// is a service (category → action, cost, optional follow-up) or a Tax / Shipping line.
// The visit total adds up the lines.
// Intervals are per vehicle (miles and/or months) and listed by the date they're due.
// A mileage-based due date is estimated from average miles per month and marked so.
// Insurance: one policy (carrier, number, period) applied to one or more vehicles, one
// card per vehicle. Old cards stay as history.
// Files (cards, receipts, photos) go to the Vehicles folder in Drive, one sub-folder per
// type, named like "VEH-1 2025 Kia EV6 – Insurance – 2026-11-24". They're shown in the app
// through this script, so they stay private to app users.
// Run vehiclesSetup() once from the script editor.
// =========================================================

const VEHICLES_SPREADSHEET_ID = "1spX9TvEBZmgMldih9K_x_izrpjTB18mKXpfdYVZzNt4";
const VEHICLES_FOLDERS = {
   cards:         { id: "1RqVcbjCZ_ESOs0X3NL_hL9jeO5vp_hsx", label: "Insurance" },
   registrations: { id: "1RCdJQw1pPYYIUYcb6F3SdHD8oB7_4DHf", label: "Registration" },
   visits:        { id: "1019YLLp3e4fwLuXRiKAo7u1ZkSNx5-Ii", label: "Receipt" },
   vehicles:      { id: "17FwfscbZdCHm-N6ZJXCEdXF9BxUT3tzn", label: "Photo" }
};

function vehiclesDef_() {
   return {
      key: "vehicles",
      name: "Vehicles",
      areas: ["vehicles", "service", "insurance"],
      tables: {
         vehicles: { tab: "Vehicles", label: "Vehicles", id: "Vehicle ID", prefix: "VEH-", kind: "record", area: "vehicles",
            title: r => vehName_(r),
            fields: [
               { name: "Nickname", type: "text" },
               { name: "Year", type: "number", required: true },
               { name: "Make", type: "list", list: "Make", required: true },
               { name: "Model", type: "text", required: true },
               { name: "Trim", type: "text" },
               { name: "Color", type: "list", list: "Color" },
               { name: "VIN", type: "text" },
               { name: "Primary Driver", type: "user" },
               { name: "Status", type: "list", list: "Status", default: "Active" },
               { name: "Condition", label: "Condition at Purchase", type: "list", list: "Condition" },
               { name: "Purchase Type", type: "list", list: "Purchase Type" },
               { name: "Dealership", type: "ref", ref: "places" },
               { name: "Purchase Date", type: "date" },
               { name: "Purchase Amount", type: "money" },
               { name: "Mileage at Purchase", type: "number" },
               { name: "Lienholder", type: "text" },
               { name: "Lease End Date", type: "date" },
               { name: "Lease Miles Per Year", type: "number" },
               { name: "Sold Date", type: "date" },
               { name: "Sold Amount", type: "money" },
               { name: "Sold To", type: "text" },
               { name: "Fuel Type", type: "list", list: "Fuel Type" },
               { name: "Drivetrain", type: "list", list: "Drivetrain" },
               { name: "Oil Type", type: "text", hint: "e.g. 5W-30" },
               { name: "Oil Capacity", type: "text", hint: "e.g. 5.2 qt with filter" },
               { name: "Tire Pressure Front", type: "text", hint: "e.g. 36 psi" },
               { name: "Tire Pressure Rear", type: "text" },
               { name: "Wiper Driver", label: "Wiper size – driver", type: "text", hint: "e.g. 26\"" },
               { name: "Wiper Passenger", label: "Wiper size – passenger", type: "text" },
               { name: "Wiper Rear", label: "Wiper size – rear", type: "text" },
               { name: "Battery Install Date", label: "12V Battery Installed", type: "date" },
               { name: "Key Fob Battery", type: "text", hint: "e.g. CR2032" },
               { name: "Smog Due", type: "date" },
               { name: "Photo", type: "file" },
               { name: "Notes", type: "longtext" }
            ] },
         features: { tab: "Features", label: "Features", id: "Feature ID", prefix: "FTR-", kind: "list", area: "vehicles",
            unique: ["Feature"], title: r => r["Feature"],
            fields: [
               { name: "Feature", type: "text", required: true },
               { name: "Kind", type: "choice", options: ["Yes/No", "Value"], required: true, default: "Yes/No",
                 hint: "Yes/No (Heated Seats) or a value (Tire Size = 235/55R19)" }
            ] },
         vfeatures: { tab: "Vehicle Features", label: "Vehicle Features", id: "Vehicle Feature ID", prefix: "VF-", kind: "record", area: "vehicles",
            hardDelete: true, unique: ["Vehicle ID", "Feature ID"], title: (r, def) => vehFeatureName_(def, r["Feature ID"]),
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Feature ID", label: "Feature", type: "ref", ref: "features", required: true },
               { name: "Value", type: "text", hint: "Only for value features (e.g. 255/45R20)" }
            ] },
         parts: { tab: "Parts", label: "Parts", id: "Part ID", prefix: "PRT-", kind: "record", area: "vehicles",
            title: r => r["Part"],
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Part", type: "list", list: "Part", required: true },
               { name: "Info", type: "text", required: true, hint: "Part number, brand, size…" }
            ] },
         plates: { tab: "License Plates", label: "License Plates", id: "Plate ID", prefix: "PLT-", kind: "record", area: "vehicles",
            title: r => r["Plate"],
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Plate", type: "text", required: true },
               { name: "State", type: "text", default: "CA" },
               { name: "Plate Type", type: "list", list: "Plate Type" },
               { name: "Start Date", type: "date" },
               { name: "End Date", type: "date", hint: "Blank = current plate" },
               { name: "Reason", label: "Reason for Change", type: "text" },
               { name: "Notes", type: "longtext" }
            ] },
         places: { tab: "Places", label: "Places", id: "Place ID", prefix: "PLC-", kind: "list", area: "vehicles",
            unique: ["Name"], title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true },
               { name: "Type", type: "list", list: "Place Type", required: true },
               { name: "Address", type: "text" },
               { name: "Phone", type: "text" },
               { name: "Website", type: "url" },
               { name: "Notes", type: "longtext" }
            ] },
         visits: { tab: "Service Visits", label: "Service Visits", id: "Visit ID", prefix: "SVC-", kind: "record", area: "service",
            title: r => vehNiceDate_(r["Date"]),
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Mileage", type: "number" },
               { name: "Shop", type: "ref", ref: "places" },
               { name: "Receipt", type: "file" },
               { name: "Total", type: "money", readOnly: true, hint: "Adds up the lines" },
               { name: "Notes", type: "longtext" }
            ] },
         lines: { tab: "Service Lines", label: "Service Lines", id: "Line ID", prefix: "SVL-", kind: "record", area: "service", hardDelete: true,
            title: (r, def) => r["Kind"] === "Service" ? (vehActionName_(def, r["Action ID"]) || r["Description"] || r["Category"]) : r["Kind"],
            fields: [
               { name: "Visit ID", label: "Visit", type: "ref", ref: "visits", required: true },
               { name: "Kind", type: "choice", options: ["Service", "Tax", "Shipping"], required: true, default: "Service" },
               { name: "Category", type: "list", list: "Service Category" },
               { name: "Action ID", label: "Action", type: "ref", ref: "actions" },
               { name: "Description", type: "text" },
               { name: "Cost", type: "money" },
               { name: "Follow Up", type: "text", hint: "What to do next" },
               { name: "Follow Up Date", type: "date" },
               { name: "Follow Up Done", type: "bool" },
               { name: "Sort", type: "number" }
            ] },
         actions: { tab: "Actions", label: "Actions", id: "Action ID", prefix: "ACT-", kind: "list", area: "service",
            unique: ["Category", "Action"], title: r => r["Action"],
            fields: [
               { name: "Category", type: "list", list: "Service Category", required: true },
               { name: "Action", type: "text", required: true }
            ] },
         odometer: { tab: "Odometer", label: "Odometer", id: "Reading ID", prefix: "ODO-", kind: "record", area: "service",
            title: r => Number(r["Mileage"]).toLocaleString() + " mi",
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Mileage", type: "number", required: true },
               { name: "Notes", type: "text" }
            ] },
         intervals: { tab: "Intervals", label: "Intervals", id: "Interval ID", prefix: "INT-", kind: "record", area: "service",
            unique: ["Vehicle ID", "Action ID"], title: (r, def) => vehActionName_(def, r["Action ID"]),
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Action ID", label: "Action", type: "ref", ref: "actions", required: true },
               { name: "Miles", label: "Every (miles)", type: "number" },
               { name: "Months", label: "Every (months)", type: "number" },
               { name: "Source", type: "text", hint: "Where the interval comes from" },
               { name: "Notes", type: "longtext" }
            ] },
         policies: { tab: "Insurance Policies", label: "Insurance Policies", id: "Policy ID", prefix: "POL-", kind: "record", area: "insurance",
            title: (r, def) => [vehPlaceName_(def, r["Carrier"]), r["Policy Number"]].filter(Boolean).join(" "),
            fields: [
               { name: "Carrier", type: "ref", ref: "places", required: true },
               { name: "Policy Number", type: "text", required: true },
               { name: "Start Date", label: "Effective Date", type: "date", required: true },
               { name: "End Date", label: "Expiration Date", type: "date", required: true },
               { name: "Premium", type: "money" },
               { name: "Notes", type: "longtext" }
            ] },
         cards: { tab: "Insurance Cards", label: "Insurance Cards", id: "Card ID", prefix: "CRD-", kind: "record", area: "insurance",
            unique: ["Policy ID", "Vehicle ID"], title: (r, def) => vehVehicleName_(def, r["Vehicle ID"]),
            fields: [
               { name: "Policy ID", label: "Policy", type: "ref", ref: "policies", required: true },
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Card", label: "Card image", type: "file" },
               { name: "Notes", type: "text" }
            ] },
         registrations: { tab: "Registrations", label: "Registrations", id: "Registration ID", prefix: "REG-", kind: "record", area: "insurance",
            title: r => "Expires " + vehNiceDate_(r["Expires"]),
            fields: [
               { name: "Vehicle ID", label: "Vehicle", type: "ref", ref: "vehicles", required: true },
               { name: "Expires", type: "date", required: true },
               { name: "Fee", type: "money" },
               { name: "Paid Date", type: "date" },
               { name: "Card", label: "Registration card", type: "file" },
               { name: "Notes", type: "text" }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "vehicles",
            listAreas: { "Service Category": "service" },
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Make", "Color", "Status", "Condition", "Purchase Type", "Fuel Type", "Drivetrain", "Plate Type", "Place Type", "Service Category", "Part"],
      beforeSave: vehBeforeSave_,
      afterSave: vehAfterSave_,
      afterDelete: vehAfterDelete_,
      home: vehiclesHome_,
      actions: {
         load:      { fn: vehiclesLoad_ },
         file:      { fn: vehiclesFile_ },
         saveVisit: { fn: vehiclesSaveVisit_, write: true },
         addPolicy: { fn: vehiclesAddPolicy_, write: true },
         upload:    { fn: vehiclesUpload_, write: true },
         clearFile: { fn: vehiclesClearFile_, write: true },
         followUp:  { fn: vehiclesFollowUp_, write: true },
         setFeatures: { fn: vehiclesSetFeatures_, write: true }
      }
   };
}

// ------------------------------------------------------------
// Names and dates
// ------------------------------------------------------------
function vehName_(r) {
   const base = [r["Year"], r["Make"], r["Model"]].filter(x => x !== "" && x !== undefined && x !== null).join(" ");
   return base + (r["Nickname"] ? " (" + r["Nickname"] + ")" : "");
}
function vehFind_(def, table, id) {
   if (!id) return null;
   const t = def.tables[table];
   return modRows_(def, table, true).find(r => r[t.id] === id) || null;
}
function vehVehicleName_(def, id) { const r = vehFind_(def, "vehicles", id); return r ? vehName_(r) : id || ""; }
function vehActionName_(def, id) { const r = vehFind_(def, "actions", id); return r ? r["Action"] : ""; }
function vehFeatureName_(def, id) { const r = vehFind_(def, "features", id); return r ? r["Feature"] : id || ""; }
function vehPlaceName_(def, id) { const r = vehFind_(def, "places", id); return r ? r["Name"] : ""; }

function vehToday_() { return Utilities.formatDate(new Date(), coreTz_(), "yyyy-MM-dd"); }
function vehNiceDate_(iso) {
   const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
   if (!m) return "";
   return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1] + " " + (+m[3]) + ", " + m[1];
}
// "2026-01-31" + 1 month -> "2026-02-28" (end of month kept).
function vehAddMonths_(iso, months) {
   const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
   if (!m) return "";
   const total = (+m[1]) * 12 + (+m[2] - 1) + Math.round(Number(months));
   const y = Math.floor(total / 12), mo = total % 12;
   const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
   return y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(Math.min(+m[3], last)).padStart(2, "0");
}
function vehAddDays_(iso, days) {
   const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
   if (!m) return "";
   const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + Math.round(days) * 86400000);
   return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function vehDaysBetween_(a, b) {
   const p = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return Date.UTC(+m[1], +m[2] - 1, +m[3]); };
   return Math.round((p(b) - p(a)) / 86400000);
}

// ------------------------------------------------------------
// Mileage, intervals, insurance (shared by the app screens and Due Soon)
// ------------------------------------------------------------

// Every known reading for a vehicle, oldest first: purchase, service visits, odometer entries.
function vehReadings_(def, vehicle) {
   const id = vehicle["Vehicle ID"], out = [];
   if (vehicle["Purchase Date"] && vehicle["Mileage at Purchase"] !== "" && vehicle["Mileage at Purchase"] !== undefined)
      out.push({ date: vehicle["Purchase Date"], miles: Number(vehicle["Mileage at Purchase"]), source: "Purchase" });
   modRows_(def, "visits").filter(v => v["Vehicle ID"] === id && v["Mileage"] !== "" && v["Date"])
      .forEach(v => out.push({ date: v["Date"], miles: Number(v["Mileage"]), source: "Service", id: v["Visit ID"] }));
   modRows_(def, "odometer").filter(o => o["Vehicle ID"] === id && o["Mileage"] !== "" && o["Date"])
      .forEach(o => out.push({ date: o["Date"], miles: Number(o["Mileage"]), source: "Odometer", id: o["Reading ID"] }));
   return out.filter(r => !isNaN(r.miles)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.miles - b.miles);
}

// Average miles per month from the readings (needs at least 30 days between the first and last).
function vehMilesPerMonth_(readings) {
   if (readings.length < 2) return null;
   const first = readings[0], last = readings[readings.length - 1];
   const days = vehDaysBetween_(first.date, last.date);
   if (days < 30 || last.miles <= first.miles) return null;
   return (last.miles - first.miles) / (days / 30.4375);
}

// When each interval is next due for a vehicle.
// Returns [{ interval, action, last: {date, miles, visitId} | null, baseline, dueByMonths, dueMiles,
//            estDate, dueDate, estimated, state: "overdue" | "soon" | "ok" | "unknown" }], due date order.
function vehIntervalStatus_(def, vehicle, days) {
   const id = vehicle["Vehicle ID"];
   const today = vehToday_();
   const readings = vehReadings_(def, vehicle);
   const rate = vehMilesPerMonth_(readings);
   const latest = readings.length ? readings[readings.length - 1] : null;
   const visits = modRows_(def, "visits").filter(v => v["Vehicle ID"] === id);
   const visitById = {};
   visits.forEach(v => visitById[v["Visit ID"]] = v);
   const lines = modRows_(def, "lines").filter(l => visitById[l["Visit ID"]] && l["Action ID"]);
   return modRows_(def, "intervals").filter(i => i["Vehicle ID"] === id).map(i => {
      const action = vehFind_(def, "actions", i["Action ID"]);
      let last = null;
      lines.filter(l => l["Action ID"] === i["Action ID"]).forEach(l => {
         const v = visitById[l["Visit ID"]];
         if (!last || String(v["Date"]) > String(last.date)) last = { date: v["Date"], miles: v["Mileage"] === "" ? null : Number(v["Mileage"]), visitId: v["Visit ID"] };
      });
      // No service yet: count from the purchase, if known.
      const base = last || (vehicle["Purchase Date"] ? { date: vehicle["Purchase Date"],
         miles: vehicle["Mileage at Purchase"] === "" || vehicle["Mileage at Purchase"] === undefined ? null : Number(vehicle["Mileage at Purchase"]), purchase: true } : null);
      const months = Number(i["Months"]) || 0, miles = Number(i["Miles"]) || 0;
      const o = { interval: i, action: action ? action["Action"] : "", category: action ? action["Category"] : "", last: last, baseline: base,
                  dueByMonths: "", dueMiles: null, estDate: "", dueDate: "", estimated: false, state: "unknown",
                  currentMiles: latest ? latest.miles : null, rate: rate };
      if (base && months) o.dueByMonths = vehAddMonths_(base.date, months);
      if (base && miles && base.miles !== null && !isNaN(base.miles)) {
         o.dueMiles = base.miles + miles;
         if (latest && latest.miles >= o.dueMiles) o.estDate = latest.date;   // already past the mileage
         else if (latest && rate) o.estDate = vehAddDays_(latest.date, (o.dueMiles - latest.miles) / rate * 30.4375);
      }
      if (o.dueByMonths && (!o.estDate || o.dueByMonths <= o.estDate)) o.dueDate = o.dueByMonths;
      else if (o.estDate) { o.dueDate = o.estDate; o.estimated = !(latest && latest.miles >= o.dueMiles); }
      if (o.dueDate) {
         const horizon = vehAddDays_(today, days || 30);
         o.state = o.dueDate < today ? "overdue" : o.dueDate <= horizon ? "soon" : "ok";
      }
      return o;
   }).sort((a, b) => (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) || String(a.dueDate).localeCompare(String(b.dueDate)) || a.action.localeCompare(b.action));
}

// The vehicle's insurance card in force today (latest effective date), or null.
function vehCurrentCard_(def, vehicleId, today) {
   today = today || vehToday_();
   let best = null;
   modRows_(def, "cards").filter(c => c["Vehicle ID"] === vehicleId).forEach(c => {
      const p = vehFind_(def, "policies", c["Policy ID"]);
      if (!p || p["Deleted"] || !(p["Start Date"] <= today && today <= p["End Date"])) return;
      if (!best || String(p["Start Date"]) > String(best.policy["Start Date"])) best = { card: c, policy: p };
   });
   return best;
}

// ------------------------------------------------------------
// Save rules
// ------------------------------------------------------------
function vehBeforeSave_(tableKey, values, before, user, req) {
   const def = vehiclesDef_();
   const merged = Object.assign({}, before || {}, values);
   if (tableKey === "policies" && merged["Start Date"] && merged["End Date"] && String(vehIso_(merged["End Date"])) < String(vehIso_(merged["Start Date"])))
      throw coreError_("INVALID", "The expiration date is before the effective date.");
   if (tableKey === "vfeatures" && merged["Feature ID"]) {
      const f = vehFind_(def, "features", merged["Feature ID"]);
      if (f && f["Kind"] === "Value" && !String(merged["Value"] || "").trim()) throw coreError_("INVALID", "Enter a value for " + f["Feature"] + ".");
      if (f && f["Kind"] !== "Value") values["Value"] = "";
   }
   if (tableKey === "lines" || tableKey === "intervals") vehCheckAction_(def, merged);
   return values;
}
function vehAfterSave_(tableKey, id, values, before) {
   if (tableKey === "lines") vehRetotal_(vehiclesDef_(), (before && before["Visit ID"]) || values["Visit ID"]);
}
function vehAfterDelete_(tableKey, row) {
   if (tableKey === "lines") vehRetotal_(vehiclesDef_(), row["Visit ID"]);
}
// An action must belong to the line's category.
function vehCheckAction_(def, r) {
   if (!r["Action ID"]) return;
   const a = vehFind_(def, "actions", r["Action ID"]);
   if (a && r["Category"] && a["Category"] !== r["Category"]) throw coreError_("INVALID", a["Action"] + " isn't a " + r["Category"] + " action.");
}
// "2026-11-24" whether it's a Date or text.
function vehIso_(v) { return v instanceof Date ? Utilities.formatDate(v, coreTz_(), "yyyy-MM-dd") : String(v || "").slice(0, 10); }

// Visit total = sum of its lines.
function vehRetotal_(def, visitId) {
   if (!visitId) return;
   modForget_(def, "lines");
   const visit = modRows_(def, "visits").find(v => v["Visit ID"] === visitId);
   if (!visit) return;
   const total = Math.round(modRows_(def, "lines").filter(l => l["Visit ID"] === visitId)
      .reduce((s, l) => s + (Number(l["Cost"]) || 0), 0) * 100) / 100;
   if (Number(visit["Total"]) !== total || visit["Total"] === "") coreWriteChanges_(modSheet_(def, def.tables.visits), visit._row, visit, { "Total": total });
   modForget_(def, "visits");
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------

// Everything the Vehicles screens need, limited to the areas the person can see.
function vehiclesLoad_(req, user) {
   const def = vehiclesDef_();
   const see = a => coreCan_(user, "vehicles", a, "view");
   if (!see("vehicles") && !see("service") && !see("insurance")) throw coreError_("FORBIDDEN", "You don't have access to Vehicles.");
   modPrefetch_(def);
   const out = {
      schema: modSchema_(def), caps: modCaps_(def, user),
      users: coreGetUsers_().map(u => ({ id: u.id, name: u.name })),
      vehicles: modRows_(def, "vehicles"), lists: modRows_(def, "lists"), places: modRows_(def, "places"),
      features: modRows_(def, "features"), actions: modRows_(def, "actions"),
      vfeatures: see("vehicles") ? modRows_(def, "vfeatures") : [], plates: see("vehicles") ? modRows_(def, "plates") : [],
      parts: see("vehicles") ? modRows_(def, "parts") : [],
      visits: [], lines: [], odometer: [], intervals: [], policies: [], cards: [], registrations: [],
      status: {}, current: {}, today: vehToday_()
   };
   const days = Number(user.dueSoonDays) || Number(coreGetSettings_()["Due Soon Days (default)"]) || 30;
   if (see("service")) {
      ["visits", "lines", "odometer", "intervals"].forEach(k => out[k] = modRows_(def, k));
      out.vehicles.forEach(v => {
         const readings = vehReadings_(def, v), rate = vehMilesPerMonth_(readings);
         out.status[v["Vehicle ID"]] = {
            intervals: vehIntervalStatus_(def, v, days).map(s => ({ id: s.interval["Interval ID"], action: s.action, category: s.category, last: s.last,
               baseline: s.baseline, dueByMonths: s.dueByMonths, dueMiles: s.dueMiles, estDate: s.estDate, dueDate: s.dueDate, estimated: s.estimated, state: s.state })),
            miles: readings.length ? readings[readings.length - 1] : null,
            rate: rate === null ? null : Math.round(rate)
         };
      });
   }
   if (see("insurance")) {
      ["policies", "cards", "registrations"].forEach(k => out[k] = modRows_(def, k));
      out.vehicles.forEach(v => { const c = vehCurrentCard_(def, v["Vehicle ID"], out.today); if (c) out.current[v["Vehicle ID"]] = c.card["Card ID"]; });
   }
   return out;
}

// req: { visitId?, values: { visit fields }, lines: [{ id?, Kind, Category, Action ID, Description, Cost, Follow Up, Follow Up Date, Follow Up Done }] }
// Adds or changes a visit and its lines in one go. Lines left out of an edit are removed.
// Blank Tax / Shipping lines (no cost) and empty service lines are skipped.
function vehiclesSaveVisit_(req, user) {
   const def = vehiclesDef_(), tv = def.tables.visits, tl = def.tables.lines;
   const before = req.visitId ? modFind_(def, "visits", req.visitId) : null;
   modRequire_(user, def, tv, before ? "edit" : "add", before, req.values || {});
   const values = modClean_(def, tv, req.values || {}, user, before);
   modCheckRequired_(tv, Object.assign({}, before || {}, values));
   const oldLines = before ? modRows_(def, "lines").filter(l => l["Visit ID"] === before["Visit ID"]) : [];
   const keep = {}, lines = [];
   (req.lines || []).forEach((raw, i) => {
      const old = raw.id ? oldLines.find(l => l["Line ID"] === raw.id) : null;
      if (raw.id && !old) throw coreError_("STALE", "A line on this visit changed. Refresh and try again.");
      const v = modClean_(def, tl, Object.assign({}, raw, { "Visit ID": undefined }), user, old);
      delete v["Visit ID"];
      if (!v["Kind"]) v["Kind"] = "Service";
      const empty = v["Cost"] === "" || v["Cost"] === undefined;
      if (v["Kind"] !== "Service" && empty && !String(v["Description"] || "").trim()) { return; }
      if (v["Kind"] === "Service" && empty && !v["Action ID"] && !String(v["Description"] || "").trim() && !String(v["Follow Up"] || "").trim()) return;
      if (v["Kind"] !== "Service") { v["Category"] = ""; v["Action ID"] = ""; }
      vehCheckAction_(def, v);
      if (v["Follow Up Date"] && !String(v["Follow Up"] || "").trim()) v["Follow Up"] = "Follow up";
      v["Sort"] = i + 1;
      if (old) keep[old["Line ID"]] = true;
      lines.push({ old: old, values: v });
   });
   if (!lines.length) throw coreError_("INVALID", "Add at least one line (what was done, and its cost).");
   const total = Math.round(lines.reduce((s, l) => s + (Number(l.values["Cost"]) || 0), 0) * 100) / 100;
   values["Total"] = total;
   let visitId;
   if (before) {
      visitId = before["Visit ID"];
      modChange_(def, "visits", before, values, user);
   } else {
      visitId = modInsert_(def, "visits", values, user);
   }
   // Lines: change, add, then remove (bottom up so row numbers stay right).
   lines.filter(l => l.old).forEach(l => modChange_(def, "lines", l.old, l.values, user));
   const fresh = lines.filter(l => !l.old).map(l => Object.assign({ "Visit ID": visitId }, l.values));
   if (fresh.length) {
      modBulkInsert_(def, "lines", fresh, user);
      modLog_(def, user, "Add", tl.label, visitId, fresh.length + (fresh.length === 1 ? " line" : " lines"));
   }
   oldLines.filter(l => !keep[l["Line ID"]]).sort((a, b) => b._row - a._row).forEach(l => {
      modForget_(def, "lines");
      const row = modRows_(def, "lines").find(x => x["Line ID"] === l["Line ID"]);
      if (row) { modRemoveRow_(def, "lines", row); modLog_(def, user, "Delete", tl.label, modTitle_(def, tl, row), "Removed from " + visitId); }
   });
   return { id: visitId, total: total };
}

// req: { values: { policy fields }, vehicles: [Vehicle ID] } -> one policy and a card for each vehicle.
function vehiclesAddPolicy_(req, user) {
   const def = vehiclesDef_(), tp = def.tables.policies, tc = def.tables.cards;
   modRequire_(user, def, tp, "add", null, req.values || {});
   let values = modClean_(def, tp, req.values || {}, user, null);
   values = vehBeforeSave_("policies", values, null, user, req);
   modCheckRequired_(tp, values);
   const ids = (req.vehicles || []).filter((v, i, a) => v && a.indexOf(v) === i);
   if (!ids.length) throw coreError_("INVALID", "Pick at least one vehicle for this policy.");
   ids.forEach(id => { if (!modRows_(def, "vehicles").some(v => v["Vehicle ID"] === id)) throw coreError_("INVALID", "That vehicle no longer exists. Refresh and try again."); });
   const policyId = modInsert_(def, "policies", values, user);
   const cards = modBulkInsert_(def, "cards", ids.map(id => ({ "Policy ID": policyId, "Vehicle ID": id })), user);
   modLog_(def, user, "Add", tc.label, policyId, ids.map(id => vehVehicleName_(def, id)).join(", "));
   return { id: policyId, cards: cards };
}

// req: { table, id, field, file: { data (base64), mimeType, name } } -> saves to Drive and links it.
function vehiclesUpload_(req, user) {
   const def = vehiclesDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f || !VEHICLES_FOLDERS[req.table]) throw coreError_("BAD_REQUEST", "That can't have a file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row);
   const file = req.file || {};
   const okType = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(file.mimeType));
   if (!okType) throw coreError_("INVALID", "Use a photo (JPG, PNG) or a PDF.");
   const bytes = Utilities.base64Decode(String(file.data || "").replace(/^data:[^,]*,/, ""));
   if (!bytes.length) throw coreError_("INVALID", "The file is empty.");
   if (bytes.length > 15 * 1024 * 1024) throw coreError_("INVALID", "That file is too large (15 MB at most).");
   const vehId = row["Vehicle ID"] || "";
   const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif", "application/pdf": ".pdf" }[file.mimeType];
   const date = req.table === "visits" ? vehIso_(row["Date"]) : vehToday_();
   const vName = vehId ? vehId + " " + vehVehicleName_(def, vehId).replace(/\s*\(.*\)$/, "") : row[t.id];
   const name = (vName + " – " + VEHICLES_FOLDERS[req.table].label + " – " + date).replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) + ext;
   const saved = DriveApp.getFolderById(VEHICLES_FOLDERS[req.table].id).createFile(Utilities.newBlob(bytes, file.mimeType, name));
   saved.setDescription(row[t.id] + " · uploaded by " + user.name + " (" + user.id + ") via Ayers Household");
   const url = "https://drive.google.com/file/d/" + saved.getId() + "/view";
   modChange_(def, req.table, row, { [f.name]: url }, user, "Add file");
   CacheService.getScriptCache().remove("veh_file_ids");
   return { url: url, name: name };
}

// req: { table, id, field } -> unlinks the file (the Drive file stays).
function vehiclesClearFile_(req, user) {
   const def = vehiclesDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f) throw coreError_("BAD_REQUEST", "That has no file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row);
   modChange_(def, req.table, row, { [f.name]: "" }, user, "Remove file");
   CacheService.getScriptCache().remove("veh_file_ids");
   return { cleared: true };
}

// req: { fileId } -> { file: { mimeType, data } } for a file linked to a record the person can see.
function vehiclesFile_(req, user) {
   const def = vehiclesDef_();
   const fileId = String(req.fileId || "");
   if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw coreError_("BAD_REQUEST", "Unknown file.");
   modPrefetch_(def);
   let found = null;
   Object.keys(VEHICLES_FOLDERS).some(k => {
      const t = def.tables[k];
      if (!coreCan_(user, "vehicles", t.area, "view")) return false;
      const fields = t.fields.filter(f => f.type === "file").map(f => f.name);
      return modRows_(def, k).some(r => fields.some(n => String(r[n] || "").indexOf("/d/" + fileId + "/") !== -1 && (found = k)));
   });
   if (!found) throw coreError_("NOT_FOUND", "That file isn't linked to anything you can see.");
   let blob;
   try { blob = DriveApp.getFileById(fileId).getBlob(); } catch (e) {
      throw coreError_("NOT_FOUND", "The file couldn't be found in Drive (it may have been moved or deleted).");
   }
   return { file: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()), name: blob.getName() } };
}

// req: { id, done } -> ticks a line's follow-up done (or not). Anyone who can edit the line.
function vehiclesFollowUp_(req, user) {
   const def = vehiclesDef_(), t = def.tables.lines;
   const row = modFind_(def, "lines", req.id);
   modRequire_(user, def, t, "edit", row);
   modChange_(def, "lines", row, { "Follow Up Done": !!req.done }, user, req.done ? "Follow-up done" : "Follow-up reopened");
   return { done: !!req.done };
}

// req: { vehicleId, features: [{ featureId, value }] } -> the vehicle's features become exactly these.
// Needs edit access to the vehicle.
function vehiclesSetFeatures_(req, user) {
   const def = vehiclesDef_(), tv = def.tables.vehicles, tf = def.tables.vfeatures;
   const v = modFind_(def, "vehicles", req.vehicleId);
   modRequire_(user, def, tv, "edit", v);
   const feats = modRows_(def, "features");
   const want = {};
   (req.features || []).forEach(x => {
      const f = feats.find(y => y["Feature ID"] === x.featureId);
      if (!f) throw coreError_("INVALID", "A feature no longer exists. Refresh and try again.");
      const val = f["Kind"] === "Value" ? String(x.value === undefined || x.value === null ? "" : x.value).trim() : "";
      if (f["Kind"] === "Value" && !val) return;   // blank value = not set
      want[f["Feature ID"]] = val;
   });
   const have = modRows_(def, "vfeatures").filter(r => r["Vehicle ID"] === v["Vehicle ID"]);
   const changes = [];
   have.forEach(r => {
      if (!(r["Feature ID"] in want)) return;
      if (String(r["Value"] || "") !== want[r["Feature ID"]]) { modChange_(def, "vfeatures", r, { "Value": want[r["Feature ID"]] }, user); changes.push(vehFeatureName_(def, r["Feature ID"]) + " = " + want[r["Feature ID"]]); }
   });
   const add = Object.keys(want).filter(fid => !have.some(r => r["Feature ID"] === fid))
      .map(fid => ({ "Vehicle ID": v["Vehicle ID"], "Feature ID": fid, "Value": want[fid] }));
   if (add.length) modBulkInsert_(def, "vfeatures", add, user);
   const gone = have.filter(r => !(r["Feature ID"] in want)).sort((a, b) => b._row - a._row);
   gone.forEach(r => { modForget_(def, "vfeatures"); const cur = modRows_(def, "vfeatures").find(x => x["Vehicle Feature ID"] === r["Vehicle Feature ID"]); if (cur) modRemoveRow_(def, "vfeatures", cur); });
   if (add.length || gone.length) modLog_(def, user, "Edit", tf.label, modTitle_(def, tv, v),
      [add.length ? "Added: " + add.map(a => vehFeatureName_(def, a["Feature ID"])).join(", ") : "", gone.length ? "Removed: " + gone.map(g => vehFeatureName_(def, g["Feature ID"])).join(", ") : ""].filter(Boolean).join("; "));
   return { added: add.length, removed: gone.length, changed: changes.length };
}

// ------------------------------------------------------------
// Home: Due Soon and the tile summary
// ------------------------------------------------------------
function vehiclesHome_(user, days) {
   const out = { dueSoon: [] };
   const see = a => coreCan_(user, "vehicles", a, "view");
   if (!see("vehicles") && !see("service") && !see("insurance")) return out;
   const def = vehiclesDef_();
   modPrefetch_(def);
   const today = vehToday_(), horizon = vehAddDays_(today, days || 30);
   const users = coreGetUsers_();
   const active = modRows_(def, "vehicles").filter(v => String(v["Status"] || "Active") !== "Sold");
   const push = (v, title, date, href, estimated) => {
      const owner = String(v["Primary Driver"] || ""), ou = users.find(u => u.id === owner);
      out.dueSoon.push({ title: title + " · " + vehName_(v), when: (date < today ? "Overdue since " : "Due ") + vehNiceDate_(date) + (estimated ? " (estimated from mileage)" : ""),
         sortKey: date, href: href, owner: owner, ownerName: ou ? ou.name : "" });
   };
   let dueCount = 0;
   active.forEach(v => {
      const vid = v["Vehicle ID"], vh = "#/vehicles/v/" + encodeURIComponent(vid);
      if (see("service")) {
         vehIntervalStatus_(def, v, days).filter(s => s.dueDate && s.dueDate <= horizon)
            .forEach(s => { push(v, s.action, s.dueDate, vh + "/service", s.estimated); dueCount++; });
         const visits = {};
         modRows_(def, "visits").filter(x => x["Vehicle ID"] === vid).forEach(x => visits[x["Visit ID"]] = x);
         modRows_(def, "lines").filter(l => visits[l["Visit ID"]] && l["Follow Up Date"] && l["Follow Up Done"] !== true && l["Follow Up Date"] <= horizon)
            .forEach(l => { push(v, "Follow up: " + (l["Follow Up"] || "service"), l["Follow Up Date"], "#/vehicles/visit/" + encodeURIComponent(l["Visit ID"])); dueCount++; });
      }
      if (see("insurance")) {
         const cur = vehCurrentCard_(def, vid, today);
         const hasCards = modRows_(def, "cards").some(c => c["Vehicle ID"] === vid);
         if (cur && cur.policy["End Date"] <= horizon) { push(v, "Insurance expires", cur.policy["End Date"], vh + "/insurance"); dueCount++; }
         else if (!cur && hasCards) {
            const last = modRows_(def, "cards").filter(c => c["Vehicle ID"] === vid).map(c => vehFind_(def, "policies", c["Policy ID"]))
               .filter(p => p && !p["Deleted"] && p["End Date"] < today).sort((a, b) => String(b["End Date"]).localeCompare(String(a["End Date"])))[0];
            if (last) { push(v, "Insurance expired", last["End Date"], vh + "/insurance"); dueCount++; }
         }
         const reg = modRows_(def, "registrations").filter(r => r["Vehicle ID"] === vid).sort((a, b) => String(b["Expires"]).localeCompare(String(a["Expires"])))[0];
         if (reg && reg["Expires"] <= horizon) { push(v, "Registration expires", reg["Expires"], vh + "/insurance"); dueCount++; }
      }
      if (see("vehicles")) {
         if (v["Smog Due"] && v["Smog Due"] <= horizon && v["Smog Due"] >= vehAddDays_(today, -365)) { push(v, "Smog check", v["Smog Due"], vh); dueCount++; }
         if (v["Lease End Date"] && v["Lease End Date"] <= horizon && v["Lease End Date"] >= today) { push(v, "Lease ends", v["Lease End Date"], vh); dueCount++; }
      }
   });
   out.summary = active.length + (active.length === 1 ? " vehicle" : " vehicles") + (dueCount ? " · " + dueCount + " due soon" : "");
   return out;
}

// ------------------------------------------------------------
// Setup (run once from the script editor; safe to run again: only adds what's missing).
// Links the spreadsheet on the Modules tab, turns the module on, builds the tabs, fills the
// dropdowns, actions and features, adds the four vehicles with their standard features and
// manufacturer intervals, and sets Vehicles access (Brittany Editor; Jasper, Connor, Toby Viewer).
// ------------------------------------------------------------
const VEH_SEED = {
   lists: {
      "Make": ["Ford", "Kia", "Nissan"],
      "Status": ["Active", "Sold"],
      "Condition": ["New", "Used", "Certified Pre-Owned"],
      "Purchase Type": ["Cash", "Finance", "Lease"],
      "Fuel Type": ["Electric", "Gasoline"],
      "Drivetrain": ["4WD", "AWD", "FWD", "RWD"],
      "Plate Type": ["Standard", "Personalized", "Temporary"],
      "Place Type": ["Dealership", "Service Shop", "Insurance Carrier", "DMV / Smog"],
      "Service Category": ["Maintenance", "Tires", "Repair", "Inspection", "Detail/Wash", "Recall"],
      "Part": ["Cabin Air Filter", "Engine Air Filter", "Oil Filter", "Spark Plugs", "Brake Pads – Front", "Brake Pads – Rear", "Tires", "12V Battery", "Headlight Bulbs"]
   },
   actions: {
      "Maintenance": ["Oil Change", "Tire Rotation", "Air Filter", "Cabin Filter", "Wiper Blades", "Brake Fluid", "Coolant", "Transmission Fluid", "Spark Plugs", "Battery"],
      "Tires": ["New Tires", "Alignment", "Balance", "Flat Repair"],
      "Repair": ["Brakes", "Suspension", "Electrical", "Engine", "Body"],
      "Inspection": ["Smog Check", "Multi-point Inspection"]
   },
   features: [
      ["Adaptive Cruise Control", "Yes/No"], ["Apple CarPlay / Android Auto", "Value"], ["Backup Camera", "Yes/No"],
      ["Battery Capacity", "Value"], ["Blind Spot Monitor", "Yes/No"], ["Cruise Control", "Yes/No"], ["Heated Front Seats", "Yes/No"],
      ["Heated Steering Wheel", "Yes/No"], ["Lane Keep Assist", "Yes/No"], ["Limited-Slip Differential", "Yes/No"], ["Navigation", "Yes/No"],
      ["Parking Sensors", "Value"], ["Power Convertible Top", "Yes/No"], ["Premium Audio", "Value"], ["Push-Button Start", "Yes/No"],
      ["Rear Cross Traffic Alert", "Yes/No"], ["Remote Keyless Entry", "Yes/No"], ["Remote Start", "Yes/No"], ["Sunroof", "Yes/No"],
      ["Tire Size", "Value"], ["Tow Hitch", "Yes/No"], ["Ventilated Front Seats", "Yes/No"], ["Wireless Phone Charging", "Yes/No"],
      ["Xenon (HID) Headlights", "Yes/No"]
   ],
   // Features: standard on that model/trim only. Intervals: [action, miles, months, source].
   vehicles: [
      { values: { "Year": 2025, "Make": "Kia", "Model": "EV6", "Trim": "GT-Line", "Primary Driver": "USR-1", "Status": "Active", "Fuel Type": "Electric",
          "Notes": "The 2025 GT-Line came RWD (235/55R19 tires) or AWD (255/45R20 tires): set Drivetrain and add the Tire Size feature to match." },
        features: [["Adaptive Cruise Control"], ["Apple CarPlay / Android Auto", "Wireless"], ["Backup Camera"], ["Battery Capacity", "84 kWh"],
          ["Blind Spot Monitor"], ["Heated Front Seats"], ["Parking Sensors", "Front & rear"], ["Premium Audio", "Meridian"],
          ["Rear Cross Traffic Alert"], ["Sunroof"], ["Ventilated Front Seats"], ["Wireless Phone Charging"]],
        intervals: [["Tire Rotation", 8000, 12, "Kia EV6 owner's manual"], ["Cabin Filter", 16000, 24, "Kia EV6 owner's manual"],
          ["Brake Fluid", 48000, 48, "Kia EV6 owner's manual"], ["Coolant", 120000, 120, "Kia EV6 owner's manual (first change; then every 24,000 mi / 24 mo)"]] },
      { values: { "Year": 2025, "Make": "Ford", "Model": "F-150 Lightning", "Trim": "Pro", "Primary Driver": "USR-2", "Status": "Active", "Fuel Type": "Electric", "Drivetrain": "4WD",
          "Notes": "Pro came with the 98 kWh standard-range battery; the extended-range battery was an option." },
        features: [["Apple CarPlay / Android Auto", "Wireless"], ["Backup Camera"], ["Blind Spot Monitor"], ["Cruise Control"], ["Heated Front Seats"],
          ["Lane Keep Assist"], ["Parking Sensors", "Rear"], ["Rear Cross Traffic Alert"], ["Tire Size", "275/65R18"]],
        intervals: [["Tire Rotation", 10000, 12, "Ford EV maintenance schedule"], ["Cabin Filter", 20000, "", "Ford EV maintenance schedule"],
          ["Brake Fluid", "", 36, "Ford (every 3 years)"], ["Coolant", 200000, "", "Ford EV maintenance schedule"]] },
      { values: { "Year": 2022, "Make": "Kia", "Model": "Niro EV", "Primary Driver": "USR-4", "Status": "Active", "Fuel Type": "Electric", "Drivetrain": "FWD",
          "Notes": "Trim not set (EX or EX Premium). Features listed are standard on the EX; the EX Premium adds a sunroof, ventilated front seats and rear parking sensors." },
        features: [["Adaptive Cruise Control"], ["Apple CarPlay / Android Auto", "Wired"], ["Backup Camera"], ["Battery Capacity", "64 kWh"], ["Blind Spot Monitor"],
          ["Heated Front Seats"], ["Lane Keep Assist"], ["Navigation"], ["Premium Audio", "Harman Kardon"], ["Push-Button Start"],
          ["Rear Cross Traffic Alert"], ["Remote Start"], ["Wireless Phone Charging"]],
        intervals: [["Tire Rotation", 7500, "", "Kia Niro EV owner's manual"], ["Cabin Filter", 15000, 24, "Kia Niro EV owner's manual"],
          ["Brake Fluid", 60000, 48, "Kia Niro EV owner's manual"]] },
      { values: { "Year": 2007, "Make": "Nissan", "Model": "350Z", "Trim": "Roadster", "Primary Driver": "USR-5", "Status": "Active", "Fuel Type": "Gasoline", "Drivetrain": "RWD",
          "Oil Type": "5W-30",
          "Notes": "Premium fuel recommended. Roadster trim (Enthusiast, Touring or Grand Touring) not set; features listed are standard on all three. Nissan's schedule doesn't call for tire rotation on the 350Z." },
        features: [["Cruise Control"], ["Limited-Slip Differential"], ["Power Convertible Top"], ["Remote Keyless Entry"], ["Xenon (HID) Headlights"]],
        intervals: [["Oil Change", 7500, 6, "Nissan 350Z maintenance schedule"], ["Air Filter", 30000, 24, "Nissan 350Z maintenance schedule"],
          ["Cabin Filter", 15000, 12, "Nissan 350Z maintenance schedule"], ["Spark Plugs", 105000, 84, "Nissan 350Z maintenance schedule"],
          ["Coolant", 60000, 48, "Nissan 350Z maintenance schedule (first change; then every 30,000 mi / 24 mo)"], ["Smog Check", "", 24, "California smog check (every 2 years)"]] }
   ],
   access: [["USR-2", "Editor"], ["USR-3", "Viewer"], ["USR-4", "Viewer"], ["USR-5", "Viewer"]]
};

function vehiclesSetup() {
   const core = coreSheet_(CORE_CONFIG.tabs.modules);
   const mods = coreTable_(CORE_CONFIG.tabs.modules);
   const row = mods.rows.find(r => r["Module Key"] === "vehicles");
   if (!row) throw new Error("There's no vehicles row on the Modules tab.");
   const hm = coreHeaderMap_(core).map;
   if (!String(row["Spreadsheet ID"] || "").trim()) core.getRange(row._row, hm["spreadsheet id"]).setValue(VEHICLES_SPREADSHEET_ID);
   if (String(row["Status"] || "").trim() !== "Active") core.getRange(row._row, hm["status"]).setValue("Active");
   CORE_GRID = {}; MOD_SS = {}; MOD_ROWS = {};
   const def = vehiclesDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   const out = [];
   const lists = [];
   Object.keys(VEH_SEED.lists).forEach(l => VEH_SEED.lists[l].forEach(v => lists.push({ "List": l, "Value": v, "Sort": "" })));
   out.push("Lists: " + modSeed_(def, "lists", lists, owner));
   const actions = [];
   Object.keys(VEH_SEED.actions).forEach(c => VEH_SEED.actions[c].forEach(a => actions.push({ "Category": c, "Action": a })));
   out.push("Actions: " + modSeed_(def, "actions", actions, owner));
   out.push("Features: " + modSeed_(def, "features", VEH_SEED.features.map(f => ({ "Feature": f[0], "Kind": f[1] })), owner));
   if (!modRows_(def, "vehicles", true).length) {
      const ids = modBulkInsert_(def, "vehicles", VEH_SEED.vehicles.map(v => v.values), owner);
      const feats = modRows_(def, "features"), acts = modRows_(def, "actions");
      const vf = [], iv = [];
      VEH_SEED.vehicles.forEach((v, i) => {
         v.features.forEach(f => {
            const ft = feats.find(x => x["Feature"] === f[0]);
            if (!ft) throw new Error("Unknown feature " + f[0]);
            vf.push({ "Vehicle ID": ids[i], "Feature ID": ft["Feature ID"], "Value": f[1] || "" });
         });
         v.intervals.forEach(x => {
            const a = acts.find(y => y["Action"] === x[0]);
            if (!a) throw new Error("Unknown action " + x[0]);
            iv.push({ "Vehicle ID": ids[i], "Action ID": a["Action ID"], "Miles": x[1], "Months": x[2], "Source": x[3] });
         });
      });
      modBulkInsert_(def, "vfeatures", vf, owner);
      modBulkInsert_(def, "intervals", iv, owner);
      out.push("Vehicles: " + ids.join(", ") + " · features " + vf.length + " · intervals " + iv.length);
   } else out.push("Vehicles already there");
   out.push(vehiclesSetAccess_(owner));
   coreFlushLog_();
   const ss = modSs_("vehicles");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   // Touch each Drive folder once so the Drive permission is asked for during setup.
   Object.keys(VEHICLES_FOLDERS).forEach(k => DriveApp.getFolderById(VEHICLES_FOLDERS[k].id).getName());
   SpreadsheetApp.flush();
   console.log("Vehicles setup done | " + out.join(" | "));
   return out.join(" | ");
}

// One-time update to the answers of 11/24 (safe to run again): Parts tab and its Part dropdown,
// and separate wiper size columns (driver, passenger, rear). The old Wiper Sizes column was never used.
function vehiclesUpgrade() {
   CORE_GRID = {}; MOD_SS = {}; MOD_ROWS = {};
   const def = vehiclesDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   const have = modRows_(def, "lists", true).filter(r => r["List"] === "Part").map(r => String(r["Value"]).toLowerCase());
   const add = VEH_SEED.lists["Part"].filter(v => have.indexOf(v.toLowerCase()) === -1).map(v => ({ "List": "Part", "Value": v, "Sort": "" }));
   if (add.length) modBulkInsert_(def, "lists", add, owner);
   const sheet = modSs_("vehicles").getSheetByName("Vehicles");
   const hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
   const old = hdr.indexOf("Wiper Sizes") + 1;
   let removed = "kept";
   if (old && sheet.getLastRow() > 1 && sheet.getRange(2, old, sheet.getLastRow() - 1, 1).getValues().every(r => String(r[0]).trim() === "")) { sheet.deleteColumn(old); removed = "removed (it was empty)"; }
   SpreadsheetApp.flush();
   const out = "Parts tab ready · Part values added: " + add.length + " · old Wiper Sizes column " + (old ? removed : "not there");
   console.log(out);
   return out;
}

// Module-level Vehicles roles from VEH_SEED.access (area rows for Vehicles are left as they are).
function vehiclesSetAccess_(owner) {
   const sheet = coreSheet_(CORE_CONFIG.tabs.perms);
   const hm = coreHeaderMap_(sheet).map;
   const users = coreGetUsers_(true);
   const done = [];
   VEH_SEED.access.forEach(a => {
      CORE_PERMS = null; CORE_GRID = {};
      const p = coreGetPerms_().find(x => x.userId === a[0] && x.module === "vehicles" && !x.area);
      const name = (users.find(u => u.id === a[0]) || {}).name || a[0];
      if (p && p.role === a[1]) return;
      if (p) sheet.getRange(p.row, hm["role"]).setValue(a[1]);
      else coreAppendRow_(sheet, { "User ID": a[0], "Module Key": "vehicles", "Area Key": "", "Role": a[1] });
      coreLog_(owner, "core", "Permissions", name, "Vehicles", "Role: " + (p ? p.role + " → " : "") + a[1], true);
      done.push(name + " " + a[1]);
   });
   CORE_PERMS = null; CORE_GRID = {};
   const areaRows = coreGetPerms_().filter(x => x.module === "vehicles" && x.area).map(x => x.userId + "/" + x.area + "=" + x.role);
   return "Access: " + (done.join(", ") || "already set") + (areaRows.length ? " · area rows kept: " + areaRows.join(", ") : "");
}
