// =========================================================
// AYERS HOUSEHOLD - SHOPPING LIST MODULE
// =========================================================
// Data lives in the "Ayers Household - Shopping List" spreadsheet.
// One list for the whole household, filtered by store in the app.
//
//   Items   one row per thing to buy. Checking it off sets Status = Checked
//           (grayed out on the list); leaving the list removes checked items
//           for good after a confirmation. No history is kept.
//   Lists   the Store, Category and Unit dropdowns (admins and editors change them).
//
// No areas: everyone's access is their Shopping List role on Permissions.
// Data Entry can add, check off anyone's items, and change or delete their own.
// Run shoppingSetup() once from the script editor.
// =========================================================

const SHOPPING_SPREADSHEET_ID = "1LxqfRoLc0UDmFC9UGD_E1IMOdYHe0nvZFDN4bzaWpoQ";

const SHOPPING_SEED = {
   stores: ["Any store", "Amazon", "Costco", "Grocery Store", "Target"],
   categories: ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Snacks", "Drinks",
                "Household", "Personal Care", "Pets", "Other"],
   units: ["each", "lb", "oz", "gal", "qt", "dozen", "bunch", "bag", "box", "pack", "bottle", "can", "jar", "case"]
};

function shoppingDef_() {
   return {
      key: "shopping",
      name: "Shopping List",
      areas: ["list"],
      tables: {
         items: { tab: "Items", label: "Items", id: "Item ID", prefix: "ITM-", kind: "record", area: "list", hardDelete: true,
            title: r => r["Item"],
            fields: [
               { name: "Item", type: "text", required: true },
               { name: "Quantity", type: "number" },
               { name: "Unit", type: "list", list: "Unit" },
               { name: "Store", type: "list", list: "Store" },
               { name: "Category", type: "list", list: "Category" },
               { name: "Urgent", type: "bool", hint: "Need it soon: shows at the top of the list" },
               { name: "Notes", type: "longtext", hint: "Brand, size, flavor..." },
               { name: "Status", type: "text", readOnly: true }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "list",
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Store", "Category", "Unit"],
      quietLog: true,   // item changes don't go to the Change Log (keeps saves quick)
      beforeSave: shoppingBeforeSave_,
      home: shoppingHome_,
      actions: {
         load:         { fn: shoppingLoad_ },
         check:        { fn: shoppingCheck_, write: true },
         uncheck:      { fn: shoppingUncheck_, write: true },
         clearChecked: { fn: shoppingClearChecked_, write: true },
         addMany:      { fn: shoppingAddMany_, write: true }
      }
   };
}

const shoppingKey_ = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const shoppingAnyStore_ = s => !String(s || "").trim() || shoppingKey_(s) === "any store";
const shoppingSameStore_ = (a, b) => shoppingAnyStore_(a) || shoppingAnyStore_(b) || shoppingKey_(a) === shoppingKey_(b);
const shoppingNeeded_ = r => r["Status"] !== "Checked";

// New items start as Needed. Adding something already on the list asks first:
// req.duplicate = "merge" adds the quantity to the one on the list, "separate" adds a second line.
function shoppingBeforeSave_(tableKey, values, before, user, req) {
   if (tableKey !== "items") return values;
   if (!before) {
      values["Status"] = "Needed";
      const def = shoppingDef_();
      const same = modRows_(def, "items").find(r => shoppingNeeded_(r) && shoppingKey_(r["Item"]) === shoppingKey_(values["Item"]) &&
         shoppingSameStore_(r["Store"], values["Store"]));
      if (same && req.duplicate !== "separate") {
         if (req.duplicate === "merge") {
            const add = Number(values["Quantity"]) || 1;
            const qty = (Number(same["Quantity"]) || 1) + add;
            const change = { "Quantity": qty };
            if (values["Urgent"] === true && same["Urgent"] !== true) change["Urgent"] = true;
            modChange_(def, "items", same, change, user, "Add to quantity");
            return { __result: { id: same["Item ID"], merged: true, quantity: qty } };
         }
         throw coreError_("CONFIRM", same["Item"] + " is already on the list.", {
            confirm: { kind: "duplicate", id: same["Item ID"], item: same["Item"], quantity: same["Quantity"], unit: same["Unit"] || "",
                       store: same["Store"] || "", addedBy: same["Added By"] }
         });
      }
   }
   return values;
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------

// Everything the list screens need: every item (checked ones gray out) and the dropdowns.
function shoppingLoad_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "view")) throw coreError_("FORBIDDEN", "You don't have access to the Shopping List.");
   modPrefetch_(def);
   return {
      items: modRows_(def, "items"), lists: modRows_(def, "lists"),
      schema: modSchema_(def), caps: modCaps_(def, user),
      users: coreGetUsers_().map(u => ({ id: u.id, name: u.name })),
      refreshed: Utilities.formatDate(new Date(), coreTz_(), "yyyy-MM-dd'T'HH:mm:ss")
   };
}

// req: { id } -> checks an item off (anyone who can add items can check off anyone's).
function shoppingCheck_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "add")) throw coreError_("FORBIDDEN", "You don't have access to check items off.");
   const row = modFind_(def, "items", req.id);
   if (row["Status"] === "Checked") return { already: true };
   modChange_(def, "items", row, { "Status": "Checked" }, user, "Check off");
   return { checked: true };
}

// req: { id } -> unchecks an item (tapping a grayed-out item again).
function shoppingUncheck_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "add")) throw coreError_("FORBIDDEN", "You don't have access to change the list.");
   const row = modFind_(def, "items", req.id);
   if (row["Status"] !== "Checked") return { already: true };
   modChange_(def, "items", row, { "Status": "Needed" }, user, "Uncheck");
   return { unchecked: true };
}

// req: { ids } -> removes checked items for good (asked when leaving the list). Only rows still
// checked are removed, so an item someone unchecked meanwhile stays.
function shoppingClearChecked_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "add")) throw coreError_("FORBIDDEN", "You don't have access to change the list.");
   const want = {};
   (req.ids || []).forEach(id => want[id] = true);
   const rows = modRows_(def, "items").filter(r => r["Status"] === "Checked" && (!req.ids || want[r["Item ID"]]))
      .sort((a, b) => b._row - a._row);   // bottom up, so row numbers stay right
   rows.forEach(r => modRemoveRow_(def, "items", r));
   return { removed: rows.length };
}

// req: { items: [{ item, quantity, urgent }], store, category, urgent } -> one item per row
// (urgent on a line marks that item; urgent on the request marks them all)
// (or lines: "Milk\nEggs" for one per line). Items already on the list (same name and store)
// are skipped and named in the reply.
function shoppingAddMany_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "add")) throw coreError_("FORBIDDEN", "You don't have access to add items.");
   const pick = (list, v) => {
      if (!String(v || "").trim()) return "";
      const m = modListValues_(def, list).find(x => x.active && x.value.toLowerCase() === String(v).trim().toLowerCase());
      if (!m) throw coreError_("INVALID", "“" + v + "” isn't on the " + list + " list.");
      return m.value;
   };
   const store = pick("Store", req.store), category = pick("Category", req.category);
   const given = Array.isArray(req.items) ? req.items.map(x => ({ item: x && x.item, quantity: x && x.quantity, urgent: !!(x && x.urgent === true) }))
      : String(req.lines || "").split(/\r?\n/).map(x => ({ item: x }));
   const seen = {}, wanted = [];
   given.forEach(x => {
      const n = String(x.item || "").replace(/\s+/g, " ").trim();
      if (!n || seen[shoppingKey_(n)]) return;
      let q = "";
      if (x.quantity !== undefined && x.quantity !== null && String(x.quantity).trim() !== "") {
         q = Number(String(x.quantity).trim());
         if (isNaN(q) || q < 0) throw coreError_("INVALID", "Quantity for " + n + " must be a number.");
      }
      seen[shoppingKey_(n)] = true;
      wanted.push({ name: n, qty: q, urgent: x.urgent === true });
   });
   const names = wanted.map(w => w.name);
   if (!names.length) throw coreError_("INVALID", "Type at least one item.");
   if (names.length > 100) throw coreError_("INVALID", "That's more than 100 items. Add them in smaller batches.");
   const onList = modRows_(def, "items").filter(shoppingNeeded_);
   const skipped = [], rows = [];
   wanted.forEach(w => {
      const n = w.name;
      if (onList.some(r => shoppingKey_(r["Item"]) === shoppingKey_(n) && shoppingSameStore_(r["Store"], store))) { skipped.push(n); return; }
      rows.push({ "Item": n, "Quantity": w.qty, "Store": store, "Category": category, "Urgent": req.urgent === true || w.urgent, "Status": "Needed" });
   });
   const ids = modBulkInsert_(def, "items", rows, user);
   return { added: ids.length, skipped: skipped };
}

// Home tile: "12 items · 3 urgent".
function shoppingHome_(user) {
   const out = { dueSoon: [] };
   if (!coreCan_(user, "shopping", "list", "view")) return out;
   const def = shoppingDef_();
   modPrefetch_(def);
   const items = modRows_(def, "items").filter(shoppingNeeded_);
   const urgent = items.filter(r => r["Urgent"] === true).length;
   out.summary = items.length ? items.length + (items.length === 1 ? " item" : " items") + (urgent ? " · " + urgent + " urgent" : "") : "List is empty";
   return out;
}

// ------------------------------------------------------------
// Setup (run once from the script editor): links the spreadsheet on the Modules tab,
// turns the module on, builds the tabs and fills the dropdowns.
// ------------------------------------------------------------
function shoppingSetup() {
   const core = coreSheet_(CORE_CONFIG.tabs.modules);
   const mods = coreTable_(CORE_CONFIG.tabs.modules);
   const row = mods.rows.find(r => r["Module Key"] === "shopping");
   if (!row) throw new Error("There's no shopping row on the Modules tab.");
   const hm = coreHeaderMap_(core).map;
   if (!String(row["Spreadsheet ID"] || "").trim()) core.getRange(row._row, hm["spreadsheet id"]).setValue(SHOPPING_SPREADSHEET_ID);
   if (String(row["Status"] || "").trim() !== "Active") core.getRange(row._row, hm["status"]).setValue("Active");
   CORE_GRID = {}; MOD_SS = {};
   const def = shoppingDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.admin) || { id: "USR-1" };
   const lists = [];
   SHOPPING_SEED.stores.forEach(v => lists.push({ "List": "Store", "Value": v, "Sort": v === "Any store" ? 0 : "" }));
   SHOPPING_SEED.categories.forEach((v, i) => lists.push({ "List": "Category", "Value": v, "Sort": i + 1 }));
   SHOPPING_SEED.units.forEach(v => lists.push({ "List": "Unit", "Value": v, "Sort": "" }));
   modSeed_(def, "lists", lists, owner);
   const ss = modSs_("shopping");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   SpreadsheetApp.flush();
   console.log("Shopping List setup done: " + ss.getSheets().map(s => s.getName()).join(", "));
   return "Shopping List setup done";
}

// One-time update to the answers of 11/23 (safe to run again): adds the Unit dropdown values
// and gives Jasper (USR-3) Data Entry on the Shopping List.
function shoppingUpgrade() {
   CORE_GRID = {}; MOD_ROWS = {};
   const def = shoppingDef_();
   modBuildTabs_(def);
   const owner = coreGetUsers_(true).find(u => u.id === "USR-1") || coreGetUsers_(true).find(u => u.admin);
   const have = modRows_(def, "lists", true).filter(r => r["List"] === "Unit").map(r => shoppingKey_(r["Value"]));
   const units = SHOPPING_SEED.units.filter(v => have.indexOf(shoppingKey_(v)) === -1).map(v => ({ "List": "Unit", "Value": v, "Sort": "" }));
   if (units.length) modBulkInsert_(def, "lists", units, owner);
   const out = ["Units added: " + units.length];
   if (!coreGetPerms_().some(p => p.userId === "USR-3" && p.module === "shopping" && !p.area)) {
      coreAppendRow_(coreSheet_(CORE_CONFIG.tabs.perms), { "User ID": "USR-3", "Module Key": "shopping", "Area Key": "", "Role": "Data Entry" });
      CORE_PERMS = null;
      coreLog_(owner, "core", "Permissions", "Jasper Ayers", "Shopping List", "Role: Data Entry", true);
      out.push("Jasper: Shopping List Data Entry");
   } else out.push("Jasper already has a Shopping List role");
   coreFlushLog_();
   SpreadsheetApp.flush();
   console.log(out.join(" | "));
   return out.join(" | ");
}
