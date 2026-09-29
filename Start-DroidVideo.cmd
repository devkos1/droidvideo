@echo off
cd /d "%~dp0"
if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo First run: npm.cmd --prefix desktop ci
  pause
  exit /b 1
)
call npm.cmd --prefix desktop start
