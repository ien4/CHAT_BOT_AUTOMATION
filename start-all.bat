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
taskkill /FI "WINDOWTITLE eq ChatBot-Ngrok*" /T /F 2>nul
taskkill /FI "WINDOWTITLE eq ChatBot-Cloudflared*" /T /F 2>nul
taskkill /IM ngrok.exe /T /F 2>nul
taskkill /IM cloudflared.exe /T /F 2>nul
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

:: ========== 1. Khoi chay Cloudflare Tunnel cho Chatwoot ==========
echo [1/8] Dang khoi chay Cloudflare Tunnel cho Chatwoot (port 3000)...

set CLOUDFLARED_EXE=C:\Users\Admin\cloudflared.exe
set CF_LOG=%TEMP%\cloudflared-chatwoot.log
set CF_URL=

if not exist "%CLOUDFLARED_EXE%" goto :CF_NOT_FOUND

if exist "%CF_LOG%" del "%CF_LOG%"
start "ChatBot-Cloudflared-Chatwoot" cmd /c ""%CLOUDFLARED_EXE%" tunnel --url http://localhost:3000 --logfile "%CF_LOG%""
echo   - Cho Cloudflare tunnel ket noi (8 giay)...
timeout /t 8 /nobreak >nul

node -e "try{const fs=require('fs'),p=process.env.TEMP+'\\cloudflared-chatwoot.log';const log=fs.readFileSync(p,'utf8');const m=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m)process.stdout.write(m[0]);}catch(e){}" > "%TEMP%\cf_url.txt" 2>nul
set /p CF_URL= < "%TEMP%\cf_url.txt"
if exist "%TEMP%\cf_url.txt" del "%TEMP%\cf_url.txt"

if not defined CF_URL goto :CF_NO_URL
echo   - Cloudflare Tunnel URL: !CF_URL!
powershell -Command "(Get-Content '%~dp0chatwoot\.env') -replace '^FRONTEND_URL=.*', 'FRONTEND_URL=!CF_URL!' | Set-Content '%~dp0chatwoot\.env' -Encoding utf8" 2>nul
echo   - Da cap nhat FRONTEND_URL trong chatwoot/.env
goto :CF_DONE

:CF_NO_URL
echo   [CANH BAO] Khong lay duoc Cloudflare Tunnel URL. Kiem tra log: %CF_LOG%
goto :CF_DONE

:CF_NOT_FOUND
echo   [CANH BAO] Khong tim thay cloudflared.exe tai %CLOUDFLARED_EXE%
echo   Tai ve tai: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe

:CF_DONE
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

:: ========== 6. Khoi chay ngrok (Backend port 3001) ==========
echo [6/8] Dang khoi chay ngrok cho Backend (port 3001)...

where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 goto :NGROK_NOT_FOUND

start "ChatBot-Ngrok-Backend" cmd /c "ngrok http 3001"
echo   - Ngrok da khoi chay cho port 3001
echo   - Cho ngrok san sang...
timeout /t 5 /nobreak >nul

set NGROK_URL=
node "%~dp0backend\scripts\get-ngrok-url.js" > "%TEMP%\ngrok_url.txt" 2>nul
if exist "%TEMP%\ngrok_url.txt" set /p NGROK_URL= < "%TEMP%\ngrok_url.txt"
if exist "%TEMP%\ngrok_url.txt" del "%TEMP%\ngrok_url.txt"

if not defined NGROK_URL goto :NGROK_NO_URL
echo   - Ngrok URL: !NGROK_URL!
node "%~dp0backend\scripts\update-app-url.js" "!NGROK_URL!" 2>nul
node "%~dp0backend\scripts\update-chatwoot-agentbot-url.js" "!NGROK_URL!/chatwoot-webhook/%TENANT_SLUG%" "%CHATWOOT_AGENT_BOT_NAME%" 2>nul
goto :NGROK_DONE

:NGROK_NOT_FOUND
echo   [CANH BAO] Khong tim thay ngrok!
echo   Tai va cai dat: npm install -g ngrok
echo   Sau do: ngrok config add-authtoken YOUR_TOKEN
echo   Tenant webhook se dung localhost (chi hoat dong noi bo).
goto :NGROK_DONE

:NGROK_NO_URL
echo   [CANH BAO] Khong lay duoc ngrok URL. APP_BASE_URL giu nguyen.

:NGROK_DONE

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

:: Ghi lai webhook URL hien tai de de copy/paste lan sau
(
echo Chat Automation - Current Webhook URLs
echo Generated at: %DATE% %TIME%
echo.
echo LOCAL
echo Chatwoot: http://localhost:3000
echo Backend:  http://localhost:3001
echo Dashboard:http://localhost:3002
echo.
echo FACEBOOK -^> CHATWOOT
if defined CF_URL (
echo Meta Callback URL: !CF_URL!/bot
echo Verify Token: facebook_booteam
) else (
echo Meta Callback URL: [Cloudflare URL not available]/bot
echo Verify Token: facebook_booteam
)
echo.
echo CHATWOOT -^> BACKEND AI
if defined NGROK_URL (
echo Agent Bot Name: %CHATWOOT_AGENT_BOT_NAME%
echo Agent Bot URL:  !NGROK_URL!/chatwoot-webhook/%TENANT_SLUG%
echo Local Docker URL alternative: http://host.docker.internal:3001/chatwoot-webhook/%TENANT_SLUG%
) else (
echo Agent Bot Name: %CHATWOOT_AGENT_BOT_NAME%
echo Agent Bot URL:  [Ngrok URL not available]/chatwoot-webhook/%TENANT_SLUG%
echo Local Docker URL alternative: http://host.docker.internal:3001/chatwoot-webhook/%TENANT_SLUG%
)
echo.
echo FLOW
echo Facebook Messenger -^> Chatwoot /bot -^> Backend /chatwoot-webhook/%TENANT_SLUG% -^> AI reply via Chatwoot
echo.
echo NOTE
echo trycloudflare.com va ngrok URL co the doi moi lan start-all. Neu Facebook mat ket noi, cap nhat Meta Callback URL bang dong o tren.
) > "%WEBHOOK_SUMMARY%"

:: ========== TONG KET ==========
echo ============================================
echo  HE THONG DA SAN SANG!
echo ============================================
echo.
echo  [LOCAL]
echo  Chatwoot:       http://localhost:3000
echo  Backend API:    http://localhost:3001
echo  Dashboard:      http://localhost:3002
echo  Ngrok Status:   http://127.0.0.1:4040
echo.
if defined CF_URL (
    echo  [PUBLIC - CLOUDFLARE ^| port 3000 Chatwoot]
    echo  Chatwoot:        !CF_URL!
    echo  Facebook -^> Chatwoot webhook:
    echo    Meta Callback URL: !CF_URL!/bot
    echo    Verify Token:      facebook_booteam
    echo.
    echo  ** Neu Facebook khong vao Chatwoot, cap nhat Meta Callback URL thanh URL /bot o tren **
    echo.
)
if defined NGROK_URL (
    echo  [PUBLIC - NGROK ^| port 3001 Backend]
    echo  Backend:         !NGROK_URL!
    echo  Chatwoot -^> Backend AI webhook:
    echo    Agent Bot "%CHATWOOT_AGENT_BOT_NAME%": !NGROK_URL!/chatwoot-webhook/%TENANT_SLUG%
    echo    Da tu dong thu cap nhat Agent Bot trong Chatwoot.
    echo.
    echo  Route cu, chi dung neu Facebook gui thang ve backend:
    echo    !NGROK_URL!/webhook
    echo.
)
echo  ============================================
echo  LUONG WEBHOOK DANG DUNG:
echo  ============================================
echo.
echo  Facebook Messenger -^> Chatwoot /bot -^> Backend /chatwoot-webhook/%TENANT_SLUG% -^> AI reply qua Chatwoot
echo.
echo  Neu can cau hinh tay Agent Bot trong Chatwoot:
echo    Settings ^> Integrations ^> Agent Bots ^> "%CHATWOOT_AGENT_BOT_NAME%"
echo    Local Docker URL: http://host.docker.internal:3001/chatwoot-webhook/%TENANT_SLUG%
if defined NGROK_URL echo    Public URL:       !NGROK_URL!/chatwoot-webhook/%TENANT_SLUG%
echo.
echo  Da ghi file tom tat webhook:
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
