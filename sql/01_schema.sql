-- =============================================================================
-- SEFA Grant Tracking Database — Core Schema
-- Target: SQLite 3
-- Source design: SEFA-database-schema.md, plus compliance additions
-- (see COMPLIANCE-AUDIT.md for the 2 CFR 200 mapping)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

-- Awarding agencies. agency_level distinguishes federal agencies (SEFA,
-- ALN codes) from Florida state agencies (SESFA, CSFA codes per the Florida
-- Single Audit Act, s. 215.97, F.S.).
CREATE TABLE federal_agency (
    agency_id    INTEGER PRIMARY KEY,
    agency_name  TEXT NOT NULL,
    cgac_code    TEXT,
    aln_prefix   TEXT,
    agency_level TEXT NOT NULL DEFAULT 'FEDERAL'
                 CHECK (agency_level IN ('FEDERAL','STATE'))
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

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

-- For federal programs, aln holds the Assistance Listing Number; for state
-- programs it holds the CSFA number (Catalog of State Financial Assistance) —
-- both use the ##.### format. The agency's agency_level says which it is.
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
    identifier_type       TEXT CHECK (identifier_type IN ('FAIN','PASS_THROUGH','STATE')),
    award_name            TEXT,
    program_id            INTEGER NOT NULL REFERENCES program(program_id),
    pass_through_id       INTEGER REFERENCES pass_through_entity(pass_through_id),
    is_direct             INTEGER DEFAULT 1,
    original_award_amount NUMERIC,
    -- current_award_amount = original + all amendment funding changes.
    -- Maintained by trg_amendment_apply; NULL means "never amended".
    current_award_amount  NUMERIC,
    -- award_date is when the award was made; the period of performance often
    -- starts later (awarded July 1, work begins September 1).
    award_date            DATE,
    award_period_start    DATE,
    award_period_end      DATE,
    internal_gl_string    TEXT,
    award_type            TEXT DEFAULT 'grant'
                          CHECK (award_type IN ('grant','cooperative_agreement','loan','loan_guarantee','noncash')),
    -- For state financial assistance only (s. 215.97, F.S.): what kind of
    -- state award this is. NULL on federal awards.
    state_award_type      TEXT CHECK (state_award_type IS NULL OR state_award_type IN
                          ('legislative_appropriation','state_grant_agreement',
                           'state_revolving_fund','other')),
    de_minimis_elected    INTEGER DEFAULT 0,
    indirect_cost_rate    NUMERIC
);

-- Award amendments: period-of-performance changes and additional funding.
-- Append-only paper trail; trg_amendment_apply pushes the change onto the
-- award row so the current dates/amount are always on award itself.
CREATE TABLE award_amendment (
    amendment_id     INTEGER PRIMARY KEY,
    award_id         INTEGER NOT NULL REFERENCES award(award_id),
    amendment_number INTEGER NOT NULL,
    amendment_date   DATE NOT NULL,
    amendment_type   TEXT NOT NULL CHECK (amendment_type IN
                     ('period_change','additional_funding','combined','other')),
    old_period_start DATE,
    new_period_start DATE,
    old_period_end   DATE,
    new_period_end   DATE,
    old_award_amount NUMERIC,
    new_award_amount NUMERIC,
    amount_change    NUMERIC NOT NULL DEFAULT 0,
    description      TEXT,
    entered_by       TEXT,
    entered_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (award_id, amendment_number)
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
    entered_at             TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Compliance additions (2 CFR 200.510(b), FAC submission)
-- ---------------------------------------------------------------------------

-- Auditee identity for the Federal Audit Clearinghouse data collection form.
-- Single-row table (entity_id forced to 1).
CREATE TABLE entity_profile (
    entity_id           INTEGER PRIMARY KEY CHECK (entity_id = 1),
    auditee_name        TEXT NOT NULL,
    auditee_uei         TEXT,
    auditee_ein         TEXT,
    fiscal_year_end     TEXT,
    basis_of_accounting TEXT CHECK (basis_of_accounting IN ('CASH','ACCRUAL','MODIFIED_ACCRUAL'))
);

-- 2 CFR 200.510(b)(5): outstanding loan / loan-guarantee balances at FY end.
CREATE TABLE loan_balance (
    loan_balance_id     INTEGER PRIMARY KEY,
    award_id            INTEGER NOT NULL REFERENCES award(award_id),
    fiscal_year_id      INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    outstanding_balance NUMERIC NOT NULL,
    UNIQUE (award_id, fiscal_year_id)
);

-- 2 CFR 200.510(b)(6): SEFA notes (basis of accounting, de minimis election,
-- noncash valuation methods, etc.), keyed to the fiscal year reported.
CREATE TABLE sefa_note (
    note_id        INTEGER PRIMARY KEY,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    note_number    INTEGER,
    note_title     TEXT NOT NULL,
    note_text      TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- General operating funds (basic tracker, separate from grant awards)
-- ---------------------------------------------------------------------------

-- One row per fund per fiscal year with its adopted budget.
CREATE TABLE operating_fund (
    fund_id        INTEGER PRIMARY KEY,
    fund_code      TEXT NOT NULL,
    fund_name      TEXT NOT NULL,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    budget_amount  NUMERIC NOT NULL,
    notes          TEXT,
    UNIQUE (fund_code, fiscal_year_id)
);

-- Simple ledger: amounts are positive, txn_type carries direction.
CREATE TABLE fund_transaction (
    fund_txn_id      INTEGER PRIMARY KEY,
    fund_id          INTEGER NOT NULL REFERENCES operating_fund(fund_id),
    department_id    INTEGER REFERENCES department(department_id),
    txn_type         TEXT NOT NULL CHECK (txn_type IN
                     ('expense','revenue','transfer_in','transfer_out')),
    amount           NUMERIC NOT NULL,
    transaction_date DATE NOT NULL,
    description      TEXT,
    doc_reference    TEXT,
    entered_by       TEXT,
    entered_at       TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Community Redevelopment Agency (CRA) tracker — Ch. 163 Part III, F.S.
-- Each district has a tax-increment (TIF) redevelopment trust fund; projects
-- spend against approved budgets from that fund.
-- ---------------------------------------------------------------------------

CREATE TABLE cra_district (
    district_id           INTEGER PRIMARY KEY,
    district_name         TEXT NOT NULL,
    established_year      INTEGER,
    sunset_year           INTEGER,
    base_year             INTEGER,   -- tax roll "frozen" for the increment (s. 163.387)
    base_taxable_value    NUMERIC,   -- taxable value in the base year
    current_taxable_value NUMERIC,   -- latest certified taxable value
    notes                 TEXT
);

-- Where each district's redevelopment trust fund money comes from.
CREATE TABLE cra_funding_source (
    funding_source_id INTEGER PRIMARY KEY,
    district_id       INTEGER NOT NULL REFERENCES cra_district(district_id),
    source_name       TEXT NOT NULL,
    source_type       TEXT NOT NULL CHECK (source_type IN
                      ('tax_increment','county_contribution','grant',
                       'general_fund','interest','private_match','other')),
    annual_amount     NUMERIC,
    notes             TEXT
);

CREATE TABLE cra_project (
    project_id        INTEGER PRIMARY KEY,
    district_id       INTEGER NOT NULL REFERENCES cra_district(district_id),
    project_code      TEXT UNIQUE,       -- human-readable ID, e.g. CRA-DT-001
    project_name      TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'other'
                      CHECK (category IN ('infrastructure','streetscape','housing',
                             'business_assistance','parks_public_space',
                             'transportation','planning_admin','other')),
    project_manager   TEXT,
    status            TEXT NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned','underway','complete')),
    budget_amount     NUMERIC NOT NULL,
    start_date        DATE,
    target_completion DATE
);

-- How each project's approved budget is paid for (TIF, grants, matches…).
CREATE TABLE cra_project_funding (
    project_funding_id INTEGER PRIMARY KEY,
    project_id         INTEGER NOT NULL REFERENCES cra_project(project_id),
    source_name        TEXT NOT NULL,
    source_type        TEXT NOT NULL CHECK (source_type IN
                       ('tax_increment','county_contribution','grant',
                        'general_fund','interest','private_match','other')),
    amount             NUMERIC NOT NULL
);

-- Community engagement held for a project (surveys, public meetings…) and
-- the action the CRA took in response. A project with no rows here has had
-- no engagement ("No" on reports).
CREATE TABLE cra_engagement (
    engagement_id   INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES cra_project(project_id),
    engagement_type TEXT NOT NULL CHECK (engagement_type IN
                    ('survey','public_meeting','workshop','open_house',
                     'charrette','other')),
    engagement_date DATE,
    title           TEXT NOT NULL,
    participants    INTEGER,
    summary         TEXT,
    action_taken    TEXT,
    entered_by      TEXT,
    entered_at      TEXT DEFAULT (datetime('now'))
);

-- Trust-fund ledger: amounts are positive, txn_type carries the direction.
-- Revenues (TIF increment deposits) attach to the district; expenses may
-- also name the project they draw down.
CREATE TABLE cra_transaction (
    cra_txn_id       INTEGER PRIMARY KEY,
    district_id      INTEGER NOT NULL REFERENCES cra_district(district_id),
    project_id       INTEGER REFERENCES cra_project(project_id),
    txn_type         TEXT NOT NULL CHECK (txn_type IN
                     ('tif_increment','other_revenue','project_expense','admin_expense')),
    amount           NUMERIC NOT NULL,
    transaction_date DATE NOT NULL,
    description      TEXT,
    doc_reference    TEXT,
    entered_by       TEXT,
    entered_at       TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Revenue tracker (Treasurer dashboard) — city revenue streams mapped to the
-- Florida Uniform Accounting System chart of accounts, budgeted per fiscal
-- year, with a receipts ledger and seasonal collection baselines. "Real time"
-- here means every number derives live from the ledger on each entry/import.
-- ---------------------------------------------------------------------------

CREATE TABLE revenue_stream (
    stream_id    INTEGER PRIMARY KEY,
    account_code TEXT NOT NULL UNIQUE,   -- FL Uniform Accounting System code
    stream_name  TEXT NOT NULL,
    fund_type    TEXT NOT NULL CHECK (fund_type IN
                 ('general','enterprise','special_revenue')),
    collector    TEXT,                   -- who remits: tax collector, FDOR, lockbox…
    notes        TEXT
);

CREATE TABLE revenue_budget (
    revenue_budget_id INTEGER PRIMARY KEY,
    stream_id         INTEGER NOT NULL REFERENCES revenue_stream(stream_id),
    fiscal_year_id    INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    budgeted_amount   NUMERIC NOT NULL,
    UNIQUE (stream_id, fiscal_year_id)
);

-- Seasonal collection curve: the share of the annual budget expected in each
-- fiscal month (1 = October … 12 = September). Shares for a stream sum to 1;
-- a stream with no rows is treated as uniform (1/12 per month). This is the
-- baseline the variance warnings and alerts compare against.
CREATE TABLE revenue_seasonality (
    stream_id INTEGER NOT NULL REFERENCES revenue_stream(stream_id),
    fy_month  INTEGER NOT NULL CHECK (fy_month BETWEEN 1 AND 12),
    share     NUMERIC NOT NULL CHECK (share >= 0),
    PRIMARY KEY (stream_id, fy_month)
);

-- The receipts ledger: one row per deposit / distribution / remittance.
CREATE TABLE revenue_receipt (
    receipt_id     INTEGER PRIMARY KEY,
    stream_id      INTEGER NOT NULL REFERENCES revenue_stream(stream_id),
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    amount         NUMERIC NOT NULL,
    receipt_date   DATE NOT NULL,
    description    TEXT,
    doc_reference  TEXT,
    is_adjustment  INTEGER NOT NULL DEFAULT 0,  -- refunds/corrections may be negative
    entered_by     TEXT,
    entered_at     TEXT DEFAULT (datetime('now'))
);

-- Append-only alert log: written when a stream falls >10% behind its seasonal
-- baseline (the local stand-in for the "alert email to the Treasurer").
CREATE TABLE revenue_alert (
    alert_id         INTEGER PRIMARY KEY,
    stream_id        INTEGER NOT NULL REFERENCES revenue_stream(stream_id),
    fiscal_year_id   INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    alert_date       DATE NOT NULL,
    alert_type       TEXT NOT NULL CHECK (alert_type IN
                     ('behind_baseline','large_negative_adjustment')),
    message          TEXT NOT NULL,
    expected_to_date NUMERIC,
    actual_to_date   NUMERIC,
    variance_pct     NUMERIC,
    created_at       TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Paper-trail tables (2 CFR 200.303 internal controls / 200.334 records)
-- ---------------------------------------------------------------------------

-- Immutable change log for expenditure rows. Populated by triggers only;
-- guard triggers below reject direct UPDATE/DELETE against it.
CREATE TABLE expenditure_audit_log (
    audit_id             INTEGER PRIMARY KEY,
    expenditure_id       INTEGER NOT NULL,
    action               TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_amount           NUMERIC,
    new_amount           NUMERIC,
    old_award_id         INTEGER,
    new_award_id         INTEGER,
    old_department_id    INTEGER,
    new_department_id    INTEGER,
    old_transaction_date TEXT,
    new_transaction_date TEXT,
    old_doc_reference    TEXT,
    new_doc_reference    TEXT,
    changed_by           TEXT,
    changed_at           TEXT NOT NULL DEFAULT (datetime('now')),
    old_award_balance    NUMERIC,   -- award remaining before the change
    new_award_balance    NUMERIC    -- award remaining after the change
);

-- Running department totals per award per fiscal year.
-- Maintained exclusively by the triggers in 02_triggers_views.sql —
-- SQLite's equivalent of an "update department spending" stored procedure.
CREATE TABLE department_spending (
    department_id          INTEGER NOT NULL REFERENCES department(department_id),
    award_id               INTEGER NOT NULL REFERENCES award(award_id),
    fiscal_year_id         INTEGER NOT NULL REFERENCES fiscal_year(fiscal_year_id),
    total_spent            NUMERIC NOT NULL DEFAULT 0,
    total_to_subrecipients NUMERIC NOT NULL DEFAULT 0,
    transaction_count      INTEGER NOT NULL DEFAULT 0,
    last_updated           TEXT,
    PRIMARY KEY (department_id, award_id, fiscal_year_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_expenditure_award      ON expenditure(award_id);
CREATE INDEX idx_expenditure_fy         ON expenditure(fiscal_year_id);
CREATE INDEX idx_expenditure_department ON expenditure(department_id);
CREATE INDEX idx_award_program          ON award(program_id);
CREATE INDEX idx_program_agency         ON program(agency_id);
CREATE INDEX idx_audit_expenditure      ON expenditure_audit_log(expenditure_id);
CREATE INDEX idx_loan_balance_fy        ON loan_balance(fiscal_year_id);
CREATE INDEX idx_amendment_award        ON award_amendment(award_id);
CREATE INDEX idx_fund_txn_fund          ON fund_transaction(fund_id);
CREATE INDEX idx_cra_txn_district       ON cra_transaction(district_id);
CREATE INDEX idx_cra_txn_project        ON cra_transaction(project_id);
CREATE INDEX idx_cra_project_district   ON cra_project(district_id);
CREATE INDEX idx_cra_funding_district   ON cra_funding_source(district_id);
CREATE INDEX idx_cra_pfunding_project   ON cra_project_funding(project_id);
CREATE INDEX idx_cra_engagement_project ON cra_engagement(project_id);
CREATE INDEX idx_rev_receipt_stream     ON revenue_receipt(stream_id);
CREATE INDEX idx_rev_receipt_fy         ON revenue_receipt(fiscal_year_id);
CREATE INDEX idx_rev_budget_fy          ON revenue_budget(fiscal_year_id);
CREATE INDEX idx_rev_alert_stream       ON revenue_alert(stream_id);
