// =========================================================
// AYERS HOUSEHOLD - SHOPPING LIST MODULE
// =========================================================
// Data lives in the "Ayers Household - Shopping List" spreadsheet.
// One list for the whole household, filtered by store in the app.
//
//   Items   one row per thing to buy. Checking it off sets Status = Bought
//           (with who and when) so it leaves the list but still counts for
//           "Buy again" (most often bought first).
//   Lists   the Store and Category dropdowns.
//
// No areas: everyone's access is their Shopping List role on Permissions.
// Data Entry can add, check off anyone's items, and change or delete their own.
// Run shoppingSetup() once from the script editor.
// =========================================================

const SHOPPING_SPREADSHEET_ID = "1LxqfRoLc0UDmFC9UGD_E1IMOdYHe0nvZFDN4bzaWpoQ";

const SHOPPING_SEED = {
   stores: ["Any store", "Amazon", "Costco", "Grocery Store", "Target"],
   categories: ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Snacks", "Drinks",
                "Household", "Personal Care", "Pets", "Other"]
};

function shoppingDef_() {
   return {
      key: "shopping",
      name: "Shopping List",
      areas: ["list"],
      tables: {
         items: { tab: "Items", label: "Items", id: "Item ID", prefix: "ITM-", kind: "record", area: "list",
            title: r => r["Item"],
            fields: [
               { name: "Item", type: "text", required: true },
               { name: "Quantity", type: "number" },
               { name: "Unit", type: "text", hint: "e.g. lb, boxes, bags" },
               { name: "Store", type: "list", list: "Store" },
               { name: "Category", type: "list", list: "Category" },
               { name: "Urgent", type: "bool", hint: "Need it soon: shows at the top of the list" },
               { name: "Notes", type: "longtext", hint: "Brand, size, flavor..." },
               { name: "Status", type: "text", readOnly: true },
               { name: "Bought By", type: "user", readOnly: true },
               { name: "Bought At", type: "datetime", readOnly: true }
            ] },
         lists: { tab: "Lists", label: "Dropdown Lists", id: "List Value ID", prefix: "LST-", kind: "list", area: "list",
            unique: ["List", "Value"], title: r => r["List"] + ": " + r["Value"],
            fields: [
               { name: "List", type: "text", required: true },
               { name: "Value", type: "text", required: true },
               { name: "Sort", type: "number" }
            ] }
      },
      lists: ["Store", "Category"],
      beforeSave: shoppingBeforeSave_,
      home: shoppingHome_,
      actions: {
         load:    { fn: shoppingLoad_ },
         check:   { fn: shoppingCheck_, write: true },
         uncheck: { fn: shoppingUncheck_, write: true }
      }
   };
}

const shoppingKey_ = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const shoppingAnyStore_ = s => !String(s || "").trim() || shoppingKey_(s) === "any store";

// New items start as Needed. Adding something already on the list asks first:
// req.duplicate = "merge" adds the quantity to the one on the list, "separate" adds a second line.
function shoppingBeforeSave_(tableKey, values, before, user, req) {
   if (tableKey !== "items") return values;
   if (!before) {
      values["Status"] = "Needed";
      const def = shoppingDef_();
      const same = modRows_(def, "items").find(r => r["Status"] !== "Bought" && shoppingKey_(r["Item"]) === shoppingKey_(values["Item"]) &&
         (shoppingAnyStore_(r["Store"]) || shoppingAnyStore_(values["Store"]) || shoppingKey_(r["Store"]) === shoppingKey_(values["Store"])));
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

// Everything the list screens need: what's on the list, what was bought before, the dropdowns.
function shoppingLoad_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "view")) throw coreError_("FORBIDDEN", "You don't have access to the Shopping List.");
   modPrefetch_(def);
   const all = modRows_(def, "items");
   const items = all.filter(r => r["Status"] !== "Bought");
   const onList = {};
   items.forEach(r => onList[shoppingKey_(r["Item"])] = true);
   // Buy again: one entry per item name, most often bought first, with what was used last time.
   const seen = {};
   all.filter(r => r["Status"] === "Bought").forEach(r => {
      const k = shoppingKey_(r["Item"]);
      if (!k) return;
      const at = String(r["Bought At"] || r["Added At"] || "");
      const e = seen[k] || (seen[k] = { item: r["Item"], count: 0, lastAt: "" });
      e.count++;
      if (at >= e.lastAt) {
         e.lastAt = at; e.item = r["Item"];
         e.quantity = r["Quantity"]; e.unit = r["Unit"] || ""; e.store = r["Store"] || ""; e.category = r["Category"] || "";
      }
   });
   const buyAgain = Object.keys(seen).map(k => Object.assign({ onList: !!onList[k] }, seen[k]))
      .sort((a, b) => b.count - a.count || String(b.lastAt).localeCompare(String(a.lastAt))).slice(0, 200);
   return {
      items: items, buyAgain: buyAgain, lists: modRows_(def, "lists"),
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
   if (row["Status"] === "Bought") return { already: true };
   modChange_(def, "items", row, { "Status": "Bought", "Bought By": user.id, "Bought At": new Date() }, user, "Bought");
   return { checked: true };
}

// req: { id } -> puts a checked-off item back on the list (the Undo button).
function shoppingUncheck_(req, user) {
   const def = shoppingDef_();
   if (!coreCan_(user, "shopping", "list", "add")) throw coreError_("FORBIDDEN", "You don't have access to change the list.");
   const row = modFind_(def, "items", req.id);
   if (row["Status"] !== "Bought") return { already: true };
   modChange_(def, "items", row, { "Status": "Needed", "Bought By": "", "Bought At": "" }, user, "Undo bought");
   return { unchecked: true };
}

// Home tile: "12 items · 3 urgent".
function shoppingHome_(user) {
   const out = { dueSoon: [] };
   if (!coreCan_(user, "shopping", "list", "view")) return out;
   const def = shoppingDef_();
   modPrefetch_(def);
   const items = modRows_(def, "items").filter(r => r["Status"] !== "Bought");
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
   modSeed_(def, "lists", lists, owner);
   const ss = modSs_("shopping");
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   SpreadsheetApp.flush();
   console.log("Shopping List setup done: " + ss.getSheets().map(s => s.getName()).join(", "));
   return "Shopping List setup done";
}
