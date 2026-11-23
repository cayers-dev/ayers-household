// ============================================================
// AYERS HOUSEHOLD - ONE-TIME SETUP
//
// Run coreSetup() once from the script editor (Run ▸ coreSetup).
// It builds the Core tabs and fills in the starting users, modules,
// areas and permissions. Running it again only adds what's missing;
// it never overwrites anything already on a tab.
// ============================================================

// Drive folders made for each module (folder "Ayers Household" in My Drive).
const SETUP_FOLDERS = {
   root:      "10MJ42qIdBfE0eIgtMRVlKYCr3191iQEM",
   vehicles:  "1VfQ92QSvW9lMUA87UiEFkKA6XB-nyscu",
   hockey:    "1IZyTQw7NljLOibrzaeZVLlZ4J4uElNCe",
   inventory: "1N4DjPAy4JJrjWdnm9r2lxQ1SIY2PC6UG",
   financial: "1RZLAGHAOwr965pX9vIjQ2v5LJ3P7ZvCn",
   tasks:     "1tmHwPxBTSYRjaBIIWyIc7LCVhsexeuXA",
   work:      "14srhVGKMT1tc3mIk78wO7nBoG2NP1Dyo",
   home:      "11qzJouU4gxRZFfOLdlkBeDjgG5j07bq3",
   shopping:  "1wPflQTXhUR-DXWzZUlNDV55H67fwqnGz",
   receipts:  "1T5STkz2xLsgrxvMBRHwgDDz_4bwC8N5Y"
};

const SETUP_USERS = [
   // User ID, Email, Name, Admin, Active, Due Soon Days, Added, Notes
   ["USR-1", "cayers1.ca@gmail.com",      "Chris Ayers",    true,  true, "", "", "Owner"],
   ["USR-2", "cmasbaby0706@gmail.com",    "Brittany Ayers", false, true, "", "", ""],
   ["USR-3", "jasper.ayers15@gmail.com",  "Jasper Ayers",   false, true, "", "", "Travel Hockey player"],
   ["USR-4", "connor.ayers831@gmail.com", "Connor Ayers",   false, true, "", "", ""],
   ["USR-5", "toby@gmail.com",            "Toby Ayers",     false, true, "", "", "Check this email address"]
];

const SETUP_MODULES = [
   // Module Key, Module Name, Status, Sort, Description, Spreadsheet ID, Folder ID
   ["vehicles",  "Vehicles",                    "Coming soon", 10, "Vehicles, service and maintenance, intervals, insurance and registration.", "", SETUP_FOLDERS.vehicles],
   ["hockey",    "Travel Hockey",               "Coming soon", 20, "Seasons, chore earnings, weekly totals and consequences, expenses, schedule and venues.", "", SETUP_FOLDERS.hockey],
   ["inventory", "Inventory",                   "Coming soon", 30, "Household items with purchase, warranty and repair history.", "", SETUP_FOLDERS.inventory],
   ["financial", "Financial",                   "Coming soon", 40, "Bills, income, loans, accounts and plan / save for.", "", SETUP_FOLDERS.financial],
   ["tasks",     "Tasks",                       "Coming soon", 50, "Personal task lists with Google Tasks sync.", "", SETUP_FOLDERS.tasks],
   ["work",      "Work",                        "Coming soon", 60, "Comp / OT tracker and monthly timesheet.", "", SETUP_FOLDERS.work],
   ["home",      "Home Maintenance & Projects", "Coming soon", 70, "Projects, quotes, invoices, receipts, contacts and recurring maintenance.", "", SETUP_FOLDERS.home],
   ["shopping",  "Shopping List",               "Coming soon", 80, "One shared list, filtered by store.", "", SETUP_FOLDERS.shopping]
];

const SETUP_AREAS = [
   // Module Key, Area Key, Area Name, Sort, Description
   ["vehicles",  "vehicles",  "Vehicles",                     10, "Vehicle details, features and plate history"],
   ["vehicles",  "service",   "Service & Maintenance",        20, "Service visits, intervals and odometer entries"],
   ["vehicles",  "insurance", "Insurance & Registration",     30, "Insurance cards and registration renewals"],
   ["hockey",    "earnings",  "Earnings & Chore Schedule",    10, "Logging chores and the monthly chore plan"],
   ["hockey",    "totals",    "Weekly Totals & Consequences", 20, "Required vs earned each week, consequence level"],
   ["hockey",    "expenses",  "Expenses",                     30, "Season expenses and receipts"],
   ["hockey",    "schedule",  "Schedule & Venues",            40, "Practices, games, tournaments and venue details"],
   ["hockey",    "seasons",   "Seasons & Settings",           50, "Season dates, share percentage and lists"],
   ["inventory", "items",     "Items",                        10, "Items, purchase and warranty details"],
   ["inventory", "repairs",   "Repairs & Service",            20, "Repair and service history"],
   ["financial", "bills",     "Bills",                        10, "Recurring bills and payments"],
   ["financial", "income",    "Income",                       20, "Income sources and pay schedule"],
   ["financial", "loans",     "Loans",                        30, "Loan balances and payoff"],
   ["financial", "accounts",  "Accounts",                     40, "Institutions, nicknames and last 4 digits"],
   ["financial", "plans",     "Plan / Save For",              50, "Savings goals and comparisons"],
   ["home",      "projects",  "Projects",                     10, "Projects, quotes, invoices and receipts"],
   ["home",      "maintenance", "Recurring Maintenance",      20, "Maintenance items and intervals"],
   ["home",      "contacts",  "Contacts",                     30, "Contractors and vendors"]
];

// Starting permissions. No row = No Access. Admins (Chris) need none.
// Work is Chris only. Financial starts at No Access for the kids: change it on the
// Permissions screen if they should see it.
const SETUP_PERMS = (function () {
   const rows = [];
   ["vehicles", "hockey", "inventory", "financial", "tasks", "home", "shopping"].forEach(m => rows.push(["USR-2", m, "", "Editor"]));
   ["USR-3", "USR-4", "USR-5"].forEach(u =>
      ["vehicles", "hockey", "inventory", "tasks", "home", "shopping"].forEach(m => rows.push([u, m, "", "Data Entry"])));
   return rows;
})();

function coreSetup() {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   ss.setSpreadsheetTimeZone("America/Los_Angeles");
   const T = CORE_CONFIG.tabs;
   const header = (sheet, cols) => {
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight("bold").setBackground("#d9d9d9");
      sheet.setFrozenRows(1);
   };
   const make = (name) => ss.getSheetByName(name) || ss.insertSheet(name);
   const isEmpty = sheet => sheet.getLastRow() <= 1;

   // ---- Users ----
   const users = make(T.users);
   if (isEmpty(users)) {
      header(users, ["User ID", "Email", "Name", "Admin", "Active", "Due Soon Days", "Added", "Notes"]);
      const now = new Date();
      users.getRange(2, 1, SETUP_USERS.length, 8).setValues(SETUP_USERS.map(r => r.map((v, i) => i === 6 ? now : v)));
      // Tick boxes only where there are people: a box in every row makes the tab
      // look 1,000 rows long and slows every read.
      users.getRange(2, 4, SETUP_USERS.length, 2).insertCheckboxes();
      users.getRange("D2:E").setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      users.getRange("G2:G").setNumberFormat("m/d/yyyy");
      users.setColumnWidth(2, 220); users.setColumnWidth(3, 150); users.setColumnWidth(8, 260);
   }

   // ---- Modules ----
   const modules = make(T.modules);
   if (isEmpty(modules)) {
      header(modules, ["Module Key", "Module Name", "Status", "Sort", "Description", "Spreadsheet ID", "Folder ID"]);
      modules.getRange(2, 1, SETUP_MODULES.length, 7).setValues(SETUP_MODULES);
      modules.getRange("C2:C").setDataValidation(SpreadsheetApp.newDataValidation()
         .requireValueInList(["Active", "Coming soon", "Off"], true).setAllowInvalid(false).build());
      modules.setColumnWidth(2, 210); modules.setColumnWidth(5, 420); modules.setColumnWidth(6, 200); modules.setColumnWidth(7, 200);
   }

   // ---- Areas ----
   const areas = make(T.areas);
   if (isEmpty(areas)) {
      header(areas, ["Module Key", "Area Key", "Area Name", "Sort", "Description"]);
      areas.getRange(2, 1, SETUP_AREAS.length, 5).setValues(SETUP_AREAS);
      areas.getRange("A2:A").setDataValidation(SpreadsheetApp.newDataValidation()
         .requireValueInRange(modules.getRange("A2:A"), true).setAllowInvalid(false).build());
      areas.setColumnWidth(3, 210); areas.setColumnWidth(5, 340);
   }

   // ---- Permissions ----
   // User Name / Module Name / Area Name are filled by formulas in the header row, so the
   // tab reads in plain words; only User ID, Module Key, Area Key and Role are typed.
   const perms = make(T.perms);
   if (isEmpty(perms)) {
      header(perms, ["User ID", "User Name", "Module Key", "Module Name", "Area Key", "Area Name", "Role"]);
      perms.getRange(2, 1, SETUP_PERMS.length, 1).setValues(SETUP_PERMS.map(r => [r[0]]));
      perms.getRange(2, 3, SETUP_PERMS.length, 1).setValues(SETUP_PERMS.map(r => [r[1]]));
      perms.getRange(2, 5, SETUP_PERMS.length, 1).setValues(SETUP_PERMS.map(r => [r[2]]));
      perms.getRange(2, 7, SETUP_PERMS.length, 1).setValues(SETUP_PERMS.map(r => [r[3]]));
      perms.getRange("B1").setFormula('={"User Name";ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,' + T.users + '!A:C,3,FALSE),"?")))}');
      perms.getRange("D1").setFormula('={"Module Name";ARRAYFORMULA(IF(C2:C="","",IFERROR(VLOOKUP(C2:C,' + T.modules + '!A:B,2,FALSE),"?")))}');
      perms.getRange("F1").setFormula('={"Area Name";ARRAYFORMULA(IF(A2:A="","",IF(E2:E="","(whole module)",IFERROR(VLOOKUP(C2:C&"|"&E2:E,{' + T.areas + '!A2:A&"|"&' + T.areas + '!B2:B,' + T.areas + '!C2:C},2,FALSE),"?"))))}');
      perms.getRange("A2:A").setDataValidation(SpreadsheetApp.newDataValidation()
         .requireValueInRange(users.getRange("A2:A"), true).setAllowInvalid(false).build());
      perms.getRange("C2:C").setDataValidation(SpreadsheetApp.newDataValidation()
         .requireValueInRange(modules.getRange("A2:A"), true).setAllowInvalid(false).build());
      perms.getRange("G2:G").setDataValidation(SpreadsheetApp.newDataValidation()
         .requireValueInList(CORE_ROLES, true).setAllowInvalid(false).build());
      perms.getRange("B1:B").setFontColor("#555555"); perms.getRange("D1:D").setFontColor("#555555"); perms.getRange("F1:F").setFontColor("#555555");
      perms.getRange("B1").setFontColor("#000000"); perms.getRange("D1").setFontColor("#000000"); perms.getRange("F1").setFontColor("#000000");
      perms.setColumnWidth(2, 150); perms.setColumnWidth(4, 210); perms.setColumnWidth(6, 210);
      perms.getRange("A1").setNote("No row for a module = No Access. Leave Area Key blank to set the whole module; " +
         "an area row overrides the module's role for that area. Admins (Users tab) don't need rows.");
   }

   // ---- Settings ----
   const settings = make(T.settings);
   if (isEmpty(settings)) {
      header(settings, ["Setting", "Value", "Notes"]);
      settings.getRange(2, 1, 2, 3).setValues([
         ["Change Log", "On", "On or Off. Admins can switch it in the app (Admin ▸ Change log)."],
         ["Due Soon Days (default)", 30, "How far ahead Due Soon looks for people who haven't picked their own."]
      ]);
      settings.setColumnWidth(1, 200); settings.setColumnWidth(3, 460);
   }

   // ---- Change Log ----
   const log = make(T.log);
   if (isEmpty(log)) {
      header(log, ["Timestamp", "User ID", "User Name", "Module", "Action", "Table", "Record", "Changes"]);
      log.getRange("A2:A").setNumberFormat("m/d/yyyy h:mm am/pm");
      log.setColumnWidth(1, 150); log.setColumnWidth(7, 200); log.setColumnWidth(8, 520);
   }

   // Tab order, and drop the blank starter tab.
   [T.users, T.perms, T.modules, T.areas, T.settings, T.log].forEach((name, i) => {
      ss.setActiveSheet(ss.getSheetByName(name)); ss.moveActiveSheet(i + 1);
   });
   const blank = ss.getSheetByName("Sheet1");
   if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
   ss.setActiveSheet(users);

   coreClearUsersCache_();
   coreSessionSecret_();
   // Lets the script check sign-in tokens with Google (asks for the permission now, not on first use).
   UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=x", { muteHttpExceptions: true });
   console.log("Core setup done: " + [T.users, T.perms, T.modules, T.areas, T.settings, T.log].join(", "));
}
