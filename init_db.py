"""Create a BLANK grants.db — full schema, triggers, views, and controls,
but no data beyond the entity profile and empty fiscal-year calendars.

Run:  python init_db.py           (refuses to overwrite an existing database)

This is what the packaged executable runs on first launch. The first person
to open the app in a browser is walked through creating the administrator
account; everything else (awards, revenue streams, CRA districts, billing
tickets…) is entered through the app.

For a database full of demo data instead, run build_db.py.
"""
import os
import sqlite3
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
RESOURCES = getattr(sys, "_MEIPASS", HERE)
SQL_DIR = os.path.join(RESOURCES, "sql")

CITY = "City of Panama City, Florida"
SCHEMA_FILES = ("01_schema.sql", "02_triggers_views.sql",
                "04_users.sql", "05_documents.sql")  # 03 is demo seed data


def fiscal_years(today=None):
    """Florida local-government fiscal years (Oct 1 – Sep 30), labelled by
    ending year: last year, the current one, and the next two."""
    today = today or date.today()
    current_end = today.year + 1 if today.month >= 10 else today.year
    out = []
    for i, end in enumerate(range(current_end - 1, current_end + 3), start=1):
        out.append((i, "FY%d" % end, "%d-10-01" % (end - 1), "%d-09-30" % end))
    return out


def init_blank(db_path, city=CITY):
    if os.path.exists(db_path):
        raise FileExistsError(db_path)
    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA journal_mode = WAL")  # persists in the file
        con.execute("PRAGMA foreign_keys = ON")
        for name in SCHEMA_FILES:
            with open(os.path.join(SQL_DIR, name), encoding="utf-8") as f:
                con.executescript(f.read())
        con.execute(
            "INSERT INTO entity_profile (entity_id, auditee_name, auditee_uei, "
            "auditee_ein, fiscal_year_end, basis_of_accounting) "
            "VALUES (1, ?, 'PENDING-UEI', '00-0000000', '09-30', 'MODIFIED_ACCRUAL')",
            (city,))
        con.executemany(
            "INSERT INTO fiscal_year (fiscal_year_id, fy_label, start_date, end_date) "
            "VALUES (?,?,?,?)", fiscal_years())
        con.commit()
    finally:
        con.close()
    return db_path


def main():
    db_path = os.path.join(os.environ.get("PC_OPS_DATA_DIR", HERE), "grants.db")
    try:
        init_blank(db_path)
    except FileExistsError:
        print("Refusing to overwrite the existing database:", db_path)
        print("Delete or move it first if you really want a fresh start.")
        sys.exit(1)
    fys = ", ".join(f[1] for f in fiscal_years())
    print("Blank database created:", db_path)
    print("Entity: %s  -  fiscal years %s" % (CITY, fys))
    print("Start the app (python app.py or the executable) and open it in a")
    print("browser. Sign-in is currently switched off, so it opens straight")
    print("to the dashboard.")


if __name__ == "__main__":
    main()
