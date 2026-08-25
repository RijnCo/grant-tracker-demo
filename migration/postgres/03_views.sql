-- =============================================================================
-- SEFA Grant Tracking — PostgreSQL reporting views
-- Same six views as SQLite; GROUP_CONCAT becomes string_agg.
-- =============================================================================

BEGIN;

CREATE VIEW v_sefa AS
SELECT
    fy.fy_label,
    fa.agency_name,
    p.aln,
    p.program_title,
    p.cluster_name,
    p.is_rd,
    string_agg(DISTINCT pte.pass_through_name, ', ')         AS pass_through_entities,
    string_agg(DISTINCT pte.pass_through_award_number, ', ') AS pass_through_numbers,
    SUM(e.amount)                                            AS total_expenditures,
    SUM(COALESCE(e.amount_to_subrecipient, 0))               AS passed_to_subrecipients
FROM expenditure e
JOIN award               a   ON a.award_id        = e.award_id
JOIN program             p   ON p.program_id      = a.program_id
JOIN federal_agency      fa  ON fa.agency_id      = p.agency_id
JOIN fiscal_year         fy  ON fy.fiscal_year_id = e.fiscal_year_id
LEFT JOIN pass_through_entity pte ON pte.pass_through_id = a.pass_through_id
GROUP BY fy.fy_label, fa.agency_name, p.aln, p.program_title, p.cluster_name, p.is_rd;

CREATE VIEW v_sefa_cluster_totals AS
SELECT
    fy.fy_label,
    p.cluster_name,
    SUM(e.amount)                              AS cluster_total,
    SUM(COALESCE(e.amount_to_subrecipient, 0)) AS passed_to_subrecipients
FROM expenditure e
JOIN award       a  ON a.award_id        = e.award_id
JOIN program     p  ON p.program_id      = a.program_id
JOIN fiscal_year fy ON fy.fiscal_year_id = e.fiscal_year_id
WHERE p.cluster_name IS NOT NULL
GROUP BY fy.fy_label, p.cluster_name;

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

CREATE VIEW v_award_status AS
SELECT
    a.award_id,
    a.award_name,
    a.fain_or_ptin,
    p.aln,
    p.program_title,
    fa.agency_name,
    CASE WHEN a.is_direct THEN 'Direct' ELSE 'Pass-through' END AS funding_path,
    pte.pass_through_name,
    a.award_type,
    a.original_award_amount,
    COALESCE(SUM(e.amount), 0)                            AS total_spent,
    a.original_award_amount - COALESCE(SUM(e.amount), 0)  AS remaining,
    a.award_period_start,
    a.award_period_end
FROM award a
JOIN program        p   ON p.program_id  = a.program_id
JOIN federal_agency fa  ON fa.agency_id  = p.agency_id
LEFT JOIN pass_through_entity pte ON pte.pass_through_id = a.pass_through_id
LEFT JOIN expenditure e ON e.award_id = a.award_id
GROUP BY a.award_id, p.aln, p.program_title, fa.agency_name, pte.pass_through_name;

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
GROUP BY s.subrecipient_name, s.subrecipient_uei, fy.fy_label,
         p.aln, p.program_title, a.award_name;

CREATE VIEW v_audit_trail AS
SELECT
    al.audit_id,
    al.changed_at,
    al.action,
    al.expenditure_id,
    al.old_amount,
    al.new_amount,
    al.old_award_balance,
    al.new_award_balance,
    d_old.department_name AS old_department,
    d_new.department_name AS new_department,
    al.changed_by
FROM expenditure_audit_log al
LEFT JOIN department d_old ON d_old.department_id = al.old_department_id
LEFT JOIN department d_new ON d_new.department_id = al.new_department_id
ORDER BY al.audit_id;

COMMIT;
