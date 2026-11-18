@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto missing_node
node "%~dp0launcher.mjs"
if errorlevel 1 pause
exit /b
:missing_node
echo Please install Node.js 20 or newer, then start the workbench again.
pause
exit /b 1
