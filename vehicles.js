/* Ayers Household - Vehicles screens
 * Vehicles home (vehicles, Insurance cards button, open follow-ups), one vehicle (details, features,
 * plates / service: intervals, visits, odometer / insurance: current card, past cards, registration),
 * the service visit form (lines that add up, Tax and Shipping lines), insurance policies applied to
 * several vehicles, and the lists (places, features, actions, dropdowns).
 * Data comes from vehicles.load; simple adds and edits use the shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, $$, toast, ICONS, svg, section, plural } = C;

  const vh = { data: null, loading: false, error: "", showPast: false, from: "", to: "" };
  const IC = {
    car: svg('<path d="M5 16V11.5l1.8-4.2A2 2 0 0 1 8.6 6h6.8a2 2 0 0 1 1.8 1.3L19 11.5V16"/><path d="M3.5 16h17v2.5h-17z"/><path d="M5 11.5h14"/>'),
    card: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    wrench: svg('<path d="M14.5 4.5a4 4 0 0 0-4.9 5.2L4 15.3 6.7 18l5.6-5.6a4 4 0 0 0 5.2-4.9l-2.4 2.4-2.3-.6-.6-2.3z"/>'),
    flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    gauge: svg('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>')
  };

  // ------------------------------------------------------------------
  // Data helpers
  // ------------------------------------------------------------------
  const D = () => vh.data;
  const rows = t => (D() && D()[t]) || [];
  const byId = (t, id) => { const s = ctx.schema(t); return rows(t).find(r => r[s.id] === id) || null; };
  const vName = v => v ? [v["Year"], v["Make"], v["Model"]].filter(x => x !== "" && x !== undefined).join(" ") + (v["Nickname"] ? " (" + v["Nickname"] + ")" : "") : "";
  const vLabel = v => v ? v["Vehicle ID"] + " " + vName(v) : "";
  const vehicle = id => byId("vehicles", id);
  const actionName = id => { const a = byId("actions", id); return a ? a["Action"] : ""; };
  const placeName = id => { const p = byId("places", id); return p ? p["Name"] : ""; };
  const featureOf = id => byId("features", id);
  const listVals = name => rows("lists").filter(l => l["List"] === name && l["Active"] !== false).map(l => l["Value"]).sort((a, b) => a.localeCompare(b));
  const sold = v => String(v["Status"] || "Active") === "Sold";
  const miles = n => (n === null || n === undefined || n === "" || isNaN(Number(n))) ? "" : Number(n).toLocaleString() + " mi";
  const day = s => s ? M.fmtDay(s, { weekday: undefined, year: "numeric" }) : "";
  const see = area => M.can(ctx, area, "view");
  const plateNow = id => rows("plates").filter(p => p["Vehicle ID"] === id && !p["End Date"]).sort((a, b) => String(b["Start Date"]).localeCompare(String(a["Start Date"])))[0];
  const policyOf = card => card ? byId("policies", card["Policy ID"]) : null;
  const mdy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[2] + "/" + m[3] + "/" + m[1].slice(2) : ""; };
  // Insurance card label: vehicle (bold) / from – to (mm/dd/yy) / provider, policy number.
  const cardLabel = (p, v) => '<b class="vh-cl-v">' + esc(vName(v)) + '</b><span class="vh-cl-d">' + esc(mdy(p["Start Date"]) + " – " + mdy(p["End Date"])) + '</span>' +
    '<span class="vh-cl-p">' + esc([placeName(p["Carrier"]), p["Policy Number"]].filter(Boolean).join(", ")) + '</span>';
  const currentCard = vid => { const id = (D().current || {})[vid]; return id ? byId("cards", id) : null; };

  async function load(silent) {
    vh.loading = true; if (!silent) vh.error = "";
    try { vh.data = await C.api("vehicles.load"); }
    catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { vh.loading = false; C.handleError(err); return; }
      vh.error = err.message;
    } finally { vh.loading = false; }
    if (C.parseRoute().name === "vehicles") C.render();
  }

  const ctx = {
    key: "vehicles",
    data: () => vh.data,
    applyData: d => { vh.data = d; },
    schema: t => vh.data.schema[t],
    rows: t => rows(t),
    refLabel: (t, r) => {
      switch (t) {
        case "vehicles": return vLabel(r);
        case "places": return r["Name"] + (r["Type"] ? " · " + r["Type"] : "");
        case "features": return r["Feature"];
        case "actions": return r["Category"] + " › " + r["Action"];
        case "visits": return day(r["Date"]) + " · " + vName(vehicle(r["Vehicle ID"]));
        case "policies": return placeName(r["Carrier"]) + " " + r["Policy Number"] + " (" + day(r["Start Date"]) + " – " + day(r["End Date"]) + ")";
        case "lists": return r["Value"];
        default: return r[ctx.schema(t).fields[0].name] || "";
      }
    },
    title: (t, r) => {
      switch (t) {
        case "vehicles": return vName(r);
        case "cards": return "Insurance card · " + vName(vehicle(r["Vehicle ID"]));
        case "registrations": return "Registration · " + vName(vehicle(r["Vehicle ID"]));
        case "odometer": return miles(r["Mileage"]) + " on " + day(r["Date"]);
        case "intervals": return actionName(r["Action ID"]) + " interval";
        case "plates": return "Plate " + r["Plate"];
        default: return ctx.refLabel(t, r);
      }
    },
    singular: t => ({ parts: "part", vehicles: "vehicle", places: "place", features: "feature", actions: "action", plates: "license plate", odometer: "odometer reading",
      intervals: "interval", registrations: "registration", cards: "insurance card", policies: "policy", lists: "list value" }[t] || "entry"),
    onFormReady: (t, form) => {
      if (t !== "vehicles") return;
      // Sold and lease details only show when they apply.
      const fieldOf = n => { const el = form.querySelector('[name="' + n + '"]'); return el && el.closest(".field"); };
      const sync = () => {
        const st = (form.querySelector('[name="Status"]') || {}).value, pt = (form.querySelector('[name="Purchase Type"]') || {}).value;
        ["Sold Date", "Sold Amount", "Sold To"].forEach(n => { const f = fieldOf(n); if (f) f.hidden = st !== "Sold"; });
        ["Lease End Date", "Lease Miles Per Year"].forEach(n => { const f = fieldOf(n); if (f) f.hidden = pt !== "Lease"; });
        const lh = fieldOf("Lienholder"); if (lh) lh.hidden = !(pt === "Finance" || pt === "Lease");
      };
      form.addEventListener("change", sync); sync();
    },
    save: async (action, payload, msg) => {
      C.busy(true);
      let res;
      try { res = await C.api(action, Object.assign({ module: "vehicles", reload: true }, payload)); }
      catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        if (err.code === "FORBIDDEN") { vh.data = null; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast((typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) vh.data = res.moduleData; else await load();
      C.state.homeStale = true;
      C.render();
      return res || true;
    },
    reload: () => load()
  };
  const can = (t, op, row, values) => M.tableCan(ctx, t, op, row, values);

  // ------------------------------------------------------------------
  // Service visit form: visit details + lines (category → action, cost, follow-up), Tax and Shipping
  // ------------------------------------------------------------------
  function lineRow(l, i) {
    const kind = l["Kind"] || "Service";
    const cats = listVals("Service Category");
    const acts = rows("actions").filter(a => a["Active"] !== false && (!l["Category"] || a["Category"] === l["Category"]) || a["Action ID"] === l["Action ID"])
      .sort((a, b) => a["Action"].localeCompare(b["Action"]));
    if (kind !== "Service") {
      return '<div class="vh-line vh-extra" data-i="' + i + '" data-kind="' + esc(kind) + '"' + (l["Line ID"] ? ' data-id="' + esc(l["Line ID"]) + '"' : "") + '>' +
        '<div class="vh-line-k">' + esc(kind) + '</div>' +
        '<div class="suffix-wrap money-wrap"><span class="prefix">$</span><input type="number" step="0.01" inputmode="decimal" data-l="Cost" value="' + esc(l["Cost"] === undefined ? "" : l["Cost"]) + '" aria-label="' + esc(kind) + ' amount"></div>' +
        '<button type="button" class="icon-btn vh-line-x" data-vl="remove" aria-label="Remove ' + esc(kind) + ' line">' + ICONS.close + '</button></div>';
    }
    return '<div class="vh-line" data-i="' + i + '" data-kind="Service"' + (l["Line ID"] ? ' data-id="' + esc(l["Line ID"]) + '"' : "") + '>' +
      '<div class="vh-line-top"><select data-l="Category" aria-label="Category"><option value="">Category</option>' + cats.map(c => '<option' + (c === l["Category"] ? " selected" : "") + '>' + esc(c) + '</option>').join("") + '</select>' +
      '<select data-l="Action ID" aria-label="Action"><option value="">Action</option>' + acts.map(a => '<option value="' + esc(a["Action ID"]) + '"' + (a["Action ID"] === l["Action ID"] ? " selected" : "") + '>' + esc(l["Category"] ? a["Action"] : a["Category"] + " › " + a["Action"]) + '</option>').join("") + '</select>' +
      '<button type="button" class="icon-btn vh-line-x" data-vl="remove" aria-label="Remove line">' + ICONS.close + '</button></div>' +
      '<div class="vh-line-mid"><input type="text" data-l="Description" placeholder="Details (optional)" value="' + esc(l["Description"] || "") + '" aria-label="Details">' +
      '<div class="suffix-wrap money-wrap"><span class="prefix">$</span><input type="number" step="0.01" inputmode="decimal" data-l="Cost" value="' + esc(l["Cost"] === undefined ? "" : l["Cost"]) + '" aria-label="Cost"></div></div>' +
      '<div class="vh-fu"><input type="text" data-l="Follow Up" placeholder="Follow-up (optional)" value="' + esc(l["Follow Up"] || "") + '" aria-label="Follow up">' +
      '<label class="vh-fu-date">Follow-up date <input type="date" data-l="Follow Up Date" value="' + esc(l["Follow Up Date"] || "") + '"></label>' +
      (l["Line ID"] ? '<label class="check"><input type="checkbox" data-l="Follow Up Done"' + (l["Follow Up Done"] === true ? " checked" : "") + '> Done</label>' : "") + '</div></div>';
  }
  function readLines(form) {
    return $$(".vh-line", form).map(el => {
      const o = { "Kind": el.dataset.kind };
      if (el.dataset.id) o.id = el.dataset.id;
      $$("[data-l]", el).forEach(i => { o[i.dataset.l] = i.type === "checkbox" ? i.checked : i.value; });
      return o;
    });
  }
  function visitForm(id, prefill) {
    const t = ctx.schema("visits");
    const row = id ? byId("visits", id) : null;
    if (id && !row) { toast("That visit no longer exists.", true); return; }
    const editable = row ? can("visits", "edit", row) : can("visits", "add");
    if (row && !editable) { location.hash = "#/vehicles/visit/" + encodeURIComponent(id); return; }
    const values = Object.assign({ "Date": M.isoDay(new Date()) }, prefill || {}, row || {});
    let lines = row ? rows("lines").filter(l => l["Visit ID"] === id).sort((a, b) => (Number(a["Sort"]) || 0) - (Number(b["Sort"]) || 0)).map(l => Object.assign({}, l))
      : (prefill && prefill.lines) || [{ "Kind": "Service" }];
    if (!row) ["Tax", "Shipping"].forEach(k => { if (!lines.some(l => l["Kind"] === k)) lines.push({ "Kind": k }); });
    const fields = ["Vehicle ID", "Date", "Mileage", "Shop"].map(n => t.fields.find(f => f.name === n));
    const body = (row ? '<div class="meta rec-meta">' + esc(row["Visit ID"]) + (row["Added By"] ? " · added by " + esc(M.userLabel(ctx, row["Added By"])) : "") + '</div>' : "") +
      fields.map(f => M.fieldHtml(ctx, "visits", f, values[f.name], {})).join("") +
      '<div class="field"><label>What was done</label><div class="vh-lines">' + lines.map(lineRow).join("") + '</div>' +
      '<div class="vh-line-add"><button type="button" class="link-btn" data-vl="add">+ Add a line</button>' +
      (!lines.some(l => l["Kind"] === "Tax") ? '<button type="button" class="link-btn" data-vl="tax">+ Tax</button>' : "") +
      (!lines.some(l => l["Kind"] === "Shipping") ? '<button type="button" class="link-btn" data-vl="ship">+ Shipping</button>' : "") +
      '<span class="vh-total">Total <b>$0.00</b></span></div>' +
      '<div class="hint">Tax and Shipping lines with no amount are left off. A follow-up date shows in Due Soon (and goes to the task list once Tasks is set up).</div></div>' +
      M.fieldHtml(ctx, "visits", t.fields.find(f => f.name === "Receipt"), values["Receipt"], {}) +
      M.fieldHtml(ctx, "visits", t.fields.find(f => f.name === "Notes"), values["Notes"], {}) +
      (row && (can("visits", "delete", row) || C.isAdmin()) ? '<div class="danger-zone">' + (can("visits", "delete", row) ? '<button type="button" class="btn danger" data-vl="delete">Delete visit</button>' : "") + '</div>' : "");
    let formEl;
    C.openSheet({
      title: row ? "Edit service visit" : "Add service visit", body: body, submitLabel: row ? "Save" : "Add",
      onReady: (form, close) => {
        formEl = form;
        M.wireAddNew(ctx, "visits", form);
        M.wireFiles(ctx, form, row ? { table: "visits", id: id, close: close } : null);
        const box = $(".vh-lines", form);
        const total = () => { const s = readLines(form).reduce((a, l) => a + (Number(l["Cost"]) || 0), 0); $(".vh-total b", form).textContent = M.money(s) || "$0.00"; };
        const redraw = () => { lines = readLines(form).map(l => Object.assign(l, l.id ? { "Line ID": l.id } : {})); };
        const refill = () => { box.innerHTML = lines.map(lineRow).join(""); total(); };
        form.addEventListener("input", total);
        form.addEventListener("change", e => {
          const el = e.target;
          if (el.matches('select[data-l="Category"]')) { redraw(); const i = +el.closest(".vh-line").dataset.i; const a = byId("actions", lines[i]["Action ID"]); if (a && a["Category"] !== lines[i]["Category"]) lines[i]["Action ID"] = ""; refill(); }
          if (el.matches('select[data-l="Action ID"]')) { redraw(); const i = +el.closest(".vh-line").dataset.i; const a = byId("actions", lines[i]["Action ID"]); if (a && !lines[i]["Category"]) { lines[i]["Category"] = a["Category"]; refill(); } }
        });
        form.addEventListener("click", async e => {
          const b = e.target.closest("[data-vl]");
          if (!b || b.tagName === "INPUT") return;
          if (b.dataset.vl === "remove") { redraw(); lines.splice(+b.closest(".vh-line").dataset.i, 1); refill(); }
          else if (b.dataset.vl === "add") { redraw(); const at = lines.findIndex(l => l["Kind"] !== "Service"); lines.splice(at === -1 ? lines.length : at, 0, { "Kind": "Service" }); refill(); }
          else if (b.dataset.vl === "tax" || b.dataset.vl === "ship") { redraw(); lines.push({ "Kind": b.dataset.vl === "tax" ? "Tax" : "Shipping" }); b.remove(); refill(); }
          else if (b.dataset.vl === "delete") {
            if (!(await M.confirmSheet({ title: "Delete visit?", message: "Delete this service visit? An admin can bring it back.", submitLabel: "Delete", danger: true }))) return;
            try { await ctx.save("modDelete", { table: "visits", id: id }, "Deleted"); close(); location.hash = "#/vehicles/v/" + encodeURIComponent(row["Vehicle ID"]) + "/service"; }
            catch (err) { toast(err.message, true); }
          }
        });
        total();
      },
      onSubmit: async v => {
        const values2 = {};
        ["Vehicle ID", "Date", "Mileage", "Shop", "Notes"].forEach(n => { if (n in v && v[n] !== "__new__") values2[n] = v[n]; });
        const res = await ctx.save("vehicles.saveVisit", { visitId: id || undefined, values: values2, lines: readLines(formEl) }, row ? "Visit saved" : "Visit added");
        if (!res) return false;
        for (const p of M.pickedFiles(formEl)) { try { await M.uploadFile(ctx, "visits", res.id, p.field, p.file); } catch (err) { toast(err.message, true); } }
        if (!row) location.hash = "#/vehicles/visit/" + encodeURIComponent(res.id);
        return true;
      }
    });
  }

  // ------------------------------------------------------------------
  // Insurance policy for one or more vehicles (a card image each)
  // ------------------------------------------------------------------
  function policyForm(vid) {
    const t = ctx.schema("policies");
    const vs = rows("vehicles").filter(v => !sold(v) || v["Vehicle ID"] === vid);
    const body = t.fields.map(f => M.fieldHtml(ctx, "policies", f, f.name === "Start Date" ? M.isoDay(new Date()) : undefined, {})).join("") +
      '<div class="field"><label>Vehicles on this policy <span class="req">*</span></label><div class="vh-polveh">' + vs.map(v =>
        '<div class="vh-polrow"><label class="check"><input type="checkbox" data-pv="' + esc(v["Vehicle ID"]) + '"' + (!vid || v["Vehicle ID"] === vid ? " checked" : "") + '> ' + esc(vLabel(v)) + '</label>' +
        M.filePicker(v["Vehicle ID"], "Card image") + '</div>').join("") + '</div>' +
      '<div class="hint">Each vehicle gets its own card; add each card’s image here or later.</div></div>';
    let formEl;
    C.openSheet({
      title: "Add insurance policy", body: body, submitLabel: "Add",
      onReady: form => {
        formEl = form; M.wireAddNew(ctx, "policies", form); M.wireFiles(ctx, form, null);
      },
      onSubmit: async v => {
        const values = {};
        t.fields.forEach(f => { if (f.name in v && v[f.name] !== "__new__") values[f.name] = v[f.name]; });
        const ids = $$("input[data-pv]", formEl).filter(i => i.checked).map(i => i.dataset.pv);
        if (!ids.length) throw new Error("Pick at least one vehicle.");
        const files = {};
        M.pickedFiles(formEl).forEach(p => { files[p.field] = p.files; });
        const res = await ctx.save("vehicles.addPolicy", { values: values, vehicles: ids }, "Policy added");
        if (!res) return false;
        for (let k = 0; k < ids.length; k++) {
          if (files[ids[k]] && res.cards && res.cards[k]) { try { await M.uploadFile(ctx, "cards", res.cards[k], "Card", files[ids[k]]); } catch (err) { toast(err.message, true); } }
        }
        return true;
      }
    });
  }

  // Features: tick the Yes/No ones, type the values.
  function featuresForm(vid) {
    const have = {};
    rows("vfeatures").filter(f => f["Vehicle ID"] === vid).forEach(f => have[f["Feature ID"]] = f["Value"] === "" ? true : f["Value"]);
    const feats = rows("features").filter(f => f["Active"] !== false || have[f["Feature ID"]] !== undefined).sort((a, b) => a["Feature"].localeCompare(b["Feature"]));
    const body = '<div class="vh-feat-edit">' + feats.map(f => f["Kind"] === "Value"
      ? '<div class="field vh-feat-val"><label for="vf_' + esc(f["Feature ID"]) + '">' + esc(f["Feature"]) + '</label><input type="text" id="vf_' + esc(f["Feature ID"]) + '" data-fv="' + esc(f["Feature ID"]) + '" value="' + esc(typeof have[f["Feature ID"]] === "string" ? have[f["Feature ID"]] : "") + '"></div>'
      : '<label class="check"><input type="checkbox" data-fy="' + esc(f["Feature ID"]) + '"' + (have[f["Feature ID"]] !== undefined ? " checked" : "") + '> ' + esc(f["Feature"]) + '</label>').join("") + '</div>' +
      (can("features", "add") ? '<p class="hint">Missing one? Add it under Lists & settings ▸ Features.</p>' : "");
    let formEl;
    C.openSheet({
      title: "Features · " + vName(vehicle(vid)), body: body, submitLabel: "Save",
      onReady: form => { formEl = form; },
      onSubmit: async () => {
        const list = $$("[data-fy]", formEl).filter(i => i.checked).map(i => ({ featureId: i.dataset.fy }))
          .concat($$("[data-fv]", formEl).filter(i => i.value.trim()).map(i => ({ featureId: i.dataset.fv, value: i.value.trim() })));
        return !!(await ctx.save("vehicles.setFeatures", { vehicleId: vid, features: list }, "Features saved"));
      }
    });
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  const nextDue = vid => { const s = (D().status || {})[vid]; return s ? s.intervals.find(x => x.dueDate) : null; };
  const dueText = s => s.dueDate ? (s.state === "overdue" ? "Overdue since " : "Due ") + day(s.dueDate) + (s.estimated ? " (est.)" : "") : "No history yet";
  const thumb = v => v["Photo"] ? M.fileHtml(ctx, v["Photo"], "thumb") : '<span class="thumb">' + IC.car + '</span>';

  function viewHome() {
    const all = rows("vehicles");
    const active = all.filter(v => !sold(v)), gone = all.filter(sold);
    const vRow = v => {
      const nd = see("service") ? nextDue(v["Vehicle ID"]) : null, pl = plateNow(v["Vehicle ID"]);
      const sub = [v["Primary Driver"] ? M.userName(ctx, v["Primary Driver"]) : "", pl ? pl["Plate"] : "", nd ? nd.action + ": " + dueText(nd) : ""].filter(Boolean).join(" · ");
      return '<a class="list-item' + (sold(v) ? " dim" : "") + '" href="#/vehicles/v/' + encodeURIComponent(v["Vehicle ID"]) + '">' + thumb(v) +
        '<div class="body"><div class="title">' + esc(vName(v)) + '</div><div class="sub">' + esc(sub) + '</div></div>' +
        (nd && nd.state === "overdue" ? '<span class="pill vh-over">Overdue</span>' : nd && nd.state === "soon" ? '<span class="pill vh-soon">Due soon</span>' : "") + '</a>';
    };
    const tileBtn = (attrs, icon, label, info, cls) => '<a class="home-link ' + (cls || "") + '" ' + attrs + '><span class="home-icon">' + icon + '</span><span class="home-text"><span class="home-label">' + esc(label) + '</span>' +
      (info ? '<span class="home-info">' + esc(info) + '</span>' : "") + '</span></a>';
    const nCur = Object.keys(D().current || {}).filter(k => { const v = vehicle(k); return v && !sold(v); }).length;
    const tiles = (see("insurance") ? tileBtn('href="#/vehicles/cards"', IC.card, "Insurance cards", plural(nCur, "current card"), "vh-cards-btn") : "") +
      (can("visits", "add") ? tileBtn('href="#/vehicles" role="button" data-vh="new-visit"', IC.wrench, "Service entry", "Log a service visit") : "");
    const ins = tiles ? '<div class="home-grid vh-tiles">' + tiles + '</div>' : "";
    const add = can("vehicles", "add") ? '<button class="btn" data-mod-add="vehicles">' + ICONS.plus + 'Add vehicle</button>' : "";
    const fus = see("service") ? openFollowUps() : [];
    const fuHtml = fus.length ? section("Follow-ups", '<div class="card list">' + fus.map(f => {
      const vis = byId("visits", f["Visit ID"]), v = vis && vehicle(vis["Vehicle ID"]);
      return '<div class="list-item vh-fu-row">' + (can("lines", "edit", f) ? '<button class="sh-check" data-vh="fu-done" data-id="' + esc(f["Line ID"]) + '" aria-label="Mark done"></button>' : "") +
        '<a class="body" href="#/vehicles/visit/' + encodeURIComponent(f["Visit ID"]) + '"><div class="title">' + esc(f["Follow Up"] || "Follow up") + '</div>' +
        '<div class="sub">' + esc([vName(v), f["Follow Up Date"] ? (f["Follow Up Date"] < D().today ? "Overdue since " : "By ") + day(f["Follow Up Date"]) : ""].filter(Boolean).join(" · ")) + '</div></a></div>';
    }).join("") + '</div>') : "";
    const links = [
      ["#/vehicles/places", "Places", "Dealerships, shops, insurance carriers, DMV / smog", "vehicles"],
      ["#/vehicles/features", "Features", "Heated seats, tire size…", "vehicles"],
      ["#/vehicles/actions", "Service categories & actions", "", "service"],
      ["#/vehicles/lists", "Dropdown lists", "Make, color, status, fuel, parts…", "vehicles"]
    ].filter(l => see(l[3])).map(l => '<a class="list-item" href="' + l[0] + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(l[1]) + '</div>' +
      (l[2] ? '<div class="sub">' + esc(l[2]) + '</div>' : "") + '</div><span class="thumb">' + ICONS.next + '</span></a>').join("");
    const html = ins +
      section("Vehicles", '<div class="card list">' + (active.map(vRow).join("") || '<div class="empty">No vehicles yet.</div>') + '</div>', add ? add.replace('class="btn"', 'class="link-btn"').replace(ICONS.plus, "+ ") : "") +
      fuHtml +
      (gone.length ? section("Sold", '<div class="card list">' + gone.map(vRow).join("") + '</div>') : "") +
      (links ? section("Lists & settings", '<div class="card list">' + links + '</div>') : "") +
      (C.isAdmin() ? '<p class="hint"><a href="#/vehicles/deleted">Deleted items</a></p>' : "");
    return { title: "Vehicles", back: true, html: html };
  }
  function openFollowUps() {
    const live = {}; rows("visits").forEach(v => { const x = vehicle(v["Vehicle ID"]); if (x && !sold(x)) live[v["Visit ID"]] = true; });
    return rows("lines").filter(l => live[l["Visit ID"]] && (l["Follow Up"] || l["Follow Up Date"]) && l["Follow Up Done"] !== true)
      .sort((a, b) => String(a["Follow Up Date"] || "9999").localeCompare(String(b["Follow Up Date"] || "9999")));
  }

  function tabs(vid, on) {
    const t = [["", "Details", "vehicles"], ["service", "Service", "service"], ["insurance", "Insurance", "insurance"]].filter(x => see(x[2]));
    return t.length > 1 ? '<div class="segmented vh-tabs">' + t.map(x => '<button class="' + (x[0] === on ? "on" : "") + '" data-vh="tab" data-to="#/vehicles/v/' + encodeURIComponent(vid) + (x[0] ? "/" + x[0] : "") + '">' + x[1] + '</button>').join("") + '</div>' : "";
  }
  const kv = pairs => { const p = pairs.filter(x => x[1] !== "" && x[1] !== undefined && x[1] !== null); return p.length ? '<div class="card kv">' + p.map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + esc(x[1]) + '</div>').join("") + '</div>' : ""; };

  function viewVehicle(vid, tab) {
    const v = vehicle(vid);
    if (!v) return { title: "Vehicle", back: true, html: '<div class="card"><div class="empty">That vehicle isn’t here any more.</div></div>' };
    if (!tab && !see("vehicles")) tab = see("service") ? "service" : "insurance";
    const cur = see("insurance") ? currentCard(vid) : null;
    const head = '<div class="card hero vh-hero">' + (v["Photo"] ? M.fileHtml(ctx, v["Photo"], "vh-photo") : "") +
      '<h2>' + esc(vName(v)) + '</h2><div class="meta">' + esc([v["Vehicle ID"], v["Trim"], v["Primary Driver"] ? "Driver: " + M.userName(ctx, v["Primary Driver"]) : "", sold(v) ? "Sold" : ""].filter(Boolean).join(" · ")) + '</div>' +
      (see("insurance") ? '<div class="actions">' + (cur ? '<a class="btn primary" href="#/vehicles/card/' + encodeURIComponent(cur["Card ID"]) + '">' + IC.card + ' Insurance card</a>' : '<span class="pill vh-over">No current insurance card</span>') + '</div>' : "") + '</div>';
    let body = "";
    if (tab === "service") body = vehService(v);
    else if (tab === "insurance") body = vehInsurance(v);
    else body = vehDetails(v);
    return { title: vName(v), back: true, html: head + tabs(vid, tab || "") + body };
  }

  function vehDetails(v) {
    const vid = v["Vehicle ID"];
    const fmt = (n) => { const f = ctx.schema("vehicles").fields.find(x => x.name === n); return M.shownValue(ctx, f, v[n]); };
    const edit = can("vehicles", "edit", v) ? '<button class="btn" data-mod-edit="vehicles" data-id="' + esc(vid) + '">Edit details</button>' : "";
    const basics = kv([["Nickname", v["Nickname"]], ["Trim", v["Trim"]], ["Color", v["Color"]], ["VIN", v["VIN"]], ["Status", v["Status"]], ["Fuel", v["Fuel Type"]], ["Drivetrain", v["Drivetrain"]]]);
    const buy = kv([["Purchased", fmt("Purchase Date")], ["From", placeName(v["Dealership"])], ["Amount", fmt("Purchase Amount")], ["Mileage then", miles(v["Mileage at Purchase"])],
      ["Condition", v["Condition"]], ["Purchase type", v["Purchase Type"]], ["Lienholder", v["Lienholder"]], ["Lease ends", fmt("Lease End Date")], ["Lease miles / yr", v["Lease Miles Per Year"] ? Number(v["Lease Miles Per Year"]).toLocaleString() : ""],
      ["Sold", fmt("Sold Date")], ["Sold for", fmt("Sold Amount")], ["Sold to", v["Sold To"]]]);
    const specs = kv([["Oil", [v["Oil Type"], v["Oil Capacity"]].filter(Boolean).join(", ")], ["Tire pressure", [v["Tire Pressure Front"] ? "Front " + v["Tire Pressure Front"] : "", v["Tire Pressure Rear"] ? "Rear " + v["Tire Pressure Rear"] : ""].filter(Boolean).join(" · ")],
      ["Wipers", [v["Wiper Driver"] ? "Driver " + v["Wiper Driver"] : "", v["Wiper Passenger"] ? "Passenger " + v["Wiper Passenger"] : "", v["Wiper Rear"] ? "Rear " + v["Wiper Rear"] : ""].filter(Boolean).join(" · ")], ["12V battery", fmt("Battery Install Date")], ["Key fob battery", v["Key Fob Battery"]], ["Smog due", fmt("Smog Due")]]);
    const feats = rows("vfeatures").filter(f => f["Vehicle ID"] === vid).map(f => { const x = featureOf(f["Feature ID"]); return x ? { name: x["Feature"], value: f["Value"] } : null; })
      .filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const featHtml = '<div class="card">' + (feats.length ? '<div class="vh-feats">' + feats.map(f => '<span class="pill">' + esc(f.name) + (f.value ? ": " + esc(f.value) : "") + '</span>').join("") + '</div>' : '<div class="empty">No features listed.</div>') + '</div>';
    const plates = rows("plates").filter(p => p["Vehicle ID"] === vid).sort((a, b) => (a["End Date"] ? 1 : 0) - (b["End Date"] ? 1 : 0) || String(b["Start Date"]).localeCompare(String(a["Start Date"])));
    const plateHtml = '<div class="card list">' + (plates.map(p => '<div class="list-item" role="button" tabindex="0" data-mod-edit="plates" data-id="' + esc(p["Plate ID"]) + '"><div class="body"><div class="title">' + esc(p["Plate"]) + (p["State"] ? " · " + esc(p["State"]) : "") + '</div>' +
      '<div class="sub">' + esc([p["Plate Type"], p["Start Date"] ? day(p["Start Date"]) + " – " + (p["End Date"] ? day(p["End Date"]) : "now") : (p["End Date"] ? "until " + day(p["End Date"]) : "Current"), p["Reason"]].filter(Boolean).join(" · ")) + '</div></div>' +
      (!p["End Date"] ? '<span class="pill">Current</span>' : "") + '</div>').join("") || '<div class="empty">No plates yet.</div>') + '</div>';
    return (edit ? '<div class="actions" style="margin:0 0 4px">' + edit + '</div>' : "") +
      (basics ? section("Basics", basics) : "") + (buy ? section("Purchase", buy) : "") + (specs ? section("Specs", specs) : "") +
      section("Features", featHtml, can("vehicles", "edit", v) ? '<button class="link-btn" data-vh="features" data-id="' + esc(vid) + '">Edit</button>' : "") +
      loansHtml(vid) +
      section("Parts", partsHtml(vid), can("parts", "add") ? '<button class="link-btn" data-vh="add-part" data-id="' + esc(vid) + '">+ Add</button>' : "") +
      section("License plates", plateHtml, can("plates", "add") ? '<button class="link-btn" data-vh="add-plate" data-id="' + esc(vid) + '">+ Add</button>' : "") +
      (v["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(v["Notes"]) + '</div></div>') : "");
  }

  // Loans on this vehicle (Financial; only sent to people who can see Financial ▸ Loans).
  function loansHtml(vid) {
    const ls = (D().loans || {})[vid] || [];
    if (!ls.length) return "";
    const payoff = l => l.basis === "done" ? "Paid off" : l.payoff ? "Paid off about " + new Date(+l.payoff.slice(0, 4), +l.payoff.slice(5, 7) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
    return section("Loan", '<div class="card list">' + ls.map(l => '<a class="list-item" href="#/financial/loan/' + encodeURIComponent(l.id) + '"><div class="body"><div class="title">' + esc(l.name) + '</div>' +
      '<div class="sub">' + esc([M.money(l.remaining) + " left", l.monthly ? M.money(l.monthly) + " / mo" : "", payoff(l)].filter(Boolean).join(" · ")) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") + '</div>');
  }
  function partsHtml(vid) {
    const ps = rows("parts").filter(p => p["Vehicle ID"] === vid).sort((a, b) => String(a["Part"]).localeCompare(String(b["Part"])));
    return '<div class="card list">' + (ps.map(p => '<div class="list-item" role="button" tabindex="0" data-mod-edit="parts" data-id="' + esc(p["Part ID"]) + '"><div class="body"><div class="title">' + esc(p["Part"]) + '</div>' +
      '<div class="sub vh-wrap">' + esc(p["Info"]) + '</div></div></div>').join("") || '<div class="empty">No parts listed.</div>') + '</div>';
  }

  function vehService(v) {
    const vid = v["Vehicle ID"], st = (D().status || {})[vid] || { intervals: [] };
    const canAddVisit = can("visits", "add"), canOdo = can("odometer", "add");
    const top = '<div class="actions" style="margin:0 0 4px">' + (canAddVisit ? '<button class="btn primary" data-vh="add-visit" data-id="' + esc(vid) + '">' + ICONS.plus + 'Service visit</button>' : "") +
      (canOdo ? '<button class="btn" data-vh="add-odo" data-id="' + esc(vid) + '">' + IC.gauge + ' Log odometer</button>' : "") + '</div>' +
      '<div class="meta vh-miles">' + esc(st.miles ? "Last mileage: " + miles(st.miles.miles) + " on " + day(st.miles.date) + (st.rate ? " · about " + st.rate.toLocaleString() + " mi a month" : "") : "No mileage recorded yet.") + '</div>';
    const ivs = st.intervals.map(s => {
      const iv = byId("intervals", s.id) || {};
      const every = [iv["Miles"] ? Number(iv["Miles"]).toLocaleString() + " mi" : "", iv["Months"] ? plural(Number(iv["Months"]), "month") : ""].filter(Boolean).join(" / ");
      const last = s.last ? "Last " + day(s.last.date) + (s.last.miles !== null && s.last.miles !== undefined ? " at " + miles(s.last.miles) : "") : s.baseline && s.baseline.purchase ? "Counting from purchase" : "";
      const due = s.dueDate ? dueText(s) + (s.dueMiles ? " · or at " + miles(s.dueMiles) : "") : (s.dueMiles ? "Due at " + miles(s.dueMiles) : "Due date unknown until it’s serviced");
      return '<div class="list-item vh-iv ' + esc(s.state) + '"><div class="body" role="button" tabindex="0" data-mod-edit="intervals" data-id="' + esc(s.id) + '"><div class="title">' + esc(s.action) + ' <span class="vh-every">every ' + esc(every) + '</span></div>' +
        '<div class="sub">' + esc(due) + '</div>' + (last ? '<div class="sub">' + esc(last) + '</div>' : "") + '</div>' +
        (s.state === "overdue" ? '<span class="pill vh-over">Overdue</span>' : s.state === "soon" ? '<span class="pill vh-soon">Soon</span>' : "") +
        (canAddVisit ? '<button class="btn vh-done" data-vh="done" data-id="' + esc(vid) + '" data-action="' + esc(iv["Action ID"] || "") + '">Done</button>' : "") + '</div>';
    }).join("");
    const ivHtml = '<div class="card list">' + (ivs || '<div class="empty">No intervals set.</div>') + '</div>' +
      (st.intervals.some(s => s.estimated) ? '<p class="hint">“est.” = estimated from average miles per month.</p>' : "");
    const visits = rows("visits").filter(x => x["Vehicle ID"] === vid).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])));
    const vHtml = '<div class="card list">' + (visits.map(x => {
      const ls = rows("lines").filter(l => l["Visit ID"] === x["Visit ID"] && l["Kind"] === "Service").map(l => actionName(l["Action ID"]) || l["Description"] || l["Category"]).filter(Boolean);
      return '<a class="list-item" href="#/vehicles/visit/' + encodeURIComponent(x["Visit ID"]) + '"><div class="body"><div class="title">' + esc(day(x["Date"])) + (x["Total"] !== "" ? ' · ' + esc(M.money(x["Total"])) : "") + '</div>' +
        '<div class="sub">' + esc([miles(x["Mileage"]), placeName(x["Shop"]), ls.join(", ")].filter(Boolean).join(" · ")) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>';
    }).join("") || '<div class="empty">No service visits yet.</div>') + '</div>';
    const odo = rows("odometer").filter(o => o["Vehicle ID"] === vid).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"]))).slice(0, 5);
    const oHtml = odo.length ? section("Odometer entries", '<div class="card list">' + odo.map(o => '<div class="list-item" role="button" tabindex="0" data-mod-edit="odometer" data-id="' + esc(o["Reading ID"]) + '"><div class="body"><div class="title">' + esc(miles(o["Mileage"])) + '</div><div class="sub">' + esc([day(o["Date"]), o["Notes"]].filter(Boolean).join(" · ")) + '</div></div></div>').join("") + '</div>') : "";
    return top + section("Service intervals", ivHtml, can("intervals", "add") ? '<button class="link-btn" data-vh="add-interval" data-id="' + esc(vid) + '">+ Add</button>' : "") +
      section("Service history", vHtml) + oHtml;
  }

  function vehInsurance(v) {
    const vid = v["Vehicle ID"], today = D().today;
    const cur = currentCard(vid);
    const cards = rows("cards").filter(c => c["Vehicle ID"] === vid).map(c => ({ c: c, p: policyOf(c) })).filter(x => x.p)
      .sort((a, b) => String(b.p["Start Date"]).localeCompare(String(a.p["Start Date"])));
    const cardRow = x => '<a class="list-item" href="#/vehicles/card/' + encodeURIComponent(x.c["Card ID"]) + '">' + (x.c["Card"] ? M.fileHtml(ctx, x.c["Card"], "thumb") : '<span class="thumb">' + IC.card + '</span>') +
      '<div class="body vh-cl">' + cardLabel(x.p, v) + '</div>' +
      (x.c === cur ? '<span class="pill vh-ok">Current</span>' : x.p["End Date"] < today ? '<span class="pill">Expired</span>' : x.p["Start Date"] > today ? '<span class="pill">Upcoming</span>' : "") + '</a>';
    const allRegs = rows("registrations").filter(r => r["Vehicle ID"] === vid).sort((a, b) => String(b["Expires"]).localeCompare(String(a["Expires"])));
    const regs = vh.pastRegs ? allRegs : allRegs.slice(0, 1);
    const regRow = r => '<div class="list-item" role="button" tabindex="0" data-mod-edit="registrations" data-id="' + esc(r["Registration ID"]) + '">' + (r["Card"] ? M.fileHtml(ctx, r["Card"], "thumb") : '<span class="thumb">' + IC.flag + '</span>') +
      '<div class="body"><div class="title">Expires ' + esc(day(r["Expires"])) + '</div><div class="sub">' + esc([r["Fee"] !== "" ? M.money(r["Fee"]) : "", r["Paid Date"] ? "Paid " + day(r["Paid Date"]) : ""].filter(Boolean).join(" · ")) + '</div></div>' +
      (r["Expires"] < today ? '<span class="pill vh-over">Expired</span>' : "") + '</div>';
    return section("Insurance cards", '<div class="card list">' + (cards.map(cardRow).join("") || '<div class="empty">No insurance cards yet.</div>') + '</div>',
        can("policies", "add") ? '<button class="link-btn" data-vh="add-policy" data-id="' + esc(vid) + '">+ Policy</button>' : "") +
      section("Registration", '<div class="card list">' + (regs.map(regRow).join("") || '<div class="empty">No registrations yet.</div>') + '</div>' +
        (allRegs.length > 1 ? '<label class="check vh-pasttoggle"><input type="checkbox" data-vh="pastregs"' + (vh.pastRegs ? " checked" : "") + '> Show past registrations (' + (allRegs.length - 1) + ')</label>' : ""),
        can("registrations", "add") ? '<button class="link-btn" data-vh="add-reg" data-id="' + esc(vid) + '">+ Add</button>' : "");
  }

  function viewVisit(id) {
    const x = byId("visits", id);
    if (!x) return { title: "Service visit", back: true, html: '<div class="card"><div class="empty">That visit isn’t here any more.</div></div>' };
    const v = vehicle(x["Vehicle ID"]);
    const ls = rows("lines").filter(l => l["Visit ID"] === id).sort((a, b) => (Number(a["Sort"]) || 0) - (Number(b["Sort"]) || 0));
    const lineHtml = '<div class="card list">' + ls.map(l => '<div class="list-item"><div class="body"><div class="title">' + esc(l["Kind"] === "Service" ? (actionName(l["Action ID"]) || l["Description"] || l["Category"] || "Service") : l["Kind"]) + '</div>' +
      '<div class="sub">' + esc([l["Kind"] === "Service" ? l["Category"] : "", l["Kind"] === "Service" && actionName(l["Action ID"]) ? l["Description"] : (l["Kind"] !== "Service" ? l["Description"] : "")].filter(Boolean).join(" · ")) + '</div>' +
      (l["Follow Up"] || l["Follow Up Date"] ? '<div class="sub vh-fu-line">' + (l["Follow Up Done"] === true ? "✓ " : "Follow up: ") + esc([l["Follow Up"], l["Follow Up Date"] ? "by " + day(l["Follow Up Date"]) : ""].filter(Boolean).join(" ")) + '</div>' : "") +
      '</div><div class="vh-cost">' + esc(M.money(l["Cost"])) + '</div></div>').join("") +
      '<div class="list-item vh-total-row"><div class="body"><div class="title">Total</div></div><div class="vh-cost"><b>' + esc(M.money(x["Total"]) || "$0.00") + '</b></div></div></div>';
    const html = '<div class="card hero"><h2>' + esc(day(x["Date"])) + '</h2><div class="meta">' + esc([x["Visit ID"], vName(v), miles(x["Mileage"]), placeName(x["Shop"])].filter(Boolean).join(" · ")) + '</div>' +
      (can("visits", "edit", x) ? '<div class="actions"><button class="btn" data-vh="edit-visit" data-id="' + esc(id) + '">Edit</button></div>' : "") + '</div>' +
      section("What was done", lineHtml) +
      (x["Receipt"] ? section("Receipt", '<div class="card vh-file">' + M.fileHtml(ctx, x["Receipt"], "vh-receipt") + '</div>') : "") +
      (x["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(x["Notes"]) + '</div></div>') : "");
    return { title: "Service visit", back: true, html: html };
  }

  // Insurance cards: current card for each vehicle; past cards with a tick box, filtered by entry date.
  function viewCards() {
    const today = D().today;
    const curIds = Object.values(D().current || {});
    const all = rows("cards").map(c => ({ c: c, p: policyOf(c), v: vehicle(c["Vehicle ID"]) })).filter(x => x.p && x.v);
    const tile = x => '<a class="card vh-cardtile" href="#/vehicles/card/' + encodeURIComponent(x.c["Card ID"]) + '">' +
      (x.c["Card"] ? M.fileHtml(ctx, x.c["Card"], "vh-cardimg") : '<div class="vh-cardimg vh-noimg">' + IC.card + '<span>No image yet</span></div>') +
      '<div class="vh-cardcap vh-cl">' + cardLabel(x.p, x.v) + '</div></a>';
    const current = all.filter(x => curIds.indexOf(x.c["Card ID"]) !== -1 && !sold(x.v)).sort((a, b) => vName(a.v).localeCompare(vName(b.v)));
    const noCard = rows("vehicles").filter(v => !sold(v) && !(D().current || {})[v["Vehicle ID"]]);
    let past = all.filter(x => curIds.indexOf(x.c["Card ID"]) === -1);
    const entry = x => String(x.c["Added At"] || "").slice(0, 10);
    if (vh.from) past = past.filter(x => entry(x) >= vh.from);
    if (vh.to) past = past.filter(x => entry(x) <= vh.to);
    past.sort((a, b) => entry(b).localeCompare(entry(a)));
    const pastHtml = vh.showPast ? '<div class="vh-filter"><label>Entered from <input type="date" data-vh="from" value="' + esc(vh.from) + '"></label><label>to <input type="date" data-vh="to" value="' + esc(vh.to) + '"></label></div>' +
      '<div class="card list">' + (past.map(x => '<a class="list-item" href="#/vehicles/card/' + encodeURIComponent(x.c["Card ID"]) + '">' + (x.c["Card"] ? M.fileHtml(ctx, x.c["Card"], "thumb") : '<span class="thumb">' + IC.card + '</span>') +
        '<div class="body vh-cl">' + cardLabel(x.p, x.v) + '<span class="vh-cl-e">Entered ' + esc(mdy(entry(x))) + '</span></div>' +
        (x.p["End Date"] < today ? '<span class="pill">Expired</span>' : '<span class="pill">Upcoming</span>') + '</a>').join("") || '<div class="empty">No past cards' + (vh.from || vh.to ? " entered in those dates" : "") + '.</div>') + '</div>' : "";
    const html = (can("policies", "add") ? '<div class="actions" style="margin:0 0 8px"><button class="btn" data-vh="add-policy">' + ICONS.plus + 'Add policy</button></div>' : "") +
      (current.length ? '<div class="vh-cardgrid">' + current.map(tile).join("") + '</div>' : '<div class="card"><div class="empty">No current insurance cards.</div></div>') +
      (noCard.length ? '<p class="hint">No current card: ' + esc(noCard.map(vName).join(", ")) + '</p>' : "") +
      '<label class="check vh-pasttoggle"><input type="checkbox" data-vh="past"' + (vh.showPast ? " checked" : "") + '> Show past cards</label>' + pastHtml;
    return { title: "Insurance cards", back: true, html: html };
  }

  function viewCard(id) {
    const c = byId("cards", id);
    if (!c) return { title: "Insurance card", back: true, html: '<div class="card"><div class="empty">That card isn’t here any more.</div></div>' };
    const p = policyOf(c), v = vehicle(c["Vehicle ID"]), today = D().today;
    const carrier = p && byId("places", p["Carrier"]);
    const state = !p ? "" : p["End Date"] < today ? "Expired" : p["Start Date"] > today ? "Not in effect yet" : "In effect";
    const html = (c["Card"] ? '<div class="card vh-file">' + M.fileHtml(ctx, c["Card"], "vh-cardbig") + '</div>' : '<div class="card"><div class="empty">No card image yet.</div></div>') +
      kv([["Vehicle", vLabel(v)], ["Carrier", carrier ? carrier["Name"] : ""], ["Policy", p ? p["Policy Number"] : ""], ["Effective", p ? day(p["Start Date"]) : ""], ["Expires", p ? day(p["End Date"]) : ""],
          ["Status", state], ["Carrier phone", carrier ? carrier["Phone"] : ""], ["Notes", c["Notes"]]]) +
      '<div class="actions">' + (can("cards", "edit", c) ? '<button class="btn" data-mod-edit="cards" data-id="' + esc(id) + '">' + (c["Card"] ? "Change card image" : "Add card image") + '</button>' : "") +
        (p && can("policies", "edit", p) ? '<button class="btn" data-mod-edit="policies" data-id="' + esc(p["Policy ID"]) + '">Edit policy</button>' : "") +
        (p && can("cards", "add") ? '<button class="btn" data-vh="policy-add-veh" data-id="' + esc(p["Policy ID"]) + '">Add a vehicle to this policy</button>' : "") + '</div>';
    return { title: vName(v) || "Insurance card", back: true, html: html };
  }

  function viewLists() {
    const names = ["Make", "Color", "Status", "Condition", "Purchase Type", "Fuel Type", "Drivetrain", "Plate Type", "Place Type", "Part"];
    return { title: "Dropdown lists", back: true, html: '<div class="card list">' + names.map(n => '<a class="list-item" href="#/vehicles/list/' + encodeURIComponent(n) + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(n) + '</div>' +
      '<div class="sub">' + esc(listVals(n).join(", ") || "Empty") + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") + '</div>' };
  }
  function viewActions() {
    const cats = rows("lists").filter(l => l["List"] === "Service Category").sort((a, b) => String(a["Value"]).localeCompare(String(b["Value"])));
    const canCat = can("lists", "add", null, { "List": "Service Category" }), canAct = can("actions", "add");
    const html = (canCat ? '<div class="actions" style="margin:0 0 8px"><button class="btn" data-mod-add="lists" data-list="Service Category">' + ICONS.plus + 'Category</button></div>' : "") +
      cats.map(c => {
        const acts = rows("actions").filter(a => a["Category"] === c["Value"]).sort((a, b) => a["Action"].localeCompare(b["Action"]));
        return section(c["Value"] + (c["Active"] === false ? " (off)" : ""), '<div class="card list">' + (acts.map(a => '<div class="list-item' + (a["Active"] === false ? " dim" : "") + '" role="button" tabindex="0" data-mod-edit="actions" data-id="' + esc(a["Action ID"]) + '"><div class="body"><div class="title">' + esc(a["Action"]) + '</div></div>' + (a["Active"] === false ? '<span class="pill">Off</span>' : "") + '</div>').join("") || '<div class="empty">No actions yet.</div>') + '</div>',
          (canAct ? '<button class="link-btn" data-vh="add-action" data-cat="' + esc(c["Value"]) + '">+ Action</button>' : "") + (canCat ? ' <button class="link-btn" data-mod-edit="lists" data-id="' + esc(c["List Value ID"]) + '">Edit</button>' : ""));
      }).join("");
    return { title: "Service categories & actions", back: true, html: html };
  }

  function view(args) {
    M.current = ctx;
    if (vh.error) return { title: "Vehicles", back: true, html: '<div class="card"><div class="empty">' + esc(vh.error) + '</div></div><div class="actions"><button class="btn" data-vh="retry">Try again</button></div>' };
    if (!vh.data) {
      if (!vh.loading) load();
      return { title: "Vehicles", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "v": return viewVehicle(args[1], args[2] || "");
      case "visit": return viewVisit(args[1]);
      case "cards": return viewCards();
      case "card": return viewCard(args[1]);
      case "places": return M.listView(ctx, { table: "places", title: "Places", label: r => r["Name"], sub: r => [r["Type"], r["Phone"], r["Address"]].filter(Boolean).join(" · ") });
      case "features": return M.listView(ctx, { table: "features", title: "Features", label: r => r["Feature"], sub: r => r["Kind"] === "Value" ? "Value" : "" });
      case "actions": return viewActions();
      case "lists": return viewLists();
      case "list": return M.listView(ctx, { table: "lists", list: args[1], title: args[1] });
      case "deleted": return M.deletedView(ctx);
      default: return viewHome();
    }
  }
  C.registerModule("vehicles", view, () => { vh.data = null; vh.loading = false; M.clearDeleted("vehicles"); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  const today = () => M.isoDay(new Date());
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-act='refresh']") && C.parseRoute().name === "vehicles") { vh.data = null; M.clearDeleted("vehicles"); }
    const el = e.target.closest("[data-vh]");
    if (!el || el.tagName === "INPUT") return;
    const d = el.dataset;
    switch (d.vh) {
      case "retry": vh.error = ""; C.render(); break;
      case "tab": location.replace(d.to); break;
      case "features": featuresForm(d.id); break;
      case "new-visit": e.preventDefault(); visitForm("", {}); break;
      case "add-part": M.recordForm(ctx, "parts", "", { prefill: { "Vehicle ID": d.id }, hide: ["Vehicle ID"], title: "Add part info" }); break;
      case "add-plate": M.recordForm(ctx, "plates", "", { prefill: { "Vehicle ID": d.id, "Start Date": today() }, hide: ["Vehicle ID"] }); break;
      case "add-odo": M.recordForm(ctx, "odometer", "", { prefill: { "Vehicle ID": d.id, "Date": today() }, hide: ["Vehicle ID"], title: "Log odometer" }); break;
      case "add-interval": M.recordForm(ctx, "intervals", "", { prefill: { "Vehicle ID": d.id }, hide: ["Vehicle ID"] }); break;
      case "add-reg": M.recordForm(ctx, "registrations", "", { prefill: { "Vehicle ID": d.id }, hide: ["Vehicle ID"] }); break;
      case "add-visit": visitForm("", { "Vehicle ID": d.id }); break;
      case "edit-visit": visitForm(d.id); break;
      case "done": {
        const a = byId("actions", d.action);
        visitForm("", { "Vehicle ID": d.id, lines: [{ "Kind": "Service", "Category": a ? a["Category"] : "", "Action ID": d.action }] });
        break;
      }
      case "add-policy": policyForm(d.id || ""); break;
      case "policy-add-veh": M.recordForm(ctx, "cards", "", { prefill: { "Policy ID": d.id }, hide: ["Policy ID"], title: "Add a vehicle to this policy" }); break;
      case "add-action": M.recordForm(ctx, "actions", "", { prefill: { "Category": d.cat } }); break;
      case "fu-done":
        try { await ctx.save("vehicles.followUp", { id: d.id, done: true }, "Follow-up done"); } catch (err) { toast(err.message, true); }
        break;
    }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (!t || !t.matches || C.parseRoute().name !== "vehicles") return;
    if (t.matches("[data-vh='past']")) { vh.showPast = t.checked; C.render(); }
    if (t.matches("[data-vh='pastregs']")) { vh.pastRegs = t.checked; C.render(); }
    if (t.matches("[data-vh='from']")) { vh.from = t.value; C.render(); }
    if (t.matches("[data-vh='to']")) { vh.to = t.value; C.render(); }
  });
})();
