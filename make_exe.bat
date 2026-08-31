@echo off
rem Build PanamaCityOperations.exe (single file, no install needed to run it).
rem Prereqs: Python 3.7+ with PyInstaller, and the frontend already built
rem (cd webapp && npm run build). Output lands in dist\PanamaCityOperations.exe
python -m pip install "pyinstaller==5.13.2" || exit /b 1
python -m PyInstaller --noconfirm --onefile --console --name PanamaCityOperations ^
  --add-data "webapp/dist;webapp/dist" ^
  --add-data "sql/01_schema.sql;sql" ^
  --add-data "sql/02_triggers_views.sql;sql" ^
  --add-data "sql/04_users.sql;sql" ^
  --add-data "sql/05_documents.sql;sql" ^
  launcher.py
echo.
echo Built dist\PanamaCityOperations.exe
