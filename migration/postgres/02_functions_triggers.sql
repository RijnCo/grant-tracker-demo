-- =============================================================================
-- SEFA Grant Tracking — PostgreSQL stored procedures & triggers
-- These are the true stored-procedure equivalents of the SQLite trigger layer:
--   1. validation controls (fiscal-year dates, anti-overspend, subrecipient)
--   2. department_spending rollup maintenance
--   3. append-only audit log with old/new award balances
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: an award's remaining balance (original amount minus total spend)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION award_remaining(p_award_id BIGINT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT a.original_award_amount
           - COALESCE((SELECT SUM(e.amount) FROM expenditure e
                       WHERE e.award_id = p_award_id), 0)
    FROM award a WHERE a.award_id = p_award_id
$$;

-- ---------------------------------------------------------------------------
-- Validation (BEFORE INSERT/UPDATE on expenditure)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expenditure_validate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_budget NUMERIC;
    v_spent  NUMERIC;
BEGIN
    -- transaction date must fall inside the booked fiscal year
    IF NOT EXISTS (
        SELECT 1 FROM fiscal_year fy
        WHERE fy.fiscal_year_id = NEW.fiscal_year_id
          AND NEW.transaction_date BETWEEN fy.start_date AND fy.end_date
    ) THEN
        RAISE EXCEPTION 'transaction_date is outside the booked fiscal year';
    END IF;

    -- cumulative spending may not exceed the original award amount
    IF NEW.amount > 0 THEN
        SELECT a.original_award_amount INTO v_budget
        FROM award a WHERE a.award_id = NEW.award_id;
        IF v_budget IS NOT NULL THEN
            SELECT COALESCE(SUM(e.amount), 0) INTO v_spent
            FROM expenditure e
            WHERE e.award_id = NEW.award_id
              AND (TG_OP = 'INSERT' OR e.expenditure_id <> OLD.expenditure_id);
            IF v_spent + NEW.amount > v_budget THEN
                RAISE EXCEPTION 'expenditure would exceed original award amount';
            END IF;
        END IF;
    END IF;

    -- a subrecipient amount requires a subrecipient and cannot exceed amount
    IF COALESCE(NEW.amount_to_subrecipient, 0) <> 0
       AND (NEW.subrecipient_id IS NULL
            OR abs(NEW.amount_to_subrecipient) > abs(NEW.amount)) THEN
        RAISE EXCEPTION 'amount_to_subrecipient requires a subrecipient_id and cannot exceed amount';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_exp_validate
BEFORE INSERT OR UPDATE ON expenditure
FOR EACH ROW EXECUTE FUNCTION fn_expenditure_validate();

-- ---------------------------------------------------------------------------
-- Department spending rollup (AFTER INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expenditure_rollup()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.department_id IS NOT NULL THEN
        UPDATE department_spending SET
            total_spent            = total_spent - OLD.amount,
            total_to_subrecipients = total_to_subrecipients - COALESCE(OLD.amount_to_subrecipient, 0),
            transaction_count      = transaction_count - 1,
            last_updated           = now()
        WHERE department_id  = OLD.department_id
          AND award_id       = OLD.award_id
          AND fiscal_year_id = OLD.fiscal_year_id;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.department_id IS NOT NULL THEN
        INSERT INTO department_spending (department_id, award_id, fiscal_year_id,
                                         total_spent, total_to_subrecipients,
                                         transaction_count, last_updated)
        VALUES (NEW.department_id, NEW.award_id, NEW.fiscal_year_id,
                NEW.amount, COALESCE(NEW.amount_to_subrecipient, 0), 1, now())
        ON CONFLICT (department_id, award_id, fiscal_year_id) DO UPDATE SET
            total_spent            = department_spending.total_spent + EXCLUDED.total_spent,
            total_to_subrecipients = department_spending.total_to_subrecipients
                                     + EXCLUDED.total_to_subrecipients,
            transaction_count      = department_spending.transaction_count + 1,
            last_updated           = now();
    END IF;

    RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_exp_rollup
AFTER INSERT OR UPDATE OR DELETE ON expenditure
FOR EACH ROW EXECUTE FUNCTION fn_expenditure_rollup();

-- ---------------------------------------------------------------------------
-- Audit trail with old/new award balances (AFTER INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expenditure_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_new_balance NUMERIC;
    v_old_balance NUMERIC;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new_balance := award_remaining(NEW.award_id);
        v_old_balance := v_new_balance + NEW.amount;
        INSERT INTO expenditure_audit_log (expenditure_id, action,
            new_amount, new_award_id, new_department_id, new_transaction_date,
            new_doc_reference, changed_by, old_award_balance, new_award_balance)
        VALUES (NEW.expenditure_id, 'INSERT',
            NEW.amount, NEW.award_id, NEW.department_id, NEW.transaction_date,
            NEW.doc_reference, NEW.entered_by, v_old_balance, v_new_balance);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        v_new_balance := award_remaining(NEW.award_id);
        IF OLD.award_id = NEW.award_id THEN
            v_old_balance := v_new_balance + NEW.amount - OLD.amount;
        ELSE
            v_old_balance := award_remaining(OLD.award_id) - OLD.amount;
        END IF;
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
            v_old_balance, v_new_balance);
        RETURN NEW;

    ELSE  -- DELETE
        v_new_balance := award_remaining(OLD.award_id);
        v_old_balance := v_new_balance - OLD.amount;
        INSERT INTO expenditure_audit_log (expenditure_id, action,
            old_amount, old_award_id, old_department_id, old_transaction_date,
            old_doc_reference, changed_by, old_award_balance, new_award_balance)
        VALUES (OLD.expenditure_id, 'DELETE',
            OLD.amount, OLD.award_id, OLD.department_id, OLD.transaction_date,
            OLD.doc_reference, OLD.entered_by, v_old_balance, v_new_balance);
        RETURN OLD;
    END IF;
END $$;

CREATE TRIGGER trg_exp_audit
AFTER INSERT OR UPDATE OR DELETE ON expenditure
FOR EACH ROW EXECUTE FUNCTION fn_expenditure_audit();

-- ---------------------------------------------------------------------------
-- Append-only guards for the audit tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER trg_audit_append_only
BEFORE UPDATE OR DELETE ON expenditure_audit_log
FOR EACH ROW EXECUTE FUNCTION fn_append_only();

CREATE TRIGGER trg_login_audit_append_only
BEFORE UPDATE OR DELETE ON login_audit
FOR EACH ROW EXECUTE FUNCTION fn_append_only();

COMMIT;
