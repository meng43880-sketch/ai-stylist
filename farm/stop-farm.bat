@echo off
REM Остановить все xray фермы (окна start-farm тоже можно просто закрыть).
taskkill /F /IM xray.exe 2>nul
echo Farm stopped.
pause
