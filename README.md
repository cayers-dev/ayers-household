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

Front-end files: `app.js` (core), `modules.js` (shared module screens: forms, list managers, deleted items), `hockey.js` (Travel Hockey screens).

## Modules

| Key | Module | Status |
|---|---|---|
| vehicles | Vehicles | Coming soon |
| hockey | Travel Hockey | Active (spreadsheet "Ayers Household - Travel Hockey") |
| inventory | Inventory | Coming soon |
| financial | Financial | Coming soon |
| tasks | Tasks | Coming soon |
| work | Work | Coming soon |
| home | Home Maintenance & Projects | Coming soon |
| shopping | Shopping List | Coming soon |

Requirements and decisions: the "Household App Set Up - with Follow-Up Questions" Google Doc.
