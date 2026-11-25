/* Ayers Household - Tasks screens
 * The task list (mine / household / a person's / everyone's for admins and editors), quick add,
 * tick to complete, Show completed, one task (status dropdown, checklist ticks), the task form
 * (checklist steps, repeat with weekdays, optional time) and the Category / Status lists.
 * Data comes from tasks.load; adds and edits go through the shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, $$, toast, ICONS, svg, section, plural } = C;

  const tk = { data: null, loading: false, error: "", showDone: false };
  const WHO_KEY = "hh-tasks-who";
  const IC = {
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    repeat: svg('<path d="M4 9a7 7 0 0 1 12-3l2 2M20 15a7 7 0 0 1-12 3l-2-2"/><path d="M18 4v4h-4M6 20v-4h4"/>')
  };
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DONE = "Done";

  // ------------------------------------------------------------------
  // Data helpers
  // ------------------------------------------------------------------
  const D = () => tk.data;
  const me = () => C.state.me.id;
  const rows = t => (D() && D()[t]) || [];
  const isDone = r => r["Status"] === DONE;
  const listVals = name => rows("lists").filter(l => l["List"] === name && l["Active"] !== false);
  const steps = r => String(r["Checklist"] || "").split("\n").filter(Boolean).map(l => ({ done: /^\[x\]/i.test(l), text: l.replace(/^\[x\]\s*/i, "") }));
  const canAdd = () => M.can(ctx, "tasks", "add");
  const seesAll = () => !!(D() && D().seesAll);
  const canTick = r => r["Assigned To"] === me() || (!r["Assigned To"] && canAdd()) || M.tableCan(ctx, "tasks", "edit", r);
  function who() {
    let w = "";
    try { w = localStorage.getItem(WHO_KEY) || ""; } catch (e) { w = tk.who || ""; }
    if (!w || (/^USR-/.test(w) && (!seesAll() || !(D().users || []).some(u => u.id === w))) || (w === "all" && !seesAll())) w = "mine";
    return w;
  }
  function setWho(w) { tk.who = w; try { localStorage.setItem(WHO_KEY, w); } catch (e) { /* memory only */ } }
  const matches = (r, w) => w === "mine" ? r["Assigned To"] === me() : w === "shared" ? !r["Assigned To"] : w === "byme" ? (r["Added By"] === me() && r["Assigned To"] && r["Assigned To"] !== me()) :
    w === "all" ? true : r["Assigned To"] === w;
  const timeText = t => t ? ((+t.slice(0, 2) % 12) || 12) + ":" + t.slice(3, 5) + (+t.slice(0, 2) < 12 ? " AM" : " PM") : "";
  function dueText(r) {
    if (!r["Due Date"]) return "";
    const today = D().today, tm = r["Due Time"] ? " " + timeText(r["Due Time"]) : "";
    if (r["Due Date"] === today) return "Today" + tm;
    const d = M.parseIso(r["Due Date"]), t = M.parseIso(today), diff = Math.round((d - t) / 86400000);
    if (diff === 1) return "Tomorrow" + tm;
    return M.fmtDay(r["Due Date"], diff > 300 || diff < -300 ? { year: "numeric" } : {}) + tm;
  }
  const repeatText = r => Number(r["Repeat Every"]) >= 1 && r["Repeat Unit"] ? "Every " + (Number(r["Repeat Every"]) === 1 ? r["Repeat Unit"].toLowerCase().replace(/s$/, "") : r["Repeat Every"] + " " + r["Repeat Unit"].toLowerCase()) +
    (r["Repeat Unit"] === "Weeks" && r["Repeat Days"] ? " on " + r["Repeat Days"].split(",").join(", ") : "") : "";

  async function load() {
    tk.loading = true; tk.error = "";
    try { tk.data = await C.api("tasks.load"); }
    catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { tk.loading = false; C.handleError(err); return; }
      tk.error = err.message;
    } finally { tk.loading = false; }
    if (C.parseRoute().name === "tasks") C.render();
  }

  const ctx = {
    key: "tasks",
    data: () => tk.data,
    applyData: d => { tk.data = d; },
    schema: t => tk.data.schema[t],
    rows: t => rows(t),
    refLabel: (t, r) => t === "lists" ? r["Value"] : r["Title"] || "",
    title: (t, r) => t === "tasks" ? r["Title"] : r["Value"],
    singular: t => ({ tasks: "task", lists: "list value" }[t] || "entry"),
    allow: (t, op, row) => t === "tasks" && op === "edit" && !!row && row["Assigned To"] === me() && canAdd(),
    defaults: t => {
      if (t !== "tasks") return {};
      const w = who();
      const person = w === "shared" && seesAll() ? "" : /^USR-/.test(w) ? w : me();
      const g = (D().google || {}).defaults || {};
      return { "Assigned To": person, "Status": "To do", "Priority": "Normal", "Send to Google": person ? g[person] !== false : false };
    },
    hideField: (t, name) => t === "tasks" && (name === "Repeat Days" || (name === "Send to Google" && !(D().google || {}).configured) || (name === "Assigned To" && !seesAll())),
    onFormReady: (t, form, row) => { if (t === "tasks") wireTaskForm(form, row); },
    save: async (action, payload, msg) => {
      C.busy(true);
      let res;
      try { res = await C.api(action, Object.assign({ module: "tasks", reload: true }, payload)); }
      catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        if (err.code === "FORBIDDEN") { tk.data = null; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast((typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) tk.data = res.moduleData; else await load();
      C.state.homeStale = true;
      C.render();
      return res || true;
    },
    reload: () => load()
  };

  // ------------------------------------------------------------------
  // Task form extras: checklist editor, repeat (weekdays only for weekly), household option
  // ------------------------------------------------------------------
  function wireTaskForm(form, row) {
    const fieldOf = n => { const el = form.querySelector('[name="' + n + '"]'); return el && el.closest(".field"); };
    const val = n => (form.querySelector('[name="' + n + '"]') || {}).value || "";
    // Household = no one assigned (admins and editors).
    const who = form.querySelector('select[name="Assigned To"]');
    if (who && who.options[0] && who.options[0].value === "") who.options[0].textContent = "Household (anyone)";
    // Checklist: rows of steps instead of the raw text.
    const ta = form.querySelector('textarea[name="Checklist"]');
    if (ta && !ta.disabled) {
      ta.hidden = true;
      const box = document.createElement("div");
      box.className = "tk-steps-edit";
      ta.insertAdjacentElement("afterend", box);
      let list = steps({ "Checklist": ta.value });
      const draw = () => {
        box.innerHTML = list.map((s, i) => '<div class="tk-step-row" data-i="' + i + '"><input type="checkbox"' + (s.done ? " checked" : "") + ' aria-label="Done">' +
          '<input type="text" value="' + esc(s.text) + '" placeholder="Step" aria-label="Step ' + (i + 1) + '"><button type="button" class="icon-btn" data-step-x aria-label="Remove step">' + ICONS.close + '</button></div>').join("") +
          '<button type="button" class="link-btn" data-step-add>+ Add a step</button>';
      };
      const sync = () => {
        list = $$(".tk-step-row", box).map(r => ({ done: r.querySelector("input[type=checkbox]").checked, text: r.querySelector("input[type=text]").value }));
        ta.value = list.filter(s => s.text.trim()).map(s => (s.done ? "[x] " : "") + s.text.trim()).join("\n");
      };
      box.addEventListener("input", sync);
      box.addEventListener("change", sync);
      box.addEventListener("click", e => {
        if (e.target.closest("[data-step-add]")) { sync(); list.push({ done: false, text: "" }); draw(); const ins = $$(".tk-step-row input[type=text]", box); ins[ins.length - 1].focus(); }
        const x = e.target.closest("[data-step-x]");
        if (x) { sync(); list.splice(+x.closest(".tk-step-row").dataset.i, 1); draw(); sync(); }
        // Enter in a step adds the next one.
      });
      box.addEventListener("keydown", e => {
        if (e.key === "Enter" && e.target.matches(".tk-step-row input[type=text]")) { e.preventDefault(); sync(); list.splice(+e.target.closest(".tk-step-row").dataset.i + 1, 0, { done: false, text: "" }); draw(); $$(".tk-step-row input[type=text]", box)[+e.target.closest(".tk-step-row").dataset.i + 1].focus(); }
      });
      draw();
    }
    // Repeat: unit only when "every" is filled; weekday picks only for weekly.
    const daysIn = form.querySelector('input[name="Repeat Days"]');
    const unitF = fieldOf("Repeat Unit");
    let dayBox = null;
    if (daysIn && unitF) {
      dayBox = document.createElement("div");
      dayBox.className = "field tk-days";
      const have = String(daysIn.value || "").split(",");
      dayBox.innerHTML = '<label>On</label><div class="tk-daybtns">' + DAYS.map(d => '<button type="button" class="tk-day' + (have.indexOf(d) !== -1 ? " on" : "") + '" data-day="' + d + '" aria-pressed="' + (have.indexOf(d) !== -1) + '">' + d.slice(0, 2) + '</button>').join("") + '</div>' +
        '<div class="hint">Leave all off to repeat on the same weekday.</div>';
      unitF.insertAdjacentElement("afterend", dayBox);
      dayBox.addEventListener("click", e => {
        const b = e.target.closest("[data-day]"); if (!b) return;
        b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on"));
        daysIn.value = $$(".tk-day.on", dayBox).map(x => x.dataset.day).join(",");
      });
    }
    const syncRepeat = () => {
      const every = val("Repeat Every"), unit = val("Repeat Unit");
      if (unitF) unitF.hidden = !every;
      if (dayBox) dayBox.hidden = !(every && unit === "Weeks");
      const tf = fieldOf("Due Time"); if (tf) tf.hidden = !val("Due Date") && !val("Due Time");
    };
    form.addEventListener("input", syncRepeat); form.addEventListener("change", syncRepeat); syncRepeat();
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  function taskRow(r) {
    const done = isDone(r), st = steps(r), tickable = canTick(r);
    const today = D().today, overdue = !done && r["Due Date"] && r["Due Date"] < today;
    const sub = [dueText(r), r["Status"] !== "To do" && !done ? r["Status"] : "", r["Category"], st.length ? st.filter(s => s.done).length + " of " + st.length + " steps" : "",
      r["Assigned To"] ? (r["Assigned To"] !== me() ? M.userName(ctx, r["Assigned To"]) : "") : "Household", done && r["Completed At"] ? "Done " + M.fmtDay(r["Completed At"]) : ""].filter(Boolean).join(" · ");
    return '<div class="list-item tk-item' + (r["Priority"] === "High" ? " high" : "") + (done ? " done" : "") + '">' +
      (tickable ? '<button class="sh-check' + (done ? " on" : "") + '" data-tk="tick" data-id="' + esc(r["Task ID"]) + '" aria-pressed="' + done + '" aria-label="' + (done ? "Reopen " : "Complete ") + esc(r["Title"]) + '">' + (done ? IC.check : "") + '</button>'
        : '<span class="sh-check off' + (done ? " on" : "") + '" aria-hidden="true">' + (done ? IC.check : "") + '</span>') +
      '<a class="body" href="#/tasks/t/' + encodeURIComponent(r["Task ID"]) + '"><div class="title">' + (r["Priority"] === "High" && !done ? '<span class="tk-hi" aria-label="High priority">!</span> ' : "") + esc(r["Title"]) +
        (repeatText(r) ? ' <span class="tk-rep" title="' + esc(repeatText(r)) + '">' + IC.repeat + '</span>' : "") + '</div>' +
        (sub ? '<div class="sub' + (overdue ? " overdue" : "") + '">' + esc(sub) + '</div>' : "") + '</a></div>';
  }

  function viewList() {
    const w = who(), today = D().today, week = M.isoDay(new Date(M.parseIso(today).getTime() + 7 * 86400000));
    const all = rows("tasks");
    const mineOpen = all.filter(r => !isDone(r));
    const chip = (key, label, n) => '<button class="sh-chip' + (w === key ? " on" : "") + '" data-tk="who" data-who="' + esc(key) + '">' + esc(label) + (n !== undefined ? ' <span>' + n + '</span>' : "") + '</button>';
    const count = k => mineOpen.filter(r => matches(r, k)).length;
    let chips = chip("mine", "Mine", count("mine")) + chip("shared", "Household", count("shared"));
    if (seesAll()) {
      chips += chip("all", "Everyone", mineOpen.length);
      (D().users || []).filter(u => u.id !== me()).forEach(u => { chips += chip(u.id, u.name.split(" ")[0], count(u.id)); });
    } else if (all.some(r => matches(r, "byme"))) chips += chip("byme", "Assigned by me", count("byme"));
    const list = all.filter(r => matches(r, w));
    const open = list.filter(r => !isDone(r));
    const rank = { "High": 0, "Normal": 1, "Low": 2 };
    const sorter = (a, b) => String(a["Due Date"] || "9999") .localeCompare(String(b["Due Date"] || "9999")) || (rank[a["Priority"]] - rank[b["Priority"]]) ||
      String(a["Due Time"] || "99").localeCompare(String(b["Due Time"] || "99")) || String(a["Title"]).localeCompare(String(b["Title"]));
    const groups = [
      ["Overdue", open.filter(r => r["Due Date"] && r["Due Date"] < today)],
      ["Today", open.filter(r => r["Due Date"] === today)],
      ["Next 7 days", open.filter(r => r["Due Date"] > today && r["Due Date"] <= week)],
      ["Later", open.filter(r => r["Due Date"] > week)],
      ["No date", open.filter(r => !r["Due Date"])]
    ].filter(g => g[1].length).map(g => [g[0], g[1].sort(sorter)]);
    const add = canAdd() && (w !== "shared" || seesAll()) && (w !== "all" && w !== "byme") ?
      '<div class="sh-add tk-add"><input id="tk_add" type="text" placeholder="Add a task" autocomplete="off" enterkeyhint="done" aria-label="Add a task">' +
        '<input id="tk_due" type="date" aria-label="Due date">' +
        '<button class="btn primary" data-tk="add" aria-label="Add">' + ICONS.plus + '</button><button class="btn" data-tk="more">More</button></div>' : "";
    const doneList = list.filter(isDone).sort((a, b) => String(b["Completed At"]).localeCompare(String(a["Completed At"])));
    const body = groups.length ? groups.map(g => '<div class="sh-group"><div class="sh-grouphead' + (g[0] === "Overdue" ? " tk-over" : "") + '">' + esc(g[0]) + '<span>' + g[1].length + '</span></div><div class="card list">' + g[1].map(taskRow).join("") + '</div></div>').join("")
      : '<div class="card"><div class="empty">' + (w === "shared" ? "No household tasks." : "Nothing to do here.") + '</div></div>';
    const doneHtml = '<label class="check tk-donetoggle"><input type="checkbox" data-tk="showdone"' + (tk.showDone ? " checked" : "") + '> Show completed (' + doneList.length + ')</label>' +
      (tk.showDone && doneList.length ? '<div class="card list">' + doneList.slice(0, 100).map(taskRow).join("") + '</div>' : "");
    const links = M.tableCan(ctx, "lists", "add", null, { "List": "Category" }) ? section("Settings", '<div class="card list">' +
      [["Category", "Categories"], ["Status", "Statuses"]].map(x => '<a class="list-item" href="#/tasks/list/' + x[0] + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + x[1] + '</div><div class="sub">' +
        esc(listVals(x[0]).map(l => l["Value"]).join(", ")) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") + '</div>') : "";
    return { title: "Tasks", back: true, keepScroll: true, html: googleCard() + '<div class="sh-chips" role="tablist" aria-label="Whose tasks">' + chips + '</div>' + add + body + doneHtml + links };
  }

  // Google Tasks: set up (admin), connect, last sync, Sync now, settings.
  function googleCard() {
    const g = D().google || {};
    if (!g.configured) return C.isAdmin() ? '<div class="card tk-google"><div class="tk-g-body"><b>Google Tasks sync</b><span>One-time setup: save the sign-in client’s secret.</span></div><button class="btn" data-tk="g-secret">Set up</button></div>' : "";
    if (!g.connected) return '<div class="card tk-google"><div class="tk-g-body"><b>Google Tasks</b><span>' + esc(g.error || "Put your tasks in your Google Tasks too (My Tasks list).") + '</span></div><button class="btn primary" data-tk="g-connect">Connect</button></div>';
    const when = g.lastSync ? M.fmtDayTime(String(new Date(g.lastSync).toLocaleString("sv").replace(" ", "T")).slice(0, 16)) : "not yet";
    return '<div class="card tk-google on"><div class="tk-g-body"><b>Google Tasks connected</b><span>' + esc((g.error ? g.error + " · " : "") + "Last synced " + when) + '</span></div>' +
      '<button class="btn" data-tk="g-sync">Sync now</button><button class="icon-btn" data-tk="g-settings" aria-label="Google Tasks settings">' + svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') + '</button></div>';
  }
  function gConnect() {
    const g = D().google || {};
    const oa = window.google && google.accounts && google.accounts.oauth2;
    if (!oa) { toast("Google isn't loaded yet. Try again in a moment.", true); return; }
    const client = oa.initCodeClient({
      client_id: g.clientId, scope: g.scope, ux_mode: "popup", login_hint: C.state.me.email, select_account: false,
      callback: async r => {
        if (!r || !r.code) { toast(r && r.error === "access_denied" ? "Google Tasks wasn't connected." : "Google didn't finish connecting.", true); return; }
        try {
          const res = await ctx.save("tasks.gConnect", { code: r.code }, x => "Google Tasks connected" + (x && x.sync && x.sync.pushed ? " · sent " + plural(x.sync.pushed, "task") : ""));
          return res;
        } catch (err) { toast(err.message, true); }
      },
      error_callback: e => { if (e && e.type !== "popup_closed") toast("Google pop-up was blocked or closed. Try again.", true); }
    });
    client.requestCode();
  }
  function gSecretForm() {
    C.openSheet({
      title: "Set up Google Tasks sync",
      body: '<p class="confirm-msg">In Google Cloud Console ▸ APIs & Services ▸ Credentials, open the app’s Web client (the one used for sign-in), copy its <b>Client secret</b> and paste it here. It’s saved on the server only and never shown again.</p>' +
        '<div class="field"><label for="f_gsecret">Client secret</label><input type="password" id="f_gsecret" name="secret" autocomplete="off" required></div>',
      submitLabel: "Save",
      onSubmit: async v => !!(await ctx.save("tasks.gSetSecret", { secret: v.secret }, "Google sync is set up. Each person can now connect."))
    });
  }
  function gSettings() {
    const g = D().google || {};
    C.openSheet({
      title: "Google Tasks", noSubmit: true, cancelLabel: "Close",
      body: '<p class="confirm-msg">Connected as ' + esc(g.email) + '. Your tasks with “Send to Google Tasks” ticked go to your My Tasks list; done, title, notes, checklist and due date go both ways.</p>' +
        '<div class="field"><label class="check"><input type="checkbox" id="f_gdef"' + (g.defaultSend ? " checked" : "") + '> Send my new tasks to Google Tasks by default</label></div>' +
        '<div class="danger-zone"><button type="button" class="btn danger" data-g-off>Disconnect</button></div>',
      onReady: (form, close) => {
        $("#f_gdef", form).addEventListener("change", e => ctx.save("tasks.gDefault", { on: e.target.checked }, e.target.checked ? "New tasks go to Google by default" : "New tasks stay in the app by default").catch(err => toast(err.message, true)));
        $("[data-g-off]", form).addEventListener("click", async () => {
          if (!(await M.confirmSheet({ title: "Disconnect Google Tasks?", message: "Syncing stops and the app's access to your Google Tasks is removed. Tasks already in Google Tasks stay there.", submitLabel: "Disconnect", danger: true }))) return;
          try { await ctx.save("tasks.gDisconnect", {}, "Google Tasks disconnected"); close(); } catch (err) { toast(err.message, true); }
        });
      }
    });
  }

  function viewTask(id) {
    const r = rows("tasks").find(x => x["Task ID"] === id);
    if (!r) return { title: "Task", back: true, html: '<div class="card"><div class="empty">That task isn’t on your list any more.</div></div>' };
    const done = isDone(r), st = steps(r), tick = canTick(r), editable = M.tableCan(ctx, "tasks", "edit", r);
    const statuses = listVals("Status").slice().sort((a, b) => (Number(a["Sort"]) || 99) - (Number(b["Sort"]) || 99) || String(a["Value"]).localeCompare(String(b["Value"])));
    const statusCtl = editable ? '<select class="tk-status" data-tk="status" data-id="' + esc(id) + '" aria-label="Status">' +
      (statuses.some(s => s["Value"] === r["Status"]) ? "" : '<option>' + esc(r["Status"]) + '</option>') +
      statuses.map(s => '<option' + (s["Value"] === r["Status"] ? " selected" : "") + '>' + esc(s["Value"]) + '</option>').join("") + '</select>' : '<span class="pill">' + esc(r["Status"]) + '</span>';
    const kv = [["Assigned to", r["Assigned To"] ? M.userName(ctx, r["Assigned To"]) : "Household (anyone)"], ["Due", dueText(r)], ["Priority", r["Priority"]], ["Category", r["Category"]],
      ["Repeats", repeatText(r)], ["Google Tasks", r["Google Task ID"] ? "In " + M.userName(ctx, r["Google Owner"]).split(" ")[0] + "'s Google Tasks" : r["Send to Google"] === true && (D().google || {}).configured ? "Waiting to be sent (connect Google Tasks)" : ""],
      ["Added by", M.userName(ctx, r["Added By"])], ["From", r["Source"]], ["Completed", done && r["Completed At"] ? M.fmtDayTime(r["Completed At"]) + (r["Completed By"] ? " by " + M.userName(ctx, r["Completed By"]) : "") : ""]]
      .filter(x => x[1]);
    const html = '<div class="card hero tk-hero' + (r["Priority"] === "High" ? " high" : "") + '"><h2>' + esc(r["Title"]) + '</h2><div class="meta">' + esc(r["Task ID"]) + '</div>' +
      '<div class="actions">' + statusCtl + (tick ? '<button class="btn ' + (done ? "" : "primary") + '" data-tk="tick" data-id="' + esc(id) + '">' + (done ? "Reopen" : "Complete") + '</button>' : "") +
      (editable ? '<button class="btn" data-mod-edit="tasks" data-id="' + esc(id) + '">Edit</button>' : "") + '</div></div>' +
      (st.length ? section("Checklist · " + st.filter(s => s.done).length + " of " + st.length, '<div class="card list">' + st.map((s, i) =>
        '<label class="list-item tk-step' + (s.done ? " done" : "") + '"><input type="checkbox" data-tk="step" data-id="' + esc(id) + '" data-i="' + i + '"' + (s.done ? " checked" : "") + (tick ? "" : " disabled") + '><span class="body">' + esc(s.text) + '</span></label>').join("") + '</div>') : "") +
      '<div class="card kv">' + kv.map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + esc(x[1]) + '</div>').join("") + '</div>' +
      (r["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(r["Notes"]) + '</div></div>') : "");
    return { title: "Task", back: true, html: html };
  }

  function view(args) {
    M.current = ctx;
    if (tk.error) return { title: "Tasks", back: true, html: '<div class="card"><div class="empty">' + esc(tk.error) + '</div></div><div class="actions"><button class="btn" data-tk="retry">Try again</button></div>' };
    if (!tk.data) {
      if (!tk.loading) load();
      return { title: "Tasks", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "t": return viewTask(args[1]);
      case "list": {
        const name = args[1] === "Status" ? "Status" : "Category";
        return M.listView(ctx, { table: "lists", list: name, title: name === "Status" ? "Statuses" : "Categories",
          sort: name === "Status" ? ((a, b) => (Number(a["Sort"]) || 99) - (Number(b["Sort"]) || 99) || String(a["Value"]).localeCompare(String(b["Value"]))) : undefined,
          sub: r => name === "Status" && r["Value"] === DONE ? "Completes the task" : "" });
      }
      default: return viewList();
    }
  }
  C.registerModule("tasks", view, () => { tk.data = null; tk.loading = false; });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  async function tick(id) {
    const r = rows("tasks").find(x => x["Task ID"] === id);
    if (!r) return;
    const done = !isDone(r);
    try {
      await ctx.save("tasks.complete", { id: id, done: done }, res => done ? (res && res.moduleData && rows("tasks").length ? "Done" : "Done") : "Reopened");
    } catch (err) { toast(err.message, true); }
  }
  function quickAdd() {
    const input = $("#tk_add"), due = $("#tk_due");
    const title = (input && input.value || "").replace(/\s+/g, " ").trim();
    if (!title) { if (input) input.focus(); return; }
    const values = Object.assign(ctx.defaults("tasks"), { "Title": title });
    if (due && due.value) values["Due Date"] = due.value;
    ctx.save("modAdd", { table: "tasks", values: values }, "Task added").then(() => { const i = $("#tk_add"); if (i) i.focus(); }).catch(err => toast(err.message, true));
  }
  document.addEventListener("click", e => {
    if (e.target.closest("[data-act='refresh']") && C.parseRoute().name === "tasks") tk.data = null;
    const el = e.target.closest("[data-tk]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const d = el.dataset;
    switch (d.tk) {
      case "tick": tick(d.id); break;
      case "who": setWho(d.who); C.render(); break;
      case "add": quickAdd(); break;
      case "more": M.recordForm(ctx, "tasks", "", { title: "Add a task", prefill: Object.assign({ "Title": ($("#tk_add") || {}).value || "" }, ($("#tk_due") || {}).value ? { "Due Date": $("#tk_due").value } : {}) }); break;
      case "retry": tk.error = ""; C.render(); break;
      case "g-connect": gConnect(); break;
      case "g-secret": gSecretForm(); break;
      case "g-settings": gSettings(); break;
      case "g-sync": ctx.save("tasks.gSync", {}, res => res && res.error ? "Google: " + res.error : "Synced" + (res && (res.pulled || res.pushed) ? " · " + [res.pulled ? res.pulled + " from Google" : "", res.pushed ? res.pushed + " sent" : ""].filter(Boolean).join(", ") : "")).catch(err => toast(err.message, true)); break;
    }
  });
  document.addEventListener("change", async e => {
    const t = e.target;
    if (!t || !t.matches || C.parseRoute().name !== "tasks") return;
    if (t.matches("[data-tk='showdone']")) { tk.showDone = t.checked; C.render(); }
    if (t.matches("[data-tk='status']")) {
      try { await ctx.save("modUpdate", { table: "tasks", id: t.dataset.id, values: { "Status": t.value } }, t.value === DONE ? "Done" : "Status: " + t.value); }
      catch (err) { toast(err.message, true); C.render(); }
    }
    if (t.matches("[data-tk='step']")) {
      try { await ctx.save("tasks.check", { id: t.dataset.id, index: +t.dataset.i, done: t.checked }, t.checked ? "Step done" : "Step reopened"); }
      catch (err) { toast(err.message, true); t.checked = !t.checked; }
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target && (e.target.id === "tk_add" || e.target.id === "tk_due")) { e.preventDefault(); quickAdd(); }
  });
})();
