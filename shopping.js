/* Ayers Household - Shopping List screens
 * The list (filter by store, grouped by category, urgent first), quick add, check off with Undo,
 * Buy again (most often bought), and the Store / Category dropdown lists.
 * Data comes from shopping.load; adds and edits go through the shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, toast, ICONS, svg, section, plural } = C;

  const sh = { data: null, loading: false, error: "", undo: null, undoTimer: null, againFilter: "" };
  const STORE_KEY = "hh-shop-store";
  const REFRESH_MS = 45000;

  const IC = {
    cart: svg('<path d="M3 4h2l2.2 11h10.6L20 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>'),
    again: svg('<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>'),
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
  const qtyText = r => [r["Quantity"] !== "" && r["Quantity"] !== undefined && r["Quantity"] !== null && !(Number(r["Quantity"]) === 1 && !r["Unit"]) ? r["Quantity"] : "", r["Unit"] || ""].filter(x => x !== "").join(" ");

  async function load(silent) {
    sh.loading = true; if (!silent) sh.error = "";
    try {
      sh.data = await C.api("shopping.load");
    } catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { sh.loading = false; C.handleError(err); return; }
      if (!silent) sh.error = err.message;
    } finally { sh.loading = false; }
    if (C.parseRoute().name === "shopping") C.render();
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

  // Quick add (and Buy again): asks about duplicates the same way the full form does.
  async function addItem(values, extra) {
    try {
      return await ctx.save("modAdd", Object.assign({ table: "items", values: values }, extra || {}), "Added " + values["Item"]);
    } catch (err) {
      if (err.code !== "CONFIRM") { toast(err.message, true); return null; }
      const answer = await ctx.confirm(err.confirm);
      if (!answer) return null;
      return addItem(values, answer);
    }
  }
  function quickAdd() {
    const input = $("#sh_add");
    const name = (input && input.value || "").replace(/\s+/g, " ").trim();
    if (!name) return;
    const past = (D().buyAgain || []).find(b => key(b.item) === key(name));
    const s = storeFilter();
    const v = { "Item": past ? past.item : name };
    if (past && past.quantity !== "" && past.quantity !== undefined) v["Quantity"] = past.quantity;
    if (past && past.unit) v["Unit"] = past.unit;
    if (s) v["Store"] = s; else if (past && past.store) v["Store"] = past.store;
    if (past && past.category) v["Category"] = past.category;
    input.value = "";
    addItem(v).then(r => { if (!r) input.value = name; });
  }

  // Check off: off the list at once, Undo for a few seconds.
  async function checkOff(id) {
    const it = (D().items || []).find(i => i["Item ID"] === id);
    if (!it) return;
    D().items = D().items.filter(i => i["Item ID"] !== id);
    clearTimeout(sh.undoTimer);
    sh.undo = { id: id, name: it["Item"] };
    sh.undoTimer = setTimeout(() => { sh.undo = null; if (C.parseRoute().name === "shopping") C.render(); }, 6000);
    C.render();
    try {
      const r = await C.api("shopping.check", { module: "shopping", id: id, reload: true });
      if (r.moduleData) { sh.data = r.moduleData; if (sh.undo && sh.undo.id === id) D().items = D().items.filter(i => i["Item ID"] !== id); }
      C.state.homeStale = true;
      C.render();
    } catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
      sh.undo = null; toast(err.message, true); load();
    }
  }
  async function undoCheck() {
    const u = sh.undo;
    if (!u) return;
    sh.undo = null; clearTimeout(sh.undoTimer);
    try {
      const r = await C.api("shopping.uncheck", { module: "shopping", id: u.id, reload: true });
      if (r.moduleData) sh.data = r.moduleData;
      toast(u.name + " is back on the list");
      C.state.homeStale = true;
      C.render();
    } catch (err) { toast(err.message, true); load(); }
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  function itemRow(r, showStore) {
    const me = C.state.me.id;
    const sub = [showStore && r["Store"] && !anyStore(r["Store"]) ? r["Store"] : "", r["Notes"], r["Added By"] && r["Added By"] !== me ? M.userName(ctx, r["Added By"]) : ""].filter(Boolean).join(" · ");
    return '<div class="list-item sh-item' + (r["Urgent"] === true ? " urgent" : "") + '">' +
      (canCheck() ? '<button class="sh-check" data-sh="check" data-id="' + esc(r["Item ID"]) + '" aria-label="Check off ' + esc(r["Item"]) + '"></button>' : '<span class="sh-check off" aria-hidden="true"></span>') +
      '<div class="body" role="button" tabindex="0" data-mod-edit="items" data-id="' + esc(r["Item ID"]) + '">' +
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
    const known = cats.filter(c => key(c) !== "other");
    known.forEach(c => { const g = rest.filter(r => key(r["Category"]) === key(c)).sort(byName); if (g.length) groups.push([c, g]); });
    const other = rest.filter(r => !known.some(c => key(c) === key(r["Category"]))).sort(byName);
    if (other.length) groups.push(["Other", other]);

    const chips = '<div class="sh-chips" role="tablist" aria-label="Filter by store">' +
      ['<button class="sh-chip' + (!s ? " on" : "") + '" data-sh="store" data-store="">All <span>' + (d.items || []).length + '</span></button>']
        .concat(stores().map(x => {
          const n = (d.items || []).filter(r => anyStore(r["Store"]) || key(r["Store"]) === key(x)).length;
          return '<button class="sh-chip' + (s === x ? " on" : "") + '" data-sh="store" data-store="' + esc(x) + '">' + esc(x) + ' <span>' + n + '</span></button>';
        })).join("") + '</div>';
    const addBar = can("add") ?
      '<div class="sh-add"><input id="sh_add" type="text" list="sh_sugg" placeholder="Add an item' + (s ? " for " + esc(s) : "") + '" autocomplete="off" enterkeyhint="done" aria-label="Add an item">' +
        '<button class="btn primary" data-sh="add" aria-label="Add">' + ICONS.plus + '</button>' +
        '<button class="btn" data-sh="more" aria-label="Add with details">More</button>' +
        '<datalist id="sh_sugg">' + (d.buyAgain || []).filter(b => !b.onList).map(b => '<option value="' + esc(b.item) + '"></option>').join("") + '</datalist></div>' : "";
    const list = groups.length
      ? groups.map(g => '<div class="sh-group"><div class="sh-grouphead">' + esc(g[0]) + '<span>' + g[1].length + '</span></div>' +
          '<div class="card list">' + g[1].map(r => itemRow(r, !s)).join("") + '</div></div>').join("")
      : '<div class="card"><div class="empty">' + ((d.items || []).length ? "Nothing on the list for " + esc(s) + "." : "The list is empty." + (can("add") ? " Add something above or pick from Buy again." : "")) + '</div></div>';
    const links = '<div class="card list sh-links">' +
      '<a class="list-item" href="#/shopping/again"><span class="thumb">' + IC.again + '</span><div class="body"><div class="title">Buy again</div><div class="sub">' +
        plural((d.buyAgain || []).length, "item") + ' bought before, most often first</div></div><span class="thumb">' + ICONS.next + '</span></a>' +
      (M.tableCan(ctx, "lists", "add", null, { "List": "Store" }) || C.isAdmin() ? '<a class="list-item" href="#/shopping/lists"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">Stores & categories</div></div><span class="thumb">' + ICONS.next + '</span></a>' : "") +
      (C.isAdmin() ? '<a class="list-item" href="#/shopping/deleted"><span class="thumb">' + IC.trash + '</span><div class="body"><div class="title">Deleted items</div></div><span class="thumb">' + ICONS.next + '</span></a>' : "") +
      '</div>';
    const undo = sh.undo ? '<div class="sh-undo" role="status"><span>Bought ' + esc(sh.undo.name) + '</span><button class="link-btn" data-sh="undo">Undo</button></div>' : "";
    const html = chips + addBar + list + section("More", links) + undo;
    return { title: "Shopping List", back: true, html: html, keepScroll: true };
  }

  function viewAgain() {
    const d = D();
    const f = key(sh.againFilter);
    const rows = (d.buyAgain || []).filter(b => !f || key(b.item).indexOf(f) !== -1);
    const html =
      '<div class="field"><input id="sh_again_q" type="search" placeholder="Search past items" value="' + esc(sh.againFilter) + '" aria-label="Search past items"></div>' +
      (rows.length ? '<div class="card list">' + rows.map(b =>
        '<div class="list-item"><div class="body"><div class="title">' + esc(b.item) + (qtyText({ Quantity: b.quantity, Unit: b.unit }) ? ' <span class="sh-qty">' + esc(qtyText({ Quantity: b.quantity, Unit: b.unit })) + '</span>' : "") + '</div>' +
          '<div class="sub">' + esc(["Bought " + plural(b.count, "time"), b.store && !anyStore(b.store) ? b.store : "", b.category].filter(Boolean).join(" · ")) + '</div></div>' +
          (b.onList ? '<span class="pill ok">On the list</span>' : can("add") ? '<button class="btn sh-readd" data-sh="readd" data-item="' + esc(b.item) + '" aria-label="Add ' + esc(b.item) + ' to the list">' + ICONS.plus + 'Add</button>' : "") +
        '</div>').join("") + '</div>'
        : '<div class="card"><div class="empty">' + (f ? "Nothing bought before matches that." : "Items you check off show here, so you can add them again with one tap.") + '</div></div>');
    return { title: "Buy again", back: true, html: html, keepScroll: true };
  }

  function viewLists() {
    const link = (name, label) => '<a class="list-item" href="#/shopping/list/' + encodeURIComponent(name) + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(label) + '</div><div class="sub">' +
      esc(listValues(name).map(l => l["Value"]).sort((a, b) => a.localeCompare(b)).join(", ")) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>';
    return { title: "Stores & categories", back: true, html: '<div class="card list">' + link("Store", "Stores") + link("Category", "Categories") + '</div>' +
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
      case "again": return viewAgain();
      case "lists": return viewLists();
      case "list": {
        const name = args[1] === "Category" ? "Category" : "Store";
        return M.listView(ctx, { table: "lists", list: name, title: name === "Store" ? "Stores" : "Categories",
          sort: name === "Category" ? ((a, b) => (Number(a["Sort"]) || 999) - (Number(b["Sort"]) || 999) || String(a["Value"]).localeCompare(String(b["Value"]))) : undefined,
          sub: r => r["Sort"] !== "" && r["Sort"] !== undefined && name === "Category" ? "Order " + r["Sort"] : "" });
      }
      case "deleted": return C.isAdmin() ? M.deletedView(ctx) : viewList();
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
      case "check": e.stopPropagation(); checkOff(d.id); break;
      case "undo": undoCheck(); break;
      case "add": quickAdd(); break;
      case "more": M.recordForm(ctx, "items", "", { title: "Add an item", prefill: { "Item": ($("#sh_add") || {}).value || "" } }); break;
      case "store": setStoreFilter(d.store || ""); C.render(); break;
      case "readd": {
        const b = (D().buyAgain || []).find(x => x.item === d.item);
        if (!b) return;
        const v = { "Item": b.item };
        if (b.quantity !== "" && b.quantity !== undefined) v["Quantity"] = b.quantity;
        if (b.unit) v["Unit"] = b.unit;
        if (b.store) v["Store"] = b.store;
        if (b.category) v["Category"] = b.category;
        addItem(v);
        break;
      }
      case "retry": sh.error = ""; C.render(); break;
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target && e.target.id === "sh_add") { e.preventDefault(); quickAdd(); }
  });
  document.addEventListener("input", e => {
    if (e.target && e.target.id === "sh_again_q") {
      sh.againFilter = e.target.value;
      const pos = e.target.selectionStart;
      C.render();
      const q = $("#sh_again_q");
      if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
    }
  });

  // While the list is open, refresh it quietly so other people's changes show up.
  setInterval(() => {
    if (document.visibilityState !== "visible" || C.parseRoute().name !== "shopping" || !sh.data || sh.loading) return;
    if (document.querySelector(".sheet-backdrop")) return;
    const a = document.activeElement;
    if (a && (a.id === "sh_add" || a.id === "sh_again_q") && a.value) return;
    load(true);
  }, REFRESH_MS);
})();
