@echo off
setlocal enableextensions
cd /d "%~dp0"
title Fuel Retail System - Install (one-time setup)

set "REDIS_OK=0"
set "NODEV=?"
set "PNPMV=?"

echo ============================================================
echo   Fuel Retail System  -  Install / one-time setup
echo   Project root: %CD%
echo ============================================================
echo.
echo   Fully automatic setup. This installer will:
echo     - check Node.js
echo     - install pnpm if missing  (corepack, then npm -g)
echo     - create .env files
echo     - install dependencies + build shared packages
echo     - set up the PostgreSQL 'fuel' role + database
echo     - install + start Redis    (needed for login/sessions)
echo     - run database migrations + seed demo data
echo.

REM ---------- [1/9] Node.js (v20+) ----------
echo [1/9] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo     [X] Node.js not found. Install LTS v20+ from https://nodejs.org
  echo         then run install.bat again.
  goto :fail
)
for /f "delims=" %%v in ('node --version') do set "NODEV=%%v"
echo     OK  Node %NODEV%
echo.

REM ---------- [2/9] pnpm (auto-install, no manual step) ----------
echo [2/9] Checking pnpm...
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok
echo     pnpm not found - enabling via corepack...
call corepack enable >nul 2>&1
call corepack prepare pnpm@9.15.9 --activate >nul 2>&1
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok
echo     corepack unavailable - installing pnpm globally via npm...
call npm install -g pnpm@9.15.9
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok
REM still not on PATH this session - add npm global prefix and retry
for /f "delims=" %%p in ('npm prefix -g 2^>nul') do set "NPMG=%%p"
if defined NPMG set "PATH=%NPMG%;%PATH%"
where pnpm >nul 2>&1
if not errorlevel 1 goto :pnpm_ok
echo     [X] pnpm still unavailable after auto-install.
echo         Close this window, open a NEW terminal, run:  npm install -g pnpm
echo         then run install.bat again.
goto :fail
:pnpm_ok
for /f "delims=" %%v in ('pnpm --version') do set "PNPMV=%%v"
echo     OK  pnpm %PNPMV%
echo.

REM ---------- [3/9] Environment files ----------
echo [3/9] Creating .env files...
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

REM ---------- [4/9] Install dependencies ----------
echo [4/9] pnpm install  ^(may take a few minutes^)...
call pnpm install
if errorlevel 1 (
  echo     [X] pnpm install failed
  goto :fail
)
echo     OK
echo.

REM ---------- [5/9] Build shared packages ----------
echo [5/9] Building shared packages ^(@fuel/types, @fuel/schemas^)...
call pnpm --filter @fuel/types --filter @fuel/schemas build
if errorlevel 1 (
  echo     [X] package build failed
  goto :fail
)
echo     OK
echo.

REM ---------- [6/9] PostgreSQL: fuel role + database ----------
echo [6/9] PostgreSQL  ^(role 'fuel' + database 'fuel' on :5432^)...
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
REM try the default superuser password first (fully automatic); prompt only if it fails
set "PGADMINPW="
set "PGPASSWORD=postgres"
"%PSQL%" -U postgres -h localhost -p 5432 -d postgres -tAc "SELECT 1" >nul 2>&1
if not errorlevel 1 (
  set "PGADMINPW=postgres"
  echo     connected as postgres ^(default password^)
) else (
  echo     Enter the PostgreSQL superuser ^(postgres^) password ^(blank = skip^):
  set /p "PGADMINPW=    postgres password: "
)
if not defined PGADMINPW (
  echo     skipped
  goto :db_manual
)
set "PGPASSWORD=%PGADMINPW%"
REM create OR repair the fuel role - always (re)sets the password to 'fuel'
"%PSQL%" -U postgres -h localhost -p 5432 -d postgres -v ON_ERROR_STOP=1 -c "DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fuel') THEN CREATE ROLE fuel LOGIN PASSWORD 'fuel'; ELSE ALTER ROLE fuel WITH LOGIN PASSWORD 'fuel'; END IF; END $do$;"
if errorlevel 1 (
  set "PGPASSWORD="
  echo     [!] Could not connect/create role ^(wrong password or server stopped^).
  goto :db_manual
)
"%PSQL%" -U postgres -h localhost -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='fuel'" | findstr "1" >nul
if errorlevel 1 "%PSQL%" -U postgres -h localhost -p 5432 -d postgres -c "CREATE DATABASE fuel OWNER fuel"
REM verify the app credentials (fuel:fuel) actually log in on :5432
set "PGPASSWORD=fuel"
"%PSQL%" -U fuel -h localhost -p 5432 -d fuel -tAc "SELECT 1" >nul 2>&1
if errorlevel 1 (
  set "PGPASSWORD="
  echo     [!] role/db created but 'fuel:fuel' login on :5432 failed.
  echo         If several PostgreSQL instances run, ensure :5432 matches
  echo         DATABASE_URL in apps\api\.env.
  goto :db_manual
)
set "PGPASSWORD="
echo     OK  role 'fuel' + database 'fuel' ready, fuel login verified on :5432
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

REM ---------- [7/9] Redis: install + start (required for login/sessions) ----------
echo [7/9] Redis ^(localhost:6379^) - required for login/sessions...
call :check_redis
if "%REDIS_UP%"=="1" (
  echo     OK  already running
  set "REDIS_OK=1"
  goto :redis_done
)
REM Memurai service installed but stopped? start it
sc query Memurai >nul 2>&1
if errorlevel 1 goto :redis_portable
echo     starting Memurai service...
net start Memurai >nul 2>&1
call :check_redis
if "%REDIS_UP%"=="1" (
  echo     OK  Memurai started
  set "REDIS_OK=1"
  goto :redis_done
)
:redis_portable
REM portable redis already downloaded by a previous run?
if exist "tools\redis\redis-server.exe" goto :redis_start
REM download a portable Redis for Windows (no admin, no installer)
REM source: github.com/tporadowski/redis  (maintained native Windows port)
echo     downloading portable Redis for Windows ^(~13 MB, one-time^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $u='https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip'; $d=Join-Path $PWD.Path 'tools\redis'; $z=Join-Path $env:TEMP 'fuel-redis.zip'; Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing; New-Item -ItemType Directory -Force $d | Out-Null; Expand-Archive -LiteralPath $z -DestinationPath $d -Force; Get-ChildItem -Recurse $d | Unblock-File; Remove-Item $z -Force; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo     [!] Redis download failed ^(no internet?^).
  goto :redis_warn
)
:redis_start
if not exist "tools\redis\redis-server.exe" goto :redis_warn
echo     starting local redis-server.exe...
start "redis" /min /D "tools\redis" "tools\redis\redis-server.exe"
timeout /t 2 >nul
call :check_redis
if "%REDIS_UP%"=="1" goto :redis_started
timeout /t 3 >nul
call :check_redis
:redis_started
if "%REDIS_UP%"=="1" (
  echo     OK  redis-server running
  set "REDIS_OK=1"
  goto :redis_done
)
:redis_warn
echo     [!] WARNING: Redis is NOT running.
echo         Login / refresh / throttle will not work until Redis is up.
echo         Fix: install Memurai ^(https://www.memurai.com^) and re-run,
echo              or re-run install.bat while online to fetch portable Redis.
set "REDIS_OK=0"
:redis_done
echo.

REM ---------- [8/9] Prisma client + migrations ----------
echo [8/9] Prisma generate + migrate deploy...
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

REM ---------- [9/9] Seed demo data ----------
echo [9/9] Seeding demo data  ^(admin user, fuel grades, station...^)...
call pnpm db:seed
if errorlevel 1 (
  echo     [!] seed reported an error ^(safe to ignore if already seeded^).
) else (
  echo     OK
)
echo.

echo ============================================================
if "%REDIS_OK%"=="1" (
  echo   INSTALL COMPLETE  -  everything is installed and ready
) else (
  echo   INSTALL FINISHED  -  Redis still needs attention ^(see [7/9]^)
)
echo ------------------------------------------------------------
echo   Node.js .......... %NODEV%
echo   pnpm ............. %PNPMV%
echo   Dependencies ..... installed
echo   Database ......... migrated + seeded
if "%REDIS_OK%"=="1" (
  echo   Redis ............ running
) else (
  echo   Redis ............ NOT running  ^(fix before start.bat^)
)
echo ------------------------------------------------------------
echo   Start the app:   start.bat          ^(or:  pnpm dev^)
echo   Web:    http://localhost:3000
echo   API:    http://localhost:4000/api
echo   Login:  admin / admin123
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

REM --- helper: is Redis 6379 open? sets REDIS_UP=0/1 ---
:check_redis
set REDIS_UP=0
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',6379); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 set REDIS_UP=1
goto :eof
