@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Components.ps1" -Component Camera -Uninstall
pause
