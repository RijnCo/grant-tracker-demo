"""Grant tracker demo server — City of Panama City, Florida.

Run:  python app.py     then open http://localhost:8765

Standard library only (Python 3.7+). Serves the frontend and a JSON API:
  POST /api/login        {username, password} -> session cookie
  POST /api/logout
  GET  /api/data         dashboard aggregates (auth required)
  GET  /api/lookups      dropdown data for entry forms (auth required)
  POST /api/expenditure  record spending against an award (writer roles)
  POST /api/award        set up a new grant award (writer roles)
  POST /api/amendment    amend an award's period of performance / funding
  POST /api/fund         set up an operating fund budget for a fiscal year
  POST /api/fund-transaction  record an operating-fund revenue or expense

Every expenditure insert runs through the database triggers, so the
department rollup, audit log, and validation controls (over-spend, fiscal-year
dates, subrecipient rules) apply exactly as they do in DBeaver.

Security notes (demo vs. production): passwords are per-user-salted
PBKDF2-HMAC-SHA256 (pcb_auth.py); sessions are random 256-bit tokens in an
HttpOnly cookie, held in memory. In production this runs behind HTTPS, the
application secrets move to Azure Key Vault, and identity comes from Entra ID.
"""
import json
import os
import secrets
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pcb_auth import verify_password
from export_data import collect

DB = os.path.join(HERE, "grants.db")
# serve the built React app if present; fall back to the legacy static page
WEBAPP_DIST = os.path.join(HERE, "webapp", "dist")
FRONTEND = WEBAPP_DIST if os.path.isdir(WEBAPP_DIST) else os.path.join(HERE, "frontend")
UPLOADS = os.path.join(HERE, "uploads")
MAX_PDF_BYTES = 10 * 1024 * 1024
PORT = 8765
WRITER_ROLES = ("grant_manager", "finance_admin")

SESSIONS = {}  # token -> {username, display_name, role} (cache over app_session)


def db():
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    return con


def token_hash(token):
    import hashlib
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def init_sessions():
    """Sessions survive server restarts: only a hash of the token is stored."""
    con = db()
    try:
        con.execute("""CREATE TABLE IF NOT EXISTS app_session (
            token_hash   TEXT PRIMARY KEY,
            username     TEXT NOT NULL,
            display_name TEXT,
            role         TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')))""")
        con.execute("DELETE FROM app_session WHERE created_at < datetime('now', '-7 days')")
        con.commit()
    finally:
        con.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "PCBGrants/1.0"

    # ---------- plumbing ----------
    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if getattr(self, "_set_cookie", None):
            self.send_header("Set-Cookie", self._set_cookie)
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > 1_000_000:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _session(self):
        cookie = self.headers.get("Cookie", "")
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k != "session" or not v:
                continue
            if v in SESSIONS:
                return SESSIONS[v]
            con = db()
            try:
                row = con.execute(
                    "SELECT username, display_name, role FROM app_session "
                    "WHERE token_hash = ?", (token_hash(v),)).fetchone()
            finally:
                con.close()
            if row:
                SESSIONS[v] = {"username": row[0], "display_name": row[1], "role": row[2]}
                return SESSIONS[v]
        return None

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------- static files ----------
    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        fname = os.path.normpath(path.lstrip("/"))
        full = os.path.join(FRONTEND, fname)
        if not full.startswith(FRONTEND):
            self._json(404, {"error": "not found"})
            return
        if not os.path.isfile(full):
            # SPA fallback: client-side routes (/grants/3, /audit, …) get index.html
            if os.path.splitext(fname)[1] == "":
                full = os.path.join(FRONTEND, "index.html")
            if not os.path.isfile(full):
                self._json(404, {"error": "not found"})
                return
        ctype = {".html": "text/html", ".js": "text/javascript",
                 ".css": "text/css", ".png": "image/png",
                 ".svg": "image/svg+xml", ".map": "application/json",
                 ".woff2": "font/woff2", ".ico": "image/x-icon"}.get(
                     os.path.splitext(full)[1], "application/octet-stream")
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- routes ----------
    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/uploads/"):
            if not self._session():
                return self._json(401, {"error": "login required"})
            fname = os.path.basename(path)   # flat directory; no traversal
            full = os.path.join(UPLOADS, fname)
            if not os.path.isfile(full):
                return self._json(404, {"error": "not found"})
            with open(full, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", 'inline; filename="%s"' % fname)
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/data":
            sess = self._session()
            if not sess:
                return self._json(401, {"error": "login required"})
            con = db()
            try:
                data = collect(con)
                data["user"] = sess
                return self._json(200, data)
            finally:
                con.close()
        if path == "/api/lookups":
            if not self._session():
                return self._json(401, {"error": "login required"})
            con = db()
            try:
                def rows(sql):
                    cur = con.execute(sql)
                    cols = [c[0] for c in cur.description]
                    return [dict(zip(cols, r)) for r in cur.fetchall()]
                return self._json(200, {
                    "awards": rows(
                        "SELECT a.award_id, a.award_name, a.fain_or_ptin, "
                        "COALESCE(a.current_award_amount, a.original_award_amount) AS budget, "
                        "a.award_period_start, a.award_period_end, "
                        "COALESCE((SELECT SUM(e.amount) FROM expenditure e "
                        " WHERE e.award_id = a.award_id), 0) AS spent "
                        "FROM award a ORDER BY a.award_name"),
                    "departments": rows(
                        "SELECT department_id, department_name FROM department "
                        "ORDER BY department_name"),
                    "fiscal_years": rows(
                        "SELECT fiscal_year_id, fy_label, start_date, end_date "
                        "FROM fiscal_year ORDER BY start_date"),
                    "subrecipients": rows(
                        "SELECT subrecipient_id, subrecipient_name FROM subrecipient "
                        "ORDER BY subrecipient_name"),
                    "programs": rows(
                        "SELECT p.program_id, p.aln, p.program_title, "
                        "fa.agency_level AS funding_source "
                        "FROM program p JOIN federal_agency fa ON fa.agency_id = p.agency_id "
                        "ORDER BY p.aln"),
                    "agencies": rows(
                        "SELECT agency_id, agency_name, agency_level "
                        "FROM federal_agency ORDER BY agency_name"),
                    "pass_throughs": rows(
                        "SELECT pass_through_id, pass_through_name FROM pass_through_entity "
                        "ORDER BY pass_through_name"),
                    "funds": rows(
                        "SELECT f.fund_id, f.fund_code, f.fund_name, fy.fy_label, "
                        "f.budget_amount FROM operating_fund f "
                        "JOIN fiscal_year fy ON fy.fiscal_year_id = f.fiscal_year_id "
                        "ORDER BY f.fund_code, fy.start_date"),
                })
            finally:
                con.close()
        return self._serve_static(path)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/login":
            return self._login()
        if path == "/api/logout":
            cookie = self.headers.get("Cookie", "")
            for part in cookie.split(";"):
                k, _, v = part.strip().partition("=")
                if k == "session" and v:
                    SESSIONS.pop(v, None)
                    con = db()
                    try:
                        con.execute("DELETE FROM app_session WHERE token_hash = ?",
                                    (token_hash(v),))
                        con.commit()
                    finally:
                        con.close()
            self._set_cookie = "session=; Path=/; Max-Age=0"
            return self._json(200, {"ok": True})

        sess = self._session()
        if not sess:
            return self._json(401, {"error": "login required"})
        if sess["role"] not in WRITER_ROLES:
            return self._json(403, {"error": "your role is read-only"})
        if path == "/api/expenditure":
            return self._add_expenditure(sess)
        if path == "/api/award":
            return self._add_award(sess)
        if path == "/api/amendment":
            return self._add_amendment(sess)
        if path == "/api/fund":
            return self._add_fund(sess)
        if path == "/api/fund-transaction":
            return self._add_fund_transaction(sess)
        if path == "/api/document":
            return self._upload_document(sess)
        if path == "/api/document-link":
            return self._link_document(sess)
        if path == "/api/program":
            return self._add_program(sess)
        if path == "/api/subrecipient":
            return self._add_named(sess, "subrecipient", "subrecipient_name",
                                   [("subrecipient_uei", "uei", 40)])
        if path == "/api/department":
            return self._add_named(sess, "department", "department_name", [])
        if path == "/api/passthrough":
            return self._add_named(sess, "pass_through_entity", "pass_through_name",
                                   [("pass_through_award_number", "award_number", 60)])
        return self._json(404, {"error": "not found"})

    # ---------- handlers ----------
    def _login(self):
        body = self._body()
        username = str(body.get("username", "")).strip().lower()
        password = str(body.get("password", ""))
        con = db()
        try:
            row = con.execute(
                "SELECT username, display_name, role, password_salt, password_hash, "
                "hash_iterations, is_active FROM app_user WHERE username = ?",
                (username,)).fetchone()
            ok = bool(row and row[6] and
                      verify_password(password, row[3], row[4], row[5]))
            con.execute(
                "INSERT INTO login_audit (username, success) VALUES (?,?)",
                (username or "(blank)", 1 if ok else 0))
            if ok:
                con.execute("UPDATE app_user SET last_login = datetime('now') "
                            "WHERE username = ?", (username,))
            con.commit()
        finally:
            con.close()
        if not ok:
            return self._json(401, {"error": "invalid username or password"})
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = {"username": row[0], "display_name": row[1], "role": row[2]}
        con = db()
        try:
            con.execute(
                "INSERT INTO app_session (token_hash, username, display_name, role) "
                "VALUES (?,?,?,?)", (token_hash(token), row[0], row[1], row[2]))
            con.commit()
        finally:
            con.close()
        self._set_cookie = "session=%s; Path=/; HttpOnly; SameSite=Lax" % token
        return self._json(200, {"ok": True, "user": SESSIONS[token]})

    def _add_expenditure(self, sess):
        b = self._body()
        try:
            award_id = int(b["award_id"])
            department_id = int(b["department_id"])
            amount = round(float(b["amount"]), 2)
            txn_date = str(b["transaction_date"])
        except (KeyError, TypeError, ValueError):
            return self._json(400, {"error": "award, department, amount, and date are required"})
        if amount == 0:
            return self._json(400, {"error": "amount cannot be zero"})
        con = db()
        try:
            fy = con.execute(
                "SELECT fiscal_year_id FROM fiscal_year WHERE ? BETWEEN start_date AND end_date",
                (txn_date,)).fetchone()
            if not fy:
                return self._json(400, {"error": "date %s is not inside any defined fiscal year" % txn_date})
            sub_id = b.get("subrecipient_id") or None
            sub_amt = round(float(b.get("amount_to_subrecipient") or 0), 2)
            try:
                cur = con.execute(
                    """INSERT INTO expenditure
                       (award_id, fiscal_year_id, department_id, amount, transaction_date,
                        description, amount_to_subrecipient, subrecipient_id,
                        is_adjustment, doc_reference, entered_by)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (award_id, fy[0], department_id, amount, txn_date,
                     str(b.get("description") or "")[:500], sub_amt,
                     int(sub_id) if sub_id else None,
                     1 if amount < 0 else 0,
                     str(b.get("doc_reference") or "")[:120], sess["username"]))
                con.commit()
            except sqlite3.IntegrityError as e:
                return self._json(400, {"error": str(e)})
            status = con.execute(
                "SELECT award_name, current_award_amount AS budget, total_spent, remaining "
                "FROM v_award_status WHERE award_id = ?", (award_id,)).fetchone()
            return self._json(200, {
                "ok": True, "expenditure_id": cur.lastrowid,
                "award_name": status[0], "budget": status[1],
                "spent": status[2], "remaining": status[3]})
        finally:
            con.close()

    def _add_award(self, sess):
        b = self._body()
        try:
            program_id = int(b["program_id"])
            name = str(b["award_name"]).strip()
            amount = round(float(b["original_award_amount"]), 2)
        except (KeyError, TypeError, ValueError):
            return self._json(400, {"error": "program, award name, and amount are required"})
        if not name or amount <= 0:
            return self._json(400, {"error": "award needs a name and a positive amount"})
        pass_through = b.get("pass_through_id") or None
        con = db()
        try:
            level = con.execute(
                "SELECT fa.agency_level FROM program p "
                "JOIN federal_agency fa ON fa.agency_id = p.agency_id "
                "WHERE p.program_id = ?", (program_id,)).fetchone()
            if not level:
                return self._json(400, {"error": "unknown program"})
            is_state = level[0] == "STATE"
            state_award_type = str(b.get("state_award_type") or "") or None
            if state_award_type and state_award_type not in (
                    "legislative_appropriation", "state_grant_agreement",
                    "state_revolving_fund", "other"):
                return self._json(400, {"error": "unknown state award type"})
            if is_state and not state_award_type:
                state_award_type = "state_grant_agreement"
            if not is_state:
                state_award_type = None
            identifier = ("STATE" if is_state
                          else "PASS_THROUGH" if pass_through else "FAIN")
            cur = con.execute(
                """INSERT INTO award (fain_or_ptin, identifier_type, award_name, program_id,
                       pass_through_id, is_direct, original_award_amount, award_date,
                       award_period_start, award_period_end, award_type,
                       state_award_type, de_minimis_elected)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (str(b.get("fain_or_ptin") or "")[:60],
                 identifier,
                 name[:200], program_id,
                 int(pass_through) if pass_through else None,
                 0 if pass_through else 1, amount,
                 str(b.get("award_date") or "") or None,
                 str(b.get("award_period_start") or "") or None,
                 str(b.get("award_period_end") or "") or None,
                 str(b.get("award_type") or "grant"),
                 state_award_type,
                 1 if b.get("de_minimis_elected") else 0))
            con.commit()
            return self._json(200, {"ok": True, "award_id": cur.lastrowid,
                                    "award_name": name, "budget": amount})
        except sqlite3.IntegrityError as e:
            return self._json(400, {"error": str(e)})
        finally:
            con.close()

    def _add_amendment(self, sess):
        """Amend an award: change the period of performance, add (or de-obligate)
        funding, or both. The old values are snapshotted here and the database
        trigger applies the change to the award row — an append-only paper trail."""
        b = self._body()
        try:
            award_id = int(b["award_id"])
            amendment_date = str(b["amendment_date"])
        except (KeyError, TypeError, ValueError):
            return self._json(400, {"error": "award and amendment date are required"})
        new_start = str(b.get("new_period_start") or "") or None
        new_end = str(b.get("new_period_end") or "") or None
        try:
            amount_change = round(float(b.get("amount_change") or 0), 2)
        except (TypeError, ValueError):
            return self._json(400, {"error": "amount change must be a number"})
        con = db()
        try:
            row = con.execute(
                "SELECT award_period_start, award_period_end, "
                "COALESCE(current_award_amount, original_award_amount), award_name "
                "FROM award WHERE award_id = ?", (award_id,)).fetchone()
            if not row:
                return self._json(400, {"error": "unknown award"})
            old_start, old_end, old_amount, award_name = row
            # drop "changes" that match what the award already says
            if new_start == old_start:
                new_start = None
            if new_end == old_end:
                new_end = None
            dates_changed = bool(new_start or new_end)
            if not dates_changed and not amount_change:
                return self._json(400, {"error": "nothing to amend: change the dates, the amount, or both"})
            atype = ("combined" if dates_changed and amount_change
                     else "period_change" if dates_changed else "additional_funding")
            number = con.execute(
                "SELECT COALESCE(MAX(amendment_number), 0) + 1 FROM award_amendment "
                "WHERE award_id = ?", (award_id,)).fetchone()[0]
            try:
                cur = con.execute(
                    """INSERT INTO award_amendment
                       (award_id, amendment_number, amendment_date, amendment_type,
                        old_period_start, new_period_start, old_period_end, new_period_end,
                        old_award_amount, new_award_amount, amount_change,
                        description, entered_by)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (award_id, number, amendment_date, atype,
                     old_start, new_start, old_end, new_end,
                     old_amount, (old_amount or 0) + amount_change, amount_change,
                     str(b.get("description") or "")[:500], sess["username"]))
                con.commit()
            except sqlite3.IntegrityError as e:
                return self._json(400, {"error": str(e)})
            status = con.execute(
                "SELECT current_award_amount, total_spent, remaining, "
                "award_period_start, award_period_end "
                "FROM v_award_status WHERE award_id = ?", (award_id,)).fetchone()
            return self._json(200, {
                "ok": True, "amendment_id": cur.lastrowid,
                "amendment_number": number, "award_name": award_name,
                "budget": status[0], "spent": status[1], "remaining": status[2],
                "period_start": status[3], "period_end": status[4]})
        finally:
            con.close()

    def _add_fund(self, sess):
        b = self._body()
        try:
            fund_code = str(b["fund_code"]).strip()[:20]
            fund_name = str(b["fund_name"]).strip()[:200]
            fiscal_year_id = int(b["fiscal_year_id"])
            budget = round(float(b["budget_amount"]), 2)
        except (KeyError, TypeError, ValueError):
            return self._json(400, {"error": "fund code, name, fiscal year, and budget are required"})
        if not fund_code or not fund_name or budget <= 0:
            return self._json(400, {"error": "fund needs a code, a name, and a positive budget"})
        con = db()
        try:
            try:
                cur = con.execute(
                    "INSERT INTO operating_fund (fund_code, fund_name, fiscal_year_id, "
                    "budget_amount, notes) VALUES (?,?,?,?,?)",
                    (fund_code, fund_name, fiscal_year_id, budget,
                     str(b.get("notes") or "")[:300] or None))
                con.commit()
            except sqlite3.IntegrityError as e:
                if "UNIQUE" in str(e):
                    return self._json(400, {"error": "fund %s already has a budget for that fiscal year" % fund_code})
                return self._json(400, {"error": str(e)})
            return self._json(200, {"ok": True, "fund_id": cur.lastrowid,
                                    "fund_code": fund_code, "fund_name": fund_name})
        finally:
            con.close()

    def _add_fund_transaction(self, sess):
        b = self._body()
        try:
            fund_id = int(b["fund_id"])
            txn_type = str(b["txn_type"])
            amount = round(float(b["amount"]), 2)
            txn_date = str(b["transaction_date"])
        except (KeyError, TypeError, ValueError):
            return self._json(400, {"error": "fund, type, amount, and date are required"})
        if txn_type not in ("expense", "revenue", "transfer_in", "transfer_out"):
            return self._json(400, {"error": "unknown transaction type"})
        dept = b.get("department_id") or None
        con = db()
        try:
            try:
                cur = con.execute(
                    """INSERT INTO fund_transaction
                       (fund_id, department_id, txn_type, amount, transaction_date,
                        description, doc_reference, entered_by)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    (fund_id, int(dept) if dept else None, txn_type, amount, txn_date,
                     str(b.get("description") or "")[:500],
                     str(b.get("doc_reference") or "")[:120], sess["username"]))
                con.commit()
            except sqlite3.IntegrityError as e:
                return self._json(400, {"error": str(e)})
            status = con.execute(
                "SELECT fund_code, fund_name, budget_amount, total_in, total_out, available "
                "FROM v_fund_status WHERE fund_id = ?", (fund_id,)).fetchone()
            return self._json(200, {
                "ok": True, "fund_txn_id": cur.lastrowid,
                "fund_code": status[0], "fund_name": status[1],
                "budget": status[2], "total_in": status[3],
                "total_out": status[4], "available": status[5]})
        finally:
            con.close()


    def _add_named(self, sess, table, name_col, extras):
        """Create a simple reference row (subrecipient / department /
        pass-through entity): a required name plus optional extra columns."""
        b = self._body()
        name = str(b.get("name") or "").strip()[:200]
        if not name:
            return self._json(400, {"error": "a name is required"})
        con = db()
        try:
            dup = con.execute(
                "SELECT 1 FROM %s WHERE lower(%s) = lower(?)" % (table, name_col),
                (name,)).fetchone()
            if dup:
                return self._json(400, {"error": '"%s" already exists' % name})
            cols, vals = [name_col], [name]
            for col, key, maxlen in extras:
                v = str(b.get(key) or "").strip()[:maxlen]
                if v:
                    cols.append(col)
                    vals.append(v)
            cur = con.execute(
                "INSERT INTO %s (%s) VALUES (%s)"
                % (table, ", ".join(cols), ", ".join("?" * len(vals))), vals)
            con.commit()
            return self._json(200, {"ok": True, "id": cur.lastrowid, "name": name})
        finally:
            con.close()

    def _add_program(self, sess):
        """Manually add a program: a federal Assistance Listing (ALN) or a
        Florida state program (CSFA number) — both use the ##.### format."""
        import re
        b = self._body()
        aln = str(b.get("aln") or "").strip()
        title = str(b.get("program_title") or "").strip()
        level = str(b.get("funding_source") or "FEDERAL").upper()
        if level not in ("FEDERAL", "STATE"):
            return self._json(400, {"error": "funding source must be FEDERAL or STATE"})
        if not re.match(r"^\d{2}\.\d{3}[A-Za-z]?$", aln):
            return self._json(400, {"error": "the %s must look like 20.205"
                                    % ("CSFA number" if level == "STATE" else "ALN")})
        if not title:
            return self._json(400, {"error": "program title is required"})
        con = db()
        try:
            if con.execute("SELECT 1 FROM program WHERE aln = ?", (aln,)).fetchone():
                return self._json(400, {"error": "a program with number %s already exists" % aln})
            agency_id = b.get("agency_id") or None
            new_agency = str(b.get("new_agency_name") or "").strip()
            if agency_id:
                agency_id = int(agency_id)
                row = con.execute("SELECT agency_level FROM federal_agency WHERE agency_id = ?",
                                  (agency_id,)).fetchone()
                if not row:
                    return self._json(400, {"error": "unknown agency"})
                if row[0] != level:
                    return self._json(400, {"error": "that agency is %s; pick a matching one" % row[0].lower()})
            elif new_agency:
                cur = con.execute(
                    "INSERT INTO federal_agency (agency_name, aln_prefix, agency_level) VALUES (?,?,?)",
                    (new_agency[:200], aln.split(".")[0], level))
                agency_id = cur.lastrowid
            else:
                return self._json(400, {"error": "pick an agency or name a new one"})
            cluster = str(b.get("cluster_name") or "").strip() or None
            cur = con.execute(
                "INSERT INTO program (aln, program_title, agency_id, cluster_name, is_clustered) "
                "VALUES (?,?,?,?,?)",
                (aln, title[:300], agency_id, cluster, 1 if cluster else 0))
            con.commit()
            return self._json(200, {"ok": True, "program_id": cur.lastrowid,
                                    "aln": aln, "program_title": title})
        finally:
            con.close()

    def _upload_document(self, sess):
        """Raw PDF body; award_id / file_name / doc_type via query string."""
        from urllib.parse import parse_qs, urlparse, unquote
        q = parse_qs(urlparse(self.path).query)
        try:
            award_id = int(q["award_id"][0])
            file_name = unquote(q["file_name"][0]).strip()
        except (KeyError, ValueError, IndexError):
            return self._json(400, {"error": "award_id and file_name are required"})
        file_name = "".join(c for c in file_name if c.isalnum() or c in "._- ")[:120] or "document.pdf"
        doc_type = q.get("doc_type", ["other"])[0]
        if doc_type not in ("award_letter", "amendment", "invoice", "report", "other"):
            doc_type = "other"
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > MAX_PDF_BYTES:
            return self._json(400, {"error": "file must be under 10 MB"})
        body = self.rfile.read(length)
        if not body.startswith(b"%PDF"):
            return self._json(400, {"error": "only PDF files are accepted"})
        os.makedirs(UPLOADS, exist_ok=True)
        con = db()
        try:
            if not con.execute("SELECT 1 FROM award WHERE award_id = ?", (award_id,)).fetchone():
                return self._json(400, {"error": "unknown award"})
            cur = con.execute(
                "INSERT INTO award_document (award_id, file_name, storage_path, doc_type, "
                "file_size, uploaded_by) VALUES (?,?,?,?,?,?)",
                (award_id, file_name, "pending", doc_type, len(body), sess["username"]))
            doc_id = cur.lastrowid
            rel = "uploads/doc_%d.pdf" % doc_id
            with open(os.path.join(HERE, "uploads", "doc_%d.pdf" % doc_id), "wb") as f:
                f.write(body)
            con.execute("UPDATE award_document SET storage_path = ? WHERE document_id = ?",
                        (rel, doc_id))
            con.commit()
            return self._json(200, {"ok": True, "document_id": doc_id,
                                    "file_name": file_name, "storage_path": rel})
        finally:
            con.close()

    def _link_document(self, sess):
        b = self._body()
        try:
            award_id = int(b["award_id"])
            file_name = str(b["file_name"]).strip()[:120]
            url = str(b["external_url"]).strip()
        except (KeyError, TypeError, ValueError):
            return self._json(400, {"error": "award_id, file_name, and external_url are required"})
        if not file_name or not (url.startswith("https://") or url.startswith("http://")):
            return self._json(400, {"error": "a name and an http(s) URL are required"})
        con = db()
        try:
            if not con.execute("SELECT 1 FROM award WHERE award_id = ?", (award_id,)).fetchone():
                return self._json(400, {"error": "unknown award"})
            doc_type = str(b.get("doc_type") or "other")
            if doc_type not in ("award_letter", "amendment", "invoice", "report", "other"):
                doc_type = "other"
            cur = con.execute(
                "INSERT INTO award_document (award_id, file_name, external_url, doc_type, uploaded_by) "
                "VALUES (?,?,?,?,?)",
                (award_id, file_name, url[:500], doc_type, sess["username"]))
            con.commit()
            return self._json(200, {"ok": True, "document_id": cur.lastrowid,
                                    "file_name": file_name})
        finally:
            con.close()


def main():
    init_sessions()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("City of Panama City grant tracker: http://localhost:%d" % PORT)
    print("demo logins: alopez / Sunshine!2026 (grant manager), "
          "jrivera / SandDollar!26 (finance), viewer / Welcome!2026 (read-only)")
    server.serve_forever()


if __name__ == "__main__":
    main()
