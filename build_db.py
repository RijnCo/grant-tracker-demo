"""Build grants.db: schema + triggers + seed data + verification suite.

Run:  python build_db.py
Creates GrantApplication/grants.db from the sql/ scripts, generates
deterministic sample expenditures (so the triggers maintain rollups and the
audit log exactly as live data entry would), then verifies:
  1. department_spending rollup matches a direct SUM over expenditure
  2. every expenditure change produced an audit-log row
  3. validation triggers reject bad rows (out-of-FY date, over-award spend,
     orphan subrecipient amount)
  4. the audit log is append-only
  5. the SEFA view produces sane totals
"""
import os
import random
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pcb_auth import hash_password, verify_password

DB = os.path.join(HERE, "grants.db")
SQL_DIR = os.path.join(HERE, "sql")

STAFF = ["mgarcia", "jchen", "dwilliams", "kpatel", "rthompson"]

# demo application users: username -> (display_name, role, password)
DEMO_USERS = {
    "alopez":  ("Ana Lopez",      "grant_manager", "Sunshine!2026"),
    "jrivera": ("Jordan Rivera",  "finance_admin", "SandDollar!26"),
    "viewer":  ("Read-Only Demo", "viewer",        "Welcome!2026"),
}

# award_id -> (fy availability, departments that charge to it, typical txn size)
AWARD_PROFILE = {
    1:  ([1, 2, 3], [1],    (60000, 420000)),   # Seagrass Ave - Public Works
    2:  ([2, 3],    [1],    (15000, 90000)),    # Bridge inspection
    3:  ([1, 2, 3], [5],    (80000, 380000)),   # Trolley fleet - Transit
    4:  ([1, 2, 3], [2],    (15000, 60000)),    # JAG - Police
    5:  ([1, 2, 3], [2],    (8000, 45000)),     # Highway safety - Police
    6:  ([2, 3],    [3],    (30000, 190000)),   # CDBG - Community Redevelopment
    7:  ([2, 3],    [6],    (25000, 160000)),   # LWCF park - Parks & Rec
    8:  ([1, 2, 3], [1],    (150000, 500000)),  # CWSRF loan - Public Works
    9:  ([1, 2],    [4],    (70000, 450000)),   # FEMA PA - Emergency Mgmt
    10: ([3],       [1, 3], (10000, 60000)),    # Safe Routes
    # State financial assistance (SESFA)
    11: ([2, 3],    [1],    (40000, 260000)),   # TRIP corridor - Public Works
    12: ([3],       [6],    (8000, 40000)),     # FRDAP park - Parks & Rec
    13: ([2, 3],    [1],    (100000, 450000)),  # DWSRF loan - Public Works
    14: ([2, 3],    [3],    (30000, 180000)),   # GAA line item - Community Redevelopment
}

# awards that pass funds to subrecipients: award_id -> (subrecipient_id, share)
SUBRECIPIENT_MAP = {4: (2, 0.30), 6: (1, 0.40), 7: (3, 0.25), 3: (4, 0.15)}

FY_RANGE = {
    1: ("2023-10-01", "2024-09-30"),
    2: ("2024-10-01", "2025-09-30"),
    3: ("2025-10-01", "2026-09-30"),
}

DESCRIPTIONS = [
    "Contractor progress payment", "Payroll allocation", "Equipment purchase",
    "Professional services invoice", "Materials and supplies",
    "Subaward disbursement", "Utility relocation", "Engineering review",
    "Training and outreach", "Indirect cost allocation",
]


def rand_date(rng, fy_id, award_start, award_end):
    lo = max(FY_RANGE[fy_id][0], award_start or FY_RANGE[fy_id][0])
    hi = min(FY_RANGE[fy_id][1], award_end or FY_RANGE[fy_id][1])
    if lo > hi:
        return None
    # pick a day by ordinal between the two ISO dates
    from datetime import date, timedelta
    d0 = date(*map(int, lo.split("-")))
    d1 = date(*map(int, hi.split("-")))
    return (d0 + timedelta(days=rng.randint(0, (d1 - d0).days))).isoformat()


def generate_expenditures(con):
    rng = random.Random(42)
    awards = {r[0]: r for r in con.execute(
        "SELECT award_id, original_award_amount, award_period_start, award_period_end FROM award")}
    inserted = 0
    for award_id, (fys, depts, (lo, hi)) in AWARD_PROFILE.items():
        _, budget, a_start, a_end = awards[award_id]
        spent = 0.0
        cap = budget * 0.82  # leave headroom so demos can add rows
        for fy in fys:
            n = rng.randint(4, 9)
            for _ in range(n):
                amount = round(rng.uniform(lo, hi), 2)
                if spent + amount > cap:
                    continue
                txn_date = rand_date(rng, fy, a_start, a_end)
                if txn_date is None:
                    continue
                sub_id, sub_amt = None, 0
                if award_id in SUBRECIPIENT_MAP and rng.random() < 0.5:
                    sub_id, share = SUBRECIPIENT_MAP[award_id]
                    sub_amt = round(amount * share, 2)
                con.execute(
                    """INSERT INTO expenditure
                       (award_id, fiscal_year_id, department_id, amount,
                        transaction_date, description, amount_to_subrecipient,
                        subrecipient_id, is_adjustment, doc_reference, entered_by)
                       VALUES (?,?,?,?,?,?,?,?,0,?,?)""",
                    (award_id, fy, rng.choice(depts), amount, txn_date,
                     rng.choice(DESCRIPTIONS), sub_amt, sub_id,
                     "INV-%d-%05d" % (fy + 2023, rng.randint(1, 99999)),
                     rng.choice(STAFF)))
                spent += amount
                inserted += 1
        # one adjustment (refund) per award, booked to its last active FY
        if spent > 0:
            adj = -round(spent * rng.uniform(0.005, 0.02), 2)
            fy = fys[-1]
            txn_date = rand_date(rng, fy, a_start, a_end)
            if txn_date:
                con.execute(
                    """INSERT INTO expenditure
                       (award_id, fiscal_year_id, department_id, amount,
                        transaction_date, description, is_adjustment,
                        doc_reference, entered_by)
                       VALUES (?,?,?,?,?,?,1,?,?)""",
                    (award_id, fy, AWARD_PROFILE[award_id][1][0], adj, txn_date,
                     "Vendor credit / disallowed cost refund",
                     "CR-%d-%05d" % (fy + 2023, rng.randint(1, 99999)),
                     rng.choice(STAFF)))
                inserted += 1
    return inserted


def make_pdf(title, lines):
    """Minimal but valid single-page PDF (Helvetica text) as bytes."""
    text = ["BT /F1 16 Tf 72 730 Td (%s) Tj ET" % title.replace("(", "").replace(")", "")]
    y = 700
    for line in lines:
        text.append("BT /F1 11 Tf 72 %d Td (%s) Tj ET" % (y, line.replace("(", "").replace(")", "")))
        y -= 18
    stream = "\n".join(text).encode("latin-1")
    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length " + str(len(stream)).encode() + b">>stream\n" + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj" % i + body + b"endobj\n"
    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += (b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n"
            % (len(objs) + 1, xref_at))
    return bytes(out)


def seed_documents(con):
    uploads = os.path.join(HERE, "uploads")
    os.makedirs(uploads, exist_ok=True)
    samples = [
        (1, "Award_Letter_FDOT-AR-2024-117.pdf", "award_letter",
         "Notice of Federal Award", [
             "Recipient: City of Pelican Shores, Florida",
             "Award: Seagrass Avenue Corridor Reconstruction",
             "Pass-through: Florida Department of Transportation",
             "ALN 20.205 - Highway Planning and Construction",
             "Original award amount: $8,500,000.00",
             "Period of performance: 10/01/2023 - 09/30/2027",
             "", "This is a generated demo document."]),
        (9, "FEMA_Obligation_Letter_4734-DR-FL.pdf", "award_letter",
         "FEMA Obligation Letter", [
             "Recipient: City of Pelican Shores, Florida",
             "Disaster: FEMA-4734-DR-FL",
             "Program: Public Assistance (ALN 97.036)",
             "Obligated amount: $5,200,000.00",
             "", "This is a generated demo document."]),
        (6, "CDBG_Grant_Agreement_B-24-MC-12-0021.pdf", "award_letter",
         "CDBG Grant Agreement", [
             "Recipient: City of Pelican Shores, Florida",
             "Award: Osprey Point Neighborhood Revitalization",
             "ALN 14.218 - CDBG Entitlement Grants",
             "Original award amount: $3,100,000.00",
             "", "This is a generated demo document."]),
    ]
    for award_id, fname, dtype, title, lines in samples:
        cur = con.execute(
            "INSERT INTO award_document (award_id, file_name, storage_path, doc_type, uploaded_by) "
            "VALUES (?,?,?,?,?)", (award_id, fname, "pending", dtype, "system"))
        doc_id = cur.lastrowid
        rel = "uploads/doc_%d.pdf" % doc_id
        pdf = make_pdf(title, lines)
        with open(os.path.join(HERE, rel.replace("/", os.sep)), "wb") as f:
            f.write(pdf)
        con.execute("UPDATE award_document SET storage_path = ?, file_size = ? "
                    "WHERE document_id = ?", (rel, len(pdf), doc_id))
    con.execute(
        "INSERT INTO award_document (award_id, file_name, external_url, doc_type, uploaded_by) "
        "VALUES (8, 'SRF Loan Agreement (FDEP portal)', "
        "'https://floridadep.gov/wra/srf', 'other', 'system')")
    return len(samples) + 1


def record_amendment(con, award_id, amendment_date, new_start=None, new_end=None,
                     amount_change=0, description="", entered_by="alopez"):
    """Snapshot the award, then insert the amendment row; the database trigger
    (trg_amendment_apply) pushes the change onto the award record — the same
    path app.py's /api/amendment uses."""
    old_start, old_end, old_amount = con.execute(
        "SELECT award_period_start, award_period_end, "
        "COALESCE(current_award_amount, original_award_amount) "
        "FROM award WHERE award_id = ?", (award_id,)).fetchone()
    number = con.execute(
        "SELECT COALESCE(MAX(amendment_number), 0) + 1 FROM award_amendment "
        "WHERE award_id = ?", (award_id,)).fetchone()[0]
    dates_changed = bool(new_start or new_end)
    money_changed = bool(amount_change)
    atype = ("combined" if dates_changed and money_changed
             else "period_change" if dates_changed
             else "additional_funding" if money_changed else "other")
    con.execute(
        """INSERT INTO award_amendment
           (award_id, amendment_number, amendment_date, amendment_type,
            old_period_start, new_period_start, old_period_end, new_period_end,
            old_award_amount, new_award_amount, amount_change, description, entered_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (award_id, number, amendment_date, atype,
         old_start, new_start, old_end, new_end,
         old_amount, (old_amount or 0) + (amount_change or 0),
         amount_change or 0, description, entered_by))


def seed_amendments(con):
    """Demo amendment history: dates slip and money gets added all the time —
    a '3-year' award that actually runs 6, a FEMA re-obligation, an SRF bump."""
    record_amendment(con, 1, "2025-06-15", new_end="2029-09-30",
                     description="Amendment 1: utility relocation delays — period of "
                                 "performance extended two years.")
    record_amendment(con, 1, "2026-03-01", amount_change=1200000,
                     description="Amendment 2: supplemental FDOT obligation for added "
                                 "drainage scope.")
    record_amendment(con, 9, "2025-11-20", amount_change=1500000,
                     description="FEMA version 2 obligation — additional eligible "
                                 "damages approved.")
    record_amendment(con, 13, "2026-02-10", new_end="2029-09-30", amount_change=750000,
                     description="Loan amendment 1: contingency added and completion "
                                 "date extended one year.")
    return 4


FUND_REVENUES = [
    "Ad valorem property tax distribution", "Half-cent sales tax",
    "Charges for services", "Franchise fees", "State revenue sharing",
    "Interest earnings",
]
FUND_EXPENSES = [
    "Payroll and benefits", "Utilities", "Fleet fuel and maintenance",
    "Insurance premiums", "Contracted services", "Supplies and materials",
    "Facility maintenance", "Software licensing",
]


def generate_fund_transactions(con):
    """Basic operating-fund ledger: a few revenues in, many expenses out."""
    rng = random.Random(7)
    from datetime import date, timedelta
    funds = con.execute(
        "SELECT f.fund_id, f.budget_amount, fy.start_date, fy.end_date "
        "FROM operating_fund f JOIN fiscal_year fy "
        "ON fy.fiscal_year_id = f.fiscal_year_id").fetchall()
    inserted = 0
    for fund_id, budget, fy_start, fy_end in funds:
        d0 = date(*map(int, fy_start.split("-")))
        d1 = min(date(*map(int, fy_end.split("-"))), date(2026, 8, 20))
        if d0 > d1:
            continue
        span = (d1 - d0).days

        def day():
            return (d0 + timedelta(days=rng.randint(0, span))).isoformat()

        for _ in range(rng.randint(4, 6)):
            con.execute(
                "INSERT INTO fund_transaction (fund_id, txn_type, amount, "
                "transaction_date, description, doc_reference, entered_by) "
                "VALUES (?,?,?,?,?,?,?)",
                (fund_id, "revenue", round(budget * rng.uniform(0.02, 0.08), 2),
                 day(), rng.choice(FUND_REVENUES),
                 "RCPT-%05d" % rng.randint(1, 99999), rng.choice(STAFF)))
            inserted += 1
        for _ in range(rng.randint(8, 14)):
            con.execute(
                "INSERT INTO fund_transaction (fund_id, department_id, txn_type, "
                "amount, transaction_date, description, doc_reference, entered_by) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (fund_id, rng.randint(1, 6), "expense",
                 round(budget * rng.uniform(0.005, 0.04), 2), day(),
                 rng.choice(FUND_EXPENSES),
                 "AP-%05d" % rng.randint(1, 99999), rng.choice(STAFF)))
            inserted += 1
    return inserted


def demo_paper_trail(con):
    """One UPDATE and one DELETE so the audit log shows all three actions."""
    row = con.execute(
        "SELECT expenditure_id, amount FROM expenditure WHERE is_adjustment = 0 "
        "ORDER BY expenditure_id LIMIT 1").fetchone()
    con.execute(
        "UPDATE expenditure SET amount = ?, entered_by = 'mgarcia', "
        "description = description || ' (corrected per invoice)' WHERE expenditure_id = ?",
        (round(row[1] * 0.98, 2), row[0]))
    victim = con.execute(
        "SELECT expenditure_id FROM expenditure WHERE is_adjustment = 0 "
        "ORDER BY expenditure_id DESC LIMIT 1").fetchone()[0]
    con.execute("DELETE FROM expenditure WHERE expenditure_id = ?", (victim,))
    return row[0], victim


def verify(con):
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))

    # 1. rollup consistency
    bad = con.execute("""
        SELECT COUNT(*) FROM (
            SELECT e.department_id, e.award_id, e.fiscal_year_id,
                   ROUND(SUM(e.amount), 2) AS s,
                   ROUND(SUM(COALESCE(e.amount_to_subrecipient,0)), 2) AS sub,
                   COUNT(*) AS n
            FROM expenditure e WHERE e.department_id IS NOT NULL
            GROUP BY 1,2,3
        ) x
        LEFT JOIN department_spending ds
          ON ds.department_id = x.department_id AND ds.award_id = x.award_id
         AND ds.fiscal_year_id = x.fiscal_year_id
        WHERE ds.department_id IS NULL
           OR ROUND(ds.total_spent,2) <> x.s
           OR ROUND(ds.total_to_subrecipients,2) <> x.sub
           OR ds.transaction_count <> x.n""").fetchone()[0]
    check("department_spending rollup matches SUM(expenditure)", bad == 0,
          "%d mismatched cells" % bad)

    # 2. audit coverage
    n_exp = con.execute("SELECT COUNT(*) FROM expenditure").fetchone()[0]
    by_action = dict(con.execute(
        "SELECT action, COUNT(*) FROM expenditure_audit_log GROUP BY action"))
    check("audit log has INSERT+UPDATE+DELETE rows",
          by_action.get("INSERT", 0) >= n_exp and
          by_action.get("UPDATE", 0) >= 1 and by_action.get("DELETE", 0) >= 1,
          str(by_action))

    # 3a. out-of-FY date rejected
    try:
        con.execute("INSERT INTO expenditure (award_id, fiscal_year_id, department_id, amount, transaction_date) "
                    "VALUES (1, 1, 1, 100, '2026-01-15')")
        check("trigger rejects transaction_date outside fiscal year", False)
    except sqlite3.IntegrityError as e:
        check("trigger rejects transaction_date outside fiscal year",
              "outside the booked fiscal year" in str(e))

    # 3b. over-award spend rejected (limit is the current amount, as amended)
    try:
        con.execute("INSERT INTO expenditure (award_id, fiscal_year_id, department_id, amount, transaction_date) "
                    "VALUES (2, 3, 1, 99999999, '2026-01-15')")
        check("trigger rejects spend over current award amount", False)
    except sqlite3.IntegrityError as e:
        check("trigger rejects spend over current award amount",
              "exceed the current award amount" in str(e))

    # 3c. subrecipient amount without subrecipient rejected
    try:
        con.execute("INSERT INTO expenditure (award_id, fiscal_year_id, department_id, amount, transaction_date, amount_to_subrecipient) "
                    "VALUES (4, 3, 2, 5000, '2026-01-15', 2000)")
        check("trigger rejects subrecipient amount without subrecipient_id", False)
    except sqlite3.IntegrityError as e:
        check("trigger rejects subrecipient amount without subrecipient_id",
              "requires a subrecipient_id" in str(e))

    # 4. audit log append-only
    try:
        con.execute("DELETE FROM expenditure_audit_log WHERE audit_id = 1")
        check("audit log is append-only", False)
    except sqlite3.IntegrityError as e:
        check("audit log is append-only", "append-only" in str(e))

    # 4b. password hashes verify (and reject wrong passwords)
    ok_all = True
    for username, (_, _, password) in DEMO_USERS.items():
        salt, digest, iters = con.execute(
            "SELECT password_salt, password_hash, hash_iterations FROM app_user "
            "WHERE username = ?", (username,)).fetchone()
        if not verify_password(password, salt, digest, iters) or \
           verify_password("wrong-password", salt, digest, iters):
            ok_all = False
    salts = [r[0] for r in con.execute("SELECT password_salt FROM app_user")]
    check("PBKDF2 hashes verify; wrong password rejected; salts unique",
          ok_all and len(set(salts)) == len(salts))

    # 4c. login audit append-only
    con.execute("INSERT INTO login_audit (username, success, client_addr) VALUES ('t', 1, 'x')")
    try:
        con.execute("DELETE FROM login_audit")
        check("login audit is append-only", False)
    except sqlite3.IntegrityError as e:
        check("login audit is append-only", "append-only" in str(e))

    # 4d. seeded documents exist on disk and start with %PDF
    docs = con.execute(
        "SELECT storage_path FROM award_document WHERE storage_path IS NOT NULL").fetchall()
    ok_docs = len(docs) >= 3
    for (rel,) in docs:
        p = os.path.join(HERE, rel.replace("/", os.sep))
        try:
            with open(p, "rb") as f:
                if not f.read(4) == b"%PDF":
                    ok_docs = False
        except OSError:
            ok_docs = False
    check("award documents exist and are valid PDF files", ok_docs,
          "%d files" % len(docs))

    # 5. SEFA view sanity: totals positive, FY2026 present
    sefa = con.execute(
        "SELECT COUNT(*), SUM(total_expenditures) FROM v_sefa WHERE fy_label='FY2026'").fetchone()
    check("v_sefa produces FY2026 program lines", sefa[0] >= 5 and sefa[1] > 0,
          "%d lines, $%.2f total" % (sefa[0], sefa[1] or 0))

    # 6. state assistance stays off the SEFA and shows up on the SESFA
    leaked = con.execute("""
        SELECT COUNT(*) FROM v_sefa WHERE aln IN (
            SELECT p.aln FROM program p
            JOIN federal_agency fa ON fa.agency_id = p.agency_id
            WHERE fa.agency_level = 'STATE')""").fetchone()[0]
    sesfa = con.execute(
        "SELECT COUNT(*), SUM(total_expenditures) FROM v_sesfa WHERE fy_label='FY2026'").fetchone()
    check("v_sefa excludes state programs; v_sesfa has FY2026 lines",
          leaked == 0 and sesfa[0] >= 3 and sesfa[1] > 0,
          "%d leaked, %d SESFA lines, $%.2f" % (leaked, sesfa[0], sesfa[1] or 0))

    # 7. amendments were applied to the award rows by the trigger
    drift = con.execute("""
        SELECT COUNT(*) FROM award a
        WHERE COALESCE(a.current_award_amount, a.original_award_amount)
              <> a.original_award_amount
                 + COALESCE((SELECT SUM(am.amount_change) FROM award_amendment am
                             WHERE am.award_id = a.award_id), 0)""").fetchone()[0]
    ext = con.execute(
        "SELECT award_period_end FROM award WHERE award_id = 1").fetchone()[0]
    check("amendments applied: current amounts and extended dates on award rows",
          drift == 0 and ext == "2029-09-30", "award 1 now ends %s" % ext)

    # 7b. amendment history is append-only
    try:
        con.execute("DELETE FROM award_amendment WHERE amendment_id = 1")
        check("amendment history is append-only", False)
    except sqlite3.IntegrityError as e:
        check("amendment history is append-only", "append-only" in str(e))

    # 7c. de-obligating below spent is rejected
    try:
        record_amendment(con, 1, "2026-08-01", amount_change=-9500000,
                         description="test de-obligation")
        check("amendment cannot reduce award below amounts spent", False)
    except sqlite3.IntegrityError as e:
        check("amendment cannot reduce award below amounts spent",
              "below amounts already spent" in str(e))

    # 8. operating funds: view is sane, out-of-FY transactions rejected
    funds = con.execute(
        "SELECT COUNT(*), SUM(total_out), SUM(total_in) FROM v_fund_status").fetchone()
    ok_funds = funds[0] >= 4 and (funds[1] or 0) > 0 and (funds[2] or 0) > 0
    try:
        con.execute("INSERT INTO fund_transaction (fund_id, txn_type, amount, transaction_date) "
                    "VALUES (2, 'expense', 100, '2021-01-01')")
        ok_funds = False
    except sqlite3.IntegrityError as e:
        ok_funds = ok_funds and "outside the fund fiscal year" in str(e)
    check("operating funds tracked; out-of-FY fund transaction rejected", ok_funds,
          "%d fund-years" % funds[0])

    return results


def main():
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    for name in ("01_schema.sql", "02_triggers_views.sql", "03_seed_master.sql",
                 "04_users.sql", "05_documents.sql"):
        with open(os.path.join(SQL_DIR, name), encoding="utf-8") as f:
            con.executescript(f.read())
        print("applied", name)

    for username, (display, role, password) in DEMO_USERS.items():
        salt, digest, algo, iters = hash_password(password)
        con.execute(
            "INSERT INTO app_user (username, display_name, role, password_salt, "
            "password_hash, hash_algo, hash_iterations) VALUES (?,?,?,?,?,?,?)",
            (username, display, role, salt, digest, algo, iters))
    print("seeded %d app users (PBKDF2-HMAC-SHA256, salted)" % len(DEMO_USERS))

    n = generate_expenditures(con)
    print("generated %d expenditure rows (triggers populated rollups + audit log)" % n)
    nd = seed_documents(con)
    print("seeded %d award documents (sample PDFs in uploads/)" % nd)
    na = seed_amendments(con)
    print("seeded %d award amendments (trigger applied dates/amounts to awards)" % na)
    nf = generate_fund_transactions(con)
    print("generated %d operating-fund transactions" % nf)
    upd, dele = demo_paper_trail(con)
    print("paper-trail demo: updated expenditure %d, deleted expenditure %d" % (upd, dele))
    con.commit()

    print("\n--- verification ---")
    failures = 0
    for name, ok, detail in verify(con):
        print("%s  %s%s" % ("PASS" if ok else "FAIL", name,
                            ("  [" + detail + "]") if detail else ""))
        if not ok:
            failures += 1
    con.rollback()  # discard any partial state from the rejection tests

    print("\n--- SEFA FY2026 (from v_sefa) ---")
    for r in con.execute(
            "SELECT aln, program_title, total_expenditures, passed_to_subrecipients "
            "FROM v_sefa WHERE fy_label='FY2026' ORDER BY aln"):
        print("  %-7s %-55s %14s %14s" % (r[0], r[1][:55],
              "{:,.2f}".format(r[2]), "{:,.2f}".format(r[3] or 0)))

    print("\n--- SESFA FY2026 (from v_sesfa) ---")
    for r in con.execute(
            "SELECT csfa_number, program_title, state_award_type, total_expenditures "
            "FROM v_sesfa WHERE fy_label='FY2026' ORDER BY csfa_number"):
        print("  %-7s %-55s %-26s %14s" % (r[0], r[1][:55], r[2] or "",
              "{:,.2f}".format(r[3])))

    con.close()
    print("\ndatabase written to", DB)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
