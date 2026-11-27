# Ayers Household

Mobile web app for the Ayers household: vehicles, travel hockey, inventory, finances, tasks, work, home maintenance and shopping. Built the same way as Ayers Aquariums.

- Front end: static files served by GitHub Pages (`index.html`, `app.js`, `styles.css`, `config.js`).
- Back end: `apps-script/*.gs`, installed in the **Ayers Household - Core** spreadsheet's Apps Script project and deployed as a web app (Execute as: Me, Who has access: Anyone; every request is checked against a verified Google sign-in).
- Data: Google Sheets in the **Ayers Household** Drive folder: one Core spreadsheet plus one spreadsheet per module (added as each module is built).

## Access

- **Users** tab: who can sign in. Ticking **Admin** gives everything in every module.
- **Permissions** tab: one row per person per module (Area Key blank) and, optionally, per area inside a module. Roles: Editor, Data Entry, Viewer, No Access. No row = No Access. Editable in the app (Admin ▸ Permissions) or on the sheet.

| Role | Can |
|---|---|
| Admin | Everything, plus users, permissions, permanent deletes, restoring deleted items |
| Editor | Add, edit, inactivate and delete any record; add dropdown values |
| Data Entry | Add records using existing dropdown values; edit or delete only their own |
| Viewer | See only |

## Apps Script files (`apps-script/`)

| File | What it does |
|---|---|
| `Api.gs` | Web app entry point (`doPost`), sign-in and sessions, permissions (`coreCan_` for modules to use), users, modules, settings, Change Log. |
| `Setup.gs` | `coreSetup()`: builds the Core tabs and the starting users, modules, areas and permissions. Safe to re-run; it only adds what's missing. |
| `Modules.gs` | Shared engine for every module: tables, add / edit / soft delete / restore / permanent delete, dropdown lists (in use = turned off instead of deleted), permission checks, Due Soon. |
| `Hockey.gs` | Travel Hockey: seasons, earnings, chore plan, weekly totals and consequences, expenses, schedule, venues. `hockeySetup()` builds its spreadsheet's tabs and fills the lists. |
| `Shopping.gs` | Shopping List: items, check off, remove checked, add several at once. `shoppingSetup()`. |
| `Tasks.gs` | Tasks: per-person and household tasks, status list, checklists, repeats, Home ▸ My tasks, tasks from other modules (Vehicles follow-ups). `tasksSetup()`. |
| `TasksGoogle.gs` | Two-way sync between a person's tasks and their Google Tasks (My Tasks): connect once, app changes sent at once, Google changes pulled on open / Sync now. Needs the Tasks API on and the client secret saved (Tasks ▸ Set up). |
| `Financial.gs` | Financial: bills and income (default amount + frequency; entries made 3 months ahead, Paid / Received automatically on autopay), reminder tasks, loans (balance, payoff estimate, shown on the vehicle), accounts (last 4 digits only), Plan / Save For (options with cost lines), the yearly month grid, statements in Drive, sending a paid bill to Travel Hockey. `financialSetup()`. |
| `Pets.gs` | Pets: pets (details, food, weights), places, vet visits (treatments given, records, follow-ups), treatments with intervals and their log, medications and refills, reminders as tasks, Due Soon. `petsSetup()` also adds the module, its areas and access to Core. |
| `Work.gs` | Work: comp / OT time entries (OT 1.5×, comp used, July–June fiscal year) and the monthly B-2CL time sheet; work receipts with line items (category, rationale, person, tax and shipping spread) and the yearly per-person report; job applications (companies, contacts, jobs, statuses, communication log, follow-ups as tasks, files). `workSetup()` turns the module on and adds its areas and access. |
| `Vehicles.gs` | Vehicles: vehicles, features, plates, places, service visits and lines, odometer, intervals (due dates, mileage estimates), insurance policies and cards, registrations, files in Drive, Due Soon. `vehiclesSetup()`. |

Front-end files: `app.js` (core), `modules.js` (shared module screens: forms, list managers, deleted items), `hockey.js` (Travel Hockey screens), `shopping.js` (Shopping List), `vehicles.js` (Vehicles), `tasks.js` (Tasks), `financial.js` (Financial), `pets.js` (Pets), `work.js` (Work).

## Modules

| Key | Module | Status |
|---|---|---|
| vehicles | Vehicles | Active (spreadsheet "Ayers Household - Vehicles") |
| hockey | Travel Hockey | Active (spreadsheet "Ayers Household - Travel Hockey") |
| inventory | Inventory | Coming soon |
| financial | Financial | Active (spreadsheet "Ayers Household - Financial"); not shared with anyone. Number lookup (card / account number → institution, person, last 4 and account suffix; matches as you type) for admins and people switched on in Permissions; runs on the device, nothing sent or logged |
| tasks | Tasks | Active (spreadsheet "Ayers Household - Tasks"); with Google Tasks sync |
| work | Work | Active (spreadsheet "Ayers Household - Work"); comp / OT is Chris only until opened to others in Permissions |
| home | Home Maintenance & Projects | Coming soon |
| pets | Pets | Active (spreadsheet "Ayers Household - Pets") |
| shopping | Shopping List | Active (spreadsheet "Ayers Household - Shopping List") |

Requirements and decisions: the "Household App Set Up - with Follow-Up Questions" Google Doc.

## Planned

- Export reports (Financial month grid and others) to a file.
- Inventory: receipt lines ticked "Add to Inventory" go there once Inventory is built.
- Push notifications (future enhancement review): Firebase Cloud Messaging push for chosen tasks, scheduled per task, to the assigned person's devices (iPhone needs iOS 16.4+ with the app on the Home Screen).
