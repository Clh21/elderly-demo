@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mqtt_broker.ps1" start
pause
