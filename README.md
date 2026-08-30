# Grant Application — City of Pelican Shores Award Expenditure Tracking

SQLite database + login-protected web app for tracking **federal and Florida
state** award expenditures, producing both the Schedule of Expenditures of
Federal Awards (**SEFA**, 2 CFR 200.510) and the Schedule of Expenditures of
State Financial Assistance (**SESFA**, Florida Single Audit Act — s. 215.97,
F.S.), plus a basic tracker for general operating funds.
Themed for the City of Pelican Shores, Florida (Oct 1–Sep 30 fiscal year).

## Quick start

```
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

Demo accounts: `alopez / Sunshine!2026` (grant manager, can enter data) ·
`jrivera / SandDollar!26` (finance admin) · `viewer / Welcome!2026` (read-only).

Sign in, click **+ Record expenditure** or **+ New grant award** — grant
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
