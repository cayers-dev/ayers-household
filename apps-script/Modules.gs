// ============================================================
// AYERS HOUSEHOLD - SHARED MODULE ENGINE
//
// Every module (Travel Hockey first) keeps its data in its own
// spreadsheet (Modules tab ▸ Spreadsheet ID) and describes its tables
// here-style: tab name, ID prefix, the area that controls access, and
// its fields. This file does the rest the same way for every module:
// reading, adding, editing, soft delete / restore / permanent delete,
// dropdown lists, permission checks and the Change Log.
//
// Table kinds
//   record  things people log (earnings, expenses...). Data Entry can add
//           and change their own; deleting hides them (Admin can restore).
//   list    dropdown sources (chores, venues, list values...). Editors and
//           Admins manage them; deleting one that's in use turns it off
//           instead (it stays on old records).
//
// Every table also gets: Added By, Added At, Updated By, Updated At,
// Deleted, Deleted By, Deleted At (and Active for lists).
// ============================================================

// All module definitions, by key. (A function, not a top-level object, so
// file load order in the Apps Script project never matters.)
function modDefs_() {
   return { hockey: hockeyDef_(), shopping: shoppingDef_() };
}

const MOD_SYSTEM_COLS = ["Added By", "Added At", "Updated By", "Updated At", "Deleted", "Deleted By", "Deleted At"];

function modDef_(moduleKey) {
   const def = modDefs_()[moduleKey];
   if (!def) throw coreError_("BAD_REQUEST", "Unknown module.");
   return def;
}

function modTableDef_(def, tableKey) {
   const t = def.tables[tableKey];
   if (!t) throw coreError_("BAD_REQUEST", "Unknown table.");
   return t;
}

// Headers for a table, in the order a new tab gets them.
function modHeaders_(t) {
   return [t.id].concat(t.fields.map(f => f.name)).concat(t.kind === "list" ? ["Active"] : []).concat(MOD_SYSTEM_COLS);
}
// Headers as they actually sit on the tab (columns added later go on the end).
function modSheetHeaders_(sheet, t) {
   const row = (coreGrid_(sheet).values[0] || []).map(h => String(h).trim());
   return row.some(Boolean) ? row : modHeaders_(t);
}

// The module's spreadsheet (Modules tab ▸ Spreadsheet ID).
let MOD_SS = {};
function modSs_(moduleKey) {
   if (MOD_SS[moduleKey]) return MOD_SS[moduleKey];
   const m = coreModules_().find(x => x.key === moduleKey);
   if (!m || !m.spreadsheetId) throw coreError_("SETUP", "The " + (m ? m.name : moduleKey) + " spreadsheet isn't set up yet.");
   return (MOD_SS[moduleKey] = SpreadsheetApp.openById(m.spreadsheetId));
}

function modSheet_(def, t) {
   const sheet = modSs_(def.key).getSheetByName(t.tab);
   if (!sheet) throw coreError_("SETUP", "The " + t.tab + " tab is missing. Run " + def.key + "Setup() in the script editor.");
   return sheet;
}


// ============================================================
// READ
// ============================================================

// Rows of a table as plain values the app can use: dates as yyyy-MM-dd,
// date-times as yyyy-MM-ddTHH:mm, ticks as true/false, numbers as numbers.
// Deleted rows are left out unless includeDeleted.
let MOD_ROWS = {};
function modRows_(def, tableKey, includeDeleted) {
   const ck = def.key + "/" + tableKey;
   if (!MOD_ROWS[ck]) {
      const t = modTableDef_(def, tableKey);
      const sheet = modSheet_(def, t);
      const values = coreGrid_(sheet).values;
      const headers = (values[0] || []).map(h => String(h).trim());
      const tz = coreSs_().getSpreadsheetTimeZone();
      const types = {};
      t.fields.forEach(f => types[f.name] = f.type);
      ["Active", "Deleted"].forEach(n => types[n] = "bool");
      ["Added At", "Updated At", "Deleted At"].forEach(n => types[n] = "datetime");
      const rows = [];
      for (let i = 1; i < values.length; i++) {
         if (!String(values[i][headers.indexOf(t.id)] || "").trim()) continue;
         const o = { _row: i + 1 };
         headers.forEach((h, c) => { if (h) o[h] = modOut_(values[i][c], types[h], tz); });
         if (t.kind === "list" && values[i][headers.indexOf("Active")] === "") o["Active"] = true;
         rows.push(o);
      }
      MOD_ROWS[ck] = rows;
   }
   return MOD_ROWS[ck].filter(r => includeDeleted || !r["Deleted"]);
}
function modForget_(def, tableKey) { delete MOD_ROWS[def.key + "/" + tableKey]; }

// Cell value -> app value for a field type.
function modOut_(v, type, tz) {
   if (v === null || v === undefined) return "";
   if (type === "bool") return v === true || String(v).toUpperCase() === "TRUE";
   if (v instanceof Date) {
      if (type === "datetime") return Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm");
      return Utilities.formatDate(v, tz, "yyyy-MM-dd");
   }
   if ((type === "number" || type === "money" || type === "percent") && v !== "") return Number(v);
   return typeof v === "string" ? v : (v === "" ? "" : String(v));
}

// Values of a dropdown list (module Lists tab): [{ value, active, sort }].
function modListValues_(def, listName) {
   if (!def.tables.lists) return [];
   return modRows_(def, "lists").filter(r => r["List"] === listName)
      .map(r => ({ id: r[def.tables.lists.id], value: r["Value"], active: r["Active"] !== false, sort: Number(r["Sort"]) || 0 }))
      .sort((a, b) => (a.sort - b.sort) || String(a.value).localeCompare(String(b.value)));
}

// Form layout for the app: each table's fields with labels and list choices.
function modSchema_(def) {
   const out = {};
   Object.keys(def.tables).forEach(k => {
      const t = def.tables[k];
      out[k] = {
         label: t.label, id: t.id, kind: t.kind, area: t.area, adminOnly: !!t.adminOnly, prefix: t.prefix, listAreas: t.listAreas || null,
         fields: t.fields.map(f => Object.assign({}, f, f.list ? { options: modListValues_(def, f.list).filter(v => v.active).map(v => v.value) } : {}))
      };
   });
   return out;
}

// What the person may do in each area of the module (app uses it to show buttons).
function modCaps_(def, user) {
   const out = {};
   def.areas.forEach(a => {
      out[a] = {};
      ["view", "add", "edit", "editOwn", "inactivate", "delete", "deleteOwn", "hardDelete", "restore", "addListValue"]
         .forEach(c => out[a][c] = coreCan_(user, def.key, a, c));
   });
   return out;
}


// ============================================================
// PERMISSIONS
// ============================================================

function modCanView_(user, def, t) { return coreCan_(user, def.key, t.area, "view"); }

// Throws unless the person may do op ("add", "edit", "delete") on this table / row.
function modRequire_(user, def, t, op, row, values) {
   if (t.adminOnly && !user.admin) throw coreError_("FORBIDDEN", "Only admins can change " + t.label.toLowerCase() + ".");
   // A table can hand some rows to a different area (e.g. the Expense Category list belongs to Expenses).
   const merged = Object.assign({}, row || {}, values || {});
   const area = (t.listAreas && t.listAreas[merged["List"]]) || t.area;
   if (t.kind === "list") {
      if (!coreCan_(user, def.key, area, "addListValue")) throw coreError_("FORBIDDEN", "Only editors and admins can change " + t.label.toLowerCase() + ".");
      return;
   }
   const owner = row ? row["Added By"] : "";
   const action = op === "add" ? "add" : op === "edit" ? "edit" : "delete";
   // A module can allow more than the role does (e.g. the season's player removing any planned chore).
   const extra = def.allow && def.allow(user, Object.keys(def.tables).find(k => def.tables[k] === t), op, row, values);
   if (!extra && !coreCan_(user, def.key, area, action, owner)) {
      throw coreError_("FORBIDDEN", op === "add" ? "You don't have access to add " + t.label.toLowerCase() + "." :
         "You can only " + (op === "edit" ? "change" : "delete") + " entries you added.");
   }
   // Module rules on top (e.g. Travel Hockey: whose season it is, closed seasons).
   if (def.guard) def.guard(user, Object.keys(def.tables).find(k => def.tables[k] === t), op, row, values);
}


// ============================================================
// WRITE (shared actions: modAdd, modUpdate, modDelete, modSetActive, modRestore, modPurge)
// ============================================================

// Turns what the app sent into cell values, checking each field against the table's layout.
// For edits, `before` is the current row (unchanged list / link values are always accepted).
function modClean_(def, t, raw, user, before) {
   const out = {};
   t.fields.forEach(f => {
      if (!(f.name in raw) || f.readOnly || f.system) return;
      let v = raw[f.name];
      if (v === null || v === undefined) v = "";
      if (typeof v === "string") v = v.trim();
      const same = before && String(before[f.name] === undefined ? "" : before[f.name]) === String(v);
      if (f.type === "bool") v = v === true || String(v).toUpperCase() === "TRUE";
      else if (v !== "" && (f.type === "number" || f.type === "money" || f.type === "percent")) {
         const n = Number(String(v).replace(/[$,%\s]/g, ""));
         if (isNaN(n)) throw coreError_("INVALID", (f.label || f.name) + " must be a number.");
         v = f.type === "money" ? Math.round(n * 100) / 100 : n;
      } else if (v !== "" && f.type === "date") {
         v = modParseDate_(v, f);
      } else if (v !== "" && f.type === "datetime") {
         if (!/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.test(String(v))) throw coreError_("INVALID", (f.label || f.name) + " must be a date and time.");
         v = coreDate_(v);
      } else if (v !== "" && f.type === "choice") {
         const match = (f.options || []).find(o => o.toLowerCase() === String(v).toLowerCase());
         if (!match) throw coreError_("INVALID", (f.label || f.name) + " must be one of: " + (f.options || []).join(", ") + ".");
         v = match;
      } else if (v !== "" && f.type === "list" && !same) {
         const match = modListValues_(def, f.list).find(x => x.active && x.value.toLowerCase() === String(v).toLowerCase());
         if (!match) throw coreError_("INVALID", "“" + v + "” isn't on the " + f.list + " list.");
         v = match.value;
      } else if (v !== "" && f.type === "ref" && !same) {
         const rt = def.tables[f.ref];
         const target = modRows_(def, f.ref).find(r => r[rt.id] === v);
         if (!target) throw coreError_("INVALID", (f.label || f.name) + ": that choice no longer exists. Refresh and try again.");
         if (rt.kind === "list" && target["Active"] === false) throw coreError_("INVALID", (f.label || f.name) + ": that choice is turned off.");
      } else if (v !== "" && f.type === "user" && !same) {
         if (!coreGetUsers_().some(u => u.id === v)) throw coreError_("INVALID", (f.label || f.name) + ": unknown person.");
      }
      out[f.name] = v;
   });
   return out;
}

// "2026-11-23" -> that day in the sheet's time zone (never a day off, whatever the script's zone).
function modParseDate_(v, f) {
   if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(String(v))) throw coreError_("INVALID", ((f && (f.label || f.name)) || "Date") + " must look like 2026-11-23.");
   return coreDate_(v);
}

function modCheckRequired_(t, merged) {
   const missing = t.fields.filter(f => f.required && (merged[f.name] === "" || merged[f.name] === undefined || merged[f.name] === null))
      .map(f => f.label || f.name);
   if (missing.length) throw coreError_("INVALID", "Please fill in: " + missing.join(", ") + ".");
}

// A short name for a row, for the Change Log and messages: "ERN-12 Mow - Backyard".
function modTitle_(def, t, row) {
   const name = t.title ? t.title(row, def) : (row[t.fields[0].name] || "");
   return row[t.id] + (name ? " " + name : "");
}

function modNextId_(def, tableKey) {
   const t = def.tables[tableKey];
   return t.prefix + (coreMaxNumber_(modRows_(def, tableKey, true).map(r => r[t.id])) + 1);
}

function modFind_(def, tableKey, id, includeDeleted) {
   const t = def.tables[tableKey];
   const row = modRows_(def, tableKey, includeDeleted).find(r => r[t.id] === id);
   if (!row) throw coreError_("STALE", "That entry no longer exists. Refresh and try again.");
   return row;
}

// Adds a row. Used by modAdd_ and by module code. Returns the new row's ID.
function modInsert_(def, tableKey, values, user) {
   const t = def.tables[tableKey];
   const id = modNextId_(def, tableKey);
   const rec = Object.assign({}, values);
   rec[t.id] = id;
   if (t.kind === "list" && rec["Active"] === undefined) rec["Active"] = true;
   rec["Added By"] = user.id; rec["Added At"] = new Date(); rec["Deleted"] = false;
   coreAppendRow_(modSheet_(def, t), rec, true);   // whole row in one write
   modForget_(def, tableKey);
   coreLog_(user, def.key, "Add", t.label, modTitle_(def, t, rec), coreDescribe_(values));
   return id;
}

// Changes a row. Returns the "Field: old → new" notes.
function modChange_(def, tableKey, row, values, user, logAction) {
   const t = def.tables[tableKey];
   const changes = coreWriteChanges_(modSheet_(def, t), row._row, row, values);
   if (changes.length) {
      coreWriteChanges_(modSheet_(def, t), row._row, {}, { "Updated By": user.id, "Updated At": new Date() });
      modForget_(def, tableKey);
      coreLog_(user, def.key, logAction || "Edit", t.label, modTitle_(def, t, Object.assign({}, row, values)), changes.join("; "));
   }
   return changes;
}

// req: { module, table, values } -> { id }
function modAdd_(req, user) {
   const def = modDef_(req.module), t = modTableDef_(def, req.table);
   modRequire_(user, def, t, "add", null, req.values || {});
   let values = modClean_(def, t, req.values || {}, user, null);
   t.fields.forEach(f => { if (values[f.name] === undefined && f.default !== undefined) values[f.name] = f.default; });
   if (def.beforeSave) {
      const r = def.beforeSave(req.table, values, null, user, req);
      if (r && r.__result) return r.__result;   // the module handled it another way (e.g. added to an item already on the list)
      values = r || values;
   }
   modCheckRequired_(t, values);
   if (t.unique) modCheckUnique_(def, req.table, values, null);
   const id = modInsert_(def, req.table, values, user);
   if (def.afterSave) def.afterSave(req.table, id, values, null, user, req);
   return { id: id };
}

// req: { module, table, id, values } -> { changed }
function modUpdate_(req, user) {
   const def = modDef_(req.module), t = modTableDef_(def, req.table);
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row);
   let values = modClean_(def, t, req.values || {}, user, row);
   if (def.beforeSave) values = def.beforeSave(req.table, values, row, user, req) || values;
   modCheckRequired_(t, Object.assign({}, row, values));
   if (t.unique) modCheckUnique_(def, req.table, Object.assign({}, row, values), req.id);
   const changes = modChange_(def, req.table, row, values, user);
   if (def.afterSave) def.afterSave(req.table, req.id, values, row, user, req);
   return { changed: changes.length };
}

// Unique fields on list tables (e.g. a chore name, a list value within its list).
function modCheckUnique_(def, tableKey, merged, exceptId) {
   const t = def.tables[tableKey];
   const keyOf = r => t.unique.map(n => String(r[n] || "").trim().toLowerCase()).join("|");
   const k = keyOf(merged);
   const clash = modRows_(def, tableKey).find(r => r[t.id] !== exceptId && keyOf(r) === k);
   if (clash) throw coreError_("INVALID", "“" + t.unique.map(n => merged[n]).filter(Boolean).join(" / ") + "” is already there (" + modTitle_(def, t, clash) + ")." +
      (clash["Active"] === false ? " It's turned off; turn it back on instead." : ""));
}

// req: { module, table, id } -> deletes.
//   record: soft delete (hidden; Admin can restore or delete permanently).
//   list:   in use -> turned off; not used -> removed.
function modDelete_(req, user) {
   const def = modDef_(req.module), t = modTableDef_(def, req.table);
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "delete", row);
   if (t.kind === "list") {
      const uses = modUseCount_(def, req.table, req.id, row);
      if (uses > 0) {
         modChange_(def, req.table, row, { "Active": false }, user, "Turn off");
         return { result: "inactivated", uses: uses };
      }
      modRemoveRow_(def, req.table, row);
      coreLog_(user, def.key, "Delete", t.label, modTitle_(def, t, row), "Not used anywhere, so removed");
      return { result: "deleted" };
   }
   // Tables marked hardDelete skip Deleted items: the row is removed for good.
   if (t.hardDelete) {
      modRemoveRow_(def, req.table, row);
      coreLog_(user, def.key, "Delete", t.label, modTitle_(def, t, row), "Removed");
      if (def.afterDelete) def.afterDelete(req.table, row, user);
      return { result: "deleted" };
   }
   modChange_(def, req.table, row, { "Deleted": true, "Deleted By": user.id, "Deleted At": new Date() }, user, "Soft delete");
   if (def.afterDelete) def.afterDelete(req.table, row, user);
   return { result: "softDeleted" };
}

// req: { module, table, id, active } -> turns a list entry on or off.
function modSetActive_(req, user) {
   const def = modDef_(req.module), t = modTableDef_(def, req.table);
   if (t.kind !== "list") throw coreError_("BAD_REQUEST", "Only list entries can be turned on or off.");
   const row = modFind_(def, req.table, req.id);
   modRequire_(user, def, t, "edit", row);
   modChange_(def, req.table, row, { "Active": !!req.active }, user, req.active ? "Turn on" : "Turn off");
   return { active: !!req.active };
}

// How many records point at a list entry (so deleting it would orphan them).
function modUseCount_(def, tableKey, id, row) {
   let n = 0;
   Object.keys(def.tables).forEach(k => {
      const t = def.tables[k];
      t.fields.forEach(f => {
         if (f.type === "ref" && f.ref === tableKey) n += modRows_(def, k, true).filter(r => r[f.name] === id).length;
         if (tableKey === "lists" && f.type === "list" && f.list === row["List"]) n += modRows_(def, k, true).filter(r => r[f.name] === row["Value"]).length;
      });
   });
   if (def.extraUses) n += def.extraUses(tableKey, id, row);
   return n;
}

function modRemoveRow_(def, tableKey, row) {
   const t = def.tables[tableKey];
   modSheet_(def, t).deleteRow(row._row);
   delete CORE_GRID[coreGridKey_(modSheet_(def, t))];
   modForget_(def, tableKey);
}

// req: { module } -> soft-deleted records in the module (admins).
function modDeleted_(req, user) {
   coreRequireAdmin_(user);
   const def = modDef_(req.module);
   const out = [];
   Object.keys(def.tables).forEach(k => {
      const t = def.tables[k];
      if (t.kind !== "record" || t.hardDelete) return;
      modRows_(def, k, true).filter(r => r["Deleted"]).forEach(r => out.push({
         table: k, tableLabel: t.label, id: r[t.id], title: modTitle_(def, t, r), deletedBy: r["Deleted By"], deletedAt: r["Deleted At"], addedBy: r["Added By"]
      }));
   });
   out.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
   return { deleted: out };
}

// req: { module, table, id } -> brings back a soft-deleted record (admins).
function modRestore_(req, user) {
   coreRequireAdmin_(user);
   const def = modDef_(req.module), t = modTableDef_(def, req.table);
   const row = modFind_(def, req.table, req.id, true);
   if (!row["Deleted"]) return { restored: false };
   modChange_(def, req.table, row, { "Deleted": false, "Deleted By": "", "Deleted At": "" }, user, "Restore");
   return { restored: true };
}

// req: { module, table, id } -> deletes permanently (admins). Always logged, even with logging off.
function modPurge_(req, user) {
   coreRequireAdmin_(user);
   const def = modDef_(req.module), t = modTableDef_(def, req.table);
   const row = modFind_(def, req.table, req.id, true);
   if (t.kind === "list" && modUseCount_(def, req.table, req.id, row) > 0) {
      throw coreError_("INVALID", "That's still used by other entries. Turn it off instead.");
   }
   modRemoveRow_(def, req.table, row);
   const desc = coreDescribe_(Object.keys(row).filter(k => k[0] !== "_" && MOD_SYSTEM_COLS.indexOf(k) === -1)
      .reduce((o, k) => { o[k] = row[k]; return o; }, {}));
   coreLog_(user, def.key, "Delete", t.label, modTitle_(def, t, row), "Permanently deleted. Was: " + desc);
   return { purged: true };
}


// ============================================================
// MODULE ACTIONS, HOME DATA, SETUP
// ============================================================

// "<module>.<action>" requests go to the module's own handler.
function modRouteAction_(req, user) {
   const parts = String(req.action).split(".");
   const def = modDefs_()[parts[0]];
   if (!def || !def.actions || !def.actions[parts[1]]) throw coreError_("BAD_REQUEST", "Unknown action.");
   const a = def.actions[parts[1]];
   if (!a.write) return a.fn(req, user);
   req.module = parts[0];
   return modReply_(req, user, () => a.fn(req, user));
}

// Runs a save, then (when the app asks with reload: true) answers with the module's
// fresh screen data in the same reply, so the app needs no second request.
function modReply_(req, user, fn) {
   const result = coreWrite_(fn) || {};
   const def = modDefs_()[req.module];
   if (req.reload && def && def.actions && def.actions.load) {
      CORE_GRID = {}; MOD_ROWS = {};
      corePrefetch_();
      result.moduleData = def.actions.load.fn(req, user);
   }
   return result;
}

// Reads every tab of a module's spreadsheet in one request (see coreBatchRead_).
function modPrefetch_(def) {
   const dateCols = {};
   Object.keys(def.tables).forEach(k => {
      const t = def.tables[k], cols = {};
      t.fields.forEach(f => { if (f.type === "date" || f.type === "datetime") cols[f.name] = f.type; });
      ["Added At", "Updated At", "Deleted At"].forEach(n => cols[n] = "datetime");
      dateCols[t.tab] = cols;
   });
   coreBatchRead_(modSs_(def.key), Object.keys(def.tables).map(k => def.tables[k].tab), dateCols);
}

// Due Soon items and Home tile summaries from every module that's set up.
// A module that fails here never breaks Home.
function modHomeData_(user, days, visibleModules) {
   const out = { dueSoon: [], summaries: {} };
   const defs = modDefs_();
   visibleModules.forEach(m => {
      const def = defs[m.key];
      if (!def || !def.home || !m.spreadsheetId || m.status !== "Active") return;
      try {
         const r = def.home(user, days) || {};
         (r.dueSoon || []).forEach(d => out.dueSoon.push(Object.assign({ module: m.name }, d)));
         if (r.summary) out.summaries[m.key] = r.summary;
      } catch (e) { console.warn(m.key + " home data failed: " + e); }
   });
   out.dueSoon.sort((a, b) => String(a.sortKey || a.when).localeCompare(String(b.sortKey || b.when)));
   return out;
}

// Builds a module's tabs (headers, frozen row, tick boxes, date formats).
// Only adds what's missing; never touches existing rows.
function modBuildTabs_(def) {
   const ss = modSs_(def.key);
   ss.setSpreadsheetTimeZone(coreTz_());
   Object.keys(def.tables).forEach(k => {
      const t = def.tables[k];
      let sheet = ss.getSheetByName(t.tab);
      const headers = modHeaders_(t);
      if (!sheet) sheet = ss.insertSheet(t.tab);
      let have = headers.slice();
      if (sheet.getLastRow() === 0) {
         sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9d9d9");
         sheet.setFrozenRows(1);
      } else {
         // Add any columns that are new since the tab was made (on the end).
         have = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(h => String(h).trim());
         headers.filter(h => have.indexOf(h) === -1).forEach(h => {
            const c = have.filter(Boolean).length + 1;
            sheet.getRange(1, c).setValue(h).setFontWeight("bold").setBackground("#d9d9d9");
            have[c - 1] = h;
         });
         delete CORE_GRID[coreGridKey_(sheet)];
      }
      const col = name => have.indexOf(name) + 1;
      t.fields.forEach(f => {
         const c = col(f.name);
         if (f.type === "bool") sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setDataValidation(modCheckbox_());
         if (f.type === "date") sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setNumberFormat("m/d/yyyy");
         if (f.type === "datetime") sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setNumberFormat("m/d/yyyy h:mm am/pm");
         if (f.type === "money") sheet.getRange(2, c, sheet.getMaxRows() - 1, 1).setNumberFormat("$#,##0.00");
      });
      // Tick boxes as validation only: empty cells show an unticked box without making
      // the tab look 1,000 rows long (which slows every read).
      ["Deleted"].concat(t.kind === "list" ? ["Active"] : []).forEach(n => sheet.getRange(2, col(n), sheet.getMaxRows() - 1, 1).setDataValidation(modCheckbox_()));
      ["Added At", "Updated At", "Deleted At"].forEach(n => sheet.getRange(2, col(n), sheet.getMaxRows() - 1, 1).setNumberFormat("m/d/yyyy h:mm am/pm"));
   });
   // Tab order as defined; drop the blank starter tab.
   Object.keys(def.tables).forEach((k, i) => { ss.setActiveSheet(ss.getSheetByName(def.tables[k].tab)); ss.moveActiveSheet(i + 1); });
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   CORE_GRID = {}; MOD_ROWS = {};
}

function modCheckbox_() { return SpreadsheetApp.newDataValidation().requireCheckbox().build(); }

// One-time tidy for tabs made before tick boxes were validation-only: clears the
// unticked boxes below the last real row (so reads only cover real rows) and puts
// tick-box validation back on those columns. Never touches rows that have an ID.
function modTidyTabs_(def) {
   const ss = modSs_(def.key);
   const out = [];
   Object.keys(def.tables).forEach(k => {
      const t = def.tables[k];
      const sheet = ss.getSheetByName(t.tab);
      if (!sheet) return;
      const lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
      const ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
      let used = 1;
      ids.forEach((r, i) => { if (String(r[0]).trim() !== "") used = i + 2; });
      if (lastRow > used) sheet.getRange(used + 1, 1, lastRow - used, lastCol).clearContent();
      const headers = sheet.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h).trim());
      headers.forEach((h, i) => {
         const f = t.fields.find(x => x.name === h);
         if ((f && f.type === "bool") || h === "Deleted" || h === "Active") sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setDataValidation(modCheckbox_());
      });
      out.push(t.tab + ": " + (used - 1) + " rows" + (lastRow > used ? " (cleared " + (lastRow - used) + " empty rows)" : ""));
   });
   CORE_GRID = {}; MOD_ROWS = {};
   return out;
}

// Adds many rows at once (imports): one write for the whole batch. Returns the new IDs.
function modBulkInsert_(def, tableKey, rows, user) {
   if (!rows.length) return [];
   const t = def.tables[tableKey];
   const sheet = modSheet_(def, t);
   const headers = modSheetHeaders_(sheet, t);
   let n = coreMaxNumber_(modRows_(def, tableKey, true).map(r => r[t.id]));
   const now = new Date();
   const ids = [];
   const lines = rows.map(r => {
      const rec = Object.assign({}, r);
      rec[t.id] = t.prefix + (++n);
      ids.push(rec[t.id]);
      if (t.kind === "list" && rec["Active"] === undefined) rec["Active"] = true;
      rec["Added By"] = rec["Added By"] || user.id; rec["Added At"] = now; rec["Deleted"] = false;
      return headers.map(h => rec[h] === undefined ? "" : rec[h]);
   });
   const start = coreLastDataRow_(sheet) + 1;
   const need = start + lines.length - 1;
   if (need > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
   sheet.getRange(start, 1, lines.length, headers.length).setValues(lines);
   delete CORE_GRID[coreGridKey_(sheet)];
   modForget_(def, tableKey);
   return ids;
}

// Adds seed rows to an empty table (setup only). rows: [{ field: value }]
function modSeed_(def, tableKey, rows, user) {
   if (modRows_(def, tableKey, true).length) return 0;
   const t = def.tables[tableKey];
   const sheet = modSheet_(def, t);
   const headers = modSheetHeaders_(sheet, t);
   let n = coreMaxNumber_([]);
   const now = new Date();
   const lines = rows.map(r => {
      const rec = Object.assign({}, r);
      rec[t.id] = t.prefix + (++n);
      if (t.kind === "list" && rec["Active"] === undefined) rec["Active"] = true;
      rec["Added By"] = user.id; rec["Added At"] = now; rec["Deleted"] = false;
      return headers.map(h => rec[h] === undefined ? "" : rec[h]);
   });
   if (lines.length) sheet.getRange(2, 1, lines.length, headers.length).setValues(lines);
   delete CORE_GRID[coreGridKey_(sheet)];
   modForget_(def, tableKey);
   return lines.length;
}
