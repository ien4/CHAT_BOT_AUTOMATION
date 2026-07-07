@echo off
title Chat Automation - Stop All
echo ============================================
echo  Dang dung tat ca tien trinh...
echo ============================================

taskkill /FI "WINDOWTITLE eq ChatBot-Backend*" /T /F 2>nul
if %ERRORLEVEL% EQU 0 echo   - Da dung Backend

taskkill /FI "WINDOWTITLE eq ChatBot-Dashboard*" /T /F 2>nul
if %ERRORLEVEL% EQU 0 echo   - Da dung Dashboard

taskkill /FI "WINDOWTITLE eq ChatBot-Ngrok*" /T /F 2>nul
if %ERRORLEVEL% EQU 0 echo   - Da dung Ngrok

echo   - Dang dung Chatwoot...
cd /d "%~dp0chatwoot"
docker compose down
echo   - Da dung Chatwoot

echo.
echo Da dung tat ca. An phim bat ky de dong...
pause >nul