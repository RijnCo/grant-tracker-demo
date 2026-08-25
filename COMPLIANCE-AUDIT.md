# Compliance Audit — SEFA Database vs. Federal Requirements

Audit of the schema in `SEFA-database-schema.md` against the Uniform Guidance
(2 CFR Part 200) requirements for a Schedule of Expenditures of Federal Awards
and Single Audit support. Gaps found were fixed in `sql/01_schema.sql` and
`sql/02_triggers_views.sql`; this document maps each requirement to where the
database satisfies it.

## 2 CFR 200.510(b) — SEFA contents

| # | Requirement | Where satisfied | Status |
|---|---|---|---|
| (b)(1) | List individual federal programs by federal agency; for clusters, list individual programs within the cluster | `program.agency_id`, `program.cluster_name`; views `v_sefa`, `v_sefa_cluster_totals` | ✅ Original design |
| (b)(2) | For pass-through awards: name of pass-through entity and its identifying award number | `pass_through_entity` table; surfaced per-program in `v_sefa` | ✅ Original design |
| (b)(3) | Total federal expenditures for each program / ALN | Derived: `v_sefa.total_expenditures` | ✅ Original design |
| (b)(3) | ALN (Assistance Listing Number) for each program | `program.aln` | ✅ Original design |
| (b)(4) | Total amount provided to subrecipients from each federal program | `expenditure.amount_to_subrecipient`; `v_sefa.passed_to_subrecipients`, `v_subrecipient_payments` | ✅ Original design |
| (b)(5) | For loan / loan-guarantee programs: outstanding balance at fiscal year end | **`loan_balance` table** | 🔧 Added |
| (b)(6) | Notes describing basis of accounting and whether the 10% de minimis indirect rate was elected | **`sefa_note` table**; `entity_profile.basis_of_accounting`; `award.de_minimis_elected` | 🔧 Added (notes + basis) |

## Related requirements

| Requirement | Where satisfied | Status |
|---|---|---|
| FAC data collection form — auditee UEI / EIN (2 CFR 200.512) | **`entity_profile`** (auditee_name, auditee_uei, auditee_ein) | 🔧 Added |
| Internal controls over federal awards (2 CFR 200.303) | Validation triggers: fiscal-year date check, award over-spend block, subrecipient consistency check | 🔧 Added |
| Records & audit trail (2 CFR 200.334) | **`expenditure_audit_log`** — trigger-populated, append-only (UPDATE/DELETE on the log itself are rejected) | 🔧 Added |
| Subrecipient monitoring support (2 CFR 200.332) | `subrecipient.subrecipient_uei`; `v_subrecipient_payments` | ✅ Original design |
| R&D identification (Research & Development cluster) | `program.is_rd` | ✅ Original design |
| Noncash assistance reported at fair value | `award.award_type = 'noncash'` + valuation method disclosed via `sefa_note` | ✅ / documented |

## Controls implemented as triggers (SQLite's stored-procedure layer)

| Control | Trigger(s) | Behavior |
|---|---|---|
| Department spending rollup | `trg_exp_rollup_ins/upd/del` | Every expenditure change updates `department_spending` (per department × award × fiscal year) automatically |
| Change history | `trg_exp_audit_ins/upd/del` | Every INSERT/UPDATE/DELETE writes old and new values to `expenditure_audit_log` with who/when |
| Tamper protection | `trg_audit_no_update/no_delete` | The audit log rejects all edits and deletes |
| Fiscal-year integrity | `trg_exp_fy_date_ins/upd` | `transaction_date` must fall inside the booked fiscal year |
| Anti-overspend | `trg_exp_award_limit_ins` | Cumulative spending cannot exceed `original_award_amount` |
| Subrecipient consistency | `trg_exp_subrecipient_ins` | A subrecipient amount requires a `subrecipient_id` and cannot exceed the expenditure |

All controls are exercised by `build_db.py`'s verification suite (7/7 passing as of build).

## Caveats

- ALN and CGAC values in seed data are real listings (verify against SAM.gov
  Assistance Listings before production use); entity, awards, and dollar
  amounts are fictional demo data.
- `PRAGMA foreign_keys = ON` must be run on every SQLite connection or FK
  constraints silently disable. DBeaver's SQLite driver enables it by default,
  but any custom client must set it.
- SQLite has no user authentication; `entered_by` is application-supplied.
  For production multi-user use, migrate to PostgreSQL or SQL Server where
  the same triggers become true stored procedures with database-level identity.
