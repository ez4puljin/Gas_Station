@echo off
setlocal enableextensions
cd /d "%~dp0"
title Fuel Retail System (local dev)

echo ============================================================
echo   Fuel Retail System  -  Local dev start
echo ============================================================
echo.

REM --- [1/5] Stop previous processes: ports 3000/4000 + project node ---
echo [1/5] Stopping previous processes...
for %%P in (3000 4000) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    taskkill /F /PID %%I >nul 2>&1
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*Desktop\gas station*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo     done
echo.

REM --- [2/5] PostgreSQL service ---
echo [2/5] PostgreSQL service (postgresql-x64-17)...
sc query postgresql-x64-17 | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo     starting service [admin may be required]...
  net start postgresql-x64-17 >nul 2>&1
)
echo     OK
echo.

REM --- [3/5] Redis - needed for login/refresh/throttle ---
echo [3/5] Redis (localhost:6379)...
call :check_redis
if "%REDIS_UP%"=="1" goto :redis_ok
if exist "tools\redis\redis-server.exe" (
  echo     starting local redis-server.exe...
  start "redis" /min "tools\redis\redis-server.exe"
) else (
  echo     trying docker...
  docker compose up -d redis >nul 2>&1
)
timeout /t 2 >nul
call :check_redis
if "%REDIS_UP%"=="1" goto :redis_ok
echo     [!] WARNING: Redis not running. Login/refresh/throttle will not work.
echo         Enable: install Memurai, or  docker compose up -d redis
goto :redis_done
:redis_ok
echo     OK
:redis_done
echo.

REM --- [4/5] Prepare: deps, Prisma client, migrations ---
echo [4/5] Prepare (deps / prisma / migrations)...
if not exist "node_modules" (
  echo     pnpm install...
  call pnpm install
)
call pnpm db:generate >nul 2>&1
call pnpm --filter @fuel/api exec prisma migrate deploy >nul 2>&1
echo     OK
echo.

REM --- [5/5] Dev servers: web + api together, watch mode ---
echo [5/5] Starting dev servers...  [stop: Ctrl+C]
echo     Web:  http://localhost:3000
echo     API:  http://localhost:4000/api    health: /api/health
echo     Login: admin / admin123
echo ------------------------------------------------------------
echo.
call pnpm dev

echo.
echo Dev servers stopped. Press any key to close...
pause >nul
endlocal
exit /b 0

REM --- helper: is Redis 6379 open? sets REDIS_UP=0/1 ---
:check_redis
set REDIS_UP=0
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',6379); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 set REDIS_UP=1
goto :eof
