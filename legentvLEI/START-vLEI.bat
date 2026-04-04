@echo off
::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
:: START-vLEI.bat  -  Complete vLEI Setup (Windows -> WSL + Docker)
::
:: SEQUENCE (from cmd.md):
::   0. Create .env  (UID=1000 GID=1000)
::   1. dos2unix all .sh files  (fix CRLF)
::   2. Force-remove any leftover named containers
::   3. stop.sh
::   4. setup.sh
::   5. deploy.sh
::   6. saidify-and-restart.sh
::   7. run-all-buyerseller-4D-with-subdelegation.sh
::   8. DEEP-EXT-subagent.sh JupiterTreasuryAgent jupiterSellerAgent
::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

setlocal EnableDelayedExpansion
set "WSLP=/mnt/c/CHAINAIM3003/mcp-servers/MOD aathi/DynDiscMiniProject2/legentvLEI"

echo.
echo ======================================================================
echo   vLEI Complete Setup  -  START-vLEI.bat
echo ======================================================================
echo  WSL path: %WSLP%
echo.

where wsl >nul 2>&1
if errorlevel 1 (
    echo [ERROR] WSL not found. Install WSL2 + Ubuntu first.
    pause & exit /b 1
)

:: ── STEP 0: Create .env ──────────────────────────────────────────────────────
echo --[ STEP 0 ] Creating .env ...
(echo UID=1000& echo GID=1000) > "%~dp0.env"
echo   [OK] .env ready

:: ── STEP 1: Fix CRLF ─────────────────────────────────────────────────────────
echo.
echo --[ STEP 1 ] Fixing CRLF on all .sh files ...
wsl bash -c "which dos2unix >/dev/null 2>&1 || sudo apt-get install -y -qq dos2unix 2>/dev/null; find \"%WSLP%\" -maxdepth 4 -name '*.sh' -exec dos2unix -q {} \; ; echo crlf-done"
echo   [OK] CRLF fixed

:: ── STEP 2: Force-remove named containers that survive compose down ───────────
echo.
echo --[ STEP 2 ] Force-removing any leftover named containers ...
wsl bash -c "for c in tsx_shell vlei_verification vlei_shell; do docker rm -f \$c 2>/dev/null && echo \"  removed \$c\" || echo \"  \$c not running\"; done; docker network rm vlei_workshop 2>/dev/null && echo '  removed network vlei_workshop' || echo '  network not present'"
echo   [OK] Container cleanup done

:: ── Helper subroutines ───────────────────────────────────────────────────────
goto :main

:RunStep
    echo.
    echo --[ STEP: %~1 ]
    wsl bash -c "cd \"%WSLP%\" && bash %~2"
    if errorlevel 1 (
        echo [FAILED] %~1 - see output above.
        pause & exit /b 1
    )
    echo   [OK] %~1
    goto :eof

:RunStepArgs
    echo.
    echo --[ STEP: %~1 ]
    wsl bash -c "cd \"%WSLP%\" && bash %~2 %~3"
    if errorlevel 1 (
        echo [FAILED] %~1 - see output above.
        pause & exit /b 1
    )
    echo   [OK] %~1
    goto :eof

:main

echo.
echo  Starting vLEI sequence ...
echo.

call :RunStep    "stop.sh - clean environment"                 "stop.sh"
call :RunStep    "setup.sh - build images"                     "setup.sh"
call :RunStep    "deploy.sh - start all services"              "deploy.sh"
call :RunStep    "saidify-and-restart.sh"                      "saidify-and-restart.sh"
call :RunStep    "run-all-buyerseller-4D-with-subdelegation"   "run-all-buyerseller-4D-with-subdelegation.sh"
call :RunStepArgs "DEEP-EXT-subagent"  "DEEP-EXT-subagent.sh" "JupiterTreasuryAgent jupiterSellerAgent"

echo.
echo ======================================================================
echo   vLEI SETUP COMPLETE
echo ======================================================================
echo  Schema     : http://localhost:7723
echo  Witnesses  : http://localhost:5642-5647
echo  KERIA      : http://localhost:3901 / 3902 / 3903
echo  Verifier   : http://localhost:9723
echo  Webhook    : http://localhost:9923
echo  vLEI-verify: http://localhost:9724
echo.
pause
endlocal
