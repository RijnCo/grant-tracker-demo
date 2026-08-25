-- =============================================================================
-- SEFA Grant Tracking Database — Triggers & Views
-- SQLite has no stored procedures; these triggers are the procedural layer.
-- Every insert/update/delete on expenditure automatically:
--   1. validates dates and award limits (controls, 2 CFR 200.303)
--   2. updates department_spending running totals
--   3. writes an immutable row to expenditure_audit_log
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Validation triggers
-- ---------------------------------------------------------------------------

-- transaction_date must fall inside the fiscal year it is booked to.
CREATE TRIGGER trg_exp_fy_date_ins
BEFORE INSERT ON expenditure
WHEN NOT EXISTS (
    SELECT 1 FROM fiscal_year fy
    WHERE fy.fiscal_year_id = NEW.fiscal_year_id
      AND NEW.transaction_date BETWEEN fy.start_date AND fy.end_date
)
BEGIN
    SELECT RAISE(ABORT, 'transaction_date is outside the booked fiscal year');
END;

CREATE TRIGGER trg_exp_fy_date_upd
BEFORE UPDATE OF transaction_date, fiscal_year_id ON expenditure
WHEN NOT EXISTS (
    SELECT 1 FROM fiscal_year fy
    WHERE fy.fiscal_year_id = NEW.fiscal_year_id
      AND NEW.transaction_date BETWEEN fy.start_date AND fy.end_date
)
BEGIN
    SELECT RAISE(ABORT, 'transaction_date is outside the booked fiscal year');
END;

-- Cumulative spending on an award may not exceed the current award amount
-- (original plus any amendment funding). Adjustments (negative amounts)
-- always pass.
CREATE TRIGGER trg_exp_award_limit_ins
BEFORE INSERT ON expenditure
WHEN NEW.amount > 0
 AND (SELECT COALESCE(a.current_award_amount, a.original_award_amount)
      FROM award a WHERE a.award_id = NEW.award_id) IS NOT NULL
 AND (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = NEW.award_id)
     + NEW.amount
     > (SELECT COALESCE(a.current_award_amount, a.original_award_amount)
        FROM award a WHERE a.award_id = NEW.award_id)
BEGIN
    SELECT RAISE(ABORT, 'expenditure would exceed the current award amount (as amended)');
END;

-- Subrecipient portion cannot exceed the expenditure itself, and requires
-- a subrecipient to be identified.
CREATE TRIGGER trg_exp_subrecipient_ins
BEFORE INSERT ON expenditure
WHEN COALESCE(NEW.amount_to_subrecipient, 0) <> 0
 AND (NEW.subrecipient_id IS NULL OR ABS(NEW.amount_to_subrecipient) > ABS(NEW.amount))
BEGIN
    SELECT RAISE(ABORT, 'amount_to_subrecipient requires a subrecipient_id and cannot exceed amount');
END;

-- ---------------------------------------------------------------------------
-- Department spending rollup (the "stored procedure" replacement)
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_exp_rollup_ins
AFTER INSERT ON expenditure
WHEN NEW.department_id IS NOT NULL
BEGIN
    INSERT INTO department_spending (department_id, award_id, fiscal_year_id,
                                     total_spent, total_to_subrecipients,
                                     transaction_count, last_updated)
    VALUES (NEW.department_id, NEW.award_id, NEW.fiscal_year_id,
            NEW.amount, COALESCE(NEW.amount_to_subrecipient, 0), 1, datetime('now'))
    ON CONFLICT(department_id, award_id, fiscal_year_id) DO UPDATE SET
        total_spent            = total_spent + NEW.amount,
        total_to_subrecipients = total_to_subrecipients + COALESCE(NEW.amount_to_subrecipient, 0),
        transaction_count      = transaction_count + 1,
        last_updated           = datetime('now');
END;

CREATE TRIGGER trg_exp_rollup_del
AFTER DELETE ON expenditure
WHEN OLD.department_id IS NOT NULL
BEGIN
    UPDATE department_spending SET
        total_spent            = total_spent - OLD.amount,
        total_to_subrecipients = total_to_subrecipients - COALESCE(OLD.amount_to_subrecipient, 0),
        transaction_count      = transaction_count - 1,
        last_updated           = datetime('now')
    WHERE department_id = OLD.department_id
      AND award_id      = OLD.award_id
      AND fiscal_year_id = OLD.fiscal_year_id;
END;

-- UPDATE = remove the old contribution, add the new one (handles moves
-- between departments, awards, or fiscal years).
CREATE TRIGGER trg_exp_rollup_upd
AFTER UPDATE ON expenditure
BEGIN
    UPDATE department_spending SET
        total_spent            = total_spent - OLD.amount,
        total_to_subrecipients = total_to_subrecipients - COALESCE(OLD.amount_to_subrecipient, 0),
        transaction_count      = transaction_count - 1,
        last_updated           = datetime('now')
    WHERE OLD.department_id IS NOT NULL
      AND department_id = OLD.department_id
      AND award_id      = OLD.award_id
      AND fiscal_year_id = OLD.fiscal_year_id;

    INSERT INTO department_spending (department_id, award_id, fiscal_year_id,
                                     total_spent, total_to_subrecipients,
                                     transaction_count, last_updated)
    SELECT NEW.department_id, NEW.award_id, NEW.fiscal_year_id,
           NEW.amount, COALESCE(NEW.amount_to_subrecipient, 0), 1, datetime('now')
    WHERE NEW.department_id IS NOT NULL
    ON CONFLICT(department_id, award_id, fiscal_year_id) DO UPDATE SET
        total_spent            = total_spent + NEW.amount,
        total_to_subrecipients = total_to_subrecipients + COALESCE(NEW.amount_to_subrecipient, 0),
        transaction_count      = transaction_count + 1,
        last_updated           = datetime('now');
END;

-- ---------------------------------------------------------------------------
-- Audit trail triggers
-- ---------------------------------------------------------------------------

-- Each audit row also records the award's remaining balance before and after
-- the change, so reviewers see old vs. new balance without recomputing.
CREATE TRIGGER trg_exp_audit_ins
AFTER INSERT ON expenditure
BEGIN
    INSERT INTO expenditure_audit_log (expenditure_id, action,
        new_amount, new_award_id, new_department_id, new_transaction_date,
        new_doc_reference, changed_by, old_award_balance, new_award_balance)
    VALUES (NEW.expenditure_id, 'INSERT',
        NEW.amount, NEW.award_id, NEW.department_id, NEW.transaction_date,
        NEW.doc_reference, NEW.entered_by,
        (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = NEW.award_id)
          - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = NEW.award_id)
          + NEW.amount,
        (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = NEW.award_id)
          - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = NEW.award_id));
END;

CREATE TRIGGER trg_exp_audit_upd
AFTER UPDATE ON expenditure
BEGIN
    INSERT INTO expenditure_audit_log (expenditure_id, action,
        old_amount, new_amount, old_award_id, new_award_id,
        old_department_id, new_department_id,
        old_transaction_date, new_transaction_date,
        old_doc_reference, new_doc_reference, changed_by,
        old_award_balance, new_award_balance)
    VALUES (NEW.expenditure_id, 'UPDATE',
        OLD.amount, NEW.amount, OLD.award_id, NEW.award_id,
        OLD.department_id, NEW.department_id,
        OLD.transaction_date, NEW.transaction_date,
        OLD.doc_reference, NEW.doc_reference, NEW.entered_by,
        CASE WHEN OLD.award_id = NEW.award_id THEN
            (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = NEW.award_id)
              - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = NEW.award_id)
              + NEW.amount - OLD.amount
        ELSE
            (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = OLD.award_id)
              - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = OLD.award_id)
              - OLD.amount
        END,
        (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = NEW.award_id)
          - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = NEW.award_id));
END;

CREATE TRIGGER trg_exp_audit_del
AFTER DELETE ON expenditure
BEGIN
    INSERT INTO expenditure_audit_log (expenditure_id, action,
        old_amount, old_award_id, old_department_id, old_transaction_date,
        old_doc_reference, changed_by, old_award_balance, new_award_balance)
    VALUES (OLD.expenditure_id, 'DELETE',
        OLD.amount, OLD.award_id, OLD.department_id, OLD.transaction_date,
        OLD.doc_reference, OLD.entered_by,
        (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = OLD.award_id)
          - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = OLD.award_id)
          - OLD.amount,
        (SELECT COALESCE(a.current_award_amount, a.original_award_amount) FROM award a WHERE a.award_id = OLD.award_id)
          - (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = OLD.award_id));
END;

-- The audit log is append-only: no edits, no deletes.
CREATE TRIGGER trg_audit_no_update
BEFORE UPDATE ON expenditure_audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit log is append-only');
END;

CREATE TRIGGER trg_audit_no_delete
BEFORE DELETE ON expenditure_audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit log is append-only');
END;

-- ---------------------------------------------------------------------------
-- Award amendment triggers (period-of-performance changes, added funding)
-- ---------------------------------------------------------------------------

-- The amended period of performance must still be a valid range.
CREATE TRIGGER trg_amendment_period_check
BEFORE INSERT ON award_amendment
WHEN COALESCE(NEW.new_period_start,
              (SELECT award_period_start FROM award WHERE award_id = NEW.award_id))
   > COALESCE(NEW.new_period_end,
              (SELECT award_period_end FROM award WHERE award_id = NEW.award_id))
BEGIN
    SELECT RAISE(ABORT, 'amended period of performance would end before it starts');
END;

-- De-obligations may not cut the award below what is already spent.
CREATE TRIGGER trg_amendment_funding_check
BEFORE INSERT ON award_amendment
WHEN COALESCE(NEW.amount_change, 0) < 0
 AND (SELECT COALESCE(a.current_award_amount, a.original_award_amount)
      FROM award a WHERE a.award_id = NEW.award_id) + NEW.amount_change
   < (SELECT COALESCE(SUM(e.amount), 0) FROM expenditure e WHERE e.award_id = NEW.award_id)
BEGIN
    SELECT RAISE(ABORT, 'amendment would reduce the award below amounts already spent');
END;

-- Applying the amendment is the "stored procedure": the award row always
-- carries the current dates and current amount.
CREATE TRIGGER trg_amendment_apply
AFTER INSERT ON award_amendment
BEGIN
    UPDATE award SET
        award_period_start   = COALESCE(NEW.new_period_start, award_period_start),
        award_period_end     = COALESCE(NEW.new_period_end, award_period_end),
        current_award_amount = COALESCE(current_award_amount, original_award_amount)
                               + COALESCE(NEW.amount_change, 0)
    WHERE award_id = NEW.award_id;
END;

-- Amendment history is part of the paper trail: append-only.
CREATE TRIGGER trg_amendment_no_update
BEFORE UPDATE ON award_amendment
BEGIN
    SELECT RAISE(ABORT, 'amendment history is append-only');
END;

CREATE TRIGGER trg_amendment_no_delete
BEFORE DELETE ON award_amendment
BEGIN
    SELECT RAISE(ABORT, 'amendment history is append-only');
END;

-- ---------------------------------------------------------------------------
-- Operating fund triggers
-- ---------------------------------------------------------------------------

-- Fund ledger amounts are positive; txn_type carries the direction.
CREATE TRIGGER trg_fund_txn_amount_ins
BEFORE INSERT ON fund_transaction
WHEN NEW.amount <= 0
BEGIN
    SELECT RAISE(ABORT, 'fund transaction amounts must be positive; use txn_type for direction');
END;

-- The transaction must fall inside the fund's budget fiscal year.
CREATE TRIGGER trg_fund_txn_fy_ins
BEFORE INSERT ON fund_transaction
WHEN NOT EXISTS (
    SELECT 1 FROM operating_fund f
    JOIN fiscal_year fy ON fy.fiscal_year_id = f.fiscal_year_id
    WHERE f.fund_id = NEW.fund_id
      AND NEW.transaction_date BETWEEN fy.start_date AND fy.end_date
)
BEGIN
    SELECT RAISE(ABORT, 'transaction_date is outside the fund fiscal year');
END;

-- ---------------------------------------------------------------------------
-- CRA (Community Redevelopment Agency) triggers
-- ---------------------------------------------------------------------------

-- CRA ledger amounts are positive; txn_type carries the direction.
CREATE TRIGGER trg_cra_txn_amount_ins
BEFORE INSERT ON cra_transaction
WHEN NEW.amount <= 0
BEGIN
    SELECT RAISE(ABORT, 'CRA transaction amounts must be positive; use txn_type for direction');
END;

-- A transaction that names a project must book to that project's district.
CREATE TRIGGER trg_cra_txn_project_match
BEFORE INSERT ON cra_transaction
WHEN NEW.project_id IS NOT NULL
 AND (SELECT p.district_id FROM cra_project p WHERE p.project_id = NEW.project_id)
     IS NOT NEW.district_id
BEGIN
    SELECT RAISE(ABORT, 'project belongs to a different CRA district');
END;

-- Project spending may not exceed the approved project budget.
CREATE TRIGGER trg_cra_project_budget
BEFORE INSERT ON cra_transaction
WHEN NEW.txn_type = 'project_expense'
 AND NEW.project_id IS NOT NULL
 AND (SELECT COALESCE(SUM(t.amount), 0) FROM cra_transaction t
      WHERE t.project_id = NEW.project_id AND t.txn_type = 'project_expense')
     + NEW.amount
     > (SELECT p.budget_amount FROM cra_project p WHERE p.project_id = NEW.project_id)
BEGIN
    SELECT RAISE(ABORT, 'expense would exceed the approved project budget');
END;

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------

-- The SEFA itself: one row per FEDERAL program per fiscal year.
CREATE VIEW v_sefa AS
SELECT
    fy.fy_label,
    fa.agency_name,
    p.aln,
    p.program_title,
    p.cluster_name,
    p.is_rd,
    GROUP_CONCAT(DISTINCT pte.pass_through_name)         AS pass_through_entities,
    GROUP_CONCAT(DISTINCT pte.pass_through_award_number) AS pass_through_numbers,
    SUM(e.amount)                                        AS total_expenditures,
    SUM(COALESCE(e.amount_to_subrecipient, 0))           AS passed_to_subrecipients
FROM expenditure e
JOIN award               a   ON a.award_id        = e.award_id
JOIN program             p   ON p.program_id      = a.program_id
JOIN federal_agency      fa  ON fa.agency_id      = p.agency_id
JOIN fiscal_year         fy  ON fy.fiscal_year_id = e.fiscal_year_id
LEFT JOIN pass_through_entity pte ON pte.pass_through_id = a.pass_through_id
WHERE fa.agency_level = 'FEDERAL'
GROUP BY fy.fy_label, fa.agency_name, p.aln, p.program_title, p.cluster_name, p.is_rd;

-- The SESFA (Schedule of Expenditures of State Financial Assistance,
-- s. 215.97, F.S. / Auditor General Rule 10.550): one row per state
-- project/program per fiscal year, identified by CSFA number.
CREATE VIEW v_sesfa AS
SELECT
    fy.fy_label,
    fa.agency_name                               AS state_agency,
    p.aln                                        AS csfa_number,
    p.program_title,
    a.state_award_type,
    GROUP_CONCAT(DISTINCT a.fain_or_ptin)        AS contract_numbers,
    SUM(e.amount)                                AS total_expenditures,
    SUM(COALESCE(e.amount_to_subrecipient, 0))   AS passed_to_subrecipients
FROM expenditure e
JOIN award          a  ON a.award_id        = e.award_id
JOIN program        p  ON p.program_id      = a.program_id
JOIN federal_agency fa ON fa.agency_id      = p.agency_id
JOIN fiscal_year    fy ON fy.fiscal_year_id = e.fiscal_year_id
WHERE fa.agency_level = 'STATE'
GROUP BY fy.fy_label, fa.agency_name, p.aln, p.program_title, a.state_award_type;

-- Cluster subtotals (2 CFR 200.510(b)(1): clusters reported as one program).
CREATE VIEW v_sefa_cluster_totals AS
SELECT
    fy.fy_label,
    p.cluster_name,
    SUM(e.amount)                              AS cluster_total,
    SUM(COALESCE(e.amount_to_subrecipient, 0)) AS passed_to_subrecipients
FROM expenditure e
JOIN award          a  ON a.award_id        = e.award_id
JOIN program        p  ON p.program_id      = a.program_id
JOIN federal_agency fa ON fa.agency_id      = p.agency_id
JOIN fiscal_year    fy ON fy.fiscal_year_id = e.fiscal_year_id
WHERE p.cluster_name IS NOT NULL
  AND fa.agency_level = 'FEDERAL'
GROUP BY fy.fy_label, p.cluster_name;

-- Department spending, readable (joins the trigger-maintained rollup).
CREATE VIEW v_department_spending AS
SELECT
    d.department_name,
    fy.fy_label,
    a.award_name,
    a.fain_or_ptin,
    p.aln,
    p.program_title,
    ds.total_spent,
    ds.total_to_subrecipients,
    ds.transaction_count,
    ds.last_updated
FROM department_spending ds
JOIN department   d  ON d.department_id   = ds.department_id
JOIN fiscal_year  fy ON fy.fiscal_year_id = ds.fiscal_year_id
JOIN award        a  ON a.award_id        = ds.award_id
JOIN program      p  ON p.program_id      = a.program_id;

-- Award status: budget vs. spent vs. remaining. The budget is the current
-- (amended) amount; original_award_amount is kept for comparison.
CREATE VIEW v_award_status AS
SELECT
    a.award_id,
    a.award_name,
    a.fain_or_ptin,
    p.aln,
    p.program_title,
    fa.agency_name,
    fa.agency_level                                     AS funding_source,
    CASE WHEN a.is_direct = 1 THEN 'Direct' ELSE 'Pass-through' END AS funding_path,
    pte.pass_through_name,
    a.award_type,
    a.state_award_type,
    a.original_award_amount,
    COALESCE(a.current_award_amount, a.original_award_amount) AS current_award_amount,
    COALESCE(SUM(e.amount), 0)                          AS total_spent,
    COALESCE(a.current_award_amount, a.original_award_amount)
      - COALESCE(SUM(e.amount), 0)                     AS remaining,
    a.award_date,
    a.award_period_start,
    a.award_period_end
FROM award a
JOIN program        p   ON p.program_id  = a.program_id
JOIN federal_agency fa  ON fa.agency_id  = p.agency_id
LEFT JOIN pass_through_entity pte ON pte.pass_through_id = a.pass_through_id
LEFT JOIN expenditure e ON e.award_id = a.award_id
GROUP BY a.award_id;

-- Operating fund status: adopted budget vs. money in vs. money out.
CREATE VIEW v_fund_status AS
SELECT
    f.fund_id,
    f.fund_code,
    f.fund_name,
    fy.fy_label,
    f.budget_amount,
    COALESCE(SUM(CASE WHEN t.txn_type IN ('revenue','transfer_in')
                      THEN t.amount END), 0)  AS total_in,
    COALESCE(SUM(CASE WHEN t.txn_type IN ('expense','transfer_out')
                      THEN t.amount END), 0)  AS total_out,
    f.budget_amount
      + COALESCE(SUM(CASE WHEN t.txn_type IN ('revenue','transfer_in')
                          THEN t.amount END), 0)
      - COALESCE(SUM(CASE WHEN t.txn_type IN ('expense','transfer_out')
                          THEN t.amount END), 0) AS available,
    COUNT(t.fund_txn_id)                      AS transaction_count,
    f.notes
FROM operating_fund f
JOIN fiscal_year fy ON fy.fiscal_year_id = f.fiscal_year_id
LEFT JOIN fund_transaction t ON t.fund_id = f.fund_id
GROUP BY f.fund_id;

-- CRA district status: TIF trust fund in/out and balance.
CREATE VIEW v_cra_district_status AS
SELECT
    d.district_id,
    d.district_name,
    d.established_year,
    d.sunset_year,
    d.notes,
    COALESCE(SUM(CASE WHEN t.txn_type IN ('tif_increment','other_revenue')
                      THEN t.amount END), 0)  AS total_revenue,
    COALESCE(SUM(CASE WHEN t.txn_type IN ('project_expense','admin_expense')
                      THEN t.amount END), 0)  AS total_spent,
    COALESCE(SUM(CASE WHEN t.txn_type IN ('tif_increment','other_revenue')
                      THEN t.amount END), 0)
      - COALESCE(SUM(CASE WHEN t.txn_type IN ('project_expense','admin_expense')
                          THEN t.amount END), 0) AS trust_balance,
    (SELECT COUNT(*) FROM cra_project p
     WHERE p.district_id = d.district_id)     AS project_count
FROM cra_district d
LEFT JOIN cra_transaction t ON t.district_id = d.district_id
GROUP BY d.district_id;

-- CRA project status: approved budget vs. spent.
CREATE VIEW v_cra_project_status AS
SELECT
    p.project_id,
    p.district_id,
    d.district_name,
    p.project_name,
    p.status,
    p.budget_amount,
    p.start_date,
    p.target_completion,
    COALESCE(SUM(t.amount), 0)                    AS spent,
    p.budget_amount - COALESCE(SUM(t.amount), 0)  AS remaining
FROM cra_project p
JOIN cra_district d ON d.district_id = p.district_id
LEFT JOIN cra_transaction t
       ON t.project_id = p.project_id AND t.txn_type = 'project_expense'
GROUP BY p.project_id;

-- Subrecipient payments (supports subrecipient monitoring, 2 CFR 200.332).
CREATE VIEW v_subrecipient_payments AS
SELECT
    s.subrecipient_name,
    s.subrecipient_uei,
    fy.fy_label,
    p.aln,
    p.program_title,
    a.award_name,
    SUM(e.amount_to_subrecipient) AS total_passed_down,
    COUNT(*)                      AS payment_count
FROM expenditure e
JOIN subrecipient s  ON s.subrecipient_id = e.subrecipient_id
JOIN award        a  ON a.award_id        = e.award_id
JOIN program      p  ON p.program_id      = a.program_id
JOIN fiscal_year  fy ON fy.fiscal_year_id = e.fiscal_year_id
GROUP BY s.subrecipient_name, s.subrecipient_uei, fy.fy_label, p.aln, p.program_title, a.award_name;

-- Human-readable audit trail.
CREATE VIEW v_audit_trail AS
SELECT
    al.audit_id,
    al.changed_at,
    al.action,
    al.expenditure_id,
    al.old_amount,
    al.new_amount,
    d_old.department_name AS old_department,
    d_new.department_name AS new_department,
    al.old_transaction_date,
    al.new_transaction_date,
    al.old_doc_reference,
    al.new_doc_reference,
    al.changed_by
FROM expenditure_audit_log al
LEFT JOIN department d_old ON d_old.department_id = al.old_department_id
LEFT JOIN department d_new ON d_new.department_id = al.new_department_id
ORDER BY al.audit_id;
