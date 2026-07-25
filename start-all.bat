@echo off
setlocal enabledelayedexpansion
title Chat Automation - Start All

:: ============================================================
::  LOCAL DEVELOPMENT ONLY - DO NOT USE FOR PRODUCTION
::  NEVER RUN `prisma db push` / `--accept-data-loss` AGAINST REAL DATA.
::  Production DB thay doi PHAI qua `prisma migrate deploy` trong release step rieng.
::  Xem: docs/DEPLOYMENT_POLICY.md va docs/PRODUCTION_ROLLOUT_CHECKLIST.md
:: ============================================================

set TENANT_SLUG=bbotech
set CHATWOOT_AGENT_BOT_NAME=BBOTECH
set WEBHOOK_SUMMARY=%~dp0webhook-urls-current.txt
echo ============================================
echo  Chat Automation - Khoi chay toan bo du an
echo ============================================
echo.

:: ========== 0. Don tien trinh cu ==========
echo [0/8] Dang don tien trinh cu de tranh chay trung...

taskkill /FI "WINDOWTITLE eq ChatBot-Backend*" /T /F 2>nul
taskkill /FI "WINDOWTITLE eq ChatBot-Dashboard*" /T /F 2>nul
timeout /t 1 /nobreak >nul

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        taskkill /PID %%P /T /F 2>nul
        echo   - Da dung process cu dang giu port 3001 (PID %%P)
    )
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3002" ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        taskkill /PID %%P /T /F 2>nul
        echo   - Da dung process cu dang giu port 3002 (PID %%P)
    )
)

timeout /t 2 /nobreak >nul
echo   - Preflight cleanup hoan tat
echo.

:: ========== 1. Public callback runtime boundary ==========
echo [1/8] Temporary tunnel discovery has been retired.
echo   - Chatwoot stays local at http://localhost:3000.
echo   - FRONTEND_URL is not changed by this launcher.
echo.

:: ========== 2. Khoi chay Chatwoot ==========
echo [2/8] Dang khoi chay Chatwoot (port 3000)...

cd /d "%~dp0chatwoot"
docker compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo   [LOI] Khong the khoi chay Chatwoot. Kiem tra lai Docker.
    pause
    exit /b 1
)
echo   - Chatwoot dang khoi dong tai http://localhost:3000
cd /d "%~dp0"

echo.

:: ========== 3. Cai dat dependencies ==========
echo [3/8] Dang cai dat dependencies...

cd /d "%~dp0backend"
if not exist "node_modules" (
    echo   - Cai dat backend dependencies...
    call npm install
) else (
    echo   - Backend dependencies da co san
)

cd /d "%~dp0dashboard"
if not exist "node_modules" (
    echo   - Cai dat dashboard dependencies...
    call npm install
) else (
    echo   - Dashboard dependencies da co san
)

cd /d "%~dp0"

echo.

:: ========== 4. Kich hoat pgvector extension ==========
echo [4/8] Dang kich hoat pgvector extension (bot DB)...

echo   - Kiem tra PostgreSQL container bot...
docker ps --filter "name=fb_chatbot_postgres" --format "{{.Names}}" | findstr "fb_chatbot_postgres" >nul
if %ERRORLEVEL% EQU 0 (
    echo   - Dang tao pgvector extension...
    docker exec fb_chatbot_postgres psql -U admin -d fb_chatbot -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>nul
    echo   - pgvector extension da san sang
) else (
    echo   [CANH BAO] Khong tim thay PostgreSQL container 'fb_chatbot_postgres'!
    echo   Hay dam bao PostgreSQL dang chay o port 5433.
    echo   Co the tao container bang lenh:
    echo   docker run -d --name fb_chatbot_postgres -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=abcd@1234 -e POSTGRES_DB=fb_chatbot -p 5433:5432 pgvector/pgvector:pg17
    echo.
)

echo.

:: ========== 5. Setup Database ==========
echo [5/8] Dang thiet lap database bot...

cd /d "%~dp0backend"
echo   - Ap dung migration DB local (prisma migrate deploy - KHONG db push, KHONG accept-data-loss)...
call npx prisma migrate deploy
if %ERRORLEVEL% NEQ 0 (
    echo   [LOI] Khong the ap dung migration database. Kiem tra lai PostgreSQL / migration.
    pause
    exit /b 1
) else (
    echo   - Database migration da ap dung thanh cong
)
cd /d "%~dp0"

echo.

:: ========== 6. Public callback authority ==========
echo [6/8] Temporary tunnel discovery has been retired.
echo   - APP_BASE_URL is externally configured.
echo   - This launcher does not set or overwrite APP_BASE_URL.

echo.

:: ========== 7. Khoi chay Backend ==========
echo [7/8] Dang khoi chay Backend (port 3001)...
cd /d "%~dp0backend"
if exist server.log del /f server.log
start "ChatBot-Backend" cmd /c "node src/index.js >> server.log 2>&1"
cd /d "%~dp0"
echo   - Backend da duoc khoi chay (log: backend\server.log)
echo.

:: ========== 8. Khoi chay Dashboard ==========
echo [8/8] Dang khoi chay Dashboard (port 3002)...
cd /d "%~dp0dashboard"
start "ChatBot-Dashboard" cmd /c "npx next dev -p 3002"
cd /d "%~dp0"
echo   - Dashboard da duoc khoi chay
echo.

:: Doi backend san sang
timeout /t 4 /nobreak >nul

:: Webhook runbook is tracked/manual and is not rewritten from runtime values.
echo Webhook runbook is maintained at: %WEBHOOK_SUMMARY%

:: ========== TONG KET ==========
echo ============================================
echo  HE THONG DA SAN SANG!
echo ============================================
echo.
echo  [LOCAL]
echo  Chatwoot:       http://localhost:3000
echo  Backend API:    http://localhost:3001
echo  Dashboard:      http://localhost:3002
echo.

echo  [PUBLIC CALLBACK AUTHORITY]
echo  Temporary tunnel discovery has been retired.
echo  Configure APP_BASE_URL outside this launcher before public webhook activation.
echo.
echo  ============================================
echo  LUONG WEBHOOK DANG DUNG:
echo  ============================================
echo.
echo  Public callbacks use the externally configured APP_BASE_URL contract.
echo.
echo  Neu can cau hinh tay Agent Bot trong Chatwoot:
echo    Settings ^> Integrations ^> Agent Bots ^> "%CHATWOOT_AGENT_BOT_NAME%"
echo    Local Docker URL: http://host.docker.internal:3001/chatwoot-webhook/%TENANT_SLUG%
echo    Public URL: configure through canonical APP_BASE_URL contract.
echo.
echo  Webhook runbook:
echo    %WEBHOOK_SUMMARY%
echo.
echo  ============================================
echo  DANG NHAP:
echo  ============================================
echo  Chatwoot:   admin / Admin@123  (http://localhost:3000)
echo  Dashboard:  admin / admin123   (http://localhost:3002)
echo.
echo  De DUNG TAT CA: .\stop-all.bat
echo ============================================
echo.
pause
