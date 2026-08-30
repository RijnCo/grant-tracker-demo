"""Shared revenue-tracker math: seasonal collection baselines and alerts.

The variance warnings and automated alerts compare each stream's actual
year-to-date collections against its *seasonal* baseline — the share of the
annual budget the city expects to have collected by a given date (ad valorem
arrives mostly Nov-Jan, utility fees peak in summer, and so on). Streams with
no revenue_seasonality rows are treated as uniform (1/12 per month).

Used by app.py (on each receipt entry/import) and build_db.py (seed + verify).
"""
from calendar import monthrange
from datetime import date

UNIFORM_SHARE = 1.0 / 12.0
BEHIND_THRESHOLD_PCT = -10.0   # alert when actuals trail baseline by >10%
MIN_EXPECTED_SHARE = 0.05      # suppress alerts in the first days of a FY
ALERT_QUIET_DAYS = 30          # one alert per stream/FY/type per 30 days


def _iso(d):
    return date(*map(int, d.split("-"))) if isinstance(d, str) else d


def month_shares(con, stream_id):
    """Normalized 12-month collection curve (index 0 = first fiscal month)."""
    rows = con.execute(
        "SELECT fy_month, share FROM revenue_seasonality "
        "WHERE stream_id = ?", (stream_id,)).fetchall()
    if not rows:
        return [UNIFORM_SHARE] * 12
    shares = [0.0] * 12
    for m, s in rows:
        shares[m - 1] = float(s)
    total = sum(shares) or 1.0
    return [s / total for s in shares]


def expected_share_to_date(shares, fy_start, fy_end, as_of):
    """Cumulative share of the annual budget expected by as_of (0..1):
    full elapsed fiscal months plus a day-fraction of the current month."""
    start, end = _iso(fy_start), _iso(fy_end)
    d = _iso(as_of)
    if d < start:
        return 0.0
    if d >= end:
        return 1.0
    months = (d.year - start.year) * 12 + (d.month - start.month)
    if months >= 12:
        return 1.0
    frac = d.day / monthrange(d.year, d.month)[1]
    return min(1.0, sum(shares[:months]) + shares[months] * frac)


def stream_pace(con, stream_id, fiscal_year_id, as_of):
    """(budget, expected_to_date, actual_to_date, variance_pct) or None."""
    row = con.execute(
        "SELECT b.budgeted_amount, fy.start_date, fy.end_date "
        "FROM revenue_budget b "
        "JOIN fiscal_year fy ON fy.fiscal_year_id = b.fiscal_year_id "
        "WHERE b.stream_id = ? AND b.fiscal_year_id = ?",
        (stream_id, fiscal_year_id)).fetchone()
    if not row:
        return None
    budget, fy_start, fy_end = row
    share = expected_share_to_date(month_shares(con, stream_id),
                                   fy_start, fy_end, as_of)
    expected = budget * share
    actual = con.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM revenue_receipt "
        "WHERE stream_id = ? AND fiscal_year_id = ?",
        (stream_id, fiscal_year_id)).fetchone()[0]
    variance_pct = ((actual - expected) / expected * 100.0) if expected > 0 else 0.0
    return budget, expected, actual, variance_pct, share


def evaluate_stream_alert(con, stream_id, fiscal_year_id, as_of):
    """Write a behind-baseline alert when a stream trails its seasonal
    baseline by more than 10% (the local stand-in for the alert email).
    Returns the inserted alert as a dict, or None."""
    pace = stream_pace(con, stream_id, fiscal_year_id, as_of)
    if not pace:
        return None
    budget, expected, actual, variance_pct, share = pace
    if share < MIN_EXPECTED_SHARE or expected <= 0:
        return None
    if variance_pct > BEHIND_THRESHOLD_PCT:
        return None
    recent = con.execute(
        "SELECT 1 FROM revenue_alert "
        "WHERE stream_id = ? AND fiscal_year_id = ? "
        "  AND alert_type = 'behind_baseline' "
        "  AND julianday(?) - julianday(alert_date) < ?",
        (stream_id, fiscal_year_id, str(as_of), ALERT_QUIET_DAYS)).fetchone()
    if recent:
        return None
    name, fy_label = con.execute(
        "SELECT s.stream_name, fy.fy_label FROM revenue_stream s, fiscal_year fy "
        "WHERE s.stream_id = ? AND fy.fiscal_year_id = ?",
        (stream_id, fiscal_year_id)).fetchone()
    message = ("%s is %.1f%% behind its seasonal baseline for %s: "
               "$%s collected vs. $%s expected to date."
               % (name, abs(variance_pct), fy_label,
                  "{:,.0f}".format(actual), "{:,.0f}".format(expected)))
    cur = con.execute(
        "INSERT INTO revenue_alert (stream_id, fiscal_year_id, alert_date, "
        "alert_type, message, expected_to_date, actual_to_date, variance_pct) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (stream_id, fiscal_year_id, str(as_of), "behind_baseline", message,
         round(expected, 2), round(actual, 2), round(variance_pct, 1)))
    return {"alert_id": cur.lastrowid, "alert_type": "behind_baseline",
            "message": message, "variance_pct": round(variance_pct, 1)}
