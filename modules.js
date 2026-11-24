/* Ayers Household - shared module screens
 * Forms built from each table's layout (sent by the server), dropdown lists with "+ Add new…",
 * list managers (chores, venues, list values...), and the admin's Deleted items screen.
 * Every module uses these so the same action looks and works the same everywhere.
 */
(function () {
  "use strict";
  const C = window.HH_CORE;
  const { esc, $, $$, toast, openSheet, ICONS } = C;

  // ------------------------------------------------------------------
  // Formatting
  // ------------------------------------------------------------------
  const money = n => (n === "" || n === null || n === undefined || isNaN(Number(n))) ? "" :
    (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };
  const isoDay = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  function fmtDay(s, opts) {
    const d = parseIso(s); if (!d) return s || "";
    return d.toLocaleDateString(undefined, Object.assign({ weekday: "short", month: "short", day: "numeric" }, opts || {}));
  }
  function fmtTime(s) {
    const m = /T(\d{2}):(\d{2})/.exec(String(s || "")); if (!m) return "";
    const h = +m[1]; return ((h % 12) || 12) + ":" + m[2] + (h < 12 ? " AM" : " PM");
  }
  const fmtDayTime = s => fmtDay(s) + (fmtTime(s) ? ", " + fmtTime(s) : "");
  const userName = (ctx, id) => { const u = (ctx.data().users || []).find(x => x.id === id); return u ? u.name : id || ""; };
  const userLabel = (ctx, id) => { const u = (ctx.data().users || []).find(x => x.id === id); return u ? u.id + " " + u.name : id || ""; };

  // ------------------------------------------------------------------
  // Permissions (mirror the server's rules so only usable buttons show)
  // ------------------------------------------------------------------
  function can(ctx, area, cap) { const c = (ctx.data().caps || {})[area]; return !!(c && c[cap]); }
  function tableArea(ctx, table, values) {
    const t = ctx.schema(table);
    return (t.listAreas && values && t.listAreas[values["List"]]) || t.area;
  }
  // op: "add" | "edit" | "delete"
  function tableCan(ctx, table, op, row, values) {
    const t = ctx.schema(table), me = C.state.me;
    if (t.adminOnly && !me.admin) return false;
    if (op !== "view" && ctx.locked && ctx.locked(table, row, values)) return false;
    if (ctx.allow && ctx.allow(table, op, row, values)) return true;
    const area = tableArea(ctx, table, Object.assign({}, row || {}, values || {}));
    if (t.kind === "list") return can(ctx, area, "addListValue");
    if (op === "add") return can(ctx, area, "add");
    const own = row && row["Added By"] === me.id;
    if (op === "edit") return can(ctx, area, "edit") || (own && can(ctx, area, "editOwn"));
    return can(ctx, area, "delete") || (own && can(ctx, area, "deleteOwn"));
  }

  // ------------------------------------------------------------------
  // Fields
  // ------------------------------------------------------------------
  const NEW = "__new__";
  // Choices for a link (ref) field: active, not deleted, plus the current value.
  function refChoices(ctx, f, current) {
    const rt = ctx.schema(f.ref);
    return ctx.rows(f.ref).filter(r => !r["Deleted"] && (r["Active"] !== false || r[rt.id] === current))
      .map(r => ({ value: r[rt.id], label: ctx.refLabel(f.ref, r) + (r["Active"] === false ? " (off)" : "") }))
      .sort((a, b) => ctx.refSort ? ctx.refSort(f.ref, a, b) : a.label.localeCompare(b.label));
  }
  function listChoices(ctx, f, current) {
    const opts = (f.options || []).slice();
    if (current && opts.indexOf(current) === -1) opts.unshift(current);
    return opts.map(o => ({ value: o, label: o }));
  }
  // Can this person add a new choice to the field's list from inside a form?
  function canAddChoice(ctx, f) {
    if (f.type === "ref") return ctx.schema(f.ref).kind === "list" && tableCan(ctx, f.ref, "add");
    if (f.type === "list") return tableCan(ctx, "lists", "add", null, { "List": f.list });
    return false;
  }

  // A value as text, for read-only forms.
  function shownValue(ctx, f, v) {
    if (f.type === "bool") return v === true ? "Yes" : "No";
    if (v === "" || v === null || v === undefined) return "";
    if (f.type === "money") return money(v);
    if (f.type === "percent") return v + "%";
    if (f.type === "date") return fmtDay(v, { year: "numeric" });
    if (f.type === "datetime") return fmtDayTime(v);
    if (f.type === "user") return userName(ctx, v);
    if (f.type === "file") return v ? "File attached" : "";
    if (f.type === "ref") {
      const rt = ctx.schema(f.ref), r = ctx.rows(f.ref).find(x => x[rt.id] === v);
      return r ? ctx.refLabel(f.ref, r) : v;
    }
    return String(v);
  }

  function fieldHtml(ctx, table, f, value, opts) {
    opts = opts || {};
    const id = "f_" + table + "_" + f.name.replace(/\W+/g, "_");
    const v = value === undefined || value === null ? "" : value;
    const label = esc(f.label || f.name);
    const req = f.required ? " required" : "";
    const lab = '<label for="' + id + '">' + label + (f.required ? ' <span class="req">*</span>' : "") + '</label>';
    const hint = f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : "";
    if (opts.hidden) return '<input type="hidden" name="' + esc(f.name) + '" value="' + esc(v) + '">';
    if (f.type === "file") {
      const ro = f.readOnly || opts.readOnly;
      if (ro && !v) return "";
      return '<div class="field file-field" data-file-field="' + esc(f.name) + '"><label>' + label + '</label>' +
        (v ? '<div class="file-current">' + fileHtml(ctx, v, "file-thumb") + '</div>' : "") +
        (ro ? "" : '<div class="file-actions"><label class="btn file-btn"><input type="file" accept="image/*,application/pdf" data-file-input="' + esc(f.name) + '"> ' +
          (v ? "Replace" : "Add photo or file") + '</label>' +
          (v ? '<button type="button" class="link-btn" data-file-clear="' + esc(f.name) + '">Remove</button>' : "") + '<span class="file-picked"></span></div>') +
        (ro ? "" : hint) + '</div>';
    }
    if (f.readOnly || opts.readOnly) {
      if (v === "" && f.type !== "bool") return "";
      return '<div class="field"><label>' + label + '</label><div class="ro-value">' + esc(shownValue(ctx, f, v)) + '</div>' + (opts.readOnly ? "" : hint) + '</div>';
    }
    let input;
    switch (f.type) {
      case "ref": case "list": {
        const choices = f.type === "ref" ? refChoices(ctx, f, v) : listChoices(ctx, f, v);
        input = '<select id="' + id + '" name="' + esc(f.name) + '"' + req + ' data-field="' + esc(f.name) + '" data-prev="' + esc(v) + '">' +
          '<option value="">' + (f.required ? "Choose…" : "") + '</option>' +
          choices.map(c => '<option value="' + esc(c.value) + '"' + (String(c.value) === String(v) ? " selected" : "") + '>' + esc(c.label) + '</option>').join("") +
          (canAddChoice(ctx, f) ? '<option value="' + NEW + '">＋ Add new…</option>' : "") + '</select>';
        break;
      }
      case "user": {
        const users = (ctx.data().users || []);
        input = '<select id="' + id + '" name="' + esc(f.name) + '"' + req + '><option value="">' + (f.required ? "Choose…" : "") + '</option>' +
          users.map(u => '<option value="' + esc(u.id) + '"' + (u.id === v ? " selected" : "") + '>' + esc(u.name) + '</option>').join("") + '</select>';
        break;
      }
      case "choice":
        input = '<select id="' + id + '" name="' + esc(f.name) + '"' + req + '>' + (f.required ? "" : '<option value=""></option>') +
          (f.options || []).map(o => '<option value="' + esc(o) + '"' + (String(o) === String(v || f.default || "") ? " selected" : "") + '>' + esc(o) + '</option>').join("") + '</select>';
        break;
      case "money":
        input = '<div class="suffix-wrap money-wrap"><span class="prefix">$</span><input type="number" step="0.01" inputmode="decimal" id="' + id + '" name="' + esc(f.name) + '" value="' + esc(v) + '"' + req + '></div>';
        break;
      case "number": case "percent":
        input = '<input type="number" step="any" inputmode="decimal" id="' + id + '" name="' + esc(f.name) + '" value="' + esc(v) + '"' + req + '>';
        break;
      case "date":
        input = '<input type="date" id="' + id + '" name="' + esc(f.name) + '" value="' + esc(String(v).slice(0, 10)) + '"' + req + '>';
        break;
      case "datetime":
        input = '<input type="datetime-local" id="' + id + '" name="' + esc(f.name) + '" value="' + esc(String(v).slice(0, 16)) + '"' + req + '>';
        break;
      case "longtext":
        input = '<textarea id="' + id + '" name="' + esc(f.name) + '"' + req + '>' + esc(v) + '</textarea>';
        break;
      case "bool":
        return '<div class="field"><label class="check"><input type="checkbox" name="' + esc(f.name) + '"' + (v === true ? " checked" : "") + '> ' + label + '</label>' + hint + '</div>';
      case "url":
        input = '<input type="url" inputmode="url" id="' + id + '" name="' + esc(f.name) + '" value="' + esc(v) + '"' + req + '>';
        break;
      default:
        input = '<input type="text" id="' + id + '" name="' + esc(f.name) + '" value="' + esc(v) + '"' + req + '>';
    }
    return '<div class="field">' + lab + input + hint + '</div>';
  }

  // "+ Add new…" in a dropdown: opens that list's form on top; the new choice is picked when saved.
  function wireAddNew(ctx, table, form) {
    $$("select[data-field]", form).forEach(sel => {
      sel.addEventListener("change", () => {
        if (sel.value !== NEW) { sel.dataset.prev = sel.value; return; }
        const f = ctx.schema(table).fields.find(x => x.name === sel.dataset.field);
        const prev = sel.dataset.prev || "";
        sel.value = prev;
        const onCreated = async newId => {
          await ctx.reload();
          const f2 = ctx.schema(table).fields.find(x => x.name === f.name);
          const fresh = document.createElement("div");
          fresh.innerHTML = fieldHtml(ctx, table, f2, f.type === "ref" ? newId : newId, {});
          const newSel = $("select", fresh);
          sel.innerHTML = newSel.innerHTML;
          sel.value = newId; sel.dataset.prev = newId;
          sel.dispatchEvent(new Event("input", { bubbles: true }));
        };
        if (f.type === "ref") recordForm(ctx, f.ref, "", { onCreated: onCreated });
        else recordForm(ctx, "lists", "", { prefill: { "List": f.list }, lockList: true, onCreated: (id, values) => onCreated(values["Value"]) });
      });
    });
  }

  // ------------------------------------------------------------------
  // Files (photos, cards, receipts): picked in a form, uploaded after the record is saved.
  // Shown through the module's "<module>.file" action so they stay private to app users.
  // ------------------------------------------------------------------
  const driveId = url => { const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(String(url || "")); return m ? m[1] : ""; };
  const fileCache = {};   // fileId -> { url (blob), mime, name } | { loading } | { error }
  function fileHtml(ctx, url, cls) {
    const id = driveId(url);
    if (!id) return "";
    const c = fileCache[id];
    if (c && c.mime === "application/pdf") return '<button type="button" class="btn file-pdf" data-file-open="' + esc(id) + '">' + ICONS.next + ' Open PDF</button>';
    return '<img class="' + esc(cls || "file-thumb") + '" alt="" data-file-id="' + esc(id) + '" data-file-mod="' + esc(ctx.key) + '"' + (c && c.url ? ' src="' + c.url + '"' : "") +
      ' role="button" tabindex="0" data-file-open="' + esc(id) + '">';
  }
  function hydrateFiles(root) {
    $$("img[data-file-id]", root || document).forEach(img => {
      const id = img.dataset.fileId, c = fileCache[id];
      if (c && c.url) { if (img.getAttribute("src") !== c.url) img.src = c.url; return; }
      if (c) return;
      fileCache[id] = { loading: true };
      C.api(img.dataset.fileMod + ".file", { fileId: id }).then(r => {
        const bin = atob(r.file.data), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([arr], { type: r.file.mimeType }));
        fileCache[id] = { url: url, mime: r.file.mimeType, name: r.file.name };
        if (r.file.mimeType === "application/pdf") C.render();
        else $$('img[data-file-id="' + id + '"]').forEach(x => { x.src = url; });
      }).catch(() => { fileCache[id] = { error: true }; $$('img[data-file-id="' + id + '"]').forEach(x => x.classList.add("file-missing")); });
    });
  }
  new MutationObserver(() => hydrateFiles()).observe(document.documentElement, { childList: true, subtree: true });
  function openFile(id) {
    const c = fileCache[id];
    if (!c || !c.url) { toast("Still loading, try again in a moment."); return; }
    if (c.mime === "application/pdf") { window.open(c.url, "_blank"); return; }
    const v = document.createElement("div");
    v.className = "file-viewer";
    v.innerHTML = '<img alt="" src="' + c.url + '"><button type="button" class="icon-btn" aria-label="Close">' + ICONS.close + '</button>';
    document.body.appendChild(v);
    v.addEventListener("click", () => v.remove());
  }
  // A photo is shrunk to about 1600 px (JPEG); a PDF goes as it is.
  function prepareFile(file) {
    return new Promise((resolve, reject) => {
      const asIs = () => {
        const fr = new FileReader();
        fr.onload = () => resolve({ data: String(fr.result).replace(/^data:[^,]*,/, ""), mimeType: file.type || "application/octet-stream", name: file.name });
        fr.onerror = () => reject(new Error("That file couldn't be read."));
        fr.readAsDataURL(file);
      };
      if (!/^image\//.test(file.type)) return asIs();
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ data: cv.toDataURL("image/jpeg", 0.82).split(",")[1], mimeType: "image/jpeg", name: file.name });
      };
      img.onerror = () => { URL.revokeObjectURL(url); asIs(); };
      img.src = url;
    });
  }
  async function uploadFile(ctx, table, id, field, file) {
    const f = await prepareFile(file);
    C.busy(true);
    try {
      const r = await C.api(ctx.key + ".upload", { module: ctx.key, table: table, id: id, field: field, file: f, reload: true });
      if (r.moduleData && ctx.applyData) ctx.applyData(r.moduleData);
      toast("File saved");
      C.render();
      return r;
    } finally { C.busy(false); }
  }
  function pickedFiles(form) {
    return form ? $$("input[data-file-input]", form).filter(i => i.files && i.files[0]).map(i => ({ field: i.dataset.fileInput, file: i.files[0] })) : [];
  }
  function wireFiles(ctx, form, rec) {
    $$("input[data-file-input]", form).forEach(i => i.addEventListener("change", () => {
      const s = i.closest(".file-actions").querySelector(".file-picked");
      if (s) s.textContent = i.files && i.files[0] ? i.files[0].name + " (saved with the form)" : "";
    }));
    $$("[data-file-clear]", form).forEach(b => b.addEventListener("click", async () => {
      if (!rec) return;
      if (!(await confirmSheet({ title: "Remove file?", message: "The file is unlinked here. It stays in the Vehicles folder in Drive.", submitLabel: "Remove", danger: true }))) return;
      try {
        C.busy(true);
        const r = await C.api(ctx.key + ".clearFile", { module: ctx.key, table: rec.table, id: rec.id, field: b.dataset.fileClear, reload: true });
        if (r.moduleData && ctx.applyData) ctx.applyData(r.moduleData);
        toast("File removed"); rec.close(); C.render();
      } catch (err) { toast(err.message, true); } finally { C.busy(false); }
    }));
  }
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-file-open]");
    if (o) { e.preventDefault(); openFile(o.dataset.fileOpen); }
  });

  // ------------------------------------------------------------------
  // Record form (add / edit / delete) for any table
  // ------------------------------------------------------------------
  // opts: { prefill, title, onCreated(id, values), onSaved(), lockList, hide: [field names], extraBody }
  function recordForm(ctx, table, id, opts) {
    opts = opts || {};
    const t = ctx.schema(table);
    const row = id ? ctx.rows(table, true).find(r => r[t.id] === id) : null;
    if (id && !row) { toast("That entry no longer exists.", true); return; }
    const values = Object.assign({}, ctx.defaults ? ctx.defaults(table) : {}, opts.prefill || {}, row || {});
    t.fields.forEach(f => { if (values[f.name] === undefined && f.default !== undefined && !row) values[f.name] = f.default; });
    const editable = row ? tableCan(ctx, table, "edit", row) : tableCan(ctx, table, "add", null, values);
    const canDel = row && tableCan(ctx, table, "delete", row);
    const admin = C.isAdmin();
    const hidden = name => (opts.hide || []).indexOf(name) !== -1 || (name === "List" && opts.lockList) ||
      (ctx.hideField && ctx.hideField(table, name, values, row));
    const body =
      (opts.extraBody || "") +
      (row ? '<div class="meta rec-meta">' + esc(row[t.id]) + (row["Added By"] ? ' · added by ' + esc(userLabel(ctx, row["Added By"])) : "") +
        (row["Active"] === false ? ' · <b>turned off</b>' : "") + '</div>' : "") +
      t.fields.map(f => fieldHtml(ctx, table, f, values[f.name], { hidden: hidden(f.name), readOnly: !editable })).join("") +
      (row && (canDel || admin || (t.kind === "list" && editable)) ? '<div class="danger-zone">' +
        (t.kind === "list" && editable ? '<button type="button" class="btn" data-rf="toggle">' + (row["Active"] === false ? "Turn back on" : "Turn off") + '</button>' : "") +
        (canDel ? '<button type="button" class="btn danger" data-rf="delete">' + (t.kind === "list" ? "Delete" : "Delete") + '</button>' : "") +
        (admin && t.kind === "record" ? '<button type="button" class="btn danger" data-rf="purge">Delete permanently</button>' : "") +
        '</div>' : "");
    const title = opts.title || (row ? (editable ? "Edit " : "") + ctx.title(table, row) : "Add " + ctx.singular(table));
    let formEl = null;
    openSheet({
      title: title, body: body, noSubmit: !editable, cancelLabel: editable ? "Cancel" : "Close",
      submitLabel: row ? "Save" : "Add",
      onReady: (form, close) => {
        formEl = form;
        $$("input, select, textarea", form).forEach(el => { if (!editable && el.type !== "hidden") el.disabled = true; });
        wireAddNew(ctx, table, form);
        wireFiles(ctx, form, row ? { table: table, id: id, close: close } : null);
        if (ctx.onFormReady) ctx.onFormReady(table, form, row);
        $$("[data-rf]", form).forEach(b => b.addEventListener("click", async () => {
          const act = b.dataset.rf;
          try {
            if (act === "toggle") {
              await ctx.save("modSetActive", { table: table, id: id, active: row["Active"] === false }, row["Active"] === false ? "Turned back on" : "Turned off");
              close();
            } else if (act === "delete") {
              const msg = t.kind === "list" ? "Delete " + ctx.title(table, row) + "? If it's used anywhere it's turned off instead, so old entries keep it."
                : "Delete " + ctx.title(table, row) + "? It disappears from the app; an admin can bring it back.";
              if (!(await confirmSheet({ title: "Delete?", message: msg, submitLabel: "Delete", danger: true }))) return;
              const r = await ctx.save("modDelete", { table: table, id: id },
                res => res.result === "inactivated" ? "It's in use, so it was turned off instead" : "Deleted");
              if (r) close();
            } else if (act === "purge") {
              if (!(await confirmSheet({ title: "Delete permanently?", message: ctx.title(table, row) + " will be removed from the sheet for good. This can't be undone.", submitLabel: "Delete permanently", danger: true }))) return;
              const r = await ctx.save("modPurge", { table: table, id: id }, "Deleted permanently");
              if (r) close();
            }
          } catch (err) { toast(err.message, true); }
        }));
      },
      onSubmit: async (v) => {
        const payload = {};
        t.fields.forEach(f => {
          if (f.readOnly || !(f.name in v)) return;
          if (v[f.name] === NEW) return;
          payload[f.name] = v[f.name];
        });
        let res;
        const send = extra => ctx.save(row ? "modUpdate" : "modAdd", Object.assign({ table: table, id: id || undefined, values: payload }, extra || {}),
          row ? "Saved" : ctx.singular(table).replace(/^./, c => c.toUpperCase()) + " added", { keepOpen: true });
        try {
          res = await send();
        } catch (err) {
          if (err.code !== "CONFIRM" || !ctx.confirm) throw err;
          const answer = await ctx.confirm(err.confirm);
          if (answer === null) return false;
          res = await send(answer);
        }
        if (!res) return false;
        const picked = pickedFiles(formEl);
        for (const p of picked) {
          try { await uploadFile(ctx, table, row ? id : res.id, p.field, p.file); }
          catch (err) { toast(err.message, true); }
        }
        if (!row && opts.onCreated) await opts.onCreated(res.id, payload);
        if (opts.onSaved) opts.onSaved(res);
        return true;
      }
    });
  }

  // Yes / no question in a sheet. Resolves true / false.
  function confirmSheet(o) {
    return new Promise(resolve => {
      let answered = false;
      openSheet({
        title: o.title, body: '<p class="confirm-msg">' + esc(o.message) + '</p>', submitLabel: o.submitLabel || "OK", danger: !!o.danger,
        cancelLabel: o.cancelLabel || "Cancel",
        onClose: () => { if (!answered) resolve(false); },
        onSubmit: async () => { answered = true; resolve(true); return true; }
      });
    });
  }
  // Three-way question: resolves "a", "b", or null (cancelled).
  function chooseSheet(o) {
    return new Promise(resolve => {
      let answered = false;
      openSheet({
        title: o.title, noSubmit: true,
        body: '<p class="confirm-msg">' + esc(o.message) + '</p><div class="choice-btns">' +
          o.choices.map(c => '<button type="button" class="btn ' + (c.primary ? "primary" : "") + '" data-choice="' + esc(c.value) + '">' + esc(c.label) + '</button>').join("") + '</div>',
        onClose: () => { if (!answered) resolve(null); },
        onReady: (form, close) => $$("[data-choice]", form).forEach(b => b.addEventListener("click", () => { answered = true; resolve(b.dataset.choice); close(); }))
      });
    });
  }

  // ------------------------------------------------------------------
  // List manager screen (chores, venues, list values, consequences, seasons, settings)
  // ------------------------------------------------------------------
  // opts: { table, list (for the Lists table), title, sub(row), sort(a,b), back }
  function listView(ctx, opts) {
    const t = ctx.schema(opts.table);
    let rows = ctx.rows(opts.table).filter(r => !opts.list || r["List"] === opts.list);
    rows.sort(opts.sort || ((a, b) => ((b["Active"] !== false) - (a["Active"] !== false)) ||
      ctx.title(opts.table, a).localeCompare(ctx.title(opts.table, b), undefined, { numeric: true })));
    const canAdd = tableCan(ctx, opts.table, "add", null, opts.list ? { "List": opts.list } : {});
    const html =
      (canAdd ? '<div class="actions" style="margin:0 0 12px"><button class="btn primary" data-mod-add="' + esc(opts.table) + '"' +
        (opts.list ? ' data-list="' + esc(opts.list) + '"' : "") + '>' + ICONS.plus + 'Add</button></div>' : "") +
      '<div class="card list">' + (rows.map(r =>
        '<div class="list-item ' + (r["Active"] === false ? "dim" : "") + '" role="button" tabindex="0" data-mod-edit="' + esc(opts.table) + '" data-id="' + esc(r[t.id]) + '">' +
        '<div class="body"><div class="title">' + esc(opts.label ? opts.label(r) : ctx.refLabel(opts.table, r)) + '</div>' +
        (opts.sub && opts.sub(r) ? '<div class="sub">' + esc(opts.sub(r)) + '</div>' : "") + '</div>' +
        (r["Active"] === false ? '<span class="pill">Off</span>' : "") + '</div>').join("") || '<div class="empty">Nothing here yet.</div>') + '</div>' +
      (t.kind === "list" ? '<p class="hint">Deleting one that’s used on old entries turns it off instead, so those entries keep it.</p>' : "");
    return { title: opts.title, back: true, html: html };
  }

  // ------------------------------------------------------------------
  // Deleted items (admins): restore or delete permanently
  // ------------------------------------------------------------------
  const deletedCache = {};
  function deletedView(ctx) {
    const d = deletedCache[ctx.key];
    if (!d) {
      C.api("modDeleted", { module: ctx.key }).then(r => { deletedCache[ctx.key] = r.deleted; C.render(); }).catch(C.handleError);
      return { title: "Deleted items", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    const html = d.length ? '<div class="card list">' + d.map(x =>
      '<div class="list-item"><div class="body"><div class="title">' + esc(x.title) + '</div>' +
      '<div class="sub">' + esc(x.tableLabel + " · deleted " + fmtDayTime(x.deletedAt) + " by " + userLabel(ctx, x.deletedBy)) + '</div>' +
      '<div class="actions"><button class="btn" data-del-restore="' + esc(x.table) + '" data-id="' + esc(x.id) + '">Restore</button>' +
      '<button class="btn danger" data-del-purge="' + esc(x.table) + '" data-id="' + esc(x.id) + '" data-title="' + esc(x.title) + '">Delete permanently</button></div></div></div>').join("") + '</div>'
      : '<div class="card"><div class="empty">Nothing has been deleted.</div></div>';
    return { title: "Deleted items", back: true, html: html + '<p class="hint">Deleted entries are hidden everywhere until you restore them. Permanent deletes are always written to the Change Log.</p>' };
  }

  // Clicks for the shared screens (each module passes its ctx via HH_MOD.current).
  document.addEventListener("click", async e => {
    const ctx = HH_MOD.current;
    if (!ctx) return;
    const add = e.target.closest("[data-mod-add]");
    if (add) { recordForm(ctx, add.dataset.modAdd, "", add.dataset.list ? { prefill: { "List": add.dataset.list }, lockList: true } : {}); return; }
    const edit = e.target.closest("[data-mod-edit]");
    if (edit) { recordForm(ctx, edit.dataset.modEdit, edit.dataset.id, ctx.formOpts ? ctx.formOpts(edit.dataset.modEdit, edit.dataset.id) : {}); return; }
    const rest = e.target.closest("[data-del-restore]");
    if (rest) {
      try { await ctx.save("modRestore", { table: rest.dataset.delRestore, id: rest.dataset.id }, "Restored"); delete deletedCache[ctx.key]; C.render(); }
      catch (err) { toast(err.message, true); }
      return;
    }
    const purge = e.target.closest("[data-del-purge]");
    if (purge) {
      if (!(await confirmSheet({ title: "Delete permanently?", message: purge.dataset.title + " will be removed from the sheet for good. This can't be undone.", submitLabel: "Delete permanently", danger: true }))) return;
      try { await ctx.save("modPurge", { table: purge.dataset.delPurge, id: purge.dataset.id }, "Deleted permanently"); delete deletedCache[ctx.key]; C.render(); }
      catch (err) { toast(err.message, true); }
    }
  });

  const HH_MOD = window.HH_MOD = {
    current: null,
    money: money, parseIso: parseIso, isoDay: isoDay, fmtDay: fmtDay, fmtTime: fmtTime, fmtDayTime: fmtDayTime,
    userName: userName, userLabel: userLabel,
    can: can, tableCan: tableCan, fieldHtml: fieldHtml, recordForm: recordForm, confirmSheet: confirmSheet, chooseSheet: chooseSheet,
    listView: listView, deletedView: deletedView, clearDeleted: key => { delete deletedCache[key]; },
    fileHtml: fileHtml, uploadFile: uploadFile, pickedFiles: pickedFiles, wireFiles: wireFiles, wireAddNew: wireAddNew, shownValue: shownValue
  };
})();
