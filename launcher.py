"""Panama City · City Operations — executable entry point.

Double-click behavior:
  1. Keeps its data (grants.db + uploads/) NEXT TO the executable, so the
     whole install can be backed up or moved by copying one folder. If that
     location is not writable (e.g. Program Files), it falls back to
     %LOCALAPPDATA%\\PanamaCityOperations.
  2. Creates a blank database on first run (schema + controls, no data).
  3. Picks a free port, starts the server, and opens the browser — the first
     visitor is asked to create the administrator account.
"""
import os
import socket
import sys
import threading
import webbrowser


def base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def pick_data_dir():
    base = base_dir()
    try:
        probe = os.path.join(base, ".write-test")
        with open(probe, "w") as f:
            f.write("ok")
        os.remove(probe)
        return base
    except OSError:
        fallback = os.path.join(os.environ.get("LOCALAPPDATA", base),
                                "PanamaCityOperations")
        os.makedirs(fallback, exist_ok=True)
        return fallback


def pick_port(start=8765, tries=20):
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("no free port found between %d and %d" % (start, start + tries - 1))


def main():
    data_dir = pick_data_dir()
    port = pick_port(int(os.environ.get("PC_OPS_PORT", "8765")))
    os.environ["PC_OPS_DATA_DIR"] = data_dir
    os.environ["PC_OPS_PORT"] = str(port)

    db_path = os.path.join(data_dir, "grants.db")
    first_run = not os.path.exists(db_path)
    if first_run:
        import init_db
        init_db.init_blank(db_path)

    import app  # reads PC_OPS_DATA_DIR / PC_OPS_PORT at import

    url = "http://localhost:%d/" % port
    print("=" * 62)
    print("  Panama City - City Operations")
    print("  Data folder : %s" % data_dir)
    print("  Address     : %s" % url)
    if first_run:
        print("  First run   : blank database created - the browser will ask")
        print("                you to create the administrator account.")
    print("  Leave this window open while you work. Close it (or press")
    print("  Ctrl+C) to stop the server. Back up by copying grants.db.")
    print("=" * 62)
    threading.Timer(1.0, webbrowser.open, [url]).start()
    try:
        app.main()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # show the error before the console window closes
        print("\nERROR:", e)
        try:
            input("Press Enter to close…")
        except EOFError:
            pass
        sys.exit(1)
