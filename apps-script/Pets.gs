// =========================================================
// AYERS HOUSEHOLD - PETS MODULE
// =========================================================
// Data lives in the "Ayers Household - Pets" spreadsheet (Pets folder). For the household's pets
// (not the aquariums): details, food, weights, vet visits, treatments with intervals (flea & tick,
// heartworm, vaccines, grooming...), medications and refills.
//
// Areas (set per person on Permissions):
//   pets    pets, their details, food and weights; places (vets, groomers, boarding, stores)
//   visits  vet visits (with records), follow-ups
//   care    treatments each pet gets (every N days / weeks / months / years), the log of when
//           they were given, medications and refills
//
// A treatment's next due date = the last time it was given (or the "last given" date typed on the
// schedule) + its interval. Due treatments, visit follow-ups and refills become tasks for the
// person who handles them (a few days before) and show on Home ▸ Due Soon. Ticking the task done
// logs the treatment (given today), closes the follow-up, or counts the refill.
// Files (photos, records, certificates) go to the Pets folder in Drive, one sub-folder per type,
// named like "PET-1 Apollo – Vet Record – 2026-11-25", and are shown only through the app.
// Run petsSetup() once from the script editor.
// =========================================================

const PETS_SPREADSHEET_ID = "1WThgDrdICNbWeVd6F_XJQHRU8y1Bp_Qlhs605Yglrdk";
const PETS_FOLDER_ID = "1q9AXZF9lkMoSKZpPMCfI0ZC7z6NTR1MO";
const PETS_FOLDERS = {
   pets:   { id: "1UbG55-3NUnaP-aSksEC1YcYXRqrkSvhC", label: "Photo" },
   visits: { id: "1gnZQFTdql-ldLiDiGjuUx0ut2gBUM5TT", label: "Vet Record" },
   logs:   { id: "1DEA5XmTyQlDspNL9LS8yKGS6IdhpmRYh", label: "Treatment Record" }
};
const PETS_UNITS = ["Days", "Weeks", "Months", "Years"];

function petsDef_() {
   return {
      key: "pets",
      name: "Pets",
      areas: ["pets", "visits", "care"],
      tables: {
         pets: { tab: "Pets", label: "Pets", id: "Pet ID", prefix: "PET-", kind: "record", area: "pets",
            title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true },
               { name: "Species", type: "list", list: "Species", required: true, default: "Dog" },
               { name: "Breed", type: "list", list: "Breed" },
               { name: "Sex", type: "choice", options: ["Male", "Female"] },
               { name: "Fixed", label: "Spayed / neutered", type: "bool" },
               { name: "Birth Date", type: "date" },
               { name: "Birth Date Approximate", label: "Birth date is approximate", type: "bool" },
               { name: "Adoption Date", type: "date" },
               { name: "Color", label: "Color / markings", type: "text" },
               { name: "Microchip", label: "Microchip number", type: "text" },
               { name: "License Number", label: "County license number", type: "text" },
               { name: "License Expires", type: "date" },
               { name: "Insurance Company", type: "text" },
               { name: "Insurance Policy", type: "text" },
               { name: "Primary Person", type: "user", hint: "Gets the reminders (unless a treatment says otherwise)" },
               { name: "Status", type: "list", list: "Status", required: true, default: "Active" },
               { name: "Food Brand", type: "list", list: "Food Brand" },
               { name: "Food Amount", label: "Amount per meal", type: "number" },
               { name: "Food Unit", type: "list", list: "Food Unit" },
               { name: "Meals Per Day", type: "number" },
               { name: "Photo", type: "file" },
               { name: "Notes", type: "longtext" }
            ] },
         weights: { tab: "Weights", label: "Weights", id: "Weight ID", prefix: "WGT-", kind: "record", area: "pets",
            title: r => r["Weight"] + " lb",
            fields: [
               { name: "Pet ID", label: "Pet", type: "ref", ref: "pets", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Weight", label: "Weight (lb)", type: "number", required: true },
               { name: "Notes", type: "text" }
            ] },
         places: { tab: "Places", label: "Places", id: "Place ID", prefix: "PPL-", kind: "list", area: "pets",
            unique: ["Name"], title: r => r["Name"],
            fields: [
               { name: "Name", type: "text", required: true },
               { name: "Type", type: "list", list: "Place Type", required: true, default: "Vet" },
               { name: "Phone", type: "text" },
               { name: "Address", type: "text" },
               { name: "Website", type: "url" },
               { name: "Notes", type: "longtext" }
            ] },
         visits: { tab: "Vet Visits", label: "Vet Visits", id: "Visit ID", prefix: "VIS-", kind: "record", area: "visits",
            title: r => [r["Reason"], vehNiceDate_(petsIso_(r["Date"]))].filter(Boolean).join(" · "),
            fields: [
               { name: "Pet ID", label: "Pet", type: "ref", ref: "pets", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Time", type: "time" },
               { name: "Vet", type: "ref", ref: "places", hint: "From Places" },
               { name: "Reason", type: "list", list: "Visit Reason", required: true, default: "Checkup" },
               { name: "Cost", type: "money" },
               { name: "Records", label: "Records / invoice", type: "file" },
               { name: "Notes", type: "longtext" },
               { name: "Follow Up", type: "text", hint: "What to do next" },
               { name: "Follow Up Date", type: "date" },
               { name: "Follow Up Done", type: "bool" }
            ] },
         treatments: { tab: "Treatments", label: "Treatments", id: "Treatment ID", prefix: "TRT-", kind: "list", area: "care",
            unique: ["Treatment"], title: r => r["Treatment"],
            fields: [
               { name: "Treatment", type: "text", required: true },
               { name: "Kind", type: "choice", options: ["Preventive", "Vaccine", "Grooming", "Other"], required: true, default: "Preventive" },
               { name: "Default Every", type: "number", hint: "Suggested interval for new schedules" },
               { name: "Default Unit", type: "choice", options: PETS_UNITS }
            ] },
         schedules: { tab: "Pet Treatments", label: "Pet Treatments", id: "Schedule ID", prefix: "PTS-", kind: "record", area: "care",
            unique: ["Pet ID", "Treatment ID"], title: (r, def) => petsTreatmentName_(def, r["Treatment ID"]),
            fields: [
               { name: "Pet ID", label: "Pet", type: "ref", ref: "pets", required: true },
               { name: "Treatment ID", label: "Treatment", type: "ref", ref: "treatments", required: true },
               { name: "Every", type: "number", required: true },
               { name: "Unit", type: "choice", options: PETS_UNITS, required: true, default: "Months" },
               { name: "Last Given", type: "date", hint: "Only if it isn't in the log yet" },
               { name: "Person", label: "Handled by", type: "user", hint: "Blank = the pet's primary person" },
               { name: "Remind Days", label: "Remind days before", type: "number", default: 3 },
               { name: "Active", label: "Still given", type: "bool", default: true },
               { name: "Notes", type: "text" }
            ] },
         logs: { tab: "Treatment Log", label: "Treatment Log", id: "Log ID", prefix: "TLG-", kind: "record", area: "care",
            title: (r, def) => petsTreatmentName_(def, r["Treatment ID"]) + " · " + vehNiceDate_(petsIso_(r["Date"])),
            fields: [
               { name: "Pet ID", label: "Pet", type: "ref", ref: "pets", required: true },
               { name: "Treatment ID", label: "Treatment", type: "ref", ref: "treatments", required: true },
               { name: "Date", type: "date", required: true },
               { name: "Given By", type: "user" },
               { name: "Visit ID", label: "Vet visit", type: "ref", ref: "visits" },
               { name: "Cost", type: "money" },
               { name: "Record", label: "Certificate / record", type: "file" },
               { name: "Notes", type: "text" }
            ] },
         meds: { tab: "Medications", label: "Medications", id: "Medication ID", prefix: "MED-", kind: "record", area: "care",
            title: r => r["Medication"],
            fields: [
               { name: "Pet ID", label: "Pet", type: "ref", ref: "pets", required: true },
               { name: "Medication", type: "text", required: true },
               { name: "Dose", type: "text", hint: "e.g. 1 tablet" },
               { name: "Frequency", label: "How often", type: "list", list: "Med Frequency", required: true, default: "Once daily" },
               { name: "Start Date", type: "date" },
               { name: "End Date", type: "date", hint: "Blank = ongoing" },
               { name: "Prescribed By", type: "ref", ref: "places" },
               { name: "Pharmacy", type: "ref", ref: "places" },
               { name: "Refills Left", type: "number" },
               { name: "Next Refill", label: "Next refill date", type: "date" },
               { name: "Person", label: "Handled by", type: "user", hint: "Blank = the pet's primary person" },
               { name: "Remind Days", label: "Remind days before", type: "number", default: 3 },
               { name: "Notes", type: "longtext" }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "pets",
            listAreas: { "Visit Reason": "visits", "Med Frequency": "care" },
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Species", "Breed", "Status", "Place Type", "Visit Reason", "Food Brand", "Food Unit", "Med Frequency"],
      beforeSave: petsBeforeSave_,
      afterSave: petsAfterSave_,
      afterDelete: petsAfterDelete_,
      home: petsHome_,
      actions: {
         load:      { fn: petsLoad_ },
         file:      { fn: petsFile_ },
         upload:    { fn: petsUpload_, write: true },
         clearFile: { fn: petsClearFile_, write: true },
         saveVisit: { fn: petsSaveVisit_, write: true },
         give:      { fn: petsGive_, write: true },
         followUp:  { fn: petsFollowUp_, write: true }
      }
   };
}

// ------------------------------------------------------------
// Names, dates, due dates
// ------------------------------------------------------------
const petsIso_ = v => vehIso_(v);
function petsTreatmentName_(def, id) { const r = vehFind_(def, "treatments", id); return r ? r["Treatment"] : id || ""; }
function petsPetName_(def, id) { const r = vehFind_(def, "pets", id); return r ? r["Name"] : id || ""; }
function petsAdd_(iso, n, unit) {
   n = Math.max(1, Math.round(Number(n) || 1));
   if (unit === "Days") return vehAddDays_(iso, n);
   if (unit === "Weeks") return vehAddDays_(iso, 7 * n);
   if (unit === "Years") return vehAddMonths_(iso, 12 * n);
   return vehAddMonths_(iso, n);
}
const petsActivePet_ = p => String(p["Status"] || "Active") === "Active";

// Each schedule's last given date and next due date. Returns { [Schedule ID]: { last, logId, next, state } }.
function petsStatus_(def, days) {
   const today = vehToday_(), horizon = vehAddDays_(today, days || 30);
   const logs = modRows_(def, "logs");
   const out = {};
   modRows_(def, "schedules").forEach(s => {
      let last = null;
      logs.filter(l => l["Pet ID"] === s["Pet ID"] && l["Treatment ID"] === s["Treatment ID"])
         .forEach(l => { if (!last || String(l["Date"]) > last.date) last = { date: petsIso_(l["Date"]), id: l["Log ID"] }; });
      const base = last ? last.date : petsIso_(s["Last Given"]);
      const next = base && s["Active"] !== false ? petsAdd_(base, s["Every"], s["Unit"]) : "";
      out[s["Schedule ID"]] = { last: last ? last.date : (base || ""), logId: last ? last.id : "", next: next,
         state: s["Active"] === false ? "off" : !next ? "unknown" : next < today ? "overdue" : next <= horizon ? "soon" : "ok" };
   });
   return out;
}
// Who handles a schedule or medication: its own person, else the pet's primary person.
function petsPerson_(def, row) {
   if (row["Person"]) return row["Person"];
   const p = vehFind_(def, "pets", row["Pet ID"]);
   return (p && p["Primary Person"]) || "";
}

// ------------------------------------------------------------
// Reminders as tasks (Tasks module)
//   pets:sched:<Schedule ID>  next due treatment     (done = logged as given today)
//   pets:visit:<Visit ID>     visit follow-up         (done = follow-up done)
//   pets:med:<Medication ID>  refill                  (done = refill counted)
// ------------------------------------------------------------
function petsTasksOn_() { return typeof tasksActive_ === "function" && tasksActive_(); }
function petsSchedTask_(def, sched, user) {
   if (!petsTasksOn_() || !sched) return;
   const key = "pets:sched:" + sched["Schedule ID"];
   try {
      const pet = vehFind_(def, "pets", sched["Pet ID"]);
      const st = petsStatus_(def)[sched["Schedule ID"]] || {};
      if (!pet || pet["Deleted"] || !petsActivePet_(pet) || sched["Deleted"] || sched["Active"] === false || !st.next) { tasksUpsertAuto_(key, null, user); return; }
      const days = sched["Remind Days"] === "" || sched["Remind Days"] === undefined ? 3 : Math.max(0, Number(sched["Remind Days"]) || 0);
      const name = petsTreatmentName_(def, sched["Treatment ID"]);
      tasksUpsertAuto_(key, {
         "Title": name + " · " + pet["Name"], "Notes": "Due " + vehNiceDate_(st.next) + (st.last ? " (last given " + vehNiceDate_(st.last) + ")" : "") + ". Ticking this task logs it as given today.",
         "Assigned To": petsPerson_(def, sched), "Due Date": vehAddDays_(st.next, -days), "Category": "Pets", "Source": "Pets " + sched["Schedule ID"],
         "Done": false   // a new next due date = open again
      }, user);
   } catch (e) { console.warn("Pets task not updated: " + e); }
}
function petsVisitTask_(def, v, user) {
   if (!petsTasksOn_() || !v) return;
   const key = "pets:visit:" + v["Visit ID"];
   try {
      if (!v["Follow Up Date"] || v["Deleted"]) { tasksUpsertAuto_(key, null, user); return; }
      const pet = vehFind_(def, "pets", v["Pet ID"]) || {};
      tasksUpsertAuto_(key, {
         "Title": (v["Follow Up"] || "Follow up") + " · " + (pet["Name"] || ""), "Notes": "Follow-up from vet visit " + v["Visit ID"] + " on " + vehNiceDate_(petsIso_(v["Date"])) + ".",
         "Assigned To": pet["Primary Person"] || "", "Due Date": petsIso_(v["Follow Up Date"]), "Category": "Pets", "Source": "Pets " + v["Visit ID"],
         "Done": v["Follow Up Done"] === true
      }, user);
   } catch (e) { console.warn("Pets task not updated: " + e); }
}
function petsMedTask_(def, m, user) {
   if (!petsTasksOn_() || !m) return;
   const key = "pets:med:" + m["Medication ID"];
   try {
      const ended = m["End Date"] && petsIso_(m["End Date"]) < vehToday_();
      if (!m["Next Refill"] || m["Deleted"] || ended) { tasksUpsertAuto_(key, null, user); return; }
      const pet = vehFind_(def, "pets", m["Pet ID"]) || {};
      const days = m["Remind Days"] === "" || m["Remind Days"] === undefined ? 3 : Math.max(0, Number(m["Remind Days"]) || 0);
      tasksUpsertAuto_(key, {
         "Title": "Refill " + m["Medication"] + " · " + (pet["Name"] || ""),
         "Notes": "Refill by " + vehNiceDate_(petsIso_(m["Next Refill"])) + (m["Refills Left"] !== "" ? " (" + m["Refills Left"] + " refills left)" : "") + ". Ticking this task counts the refill.",
         "Assigned To": petsPerson_(def, m), "Due Date": vehAddDays_(petsIso_(m["Next Refill"]), -days), "Category": "Pets", "Source": "Pets " + m["Medication ID"],
         "Done": false
      }, user);
   } catch (e) { console.warn("Pets task not updated: " + e); }
}
// Every schedule of a pet (after a log entry, a pet's status or primary person changes).
function petsPetTasks_(def, petId, user) {
   modRows_(def, "schedules", true).filter(s => s["Pet ID"] === petId).forEach(s => petsSchedTask_(def, s, user));
   modRows_(def, "meds", true).filter(m => m["Pet ID"] === petId).forEach(m => petsMedTask_(def, m, user));
}
// Called by Tasks when a Pets task is ticked done.
function petsTaskDone_(key, user) {
   const def = petsDef_();
   const m = /^(sched|visit|med):(.+)$/.exec(String(key));
   if (!m) return;
   if (m[1] === "sched") {
      const s = modRows_(def, "schedules").find(x => x["Schedule ID"] === m[2]);
      if (!s) return;
      modInsert_(def, "logs", { "Pet ID": s["Pet ID"], "Treatment ID": s["Treatment ID"], "Date": coreDate_(vehToday_()), "Given By": user.id, "Notes": "From the task list" }, user);
      modForget_(def, "logs");
      petsSchedTask_(def, s, user);   // the next one
   } else if (m[1] === "visit") {
      const v = modRows_(def, "visits").find(x => x["Visit ID"] === m[2]);
      if (v && v["Follow Up Done"] !== true) modChange_(def, "visits", v, { "Follow Up Done": true }, user, "Follow-up done");
   } else {
      const med = modRows_(def, "meds").find(x => x["Medication ID"] === m[2]);
      if (!med) return;
      const ch = { "Next Refill": "" };
      if (med["Refills Left"] !== "" && Number(med["Refills Left"]) > 0) ch["Refills Left"] = Number(med["Refills Left"]) - 1;
      modChange_(def, "meds", med, ch, user, "Refilled");
   }
}

// ------------------------------------------------------------
// Save rules
// ------------------------------------------------------------
function petsBeforeSave_(tableKey, values, before, user) {
   const merged = Object.assign({}, before || {}, values);
   if (tableKey === "schedules") {
      const n = Number(merged["Every"]);
      if (!(n >= 1 && n === Math.round(n))) throw coreError_("INVALID", "Every must be a whole number, 1 or more.");
   }
   if (tableKey === "weights" && "Weight" in values && !(Number(values["Weight"]) > 0)) throw coreError_("INVALID", "Weight must be more than 0.");
   if (tableKey === "meds" && merged["Start Date"] && merged["End Date"] && petsIso_(merged["End Date"]) < petsIso_(merged["Start Date"])) throw coreError_("INVALID", "The end date is before the start date.");
   if ((tableKey === "schedules" || tableKey === "meds") && "Remind Days" in values && values["Remind Days"] !== "") {
      const d = Number(values["Remind Days"]);
      if (!(d >= 0 && d <= 60 && d === Math.round(d))) throw coreError_("INVALID", "Remind days must be a whole number from 0 to 60.");
   }
   if (tableKey === "visits" && "Follow Up Date" in values && values["Follow Up Date"] && !String(merged["Follow Up"] || "").trim()) values["Follow Up"] = "Follow up";
   return values;
}
function petsAfterSave_(tableKey, id, values, before, user) {
   const def = petsDef_();
   const fresh = t => { modForget_(def, t); return modRows_(def, t, true).find(r => r[def.tables[t].id] === id); };
   if (tableKey === "schedules") petsSchedTask_(def, fresh("schedules"), user);
   if (tableKey === "logs") { const l = fresh("logs"); if (l) modRows_(def, "schedules", true).filter(s => s["Pet ID"] === l["Pet ID"] && s["Treatment ID"] === l["Treatment ID"]).forEach(s => petsSchedTask_(def, s, user)); }
   if (tableKey === "meds") petsMedTask_(def, fresh("meds"), user);
   if (tableKey === "visits") petsVisitTask_(def, fresh("visits"), user);
   if (tableKey === "pets" && before && ("Status" in values || "Primary Person" in values)) petsPetTasks_(def, id, user);
}
function petsAfterDelete_(tableKey, row, user) {
   const def = petsDef_();
   if (tableKey === "schedules") petsSchedTask_(def, Object.assign({}, row, { "Deleted": true }), user);
   if (tableKey === "meds") petsMedTask_(def, Object.assign({}, row, { "Deleted": true }), user);
   if (tableKey === "visits") petsVisitTask_(def, Object.assign({}, row, { "Deleted": true }), user);
   if (tableKey === "logs") modRows_(def, "schedules").filter(s => s["Pet ID"] === row["Pet ID"] && s["Treatment ID"] === row["Treatment ID"]).forEach(s => petsSchedTask_(def, s, user));
   if (tableKey === "pets") petsPetTasks_(def, row["Pet ID"], user);
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------
function petsLoad_(req, user) {
   const def = petsDef_();
   const see = a => coreCan_(user, "pets", a, "view");
   if (!see("pets") && !see("visits") && !see("care")) throw coreError_("FORBIDDEN", "You don't have access to Pets.");
   modPrefetch_(def);
   const days = Number(user.dueSoonDays) || Number(coreGetSettings_()["Due Soon Days (default)"]) || 30;
   return {
      schema: modSchema_(def), caps: modCaps_(def, user), today: vehToday_(),
      users: coreGetUsers_().map(u => ({ id: u.id, name: u.name })),
      pets: modRows_(def, "pets"), places: modRows_(def, "places"), lists: modRows_(def, "lists"), treatments: modRows_(def, "treatments"),
      weights: see("pets") ? modRows_(def, "weights") : [],
      visits: see("visits") ? modRows_(def, "visits") : [],
      schedules: see("care") ? modRows_(def, "schedules") : [], logs: see("care") ? modRows_(def, "logs") : [], meds: see("care") ? modRows_(def, "meds") : [],
      status: see("care") ? petsStatus_(def, days) : {}, days: days
   };
}

// req: { scheduleId } or { petId, treatmentId }, date?, notes? -> logs a treatment as given.
function petsGive_(req, user) {
   const def = petsDef_(), t = def.tables.logs;
   let petId = req.petId, trtId = req.treatmentId;
   if (req.scheduleId) { const s = modFind_(def, "schedules", req.scheduleId); petId = s["Pet ID"]; trtId = s["Treatment ID"]; }
   modRequire_(user, def, t, "add", null, {});
   const values = modClean_(def, t, { "Pet ID": petId, "Treatment ID": trtId, "Date": req.date || vehToday_(), "Given By": user.id, "Notes": req.notes || "" }, user, null);
   modCheckRequired_(t, values);
   const id = modInsert_(def, "logs", values, user);
   petsAfterSave_("logs", id, values, null, user);
   return { id: id };
}

// req: { visitId?, values: { visit fields }, treatments: [Treatment ID] } -> the visit, plus a log entry
// for each treatment given at it (so their next due dates move). Unticked ones logged earlier come off.
function petsSaveVisit_(req, user) {
   const def = petsDef_(), tv = def.tables.visits;
   const before = req.visitId ? modFind_(def, "visits", req.visitId) : null;
   modRequire_(user, def, tv, before ? "edit" : "add", before, req.values || {});
   let values = modClean_(def, tv, req.values || {}, user, before);
   values = petsBeforeSave_("visits", values, before, user);
   modCheckRequired_(tv, Object.assign({}, before || {}, values));
   let id;
   if (before) { id = before["Visit ID"]; modChange_(def, "visits", before, values, user); }
   else id = modInsert_(def, "visits", values, user);
   modForget_(def, "visits");
   const visit = modRows_(def, "visits").find(v => v["Visit ID"] === id);
   const want = (req.treatments || []).filter((x, i, a) => x && a.indexOf(x) === i);
   if (want.length || before) {
      if (!coreCan_(user, "pets", "care", "add")) { if (want.length) throw coreError_("FORBIDDEN", "You can't log treatments."); }
      else {
         const have = modRows_(def, "logs").filter(l => l["Visit ID"] === id);
         want.forEach(tid => {
            if (!modRows_(def, "treatments").some(t => t["Treatment ID"] === tid)) throw coreError_("INVALID", "A treatment no longer exists. Refresh and try again.");
            const l = have.find(x => x["Treatment ID"] === tid);
            if (l) { if (petsIso_(l["Date"]) !== petsIso_(visit["Date"]) || l["Pet ID"] !== visit["Pet ID"]) modChange_(def, "logs", l, { "Date": coreDate_(petsIso_(visit["Date"])), "Pet ID": visit["Pet ID"] }, user); }
            else modInsert_(def, "logs", { "Pet ID": visit["Pet ID"], "Treatment ID": tid, "Date": coreDate_(petsIso_(visit["Date"])), "Given By": user.id, "Visit ID": id }, user);
         });
         have.filter(l => want.indexOf(l["Treatment ID"]) === -1).sort((a, b) => b._row - a._row)
            .forEach(l => modChange_(def, "logs", l, { "Deleted": true, "Deleted By": user.id, "Deleted At": new Date() }, user, "Soft delete"));
         modForget_(def, "logs");
         modRows_(def, "schedules", true).filter(s => s["Pet ID"] === visit["Pet ID"]).forEach(s => petsSchedTask_(def, s, user));
      }
   }
   petsVisitTask_(def, visit, user);
   return { id: id };
}

// req: { id, done } -> a visit's follow-up done (or reopened).
function petsFollowUp_(req, user) {
   const def = petsDef_();
   const v = modFind_(def, "visits", req.id);
   modRequire_(user, def, def.tables.visits, "edit", v, {});
   modChange_(def, "visits", v, { "Follow Up Done": !!req.done }, user, req.done ? "Follow-up done" : "Follow-up reopened");
   modForget_(def, "visits");
   petsVisitTask_(def, modRows_(def, "visits").find(x => x["Visit ID"] === req.id), user);
   return { done: !!req.done };
}

// Files: pet photo, visit records, treatment certificates.
function petsUpload_(req, user) {
   const def = petsDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f || !PETS_FOLDERS[req.table]) throw coreError_("BAD_REQUEST", "That can't have a file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   const file = req.file || {};
   if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(file.mimeType))) throw coreError_("INVALID", "Use a photo (JPG, PNG) or a PDF.");
   const bytes = Utilities.base64Decode(String(file.data || "").replace(/^data:[^,]*,/, ""));
   if (!bytes.length) throw coreError_("INVALID", "The file is empty.");
   if (bytes.length > 15 * 1024 * 1024) throw coreError_("INVALID", "That file is too large (15 MB at most).");
   const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif", "application/pdf": ".pdf" }[file.mimeType];
   const petId = req.table === "pets" ? row["Pet ID"] : row["Pet ID"];
   const date = req.table === "pets" ? vehToday_() : petsIso_(row["Date"]);
   const name = (petId + " " + petsPetName_(def, petId) + " – " + PETS_FOLDERS[req.table].label + " – " + date)
      .replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) + ext;
   const saved = DriveApp.getFolderById(PETS_FOLDERS[req.table].id).createFile(Utilities.newBlob(bytes, file.mimeType, name));
   saved.setDescription(row[t.id] + " · uploaded by " + user.name + " (" + user.id + ") via Ayers Household");
   const url = "https://drive.google.com/file/d/" + saved.getId() + "/view";
   modChange_(def, req.table, row, { [f.name]: url }, user, "Add file");
   return { url: url, name: name };
}
function petsClearFile_(req, user) {
   const def = petsDef_(), t = modTableDef_(def, req.table);
   const f = t.fields.find(x => x.name === req.field && x.type === "file");
   if (!f) throw coreError_("BAD_REQUEST", "That has no file.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row, {});
   modChange_(def, req.table, row, { [f.name]: "" }, user, "Remove file");
   return { cleared: true };
}
function petsFile_(req, user) {
   const def = petsDef_();
   const fileId = String(req.fileId || "");
   if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw coreError_("BAD_REQUEST", "Unknown file.");
   modPrefetch_(def);
   const found = Object.keys(PETS_FOLDERS).some(k => {
      const t = def.tables[k];
      if (!coreCan_(user, "pets", t.area, "view")) return false;
      const fields = t.fields.filter(f => f.type === "file").map(f => f.name);
      return modRows_(def, k).some(r => fields.some(n => String(r[n] || "").indexOf("/d/" + fileId + "/") !== -1));
   });
   if (!found) throw coreError_("NOT_FOUND", "That file isn't linked to anything you can see.");
   let blob;
   try { blob = DriveApp.getFileById(fileId).getBlob(); } catch (e) { throw coreError_("NOT_FOUND", "The file couldn't be found in Drive (it may have been moved or deleted)."); }
   return { file: { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()), name: blob.getName() } };
}

// ------------------------------------------------------------
// Home: Due Soon (treatments, follow-ups, refills, licenses) and the tile summary
// ------------------------------------------------------------
function petsHome_(user, days) {
   const out = { dueSoon: [] };
   const see = a => coreCan_(user, "pets", a, "view");
   if (!see("pets") && !see("visits") && !see("care")) return out;
   const def = petsDef_();
   modPrefetch_(def);
   const today = vehToday_(), horizon = vehAddDays_(today, days || 30);
   const users = coreGetUsers_();
   const pets = modRows_(def, "pets").filter(petsActivePet_);
   const byId = {}; pets.forEach(p => byId[p["Pet ID"]] = p);
   const push = (pet, title, date, href, owner) => {
      const ou = users.find(u => u.id === owner);
      out.dueSoon.push({ title: title + " · " + pet["Name"], when: (date < today ? "Overdue since " : "Due ") + vehNiceDate_(date), sortKey: date, href: href, owner: owner || "", ownerName: ou ? ou.name : "" });
   };
   const tasksOn = petsTasksOn_();
   let n = 0;
   if (see("care")) {
      const st = petsStatus_(def, days);
      modRows_(def, "schedules").forEach(s => {
         const pet = byId[s["Pet ID"]], x = st[s["Schedule ID"]];
         if (pet && x && x.next && x.next <= horizon) { push(pet, petsTreatmentName_(def, s["Treatment ID"]), x.next, "#/pets/p/" + encodeURIComponent(pet["Pet ID"]) + "/care", petsPerson_(def, s)); n++; }
      });
      modRows_(def, "meds").forEach(m => {
         const pet = byId[m["Pet ID"]];
         if (pet && m["Next Refill"] && petsIso_(m["Next Refill"]) <= horizon && !(m["End Date"] && petsIso_(m["End Date"]) < today)) { push(pet, "Refill " + m["Medication"], petsIso_(m["Next Refill"]), "#/pets/p/" + encodeURIComponent(pet["Pet ID"]) + "/care", petsPerson_(def, m)); n++; }
      });
   }
   if (see("visits") && !tasksOn) modRows_(def, "visits").forEach(v => {
      const pet = byId[v["Pet ID"]];
      if (pet && v["Follow Up Date"] && v["Follow Up Done"] !== true && petsIso_(v["Follow Up Date"]) <= horizon) { push(pet, "Follow up: " + (v["Follow Up"] || "vet"), petsIso_(v["Follow Up Date"]), "#/pets/visit/" + encodeURIComponent(v["Visit ID"]), pet["Primary Person"]); n++; }
   });
   if (see("pets")) pets.forEach(p => { if (p["License Expires"] && petsIso_(p["License Expires"]) <= horizon) { push(p, "License expires", petsIso_(p["License Expires"]), "#/pets/p/" + encodeURIComponent(p["Pet ID"]), p["Primary Person"]); n++; } });
   out.summary = pets.length + (pets.length === 1 ? " pet" : " pets") + (n ? " · " + n + " due soon" : "");
   return out;
}

// ------------------------------------------------------------
// Setup (run once; safe to run again: only adds what's missing). Adds the Pets module, its areas and
// access (Brittany Editor; Jasper, Connor, Toby Data Entry) to Core, builds the tabs, fills the
// dropdowns and treatments, adds Apollo and Dot, and adds a Pets category to Tasks.
// ------------------------------------------------------------
const PETS_SEED = {
   lists: {
      "Species": ["Dog", "Cat", "Bird", "Rabbit", "Reptile", "Other"],
      "Breed": ["Mixed"],
      "Status": ["Active", "Passed away", "Rehomed"],
      "Place Type": ["Vet", "Emergency Vet", "Groomer", "Boarding / Daycare", "Pet Store", "Pharmacy"],
      "Visit Reason": ["Checkup", "Vaccines", "Sick", "Injury", "Dental", "Surgery", "Other"],
      "Food Brand": [],
      "Food Unit": ["cups", "cans", "scoops", "grams", "oz"],
      "Med Frequency": ["Once daily", "Twice daily", "Three times daily", "Every other day", "Weekly", "Monthly", "As needed"]
   },
   treatments: [["Flea & Tick", "Preventive", 1, "Months"], ["Heartworm", "Preventive", 1, "Months"], ["Deworming", "Preventive", 3, "Months"],
      ["Rabies", "Vaccine", 3, "Years"], ["DHPP", "Vaccine", 3, "Years"], ["Bordetella", "Vaccine", 1, "Years"], ["Leptospirosis", "Vaccine", 1, "Years"],
      ["FVRCP", "Vaccine", 3, "Years"], ["Nail Trim", "Grooming", 4, "Weeks"], ["Grooming", "Grooming", 8, "Weeks"], ["Teeth Cleaning", "Other", 1, "Years"]],
   pets: [{ "Name": "Apollo", "Species": "Dog", "Status": "Active", "Primary Person": "USR-1" }, { "Name": "Dot", "Species": "Dog", "Status": "Active", "Primary Person": "USR-1" }],
   areas: [["pets", "pets", "Pets & Details", 10, "Pets, details, food, weights and places"], ["pets", "visits", "Vet Visits", 20, "Vet visits, records and follow-ups"],
      ["pets", "care", "Treatments & Medications", 30, "Treatment schedules, the treatment log, medications and refills"]],
   access: [["USR-2", "Editor"], ["USR-3", "Data Entry"], ["USR-4", "Data Entry"], ["USR-5", "Data Entry"]]
};
function petsSetup() {
   const out = [];
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   // Core: module row, areas, access.
   const mods = coreSheet_(CORE_CONFIG.tabs.modules), mh = coreHeaderMap_(mods).map;
   let row = coreTable_(CORE_CONFIG.tabs.modules).rows.find(r => r["Module Key"] === "pets");
   if (!row) {
      coreAppendRow_(mods, { "Module Key": "pets", "Module Name": "Pets", "Status": "Active", "Sort": 75, "Description": "Vet visits, treatments, medications and weights for the household's pets.",
         "Spreadsheet ID": PETS_SPREADSHEET_ID, "Folder ID": PETS_FOLDER_ID });
      out.push("Module added");
   } else {
      if (!String(row["Spreadsheet ID"] || "").trim()) mods.getRange(row._row, mh["spreadsheet id"]).setValue(PETS_SPREADSHEET_ID);
      if (String(row["Status"] || "").trim() !== "Active") mods.getRange(row._row, mh["status"]).setValue("Active");
   }
   CORE_GRID = {};
   const areas = coreSheet_(CORE_CONFIG.tabs.areas), have = coreTable_(CORE_CONFIG.tabs.areas).rows;
   PETS_SEED.areas.forEach(a => { if (!have.some(r => r["Module Key"] === a[0] && r["Area Key"] === a[1])) { coreAppendRow_(areas, { "Module Key": a[0], "Area Key": a[1], "Area Name": a[2], "Sort": a[3], "Description": a[4] }); out.push("Area added: " + a[2]); } });
   CORE_GRID = {}; CORE_PERMS = null;
   const perms = coreSheet_(CORE_CONFIG.tabs.perms);
   const users = coreGetUsers_(true);
   PETS_SEED.access.forEach(a => {
      if (!users.some(u => u.id === a[0]) || coreGetPerms_().some(p => p.userId === a[0] && p.module === "pets" && !p.area)) return;
      coreAppendRow_(perms, { "User ID": a[0], "Module Key": "pets", "Area Key": "", "Role": a[1] });
      coreLog_(owner, "core", "Permissions", (users.find(u => u.id === a[0]) || {}).name || a[0], "Pets", "Role: " + a[1], true);
      CORE_PERMS = null; CORE_GRID = {};
      out.push(a[0] + " " + a[1]);
   });
   CORE_GRID = {}; MOD_SS = {}; MOD_ROWS = {}; CORE_PERMS = null;
   const def = petsDef_();
   modBuildTabs_(def);
   const lists = [];
   Object.keys(PETS_SEED.lists).forEach(l => PETS_SEED.lists[l].forEach(v => lists.push({ "List": l, "Value": v, "Sort": "" })));
   out.push("Lists: " + modSeed_(def, "lists", lists, owner));
   out.push("Treatments: " + modSeed_(def, "treatments", PETS_SEED.treatments.map(t => ({ "Treatment": t[0], "Kind": t[1], "Default Every": t[2], "Default Unit": t[3] })), owner));
   out.push("Pets: " + modSeed_(def, "pets", PETS_SEED.pets, owner));
   if (petsTasksOn_()) {
      const td = tasksDef_();
      if (!modListValues_(td, "Category").some(v => v.value === "Pets")) { modBulkInsert_(td, "lists", [{ "List": "Category", "Value": "Pets", "Sort": "" }], owner); out.push("Tasks category added: Pets"); }
   }
   coreFlushLog_();
   const ss = modSs_("pets");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   Object.keys(PETS_FOLDERS).forEach(k => DriveApp.getFolderById(PETS_FOLDERS[k].id).getName());
   SpreadsheetApp.flush();
   console.log("Pets setup done | " + out.join(" | "));
   return out.join(" | ");
}
