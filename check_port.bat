@echo off
timeout /t 5 /nobreak >nul
curl -s --max-time 3 http://localhost:5173 >nul 2>&1
if %errorlevel% equ 0 (echo frontend is up) else (echo frontend is down)
