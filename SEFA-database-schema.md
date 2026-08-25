# SEFA Database Schema

Source-data model for a Schedule of Expenditures of Federal Awards (SEFA). Lookup tables hold canonical values once; child tables reference them by foreign key. The reporting layer (SEFA line totals) is derived by summing expenditures, not stored.

## Lookup Tables

### federal_agency

| Column | Type | Notes |
|---|---|---|
| agency_id | INTEGER PK | |
| agency_name | TEXT NOT NULL | |
| cgac_code | TEXT | optional; verify against Treasury list |
| aln_prefix | TEXT | optional; two-digit ALN prefix |

### pass_through_entity

| Column | Type | Notes |
|---|---|---|
| pass_through_id | INTEGER PK | |
| pass_through_name | TEXT NOT NULL | |
| pass_through_award_number | TEXT | their identifying number for the award |

### subrecipient

| Column | Type | Notes |
|---|---|---|
| subrecipient_id | INTEGER PK | |
| subrecipient_name | TEXT NOT NULL | |
| subrecipient_uei | TEXT | UEI or internal id |

### department

| Column | Type | Notes |
|---|---|---|
| department_id | INTEGER PK | |
| department_name | TEXT NOT NULL | |

### fiscal_year

| Column | Type | Notes |
|---|---|---|
| fiscal_year_id | INTEGER PK | |
| fy_label | TEXT NOT NULL | e.g. "FY2026" |
| start_date | DATE NOT NULL | ISO YYYY-MM-DD |
| end_date | DATE NOT NULL | ISO YYYY-MM-DD |

## Core Tables

### program

| Column | Type | Notes |
|---|---|---|
| program_id | INTEGER PK | |
| aln | TEXT NOT NULL | XX.XXX |
| program_title | TEXT NOT NULL | |
| agency_id | INTEGER FK -> federal_agency | |
| cluster_name | TEXT | null if not clustered |
| other_cluster_name | TEXT | state-defined clusters |
| is_clustered | INTEGER | 0/1 flag |
| is_rd | INTEGER | 0/1 R&D flag |

### award

| Column | Type | Notes |
|---|---|---|
| award_id | INTEGER PK | |
| fain_or_ptin | TEXT | FAIN or pass-through number |
| identifier_type | TEXT | 'FAIN' or 'PASS_THROUGH' |
| award_name | TEXT | grant name / local project name |
| program_id | INTEGER FK -> program | |
| pass_through_id | INTEGER FK -> pass_through_entity | null if direct |
| is_direct | INTEGER | 0/1 flag |
| original_award_amount | NUMERIC | |
| award_period_start | DATE | ISO YYYY-MM-DD |
| award_period_end | DATE | ISO YYYY-MM-DD |
| internal_gl_string | TEXT | |
| award_type | TEXT | grant / loan / loan_guarantee / noncash |
| de_minimis_elected | INTEGER | 0/1 |
| indirect_cost_rate | NUMERIC | if not de minimis |

### expenditure

| Column | Type | Notes |
|---|---|---|
| expenditure_id | INTEGER PK | |
| award_id | INTEGER FK -> award | |
| fiscal_year_id | INTEGER FK -> fiscal_year | SEFA-by-year join |
| department_id | INTEGER FK -> department | |
| amount | NUMERIC NOT NULL | negative for adjustments |
| transaction_date | DATE NOT NULL | ISO YYYY-MM-DD |
| description | TEXT | |
| amount_to_subrecipient | NUMERIC | portion passed down |
| subrecipient_id | INTEGER FK -> subrecipient | null if not passed down |
| is_adjustment | INTEGER | 0/1 refund/disallowance flag |
| doc_reference | TEXT | invoice/voucher/doc location |
| entered_by | TEXT | audit metadata |
| entered_at | TEXT | audit metadata (ISO timestamp) |

## Relationships

- program -> federal_agency (many-to-one)
- award -> program (many-to-one)
- award -> pass_through_entity (many-to-one, nullable)
- expenditure -> award (many-to-one)
- expenditure -> fiscal_year (many-to-one)
- expenditure -> department (many-to-one)
- expenditure -> subrecipient (many-to-one, nullable)

## DDL

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE federal_agency (
    agency_id    INTEGER PRIMARY KEY,
    agency_name  TEXT NOT NULL,
    cgac_code    TEXT,
    aln_prefix   TEXT
);

CREATE TABLE pass_through_entity (
    pass_through_id           INTEGER PRIMARY KEY,
    pass_through_name         TEXT NOT NULL,
    pass_through_award_number TEXT
);

CREATE TABLE subrecipient (
    subrecipient_id   INTEGER PRIMARY KEY,
    subrecipient_name TEXT NOT NULL,
    subrecipient_uei  TEXT
);

CREATE TABLE department (
    department_id   INTEGER PRIMARY KEY,
    department_name TEXT NOT NULL
);

CREATE TABLE fiscal_year (
    fiscal_year_id INTEGER PRIMARY KEY,
    fy_label       TEXT NOT NULL,
    start_date     DATE NOT NULL,
    end_date       DATE NOT NULL
);

CREATE TABLE program (
    program_id         INTEGER PRIMARY KEY,
    aln                TEXT NOT NULL,
    program_title      TEXT NOT NULL,
    agency_id          INTEGER NOT NULL REFERENCES federal_agency(agency_id),
    cluster_name       TEXT,
    other_cluster_name TEXT,
    is_clustered       INTEGER DEFAULT 0,
    is_rd              INTEGER DEFAULT 0
);

CREATE TABLE award (
    award_id              INTEGER PRIMARY KEY,
    fain_or_ptin          TEXT,
    identifier_type       TEXT CHECK (identifier_type IN ('FAIN','PASS_THROUGH')),
    award_name            TEXT,
    program_id            INTEGER NOT NULL REFERENCES program(program_id),
    pass_through_id       INTEGER REFERENCES pass_through_entity(pass_through_id),
    is_direct             INTEGER DEFAULT 1,
    original_award_amount NUMERIC,
    award_period_start    DATE,
    award_period_end      DATE,
    internal_gl_string    TEXT,
    award_type            TEXT DEFAULT 'grant',
    de_minimis_elected    INTEGER DEFAULT 0,
    indirect_cost_rate    NUMERIC
);

CREATE TABLE expenditure (
    expenditure_id         INTEGER PRIMARY KEY,
    award_id               INTEGER NOT NULL REFERENCES award(award_id),
    fiscal_year_id         INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    department_id          INTEGER REFERENCES department(department_id),
    amount                 NUMERIC NOT NULL,
    transaction_date       DATE NOT NULL,
    description            TEXT,
    amount_to_subrecipient NUMERIC DEFAULT 0,
    subrecipient_id        INTEGER REFERENCES subrecipient(subrecipient_id),
    is_adjustment          INTEGER DEFAULT 0,
    doc_reference          TEXT,
    entered_by             TEXT,
    entered_at             TEXT
);

CREATE INDEX idx_expenditure_award       ON expenditure(award_id);
CREATE INDEX idx_expenditure_fy          ON expenditure(fiscal_year_id);
CREATE INDEX idx_expenditure_department  ON expenditure(department_id);
CREATE INDEX idx_award_program           ON award(program_id);
CREATE INDEX idx_program_agency          ON program(agency_id);
```

## Example: derive a SEFA for one fiscal year

```sql
SELECT
    p.aln,
    p.program_title,
    fa.agency_name,
    SUM(e.amount)                 AS total_expenditures,
    SUM(e.amount_to_subrecipient) AS passed_to_subrecipients
FROM expenditure e
JOIN award          a  ON a.award_id   = e.award_id
JOIN program        p  ON p.program_id = a.program_id
JOIN federal_agency fa ON fa.agency_id = p.agency_id
WHERE e.fiscal_year_id = :fy
GROUP BY p.aln, p.program_title, fa.agency_name
ORDER BY p.aln;
```

## SQLite implementation notes

- SQLite stores dates as TEXT; use ISO `YYYY-MM-DD` so `BETWEEN` and sorting work. The `DATE` type is a hint, not enforced.
- Booleans are `INTEGER` 0/1 — SQLite has no native boolean.
- `PRAGMA foreign_keys = ON` must run on every connection or FK constraints are ignored.
- Store adjustments (refunds/disallowances) as negative `amount` rows so `SUM` nets them automatically; `is_adjustment` just flags them.
- Verify CGAC codes and ALN values against the official Treasury CGAC list and SAM.gov Assistance Listings before relying on them.
