@echo off
setlocal enableextensions enabledelayedexpansion
cd /d "%~dp0"
title Fuel Retail ERP - starting

REM ------------------------------------------------------------------
REM  Buh sistemiig neg darahad asaana:
REM    PostgreSQL -> Redis -> deps -> packages/prisma/migration
REM    -> cache check -> seed check -> dev servers -> browser
REM
REM  NOTE: batch fails are written in ASCII on purpose - cmd.exe parses
REM        .bat bytes with the OEM codepage, so Cyrillic text breaks
REM        command parsing (same reason install.bat / start.bat are ASCII).
REM ------------------------------------------------------------------

echo ============================================================
echo   FUEL RETAIL ERP  -  full system start
echo ============================================================
echo.

set "FAIL=0"

REM === [1/7] Stop previous processes on 3000/4000 ===================
echo [1/7] Stopping previous processes...
for %%P in (3000 4000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    taskkill /F /PID %%I >nul 2>&1
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*gas station*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo       OK
echo.

REM === [2/7] PostgreSQL ============================================
echo [2/7] PostgreSQL (localhost:5432)...
call :check_port 5432 PG_UP
if "!PG_UP!"=="1" goto :pg_ok
echo       starting service...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'postgresql*' -and $_.Status -ne 'Running' } | Start-Service -ErrorAction SilentlyContinue" >nul 2>&1
timeout /t 3 >nul
call :check_port 5432 PG_UP
if "!PG_UP!"=="1" goto :pg_ok
echo       [X] PostgreSQL NOT reachable.
echo           Start the PostgreSQL service manually, or run install.bat
set "FAIL=1"
goto :pg_done
:pg_ok
echo       OK
:pg_done
echo.

REM === [3/7] Redis (required for login / refresh / throttle) =======
echo [3/7] Redis (localhost:6379)...
call :check_port 6379 REDIS_UP
if "!REDIS_UP!"=="1" goto :redis_ok

sc query Memurai >nul 2>&1
if errorlevel 1 goto :redis_portable
echo       starting Memurai service...
net start Memurai >nul 2>&1
call :check_port 6379 REDIS_UP
if "!REDIS_UP!"=="1" goto :redis_ok

:redis_portable
if not exist "tools\redis\redis-server.exe" goto :redis_fail
echo       starting portable redis-server...
start "redis" /min /D "tools\redis" "tools\redis\redis-server.exe"
timeout /t 3 >nul
call :check_port 6379 REDIS_UP
if "!REDIS_UP!"=="1" goto :redis_ok

:redis_fail
echo       [X] Redis NOT running - login will not work!
echo           Run install.bat to set up Redis.
set "FAIL=1"
goto :redis_done
:redis_ok
echo       OK
:redis_done
echo.

REM === [4/7] Dependencies ==========================================
echo [4/7] Dependencies...
where pnpm >nul 2>&1
if errorlevel 1 (
  echo       [X] pnpm not found. Run install.bat first.
  goto :fatal
)
if not exist "node_modules" (
  echo       pnpm install... [first run may take a while]
  call pnpm install
  if errorlevel 1 (
    echo       [X] pnpm install failed.
    goto :fatal
  )
)
echo       OK
echo.

REM === [5/7] Workspace packages + Prisma + migrations ===============
REM  CLAUDE.md 11: @fuel/types and @fuel/schemas must be compiled to
REM  dist BEFORE api/web build, otherwise they fail to resolve.
echo [5/7] Packages / Prisma / migrations...
echo       building @fuel/types...
call pnpm --filter @fuel/types build >nul 2>&1
echo       building @fuel/schemas...
call pnpm --filter @fuel/schemas build >nul 2>&1
echo       prisma generate...
call pnpm db:generate >nul 2>&1
echo       prisma migrate deploy...
call pnpm --filter @fuel/api exec prisma migrate deploy >nul 2>&1
if errorlevel 1 (
  echo       [!] Migration failed - check apps\api\.env DATABASE_URL
  set "FAIL=1"
) else (
  echo       OK
)
echo.

REM === [6/7] Cache health + first-run seed ==========================
echo [6/7] Cache and seed data...

REM  .next\BUILD_ID exists only after `next build` (production).
REM  Leaving it in place makes `next dev` throw
REM  "Cannot find module './xxx.js'" (CLAUDE.md 11) - so wipe it.
if exist "apps\web\.next\BUILD_ID" (
  echo       stale production .next cache found - clearing...
  rmdir /s /q "apps\web\.next" >nul 2>&1
)

REM  Seed only when there is no user yet (seed itself is idempotent).
REM  NOTE: no arrow functions here - cmd treats the ">" in "=>" as a redirect
REM  and would create a junk file. Plain function() keeps the command safe.
set "USERS="
pushd apps\api
for /f "delims=" %%N in ('node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(function(n){console.log(n);return p.$disconnect()}).catch(function(){console.log('ERR')})" 2^>nul') do set "USERS=%%N"
popd
if "!USERS!"=="0" goto :do_seed
if "!USERS!"=="" goto :do_seed
if "!USERS!"=="ERR" goto :seed_skip
echo       users in database: !USERS!
goto :seed_done
:do_seed
echo       seeding initial data [admin / admin123]...
call pnpm db:seed >nul 2>&1
goto :seed_done
:seed_skip
echo       [!] Could not query users - if login fails, run install.bat
:seed_done
echo       OK
echo.

if "!FAIL!"=="1" (
  echo ------------------------------------------------------------
  echo  [!] Some checks failed - see [X] marks above.
  echo      The system may not work correctly.
  echo ------------------------------------------------------------
  echo.
)

REM === [7/7] Dev servers ===========================================
echo [7/7] Starting dev servers...
echo.
echo   ------------------------------------------------------------
echo    Web       : http://localhost:3000
echo    API       : http://localhost:4000/api     health: /api/health
echo    Attendant : http://localhost:3000/attendant
echo.
echo    Login  : admin / admin123
echo    Stop   : Ctrl+C
echo   ------------------------------------------------------------
echo.

REM  Open the browser as soon as the web server answers (background).
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 60;$i++){ try { Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Seconds 2 } }" >nul 2>&1

call pnpm dev

echo.
echo ============================================================
echo   Dev servers stopped.
echo ============================================================
pause >nul
endlocal
exit /b 0

:fatal
echo.
echo ============================================================
echo   Cannot start. Fix the errors above and try again.
echo ============================================================
pause >nul
endlocal
exit /b 1

REM --- helper: is a TCP port open?   call :check_port <port> <var> ---
:check_port
set "%~2=0"
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%~1); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 set "%~2=1"
goto :eof
