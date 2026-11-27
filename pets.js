/* Ayers Household - Pets screens
 * Pets home (pets, what's due across them with a one-tap "Given", follow-ups), one pet (details,
 * food and weights / care: treatments with next due dates, the treatment log, medications and
 * refills / vet visits), the vet visit form (treatments given at the visit), and the lists
 * (places, treatments, dropdowns). Data comes from pets.load; simple adds and edits use the
 * shared module engine (modules.js).
 */
(function () {
  "use strict";
  const C = window.HH_CORE, M = window.HH_MOD;
  const { esc, $, $$, toast, ICONS, svg, section, plural } = C;

  const pt = { data: null, loading: false, error: "", allLog: {} };
  const IC = {
    paw: svg('<ellipse cx="12" cy="16" rx="4.2" ry="3.4"/><circle cx="6.2" cy="10.6" r="1.8"/><circle cx="9.4" cy="6.8" r="1.8"/><circle cx="14.6" cy="6.8" r="1.8"/><circle cx="17.8" cy="10.6" r="1.8"/>'),
    vet: svg('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>'),
    syringe: svg('<path d="M18 2l4 4M15 5l4 4M17 7l-9 9-4 1 1-4 9-9M7 13l4 4M3 21l3-3"/>'),
    pill: svg('<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M10 7.5l4 7"/>'),
    scale: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9a3 3 0 0 1 6 0M12 9l1.5-1.5"/>'),
    tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>')
  };

  const D = () => pt.data;
  const rows = t => (D() && D()[t]) || [];
  const byId = (t, id) => { const s = ctx.schema(t); return s ? rows(t).find(r => r[s.id] === id) || null : null; };
  const see = a => M.can(ctx, a, "view");
  const can = (t, op, row, values) => M.tableCan(ctx, t, op, row, values);
  const day = s => s ? M.fmtDay(s, { weekday: undefined, year: "numeric" }) : "";
  const today = () => D().today;
  const active = p => String(p["Status"] || "Active") === "Active";
  const trtName = id => { const t = byId("treatments", id); return t ? t["Treatment"] : ""; };
  const placeName = id => { const p = byId("places", id); return p ? p["Name"] : ""; };
  const pet = id => byId("pets", id);
  const listVals = name => rows("lists").filter(l => l["List"] === name && l["Active"] !== false).map(l => l["Value"]).sort((a, b) => a.localeCompare(b));
  const every = s => "every " + (Number(s["Every"]) === 1 ? s["Unit"].toLowerCase().replace(/s$/, "") : s["Every"] + " " + s["Unit"].toLowerCase());
  function age(p) {
    const b = M.parseIso(p["Birth Date"]); if (!b) return "";
    const t = M.parseIso(today());
    let y = t.getFullYear() - b.getFullYear(), m = t.getMonth() - b.getMonth();
    if (t.getDate() < b.getDate()) m--;
    if (m < 0) { y--; m += 12; }
    return (p["Birth Date Approximate"] === true ? "about " : "") + (y > 0 ? plural(y, "year") : plural(m, "month")) + " old";
  }
  const st = id => (D().status || {})[id] || {};
  const dueText = x => x.state === "off" ? "Not given any more" : !x.next ? "No record yet — tap Given or add the last date" : (x.state === "overdue" ? "Overdue since " : "Due ") + day(x.next);
  const thumb = p => p["Photo"] ? M.fileHtml(ctx, p["Photo"], "thumb") : '<span class="thumb">' + IC.paw + '</span>';

  async function load() {
    pt.loading = true; pt.error = "";
    try { pt.data = await C.api("pets.load"); }
    catch (err) {
      if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) { pt.loading = false; C.handleError(err); return; }
      pt.error = err.message;
    } finally { pt.loading = false; }
    if (C.parseRoute().name === "pets") C.render();
  }

  const ctx = {
    key: "pets",
    data: () => pt.data,
    applyData: d => { pt.data = d; },
    schema: t => pt.data.schema[t],
    rows: t => rows(t),
    refLabel: (t, r) => {
      switch (t) {
        case "pets": return r["Name"];
        case "places": return r["Name"] + (r["Type"] ? " · " + r["Type"] : "");
        case "treatments": return r["Treatment"];
        case "visits": return day(r["Date"]) + " · " + (pet(r["Pet ID"]) || {})["Name"] + (r["Reason"] ? " · " + r["Reason"] : "");
        case "lists": return r["Value"];
        default: return r[ctx.schema(t).fields[0].name] || "";
      }
    },
    title: (t, r) => {
      switch (t) {
        case "weights": return r["Weight"] + " lb on " + day(r["Date"]);
        case "schedules": return trtName(r["Treatment ID"]) + " · " + ((pet(r["Pet ID"]) || {})["Name"] || "");
        case "logs": return trtName(r["Treatment ID"]) + " · " + day(r["Date"]);
        case "meds": return r["Medication"];
        default: return ctx.refLabel(t, r);
      }
    },
    singular: t => ({ pets: "pet", weights: "weight", places: "place", visits: "vet visit", treatments: "treatment", schedules: "treatment", logs: "treatment given", meds: "medication", lists: "list value" }[t] || "entry"),
    formOpts: t => ({ weights: { hide: ["Pet ID"] }, schedules: {}, logs: {}, meds: {} }[t] || {}),
    onFormReady: (t, form, row) => {
      // A new treatment schedule: fill in the treatment's usual interval.
      if (t === "schedules" && !row) {
        const sel = form.querySelector('select[name="Treatment ID"]');
        if (sel) sel.addEventListener("change", () => {
          const tr = byId("treatments", sel.value);
          if (!tr) return;
          const ev = form.querySelector('[name="Every"]'), un = form.querySelector('[name="Unit"]');
          if (tr["Default Every"] !== "" && ev && !ev.value) ev.value = tr["Default Every"];
          if (tr["Default Unit"] && un) un.value = tr["Default Unit"];
        });
      }
    },
    save: async (action, payload, msg) => {
      C.busy(true);
      let res;
      try { res = await C.api(action, Object.assign({ module: "pets", reload: true }, payload)); }
      catch (err) {
        if (["AUTH", "NOT_ALLOWED", "SETUP"].indexOf(err.code) !== -1) return C.authStop(err);
        if (err.code === "FORBIDDEN") { pt.data = null; setTimeout(() => load(), 0); }
        throw err;
      } finally { C.busy(false); }
      toast((typeof msg === "function" ? msg(res) : msg) || "Saved");
      if (res && res.moduleData) pt.data = res.moduleData; else await load();
      C.state.homeStale = true;
      C.render();
      return res || true;
    },
    reload: () => load()
  };

  // ------------------------------------------------------------------
  // Vet visit form: visit details + treatments given at the visit
  // ------------------------------------------------------------------
  function visitForm(id, prefill) {
    const t = ctx.schema("visits");
    const row = id ? byId("visits", id) : null;
    const editable = row ? can("visits", "edit", row) : can("visits", "add");
    const values = Object.assign({ "Date": M.isoDay(new Date()), "Reason": "Checkup" }, prefill || {}, row || {});
    const given = row ? rows("logs").filter(l => l["Visit ID"] === id).map(l => l["Treatment ID"]) : [];
    const canLog = can("logs", "add");
    const trtBox = petId => {
      const mine = rows("schedules").filter(s => s["Pet ID"] === petId).map(s => s["Treatment ID"]);
      const list = rows("treatments").filter(x => x["Active"] !== false || given.indexOf(x["Treatment ID"]) !== -1)
        .sort((a, b) => (mine.indexOf(b["Treatment ID"]) !== -1) - (mine.indexOf(a["Treatment ID"]) !== -1) || a["Treatment"].localeCompare(b["Treatment"]));
      return list.map(x => '<label class="check"><input type="checkbox" data-trt="' + esc(x["Treatment ID"]) + '"' + (given.indexOf(x["Treatment ID"]) !== -1 ? " checked" : "") + '> ' + esc(x["Treatment"]) + '</label>').join("");
    };
    const fields = ["Pet ID", "Date", "Time", "Vet", "Reason", "Cost"].map(n => t.fields.find(f => f.name === n));
    const body = (row ? '<div class="meta rec-meta">' + esc(row["Visit ID"]) + '</div>' : "") +
      fields.map(f => M.fieldHtml(ctx, "visits", f, values[f.name], { readOnly: !editable })).join("") +
      (canLog ? '<div class="field"><label>Treatments given at this visit</label><div class="pt-trts">' + trtBox(values["Pet ID"]) + '</div><div class="hint">Ticked ones are logged on the visit date, so their next due dates move.</div></div>' : "") +
      ["Follow Up", "Follow Up Date", "Records", "Notes"].map(n => M.fieldHtml(ctx, "visits", t.fields.find(f => f.name === n), values[n], { readOnly: !editable })).join("") +
      (row && can("visits", "delete", row) ? '<div class="danger-zone"><button type="button" class="btn danger" data-pv="delete">Delete visit</button></div>' : "");
    let formEl;
    C.openSheet({
      title: row ? (editable ? "Edit vet visit" : "Vet visit") : "Add vet visit", body: body, submitLabel: row ? "Save" : "Add", noSubmit: !editable,
      onReady: (form, close) => {
        formEl = form;
        M.wireAddNew(ctx, "visits", form);
        M.wireFiles(ctx, form, row ? { table: "visits", id: id, close: close } : null);
        const petSel = form.querySelector('select[name="Pet ID"]');
        if (petSel) petSel.addEventListener("change", () => { const box = $(".pt-trts", form); if (box) box.innerHTML = trtBox(petSel.value); });
        const del = form.querySelector('[data-pv="delete"]');
        if (del) del.addEventListener("click", async () => {
          if (!(await M.confirmSheet({ title: "Delete visit?", message: "Delete this vet visit? An admin can bring it back.", submitLabel: "Delete", danger: true }))) return;
          try { await ctx.save("modDelete", { table: "visits", id: id }, "Deleted"); close(); location.hash = "#/pets/p/" + encodeURIComponent(row["Pet ID"]) + "/visits"; } catch (err) { toast(err.message, true); }
        });
      },
      onSubmit: async v => {
        const vals = {};
        ["Pet ID", "Date", "Time", "Vet", "Reason", "Cost", "Follow Up", "Follow Up Date", "Notes"].forEach(n => { if (n in v && v[n] !== "__new__") vals[n] = v[n]; });
        const trts = $$("[data-trt]", formEl).filter(c => c.checked).map(c => c.dataset.trt);
        const res = await ctx.save("pets.saveVisit", Object.assign({ visitId: id || undefined, values: vals }, canLog ? { treatments: trts } : {}), row ? "Visit saved" : "Visit added");
        if (!res) return false;
        for (const p of M.pickedFiles(formEl)) { try { await M.uploadFile(ctx, "visits", res.id, p.field, p.file); } catch (err) { toast(err.message, true); } }
        if (!row) location.hash = "#/pets/visit/" + encodeURIComponent(res.id);
        return true;
      }
    });
  }

  // ------------------------------------------------------------------
  // Screens
  // ------------------------------------------------------------------
  const tileBtn = (attrs, icon, label, info) => '<a class="home-link" ' + attrs + '><span class="home-icon">' + icon + '</span><span class="home-text"><span class="home-label">' + esc(label) + '</span>' +
    (info ? '<span class="home-info">' + esc(info) + '</span>' : "") + '</span></a>';

  // One treatment schedule as a row: name, interval, last given, next due, Given button.
  function schedRow(s, showPet) {
    const x = st(s["Schedule ID"]), p = pet(s["Pet ID"]) || {};
    const sub = [showPet ? p["Name"] : "", every(s), x.last ? "Last " + day(x.last) : ""].filter(Boolean).join(" · ");
    return '<div class="list-item pt-sched ' + esc(x.state || "") + '"><div class="body" role="button" tabindex="0" data-mod-edit="schedules" data-id="' + esc(s["Schedule ID"]) + '">' +
      '<div class="title">' + esc(trtName(s["Treatment ID"])) + '</div><div class="sub">' + esc(sub) + '</div><div class="sub pt-due">' + esc(dueText(x)) + '</div></div>' +
      (x.state === "overdue" ? '<span class="pill vh-over">Overdue</span>' : x.state === "soon" ? '<span class="pill vh-soon">Soon</span>' : "") +
      (can("logs", "add") && x.state !== "off" ? '<button class="btn pt-given" data-pt="give" data-id="' + esc(s["Schedule ID"]) + '">Given</button>' : "") + '</div>';
  }

  function viewHome() {
    const all = rows("pets"), live = all.filter(active), gone = all.filter(p => !active(p));
    const nextFor = pid => rows("schedules").filter(s => s["Pet ID"] === pid && st(s["Schedule ID"]).next).sort((a, b) => st(a["Schedule ID"]).next.localeCompare(st(b["Schedule ID"]).next))[0];
    const petRow = p => {
      const n = see("care") ? nextFor(p["Pet ID"]) : null, x = n ? st(n["Schedule ID"]) : null;
      const sub = [[p["Species"], p["Breed"]].filter(Boolean).join(" · "), age(p), n ? trtName(n["Treatment ID"]) + ": " + dueText(x) : ""].filter(Boolean).join(" · ");
      return '<a class="list-item' + (active(p) ? "" : " dim") + '" href="#/pets/p/' + encodeURIComponent(p["Pet ID"]) + '">' + thumb(p) + '<div class="body"><div class="title">' + esc(p["Name"]) + '</div><div class="sub">' + esc(sub) + '</div></div>' +
        (x && x.state === "overdue" ? '<span class="pill vh-over">Overdue</span>' : x && x.state === "soon" ? '<span class="pill vh-soon">Due soon</span>' : "") + '</a>';
    };
    const tiles = (can("visits", "add") ? tileBtn('href="#/pets" role="button" data-pt="new-visit"', IC.vet, "Vet visit", "Log a visit") : "") +
      (can("weights", "add") ? tileBtn('href="#/pets" role="button" data-pt="new-weight"', IC.scale, "Weight", "Log a weight") : "");
    let due = "";
    if (see("care")) {
      const horizon = M.isoDay(new Date(M.parseIso(today()).getTime() + (D().days || 30) * 86400000));
      const items = rows("schedules").filter(s => { const p = pet(s["Pet ID"]), x = st(s["Schedule ID"]); return p && active(p) && x.next && x.next <= horizon; })
        .sort((a, b) => st(a["Schedule ID"]).next.localeCompare(st(b["Schedule ID"]).next));
      const refills = rows("meds").filter(m => { const p = pet(m["Pet ID"]); return p && active(p) && m["Next Refill"] && m["Next Refill"] <= horizon && !(m["End Date"] && m["End Date"] < today()); });
      due = section("Due", '<div class="card list">' + (items.map(s => schedRow(s, true)).join("") +
        refills.map(m => '<div class="list-item"><span class="thumb">' + IC.pill + '</span><div class="body" role="button" tabindex="0" data-mod-edit="meds" data-id="' + esc(m["Medication ID"]) + '"><div class="title">Refill ' + esc(m["Medication"]) + '</div><div class="sub">' +
          esc([(pet(m["Pet ID"]) || {})["Name"], (m["Next Refill"] < today() ? "Overdue since " : "By ") + day(m["Next Refill"]), m["Refills Left"] !== "" ? plural(Number(m["Refills Left"]), "refill") + " left" : ""].filter(Boolean).join(" · ")) + '</div></div></div>').join("") ||
        '<div class="empty">Nothing due in the next ' + plural(D().days || 30, "day") + '.</div>') + '</div>');
    }
    const fus = see("visits") ? rows("visits").filter(v => (v["Follow Up"] || v["Follow Up Date"]) && v["Follow Up Done"] !== true && pet(v["Pet ID"]) && active(pet(v["Pet ID"])))
      .sort((a, b) => String(a["Follow Up Date"] || "9999").localeCompare(String(b["Follow Up Date"] || "9999"))) : [];
    const fuHtml = fus.length ? section("Follow-ups", '<div class="card list">' + fus.map(v => '<div class="list-item">' +
      (can("visits", "edit", v) ? '<button class="sh-check" data-pt="fu-done" data-id="' + esc(v["Visit ID"]) + '" aria-label="Mark done"></button>' : "") +
      '<a class="body" href="#/pets/visit/' + encodeURIComponent(v["Visit ID"]) + '"><div class="title">' + esc(v["Follow Up"] || "Follow up") + '</div><div class="sub">' +
      esc([(pet(v["Pet ID"]) || {})["Name"], v["Follow Up Date"] ? (v["Follow Up Date"] < today() ? "Overdue since " : "By ") + day(v["Follow Up Date"]) : ""].filter(Boolean).join(" · ")) + '</div></a></div>').join("") + '</div>') : "";
    const links = [["#/pets/places", "Places", "Vets, groomers, boarding, pet stores", "pets"], ["#/pets/treatments", "Treatments", "Flea & tick, vaccines, grooming… and their usual intervals", "care"], ["#/pets/lists", "Dropdown lists", "Species, breeds, food, reasons…", "pets"]]
      .filter(l => see(l[3])).map(l => '<a class="list-item" href="' + l[0] + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(l[1]) + '</div><div class="sub">' + esc(l[2]) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("");
    const add = can("pets", "add") ? '<button class="link-btn" data-mod-add="pets">+ Add pet</button>' : "";
    const html = (tiles ? '<div class="home-grid vh-tiles">' + tiles + '</div>' : "") +
      section("Pets", '<div class="card list">' + (live.map(petRow).join("") || '<div class="empty">No pets yet.</div>') + '</div>', add) + due + fuHtml +
      (gone.length ? section("Past pets", '<div class="card list">' + gone.map(petRow).join("") + '</div>') : "") +
      (links ? section("Lists & settings", '<div class="card list">' + links + '</div>') : "") +
      (C.isAdmin() ? '<p class="hint"><a href="#/pets/deleted">Deleted items</a></p>' : "");
    return { title: "Pets", back: true, html: html };
  }

  function tabs(pid, on) {
    const t = [["", "Details", "pets"], ["care", "Care", "care"], ["visits", "Vet visits", "visits"]].filter(x => see(x[2]));
    return t.length > 1 ? '<div class="segmented vh-tabs">' + t.map(x => '<button class="' + (x[0] === on ? "on" : "") + '" data-pt="tab" data-to="#/pets/p/' + encodeURIComponent(pid) + (x[0] ? "/" + x[0] : "") + '">' + x[1] + '</button>').join("") + '</div>' : "";
  }
  const kv = pairs => { const p = pairs.filter(x => x[1] !== "" && x[1] !== undefined && x[1] !== null); return p.length ? '<div class="card kv">' + p.map(x => '<div class="k">' + esc(x[0]) + '</div><div>' + (x[2] ? x[1] : esc(x[1])) + '</div>').join("") + '</div>' : ""; };

  function viewPet(pid, tab) {
    const p = pet(pid);
    if (!p) return { title: "Pet", back: true, html: '<div class="card"><div class="empty">That pet isn’t here any more.</div></div>' };
    if (!tab && !see("pets")) tab = see("care") ? "care" : "visits";
    const head = '<div class="card hero vh-hero">' + (p["Photo"] ? M.fileHtml(ctx, p["Photo"], "vh-photo") : "") +
      '<h2>' + esc(p["Name"]) + '</h2><div class="meta">' + esc([p["Pet ID"], [p["Species"], p["Breed"]].filter(Boolean).join(" · "), age(p), active(p) ? "" : p["Status"]].filter(Boolean).join(" · ")) + '</div></div>';
    const body = tab === "care" ? petCare(p) : tab === "visits" ? petVisits(p) : petDetails(p);
    return { title: p["Name"], back: true, html: head + tabs(pid, tab || "") + body };
  }

  function petDetails(p) {
    const pid = p["Pet ID"];
    const f = n => M.shownValue(ctx, ctx.schema("pets").fields.find(x => x.name === n), p[n]);
    const food = [p["Food Amount"] !== "" ? p["Food Amount"] + " " + (p["Food Unit"] || "") : "", p["Meals Per Day"] ? "× " + p["Meals Per Day"] + " a day" : "", p["Food Brand"]].filter(Boolean).join(" ");
    const ws = rows("weights").filter(w => w["Pet ID"] === pid).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])));
    const wHtml = '<div class="card list">' + (ws.slice(0, 8).map((w, i) => {
      const prev = ws[i + 1], diff = prev ? Math.round((Number(w["Weight"]) - Number(prev["Weight"])) * 10) / 10 : null;
      return '<div class="list-item" role="button" tabindex="0" data-mod-edit="weights" data-id="' + esc(w["Weight ID"]) + '"><div class="body"><div class="title">' + esc(w["Weight"] + " lb") +
        (diff ? ' <span class="pt-diff">' + esc((diff > 0 ? "+" : "") + diff + " lb") + '</span>' : "") + '</div><div class="sub">' + esc([day(w["Date"]), w["Notes"]].filter(Boolean).join(" · ")) + '</div></div></div>';
    }).join("") || '<div class="empty">No weights yet.</div>') + '</div>';
    return (can("pets", "edit", p) ? '<div class="actions" style="margin:0 0 4px"><button class="btn" data-mod-edit="pets" data-id="' + esc(pid) + '">Edit details</button></div>' : "") +
      section("Basics", kv([["Sex", [p["Sex"], p["Fixed"] === true ? (p["Sex"] === "Female" ? "spayed" : "neutered") : ""].filter(Boolean).join(", ")], ["Born", f("Birth Date") + (p["Birth Date Approximate"] === true && p["Birth Date"] ? " (approx.)" : "")],
        ["Adopted", f("Adoption Date")], ["Color / markings", p["Color"]], ["Microchip", p["Microchip"]], ["Primary person", p["Primary Person"] ? M.userName(ctx, p["Primary Person"]) : ""], ["Status", p["Status"]]]) || '<div class="card"><div class="empty">No details yet.</div></div>') +
      (food ? section("Food", kv([["Each meal", food]])) : "") +
      ((p["License Number"] || p["License Expires"] || p["Insurance Company"]) ? section("License & insurance", kv([["County license", p["License Number"]], ["License expires", f("License Expires")], ["Insurance", [p["Insurance Company"], p["Insurance Policy"]].filter(Boolean).join(", ")]])) : "") +
      section("Weight", wHtml, can("weights", "add") ? '<button class="link-btn" data-pt="add-weight" data-id="' + esc(pid) + '">+ Add</button>' : "") +
      (p["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(p["Notes"]) + '</div></div>') : "");
  }

  function petCare(p) {
    const pid = p["Pet ID"];
    const ss = rows("schedules").filter(s => s["Pet ID"] === pid).sort((a, b) => ((st(a["Schedule ID"]).state === "off") - (st(b["Schedule ID"]).state === "off")) || String(st(a["Schedule ID"]).next || "9999").localeCompare(String(st(b["Schedule ID"]).next || "9999")));
    const logs = rows("logs").filter(l => l["Pet ID"] === pid).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])));
    const shown = pt.allLog[pid] ? logs : logs.slice(0, 10);
    const meds = rows("meds").filter(m => m["Pet ID"] === pid).sort((a, b) => ((a["End Date"] && a["End Date"] < today()) - (b["End Date"] && b["End Date"] < today())) || String(a["Medication"]).localeCompare(String(b["Medication"])));
    const medRow = m => {
      const ended = m["End Date"] && m["End Date"] < today();
      return '<div class="list-item' + (ended ? " dim" : "") + '" role="button" tabindex="0" data-mod-edit="meds" data-id="' + esc(m["Medication ID"]) + '"><span class="thumb">' + IC.pill + '</span><div class="body"><div class="title">' + esc(m["Medication"]) + (m["Dose"] ? ' <span class="vh-every">' + esc(m["Dose"]) + '</span>' : "") + '</div>' +
        '<div class="sub">' + esc([m["Frequency"], m["Start Date"] ? "since " + day(m["Start Date"]) : "", ended ? "ended " + day(m["End Date"]) : m["End Date"] ? "until " + day(m["End Date"]) : ""].filter(Boolean).join(" · ")) + '</div>' +
        (m["Next Refill"] || m["Refills Left"] !== "" ? '<div class="sub">' + esc([m["Next Refill"] ? "Refill by " + day(m["Next Refill"]) : "", m["Refills Left"] !== "" ? plural(Number(m["Refills Left"]), "refill") + " left" : ""].filter(Boolean).join(" · ")) + '</div>' : "") + '</div></div>';
    };
    return section("Treatments", '<div class="card list">' + (ss.map(s => schedRow(s, false)).join("") || '<div class="empty">No treatments set for ' + esc(p["Name"]) + ' yet.</div>') + '</div>',
        can("schedules", "add") ? '<button class="link-btn" data-pt="add-sched" data-id="' + esc(pid) + '">+ Add</button>' : "") +
      section("Treatment log", '<div class="card list">' + (shown.map(l => '<div class="list-item" role="button" tabindex="0" data-mod-edit="logs" data-id="' + esc(l["Log ID"]) + '"><span class="thumb">' + IC.syringe + '</span><div class="body"><div class="title">' + esc(trtName(l["Treatment ID"])) + '</div>' +
        '<div class="sub">' + esc([day(l["Date"]), l["Given By"] ? M.userName(ctx, l["Given By"]) : "", l["Visit ID"] ? "at vet visit" : "", l["Notes"]].filter(Boolean).join(" · ")) + '</div></div>' + (l["Cost"] !== "" ? '<div class="vh-cost">' + esc(M.money(l["Cost"])) + '</div>' : "") + '</div>').join("") ||
        '<div class="empty">Nothing logged yet.</div>') + '</div>' + (logs.length > shown.length ? '<button class="link-btn" data-pt="all-log" data-id="' + esc(pid) + '">Show all ' + logs.length + '</button>' : ""),
        can("logs", "add") ? '<button class="link-btn" data-pt="add-log" data-id="' + esc(pid) + '">+ Log</button>' : "") +
      section("Medications", '<div class="card list">' + (meds.map(medRow).join("") || '<div class="empty">No medications.</div>') + '</div>',
        can("meds", "add") ? '<button class="link-btn" data-pt="add-med" data-id="' + esc(pid) + '">+ Add</button>' : "");
  }

  function petVisits(p) {
    const vs = rows("visits").filter(v => v["Pet ID"] === p["Pet ID"]).sort((a, b) => String(b["Date"]).localeCompare(String(a["Date"])));
    return (can("visits", "add") ? '<div class="actions" style="margin:0 0 4px"><button class="btn primary" data-pt="add-visit" data-id="' + esc(p["Pet ID"]) + '">' + ICONS.plus + 'Vet visit</button></div>' : "") +
      '<div class="card list">' + (vs.map(v => '<a class="list-item" href="#/pets/visit/' + encodeURIComponent(v["Visit ID"]) + '"><span class="thumb">' + IC.vet + '</span><div class="body"><div class="title">' + esc(day(v["Date"]) + " · " + (v["Reason"] || "Visit")) + '</div>' +
        '<div class="sub">' + esc([placeName(v["Vet"]), v["Cost"] !== "" ? M.money(v["Cost"]) : "", v["Follow Up"] && v["Follow Up Done"] !== true ? "Follow-up open" : ""].filter(Boolean).join(" · ")) + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") ||
        '<div class="empty">No vet visits yet.</div>') + '</div>';
  }

  function viewVisit(id) {
    const v = byId("visits", id);
    if (!v) return { title: "Vet visit", back: true, html: '<div class="card"><div class="empty">That visit isn’t here any more.</div></div>' };
    const p = pet(v["Pet ID"]) || {};
    const place = byId("places", v["Vet"]);
    const trts = rows("logs").filter(l => l["Visit ID"] === id).map(l => trtName(l["Treatment ID"])).filter(Boolean);
    const html = '<div class="card hero"><h2>' + esc(day(v["Date"])) + '</h2><div class="meta">' + esc([v["Visit ID"], p["Name"], v["Reason"], v["Time"] ? M.fmtTime("T" + v["Time"]) : ""].filter(Boolean).join(" · ")) + '</div>' +
      (can("visits", "edit", v) ? '<div class="actions"><button class="btn" data-pt="edit-visit" data-id="' + esc(id) + '">Edit</button></div>' : "") + '</div>' +
      kv([["Vet", place ? place["Name"] : ""], ["Phone", place && place["Phone"] ? M.phoneLink(place["Phone"]) : "", true], ["Cost", v["Cost"] !== "" ? M.money(v["Cost"]) : ""], ["Treatments given", trts.join(", ")],
        ["Follow-up", v["Follow Up"] || v["Follow Up Date"] ? [v["Follow Up"], v["Follow Up Date"] ? "by " + day(v["Follow Up Date"]) : "", v["Follow Up Done"] === true ? "(done)" : ""].filter(Boolean).join(" ") : ""]]) +
      (v["Records"] ? section("Records", '<div class="card vh-file">' + M.fileHtml(ctx, v["Records"], "vh-receipt") + '</div>') : "") +
      (v["Notes"] ? section("Notes", '<div class="card"><div class="vh-notes">' + esc(v["Notes"]) + '</div></div>') : "");
    return { title: "Vet visit", back: true, html: html };
  }

  function viewLists() {
    const names = ["Species", "Breed", "Status", "Place Type", "Visit Reason", "Food Brand", "Food Unit", "Med Frequency"];
    return { title: "Dropdown lists", back: true, html: '<div class="card list">' + names.map(n => '<a class="list-item" href="#/pets/list/' + encodeURIComponent(n) + '"><span class="thumb">' + IC.tag + '</span><div class="body"><div class="title">' + esc(n) + '</div>' +
      '<div class="sub">' + esc(listVals(n).join(", ") || "Empty") + '</div></div><span class="thumb">' + ICONS.next + '</span></a>').join("") + '</div>' };
  }

  function view(args) {
    M.current = ctx;
    if (pt.error) return { title: "Pets", back: true, html: '<div class="card"><div class="empty">' + esc(pt.error) + '</div></div><div class="actions"><button class="btn" data-pt="retry">Try again</button></div>' };
    if (!pt.data) {
      if (!pt.loading) load();
      return { title: "Pets", back: true, html: '<div class="card"><div class="empty"><div class="spinner"></div></div></div>' };
    }
    switch (args[0] || "") {
      case "p": return viewPet(args[1], args[2] || "");
      case "visit": return viewVisit(args[1]);
      case "places": return M.listView(ctx, { table: "places", title: "Places", label: r => r["Name"], subHtml: r => [esc(r["Type"] || ""), r["Phone"] ? M.phoneLink(r["Phone"]) : "", esc(r["Address"] || "")].filter(Boolean).join(" · ") });
      case "treatments": return M.listView(ctx, { table: "treatments", title: "Treatments", label: r => r["Treatment"], sub: r => [r["Kind"], r["Default Every"] ? "usually every " + r["Default Every"] + " " + String(r["Default Unit"] || "").toLowerCase() : ""].filter(Boolean).join(" · ") });
      case "lists": return viewLists();
      case "list": return M.listView(ctx, { table: "lists", list: args[1], title: args[1] });
      case "deleted": return M.deletedView(ctx);
      default: return viewHome();
    }
  }
  C.registerModule("pets", view, () => { pt.data = null; pt.loading = false; M.clearDeleted("pets"); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  const firstPet = () => (rows("pets").filter(active)[0] || {})["Pet ID"] || "";
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-act='refresh']") && C.parseRoute().name === "pets") { pt.data = null; M.clearDeleted("pets"); }
    const el = e.target.closest("[data-pt]");
    if (!el || el.tagName === "INPUT" || C.parseRoute().name !== "pets") return;
    const d = el.dataset;
    switch (d.pt) {
      case "retry": pt.error = ""; C.render(); break;
      case "tab": location.replace(d.to); break;
      case "new-visit": e.preventDefault(); visitForm("", { "Pet ID": firstPet() }); break;
      case "new-weight": e.preventDefault(); M.recordForm(ctx, "weights", "", { prefill: { "Pet ID": firstPet(), "Date": M.isoDay(new Date()) }, title: "Log a weight" }); break;
      case "add-visit": visitForm("", { "Pet ID": d.id }); break;
      case "edit-visit": visitForm(d.id); break;
      case "add-weight": M.recordForm(ctx, "weights", "", { prefill: { "Pet ID": d.id, "Date": M.isoDay(new Date()) }, hide: ["Pet ID"], title: "Log a weight" }); break;
      case "add-sched": M.recordForm(ctx, "schedules", "", { prefill: { "Pet ID": d.id }, hide: ["Pet ID"], title: "Add treatment · " + ((pet(d.id) || {})["Name"] || "") }); break;
      case "add-log": M.recordForm(ctx, "logs", "", { prefill: { "Pet ID": d.id, "Date": M.isoDay(new Date()), "Given By": C.state.me.id }, hide: ["Pet ID"], title: "Log a treatment · " + ((pet(d.id) || {})["Name"] || "") }); break;
      case "add-med": M.recordForm(ctx, "meds", "", { prefill: { "Pet ID": d.id, "Start Date": M.isoDay(new Date()) }, hide: ["Pet ID"], title: "Add medication · " + ((pet(d.id) || {})["Name"] || "") }); break;
      case "all-log": pt.allLog[d.id] = true; C.render(); break;
      case "give":
        el.disabled = true;
        try { await ctx.save("pets.give", { scheduleId: d.id }, "Logged as given today"); } catch (err) { el.disabled = false; toast(err.message, true); }
        break;
      case "fu-done":
        try { await ctx.save("pets.followUp", { id: d.id, done: true }, "Follow-up done"); } catch (err) { toast(err.message, true); }
        break;
    }
  });
})();
