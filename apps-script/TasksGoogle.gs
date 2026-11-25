// =========================================================
// AYERS HOUSEHOLD - TASKS ⇄ GOOGLE TASKS
// =========================================================
// Each person connects once (Tasks screen ▸ Connect Google Tasks). Google then gives this script
// a long-lasting key for that person's Google Tasks only; it's kept in Script Properties (only the
// script owner can see them) and can be removed any time (Disconnect).
//
// What syncs: a person's tasks with "Send to Google" ticked go to their default "My Tasks" list.
// Only tasks the app sent stay linked: title, notes (+ checklist as ☐ / ☑ lines), due date and done
// go both ways. Tasks made in Google, and priority, category, repeat and time, stay where they are.
// Changes in the app are sent at once; changes in Google come in when the person opens the app
// (at most every few minutes) or taps Sync now. If both sides changed, Google's version wins.
// Reassigning, unticking "Send to Google" or deleting a task removes it from that person's Google Tasks.
//
// Needs (one time): the Google Tasks API turned on in the Cloud project of the app's sign-in client,
// and that client's secret saved by an admin (Tasks ▸ Google Tasks ▸ Set up), stored in Script Properties.
// =========================================================

const GT_SCOPE = "https://www.googleapis.com/auth/tasks";
const GT_API = "https://tasks.googleapis.com/tasks/v1";
const GT_LIST = "@default";                 // the person's "My Tasks" list
const GT_PULL_EVERY = { load: 60, home: 600 };   // seconds between Google checks per person

const gtProps_ = () => PropertiesService.getScriptProperties();
const gtSecret_ = () => gtProps_().getProperty("GOOGLE_CLIENT_SECRET") || "";
function gtMeta_(userId) { try { return JSON.parse(gtProps_().getProperty("gtasks_meta_" + userId) || "null"); } catch (e) { return null; } }
function gtSetMeta_(userId, m) { if (m) gtProps_().setProperty("gtasks_meta_" + userId, JSON.stringify(m)); else gtProps_().deleteProperty("gtasks_meta_" + userId); }
const gtConnected_ = userId => !!gtProps_().getProperty("gtasks_rt_" + userId);
// Does this person send new tasks to Google by default? (Yes unless they turned it off.)
function gtDefaultSend_(userId) { const m = userId ? gtMeta_(userId) : null; return !m || m.defaultSend !== false; }

// For the app: is sync set up, is this person connected, and each visible person's "send by default".
function gtStatus_(user, users) {
   const m = gtMeta_(user.id) || {};
   const defaults = {};
   (users || []).forEach(u => { defaults[u.id] = gtDefaultSend_(u.id); });
   return { configured: !!gtSecret_(), connected: gtConnected_(user.id), email: m.email || "", lastSync: m.lastSync || "", defaultSend: m.defaultSend !== false,
            error: m.error || "", clientId: CORE_CONFIG.clientId, scope: GT_SCOPE, defaults: defaults };
}

// ------------------------------------------------------------
// Google sign-in for Tasks (code from the app's Google pop-up -> long-lasting key)
// ------------------------------------------------------------
function gtToken_(userId) {
   const cache = CacheService.getScriptCache();
   const hit = cache.get("gtasks_at_" + userId);
   if (hit) return hit;
   const rt = gtProps_().getProperty("gtasks_rt_" + userId);
   if (!rt) throw coreError_("GOOGLE", "Google Tasks isn't connected.");
   const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", { method: "post", muteHttpExceptions: true,
      payload: { client_id: CORE_CONFIG.clientId, client_secret: gtSecret_(), refresh_token: rt, grant_type: "refresh_token" } });
   const j = JSON.parse(res.getContentText() || "{}");
   if (res.getResponseCode() !== 200 || !j.access_token) {
      if (j.error === "invalid_grant") {   // the person removed access in their Google account
         gtProps_().deleteProperty("gtasks_rt_" + userId);
         const m = gtMeta_(userId) || {}; m.error = "Google access was removed. Connect again to keep syncing."; gtSetMeta_(userId, m);
      }
      throw coreError_("GOOGLE", "Google Tasks didn't answer (" + (j.error || res.getResponseCode()) + ").");
   }
   cache.put("gtasks_at_" + userId, j.access_token, Math.max(60, (Number(j.expires_in) || 3600) - 300));
   return j.access_token;
}

// req: { code } -> connects this person's Google Tasks (must be the Google account they sign in with).
function tasksGConnect_(req, user) {
   if (!gtSecret_()) throw coreError_("INVALID", "Google sync isn't set up yet. Ask Chris.");
   const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", { method: "post", muteHttpExceptions: true,
      payload: { code: String(req.code || ""), client_id: CORE_CONFIG.clientId, client_secret: gtSecret_(), redirect_uri: "postmessage", grant_type: "authorization_code" } });
   const j = JSON.parse(res.getContentText() || "{}");
   if (res.getResponseCode() !== 200 || !j.access_token) throw coreError_("INVALID", "Google didn't accept the connection (" + (j.error_description || j.error || res.getResponseCode()) + "). Try again.");
   if (String(j.scope || "").indexOf(GT_SCOPE) === -1) throw coreError_("INVALID", "Google Tasks access wasn't allowed. Try again and tick Google Tasks.");
   const info = JSON.parse(UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(j.access_token), { muteHttpExceptions: true }).getContentText() || "{}");
   const email = String(info.email || "").toLowerCase();
   if (email && email !== String(user.email).toLowerCase()) throw coreError_("INVALID", "That was " + email + ". Connect the Google account you sign in with (" + user.email + ").");
   if (j.refresh_token) gtProps_().setProperty("gtasks_rt_" + user.id, j.refresh_token);
   else if (!gtConnected_(user.id)) throw coreError_("INVALID", "Google didn't give lasting access. Remove Ayers Household from your Google account's third-party access, then connect again.");
   CacheService.getScriptCache().put("gtasks_at_" + user.id, j.access_token, Math.max(60, (Number(j.expires_in) || 3600) - 300));
   const m = gtMeta_(user.id) || {};
   gtSetMeta_(user.id, { email: email || user.email, connectedAt: new Date().toISOString(), lastSync: "", defaultSend: m.defaultSend !== false, error: "" });
   coreLog_(user, "tasks", "Connect", "Google Tasks", user.name, "Connected " + (email || user.email), true);
   const r = gtSyncUser_(user.id, user, true);
   return { connected: true, sync: r };
}

// Disconnects: Google access removed, links cleared (tasks already in Google Tasks stay there).
function tasksGDisconnect_(req, user) {
   const rt = gtProps_().getProperty("gtasks_rt_" + user.id);
   if (rt) { try { UrlFetchApp.fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(rt), { method: "post", muteHttpExceptions: true }); } catch (e) { /* removed here anyway */ } }
   gtProps_().deleteProperty("gtasks_rt_" + user.id);
   CacheService.getScriptCache().remove("gtasks_at_" + user.id);
   const m = gtMeta_(user.id) || {};
   gtSetMeta_(user.id, { defaultSend: m.defaultSend !== false });
   const def = tasksDef_();
   modRows_(def, "tasks", true).filter(r => r["Google Owner"] === user.id).forEach(r =>
      coreWriteChanges_(modSheet_(def, def.tables.tasks), r._row, r, { "Google Task ID": "", "Google Owner": "", "Google Hash": "" }));
   modForget_(def, "tasks");
   coreLog_(user, "tasks", "Disconnect", "Google Tasks", user.name, "Disconnected", true);
   return { connected: false };
}

// req: { on } -> whether this person's new tasks are sent to Google by default.
function tasksGDefault_(req, user) {
   const m = gtMeta_(user.id) || {};
   m.defaultSend = req.on !== false;
   gtSetMeta_(user.id, m);
   return { defaultSend: m.defaultSend };
}

// req: { secret } -> saves the sign-in client's secret (admins). Never sent back to the app.
function tasksGSetSecret_(req, user) {
   coreRequireAdmin_(user);
   const s = String(req.secret || "").trim();
   if (!/^[A-Za-z0-9_\-]{10,}$/.test(s)) throw coreError_("INVALID", "That doesn't look like a client secret (it usually starts with GOCSPX-).");
   gtProps_().setProperty("GOOGLE_CLIENT_SECRET", s);
   coreLog_(user, "tasks", "Edit", "Google Tasks", "Client secret", "Saved", true);
   return { configured: true };
}

// req: {} -> sync now (this person).
function tasksGSync_(req, user) {
   if (!gtConnected_(user.id)) throw coreError_("INVALID", "Connect Google Tasks first.");
   return gtSyncUser_(user.id, user, true);
}

// ------------------------------------------------------------
// The sync
// ------------------------------------------------------------
function gtCall_(userId, method, path, body) {
   const opt = { method: method, muteHttpExceptions: true, headers: { Authorization: "Bearer " + gtToken_(userId) } };
   if (body) { opt.contentType = "application/json"; opt.payload = JSON.stringify(body); }
   const res = UrlFetchApp.fetch(GT_API + path, opt);
   const code = res.getResponseCode();
   if (code === 404 || code === 410) return { gone: true };
   if (code === 204) return {};
   const j = JSON.parse(res.getContentText() || "{}");
   if (code >= 300) throw coreError_("GOOGLE", "Google Tasks: " + ((j.error && j.error.message) || code));
   return j;
}

// Notes as Google shows them: the task's notes, then the checklist as ☐ / ☑ lines.
function gtNotes_(row) {
   const steps = String(row["Checklist"] || "").split("\n").filter(Boolean).map(l => (/^\[x\]/i.test(l) ? "☑ " : "☐ ") + l.replace(/^\[x\]\s*/i, ""));
   return [String(row["Notes"] || "").trim(), steps.join("\n")].filter(Boolean).join("\n\n");
}
function gtFromNotes_(notes) {
   const keep = [], steps = [];
   String(notes || "").split(/\r?\n/).forEach(l => {
      const m = /^\s*([☐☑])\s*(.*)$/.exec(l);
      if (m) { if (m[2].trim()) steps.push((m[1] === "☑" ? "[x] " : "") + m[2].trim()); }
      else keep.push(l);
   });
   return { notes: keep.join("\n").trim(), checklist: steps.join("\n") };
}
// What both sides agreed on last, as a short fingerprint.
function gtShape_(title, notes, due, done) {
   return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
      JSON.stringify([String(title || "").trim(), String(notes || "").replace(/\s+$/g, ""), String(due || "").slice(0, 10), !!done]))).slice(0, 16);
}
const gtAppShape_ = row => gtShape_(row["Title"], gtNotes_(row), row["Due Date"], row["Status"] === TASKS_DONE);
const gtGoogleShape_ = g => gtShape_(g.title, g.notes, g.due, g.status === "completed");
function gtBody_(row) {
   const b = { title: String(row["Title"] || ""), notes: gtNotes_(row), status: row["Status"] === TASKS_DONE ? "completed" : "needsAction" };
   b.due = row["Due Date"] ? row["Due Date"] + "T00:00:00.000Z" : null;
   return b;
}
function gtWriteLink_(def, row, values) {
   coreWriteChanges_(modSheet_(def, def.tables.tasks), row._row, row, values);
   Object.assign(row, values);
   modForget_(def, "tasks");
}

// Sends one task's latest state to whoever's Google Tasks should have it (and removes it from
// anyone whose shouldn't). Never throws: a Google problem doesn't stop the save in the app.
function gtPushRow_(def, row) {
   if (!row || !gtSecret_()) return;
   const owner = String(row["Google Owner"] || ""), gid = String(row["Google Task ID"] || "");
   const who = String(row["Assigned To"] || "");
   const wanted = who && row["Send to Google"] === true && !row["Deleted"] && gtConnected_(who);
   try {
      if (gid && owner && (!wanted || owner !== who)) {   // reassigned, unticked, deleted: take it out of their Google Tasks
         if (gtConnected_(owner)) gtCall_(owner, "delete", "/lists/" + GT_LIST + "/tasks/" + encodeURIComponent(gid));
         gtWriteLink_(def, row, { "Google Task ID": "", "Google Owner": "", "Google Hash": "" });
      }
      if (!wanted) return;
      const shape = gtAppShape_(row);
      if (!row["Google Task ID"]) {
         if (row["Status"] === TASKS_DONE) return;   // done tasks aren't sent the first time
         const g = gtCall_(who, "post", "/lists/" + GT_LIST + "/tasks", gtBody_(row));
         if (g && g.id) gtWriteLink_(def, row, { "Google Task ID": g.id, "Google Owner": who, "Google Hash": shape, "Google Synced At": new Date() });
      } else if (row["Google Hash"] !== shape) {
         const g = gtCall_(who, "patch", "/lists/" + GT_LIST + "/tasks/" + encodeURIComponent(row["Google Task ID"]), gtBody_(row));
         if (g && g.gone) gtWriteLink_(def, row, { "Google Task ID": "", "Google Owner": "", "Google Hash": "", "Send to Google": false });
         else gtWriteLink_(def, row, { "Google Hash": shape, "Google Synced At": new Date() });
      }
   } catch (e) { console.warn("Google Tasks push for " + row["Task ID"] + ": " + (e.message || e)); }
}
// After an app change to a task (by id).
function gtPushId_(def, id) {
   if (!gtSecret_()) return;
   modForget_(def, "tasks");
   gtPushRow_(def, modRows_(def, "tasks", true).find(r => r["Task ID"] === id));
}

// Full sync for one person: changes made in Google come in, then the app's changes go out.
// force = skip the "checked recently" wait. Returns { pulled, pushed } or { skipped }.
function gtSyncUser_(userId, actor, force, every) {
   if (!gtSecret_() || !gtConnected_(userId)) return { skipped: "not connected" };
   const cache = CacheService.getScriptCache();
   if (!force && cache.get("gtasks_recent_" + userId)) return { skipped: "recent" };
   cache.put("gtasks_recent_" + userId, "1", every || GT_PULL_EVERY.load);
   const def = tasksDef_();
   const meta = gtMeta_(userId) || {};
   const started = new Date();
   let pulled = 0, pushed = 0;
   try {
      // 1. From Google: tasks changed since the last sync that are linked to this person's app tasks.
      const linked = {};
      modRows_(def, "tasks", true).filter(r => r["Google Owner"] === userId && r["Google Task ID"]).forEach(r => linked[r["Google Task ID"]] = r);
      if (Object.keys(linked).length) {
         const since = meta.lastSync ? new Date(new Date(meta.lastSync).getTime() - 120000).toISOString() : "";
         let page = "";
         do {
            const q = "?showCompleted=true&showHidden=true&showDeleted=true&maxResults=100" + (since ? "&updatedMin=" + encodeURIComponent(since) : "") + (page ? "&pageToken=" + encodeURIComponent(page) : "");
            const res = gtCall_(userId, "get", "/lists/" + GT_LIST + "/tasks" + q);
            (res.items || []).forEach(g => {
               const row = linked[g.id];
               if (!row) return;
               if (g.deleted) {
                  gtWriteLink_(def, row, { "Google Task ID": "", "Google Owner": "", "Google Hash": "", "Send to Google": false });
                  pulled++; return;
               }
               const gs = gtGoogleShape_(g);
               if (gs === row["Google Hash"]) return;   // nothing new from Google
               const fromNotes = gtFromNotes_(g.notes);
               const change = { "Title": String(g.title || row["Title"]).trim() || row["Title"], "Notes": fromNotes.notes, "Checklist": fromNotes.checklist };
               const gDue = g.due ? String(g.due).slice(0, 10) : "";
               if (gDue !== String(row["Due Date"] || "")) { change["Due Date"] = gDue ? coreDate_(gDue) : ""; if (!gDue) change["Due Time"] = ""; }
               const gDone = g.status === "completed", wasDone = row["Status"] === TASKS_DONE;
               if (gDone !== wasDone) {
                  change["Status"] = gDone ? TASKS_DONE : "To do";
                  Object.assign(change, tasksBeforeSave_("tasks", { "Status": change["Status"] }, row, actor));
               }
               modChange_(def, "tasks", row, change, actor, "From Google Tasks");
               modForget_(def, "tasks");
               const fresh = modRows_(def, "tasks", true).find(r => r["Task ID"] === row["Task ID"]);
               gtWriteLink_(def, fresh, { "Google Hash": gtAppShape_(fresh), "Google Synced At": new Date() });
               if (gDone && !wasDone) tasksAfterDone_(def, fresh, actor);
               if (!gDone && wasDone && /^vehicles:/.test(String(fresh["Source Key"] || "")) && typeof vehFollowUpDone_ === "function") {
                  try { vehFollowUpDone_(String(fresh["Source Key"]).slice(9), false, actor); } catch (e) { /* follow-up stays as it was */ }
               }
               pulled++;
            });
            page = res.nextPageToken || "";
         } while (page);
      }
      // 2. To Google: this person's tasks the app changed (or hasn't sent yet), and ones to take out.
      modForget_(def, "tasks");
      modRows_(def, "tasks", true).filter(r => (r["Assigned To"] === userId && r["Send to Google"] === true && !r["Deleted"]) || r["Google Owner"] === userId)
         .forEach(r => {
            const before = [r["Google Task ID"], r["Google Hash"]].join("|");
            gtPushRow_(def, r);
            if ([r["Google Task ID"], r["Google Hash"]].join("|") !== before) pushed++;
         });
      meta.lastSync = started.toISOString(); meta.error = "";
      gtSetMeta_(userId, meta);
      return { pulled: pulled, pushed: pushed };
   } catch (e) {
      const now = gtMeta_(userId) || meta;   // gtToken_ may have just noted that access was removed
      if (gtConnected_(userId) || !now.error) now.error = e.message || String(e);
      meta.error = now.error;
      gtSetMeta_(userId, now);
      console.warn("Google Tasks sync for " + userId + ": " + meta.error);
      return { error: meta.error, pulled: pulled, pushed: pushed };
   }
}
