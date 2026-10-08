@echo off
cd /d "%~dp0"
set "PLANSI_XI_ARCH=%PROCESSOR_ARCHITECTURE%"
if defined PROCESSOR_ARCHITEW6432 set "PLANSI_XI_ARCH=%PROCESSOR_ARCHITEW6432%"
set "PLANSI_XI_NODE=runtime\win-x64\node.exe"
if /i "%PLANSI_XI_ARCH%"=="ARM64" set "PLANSI_XI_NODE=runtime\win-arm64\node.exe"
if not exist "%PLANSI_XI_NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Download or clone the complete PLansi_xi repository before running this launcher.
    echo The runtime folder must be beside this file.
    echo For a source-only checkout, install Node.js from https://nodejs.org/
    pause
    exit /b 1
  )
  set "PLANSI_XI_NODE=node"
)
if not exist "dist\vendor\three.module.js" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
"%PLANSI_XI_NODE%" scripts\serve.mjs --open
pause
