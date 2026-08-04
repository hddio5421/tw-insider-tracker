@echo off
title Taiwan Stock Insider Data Updater
echo ===================================================
echo   Updating Taiwan Stock Pledge and Insider Data...
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] Fetching OpenAPI Data from TWSE and TPEx...
call node scripts/fetchOpenData.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to fetch OpenAPI data! Please check network connection.
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Building static webpage index.html...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Webpage build failed!
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo   SUCCESS: Data and index.html updated successfully!
echo   Open or refresh index.html to view latest updates.
echo ===================================================
echo.
pause
