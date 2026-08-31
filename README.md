# Grant Application — City of Panama City Award Expenditure Tracking

SQLite database + login-protected web app for tracking **federal and Florida
state** award expenditures, producing both the Schedule of Expenditures of
Federal Awards (**SEFA**, 2 CFR 200.510) and the Schedule of Expenditures of
State Financial Assistance (**SESFA**, Florida Single Audit Act — s. 215.97,
F.S.), plus a basic tracker for general operating funds.
Themed for the City of Panama City, Florida (Oct 1–Sep 30 fiscal year).

## Quick start

**Easiest:** download `PanamaCityOperations.exe` from the Releases page and
double-click it — no installs, starts blank, walks you through creating the
administrator account. Full details (including running from source and
building the exe) are in **[INSTALL.md](INSTALL.md)**.

From source:

```
python init_db.py       # blank, production-ready database (first-run admin setup)
python build_db.py      # …or a database full of demo data instead
python app.py           # then open http://localhost:8765
```

The server automatically serves the **React app** (`webapp/dist`). To work on
the frontend:

```
cd webapp
npm install             # once
npm run dev             # dev server on :5173, proxies /api to :8765
npm run build           # production build the Python server picks up
node screenshot.mjs     # signs in headlessly and screenshots every page
```

React app pages, grouped in the sidebar as **Grant awards** (Overview, Grants
— sorted by **date awarded**, often earlier than the period of performance;
click through to a grant's full history, **amendments**, and award facts;
Expenditures with CSV + **OpenGov ERP journal export**; Agencies), **Audit &
reports** (SEFA, SESFA, Audit trail), **City finance** (Operating funds, **CRA
districts** — Ch. 163 F.S. tax-increment trust funds and project budgets), and
**Reference** (Directory). Global **All sources / Federal / State** tabs in
the top bar scope the grant pages to either book; every award row carries a
Federal or State chip. Ctrl+K opens a command palette; the first-run guided
tour replays from the ? button in the top bar.

### CRA tracker (Ch. 163 Part III, F.S.)

Four Community Redevelopment Agency districts — **Downtown, St. Andrews,
Downtown North, and Millville** — each carry their tax base (baseline taxable
value in the base year vs. current taxable value), the TIF revenue the
increment generates, the trust fund's available budget, and the district's
funding sources (`cra_funding_source`). Increment deposits and other revenue
flow into the trust fund; project and administrative expenses draw it down.

Projects carry a human-readable **project ID** (`project_code`), a
**category**, a **project manager**, status, start/target dates, the approved
budget, actual spend from the ledger, and their own **funding sources**
(`cra_project_funding`, capped at the approved budget by a trigger). An
expense that would overspend a project is rejected, and expenses must book to
the project's own district.

**Community engagement** (`cra_engagement`) records the surveys, public
meetings, workshops, and other events held for each project — with the date,
participants, and the **action taken** in response. A project's Yes/No
engagement flag on reports derives from whether any engagement rows exist.

### Revenue tracker (Treasurer dashboard)

Every city revenue stream is mapped to the Florida Uniform Accounting System
chart of accounts and grouped the way the municipal ledger is: **General
Fund** (ad valorem, local option sales tax, franchise fees, utility taxes,
permits, business tax receipts), **Enterprise funds** (water & sewer, solid
waste, marina user fees), and **Special revenue & restricted** (half-cent
sales tax, state revenue sharing, fuel tax, CRA tax increment, grant
reimbursements). Each stream carries a budgeted amount per fiscal year —
including the upcoming FY2027 — and a **seasonal collection curve**
(`revenue_seasonality`): ad valorem lands Nov–Jan, utility fees peak in
summer, business taxes renew in September.

"Real time" means every number derives live from the `revenue_receipt`
ledger the moment a deposit is recorded or a bank lockbox / clearinghouse
**CSV file is imported** (`/api/revenue-import`, all-or-nothing batches). The
dashboard shows top-line KPI cards (collected vs. budget target, run rate
against the seasonal baseline), the monthly pacing chart (cumulative actual
vs. dashed baseline), a treemap of contributions by stream, and a **variance
early-warning table**. A stream that falls more than **10% behind its
seasonal baseline** automatically writes a row to the append-only
`revenue_alert` log — evaluated on every entry and import — and surfaces on
the dashboard's alert panel (the local stand-in for an alert email; SMTP can
be added when the app is packaged).

### Utility billing adjustment tracker

A digital log for customer billing discrepancies and adjustments, structured
intake → investigation → resolution. Tickets carry the account, customer, and
service details, a **discrepancy category** (meter read error, data entry
error, broken meter, leak adjustment, over/underbilling — plus the
non-revenue-water categories below), financial & usage metrics, a ticket
owner, priority, status (New → Under review → Pending approval → Resolved),
and a resolution deadline with automatic overdue flags.

The SOP's internal controls are database triggers: the **adjustment approval
matrix** ($0–$50 frontline rep, $50.01–$500 supervisor, over $500
director/CFO), the **JE-reference rule** (a journal entry number is required
for any adjustment over $50), and the **closing rule** (a ticket can only be
Resolved once a verified adjustment code is on file). Every status change is
written to an append-only event log, and the **Reconciliation tab** gives the
supervisor the weekly audit of logged adjustments vs. credits issued. The
**User guide tab** is the Tracker User Guide — logging protocol, approval
matrix, closing rules, the 30-day pilot plan, and role-based training with
the five resolved sandbox tickets (UB-2026-001…005).

### Revenue integrity

Three initiatives that recover money the city already earns: the
**non-revenue water audit** (under-registering meters, inactive-but-consuming
accounts, unmetered connections — worked as field-audit tickets in the
billing tracker), **business tax receipt compliance** under Ch. 205, F.S.
(cases for businesses operating without registration, from identification
through notice to collection), and the **indirect cost allocation plan**
(central HR/IT/Legal/City Manager/Clerk/Finance costs charged to the
enterprise funds, grant programs, and CRA — FY2026 adopted, FY2027 proposed).

### Deleting records (and the log that remembers it)

Records can be removed — somebody types "Watr Department" and it needs to go —
but a removal is never silent. Every delete snapshots the whole row into the
append-only `deletion_log` before it goes, which is what a real database
server's audit facility would capture. There are two tiers:

- **Reference data** (departments, subrecipients, pass-through entities,
  revenue streams, CRA districts and projects, operating funds, compliance
  cases): deletes cleanly, needs no justification, and is logged quietly
  without cluttering the audit trail.
- **Financial records** (awards, expenditures, revenue receipts, fund and CRA
  transactions, billing tickets and adjustments): requires a **stated reason**
  (enforced by both the API and a database trigger) and appears on the
  **Audit trail → Removals** panel, so an auditor can see what used to exist,
  who removed it, and why.

Anything with dependents is refused before it can orphan history, and the
dialog says what is in the way in plain language ("still referenced by 82
expenditures, 9 operating-fund transactions") rather than surfacing a foreign
key error. Records whose history is already permanent — an amended award, a
stream that raised a pacing alert, a ticket that moved through the billing
workflow — cannot be removed at all, because those logs are append-only by
design. Dependents that are meaningless on their own (a stream's seasonality
curve, a project's engagement records) are removed with the parent and noted
in the log entry.

### Amendments (dates and money change all the time)

Award dates and amounts are living values: a "3-year" award routinely runs 6,
and grantors add money to existing awards. On a grant's page, **Amend** records
an amendment — new period-of-performance dates, a funding change (positive to
add, negative to de-obligate), or both. A database trigger applies the change
to the award (so "current award" and the over-spend control always use the
amended values) and the full before/after history is kept in the append-only
`award_amendment` table.

### State financial assistance (SESFA)

State awards use CSFA numbers (Catalog of State Financial Assistance) instead
of ALNs, name a Florida state agency, and carry a **kind of state award**:
legislative appropriation, state grant agreement, or state revolving fund.
The New-award form has a Federal/State toggle; state expenditures appear only
on the SESFA and federal ones only on the SEFA.

**Sign-in is currently switched off** — the app opens straight to the
dashboard as a standing "Local User" with write access. The whole auth stack
is still present and working (see "Authentication" below); flip
`REQUIRE_LOGIN = True` in `app.py`, or set `PC_OPS_REQUIRE_LOGIN=1`, to bring
the login screen back. With it on, the demo database has three accounts:
`alopez / Sunshine!2026` (grant manager, can enter data) ·
`jrivera / SandDollar!26` (finance admin) · `viewer / Welcome!2026` (read-only).

Click **+ Record expenditure** or **+ New grant award** — grant
balances update immediately (a $200,000 grant with $100,000 spent shows
$100,000 remaining), and every entry lands in the append-only audit trail.
Add `?theme=light` or `?theme=dark` to the URL to force a mode for demos.

## Migrating to SharePoint / Azure

The `migration/` folder is the complete hand-off package: a full **PostgreSQL**
schema with true stored procedures and triggers (`migration/postgres/01–03`),
a data exporter (`python migration/export_to_postgres.py` →
`postgres/99_data.sql`), and a step-by-step guide (`migration/README.md`)
covering Azure Database for PostgreSQL, Entra ID auth, Key Vault, and the
SPFx web-part port of the React app.

## Files

| Path | Purpose |
|---|---|
| `SEFA-database-schema.md` | Original database design document |
| `COMPLIANCE-AUDIT.md` | Schema audit vs. 2 CFR 200 (Uniform Guidance), with gap fixes |
| `sql/01_schema.sql` | Tables (core design + compliance additions) |
| `sql/02_triggers_views.sql` | Triggers (department rollup, audit trail, validation) + reporting views |
| `sql/03_seed_master.sql` | Lookup/master seed data (real ALN/CSFA codes; fictional awards & amounts) — incl. state agencies/programs and operating funds |
| `sql/04_users.sql` | Application users (salted PBKDF2 hashes) + append-only login audit |
| `sql/05_documents.sql` | `award_document` — PDFs/links attached to awards (paths recorded, files in `uploads/`) |
| `uploads/` | Uploaded award PDFs (served with auth by app.py at `/uploads/…`) |
| `pcb_auth.py` | Password hashing/verification (PBKDF2-HMAC-SHA256, 200k iterations) |
| `app.py` | Demo web server — login, dashboard API, expenditure/award entry (stdlib only) |
| `build_db.py` | Builds `grants.db`, seeds users + sample expenditures, runs 9-check verification |
| `export_data.py` | Exports aggregates to `frontend/data.js` for static (no-server) viewing |
| `grants.db` | The database (open this in DBeaver) |
| `frontend/index.html` | The app UI — also works read-only from file:// via data.js |
| `frontend/data.js` | Static data snapshot for no-server viewing |

## Rebuild / refresh

```
python build_db.py      # recreate grants.db from scratch (destructive)
python export_data.py   # refresh the static data.js after any data change
```

## Authentication (demo vs. production)

**Currently disabled** by `REQUIRE_LOGIN = False` in `app.py` (override with
`PC_OPS_REQUIRE_LOGIN=1`). Nothing below has been removed — the flag just
hands every request a standing local operator so no password is needed. The
rest of this section describes what happens when it is switched back on.

Passwords are stored as per-user-salted PBKDF2-HMAC-SHA256 hashes (never
plaintext); verification is constant-time; every login attempt (success or
failure) is recorded in the append-only `login_audit` table. For production:
run behind HTTPS, move application secrets (session signing keys, DB
credentials, any pepper) to **Azure Key Vault**, and prefer Entra ID (Azure AD)
SSO over local passwords — the `app_user.role` column then maps to Entra
groups. Per-user password hashes are not secrets to vault; they stay in the
database by design.

## How the paper trail works (SQLite has no stored procedures — triggers do the job)

- Insert/update/delete a row in `expenditure` and triggers automatically:
  - update `department_spending` (running totals per department × award × FY)
  - append old + new values to `expenditure_audit_log` (which itself rejects
    any UPDATE or DELETE — append-only)
  - reject rows whose date falls outside the booked fiscal year, that would
    overspend the award, or that have inconsistent subrecipient data
- Insert a row in `award_amendment` and a trigger applies the new period of
  performance / funding to the award; the history itself is append-only.
- Reporting views: `v_sefa`, `v_sesfa`, `v_sefa_cluster_totals`,
  `v_department_spending`, `v_award_status` (current vs. original amounts),
  `v_subrecipient_payments`, `v_fund_status`, `v_audit_trail`

Try it in DBeaver: insert an expenditure, then look at `department_spending`
and `v_audit_trail` — both reflect it immediately.

## Opening in DBeaver

Database menu → New Database Connection → SQLite → Path:
`C:\Users\glazedh\GrantApplication\grants.db` → Finish.

## SharePoint options for the dashboard

Modern SharePoint blocks custom script in pages, so a raw HTML file can't be
embedded directly. Realistic paths, easiest first:

1. **Demo / share as-is** — `frontend/index.html` + `data.js` open in any
   browser with no server. Zip and send, or present from your machine.
2. **SharePoint document library + "File viewer"/link** — upload both files to
   a library; users click to open the HTML in a browser tab. Works on most
   tenants (some block .html downloads-as-pages; rename to .aspx sometimes
   works on classic sites).
3. **Embed web part + external host** — host the two files on any static host
   your tenant allows (Azure Static Web Apps, internal IIS), then use the
   SharePoint "Embed" web part with the URL. Requires the domain to be on the
   tenant's allowed-iframe list.
4. **Proper SharePoint app** — port to an SPFx web part (React). The chart and
   data code moves over nearly unchanged; data would come from a SharePoint
   list or an API instead of data.js. This is the production path.

## OpenGov ERP

The city's ERP is OpenGov. The Expenditures page has an **OpenGov ERP** export:
a journal-import CSV keyed by each award's internal GL account string
(`award.internal_gl_string`), with fiscal year, date, funding source,
department, vendor/subrecipient, description, reference, and amount — ready to
map in OpenGov's import tool. A live API integration would replace this file
handoff; until then this is the bridge.

## Production caveats

- Demo data: entity, awards, and amounts are fictional; ALN/CSFA/CGAC codes are real.
- The `migration/postgres` package predates the state-assistance, amendment,
  and operating-fund tables — port those before a PostgreSQL cutover.
- SQLite is single-user/file-based. For multi-user production, port the schema
  to PostgreSQL or SQL Server — the triggers become true stored procedures and
  `entered_by` can come from database authentication.
- Run `PRAGMA foreign_keys = ON` on any custom connection (DBeaver does it).
