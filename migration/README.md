# Migration package — SharePoint / Azure deployment

Everything needed to move the grant tracker off the local demo stack
(SQLite + Python dev server) onto the Microsoft stack the city runs on.

## What's here

| Path | Purpose |
|---|---|
| `postgres/01_schema.sql` | Full PostgreSQL schema (native types, identities, checks) |
| `postgres/02_functions_triggers.sql` | True stored procedures: validation controls, department rollup, append-only audit log with old/new award balances |
| `postgres/03_views.sql` | The six reporting views (SEFA, clusters, balances, audit, …) |
| `export_to_postgres.py` | Dumps current `grants.db` data to `postgres/99_data.sql` |

## Migrating the database

1. Provision **Azure Database for PostgreSQL — Flexible Server** (any
   PostgreSQL 14+ works, including on-prem).
2. Generate the data snapshot from the live demo database:
   ```
   python migration/export_to_postgres.py
   ```
3. Apply in order:
   ```
   psql "$CONN" -f postgres/01_schema.sql
   psql "$CONN" -f postgres/02_functions_triggers.sql
   psql "$CONN" -f postgres/03_views.sql
   psql "$CONN" -f postgres/99_data.sql
   ```
   The data script suspends triggers while loading so the existing audit
   history migrates verbatim, then advances all identity sequences.

Everything the SQLite triggers enforce carries over one-for-one — including
the fiscal-year date check, the anti-overspend control, the trigger-maintained
`department_spending` rollup, and the append-only audit log that records the
award's remaining balance before and after every change.

## Getting the app into SharePoint

The React app (`webapp/src`) is deliberately framework-light (react-router +
framer-motion, plain CSS), which makes the SPFx port mechanical:

1. **API layer** — replace the Python dev server with an Azure Function App or
   App Service exposing the same JSON endpoints (`/api/data`, `/api/expenditure`,
   `/api/award`, `/api/document`, lookups). The SQL moves over unchanged; the
   endpoint code is thin because the database owns the business rules.
2. **Auth** — swap the demo PBKDF2 login for **Entra ID (Azure AD)**: the SPFx
   web part gets the user's identity for free from SharePoint; map Entra groups
   to the `app_user.role` values (`grant_manager` / `finance_admin` / `viewer`).
   Secrets (DB connection string) go to **Azure Key Vault**, referenced from the
   Function App's configuration.
3. **Web part** — scaffold an SPFx React web part (`yo @microsoft/sharepoint`)
   and move `webapp/src` into it. The pages, charts, tables, and design tokens
   transfer as-is; only `main.jsx`'s mount point and the fetch base URL change.
4. **Documents** — store award PDFs in a SharePoint document library instead of
   `uploads/`; keep `award_document.external_url` pointing at the library item
   so the paper-trail links stay in the database.

## Interim option (no SPFx build)

Host the built `webapp/dist` + the API on an Azure App Service and embed it in
a SharePoint page with the **Embed** web part (the App Service domain must be
on the tenant's allowed-iframe list). Slower to love, faster to ship.
