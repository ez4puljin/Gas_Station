@echo off
setlocal enableextensions
cd /d "%~dp0"
title Fuel Retail System - Install (one-time setup)

echo ============================================================
echo   Fuel Retail System  -  Install / one-time setup
echo   Project root: %CD%
echo ============================================================
echo.
echo   Prerequisites (install these first if missing):
echo     - Node.js LTS v20+        https://nodejs.org
echo     - PostgreSQL 14+          https://www.postgresql.org
echo     - Redis (Memurai)         https://www.memurai.com
echo.

REM ---------- [1/8] Node.js (v20+) ----------
echo [1/8] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo     [X] Node.js not found. Install LTS v20+ from https://nodejs.org
  goto :fail
)
for /f "delims=" %%v in ('node --version') do set "NODEV=%%v"
echo     OK  Node %NODEV%
echo.

REM ---------- [2/8] pnpm (via corepack) ----------
echo [2/8] Checking pnpm...
where pnpm >nul 2>&1
if errorlevel 1 (
  echo     pnpm not found - enabling via corepack...
  corepack enable >nul 2>&1
  corepack prepare pnpm@9.15.9 --activate >nul 2>&1
)
where pnpm >nul 2>&1
if errorlevel 1 (
  echo     [X] pnpm unavailable. Run:  npm install -g pnpm
  goto :fail
)
for /f "delims=" %%v in ('pnpm --version') do set "PNPMV=%%v"
echo     OK  pnpm %PNPMV%
echo.

REM ---------- [3/8] Environment files ----------
echo [3/8] Creating .env files...
if not exist "apps\api\.env" (
  copy /Y ".env.example" "apps\api\.env" >nul
  echo     created  apps\api\.env   ^(from .env.example^)
) else (
  echo     apps\api\.env exists - kept
)
if not exist "apps\web\.env.local" (
  >"apps\web\.env.local" echo NEXT_PUBLIC_API_URL=http://localhost:4000
  >>"apps\web\.env.local" echo NEXT_PUBLIC_WS_URL=http://localhost:4000
  echo     created  apps\web\.env.local
) else (
  echo     apps\web\.env.local exists - kept
)
echo     NOTE: review apps\api\.env (DATABASE_URL, JWT secrets) before production.
echo.

REM ---------- [4/8] Install dependencies ----------
echo [4/8] pnpm install  ^(may take a few minutes^)...
call pnpm install
if errorlevel 1 (
  echo     [X] pnpm install failed
  goto :fail
)
echo     OK
echo.

REM ---------- [5/8] Build shared packages ----------
echo [5/8] Building shared packages ^(@fuel/types, @fuel/schemas^)...
call pnpm --filter @fuel/types --filter @fuel/schemas build
if errorlevel 1 (
  echo     [X] package build failed
  goto :fail
)
echo     OK
echo.

REM ---------- [6/8] PostgreSQL: fuel role + database ----------
echo [6/8] PostgreSQL  ^(role 'fuel' + database 'fuel'^)...
set "PSQL="
where psql >nul 2>&1 && set "PSQL=psql"
if not defined PSQL (
  for /d %%D in ("%ProgramFiles%\PostgreSQL\*") do if exist "%%D\bin\psql.exe" set "PSQL=%%D\bin\psql.exe"
)
if not defined PSQL (
  echo     [!] psql not found - is PostgreSQL installed (and on PATH)?
  goto :db_manual
)
echo     psql: %PSQL%
echo     Enter the PostgreSQL superuser ^(postgres^) password to auto-create the
echo     'fuel' role and database. Leave blank to skip and create them manually.
set "PGADMINPW="
set /p "PGADMINPW=    postgres password: "
if not defined PGADMINPW (
  echo     skipped
  goto :db_manual
)
set "PGPASSWORD=%PGADMINPW%"
"%PSQL%" -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -c "DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fuel') THEN CREATE ROLE fuel LOGIN PASSWORD 'fuel'; END IF; END $do$;"
if errorlevel 1 (
  set "PGPASSWORD="
  echo     [!] Could not connect/create role ^(wrong password or server stopped^).
  goto :db_manual
)
"%PSQL%" -U postgres -h localhost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='fuel'" | findstr "1" >nul
if errorlevel 1 "%PSQL%" -U postgres -h localhost -d postgres -c "CREATE DATABASE fuel OWNER fuel"
set "PGPASSWORD="
echo     OK  role 'fuel' + database 'fuel' ready
goto :db_done
:db_manual
echo.
echo     ^>^> Create the database manually as the postgres superuser:
echo          CREATE ROLE fuel LOGIN PASSWORD 'fuel';
echo          CREATE DATABASE fuel OWNER fuel;
echo        ^(or edit DATABASE_URL in apps\api\.env to match your own setup^)
echo.
:db_done
echo.

REM ---------- [7/8] Prisma client + migrations ----------
echo [7/8] Prisma generate + migrate deploy...
call pnpm db:generate
if errorlevel 1 (
  echo     [X] prisma generate failed
  goto :fail
)
call pnpm --filter @fuel/api exec prisma migrate deploy
if errorlevel 1 (
  echo     [X] migrate deploy failed.
  echo         Check: PostgreSQL running, 'fuel' database exists,
  echo                DATABASE_URL correct in apps\api\.env
  goto :fail
)
echo     OK
echo.

REM ---------- [8/8] Seed demo data ----------
echo [8/8] Seeding demo data  ^(admin user, fuel grades, station...^)...
call pnpm db:seed
if errorlevel 1 (
  echo     [!] seed reported an error ^(safe to ignore if already seeded^).
) else (
  echo     OK
)
echo.

echo ============================================================
echo   INSTALL COMPLETE
echo ------------------------------------------------------------
echo   Start the app:   start.bat          ^(or:  pnpm dev^)
echo   Web:    http://localhost:3000
echo   API:    http://localhost:4000/api
echo   Login:  admin / admin123
echo.
echo   Reminder: Redis must be running for login/sessions.
echo     - Windows: install Memurai (https://www.memurai.com), or
echo     - Docker:  docker compose up -d redis
echo ============================================================
echo.
pause
endlocal
exit /b 0

:fail
echo.
echo *** Install stopped. Fix the error above, then run install.bat again. ***
echo.
pause
endlocal
exit /b 1
