@echo off
REM Ферма sainvio: 5 xray с разными серверами -> SOCKS 20801-20805.
REM Сначала разложи xray-1.json .. xray-5.json рядом (см. xray-TEMPLATE.json).
REM Happ desktop на время фермы ЗАКРОЙ, чтобы не было двойной маршрутизации.
set CORE=D:\Happ\core
if not exist xray-1.json echo NET xray-1.json! Skopiruj TEMPLATE i vishpi server. & pause & exit /b 1
start "xray-1" "%CORE%\xray.exe" -config "%~dp0xray-1.json"
start "xray-2" "%CORE%\xray.exe" -config "%~dp0xray-2.json"
start "xray-3" "%CORE%\xray.exe" -config "%~dp0xray-3.json"
start "xray-4" "%CORE%\xray.exe" -config "%~dp0xray-4.json"
start "xray-5" "%CORE%\xray.exe" -config "%~dp0xray-5.json"
echo Farm started: 127.0.0.1:20801-20805. Proverka: v browsere s proksi otkroi wildberries.ru
pause
