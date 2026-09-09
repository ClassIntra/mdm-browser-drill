@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [lab] starting MDM drill server on 0.0.0.0:9011 (+alt 18081) ...
"C:\Users\iflytek\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" server\lab-server.mjs
pause
