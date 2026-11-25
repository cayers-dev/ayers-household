/* Ayers Household - Shopping List screens
 * The list (filter by store, grouped by category or by name, urgent first), quick add (with an Urgent box), add several
 * at once, check off (grays out; leaving the list asks to remove checked items), and the
 * Store / Category / Unit dropdown lists.
 * Data comes from shopping.load; adds and edits go through the shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, toast, ICONS, svg, section, plural } = C;

  const sh = { data: null, loading: false, error: "", asking: false, urgent: false };   // urgent: the quick-add Urgent box
  const STORE_KEY = "hh-shop-store", GROUP_KEY = "hh-shop-group";
  const REFRESH_MS = 45000;

  const IC = {
    cart: svg('<path d="M3 4h2l2.2 11h10.6L20 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>')
  };

  // ------------------------------------------------------------------
  // Data
  // ------------------------------------------------------------------
  const D = () => sh.data;
  const key = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const anyStore = s => !String(s || "").trim() || key(s) === "any store";
  const listValues = name => (D().lists || []).filter(l => l["List"] === name && l["Active"] !== false && !l["Deleted"]);
  const stores = () => listValues("Store").map(l => l["Value"]).filter(v => !anyStore(v)).sort((a, b) => a.localeCompare(b));
  const categories = () => listValues("Category").slice()
    .sort((a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999) || String(a["Value"]).localeCompare(String(b["Value"])))
    .map(l => l["Value"]);
  function storeFilter() {
    let s = "";
    try { s = localStorage.getItem(STORE_KEY) || ""; } catch (e) { s = sh.store || ""; }
    return s && stores().indexOf(s) !== -1 ? s : "";
  }
  function setStoreFilter(s) { sh.store = s; try { localStorage.setItem(STORE_KEY, s); } catch (e) { /* memory only */ } }
  function grouped() { try { return localStorage.getItem(GROUP_KEY) !== "0"; } catch (e) { return sh.group !== false; } }
  function setGrouped(on) { sh.group = on; try { localStorage.setItem(GROUP_KEY, on ? "1" : "0"); } catch (e) { /* memory only */ } }
  const isChecked = r => r["Status"] === "Checked";
  const checkedItems = () => ((sh.data && sh.data.items) || []).filter(isChecked);
  const qtyText = r => [r["Quantity"] !== "" && r["Quantity"] !== undefined && r["Quantity"] !== null && !(Number(r["Quantity"]) === 1 && !r["Unit"]) ? r["Quantity"] : "", r["Unit"] || ""].filter(x => x !== "").join(" ");

  async function load(silent) {
    sh.loading = true; if (!silent) sh.error = "";
    try {
      sh.data = await C.api("shopping.load");
    } catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { sh.loading = false; C.handleError(err); return; }
      if (!silent) sh.error = err.message;
    } finally { sh.loading = false; }
    redraw();
  }

  const ctx = {
    key: "shopping",
    data: () => sh.data,
    schema: t => sh.data.schema[t],
    rows: t => ({ items: D().items, lists: D().lists }[t] || []),
    refLabel: (t, r) => t === "lists" ? r["Value"] : r["Item"] || "",
    refSort: (t, a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }),
    defaults: t => {
      const d = {};
      if (t === "items") { const s = storeFilter(); if (s) d["Store"] = s; }
      return d;
    },
    hideField: (t, name) => t === "items" && ["Status", "Bought By", "Bought At"].indexOf(name) !== -1,
    title: (t, r) => t === "items" ? r["Item"] : ctx.refLabel(t, r),
    singular: t => ({ items: "item", lists: "list value" }[t] || "entry"),
    save: async (action, payload, msg) => {
      C.busy(true);
      let res;
      try {
        res = await C.api(action, Object.assign({ module: "shopping", reload: true }, payload));
      } catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        if (err.code === "FORBIDDEN") { sh.data = null; sh.loading = false; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast(res && res.merged ? "Added to the one already on the list" : (typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) sh.data = res.moduleData; else await load();
      C.state.homeStale = true;
      C.render();
      return res || true;
    },
    reload: () => load(),
    // Adding something already on the list: add to it, or add a separate line.
    confirm: async q => {
      if (q.kind !== "duplicate") return null;
      const on = [qtyText({ Quantity: q.quantity, Unit: q.unit }), q.store && !anyStore(q.store) ? "at " + q.store : ""].filter(Boolean).join(" ");
      const a = await M.chooseSheet({
        title: q.item + " is already on the list",
        message: (on ? "It's on the list " + on + ". " : "") + "Add to the one on the list, or add it as a separate line?",
        choices: [{ value: "merge", label: "Add to it", primary: true }, { value: "separate", label: "Add separately" }]
      });
      return a === null ? null : { duplicate: a };
    }
  };

  const can = (cap, row) => M.tableCan(ctx, "items", cap, row);
  const canCheck = () => M.can(ctx, "list", "add");

  // Redraw the list without losing what's being typed in the add boxes (or where the cursor is).
  function redraw() {
    if (C.parseRoute().name !== "shopping") return;
    const a = document.activeElement, keep = {};
    ["sh_add", "sh_qty"].forEach(id => { const el = $("#" + id); if (el) keep[id] = el.value; });
    const focusId = sh.focusAdd ? "sh_add" : (a && (a.id === "sh_add" || a.id === "sh_qty") ? a.id : "");
    sh.focusAdd = false;
    C.render();
    Object.keys(keep).forEach(id => { const el = $("#" + id); if (el) el.value = keep[id]; });
    if (focusId) { const el = $("#" + focusId); if (el) { el.focus({ preventScroll: true }); try { const n = el.value.length; el.setSelectionRange(n, n); } catch (e) { /* number inputs */ } } }
  }

  // Quick add: the item shows on the list at once (dimmed until saved); the server answers with
  // its ID. Something already on the list asks first, the same way the full form does.
  let tmpN = 0;
  async function quickAddSend(values, extra) {
    const tmp = { "Item ID": "tmp-" + (++tmpN), "Item": values["Item"], "Quantity": values["Quantity"] !== undefined ? values["Quantity"] : "",
      "Store": values["Store"] || "", "Urgent": values["Urgent"] === true, "Status": "Needed", "Added By": C.state.me.id, _pending: true };
    D().items.push(tmp);
    redraw();
    let res;
    try {
      res = await C.api("modAdd", Object.assign({ module: "shopping", table: "items", values: values }, extra || {}));
    } catch (err) {
      D().items = D().items.filter(i => i !== tmp);
      redraw();
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { C.authStop(err); return; }
      if (err.code === "CONFIRM") {
        const answer = await ctx.confirm(err.confirm);
        if (answer) await quickAddSend(values, answer);
        return;
      }
      toast(err.message, true);
      if (err.code === "FORBIDDEN") load();
      return;
    }
    if (res.merged) {
      D().items = D().items.filter(i => i !== tmp);
      const it = D().items.find(i => i["Item ID"] === res.id);
      if (it) it["Quantity"] = res.quantity;
      toast("Added to the one already on the list");
    } else {
      tmp["Item ID"] = res.id; delete tmp._pending;
    }
    C.state.homeStale = true;
    redraw();
  }
  function quickAdd() {
    const input = $("#sh_add"), qtyIn = $("#sh_qty");
    const name = (input && input.value || "").replace(/\s+/g, " ").trim();
    if (!name) { if (input) input.focus(); return; }
    const qtyRaw = (qtyIn && qtyIn.value || "").trim();
    if (qtyRaw !== "" && (isNaN(Number(qtyRaw)) || Number(qtyRaw) < 0)) { toast("Quantity must be a number", true); if (qtyIn) qtyIn.focus(); return; }
    const s = storeFilter();
    const v = { "Item": name };
    if (qtyRaw !== "") v["Quantity"] = Number(qtyRaw);
    if (s) v["Store"] = s;
    if (sh.urgent) v["Urgent"] = true;
    input.value = ""; if (qtyIn) qtyIn.value = "";
    sh.urgent = false;    // like the boxes, Urgent resets for the next item
    sh.focusAdd = true;   // ready for the next item
    quickAddSend(v);
  }

  // Check off: grays the item out (tap again to uncheck). Leaving the list asks to remove checked items.
  async function toggleCheck(id) {
    const it = (D().items || []).find(i => i["Item ID"] === id);
    if (!it) return;
    const on = !isChecked(it);
    it["Status"] = on ? "Checked" : "Needed";   // show it at once
    redraw();
    try {
      await C.api(on ? "shopping.check" : "shopping.uncheck", { module: "shopping", id: id });   // shown already; nothing to reload
      C.state.homeStale = true;
    } catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
      toast(err.message, true); load();
    }
  }
  // A small dialog while checked items are removed, so it's clear something is happening.
  function removingDialog(n) {
    const el = document.createElement("div");
    el.className = "sh-removing";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "assertive");
    el.innerHTML = '<div class="sh-removing-box"><div class="spinner"></div><div>Removing ' + esc(plural(n, "checked item")) + '…</div></div>';
    document.body.appendChild(el);
    return () => el.remove();
  }
  async function clearChecked(ids) {
    if (!ids || !ids.length) return;
    const close = removingDialog(ids.length);
    let r;
    try {
      r = await C.api("shopping.clearChecked", { module: "shopping", ids: ids, reload: true });
    } catch (err) { close(); toast(err.message, true); load(); return; }
    close();   // dialog first, then the result
    if (r.moduleData) sh.data = r.moduleData;
    C.state.homeStale = true;
    C.render();
    toast(r.removed ? "Removed " + plural(r.removed, "checked item") : "Nothing to remove");
  }
  // Leaving the Shopping List with checked items: ask, then remove them.
  async function askToClear() {
    const ids = checkedItems().map(i => i["Item ID"]);
    if (!ids.length || sh.asking || !canCheck()) return;
    sh.asking = true;
    const ok = await M.confirmSheet({ title: "Remove checked items?", message: plural(ids.length, "checked item") + " will come off the Shopping List for good.",
      submitLabel: "Remove", cancelLabel: "Keep them", danger: true });
    sh.asking = false;
    if (ok) clearChecked(ids);
  }

  // Add several at once: a grid of item + quantity rows; same store, category and urgent for all.
  const gridRow = i => '<div class="sh-grid-row"><input type="text" name="n' + i + '" placeholder="Item" aria-label="Item ' + (i + 1) + '" autocomplete="off">' +
    '<input type="number" name="q' + i + '" placeholder="Qty" aria-label="Quantity ' + (i + 1) + '" inputmode="decimal" min="0" step="any"></div>';
  function addSeveral() {
    const opt = (list, cur) => '<option value=""></option>' + listValues(list).map(l => l["Value"]).sort((a, b) => a.localeCompare(b))
      .map(v => '<option' + (v === cur ? " selected" : "") + '>' + esc(v) + '</option>').join("");
    let rows = 5;
    C.openSheet({
      title: "Add several items",
      body: '<div class="sh-grid"><div class="sh-grid-head"><span>Item</span><span>Qty</span></div><div class="sh-grid-rows">' +
          [0, 1, 2, 3, 4].map(gridRow).join("") + '</div>' +
          '<button type="button" class="link-btn sh-grid-more">+ Another row</button></div>' +
        '<div class="field"><label for="f_store">Store</label><select id="f_store" name="store">' + opt("Store", storeFilter()) + '</select></div>' +
        '<div class="field"><label for="f_cat">Category</label><select id="f_cat" name="category">' + opt("Category", "") + '</select></div>' +
        '<div class="field"><label class="check"><input type="checkbox" name="urgent"> Urgent</label></div>' +
        '<p class="hint">Blank rows are ignored. Items already on the list are skipped.</p>',
      submitLabel: "Add",
      onReady: form => {
        const box = $(".sh-grid-rows", form);
        const more = () => { box.insertAdjacentHTML("beforeend", gridRow(rows++)); };
        $(".sh-grid-more", form).addEventListener("click", () => { more(); const last = box.lastElementChild.querySelector("input"); if (last) last.focus(); });
        // Typing in the last row adds a fresh one below it.
        box.addEventListener("input", e => { if (e.target.closest(".sh-grid-row") === box.lastElementChild && e.target.value) more(); });
        const first = $('input[name="n0"]', form); if (first) setTimeout(() => first.focus(), 50);
      },
      onSubmit: async v => {
        const items = [];
        for (let i = 0; i < rows; i++) {
          const n = String(v["n" + i] || "").trim();
          if (n) items.push({ item: n, quantity: String(v["q" + i] || "").trim() });
        }
        if (!items.length) throw new Error("Type at least one item.");
        const r = await ctx.save("shopping.addMany", { items: items, store: v.store, category: v.category, urgent: v.urgent === true },
          res => "Added " + plural(res.added, "item") + (res.skipped && res.skipped.length ? ". Already on the list: " + res.skipped.join(", ") : ""));
        return !!r;
      }
    });
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  function itemRow(r, showStore) {
    const me = C.state.me.id;
    const done = isChecked(r), pending = !!r._pending;
    const sub = [showStore && r["Store"] && !anyStore(r["Store"]) ? r["Store"] : "", r["Notes"], r["Added By"] && r["Added By"] !== me ? M.userName(ctx, r["Added By"]) : ""].filter(Boolean).join(" · ");
    return '<div class="list-item sh-item' + (r["Urgent"] === true ? " urgent" : "") + (done ? " checked" : "") + (pending ? " pending" : "") + '">' +
      (canCheck() && !pending ? '<button class="sh-check' + (done ? " on" : "") + '" data-sh="check" data-id="' + esc(r["Item ID"]) + '" aria-pressed="' + done + '" aria-label="' + (done ? "Uncheck " : "Check off ") + esc(r["Item"]) + '">' + (done ? IC.check : "") + '</button>'
        : '<span class="sh-check off' + (done ? " on" : "") + '" aria-hidden="true">' + (done ? IC.check : "") + '</span>') +
      '<div class="body"' + (pending ? "" : ' role="button" tabindex="0" data-mod-edit="items" data-id="' + esc(r["Item ID"]) + '"') + '>' +
        '<div class="title">' + esc(r["Item"]) + (qtyText(r) ? ' <span class="sh-qty">' + esc(qtyText(r)) + '</span>' : "") + '</div>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div>' +
      '</div>';
  }

  function viewList() {
    const d = D();
    const s = storeFilter();
    const items = (d.items || []).filter(r => !s || anyStore(r["Store"]) || key(r["Store"]) === key(s));
    const byName = (a, b) => String(a["Item"]).localeCompare(String(b["Item"]));
    const cats = categories();
    const groups = [];
    const urgent = items.filter(r => r["Urgent"] === true).sort(byName);
    if (urgent.length) groups.push(["Urgent", urgent]);
    const rest = items.filter(r => r["Urgent"] !== true);
    if (grouped()) {
      const known = cats.filter(c => key(c) !== "other");
      known.forEach(c => { const g = rest.filter(r => key(r["Category"]) === key(c)).sort(byName); if (g.length) groups.push([c, g]); });
      const other = rest.filter(r => !known.some(c => key(c) === key(r["Category"]))).sort(byName);
      if (other.length) groups.push(["Other", other]);
    } else if (rest.length) groups.push([urgent.length ? "Everything else" : "", rest.sort(byName)]);
    const needed = r => !isChecked(r);

    const chips = '<div class="sh-chips" role="tablist" aria-label="Filter by store">' +
      ['<button class="sh-chip' + (!s ? " on" : "") + '" data-sh="store" data-store="">All <span>' + (d.items || []).filter(needed).length + '</span></button>']
        .concat(stores().map(x => {
          const n = (d.items || []).filter(r => needed(r) && (anyStore(r["Store"]) || key(r["Store"]) === key(x))).length;
          return '<button class="sh-chip' + (s === x ? " on" : "") + '" data-sh="store" data-store="' + esc(x) + '">' + esc(x) + ' <span>' + n + '</span></button>';
        })).join("") + '</div>';
    const addBar = can("add") ?
      '<div class="sh-add"><input id="sh_add" type="text" placeholder="Add item" autocomplete="off" enterkeyhint="done" aria-label="Add an item">' +
        '<input id="sh_qty" type="number" placeholder="Qty" inputmode="decimal" min="0" step="any" enterkeyhint="done" aria-label="Quantity">' +
        '<button class="btn primary" data-sh="add" aria-label="Add">' + ICONS.plus + '</button>' +
        '<button class="btn" data-sh="more" aria-label="Add with details">More</button></div>' +
      '<div class="sh-tools"><label class="check sh-urgentadd"><input type="checkbox" id="sh_urgent" data-sh="urgent"' + (sh.urgent ? " checked" : "") + '> Urgent</label>' +
        '<button class="link-btn" data-sh="several">Add several at once</button>' +
        '<label class="check sh-grouptoggle"><input type="checkbox" data-sh="group"' + (grouped() ? " checked" : "") + '> Group by category</label></div>'
      : '<div class="sh-tools"><span></span><label class="check sh-grouptoggle"><input type="checkbox" data-sh="group"' + (grouped() ? " checked" : "") + '> Group by category</label></div>';
    const list = groups.length
      ? groups.map(g => '<div class="sh-group">' + (g[0] ? '<div class="sh-grouphead">' + esc(g[0]) + '<span>' + g[1].filter(needed).length + '</span></div>' : "") +
          '<div class="card list">' + g[1].map(r => itemRow(r, !s)).join("") + '</div></div>').join("")
      : '<div class="card"><div class="empty">' + ((d.items || []).length ? "Nothing on the list for " + esc(s) + "." : "The list is empty." + (can("add") ? " Add something above." : "")) + '</div></div>';
    const nChecked = checkedItems().length;
    const clear = nChecked && canCheck() ? '<div class="actions sh-clear"><button class="btn" data-sh="clear">Remove ' + plural(nChecked, "checked item") + ' now</button></div>' +
      '<p class="hint">Checked items are also removed when you leave the list (you’ll be asked first).</p>' : "";
    const links = M.tableCan(ctx, "lists", "add", null, { "List": "Store" }) || C.isAdmin()
      ? section("Settings", '<div class="card list sh-links"><a class="list-item" href="#/shopping/lists"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">Stores, categories & units</div></div><span class="thumb">' + ICONS.next + '</span></a></div>') : "";
    const html = chips + addBar + list + clear + links;
    return { title: "Shopping List", back: true, html: html, keepScroll: true };
  }

  function viewLists() {
    const link = (name, label) => '<a class="list-item" href="#/shopping/list/' + encodeURIComponent(name) + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(label) + '</div><div class="sub">' +
      esc(listValues(name).map(l => l["Value"]).sort((a, b) => a.localeCompare(b)).join(", ")) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>';
    return { title: "Stores, categories & units", back: true, html: '<div class="card list">' + link("Store", "Stores") + link("Category", "Categories") + link("Unit", "Units") + '</div>' +
      '<p class="hint">"Any store" items show under every store filter. Categories show on the list in the order of their Sort number.</p>' };
  }

  function view(args) {
    M.current = ctx;
    if (sh.error) return { title: "Shopping List", back: true, html: '<div class="card"><div class="empty">' + esc(sh.error) + '</div></div><div class="actions"><button class="btn" data-sh="retry">Try again</button></div>' };
    if (!sh.data) {
      if (!sh.loading) load();
      return { title: "Shopping List", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "lists": return viewLists();
      case "list": {
        const name = args[1] === "Category" ? "Category" : args[1] === "Unit" ? "Unit" : "Store";
        return M.listView(ctx, { table: "lists", list: name, title: name === "Store" ? "Stores" : name === "Unit" ? "Units" : "Categories",
          sort: name === "Category" ? ((a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999) || String(a["Value"]).localeCompare(String(b["Value"]))) : undefined,
          sub: r => r["Sort"] !== "" && r["Sort"] !== undefined && name === "Category" ? "Order " + r["Sort"] : "" });
      }
      default: return viewList();
    }
  }
  C.registerModule("shopping", view, () => { sh.data = null; sh.loading = false; M.clearDeleted("shopping"); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  document.addEventListener("click", e => {
    if (e.target.closest("[data-act='refresh']") && sh.data && C.parseRoute().name === "shopping") { sh.data = null; M.clearDeleted("shopping"); }
    const el = e.target.closest("[data-sh]");
    if (!el || el.tagName === "INPUT") return;
    const d = el.dataset;
    switch (d.sh) {
      case "check": toggleCheck(d.id); break;
      case "clear": clearChecked(checkedItems().map(i => i["Item ID"])); break;
      case "several": addSeveral(); break;
      case "add": quickAdd(); break;
      case "more": {
        const q = ($("#sh_qty") || {}).value || "";
        M.recordForm(ctx, "items", "", { title: "Add an item", prefill: Object.assign({ "Item": ($("#sh_add") || {}).value || "" }, q !== "" ? { "Quantity": q } : {}, sh.urgent ? { "Urgent": true } : {}) });
        break;
      }
      case "store": setStoreFilter(d.store || ""); C.render(); break;
      case "retry": sh.error = ""; C.render(); break;
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target && (e.target.id === "sh_add" || e.target.id === "sh_qty")) { e.preventDefault(); quickAdd(); }
  });
  document.addEventListener("change", e => {
    if (e.target && e.target.matches("[data-sh='group']")) { setGrouped(e.target.checked); C.render(); }
    if (e.target && e.target.matches("[data-sh='urgent']")) sh.urgent = e.target.checked;
  });
  // Leaving the Shopping List (Home, back, another module) with checked items: ask to remove them.
  let lastRoute = C.parseRoute().name;
  window.addEventListener("hashchange", () => {
    const now = C.parseRoute().name, was = lastRoute;
    lastRoute = now;
    if (was === "shopping" && now !== "shopping") askToClear();
  });

  // While the list is open, refresh it quietly so other people's changes show up.
  setInterval(() => {
    if (document.visibilityState !== "visible" || C.parseRoute().name !== "shopping" || !sh.data || sh.loading) return;
    if (document.querySelector(".sheet-backdrop")) return;
    const a = document.activeElement;
    if (a && (a.id === "sh_add" || a.id === "sh_qty") && a.value) return;
    if ((sh.data.items || []).some(i => i._pending)) return;
    load(true);
  }, REFRESH_MS);
})();
