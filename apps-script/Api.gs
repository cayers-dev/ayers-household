// ============================================================
// AYERS HOUSEHOLD - WEB APP API (Core)
//
// The Ayers Household app (hosted on GitHub Pages) sends every
// request here. Each request carries a Google sign-in (or the app's
// own signed session); the email is checked against the Users tab.
//
// Access is set per module (and optionally per area inside a module)
// on the Permissions tab: Editor, Data Entry, Viewer or No Access.
// People with the Admin box ticked on Users can do everything.
//
// Deploy as: Web app, Execute as: Me, Who has access: Anyone.
// (The sign-in check below is what protects the data.)
// ============================================================

const CORE_CONFIG = {
   // OAuth "Web application" client ID from Google Cloud Console.
   clientId: "PASTE_CLIENT_ID",
   appName: "Ayers Household",
   // Signed out after this many minutes without using the app (each request renews it).
   sessionMinutes: 60,
   tabs: {
      users: "Users",
      modules: "Modules",
      areas: "Areas",
      perms: "Permissions",
      settings: "Settings",
      log: "Change Log"
   }
};

// Roles that can be given per module or area. "Admin" isn't one of them:
// it's the Admin box on the Users tab and covers the whole app.
const CORE_ROLES = ["Editor", "Data Entry", "Viewer", "No Access"];

// What each role may do inside a module. Module code calls coreCan_() with one of these.
//   view          see the module / area
//   add           add records
//   edit          change anyone's records
//   editOwn       change records they added
//   inactivate    mark records inactive
//   delete        soft delete anyone's records (hidden, Admin can restore)
//   deleteOwn     soft delete records they added
//   hardDelete    delete permanently (Admin only)
//   restore       bring back soft-deleted records (Admin only)
//   addListValue  add a new value to a dropdown list from a form
const CORE_ROLE_CAN = {
   "Admin":      ["view", "add", "edit", "editOwn", "inactivate", "delete", "deleteOwn", "hardDelete", "restore", "addListValue"],
   "Editor":     ["view", "add", "edit", "editOwn", "inactivate", "delete", "deleteOwn", "addListValue"],
   "Data Entry": ["view", "add", "editOwn", "deleteOwn"],
   "Viewer":     ["view"],
   "No Access":  []
};

// Settings tab: name -> default value.
const CORE_SETTINGS = {
   "Change Log": "On",
   "Due Soon Days (default)": 30
};


// ============================================================
// ENTRY POINTS
// ============================================================

// GET (opening the web app URL in a browser): just confirms the API is up.
function doGet() {
   return coreJson_({ ok: true, app: CORE_CONFIG.appName });
}

// Every app request: verify the sign-in, run the action, return JSON.
// Errors raised with coreError_ go back as { ok: false, code, message }.
function doPost(e) {
   try {
      const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
      if (req.action === "ping") return coreJson_({ ok: true, app: CORE_CONFIG.appName });
      const user = req.session ? coreVerifySession_(req.session) : coreVerifyUser_(req.idToken);
      const result = coreRoute_(req, user);
      coreFlushLog_();
      return coreJson_(Object.assign({ ok: true }, result, { session: coreIssueSession_(user) }));
   } catch (err) {
      const out = { ok: false, code: err.apiCode || "ERROR", message: err.apiCode ? err.message : "Something went wrong: " + err.message };
      if (err.apiExtra) Object.assign(out, err.apiExtra);
      if (!err.apiCode) console.error(err && err.stack ? err.stack : err);
      return coreJson_(out);
   }
}

// Sends each request to the function for its action. Writes run inside coreWrite_ (one at a time).
function coreRoute_(req, user) {
   switch (req.action) {
      case "bootstrap":        return coreBootstrap_(user);
      case "setMyDueSoon":     return coreWrite_(() => coreSetMyDueSoon_(req, user));
      // Admin
      case "saveUser":         return coreWrite_(() => coreSaveUser_(req, user));
      case "savePermissions":  return coreWrite_(() => coreSavePermissions_(req, user));
      case "saveModule":       return coreWrite_(() => coreSaveModule_(req, user));
      case "saveSetting":      return coreWrite_(() => coreSaveSetting_(req, user));
      case "setChangeLog":     return coreWrite_(() => coreSetChangeLog_(req, user));
      case "changeLog":        return coreReadChangeLog_(req, user);
      default: throw coreError_("BAD_REQUEST", "Unknown action.");
   }
}


// ============================================================
// AUTH
// ============================================================

// Checks a Google sign-in token (cached up to 10 minutes) and returns the matching
// active person from Users, or throws AUTH / NOT_ALLOWED.
function coreVerifyUser_(idToken) {
   if (!idToken) throw coreError_("AUTH", "Please sign in.");
   if (CORE_CONFIG.clientId.indexOf("PASTE_") === 0) throw coreError_("SETUP", "The app's sign-in client ID hasn't been set yet.");
   const cache = CacheService.getScriptCache();
   const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken);
   const key = "tok_" + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
   let email = cache.get(key);
   if (!email) {
      const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
                                    { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw coreError_("AUTH", "Your sign-in has expired. Please sign in again.");
      const info = JSON.parse(res.getContentText());
      if (info.aud !== CORE_CONFIG.clientId) throw coreError_("AUTH", "That sign-in was for a different app.");
      if (String(info.email_verified) !== "true") throw coreError_("AUTH", "Your Google email address isn't verified.");
      const secondsLeft = Number(info.exp) - Math.floor(Date.now() / 1000);
      if (!(secondsLeft > 0)) throw coreError_("AUTH", "Your sign-in has expired. Please sign in again.");
      email = String(info.email).trim().toLowerCase();
      cache.put(key, email, Math.max(30, Math.min(600, secondsLeft - 30)));
   }
   return coreUserByEmail_(email);
}

// The active person with this email, or NOT_ALLOWED.
function coreUserByEmail_(email) {
   const user = coreGetUsers_().find(u => u.email && u.email === email);
   if (!user || !user.active) {
      throw coreError_("NOT_ALLOWED", email + " isn't on the " + CORE_CONFIG.appName + " user list.", { email: email });
   }
   return user;
}

// ------------------------------------------------------------
// App sessions: after a Google sign-in the app gets its own signed session,
// good for CORE_CONFIG.sessionMinutes since the last request. The person is
// still looked up on Users every time, so turning someone off works at once.
// The signing key is the SESSION_SECRET script property (delete it to sign
// everyone out).
// ------------------------------------------------------------
function coreSessionSecret_() {
   const props = PropertiesService.getScriptProperties();
   let secret = props.getProperty("SESSION_SECRET");
   if (!secret) {
      secret = Utilities.getUuid() + Utilities.getUuid();
      props.setProperty("SESSION_SECRET", secret);
   }
   return secret;
}

function coreSessionSig_(payload) {
   return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, coreSessionSecret_())).replace(/=+$/, "");
}

function coreIssueSession_(user) {
   const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: user.email, x: Date.now() + CORE_CONFIG.sessionMinutes * 60000 }), Utilities.Charset.UTF_8).replace(/=+$/, "");
   return payload + "." + coreSessionSig_(payload);
}

function coreVerifySession_(token) {
   const parts = String(token || "").split(".");
   if (parts.length !== 2 || coreSessionSig_(parts[0]) !== parts[1]) throw coreError_("AUTH", "Please sign in again.");
   let data;
   try { data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { throw coreError_("AUTH", "Please sign in again."); }
   if (!data || !data.e || !(Number(data.x) > Date.now())) throw coreError_("AUTH", "You were signed out after an hour without using the app. Please sign in again.");
   return coreUserByEmail_(String(data.e).toLowerCase());
}

function coreRequireAdmin_(user) {
   if (!user.admin) throw coreError_("FORBIDDEN", "Only admins can do that.");
}


// ============================================================
// PERMISSIONS
// ============================================================

// The person's role in a module, or in one area of it. An area with no row of its own
// uses the module's role; a module with no row is No Access. Admins are always "Admin".
function coreRoleFor_(user, moduleKey, areaKey) {
   if (user.admin) return "Admin";
   const rows = corePermsFor_(user.id);
   const find = (m, a) => rows.find(p => p.module === m && p.area === a);
   if (areaKey) {
      const ar = find(moduleKey, areaKey);
      if (ar) return ar.role;
   }
   const mr = find(moduleKey, "");
   return mr ? mr.role : "No Access";
}

// True if the person's role in that module (and area) allows the action (see CORE_ROLE_CAN).
// For "editOwn" / "deleteOwn", pass the record's "Added By" User ID as ownerId.
function coreCan_(user, moduleKey, areaKey, action, ownerId) {
   const caps = CORE_ROLE_CAN[coreRoleFor_(user, moduleKey, areaKey)] || [];
   if (caps.indexOf(action) !== -1) return true;
   if (action === "edit" && caps.indexOf("editOwn") !== -1 && ownerId && ownerId === user.id) return true;
   if (action === "delete" && caps.indexOf("deleteOwn") !== -1 && ownerId && ownerId === user.id) return true;
   return false;
}

// Throws FORBIDDEN unless coreCan_ allows it.
function coreRequire_(user, moduleKey, areaKey, action, ownerId) {
   if (!coreCan_(user, moduleKey, areaKey, action, ownerId)) throw coreError_("FORBIDDEN", "You don't have access to do that.");
}

// Can the person see the module at all? (Its own role, or any area they can see.)
function coreCanSeeModule_(user, mod) {
   if (user.admin) return true;
   if (coreRoleFor_(user, mod.key, "") !== "No Access") return true;
   return coreAreas_().some(a => a.module === mod.key && coreRoleFor_(user, mod.key, a.key) !== "No Access");
}

// Rows on the Permissions tab for one person: [{ module, area, role, row }].
function corePermsFor_(userId) {
   return coreGetPerms_().filter(p => p.userId === userId);
}


// ============================================================
// READ
// ============================================================

// Everything the app needs on load. Admins also get users, every permission row and the settings.
function coreBootstrap_(user) {
   const settings = coreGetSettings_();
   const defaultDays = Number(settings["Due Soon Days (default)"]) || 30;
   const areas = coreAreas_();
   const modules = coreModules_()
      .filter(m => m.status !== "Off" || user.admin)
      .filter(m => coreCanSeeModule_(user, m))
      .map(m => Object.assign({}, m, {
         role: coreRoleFor_(user, m.key, ""),
         areas: areas.filter(a => a.module === m.key)
            .map(a => ({ key: a.key, name: a.name, description: a.description, role: coreRoleFor_(user, m.key, a.key) }))
            .filter(a => user.admin || a.role !== "No Access")
      }));
   const out = {
      user: { id: user.id, email: user.email, name: user.name, admin: user.admin, dueSoonDays: user.dueSoonDays || defaultDays },
      modules: modules,
      roles: CORE_ROLES.slice(),
      roleCan: CORE_ROLE_CAN,
      dueSoon: [],     // filled in by modules as they're added
      tasks: []        // filled in by the Tasks module
   };
   if (user.admin) {
      out.admin = {
         users: coreGetUsers_().map(u => ({ id: u.id, email: u.email, name: u.name, admin: u.admin, active: u.active, dueSoonDays: u.dueSoonDays })),
         perms: coreGetPerms_().map(p => ({ userId: p.userId, module: p.module, area: p.area, role: p.role })),
         allModules: coreModules_(),
         areas: areas,
         settings: { changeLog: coreLogOn_(), dueSoonDefault: defaultDays }
      };
   }
   return out;
}

// Users tab -> [{ row, id, email, name, admin, active, dueSoonDays }]. Cached 5 minutes.
const CORE_USERS_CACHE_KEY = "core_users_v1";
function coreGetUsers_(fresh) {
   const cache = CacheService.getScriptCache();
   if (!fresh) {
      const hit = cache.get(CORE_USERS_CACHE_KEY);
      if (hit) { try { return JSON.parse(hit); } catch (e) { /* read the tab */ } }
   }
   const t = coreTable_(CORE_CONFIG.tabs.users);
   const users = t.rows.filter(r => String(r["User ID"] || r["Email"] || r["Name"]).trim() !== "").map(r => ({
      row: r._row,
      id: String(r["User ID"] || "").trim(),
      email: String(r["Email"] || "").trim().toLowerCase(),
      name: String(r["Name"] || "").trim(),
      admin: coreBool_(r["Admin"]),
      active: coreBool_(r["Active"]),
      dueSoonDays: Number(r["Due Soon Days"]) || 0
   }));
   // Anyone typed straight into the sheet without a User ID gets one.
   if (users.some(u => !u.id)) {
      const sheet = coreSheet_(CORE_CONFIG.tabs.users);
      const col = coreHeaderMap_(sheet).map["user id"];
      let next = coreMaxNumber_(users.map(u => u.id));
      users.forEach(u => { if (!u.id) { u.id = "USR-" + (++next); sheet.getRange(u.row, col).setValue(u.id); } });
   }
   try { cache.put(CORE_USERS_CACHE_KEY, JSON.stringify(users), 300); } catch (e) { /* too big */ }
   return users;
}
function coreClearUsersCache_() { CacheService.getScriptCache().remove(CORE_USERS_CACHE_KEY); }

// Permissions tab -> [{ row, userId, module, area, role }]. Unknown roles count as No Access.
let CORE_PERMS = null;
function coreGetPerms_() {
   if (CORE_PERMS) return CORE_PERMS;
   CORE_PERMS = coreTable_(CORE_CONFIG.tabs.perms).rows
      .filter(r => String(r["User ID"]).trim() && String(r["Module Key"]).trim())
      .map(r => {
         const role = CORE_ROLES.find(x => x.toLowerCase() === String(r["Role"] || "").trim().toLowerCase()) || "No Access";
         return { row: r._row, userId: String(r["User ID"]).trim(), module: String(r["Module Key"]).trim(),
                  area: String(r["Area Key"] || "").trim(), role: role };
      });
   return CORE_PERMS;
}

// Modules tab -> [{ key, name, status, sort, description, spreadsheetId, folderId }], in Sort order.
function coreModules_() {
   return coreTable_(CORE_CONFIG.tabs.modules).rows
      .filter(r => String(r["Module Key"]).trim())
      .map(r => ({
         key: String(r["Module Key"]).trim(),
         name: String(r["Module Name"] || r["Module Key"]).trim(),
         status: String(r["Status"] || "Coming soon").trim(),
         sort: Number(r["Sort"]) || 999,
         description: String(r["Description"] || "").trim(),
         spreadsheetId: String(r["Spreadsheet ID"] || "").trim(),
         folderId: String(r["Folder ID"] || "").trim()
      }))
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

// Areas tab -> [{ module, key, name, sort, description }], in Sort order.
function coreAreas_() {
   return coreTable_(CORE_CONFIG.tabs.areas).rows
      .filter(r => String(r["Module Key"]).trim() && String(r["Area Key"]).trim())
      .map(r => ({
         module: String(r["Module Key"]).trim(),
         key: String(r["Area Key"]).trim(),
         name: String(r["Area Name"] || r["Area Key"]).trim(),
         sort: Number(r["Sort"]) || 999,
         description: String(r["Description"] || "").trim()
      }))
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

// Settings tab -> { name: value }, with defaults for anything missing.
function coreGetSettings_() {
   const out = Object.assign({}, CORE_SETTINGS);
   coreTable_(CORE_CONFIG.tabs.settings).rows.forEach(r => {
      const k = String(r["Setting"] || "").trim();
      if (k) out[k] = r["Value"];
   });
   return out;
}


// ============================================================
// WRITE
// ============================================================

// Runs a change while holding the script lock, so two saves can't collide.
function coreWrite_(fn) {
   const lock = LockService.getScriptLock();
   lock.waitLock(20000);
   try {
      const result = fn();
      coreFlushLog_();
      SpreadsheetApp.flush();
      return result;
   } finally {
      coreFlushLog_();
      lock.releaseLock();
   }
}

// req: { days } -> the person's own Due Soon window (1-365 days).
function coreSetMyDueSoon_(req, user) {
   const days = Math.round(Number(req.days));
   if (!(days >= 1 && days <= 365)) throw coreError_("INVALID", "Pick between 1 and 365 days.");
   const sheet = coreSheet_(CORE_CONFIG.tabs.users);
   const me = coreGetUsers_(true).find(u => u.id === user.id);
   const changes = coreWriteChanges_(sheet, me.row, { "Due Soon Days": me.dueSoonDays || "" }, { "Due Soon Days": days });
   if (changes.length) coreLog_(user, "", "Edit", "Users", user.id, changes.join("; "));
   coreClearUsersCache_();
   return { dueSoonDays: days };
}

// req: { user: { id?, email, name, admin, active } } -> adds or edits a person (admins).
function coreSaveUser_(req, user) {
   coreRequireAdmin_(user);
   const u = req.user || {};
   const email = String(u.email || "").trim().toLowerCase();
   const name = String(u.name || "").trim();
   if (!name) throw coreError_("INVALID", "Enter a name.");
   if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw coreError_("INVALID", "Enter a valid email address.");
   const active = u.active !== false;
   if (active && !email) throw coreError_("INVALID", "Add an email address before turning this person on.");
   const admin = u.admin === true;

   const all = coreGetUsers_(true);
   const existing = u.id ? all.find(x => x.id === u.id) : null;
   if (u.id && !existing) throw coreError_("STALE", "That user no longer exists. Refresh and try again.");
   const clash = email && all.find(x => x.email === email && (!existing || x.id !== existing.id));
   if (clash) throw coreError_("INVALID", email + " is already on the list (" + clash.id + " " + clash.name + ").");
   if (existing && existing.id === user.id) {
      if (!admin || !active) throw coreError_("INVALID", "You can't remove your own admin access or turn yourself off.");
      if (email !== existing.email) throw coreError_("INVALID", "You can't change your own email here. Edit it on the Users tab if you need to.");
   }

   const sheet = coreSheet_(CORE_CONFIG.tabs.users);
   const record = { "Email": email, "Name": name, "Admin": admin, "Active": active };
   let id;
   if (existing) {
      id = existing.id;
      const before = { "Email": existing.email, "Name": existing.name, "Admin": existing.admin, "Active": existing.active };
      const changes = coreWriteChanges_(sheet, existing.row, before, record);
      if (changes.length) coreLog_(user, "", "Edit", "Users", id + " " + name, changes.join("; "));
   } else {
      id = "USR-" + (coreMaxNumber_(all.map(x => x.id)) + 1);
      record["User ID"] = id;
      record["Added"] = new Date();
      coreAppendRow_(sheet, record);
      coreLog_(user, "", "Add", "Users", id + " " + name, coreDescribe_(record));
   }
   coreClearUsersCache_();
   return { userId: id };
}

// req: { userId, rows: [{ module, area, role }] } -> replaces that person's permission rows (admins).
// A module left at "No Access" with no areas set gets no row (no row = No Access).
// An area set to "" means "same as the module" and gets no row either.
function coreSavePermissions_(req, user) {
   coreRequireAdmin_(user);
   const target = coreGetUsers_(true).find(u => u.id === req.userId);
   if (!target) throw coreError_("STALE", "That user no longer exists. Refresh and try again.");
   const modules = coreModules_().map(m => m.key);
   const areas = coreAreas_();
   const wanted = [];
   (req.rows || []).forEach(r => {
      const module = String(r.module || "").trim();
      const area = String(r.area || "").trim();
      const role = String(r.role || "").trim();
      if (!role) return;                               // area "same as module"
      if (modules.indexOf(module) === -1) throw coreError_("INVALID", "Unknown module: " + module);
      if (area && !areas.some(a => a.module === module && a.key === area)) throw coreError_("INVALID", "Unknown area: " + module + " / " + area);
      if (CORE_ROLES.indexOf(role) === -1) throw coreError_("INVALID", "Unknown role: " + role);
      if (!area && role === "No Access") return;       // no row = No Access
      if (wanted.some(w => w.module === module && w.area === area)) return;
      wanted.push({ module: module, area: area, role: role });
   });

   const key = p => p.module + "/" + p.area;
   const before = corePermsFor_(target.id);
   const beforeMap = {}; before.forEach(p => beforeMap[key(p)] = p.role);
   const afterMap = {}; wanted.forEach(p => afterMap[key(p)] = p.role);
   const notes = [];
   Object.keys(Object.assign({}, beforeMap, afterMap)).sort().forEach(k => {
      const a = beforeMap[k] || "(none)", b = afterMap[k] || "(none)";
      if (a !== b) notes.push(k.replace(/\/$/, "") + ": " + a + " → " + b);
   });
   if (!notes.length) return { changed: 0 };

   // Rewrite: delete this person's rows (bottom up so row numbers stay right), then append the new set.
   const sheet = coreSheet_(CORE_CONFIG.tabs.perms);
   before.map(p => p.row).sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
   CORE_PERMS = null; CORE_GRID = {};
   wanted.forEach(p => coreAppendRow_(sheet, { "User ID": target.id, "Module Key": p.module, "Area Key": p.area, "Role": p.role }));
   CORE_PERMS = null;
   coreLog_(user, "", "Edit", "Permissions", target.id + " " + target.name, notes.join("; "));
   return { changed: notes.length };
}

// req: { module: { key, name, status, description, sort } } -> edits a module's row (admins).
function coreSaveModule_(req, user) {
   coreRequireAdmin_(user);
   const m = req.module || {};
   const t = coreTable_(CORE_CONFIG.tabs.modules);
   const row = t.rows.find(r => String(r["Module Key"]).trim() === m.key);
   if (!row) throw coreError_("STALE", "That module no longer exists. Refresh and try again.");
   const name = String(m.name || "").trim();
   if (!name) throw coreError_("INVALID", "Enter a module name.");
   const status = ["Active", "Coming soon", "Off"].indexOf(m.status) !== -1 ? m.status : row["Status"];
   const values = { "Module Name": name, "Status": status, "Description": String(m.description || "").trim() };
   if (m.sort !== undefined && m.sort !== "") {
      if (isNaN(Number(m.sort))) throw coreError_("INVALID", "Sort must be a number.");
      values["Sort"] = Number(m.sort);
   }
   const changes = coreWriteChanges_(coreSheet_(CORE_CONFIG.tabs.modules), row._row, row, values);
   if (changes.length) coreLog_(user, m.key, "Edit", "Modules", m.key + " " + name, changes.join("; "));
   return { changed: changes.length };
}

// req: { name, value } -> changes a value on the Settings tab (admins).
function coreSaveSetting_(req, user) {
   coreRequireAdmin_(user);
   const name = String(req.name || "");
   if (!(name in CORE_SETTINGS) || name === "Change Log") throw coreError_("INVALID", "Unknown setting.");
   let value = req.value;
   if (name === "Due Soon Days (default)") {
      value = Math.round(Number(value));
      if (!(value >= 1 && value <= 365)) throw coreError_("INVALID", "Pick between 1 and 365 days.");
   }
   coreSetSettingValue_(name, value);
   coreLog_(user, "", "Edit", "Settings", name, "→ " + value);
   return { saved: true };
}

function coreSetSettingValue_(name, value) {
   const sheet = coreSheet_(CORE_CONFIG.tabs.settings);
   const row = coreTable_(CORE_CONFIG.tabs.settings).rows.find(r => String(r["Setting"]).trim() === name);
   if (row) sheet.getRange(row._row, coreHeaderMap_(sheet).map["value"]).setValue(value);
   else coreAppendRow_(sheet, { "Setting": name, "Value": value });
   CORE_GRID = {};
}


// ============================================================
// CHANGE LOG
// ============================================================

let CORE_LOG_QUEUE = [];

function coreLogOn_() {
   return String(coreGetSettings_()["Change Log"] || "On").trim().toLowerCase() !== "off";
}

// req: { on } -> turns the Change Log on or off (admins). The switch itself is always logged.
function coreSetChangeLog_(req, user) {
   coreRequireAdmin_(user);
   const on = !!req.on;
   coreLog_(user, "", "Edit", "Change Log", "Logging", on ? "Turned on" : "Turned off", true);
   coreSetSettingValue_("Change Log", on ? "On" : "Off");
   return { changeLog: on };
}

// Queues a Change Log row. Permanent deletes, and the switch itself, are logged even while logging is off.
function coreLog_(user, module, action, table, record, changes, always) {
   if (!always && action !== "Delete" && !coreLogOn_()) return;
   CORE_LOG_QUEUE.push([new Date(), user.id, user.name, module || "", action, table, record, changes || ""]);
}

function coreFlushLog_() {
   if (!CORE_LOG_QUEUE.length) return;
   const rows = CORE_LOG_QUEUE.splice(0, CORE_LOG_QUEUE.length);
   try {
      const log = coreSheet_(CORE_CONFIG.tabs.log);
      const start = coreLastDataRow_(log) + 1;
      const need = start + rows.length - 1;
      if (need > log.getMaxRows()) log.insertRowsAfter(log.getMaxRows(), need - log.getMaxRows());
      log.getRange(start, 1, rows.length, 8).setValues(rows);
      delete CORE_GRID[log.getSheetId()];
   } catch (e) {
      console.warn("Change Log write failed: " + e);   // never fail a save over the log
   }
}

// req: { limit, module } -> newest Change Log rows first (admins).
function coreReadChangeLog_(req, user) {
   coreRequireAdmin_(user);
   const limit = Math.max(1, Math.min(1000, Number(req.limit) || 200));
   const tz = coreSs_().getSpreadsheetTimeZone();
   let rows = coreTable_(CORE_CONFIG.tabs.log).rows.filter(r => r["Timestamp"] !== "");
   if (req.module) rows = rows.filter(r => String(r["Module"]) === req.module);
   const total = rows.length;
   rows = rows.slice(-limit).reverse().map(r => ({
      at: r["Timestamp"] instanceof Date ? Utilities.formatDate(r["Timestamp"], tz, "yyyy-MM-dd HH:mm") : String(r["Timestamp"]),
      userId: String(r["User ID"]), userName: String(r["User Name"]), module: String(r["Module"]),
      action: String(r["Action"]), table: String(r["Table"]), record: String(r["Record"]), changes: String(r["Changes"])
   }));
   return { log: rows, total: total, changeLog: coreLogOn_() };
}


// ============================================================
// SHEET HELPERS
// ============================================================

let CORE_SS = null;
function coreSs_() { return CORE_SS || (CORE_SS = SpreadsheetApp.getActiveSpreadsheet()); }

function coreSheet_(name) {
   const sheet = coreSs_().getSheetByName(name);
   if (!sheet) throw coreError_("SETUP", "The " + name + " tab is missing. Run coreSetup() in the script editor.");
   return sheet;
}

// One read per tab per request: { values } (row 1 = headers).
let CORE_GRID = {};
function coreGrid_(sheet) {
   const id = sheet.getSheetId();
   if (!CORE_GRID[id]) CORE_GRID[id] = { values: sheet.getDataRange().getValues() };
   return CORE_GRID[id];
}

// A tab as objects keyed by header, each with _row (sheet row number).
function coreTable_(name) {
   const values = coreGrid_(coreSheet_(name)).values;
   const headers = (values[0] || []).map(h => String(h).trim());
   const rows = [];
   for (let i = 1; i < values.length; i++) {
      const o = { _row: i + 1 };
      headers.forEach((h, c) => { if (h) o[h] = values[i][c]; });
      rows.push(o);
   }
   return { headers: headers, rows: rows };
}

// Header name (lower case) -> column number.
function coreHeaderMap_(sheet) {
   const headers = coreGrid_(sheet).values[0] || [];
   const map = {};
   headers.forEach((h, i) => { const k = String(h).trim().toLowerCase(); if (k && !(k in map)) map[k] = i + 1; });
   return { map: map, lastCol: headers.length };
}

// Last row with real content (blank cells and unticked boxes don't count).
function coreLastDataRow_(sheet) {
   const values = coreGrid_(sheet).values;
   for (let r = values.length - 1; r >= 1; r--) {
      if (values[r].some(c => c !== "" && c !== false && c !== null)) return r + 1;
   }
   return 1;
}

// Adds a row below the last data row and writes values under their headers.
// Columns filled by a formula in the header row (e.g. User Name) are never written.
function coreAppendRow_(sheet, values) {
   const hm = coreHeaderMap_(sheet);
   const row = coreLastDataRow_(sheet) + 1;
   if (row > sheet.getMaxRows()) sheet.insertRowAfter(sheet.getMaxRows());
   const line = new Array(hm.lastCol).fill(null);
   Object.keys(values).forEach(h => {
      const c = hm.map[h.toLowerCase()];
      if (c && values[h] !== undefined) line[c - 1] = values[h];
   });
   // Write each cell that has a value (leaves formula-driven columns alone).
   line.forEach((v, i) => { if (v !== null && v !== "") sheet.getRange(row, i + 1).setValue(v); });
   delete CORE_GRID[sheet.getSheetId()];
   return row;
}

// Writes only fields whose value changed; returns "Field: old → new" notes.
function coreWriteChanges_(sheet, row, before, values) {
   const hm = coreHeaderMap_(sheet);
   const tz = coreSs_().getSpreadsheetTimeZone();
   const show = v => v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd") : (v === undefined || v === null ? "" : String(v));
   const changes = [];
   Object.keys(values).forEach(h => {
      const c = hm.map[h.toLowerCase()];
      if (!c) return;
      const oldV = show(before[h]), newV = show(values[h]);
      if (oldV === newV) return;
      sheet.getRange(row, c).setValue(values[h] === "" ? "" : values[h]);
      changes.push(h + ": " + (oldV || "(blank)") + " → " + (newV || "(blank)"));
   });
   if (changes.length) delete CORE_GRID[sheet.getSheetId()];
   return changes;
}

function coreMaxNumber_(ids) {
   return ids.reduce((m, id) => { const n = Number(String(id).replace(/^\D+/, "")); return isNaN(n) ? m : Math.max(m, n); }, 0);
}

function coreBool_(v) { return v === true || String(v).trim().toUpperCase() === "TRUE"; }

function coreDescribe_(values) {
   const tz = coreSs_().getSpreadsheetTimeZone();
   return Object.keys(values).filter(k => values[k] !== "" && values[k] !== undefined)
      .map(k => k + ": " + (values[k] instanceof Date ? Utilities.formatDate(values[k], tz, "yyyy-MM-dd") : values[k])).join("; ");
}

function coreJson_(obj) {
   return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function coreError_(code, message, extra) {
   const e = new Error(message);
   e.apiCode = code;
   if (extra) e.apiExtra = extra;
   return e;
}
