@echo off
setlocal
rem Developer helper: serves the project and opens dist/index.html in the browser.
rem Players should use the desktop app (the .exe inside the release folder) instead.
cd /d "%~dp0.."
title AnimeMerge Launcher
set PORT=8765
set URL=http://localhost:%PORT%/dist/index.html

if not exist "dist\index.html" (
  echo [AnimeMerge] dist\index.html not found. Run "npm install" then "npm run build" first.
  pause
  exit /b 1
)

rem --- 1) Python ---
python --version >nul 2>&1
if %errorlevel%==0 (
  echo [AnimeMerge] Starting local server with Python on port %PORT% ...
  start "AnimeMerge Server - close this window to stop" python -m http.server %PORT% --bind 127.0.0.1
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)
py -3 --version >nul 2>&1
if %errorlevel%==0 (
  echo [AnimeMerge] Starting local server with Python launcher on port %PORT% ...
  start "AnimeMerge Server - close this window to stop" py -3 -m http.server %PORT% --bind 127.0.0.1
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)

rem --- 2) Node.js ---
node --version >nul 2>&1
if %errorlevel%==0 (
  echo [AnimeMerge] Starting local server with Node.js on port %PORT% ...
  start "AnimeMerge Server - close this window to stop" node tools\serve.js %PORT%
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)

rem --- 3) Fallback: open the file directly (works offline, no server needed) ---
echo [AnimeMerge] Python/Node not found, opening dist\index.html directly ...
start "" "%CD%\dist\index.html"
exit /b 0
