@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [lab] starting MDM drill server on 0.0.0.0:9011 (+alt 18081) ...
node server\lab-server.mjs
pause
