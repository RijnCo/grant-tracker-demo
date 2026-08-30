"""Export grants.db aggregates to frontend/data.js for the dashboard.

Run:  python export_data.py
Re-run any time the database changes; the dashboard reads data.js so it works
from file:// (and inside SharePoint) with no server and no CORS issues.
"""
import json
import os
import sqlite3
from datetime import date, datetime

import revenue_lib

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "grants.db")
OUT = os.path.join(HERE, "frontend", "data.js")


def rows(con, sql, params=()):
    cur = con.execute(sql, params)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def collect(con):
    """All dashboard aggregates as one dict (shared with app.py's live API)."""
    data = {}
    data["entity"] = rows(con, "SELECT * FROM entity_profile")[0]
    data["fiscal_years"] = rows(
        con, "SELECT fiscal_year_id, fy_label, start_date, end_date FROM fiscal_year ORDER BY start_date")

    data["sefa"] = rows(con, """
        SELECT fy.fy_label, fa.agency_name, p.aln, p.program_title, p.cluster_name,
               SUM(e.amount) AS total, SUM(COALESCE(e.amount_to_subrecipient,0)) AS to_sub
        FROM expenditure e
        JOIN award a ON a.award_id = e.award_id
        JOIN program p ON p.program_id = a.program_id
        JOIN federal_agency fa ON fa.agency_id = p.agency_id
        JOIN fiscal_year fy ON fy.fiscal_year_id = e.fiscal_year_id
        WHERE fa.agency_level = 'FEDERAL'
        GROUP BY fy.fy_label, fa.agency_name, p.aln, p.program_title, p.cluster_name
        ORDER BY p.aln""")

    data["sesfa"] = rows(con, "SELECT * FROM v_sesfa ORDER BY csfa_number")

    data["departments"] = rows(con, """
        SELECT fy.fy_label, d.department_name,
               SUM(ds.total_spent) AS total, SUM(ds.transaction_count) AS txns
        FROM department_spending ds
        JOIN department d ON d.department_id = ds.department_id
        JOIN fiscal_year fy ON fy.fiscal_year_id = ds.fiscal_year_id
        GROUP BY fy.fy_label, d.department_name
        ORDER BY total DESC""")

    data["monthly"] = rows(con, """
        SELECT fy.fy_label, substr(e.transaction_date, 1, 7) AS month, SUM(e.amount) AS total
        FROM expenditure e
        JOIN fiscal_year fy ON fy.fiscal_year_id = e.fiscal_year_id
        GROUP BY fy.fy_label, month
        ORDER BY month""")

    data["awards"] = rows(con, """
        SELECT a.award_id, a.award_name, a.fain_or_ptin, p.aln, p.program_title,
               fa.agency_name, fa.agency_level AS funding_source,
               a.award_type, a.state_award_type,
               CASE WHEN a.is_direct = 1 THEN 'Direct' ELSE 'Pass-through' END AS funding_path,
               pte.pass_through_name,
               COALESCE(a.current_award_amount, a.original_award_amount) AS budget,
               a.original_award_amount AS original_amount,
               COALESCE(SUM(e.amount), 0) AS spent,
               a.award_date, a.award_period_start, a.award_period_end,
               a.internal_gl_string, a.identifier_type,
               a.de_minimis_elected, a.indirect_cost_rate,
               (SELECT COUNT(*) FROM award_amendment am
                WHERE am.award_id = a.award_id) AS amendment_count
        FROM award a
        JOIN program p ON p.program_id = a.program_id
        JOIN federal_agency fa ON fa.agency_id = p.agency_id
        LEFT JOIN pass_through_entity pte ON pte.pass_through_id = a.pass_through_id
        LEFT JOIN expenditure e ON e.award_id = a.award_id
        GROUP BY a.award_id
        ORDER BY a.award_date DESC, a.award_id DESC""")

    data["amendments"] = rows(con, """
        SELECT am.amendment_id, am.award_id, a.award_name, am.amendment_number,
               am.amendment_date, am.amendment_type,
               am.old_period_start, am.new_period_start,
               am.old_period_end, am.new_period_end,
               am.old_award_amount, am.new_award_amount, am.amount_change,
               am.description, am.entered_by, am.entered_at
        FROM award_amendment am
        JOIN award a ON a.award_id = am.award_id
        ORDER BY am.amendment_date DESC, am.amendment_id DESC""")

    # per-award spend within each fiscal year (so the FY filter can scope awards)
    data["award_fy_spend"] = rows(con, """
        SELECT e.award_id, fy.fy_label, SUM(e.amount) AS spent
        FROM expenditure e
        JOIN fiscal_year fy ON fy.fiscal_year_id = e.fiscal_year_id
        GROUP BY e.award_id, fy.fy_label""")

    data["subrecipients"] = rows(con, "SELECT * FROM v_subrecipient_payments")

    data["documents"] = rows(con, """
        SELECT document_id, award_id, file_name, storage_path, external_url,
               doc_type, file_size, uploaded_by, uploaded_at
        FROM award_document ORDER BY uploaded_at DESC, document_id DESC""")

    data["loan_balances"] = rows(con, """
        SELECT fy.fy_label, lb.award_id, a.award_name, p.aln, lb.outstanding_balance
        FROM loan_balance lb
        JOIN award a ON a.award_id = lb.award_id
        JOIN program p ON p.program_id = a.program_id
        JOIN fiscal_year fy ON fy.fiscal_year_id = lb.fiscal_year_id
        ORDER BY fy.start_date""")

    data["expenditures"] = rows(con, """
        SELECT e.expenditure_id, e.transaction_date, e.amount,
               COALESCE(e.amount_to_subrecipient, 0) AS to_sub,
               e.description, e.doc_reference, e.entered_by, e.is_adjustment,
               e.award_id, a.award_name, a.fain_or_ptin,
               a.internal_gl_string, a.state_award_type,
               fa.agency_level AS funding_source,
               p.aln, p.program_title, p.cluster_name, fa.agency_name,
               d.department_name, fy.fy_label, s.subrecipient_name
        FROM expenditure e
        JOIN award a ON a.award_id = e.award_id
        JOIN program p ON p.program_id = a.program_id
        JOIN federal_agency fa ON fa.agency_id = p.agency_id
        JOIN fiscal_year fy ON fy.fiscal_year_id = e.fiscal_year_id
        LEFT JOIN department d ON d.department_id = e.department_id
        LEFT JOIN subrecipient s ON s.subrecipient_id = e.subrecipient_id
        ORDER BY e.transaction_date DESC, e.expenditure_id DESC""")

    data["audit_trail"] = rows(con, """
        SELECT al.audit_id, al.changed_at, al.action, al.expenditure_id,
               al.old_amount, al.new_amount,
               d_old.department_name AS old_department,
               d_new.department_name AS new_department,
               al.changed_by, al.old_award_balance, al.new_award_balance,
               COALESCE(al.new_award_id, al.old_award_id) AS award_id,
               a.award_name
        FROM expenditure_audit_log al
        LEFT JOIN department d_old ON d_old.department_id = al.old_department_id
        LEFT JOIN department d_new ON d_new.department_id = al.new_department_id
        LEFT JOIN award a ON a.award_id = COALESCE(al.new_award_id, al.old_award_id)
        ORDER BY al.audit_id DESC LIMIT 50""")

    data["login_audit"] = rows(con, """
        SELECT login_audit_id, username, success, attempted_at
        FROM login_audit ORDER BY login_audit_id DESC LIMIT 25""")

    data["subrecipient_list"] = rows(con, """
        SELECT subrecipient_id, subrecipient_name, subrecipient_uei
        FROM subrecipient ORDER BY subrecipient_name""")
    data["department_list"] = rows(con, """
        SELECT department_id, department_name FROM department ORDER BY department_name""")
    data["pass_through_list"] = rows(con, """
        SELECT pass_through_id, pass_through_name, pass_through_award_number
        FROM pass_through_entity ORDER BY pass_through_name""")

    data["funds"] = rows(con, """
        SELECT fund_id, fund_code, fund_name, fy_label, budget_amount,
               total_in, total_out, available, transaction_count, notes
        FROM v_fund_status ORDER BY fund_code, fy_label""")

    data["fund_transactions"] = rows(con, """
        SELECT t.fund_txn_id, t.fund_id, f.fund_code, f.fund_name, fy.fy_label,
               t.txn_type, t.amount, t.transaction_date, t.description,
               t.doc_reference, t.entered_by, d.department_name
        FROM fund_transaction t
        JOIN operating_fund f ON f.fund_id = t.fund_id
        JOIN fiscal_year fy ON fy.fiscal_year_id = f.fiscal_year_id
        LEFT JOIN department d ON d.department_id = t.department_id
        ORDER BY t.transaction_date DESC, t.fund_txn_id DESC""")

    data["cra_districts"] = rows(con, """
        SELECT district_id, district_name, established_year, sunset_year,
               base_year, base_taxable_value, current_taxable_value,
               increment_value, notes, tif_revenue, total_revenue, total_spent,
               trust_balance, project_count, funding_sources
        FROM v_cra_district_status ORDER BY district_name""")

    data["cra_funding_sources"] = rows(con, """
        SELECT fs.funding_source_id, fs.district_id, d.district_name,
               fs.source_name, fs.source_type, fs.annual_amount, fs.notes
        FROM cra_funding_source fs
        JOIN cra_district d ON d.district_id = fs.district_id
        ORDER BY d.district_name, fs.annual_amount DESC""")

    data["cra_projects"] = rows(con, """
        SELECT project_id, project_code, district_id, district_name,
               project_name, category, project_manager, status, budget_amount,
               start_date, target_completion, spent, remaining,
               funding_sources, engagement_count, engagement_done
        FROM v_cra_project_status ORDER BY budget_amount DESC""")

    data["cra_project_funding"] = rows(con, """
        SELECT f.project_funding_id, f.project_id, p.project_name,
               p.district_id, f.source_name, f.source_type, f.amount
        FROM cra_project_funding f
        JOIN cra_project p ON p.project_id = f.project_id
        ORDER BY f.project_id, f.amount DESC""")

    data["cra_engagements"] = rows(con, """
        SELECT g.engagement_id, g.project_id, p.project_code, p.project_name,
               p.district_id, d.district_name, g.engagement_type,
               g.engagement_date, g.title, g.participants, g.summary,
               g.action_taken, g.entered_by
        FROM cra_engagement g
        JOIN cra_project p ON p.project_id = g.project_id
        JOIN cra_district d ON d.district_id = p.district_id
        ORDER BY g.engagement_date DESC, g.engagement_id DESC""")

    data["cra_transactions"] = rows(con, """
        SELECT t.cra_txn_id, t.district_id, d.district_name, t.project_id,
               p.project_name, t.txn_type, t.amount, t.transaction_date,
               fy.fy_label, t.description, t.doc_reference, t.entered_by
        FROM cra_transaction t
        JOIN cra_district d ON d.district_id = t.district_id
        LEFT JOIN cra_project p ON p.project_id = t.project_id
        LEFT JOIN fiscal_year fy
               ON t.transaction_date BETWEEN fy.start_date AND fy.end_date
        ORDER BY t.transaction_date DESC, t.cra_txn_id DESC""")

    # --- Revenue tracker (Treasurer dashboard) ---
    # Per-stream, per-FY status straight from the ledger, plus the seasonal
    # expected-to-date baseline computed here (it depends on "as of" today).
    today = date.today().isoformat()
    data["revenue_status"] = rows(con, """
        SELECT stream_id, account_code, stream_name, fund_type, collector,
               fiscal_year_id, fy_label, budgeted_amount, actual_amount,
               variance_to_budget, receipt_count, last_receipt_date
        FROM v_revenue_status ORDER BY fy_label, fund_type, account_code""")
    fys = {f["fiscal_year_id"]: f for f in data["fiscal_years"]}
    shares_by_stream = {}
    for r in data["revenue_status"]:
        sid = r["stream_id"]
        if sid not in shares_by_stream:
            shares_by_stream[sid] = revenue_lib.month_shares(con, sid)
        fy = fys[r["fiscal_year_id"]]
        share = revenue_lib.expected_share_to_date(
            shares_by_stream[sid], fy["start_date"], fy["end_date"], today)
        expected = r["budgeted_amount"] * share
        r["expected_to_date"] = round(expected, 2)
        r["variance_to_baseline"] = round(r["actual_amount"] - expected, 2)
        r["variance_to_baseline_pct"] = (
            round((r["actual_amount"] - expected) / expected * 100.0, 1)
            if expected > 0 else 0.0)
        r["expected_share"] = round(share, 4)

    data["revenue_seasonality"] = rows(con, """
        SELECT stream_id, fy_month, share FROM revenue_seasonality
        ORDER BY stream_id, fy_month""")

    data["revenue_receipts"] = rows(con, """
        SELECT r.receipt_id, r.stream_id, s.account_code, s.stream_name,
               s.fund_type, r.fiscal_year_id, fy.fy_label, r.amount,
               r.receipt_date, r.description, r.doc_reference,
               r.is_adjustment, r.entered_by
        FROM revenue_receipt r
        JOIN revenue_stream s ON s.stream_id = r.stream_id
        JOIN fiscal_year fy   ON fy.fiscal_year_id = r.fiscal_year_id
        ORDER BY r.receipt_date DESC, r.receipt_id DESC""")

    data["revenue_alerts"] = rows(con, """
        SELECT a.alert_id, a.stream_id, s.account_code, s.stream_name,
               s.fund_type, fy.fy_label, a.alert_date, a.alert_type,
               a.message, a.expected_to_date, a.actual_to_date, a.variance_pct
        FROM revenue_alert a
        JOIN revenue_stream s ON s.stream_id = a.stream_id
        JOIN fiscal_year fy   ON fy.fiscal_year_id = a.fiscal_year_id
        ORDER BY a.alert_date DESC, a.alert_id DESC""")

    data["sefa_notes"] = rows(con, """
        SELECT fy.fy_label, n.note_number, n.note_title, n.note_text
        FROM sefa_note n JOIN fiscal_year fy ON fy.fiscal_year_id = n.fiscal_year_id
        ORDER BY n.note_number""")

    data["generated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    return data


def main():
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    data = collect(con)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.GRANT_DATA = ")
        json.dump(data, f, indent=1)
        f.write(";\n")
    con.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
