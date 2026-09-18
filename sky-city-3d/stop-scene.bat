@echo off
cd /d "%~dp0"
node tools\scene-server.mjs stop
if errorlevel 1 pause
