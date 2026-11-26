@echo off
setlocal
REM ===========================================================================
REM  Pakistan Drought Monitoring Portal - control panel
REM
REM  Double-click for the menu, or use it from a terminal:
REM      Drought_Portal.bat start | stop | restart | open | status
REM
REM  The server runs in its own minimised window ("Drought Portal Server")
REM  and writes to backend\logs\server.log, so this menu stays free.
REM  Only the process on port 8050 is ever stopped - port 8000 is left alone.
REM ===========================================================================

set "PORT=8050"
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "LOGDIR=%BACKEND%\logs"
set "LOG=%LOGDIR%\server.log"
set "URL=http://localhost:%PORT%"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

REM internal: this same file is re-launched to host the server window
if /i "%~1"=="__server" goto :server

REM ---- colours (Windows 10/11 terminal) --------------------------------------
for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "N=%ESC%[0m"
set "B=%ESC%[1m"
set "DIM=%ESC%[90m"
set "AMB=%ESC%[38;5;214m"
set "TEAL=%ESC%[38;5;73m"
set "OK=%ESC%[92m"
set "BAD=%ESC%[91m"
set "WARN=%ESC%[93m"

title Pakistan Drought Monitoring Portal

REM ---- command-line shortcuts -------------------------------------------------
if /i "%~1"=="start"   ( call :do_start & goto :eof )
if /i "%~1"=="stop"    ( call :do_stop & goto :eof )
if /i "%~1"=="restart" ( call :do_stop & call :do_start & goto :eof )
if /i "%~1"=="open"    ( start "" "%URL%" & goto :eof )
if /i "%~1"=="status"  goto :print_status

REM ===========================================================================
:menu
cls
call :status
echo.
echo   %AMB%%B%  ___                  _   _       %N%
echo   %AMB%%B% ^|   \ _ _ ___ _  _ __^| ^|_^| ^|_    %N%%B%Pakistan Drought%N%
echo   %AMB%%B% ^| ^|) ^| '_/ _ \ ^|^| / _` ^| ' \  _^|   %N%%B%Monitoring Portal%N%
echo   %AMB%%B% ^|___/^|_^| \___/\_,_\__, ^|_^|^|_\__^|   %N%%DIM%agricultural + hydrological%N%
echo   %AMB%%B%                   ^|___/            %N%
echo.
echo   %DIM%------------------------------------------------------------%N%
echo     Server   %SRV_TXT%
echo     Address  %TEAL%%URL%%N%
echo   %DIM%------------------------------------------------------------%N%
echo.
echo     %B%1%N%  Start portal and open browser
echo     %B%2%N%  Open portal in browser
echo     %B%3%N%  Open API docs
echo     %B%4%N%  Stop portal
echo     %B%5%N%  Restart portal
echo.
echo     %B%6%N%  Show address for phones / other PCs
echo     %B%7%N%  View server log
echo     %B%8%N%  Refresh data + AI forecasts   %DIM%(prepare.py)%N%
echo     %B%9%N%  Rebuild web app               %DIM%(npm build)%N%
echo     %B%D%N%  Create desktop shortcut
echo.
echo     %B%0%N%  Exit %DIM%(the portal keeps running)%N%
echo.
choice /c 1234567890D /n /m "  Choose an option: "
set "PICK=%errorlevel%"
if "%PICK%"=="1"  call :do_start
if "%PICK%"=="2"  start "" "%URL%"
if "%PICK%"=="3"  start "" "%URL%/docs"
if "%PICK%"=="4"  call :do_stop
if "%PICK%"=="5"  call :do_restart
if "%PICK%"=="6"  call :do_network
if "%PICK%"=="7"  call :do_log
if "%PICK%"=="8"  call :do_prepare
if "%PICK%"=="9"  call :do_build
if "%PICK%"=="10" goto :eof
if "%PICK%"=="11" call :do_shortcut
goto :menu

REM ===========================================================================
:print_status
call :status
echo   Drought portal: %SRV_TXT%  %DIM%%URL%%N%
goto :eof

:status
set "RUNNING=0"
netstat -an | find ":%PORT% " | find "LISTENING" >nul && set "RUNNING=1"
if "%RUNNING%"=="1" (set "SRV_TXT=%OK%%B%RUNNING%N%") else (set "SRV_TXT=%BAD%%B%STOPPED%N%")
exit /b

REM ---------------------------------------------------------------------------
:do_start
call :status
if "%RUNNING%"=="1" (
    echo.
    echo   %OK%The portal is already running.%N% Opening the browser ...
    start "" "%URL%"
    call :sleep 2
    exit /b
)
echo.
call :check_db || exit /b
call :check_setup || exit /b

echo   %TEAL%Starting the server%N% %DIM%(log: backend\logs\server.log)%N%
echo   %DIM%Loading the data can take up to 2 minutes the first time ...%N%
start "Drought Portal Server" /min "%~f0" __server

<nul set /p "=  Waiting for the portal "
set /a WAIT=0
:wait_loop
netstat -an | find ":%PORT% " | find "LISTENING" >nul && goto :started
set /a WAIT+=1
if %WAIT% geq 300 goto :start_failed
set /a DOT=WAIT %% 3
if "%DOT%"=="0" <nul set /p "=."
call :sleep 1
goto :wait_loop

:started
echo.
echo   %OK%%B%Portal is ready.%N%  %TEAL%%URL%%N%
start "" "%URL%"
call :sleep 2
exit /b

:start_failed
echo.
echo   %BAD%The server did not start within 5 minutes.%N% Last lines of the log:
echo.
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG%' -Tail 20"
echo.
pause
exit /b

REM ---------------------------------------------------------------------------
:do_stop
call :status
if "%RUNNING%"=="0" (
    echo.
    echo   %DIM%The portal is not running.%N%
    call :sleep 2
    exit /b
)
echo.
echo   Stopping the portal on port %PORT% ...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
call :sleep 2
call :status
if "%RUNNING%"=="0" (echo   %OK%Stopped.%N%) else (echo   %BAD%Could not stop it - try running this file as administrator.%N%)
call :sleep 2
exit /b

:do_restart
call :do_stop
call :do_start
exit /b

REM ---------------------------------------------------------------------------
:do_network
echo.
set "IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set "IP=%%i"
if not defined IP (
    echo   %WARN%No network connection found.%N%
) else (
    echo   On phones and other PCs on the same Wi-Fi, open:
    echo.
    echo       %TEAL%%B%http://%IP%:%PORT%%N%
    echo.
    echo   %DIM%If it does not load, allow Python through Windows Firewall ^(Private networks^).%N%
)
echo.
pause
exit /b

REM ---------------------------------------------------------------------------
:do_log
echo.
if not exist "%LOG%" (
    echo   %DIM%No log yet - start the portal first.%N%
    call :sleep 2
    exit /b
)
echo   %DIM%Last 40 lines of backend\logs\server.log%N%
echo   %DIM%------------------------------------------------------------%N%
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG%' -Tail 40"
echo   %DIM%------------------------------------------------------------%N%
choice /c YN /n /m "  Open the full log in Notepad? [Y/N] "
if errorlevel 2 exit /b
start "" notepad "%LOG%"
exit /b

REM ---------------------------------------------------------------------------
:do_prepare
echo.
echo   This rebuilds the portal data, risk zones and AI forecasts from
echo   Drought_Data\csv. It can take several minutes.
choice /c YN /n /m "  Continue? [Y/N] "
if errorlevel 2 exit /b
pushd "%BACKEND%"
python prepare.py
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" (
    echo   %BAD%prepare.py failed ^(exit code %RC%^).%N%
) else (
    echo   %OK%Data refreshed.%N% Restart the portal ^(option 5^) to load it.
)
pause
exit /b

REM ---------------------------------------------------------------------------
:do_build
echo.
pushd "%FRONTEND%"
echo   %TEAL%Installing packages ...%N%
call npm install
echo   %TEAL%Building the web app ...%N%
call npm run build
set "RC=%errorlevel%"
popd
if not "%RC%"=="0" (echo   %BAD%Build failed.%N%) else (echo   %OK%Web app rebuilt.%N% Refresh the browser to see it.)
pause
exit /b

REM ---------------------------------------------------------------------------
:do_shortcut
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Drought Portal.lnk')); $s.TargetPath='%~f0'; $s.WorkingDirectory='%ROOT:~0,-1%'; $s.IconLocation='%SystemRoot%\System32\imageres.dll,1'; $s.Description='Pakistan Drought Monitoring Portal'; $s.Save()"
if errorlevel 1 (echo   %BAD%Could not create the shortcut.%N%) else (echo   %OK%Shortcut "Drought Portal" added to your desktop.%N%)
call :sleep 3
exit /b

REM ---------------------------------------------------------------------------
:check_db
netstat -an | find ":5432 " | find "LISTENING" >nul && (echo   %OK%PostgreSQL is running.%N% & exit /b 0)
echo   %WARN%PostgreSQL is not running - trying to start it ...%N%
net start postgresql-x64-17 >nul 2>&1
call :sleep 5
netstat -an | find ":5432 " | find "LISTENING" >nul && (echo   %OK%PostgreSQL started.%N% & exit /b 0)
echo.
echo   %BAD%Could not start PostgreSQL.%N%
echo   Right-click this file and choose "Run as administrator", or start
echo   "postgresql-x64-17" in Services ^(services.msc^), then try again.
echo.
pause
exit /b 1

:check_setup
if not exist "%FRONTEND%\dist\index.html" (
    echo   %TEAL%First run: building the web app ...%N%
    pushd "%FRONTEND%"
    call npm install
    call npm run build
    popd
)
python -c "import fastapi, uvicorn, sqlalchemy, psycopg2" 2>nul && exit /b 0
echo   %TEAL%Installing Python packages ...%N%
pip install -r "%BACKEND%\requirements.txt" || (echo   %BAD%pip install failed.%N% & pause & exit /b 1)
exit /b 0

REM ---------------------------------------------------------------------------
:sleep
REM wait N seconds (works even where TIMEOUT cannot read the keyboard)
set /a _N=%~1+1
ping -n %_N% 127.0.0.1 >nul
exit /b

REM ===========================================================================
:server
title Drought Portal Server (port %PORT%) - close to stop
cd /d "%BACKEND%"
echo ==== %date% %time% : portal starting on port %PORT% ====>> "%LOG%"
python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT% >> "%LOG%" 2>&1
echo ==== %date% %time% : portal stopped ====>> "%LOG%"
exit
