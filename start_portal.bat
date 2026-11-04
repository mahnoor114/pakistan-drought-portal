@echo off
REM Pakistan Drought Monitoring Portal - one-click start
REM   1. checks that PostgreSQL is answering on port 5432 (service or not)
REM   2. starts the FastAPI backend on 0.0.0.0:8050 (also serves the React web app)
REM   3. opens the browser as soon as the portal is ready and shows the network address
title Pakistan Drought Monitoring Portal
cd /d "%~dp0backend"

REM ---- already running? just open it ------------------------------------------
netstat -an | find ":8050 " | find "LISTENING" >nul
if not errorlevel 1 (
    echo The portal is already running.
    start "" http://localhost:8050
    timeout /t 3 >nul
    exit /b 0
)

REM ---- database ----------------------------------------------------------------
netstat -an | find ":5432 " | find "LISTENING" >nul
if errorlevel 1 (
    echo PostgreSQL is not running - trying to start the service ...
    net start postgresql-x64-17 >nul 2>&1
    timeout /t 5 >nul
    netstat -an | find ":5432 " | find "LISTENING" >nul
    if errorlevel 1 (
        echo.
        echo Could not start PostgreSQL. Right-click this file and choose "Run as administrator",
        echo or start "postgresql-x64-17" in Services ^(services.msc^), then run this again.
        pause
        exit /b 1
    )
)
echo PostgreSQL is running.

REM ---- first run: build the web app and install Python packages ---------------
if not exist "..\frontend\dist\index.html" (
    echo Building the web app ^(first run only^) ...
    pushd ..\frontend
    call npm install
    call npm run build
    popd
)
python -c "import fastapi, uvicorn, sqlalchemy, psycopg2" 2>nul || pip install -r requirements.txt

REM ---- this PC's network address ------------------------------------------------
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do if not defined IP set "IP=%%a"
if defined IP set "IP=%IP: =%"
if not defined IP set "IP=THIS-PC-IP"

echo.
echo  ================================================================
echo   Pakistan Drought Monitoring Portal
echo.
echo   On this PC:          http://localhost:8050
echo   Other devices:       http://%IP%:8050   (same Wi-Fi / network)
echo   API docs:            http://localhost:8050/docs
echo.
echo   Starting ... the browser opens by itself when the portal is ready
echo   (this can take about a minute). Close this window to stop it.
echo  ================================================================
echo.

REM open the browser once the server is listening
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "while (-not (Get-NetTCPConnection -LocalPort 8050 -State Listen -ErrorAction SilentlyContinue)) { Start-Sleep 2 }; Start-Process 'http://localhost:8050'"

python -m uvicorn app.main:app --host 0.0.0.0 --port 8050
pause
