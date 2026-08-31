# Panama City · City Operations — Install Guide

One tool for the city's day-to-day tracking: grant awards (SEFA/SESFA),
every revenue stream with seasonal pacing and alerts, operating funds, CRA
districts, utility billing adjustments, and revenue integrity work. All data
lives in a single local SQLite file — nothing leaves your computer.

---

## Option 1 — The executable (easiest, zero dependencies)

**Requirements: a Windows 10/11 PC and a web browser. That's it.**

1. Download `PanamaCityOperations.exe` from the
   [Releases page](https://github.com/RijnCo/grant-tracker-demo/releases).
2. Put it in a folder you control (e.g. `Documents\CityOperations\`).
3. Double-click it. A console window opens (leave it open — that's the
   server) and your browser opens the app.
4. It opens straight to the dashboard — **there is no login right now**
   (see "Sign-in is currently off" below). The database starts **blank**.
5. Start entering data: revenue streams and budgets on **Revenue tracker**,
   billing tickets on **Utility billing**, awards under **Grants**, districts
   on **CRA districts**, and so on.

Notes:
- Your data is the `grants.db` file created **next to the .exe**. **Back up
  by copying that one file.** Moving the folder moves the whole install.
- Windows SmartScreen may warn about an unsigned app the first time — choose
  "More info → Run anyway".
- Close the console window (or press Ctrl+C in it) to stop the server.
- If port 8765 is busy the app automatically picks the next free port and
  prints the address it chose.
- If the folder isn't writable (e.g. Program Files), data goes to
  `%LOCALAPPDATA%\PanamaCityOperations` instead — the console prints the
  data folder on every start.

## Option 2 — Run from source

**Requirements: Python 3.7 or newer. Nothing else — the server uses only the
Python standard library (no pip packages).**

```
git clone https://github.com/RijnCo/grant-tracker-demo.git
cd grant-tracker-demo
python init_db.py       # blank database (or: python build_db.py for demo data)
python app.py           # then open http://localhost:8765
```

The repository does not commit the built frontend (`webapp/dist`), so running
from a fresh clone also needs **Node.js 18+** once, to build it:

```
cd webapp
npm install
npm run build
```

After that, only Python is needed day to day.

## Option 3 — Build the executable yourself

Requirements: Python 3.7+ and Node.js 18+ (to build the frontend), then:

```
cd webapp && npm install && npm run build && cd ..
make_exe.bat            # installs PyInstaller and produces dist\PanamaCityOperations.exe
```

---

## Dependency summary

| Scenario                | What you need                                     |
| ----------------------- | ------------------------------------------------- |
| Use the .exe            | Nothing — Windows + a browser                     |
| Run from source         | Python 3.7+ (stdlib only); Node.js 18+ once, to build the frontend |
| Build the .exe          | Python 3.7+, Node.js 18+, PyInstaller (installed by `make_exe.bat`) |
| Rebuild demo data       | Python 3.7+ (`python build_db.py`)                |

## Good to know

- **Blank vs. demo:** `init_db.py` creates an empty, production-ready
  database (schema, validation triggers, append-only audit logs, fiscal-year
  calendar, first-run admin setup). `build_db.py` creates the demo database
  full of fictional data and demo logins — useful for training.
- **Sign-in is currently off.** The app opens straight to the dashboard as a
  standing "Local User" with full write access. Everything that implements
  authentication is still in place and still works — the `app_user` table,
  PBKDF2 password hashing (`pcb_auth.py`), the append-only `login_audit`,
  server-side sessions, the login screen, and the first-run administrator
  setup. Turning it back on is a one-line change: set `REQUIRE_LOGIN = True`
  in `app.py`, or start the app with the environment variable
  `PC_OPS_REQUIRE_LOGIN=1`. On a blank database the first visitor is then
  asked to create the administrator account.
- **Fixing mistakes:** records can be deleted — look for the trash icon on
  any row. Reference data (a department typed "Watr") comes straight out;
  removing anything financial asks for a reason and is recorded on the
  **Audit trail → Removals** panel. If something is still in use, the dialog
  tells you what is referencing it instead of letting you orphan the history.
- **Backups:** copy `grants.db` (and the `uploads/` folder if you attach
  PDFs). That's the entire system state.
- **Security scope:** the server binds to `127.0.0.1` only — it is a
  single-machine tool, not a network service. Put it behind HTTPS and real
  identity (Entra ID) before ever exposing it beyond one computer; see the
  `migration/` folder for the SharePoint/Azure path.
